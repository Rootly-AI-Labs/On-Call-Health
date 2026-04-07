"""
Authentication API endpoints.
"""
from typing import Any, Dict, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import bcrypt
import secrets
from pydantic import EmailStr, field_validator, Field, BaseModel

from ...models import get_db, User, OAuthProvider, UserEmail, OrganizationInvitation
from ...auth.oauth import google_oauth, github_oauth, okta_oauth
from ...auth.jwt import create_access_token
from ...auth.dependencies import get_current_active_user
from ...services.account_linking import AccountLinkingService
from ...services.demo_analysis_service import create_demo_analysis_for_new_user
from ...services.login_audit_service import LoginAuditService
from ...services.organization_auto_assignment import assign_user_to_organization
from ...core.config import settings
from ...core.rate_limiting import auth_rate_limit
from ...core.input_validation import BaseValidatedModel
from urllib.parse import quote

router = APIRouter()
logger = logging.getLogger(__name__)

# Allowed OAuth redirect origins
ALLOWED_OAUTH_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    settings.FRONTEND_URL,
    "https://oncallhealth.ai",
    "https://www.oncallhealth.ai",
    "https://testing.oncallhealth.ai",
]

# Pydantic models
class PasswordLoginRequest(BaseModel):
    """Request model for password-based login (E2E testing only)."""
    email: EmailStr
    password: str

def build_error_redirect(frontend_url: str, error_msg: str) -> str:
    """Build error redirect URL with properly encoded error message."""
    safe_error_msg = error_msg if error_msg else "Unknown authentication error"
    return f"{frontend_url}/auth/error?message={quote(safe_error_msg)}"

# Helper functions for database-backed OAuth code storage
def store_oauth_code(db: Session, code: str, jwt_token: str, user_id: int, auth_method: str) -> None:
    """Store OAuth temporary code in database."""
    try:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        db.execute(text("""
            INSERT INTO oauth_temp_codes (code, jwt_token, user_id, expires_at, auth_method)
            VALUES (:code, :jwt_token, :user_id, :expires_at, :auth_method)
        """), {
            "code": code,
            "jwt_token": jwt_token,
            "user_id": user_id,
            "expires_at": expires_at,
            "auth_method": auth_method,
        })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to store OAuth code: {e}")
        raise

