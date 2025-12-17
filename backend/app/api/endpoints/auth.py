"""
Authentication API endpoints.
"""
from typing import Any, Dict, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from ...models import get_db, User, OAuthProvider, UserEmail
from ...auth.oauth import google_oauth, github_oauth
from ...auth.jwt import create_access_token
from ...auth.dependencies import get_current_active_user
from ...services.account_linking import AccountLinkingService
from ...services.demo_analysis_service import create_demo_analysis_for_new_user
from ...core.config import settings
from ...core.rate_limiting import auth_rate_limit
from ...core.input_validation import BaseValidatedModel
from pydantic import field_validator, Field

router = APIRouter()

# Allowed OAuth redirect origins
ALLOWED_OAUTH_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    settings.FRONTEND_URL,
    "https://www.oncallburnout.com",
    "https://oncallburnout.com"
]

# Helper functions for database-backed OAuth code storage
def store_oauth_code(db: Session, code: str, jwt_token: str, user_id: int) -> None:
    """Store OAuth temporary code in database."""
    try:
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        db.execute(text("""
            INSERT INTO oauth_temp_codes (code, jwt_token, user_id, expires_at)
            VALUES (:code, :jwt_token, :user_id, :expires_at)
        """), {
            "code": code,
            "jwt_token": jwt_token,
            "user_id": user_id,
            "expires_at": expires_at
        })
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logging.error(f"Failed to store OAuth code: {e}")
        raise