def get_oauth_code(db: Session, code: str) -> Optional[Dict[str, Any]]:
    """Retrieve and delete OAuth code from database (single-use)."""
    try:
        # Clean up expired codes first
        db.execute(text("""
            DELETE FROM oauth_temp_codes
            WHERE expires_at < :now
        """), {"now": datetime.now(timezone.utc)})
        db.commit()

        # Get the code
        result = db.execute(text("""
            SELECT jwt_token, user_id, expires_at, auth_method
            FROM oauth_temp_codes
            WHERE code = :code
        """), {"code": code})

        row = result.fetchone()
        if not row:
            return None

        # Delete the code (single-use)
        db.execute(text("""
            DELETE FROM oauth_temp_codes
            WHERE code = :code
        """), {"code": code})
        db.commit()

        return {
            "jwt_token": row[0],
            "user_id": row[1],
            "expires_at": row[2],
            "auth_method": row[3],
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to retrieve OAuth code: {e}")
        return None

# ===== VALIDATION MODELS =====

class OAuthLoginRequest(BaseValidatedModel):
    """OAuth login request validation."""
    redirect_origin: Optional[str] = Field(None, max_length=500, description="Redirect origin URL")
    
    @field_validator('redirect_origin')
    @classmethod
    def validate_redirect_origin(cls, v):
        """Validate redirect origin is a safe URL."""
        if v is None:
            return v
        
        # Only allow known safe origins
        if v not in ALLOWED_OAUTH_ORIGINS:
            raise ValueError(f"Redirect origin not allowed: {v}")
        
        return v

class TokenExchangeRequest(BaseValidatedModel):
    """Token exchange request validation."""
    code: str = Field(..., min_length=10, max_length=500, description="Authorization code")
    
    @field_validator('code')
    @classmethod
    def validate_auth_code(cls, v):
        """Validate authorization code format."""
        # Must be URL-safe base64 characters only
        import re
        if not re.match(r"^[A-Za-z0-9_-]+$", v):
            raise ValueError("Invalid authorization code format")
        
        return v

@router.get("/google")
@auth_rate_limit("auth_login")
async def google_login(request: Request, redirect_origin: str = Query(None)):
    """Initiate Google OAuth login."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured"
        )
    
    # Store the redirect origin in state parameter for OAuth callback
    state = None
    if redirect_origin and redirect_origin in ALLOWED_OAUTH_ORIGINS:
        # Only allow known origins for security
        state = redirect_origin
    
    authorization_url = google_oauth.get_authorization_url(state=state)

    # If browser navigation (e.g. link from external site), redirect directly
    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept:
        return RedirectResponse(url=authorization_url)

    return {"authorization_url": authorization_url}

@router.get("/google/callback")
async def google_callback(
    code: str = Query(None),
    error: str = Query(None),
    state: str = Query(None),
    db: Session = Depends(get_db)
):
    """Handle Google OAuth callback."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured"
        )

    # Handle user cancellation
    if error:
        if error == "access_denied":
            # User canceled - redirect back to landing page
            return RedirectResponse(url=settings.FRONTEND_URL)
        else:
            # Other OAuth error
            error_url = build_error_redirect(settings.FRONTEND_URL, f'OAuth error: {error}')
            return RedirectResponse(url=error_url)

    # Validate state parameter to prevent session replay
    if not code:
        logger.warning("Google OAuth callback received without authorization code")
        return RedirectResponse(url=settings.FRONTEND_URL)

    try:
        # Exchange code for token
        token_data = await google_oauth.exchange_code_for_token(code)
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No access token received"
            )
        
        # Get user info
        user_info = await google_oauth.get_user_info(access_token)
        
        # Use account linking service
        linking_service = AccountLinkingService(db)
        user, is_new_user = await linking_service.link_or_create_user(
            provider="google",
            user_info=user_info,
            access_token=access_token,
            refresh_token=refresh_token
        )

        # Auto-assign new users to organizations based on email domain
        if is_new_user:
            try:
                assign_user_to_organization(db, user)
            except Exception as e:
                logger.error(f"Failed to auto-assign organization for new user {user.id}: {e}")
                # Don't fail the auth flow if org assignment fails

        # Create demo analysis for new users
        if is_new_user:
            try:
                create_demo_analysis_for_new_user(db, user)
            except Exception as e:
                logger.error(f"Failed to create demo analysis for new user {user.id}: {e}")
                # Don't fail the auth flow if demo creation fails

        # Create JWT token
        jwt_token = create_access_token(data={"sub": user.id})
        
        # Determine redirect URL based on state parameter
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
            
        # ✅ ENTERPRISE PATTERN: 2-Step Server-Side Token Exchange
        # 1. Create temporary auth code (not JWT)
        # 2. Frontend exchanges code for JWT via secure API call
        import secrets

        # Create temporary authorization code
        auth_code = secrets.token_urlsafe(32)

        logger.info(f"🔐 Storing OAuth code for user {user.id}: {auth_code[:10]}...")

        # Store JWT in database (works across multiple Railway instances)
        store_oauth_code(db, auth_code, jwt_token, user.id, "google")

        logger.info(f"✅ OAuth code stored successfully")

        # Redirect with secure authorization code (not JWT)
        success_url = f"{frontend_url}/auth/success?code={auth_code}"
        response = RedirectResponse(url=success_url)
        return response

    except Exception as e:
        error_msg = str(e) if str(e) else "Unknown authentication error"
        logger.error(f"Google OAuth callback error: {error_msg}")
        # Use state for error redirect too
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
        error_url = build_error_redirect(frontend_url, error_msg)
        return RedirectResponse(url=error_url)

@router.get("/github")
@auth_rate_limit("auth_login")
async def github_login(request: Request, redirect_origin: str = Query(None)):
    """Initiate GitHub OAuth login."""
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth not configured"
        )
    
    # Store the redirect origin in state parameter for OAuth callback
    state = None
    if redirect_origin and redirect_origin in ALLOWED_OAUTH_ORIGINS:
        # Only allow known origins for security
        state = redirect_origin
    
    authorization_url = github_oauth.get_authorization_url(state=state)

    # If browser navigation (e.g. link from external site), redirect directly
    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept:
        return RedirectResponse(url=authorization_url)

    return {"authorization_url": authorization_url}