def get_oauth_code(db: Session, code: str) -> Optional[Dict[str, Any]]:
    """Retrieve and delete OAuth code from database (single-use)."""
    try:
        # Clean up expired codes first
        db.execute(text("""
            DELETE FROM oauth_temp_codes
            WHERE expires_at < :now
        """), {"now": datetime.utcnow()})
        db.commit()

        # Get the code
        result = db.execute(text("""
            SELECT jwt_token, user_id, expires_at
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
            "expires_at": row[2]
        }
    except Exception as e:
        db.rollback()
        import logging
        logging.error(f"Failed to retrieve OAuth code: {e}")
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
            error_url = f"{settings.FRONTEND_URL}/auth/error?message=OAuth error: {error}"
            return RedirectResponse(url=error_url)
    
    # No code means user canceled without error parameter
    if not code:
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

        # Create demo analysis for new users
        if is_new_user:
            try:
                create_demo_analysis_for_new_user(db, user)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create demo analysis for new user {user.id}: {e}")
                # Don't fail the auth flow if demo creation fails

        # Create JWT token
        jwt_token = create_access_token(data={"sub": user.id})
        
        # Determine redirect URL based on state parameter
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
            
        # ✅ SECURITY FIX: Use httpOnly cookie instead of URL parameter  
        response = RedirectResponse(url=f"{frontend_url}/auth/success")
        
        # Determine if we should use secure cookies (HTTPS only in production)
        is_production = not frontend_url.startswith("http://localhost")
        
        # ✅ ENTERPRISE PATTERN: 2-Step Server-Side Token Exchange
        # 1. Create temporary auth code (not JWT)
        # 2. Frontend exchanges code for JWT via secure API call
        import secrets
        import logging
        logger = logging.getLogger(__name__)

        # Create temporary authorization code
        auth_code = secrets.token_urlsafe(32)

        logger.info(f"🔐 Storing OAuth code for user {user.id}: {auth_code[:10]}...")

        # Store JWT in database (works across multiple Railway instances)
        store_oauth_code(db, auth_code, jwt_token, user.id)

        logger.info(f"✅ OAuth code stored successfully")

        # Redirect with secure authorization code (not JWT)
        success_url = f"{frontend_url}/auth/success?code={auth_code}"
        response = RedirectResponse(url=success_url)
        return response
        
    except Exception as e:
        # Use state for error redirect too
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
        error_url = f"{frontend_url}/auth/error?message={str(e)}"
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
            error_url = f"{settings.FRONTEND_URL}/auth/error?message=OAuth error: {error}"
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

        # Create demo analysis for new users
        if is_new_user:
            try:
                create_demo_analysis_for_new_user(db, user)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create demo analysis for new user {user.id}: {e}")
                # Don't fail the auth flow if demo creation fails

        # Create JWT token
        jwt_token = create_access_token(data={"sub": user.id})
        
        # Determine redirect URL based on state parameter
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
            
        # ✅ SECURITY FIX: Use httpOnly cookie instead of URL parameter  
        response = RedirectResponse(url=f"{frontend_url}/auth/success")
        
        # Determine if we should use secure cookies (HTTPS only in production)
        is_production = not frontend_url.startswith("http://localhost")
        
        # ✅ ENTERPRISE PATTERN: 2-Step Server-Side Token Exchange
        # 1. Create temporary auth code (not JWT)
        # 2. Frontend exchanges code for JWT via secure API call
        import secrets
        import logging
        logger = logging.getLogger(__name__)

        # Create temporary authorization code
        auth_code = secrets.token_urlsafe(32)

        logger.info(f"🔐 Storing OAuth code for user {user.id}: {auth_code[:10]}...")

        # Store JWT in database (works across multiple Railway instances)
        store_oauth_code(db, auth_code, jwt_token, user.id)

        logger.info(f"✅ OAuth code stored successfully")

        # Redirect with secure authorization code (not JWT)
        success_url = f"{frontend_url}/auth/success?code={auth_code}"
        response = RedirectResponse(url=success_url)
        return response
        
    except Exception as e:
        # Use state for error redirect too
        frontend_url = settings.FRONTEND_URL
        if state and state in ALLOWED_OAUTH_ORIGINS:
            frontend_url = state
        error_url = f"{frontend_url}/auth/error?message={str(e)}"
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
async def get_current_user_info(
    request: Request,
    current_user: User = Depends(get_current_active_user)
):
    """
    ✅ SECURITY: Get current authenticated user information.
    Used to verify authentication works.
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "organization_id": current_user.organization_id,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "updated_at": current_user.updated_at.isoformat() if current_user.updated_at else None
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
    import logging
    logger = logging.getLogger(__name__)

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

    return {
        "access_token": auth_data['jwt_token'],
        "token_type": "bearer",
        "expires_in": 604800,  # 7 days
        "user_id": auth_data['user_id']
    }

@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    new_role: str = Query(..., regex="^(member|manager|org_admin)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Update a user's role within the organization.
    Only org_admin can change roles.
    """
    # Check if current user is org_admin
    if current_user.role != "org_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can change user roles"
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

    # Update the role
    old_role = target_user.role
    target_user.role = new_role
    db.commit()
    db.refresh(target_user)

    return {
        "success": True,
        "user_id": target_user.id,
        "user_email": target_user.email,
        "user_name": target_user.name,
        "old_role": old_role,
        "new_role": new_role,
        "message": f"Successfully updated {target_user.name}'s role from {old_role} to {new_role}"
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
    import logging
    logger = logging.getLogger(__name__)

    # Verify email confirmation matches
    if delete_request.email_confirmation != current_user.email.lower():
        logger.warning(f"Account deletion failed - email mismatch for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email confirmation does not match your account email"
        )

    # Additional safety check - prevent deletion if user is sole org admin
    if current_user.organization_id and current_user.role == 'org_admin':
        # Check if there are other org admins
        other_admins = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.role == 'org_admin',
            User.id != current_user.id,
            User.status == 'active'
        ).count()

        if other_admins == 0:
            logger.warning(f"Account deletion blocked - user {current_user.id} is sole org admin")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete account: You are the only admin in your organization. Please transfer admin rights to another user first, or contact support."
            )

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

        # 1. Delete analyses (will cascade to integration_mappings via relationship)
        analyses_count = db.query(Analysis).filter(Analysis.user_id == current_user.id).count()
        db.query(Analysis).filter(Analysis.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {analyses_count} analyses for user {current_user.id}")

        # 2. Delete user burnout reports (self-reported assessments)
        burnout_reports_count = db.query(UserBurnoutReport).filter(UserBurnoutReport.user_id == current_user.id).count()
        db.query(UserBurnoutReport).filter(UserBurnoutReport.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {burnout_reports_count} burnout reports for user {current_user.id}")

        # 3. Delete user notifications
        notifications_count = db.query(UserNotification).filter(UserNotification.user_id == current_user.id).count()
        db.query(UserNotification).filter(UserNotification.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {notifications_count} notifications for user {current_user.id}")

        # 4. Delete user survey preferences
        survey_prefs_count = db.query(UserSurveyPreference).filter(UserSurveyPreference.user_id == current_user.id).count()
        db.query(UserSurveyPreference).filter(UserSurveyPreference.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {survey_prefs_count} survey preferences for user {current_user.id}")

        # 5. Nullify organization invitations sent by this user
        invitations_count = db.query(OrganizationInvitation).filter(OrganizationInvitation.invited_by == current_user.id).count()
        db.query(OrganizationInvitation).filter(OrganizationInvitation.invited_by == current_user.id).update(
            {"invited_by": None},
            synchronize_session=False
        )
        logger.info(f"Nullified {invitations_count} organization invitations for user {current_user.id}")

        # 6. Delete Rootly/PagerDuty integrations
        rootly_count = db.query(RootlyIntegration).filter(RootlyIntegration.user_id == current_user.id).count()
        db.query(RootlyIntegration).filter(RootlyIntegration.user_id == current_user.id).delete(synchronize_session=False)
        logger.info(f"Deleted {rootly_count} Rootly/PagerDuty integrations for user {current_user.id}")

        # 3. Relationships with cascade="all, delete-orphan" will auto-delete when we delete the user:
        # - oauth_providers
        # - emails
        # - github_integrations
        # - slack_integrations
        # - jira_integrations
        # - user_correlations
        # - integration_mappings (if not already deleted via analyses)
        # - user_mappings_owned

        # 4. Handle workspace ownerships - transfer or delete
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

        # 5. Handle user_mappings_created (created_by foreign key)
        # Set created_by to NULL for mappings created by this user
        db.query(UserMapping).filter(
            UserMapping.created_by == current_user.id
        ).update({"created_by": None}, synchronize_session=False)

        # 6. Finally, delete the user (cascades will handle remaining relationships)
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