@router.get("/github/callback")
async def github_callback(
    code: str = Query(None),
    error: str = Query(None),
    state: str = Query(None),
    db: Session = Depends(get_db)
):
    """Handle GitHub OAuth callback."""
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth not configured"
        )
    
    # Handle user cancellation
    if error:
        if error == "access_denied":
            # User canceled - redirect back to landing page
            return RedirectResponse(url=settings.FRONTEND_URL)
        else:
            # Other OAuth error
            error_url = build_error_redirect(settings.FRONTEND_URL, f'OAuth error: {error}')
            return RedirectResponse(url=error_url)

    # No code means user canceled without error parameter
    if not code:
        return RedirectResponse(url=settings.FRONTEND_URL)

    try:
        # Exchange code for token
        token_data = await github_oauth.exchange_code_for_token(code)
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No access token received"
            )
        
        # Get user info
        user_info = await github_oauth.get_user_info(access_token)
        
        # Use account linking service (it will handle fetching all emails)
        linking_service = AccountLinkingService(db)
        user, is_new_user = await linking_service.link_or_create_user(
            provider="github",
            user_info=user_info,
            access_token=access_token,
            refresh_token=None  # GitHub doesn't use refresh tokens
        )

        # Auto-assign new users to organizations based on email domain
        if is_new_user:
            try:
                assign_user_to_organization(db, user)
            except Exception as e:
                logger.error(f"Failed to auto-assign organization for new user {user.id}: {e}")
                # Don't fail the auth flow if org assignment fails

        # Create demo analysis for new users
        if is_new_user:
            try:
                create_demo_analysis_for_new_user(db, user)
            except Exception as e:
                logger.error(f"Failed to create demo analysis for new user {user.id}: {e}")
                # Don't fail the auth flow if demo creation fails

        # Create JWT token
        jwt_token = create_access_token(data={"sub": user.id})
        
        # Determine redirect URL based on state parameter
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
            
        # ✅ ENTERPRISE PATTERN: 2-Step Server-Side Token Exchange
        # 1. Create temporary auth code (not JWT)
        # 2. Frontend exchanges code for JWT via secure API call
        import secrets

        # Create temporary authorization code
        auth_code = secrets.token_urlsafe(32)

        logger.info(f"🔐 Storing OAuth code for user {user.id}: {auth_code[:10]}...")

        # Store JWT in database (works across multiple Railway instances)
        store_oauth_code(db, auth_code, jwt_token, user.id, "github")

        logger.info(f"✅ OAuth code stored successfully")

        # Redirect with secure authorization code (not JWT)
        success_url = f"{frontend_url}/auth/success?code={auth_code}"
        response = RedirectResponse(url=success_url)
        return response

    except Exception as e:
        error_msg = str(e) if str(e) else "Unknown authentication error"
        logger.error(f"GitHub OAuth callback error: {error_msg}")
        # Use state for error redirect too
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
        error_url = build_error_redirect(frontend_url, error_msg)
        return RedirectResponse(url=error_url)

@router.get("/okta")
@auth_rate_limit("auth_login")
async def okta_login(request: Request, redirect_origin: str = Query(None)):
    """Initiate Okta OIDC login."""
    if not settings.okta_auth_available:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Okta OAuth not enabled"
        )

    state = None
    if redirect_origin and redirect_origin in ALLOWED_OAUTH_ORIGINS:
        state = redirect_origin

    authorization_url = okta_oauth.get_authorization_url(state=state)

    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept:
        return RedirectResponse(url=authorization_url)

    return {"authorization_url": authorization_url}

@router.get("/okta/callback")
async def okta_callback(
    code: str = Query(None),
    error: str = Query(None),
    state: str = Query(None),
    db: Session = Depends(get_db)
):
    """Handle Okta OIDC callback."""
    if not settings.okta_auth_available:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Okta OAuth not enabled"
        )

    if error:
        if error == "access_denied":
            return RedirectResponse(url=settings.FRONTEND_URL)
        else:
            error_url = build_error_redirect(settings.FRONTEND_URL, f'OAuth error: {error}')
            return RedirectResponse(url=error_url)

    if not code:
        logger.warning("Okta OAuth callback received without authorization code")
        return RedirectResponse(url=settings.FRONTEND_URL)

    try:
        token_data = await okta_oauth.exchange_code_for_token(code)
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")

        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No access token received"
            )

        user_info = await okta_oauth.get_user_info(access_token)

        linking_service = AccountLinkingService(db)
        user, is_new_user = await linking_service.link_or_create_user(
            provider="okta",
            user_info=user_info,
            access_token=access_token,
            refresh_token=refresh_token
        )

        if is_new_user:
            try:
                assign_user_to_organization(db, user)
            except Exception as e:
                logger.error(f"Failed to auto-assign organization for new user {user.id}: {e}")

        if is_new_user:
            try:
                create_demo_analysis_for_new_user(db, user)
            except Exception as e:
                logger.error(f"Failed to create demo analysis for new user {user.id}: {e}")

        jwt_token = create_access_token(data={"sub": user.id})

        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state

        auth_code = secrets.token_urlsafe(32)

        logger.info(f"Storing OAuth code for user {user.id}: {auth_code[:10]}...")

        store_oauth_code(db, auth_code, jwt_token, user.id, "okta")

        logger.info("Okta OAuth code stored successfully")

        success_url = f"{frontend_url}/auth/success?code={auth_code}"
        response = RedirectResponse(url=success_url)
        return response

    except Exception as e:
        error_msg = str(e) if str(e) else "Unknown authentication error"
        logger.error("Okta OAuth callback error: %s", error_msg)
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
        error_url = build_error_redirect(frontend_url, error_msg)
        return RedirectResponse(url=error_url)

@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get current user information."""
    linking_service = AccountLinkingService(db)
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "provider": current_user.provider,  # Legacy field
        "is_verified": current_user.is_verified,
        "has_rootly_token": bool(current_user.rootly_token),
        "created_at": current_user.created_at,
        "last_login_at": current_user.last_login_at,
        "login_count": current_user.login_count or 0,
        "oauth_providers": linking_service.get_user_providers(current_user.id),
        "emails": linking_service.get_user_emails(current_user.id)
    }

@router.get("/providers")
async def get_user_providers(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all OAuth providers linked to current user."""
    linking_service = AccountLinkingService(db)
    return {
        "providers": linking_service.get_user_providers(current_user.id)
    }

@router.get("/emails")
async def get_user_emails(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all emails for current user."""
    linking_service = AccountLinkingService(db)
    return {
        "emails": linking_service.get_user_emails(current_user.id)
    }

@router.delete("/providers/{provider}")
async def unlink_provider(
    provider: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Unlink an OAuth provider from current user."""
    linking_service = AccountLinkingService(db)
    success = linking_service.unlink_provider(current_user.id, provider)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot unlink provider. At least one provider must remain linked."
        )
    
    return {"message": f"{provider} provider unlinked successfully"}

@router.get("/user/me")
@auth_rate_limit("auth_refresh")
async def get_current_user_basic_info(
    request: Request,
    current_user: User = Depends(get_current_active_user)
):
    """
    ✅ SECURITY: Get current authenticated user basic information.
    Used to verify authentication works.
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "organization_id": current_user.organization_id,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "updated_at": current_user.updated_at.isoformat() if current_user.updated_at else None,
        "last_login_at": current_user.last_login_at.isoformat() if current_user.last_login_at else None,
        "login_count": current_user.login_count or 0,
    }

@router.post("/exchange-token")
@auth_rate_limit("auth_exchange")
async def exchange_auth_code_for_token(
    request: Request,
    code: str = Query(..., description="Authorization code from OAuth callback"),
    db: Session = Depends(get_db)
):
    """
    ✅ ENTERPRISE PATTERN: Exchange temporary auth code for JWT token.

    This implements the industry-standard 2-step OAuth token exchange:
    1. OAuth callback creates temporary auth code
    2. Frontend securely exchanges code for JWT token
    """
    logger.info(f"🔍 Token exchange request for code: {code[:10]}...")

    # Get code from database (single-use, auto-deleted)
    auth_data = get_oauth_code(db, code)

    if not auth_data:
        logger.error(f"❌ OAuth code not found or expired: {code[:10]}...")

        # Debug: Check if table exists and has any codes
        try:
            result = db.execute(text("SELECT COUNT(*) FROM oauth_temp_codes"))
            count = result.scalar()
            logger.error(f"📊 Total codes in database: {count}")
        except Exception as e:
            logger.error(f"❌ Failed to query oauth_temp_codes table: {e}")

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired authorization code"
        )

    logger.info(f"✅ OAuth code valid, returning token for user {auth_data['user_id']}")

    user = db.query(User).filter(User.id == auth_data["user_id"]).first()
    if user:
        LoginAuditService(db).record_login_success(
            user=user,
            auth_method=auth_data.get("auth_method") or "oauth",
            request=request,
        )
    else:
        logger.warning("OAuth token exchange succeeded but user %s was not found for audit logging", auth_data["user_id"])

    return {
        "access_token": auth_data['jwt_token'],
        "token_type": "bearer",
        "expires_in": 604800,  # 7 days
        "user_id": auth_data['user_id']
    }

@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    new_role: str = Query(..., pattern="^(member|admin)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Update a user's role within the organization.
    Only admin can change roles.
    """
    # Normalize role to lowercase to prevent bypass
    new_role = new_role.lower()

    # Check if current user is admin
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can change user roles"
        )

    # Get the target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Check if target user is in the same organization
    if target_user.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change role of users in other organizations"
        )

    # Prevent changing your own role
    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role"
        )

    # Prevent demoting the last admin
    if target_user.role == 'admin' and new_role != 'admin':
        admin_count = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.organization_id.isnot(None),
            User.role == 'admin',
            User.status == 'active',
            User.id != target_user.id
        ).count()

        if admin_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last admin. Promote another member to admin first."
            )

    # Update the role
    old_role = target_user.role
    target_user.role = new_role
    db.commit()
    db.refresh(target_user)

    # Create notification for the user whose role changed
    try:
        from ...services.notification_service import NotificationService
        notification_service = NotificationService(db)
        notification_service.create_role_change_notification(
            user=target_user,
            old_role=old_role,
            new_role=new_role,
            changed_by=current_user
        )
    except Exception as e:
        logger.error(f"Failed to create role change notification: {e}")
        # Don't fail the role update if notification fails

    return {
        "success": True,
        "user_id": target_user.id,
        "user_email": target_user.email,
        "user_name": target_user.name,
        "old_role": old_role,
        "new_role": new_role,
        "message": f"Successfully updated {target_user.name}'s role from {old_role} to {new_role}"
    }

@router.get("/users/promotable")
async def get_promotable_users(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get list of team members who can be promoted to admin.
    Only returns users with active accounts (not just UserCorrelations).
    Used when sole admin needs to promote someone before deleting their account.
    """
    # Check if current user is admin
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view promotable users"
        )

    # Get all active users in the organization who are not admins
    promotable_users = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.organization_id.isnot(None),
        User.role != 'admin',
        User.status == 'active',
        User.id != current_user.id
    ).all()

    return {
        "users": [
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role
            }
            for user in promotable_users
        ],
        "total": len(promotable_users)
    }

class DeleteAccountRequest(BaseValidatedModel):
    """Delete account request validation."""
    email_confirmation: str = Field(..., min_length=3, max_length=255, description="Email confirmation")

    @field_validator('email_confirmation')
    @classmethod
    def validate_email_confirmation(cls, v):
        """Validate email format."""
        import re
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, v):
            raise ValueError("Invalid email format")
        return v.lower().strip()

@router.delete("/users/me")
@auth_rate_limit("account_delete")
async def delete_current_user_account(
    request: Request,
    delete_request: DeleteAccountRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Delete the current user's account and all associated data.

    This is a permanent, irreversible action that will:
    - Delete all analyses
    - Delete all burnout reports (self-assessments)
    - Delete all notifications
    - Delete all survey preferences
    - Delete all integrations (Rootly, PagerDuty, GitHub, Slack, Jira)
    - Delete OAuth providers
    - Delete email addresses
    - Delete user correlations and mappings
    - Nullify organization invitations sent by this user
    - Delete the user account itself

    Requires email confirmation for safety.
    """
    # Verify email confirmation matches using constant-time comparison
    expected = current_user.email.lower().encode('utf-8')
    provided = delete_request.email_confirmation.lower().encode('utf-8')

    if not secrets.compare_digest(expected, provided):
        logger.warning(f"Account deletion failed - email mismatch for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email confirmation does not match your account email"
        )

    # Additional safety check - prevent deletion if user is sole admin WITH other team members
    if current_user.organization_id and current_user.role == 'admin':
        # Check if there are other admins
        other_admins = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.organization_id.isnot(None),
            User.role == 'admin',
            User.id != current_user.id,
            User.status == 'active'
        ).count()

        if other_admins == 0:
            # Check if there are other team members in the organization
            from ...models.user_correlation import UserCorrelation
            other_members = db.query(UserCorrelation).filter(
                UserCorrelation.organization_id == current_user.organization_id,
                UserCorrelation.organization_id.isnot(None),
                UserCorrelation.email != current_user.email
            ).count()

            if other_members > 0:
                # Block deletion - there are team members but no other admins
                logger.warning(f"Account deletion blocked - user {current_user.id} is sole admin with {other_members} team members")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You are the only admin. Please promote another team member to admin before deleting your account."
                )
            else:
                # Allow deletion - user is sole member, org will be disbanded
                logger.info(f"Account deletion proceeding - user {current_user.id} is sole member, org will be disbanded")

    try:
        logger.info(f"Starting account deletion for user {current_user.id} ({current_user.email})")

        # Start transaction - all or nothing
        # Note: SQLAlchemy relationships with cascade="all, delete-orphan" will handle most deletions
        # But we'll be explicit for critical data

        # Import models with correct path
        from ...models.analysis import Analysis
        from ...models.rootly_integration import RootlyIntegration
        from ...models.slack_workspace_mapping import SlackWorkspaceMapping
        from ...models.jira_workspace_mapping import JiraWorkspaceMapping
        from ...models.user_mapping import UserMapping
        from ...models.user_burnout_report import UserBurnoutReport
        from ...models.user_notification import UserNotification
        from ...models.survey_schedule import UserSurveyPreference
        from ...models.organization_invitation import OrganizationInvitation
        from ...models.survey_period import SurveyPeriod

        # 1. Delete analyses (will cascade to integration_mappings via relationship)
        analyses_count = db.query(Analysis).filter(Analysis.user_id == current_user.id).count()
        db.query(Analysis).filter(Analysis.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {analyses_count} analyses for user {current_user.id}")

        # 2. Delete survey periods for this user (must be done before deleting burnout reports)
        # because survey_periods has a FK reference to user_burnout_reports
        survey_periods_count = db.query(SurveyPeriod).filter(SurveyPeriod.user_id == current_user.id).count()
        db.query(SurveyPeriod).filter(SurveyPeriod.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {survey_periods_count} survey periods for user {current_user.id}")

        # 3. Delete user burnout reports (self-reported assessments)
        burnout_reports_count = db.query(UserBurnoutReport).filter(UserBurnoutReport.user_id == current_user.id).count()
        db.query(UserBurnoutReport).filter(UserBurnoutReport.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {burnout_reports_count} burnout reports for user {current_user.id}")

        # 4. Delete user notifications
        notifications_count = db.query(UserNotification).filter(UserNotification.user_id == current_user.id).count()
        db.query(UserNotification).filter(UserNotification.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {notifications_count} notifications for user {current_user.id}")

        # 5. Delete user survey preferences
        survey_prefs_count = db.query(UserSurveyPreference).filter(UserSurveyPreference.user_id == current_user.id).count()
        db.query(UserSurveyPreference).filter(UserSurveyPreference.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {survey_prefs_count} survey preferences for user {current_user.id}")

        # 6. Nullify organization invitations sent by this user
        invitations_count = db.query(OrganizationInvitation).filter(OrganizationInvitation.invited_by == current_user.id).count()
        db.query(OrganizationInvitation).filter(OrganizationInvitation.invited_by == current_user.id).update(
            {"invited_by": None},
            synchronize_session=False
        )
        logger.info(f"Nullified {invitations_count} organization invitations for user {current_user.id}")

        # 7. Delete Rootly/PagerDuty integrations
        rootly_count = db.query(RootlyIntegration).filter(RootlyIntegration.user_id == current_user.id).count()
        db.query(RootlyIntegration).filter(RootlyIntegration.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {rootly_count} Rootly/PagerDuty integrations for user {current_user.id}")

        # 8. Relationships with cascade="all, delete-orphan" will auto-delete when we delete the user:
        # - oauth_providers
        # - emails
        # - github_integrations
        # - slack_integrations
        # - jira_integrations
        # - user_correlations
        # - integration_mappings (if not already deleted via analyses)
        # - user_mappings_owned

        # 9. Handle workspace ownerships - transfer or delete
        # For workspaces owned by this user, set owner_user_id to NULL (allow orphaned workspaces)
        slack_workspaces_count = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.owner_user_id == current_user.id
        ).count()
        db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.owner_user_id == current_user.id
        ).update({"owner_user_id": None}, synchronize_session=False)

        jira_workspaces_count = db.query(JiraWorkspaceMapping).filter(
            JiraWorkspaceMapping.owner_user_id == current_user.id
        ).count()
        db.query(JiraWorkspaceMapping).filter(
            JiraWorkspaceMapping.owner_user_id == current_user.id
        ).delete(synchronize_session=False)

        logger.info(f"Cleared {slack_workspaces_count} Slack workspace ownerships and {jira_workspaces_count} Jira workspace ownerships for user {current_user.id}")

        # 10. Handle user_mappings_created (created_by foreign key)
        db.query(UserMapping).filter(
            UserMapping.created_by == current_user.id
        ).delete(synchronize_session=False)

        # 11. Finally, delete the user (cascades will handle remaining relationships)
        db.delete(current_user)

        # Commit the transaction
        db.commit()

        logger.info(f"Successfully deleted account for user {current_user.id} ({current_user.email})")

        return {
            "success": True,
            "message": "Your account has been permanently deleted"
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete account for user {current_user.id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please contact support."
        )


@router.get("/organizations/members")
async def get_organization_members(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> list[Dict[str, Any]]:
    """
    Get all members and pending invitations for the current user's organization.
    """
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="You must be part of an organization")

    # Get all users in the organization who have actually logged in (have OAuth providers)
    # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
    users = db.query(User).join(
        OAuthProvider, User.id == OAuthProvider.user_id
    ).filter(
        User.organization_id == current_user.organization_id,
        User.organization_id.isnot(None),
        User.status == 'active'
    ).distinct().order_by(User.name).all()

    # Get pending invitations for the organization
    # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
    pending_invitations = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.organization_id == current_user.organization_id,
        OrganizationInvitation.organization_id.isnot(None),
        OrganizationInvitation.status == 'pending'
    ).all()

    # Format response with current user first
    current_user_data = None
    other_members = []

    # Add actual users
    for user in users:
        member_data = {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "status": "active",
            "is_current_user": user.id == current_user.id,
            "joined_at": user.joined_org_at.isoformat() if user.joined_org_at else None
        }

        if user.id == current_user.id:
            current_user_data = member_data
        else:
            other_members.append(member_data)

    # Add pending invitations
    for invitation in pending_invitations:
        if not invitation.is_expired:
            invitation_data = {
                "id": f"invitation_{invitation.id}",  # Prefix to distinguish from users
                "invitation_id": invitation.id,
                "name": invitation.email.split('@')[0],  # Use email username as name
                "email": invitation.email,
                "role": invitation.role,
                "status": "pending",
                "is_current_user": False,
                "joined_at": None,
                "invited_at": invitation.created_at.isoformat() if invitation.created_at else None,
                "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None
            }
            other_members.append(invitation_data)

    # Return current user first, then others (users + pending invitations)
    members = [current_user_data] if current_user_data else []
    members.extend(other_members)

    return members

@router.delete("/organizations/members/{user_id}")
async def remove_organization_member(
    user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Remove a member from the organization. Admin only.

    Safety checks:
    - Only admins can remove members
    - Cannot remove yourself
    - Cannot remove if you're the last admin
    - Sets user's organization_id to NULL (user becomes org-less)
    - Deletes user's API keys for security
    """
    # Safety check 1: Must be in an organization
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="You must be part of an organization to remove members"
        )

    # Safety check 2: Must be an admin
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=403,
            detail="Only organization admins can remove members"
        )

    # Safety check 3: Cannot remove yourself
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot remove yourself from the organization. Use the leave organization feature instead."
        )

    # Get the target user
    # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
    target_user = db.query(User).filter(
        User.id == user_id,
        User.status == 'active'
    ).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Safety check 4: Target user must be in the same organization
    if target_user.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="User is not in your organization"
        )

    # Safety check 5: If removing an admin, ensure there's at least one other admin
    if target_user.role == 'admin':
        # Count other admins in the organization
        # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
        other_admin_count = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.organization_id.isnot(None),
            User.role == 'admin',
            User.id != user_id,
            User.status == 'active'
        ).count()

        if other_admin_count == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last admin. Promote another member to admin first."
            )

    try:
        # Log the action for audit trail
        logger.info(
            f"Admin {current_user.id} ({current_user.email}) removing user {user_id} "
            f"({target_user.email}) from organization {current_user.organization_id}"
        )

        # Remove user from organization
        target_user.organization_id = None
        target_user.role = 'member'  # Reset to default role

        # Delete user's API keys for security
        from ...models.api_key import APIKey
        deleted_keys = db.query(APIKey).filter(
            APIKey.user_id == user_id
        ).delete()

        if deleted_keys > 0:
            logger.info(f"Deleted {deleted_keys} API key(s) for removed user {user_id}")

        # Mark user correlations as inactive (for audit trail)
        from ...models.user_correlation import UserCorrelation
        updated_correlations = db.query(UserCorrelation).filter(
            UserCorrelation.user_id == user_id,
            UserCorrelation.organization_id == current_user.organization_id
        ).update({
            "is_active": 0
        })

        if updated_correlations > 0:
            logger.info(f"Marked {updated_correlations} user correlation(s) as inactive for user {user_id}")

        db.commit()

        return {
            "success": True,
            "message": f"{target_user.name} has been removed from the organization",
            "user_id": user_id
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error removing user {user_id} from organization: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove member: {str(e)}"
        )

# Password Login Endpoint (for E2E testing only)
@router.post("/login/password")
@auth_rate_limit("password_login")
async def password_login(
    login_request: PasswordLoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Password-based login for E2E testing.
    NOT intended for production use - OAuth is the primary authentication method.

    Security: Uses constant-time operations to prevent timing attacks.
    """
    # Find user by email
    user = db.query(User).filter(User.email == login_request.email).first()

    # Always perform password verification to prevent timing attacks
    # Use a dummy hash if user doesn't exist to maintain constant time
    password_is_valid = False

    try:
        password_bytes = login_request.password.encode('utf-8')

        if user and user.password_hash:
            hash_bytes = user.password_hash.encode('utf-8') if isinstance(user.password_hash, str) else user.password_hash
            password_is_valid = bcrypt.checkpw(password_bytes, hash_bytes)
        else:
            # Perform dummy hash check to maintain constant time
            # This prevents timing attacks that could reveal if a user exists
            dummy_hash = b'$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7qwKgR6Hqm'
            bcrypt.checkpw(password_bytes, dummy_hash)

    except Exception as e:
        # Log error but don't expose details to client
        logger.error(f"Password verification error for {login_request.email}: {e}", exc_info=True)
        # Still return generic error after logging

    # Always return the same error message regardless of whether user exists or password is wrong
    if not password_is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Create JWT token
    access_token = create_access_token(data={"sub": str(user.id)})

    LoginAuditService(db).record_login_success(
        user=user,
        auth_method="password",
        request=request,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            "login_count": user.login_count or 0,
        }
    }
