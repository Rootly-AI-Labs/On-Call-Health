"""
Slack integration API endpoints for OAuth and data collection.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Form, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Dict, Any
import secrets
import json
import logging
import os
import urllib.parse
import hmac
import hashlib
import time
from cryptography.fernet import Fernet
import base64
from datetime import datetime, timezone
from pydantic import BaseModel

from ...models import get_db, User, SlackIntegration, UserCorrelation, UserBurnoutReport, Analysis, SlackWorkspaceMapping
from ...auth.dependencies import get_current_user
from ...auth.integration_oauth import slack_integration_oauth
from ...core.config import settings
from ...services.notification_service import NotificationService
from ...services.survey_response_service import (
    extract_analysis_member_emails,
    get_utc_day_bounds,
    normalize_survey_email,
)
from ...utils import mask_email

# Set up logger
logger = logging.getLogger(__name__)


router = APIRouter(prefix="/slack", tags=["slack-integration"])

# Cache for Slack users to avoid rate limiting
# Key: workspace_id, Value: (timestamp, users_list)
# TTL is set to 5 minutes to balance freshness with Slack API rate limits (Tier 3: 50+ calls/min)
# User lists change infrequently, so 5 minutes provides good UX without hitting rate limits
_slack_users_cache: Dict[str, tuple[datetime, list]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes - configurable via environment if needed
SLACK_SIGNATURE_VERSION = "v0"
SLACK_REQUEST_TTL_SECONDS = 60 * 5

# Helper function to get the user isolation key (organization_id or user_id for beta)
def get_user_isolation_key(user: User) -> tuple:
    """
    Get the isolation key for queries - organization_id if available, otherwise user_id.
    Returns: (key_name, key_value) tuple
    """
    if user.organization_id:
        return ("organization_id", user.organization_id)
    return ("user_id", user.id)


def get_active_workspace_mapping(db: Session, user: User) -> SlackWorkspaceMapping:
    """
    Find the active workspace mapping for a user.
    Checks organization first, then falls back to owner lookup for legacy workspaces.
    Returns None if no active workspace mapping is found.
    """
    workspace_mapping = None
    if user.organization_id:
        workspace_mapping = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.organization_id == user.organization_id,
            SlackWorkspaceMapping.status == 'active'
        ).first()

    if not workspace_mapping:
        workspace_mapping = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.owner_user_id == user.id,
            SlackWorkspaceMapping.status == 'active'
        ).first()

    return workspace_mapping

# Simple encryption for tokens (in production, use proper key management)
def get_encryption_key():
    """Get or create encryption key for tokens."""
    key = settings.JWT_SECRET_KEY.encode()
    # Ensure key is 32 bytes for Fernet
    key = base64.urlsafe_b64encode(key[:32].ljust(32, b'\0'))
    return key

def encrypt_token(token: str) -> str:
    """Encrypt a token for storage."""
    fernet = Fernet(get_encryption_key())
    return fernet.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    """Decrypt a token from storage."""
    fernet = Fernet(get_encryption_key())
    return fernet.decrypt(encrypted_token.encode()).decode()


def is_valid_slack_request_signature(
    signing_secret: str,
    timestamp: str,
    signature: str,
    body: bytes,
    *,
    now: int | None = None,
) -> bool:
    """Validate Slack request signature and replay window."""
    if not signing_secret or not timestamp or not signature:
        return False

    try:
        request_timestamp = int(timestamp)
    except (TypeError, ValueError):
        return False

    current_time = now if now is not None else int(time.time())
    if abs(current_time - request_timestamp) > SLACK_REQUEST_TTL_SECONDS:
        return False

    try:
        body_text = body.decode("utf-8")
    except UnicodeDecodeError:
        return False

    basestring = f"{SLACK_SIGNATURE_VERSION}:{timestamp}:{body_text}"
    expected_signature = (
        f"{SLACK_SIGNATURE_VERSION}="
        f"{hmac.new(signing_secret.encode(), basestring.encode(), hashlib.sha256).hexdigest()}"
    )
    return hmac.compare_digest(expected_signature, signature)


async def verify_slack_request_signature(request: Request) -> None:
    """Reject unsigned or forged Slack requests before processing payloads."""
    if not settings.SLACK_SIGNING_SECRET:
        logger.error("Slack request received but SLACK_SIGNING_SECRET is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Slack signing secret not configured"
        )

    timestamp = request.headers.get("X-Slack-Request-Timestamp")
    signature = request.headers.get("X-Slack-Signature")
    raw_body = await request.body()

    if not is_valid_slack_request_signature(
        settings.SLACK_SIGNING_SECRET,
        timestamp or "",
        signature or "",
        raw_body,
    ):
        logger.warning("Rejected Slack request with invalid signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Slack request signature"
        )

@router.post("/connect")
async def connect_slack(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initiate Slack OAuth flow for integration.
    Returns authorization URL for frontend to redirect to.
    """
    # Check if OAuth credentials are configured
    if not settings.SLACK_CLIENT_ID or not settings.SLACK_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Slack OAuth is not configured. Please contact your administrator to set up Slack integration."
        )
    
    # Generate state parameter for security
    state = secrets.token_urlsafe(32)
    
    # Store state in session or database (simplified for this example)
    # In production, you'd want to store this more securely
    auth_url = slack_integration_oauth.get_authorization_url(state=state)
    
    return {
        "authorization_url": auth_url,
        "state": state
    }

@router.get("/test-endpoint")
async def test_slack_endpoint():
    """Simple test endpoint to verify routing is working."""
    return {"message": "Slack OAuth endpoint is reachable", "endpoint": "/api/integrations/slack/test-endpoint"}

@router.get("/oauth/callback")
async def slack_oauth_callback(
    code: str = None,
    error: str = None,
    state: str = None,
    db: Session = Depends(get_db)
):
    """
    Handle Slack OAuth callback for workspace-level app installation.
    Creates a workspace mapping and redirects to the frontend with success status.
    Handles errors when user cancels or denies authorization.
    """
    logger.debug(f"Slack OAuth callback received - code: {code[:20] if code else 'None'}..., error: {error}, state: {state[:50] if state else 'None'}...")

    # Handle user denial/cancellation
    if error:
        logger.info(f"Slack OAuth denied or cancelled: {error}")
        from fastapi.responses import RedirectResponse
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"

        if error == "access_denied":
            redirect_url = f"{frontend_url}/integrations?slack_connected=false&error=user_cancelled&message=You cancelled the Slack authorization"
        else:
            redirect_url = f"{frontend_url}/integrations?slack_connected=false&error={error}"

        return RedirectResponse(url=redirect_url, status_code=302)

    # Require code if no error
    if not code:
        from fastapi.responses import RedirectResponse
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        redirect_url = f"{frontend_url}/integrations?slack_connected=false&error=missing_code&message=Missing authorization code"
        return RedirectResponse(url=redirect_url, status_code=302)

    try:
        # Parse state parameter to get organization info and feature flags
        organization_id = None
        user_id = None
        user_email = None
        enable_survey = False  # Default to False - admin must explicitly enable

        if state:
            import base64
            try:
                logger.debug(f"Raw state parameter: {state}")
                decoded_state = json.loads(base64.b64decode(state + '=='))  # Add padding
                logger.debug(f"Full decoded state: {decoded_state}")
                organization_id = decoded_state.get("orgId")
                user_id = decoded_state.get("userId")
                user_email = decoded_state.get("email")
                enable_survey = decoded_state.get("enableSurvey", False)  # Default False
                logger.debug(f"Decoded state - org_id: {organization_id}, user_id: {user_id}, email: {mask_email(user_email)}, survey: {enable_survey}")
            except Exception as state_error:
                # If state parsing fails, continue without org mapping and use defaults
                logger.warning(f"Failed to parse state parameter: {state_error}")
                pass

        # Exchange code for token using Slack's OAuth API
        import httpx
        async with httpx.AsyncClient() as client:
            # Construct the same redirect_uri that was used in the OAuth request
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
            backend_base = settings.DATABASE_URL.replace("postgresql://", "https://").split("@")[1].split("/")[0] if settings.DATABASE_URL else "localhost:8000"

            # Get backend URL from environment variable (preferred) or construct it
            backend_url = os.getenv("BACKEND_URL")

            if not backend_url:
                # Fallback: detect environment from DATABASE_URL
                if "railway" in str(settings.DATABASE_URL):
                    if "production" in str(settings.DATABASE_URL):
                        backend_url = "https://rootly-burnout-detector-web-production.up.railway.app"
                    else:
                        backend_url = "https://rootly-burnout-detector-web-development.up.railway.app"
                else:
                    # Local development
                    backend_url = "http://localhost:8000"

            redirect_uri = f"{backend_url}/integrations/slack/oauth/callback"

            # Enhanced debugging for OAuth configuration
            logger.info(f"🔍 OAuth Debug Info:")
            logger.info(f"  - Backend URL: {backend_url}")
            logger.info(f"  - Redirect URI: {redirect_uri}")
            logger.info(f"  - Client ID: {settings.SLACK_CLIENT_ID[:10]}...{settings.SLACK_CLIENT_ID[-4:]}")
            logger.info(f"  - Authorization code: {code[:10]}...{code[-4:]}")
            logger.info(f"  - Database URL contains: {'production' if 'production' in str(settings.DATABASE_URL) else 'staging' if 'staging' in str(settings.DATABASE_URL) else 'unknown'}")

            token_response = await client.post(
                "https://slack.com/api/oauth.v2.access",
                data={
                    "client_id": settings.SLACK_CLIENT_ID,
                    "client_secret": settings.SLACK_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri
                }
            )

            if token_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to exchange code for token"
                )

            token_data = token_response.json()

            if not token_data.get("ok"):
                error_msg = token_data.get('error', 'Unknown error')
                logger.error(f"❌ Slack OAuth token exchange failed: {error_msg}")
                logger.error(f"Full token response: {token_data}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Slack OAuth error: {error_msg}"
                )

            # Extract token and team info
            access_token = token_data.get("access_token")
            team_info = token_data.get("team", {})
            workspace_id = team_info.get("id")
            workspace_name = team_info.get("name")
            granted_scopes = token_data.get("scope", "")  # Get granted scopes from OAuth response

            if not access_token or not workspace_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to get access token or workspace ID from Slack"
                )

        # For now, we'll store the bot token in SlackIntegration model instead
        # and create a basic workspace mapping without token storage

        # Find the user who initiated the OAuth flow
        owner_user = None

        # First, try to find by user_id from state (most accurate)
        if user_id:
            owner_user = db.query(User).filter(User.id == user_id).first()
            if owner_user:
                logger.info(f"Found owner by user_id: {owner_user.id} ({mask_email(owner_user.email)})")

        # Fallback: try to find by email from state
        if not owner_user and user_email:
            owner_user = db.query(User).filter(User.email == user_email).first()
            if owner_user:
                logger.info(f"Found owner by email: {owner_user.id} ({mask_email(owner_user.email)})")

        # Fallback: find any admin in the organization
        if not owner_user and organization_id:
            owner_user = db.query(User).filter(
                User.organization_id == organization_id,
                User.role == 'admin'
            ).first()
            if owner_user:
                logger.warning(f"Could not find user from state, using first admin in org: {owner_user.id} ({mask_email(owner_user.email)})")

        # Last resort: find any user to be the owner
        if not owner_user:
            owner_user = db.query(User).first()
            if owner_user:
                logger.warning(f"Could not find specific user, using first user in database: {owner_user.id} ({mask_email(owner_user.email)})")

        if not owner_user:
            # If absolutely no users exist, we can't create the mapping
            from fastapi.responses import RedirectResponse
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
            redirect_url = f"{frontend_url}/integrations?slack_connected=false&error=no_users_found"
            return RedirectResponse(url=redirect_url, status_code=302)

        # Create or update workspace mapping
        existing_mapping = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.workspace_id == workspace_id
        ).first()

        # Use owner's organization_id if not provided in state
        if not organization_id and owner_user.organization_id:
            organization_id = owner_user.organization_id
            logger.info(f"Using owner's organization_id: {organization_id}")

        # Verify owner is an admin in OUR app (not just Slack admin)
        if owner_user.role != 'admin':
            logger.warning(
                f"User {owner_user.id} ({owner_user.email}) attempted Slack OAuth "
                f"but is not an admin in our app (role={owner_user.role})"
            )
            from fastapi.responses import RedirectResponse
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
            error_message = urllib.parse.quote(
                "Only organization admins can connect Slack. Please ask your admin to set up the integration."
            )
            redirect_url = (
                f"{frontend_url}/integrations?"
                f"slack_connected=false&"
                f"error=admin_required&"
                f"message={error_message}"
            )
            return RedirectResponse(url=redirect_url, status_code=302)

        if existing_mapping:
            # Update existing mapping (reactivate if it was disconnected)
            existing_mapping.workspace_name = workspace_name
            existing_mapping.status = 'active'
            existing_mapping.owner_user_id = owner_user.id  # Update owner to current user reconnecting
            if organization_id:
                existing_mapping.organization_id = organization_id
            # Update feature flags based on user selection
            existing_mapping.survey_enabled = enable_survey
            existing_mapping.granted_scopes = granted_scopes
            mapping = existing_mapping
        else:
            # Create new mapping with feature flags
            mapping = SlackWorkspaceMapping(
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                organization_id=organization_id,
                owner_user_id=owner_user.id,
                status='active',
                survey_enabled=enable_survey,
                granted_scopes=granted_scopes
            )
            db.add(mapping)

        # Store the bot token separately in a SlackIntegration record for the workspace
        # IMPORTANT: Query by BOTH workspace_id AND token_source to avoid overwriting manual integrations
        slack_integration = db.query(SlackIntegration).filter(
            SlackIntegration.workspace_id == workspace_id,
            SlackIntegration.token_source == "oauth"  # Only update OAuth integrations
        ).first()

        if slack_integration:
            # Update existing OAuth integration
            slack_integration.slack_token = encrypt_token(access_token)
            slack_integration.organization_id = organization_id  # Update org attribution
            slack_integration.updated_at = datetime.now(timezone.utc)
        else:
            # Create new OAuth integration (won't conflict with manual integrations)
            slack_integration = SlackIntegration(
                user_id=owner_user.id,
                organization_id=organization_id,  # NULL for personal, set for org
                slack_token=encrypt_token(access_token),
                workspace_id=workspace_id,
                token_source="oauth"
            )
            db.add(slack_integration)

        db.commit()

        # Log what was created with feature flags
        features = []
        if enable_survey:
            features.append("survey")
        features_str = "+".join(features) if features else "none"
        logger.info(f"Slack OAuth successful - workspace: {workspace_name}, workspace_id: {workspace_id}, organization_id: {organization_id}, features: {features_str}")

        # Notify all org members about connection
        notification_service = NotificationService(db)
        notification_service.create_slack_connected_notification(owner_user, workspace_name)

        # Redirect to frontend with success message
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        import urllib.parse
        encoded_workspace = urllib.parse.quote(workspace_name) if workspace_name else "unknown"
        redirect_url = f"{frontend_url}/integrations?slack_connected=true&workspace={encoded_workspace}"

        logger.debug(f"Redirecting to: {redirect_url}")

        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url, status_code=302)

    except HTTPException as he:
        logger.error(f"❌ Slack OAuth HTTPException: {he.detail}")
        # Redirect to frontend with error
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        from fastapi.responses import RedirectResponse
        import urllib.parse
        error_msg = urllib.parse.quote(str(he.detail))
        redirect_url = f"{frontend_url}/integrations?slack_connected=false&error={error_msg}"
        return RedirectResponse(url=redirect_url, status_code=302)
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Slack OAuth unexpected error: {str(e)}")
        logger.exception(e)
        # Redirect to frontend with error
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        from fastapi.responses import RedirectResponse
        import urllib.parse
        error_msg = urllib.parse.quote(f"Unexpected error: {str(e)}")
        redirect_url = f"{frontend_url}/integrations?slack_connected=false&error={error_msg}"
        return RedirectResponse(url=redirect_url, status_code=302)

@router.get("/check-scopes")
async def check_slack_scopes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check what scopes the current Slack token has."""
    integration = db.query(SlackIntegration).filter(
        SlackIntegration.user_id == current_user.id
    ).first()
    
    if not integration or not integration.slack_token:
        return {"error": "No Slack integration found"}
    
    try:
        # Decrypt token
        access_token = decrypt_token(integration.slack_token)
        
        # Get token info to see what scopes it has
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        import httpx
        async with httpx.AsyncClient() as client:
            # Test auth.test to get basic info
            response = await client.get("https://slack.com/api/auth.test", headers=headers)
            auth_result = response.json()
            
            # Test various API endpoints to see what works
            scope_tests = {
                "conversations.list": False,
                "conversations.history": False,
                "users.conversations": False,
                "users.list": False,
                "channels.history": False,
                "groups.history": False
            }
            
            # Test conversations.list
            try:
                response = await client.get("https://slack.com/api/conversations.list", headers=headers, params={"limit": 1})
                result = response.json()
                scope_tests["conversations.list"] = result.get("ok", False)
                if not scope_tests["conversations.list"]:
                    scope_tests["conversations.list"] = f"Error: {result.get('error', 'Unknown')}"
            except Exception as e:
                scope_tests["conversations.list"] = f"Exception: {str(e)}"
            
            # Test conversations.history (need a channel first)
            if scope_tests["conversations.list"] is True:
                try:
                    # Get a channel to test history
                    channels_response = await client.get("https://slack.com/api/conversations.list", headers=headers, params={"limit": 1})
                    channels_result = channels_response.json()
                    if channels_result.get("ok") and channels_result.get("channels"):
                        channel_id = channels_result["channels"][0]["id"]
                        
                        response = await client.get("https://slack.com/api/conversations.history", headers=headers, params={"channel": channel_id, "limit": 1})
                        result = response.json()
                        scope_tests["conversations.history"] = result.get("ok", False)
                        if not scope_tests["conversations.history"]:
                            scope_tests["conversations.history"] = f"Error: {result.get('error', 'Unknown')}"
                except Exception as e:
                    scope_tests["conversations.history"] = f"Exception: {str(e)}"
            
            # Test users.conversations
            if auth_result.get("ok") and auth_result.get("user_id"):
                user_id = auth_result["user_id"]
                try:
                    response = await client.get("https://slack.com/api/users.conversations", headers=headers, params={"user": user_id, "limit": 1})
                    result = response.json()
                    scope_tests["users.conversations"] = result.get("ok", False)
                    if not scope_tests["users.conversations"]:
                        scope_tests["users.conversations"] = f"Error: {result.get('error', 'Unknown')}"
                except Exception as e:
                    scope_tests["users.conversations"] = f"Exception: {str(e)}"
            
            return {
                "auth_info": auth_result,
                "scope_tests": scope_tests,
                "integration_info": {
                    "token_source": integration.token_source,
                    "workspace_id": integration.workspace_id,
                    "created_at": integration.created_at.isoformat()
                }
            }
        
    except Exception as e:
        return {"error": f"Failed to check scopes: {str(e)}"}

@router.post("/test")
async def test_slack_integration(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Test Slack integration permissions and connectivity.
    """
    integration = db.query(SlackIntegration).filter(
        SlackIntegration.user_id == current_user.id
    ).first()
    
    if not integration or not integration.slack_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Slack integration not found"
        )
    
    try:
        # Decrypt token
        access_token = decrypt_token(integration.slack_token)
        
        # Test permissions
        permissions = await slack_integration_oauth.test_permissions(access_token)
        
        # Get auth info
        auth_info = await slack_integration_oauth.test_auth(access_token)

        # Get user info (only if slack_user_id exists)
        user_profile = {}
        if integration.slack_user_id:
            try:
                user_info = await slack_integration_oauth.get_user_info(access_token, integration.slack_user_id)
                user_profile = user_info.get("user", {}).get("profile", {})
            except Exception as user_err:
                logger.warning(f"Could not fetch user info: {user_err}")
        
        return {
            "success": True,
            "integration": {
                "slack_user_id": integration.slack_user_id,
                "workspace_id": integration.workspace_id,
                "connected_at": integration.created_at.isoformat(),
                "last_updated": integration.updated_at.isoformat()
            },
            "permissions": permissions,
            "workspace_info": {
                "team_id": auth_info.get("team_id"),
                "team_name": auth_info.get("team"),
                "url": auth_info.get("url")
            },
            "user_info": {
                "user_id": integration.slack_user_id,
                "name": user_profile.get("real_name") or user_profile.get("display_name"),
                "email": user_profile.get("email"),
                "title": user_profile.get("title"),
                "timezone": user_profile.get("tz")
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to test Slack integration: {str(e)}"
        )

@router.get("/status")
async def get_slack_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get Slack OAuth integration status for current user.
    Only checks SlackWorkspaceMapping (OAuth setup).
    """
    logger.debug(f"Checking Slack status for user {current_user.id} (org: {current_user.organization_id})")

    workspace_mapping = get_active_workspace_mapping(db, current_user)
    if not workspace_mapping:
        return {
            "connected": False,
            "integration": None
        }

    # OAuth SlackWorkspaceMapping
    workspace_name = workspace_mapping.workspace_name
    if not workspace_name:
        logger.debug(f"OAuth workspace {workspace_mapping.workspace_id} has no name in database")

    # Get owner user details
    owner_user = db.query(User).filter(User.id == workspace_mapping.owner_user_id).first()
    owner_name = owner_user.name if owner_user and owner_user.name else owner_user.email if owner_user else "Unknown"

    # Count synced users (those with slack_user_id in this organization)
    from ...models.user_correlation import UserCorrelation
    # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
    synced_users_count = db.query(UserCorrelation).filter(
        UserCorrelation.organization_id == current_user.organization_id,
        UserCorrelation.organization_id.isnot(None),
        UserCorrelation.user_id.is_(None),  # Team roster only
        UserCorrelation.slack_user_id.isnot(None)
    ).count()

    return {
        "connected": True,
        "integration": {
            "id": workspace_mapping.id,
            "slack_user_id": None,  # Not stored in workspace mapping
            "workspace_id": workspace_mapping.workspace_id,
            "workspace_name": workspace_name or workspace_mapping.workspace_id,  # Fallback to ID
            "token_source": "oauth",
            "is_oauth": True,
            "supports_refresh": False,
            "has_webhook": False,
            "webhook_configured": False,
            "connected_at": workspace_mapping.registered_at.isoformat(),
            "last_updated": workspace_mapping.registered_at.isoformat(),
            "total_channels": 0,
            "channel_names": [],
            "token_preview": None,
            "webhook_preview": None,
            "connection_type": "oauth",
            "status": workspace_mapping.status,
            "owner_user_id": workspace_mapping.owner_user_id,
            "owner_name": owner_name,
            "synced_users_count": synced_users_count,
            # Feature flags for OAuth integrations
            "survey_enabled": workspace_mapping.survey_enabled if hasattr(workspace_mapping, 'survey_enabled') else False,
            "granted_scopes": workspace_mapping.granted_scopes if hasattr(workspace_mapping, 'granted_scopes') else None
        }
    }

class FeatureToggleRequest(BaseModel):
    feature: str  # 'survey' or 'communication_patterns'
    enabled: bool

@router.post("/features/toggle")
async def toggle_slack_feature(
    request: FeatureToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle a Slack feature (survey or communication patterns analysis) for the workspace.
    Only works for OAuth-based integrations.
    Requires: admin role.
    """
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=403,
            detail="Only admins can toggle Slack features"
        )

    try:
        workspace_mapping = get_active_workspace_mapping(db, current_user)
        if not workspace_mapping:
            raise HTTPException(
                status_code=404,
                detail="No OAuth Slack workspace found for your account"
            )

        if request.feature not in ['survey']:
            raise HTTPException(
                status_code=400,
                detail="Invalid feature name. Must be 'survey'"
            )

        workspace_mapping.survey_enabled = request.enabled
        logger.info(f"User {current_user.id} toggled survey to {request.enabled} for workspace {workspace_mapping.workspace_id}")

        db.commit()

        # Send notification to org admins (only if workspace has an organization)
        if workspace_mapping.organization_id:
            notification_service = NotificationService(db)
            notification_service.create_slack_feature_toggle_notification(
                toggled_by=current_user,
                feature=request.feature,
                enabled=request.enabled,
                organization_id=workspace_mapping.organization_id
            )

        return {
            "success": True,
            "feature": request.feature,
            "enabled": request.enabled,
            "workspace_id": workspace_mapping.workspace_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling Slack feature: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to toggle feature: {str(e)}"
        )

@router.delete("/disconnect")
async def disconnect_slack(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Disconnect Slack OAuth integration by deactivating the workspace mapping.
    This keeps the data but marks the workspace as inactive.
    Requires: admin role.
    """
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=403,
            detail="Only admins can disconnect Slack"
        )

    try:
        workspace_mapping = get_active_workspace_mapping(db, current_user)
        if not workspace_mapping:
            raise HTTPException(
                status_code=404,
                detail="No active Slack workspace found for your account"
            )

        # Store workspace name before marking inactive
        workspace_name = workspace_mapping.workspace_name
        organization_id = workspace_mapping.organization_id

        # Mark as inactive instead of deleting (preserves historical data)
        workspace_mapping.status = 'inactive'

        # Disable survey schedule for this organization
        from ...models.survey_schedule import SurveySchedule
        if organization_id:
            survey_schedule = db.query(SurveySchedule).filter(
                SurveySchedule.organization_id == organization_id
            ).first()
            if survey_schedule:
                survey_schedule.enabled = False
                logger.info(f"Disabled survey schedule for org {organization_id} due to Slack disconnection")

        db.commit()

        # Invalidate validation cache so error doesn't persist
        from ...services.integration_validator import invalidate_validation_cache
        invalidate_validation_cache(current_user.id)

        # Reload scheduler to remove scheduled jobs for this org
        try:
            from ..services.survey_scheduler import survey_scheduler
            if survey_scheduler:
                survey_scheduler.schedule_organization_surveys(db)
                logger.info(f"Reloaded scheduler after disabling surveys for org {organization_id}")
        except Exception as e:
            logger.error(f"Failed to reload scheduler: {e}")
            # Continue anyway - schedule is disabled in DB

        logger.info(f"User {current_user.id} disconnected Slack workspace {workspace_mapping.workspace_id}")

        # Notify all org members about disconnection
        notification_service = NotificationService(db)
        notification_service.create_slack_disconnected_notification(current_user, workspace_name)

        return {
            "success": True,
            "message": "Slack workspace disconnected successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting Slack: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to disconnect Slack: {str(e)}"
        )

@router.post("/sync-user-ids")
async def sync_slack_user_ids(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch Slack workspace members and sync their Slack user IDs to UserCorrelation records.
    Matches by email address.
    """
    logger.debug(f"Sync Slack user IDs request from user {current_user.id}")

    workspace_mapping = get_active_workspace_mapping(db, current_user)
    if not workspace_mapping:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active Slack workspace connection found for your organization"
        )

    # Get the bot token from SlackIntegration
    slack_integration = db.query(SlackIntegration).filter(
        SlackIntegration.workspace_id == workspace_mapping.workspace_id
    ).first()

    if not slack_integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Slack bot token not found"
        )

    try:
        access_token = decrypt_token(slack_integration.slack_token)
    except Exception as e:
        logger.error(f"Failed to decrypt Slack token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt Slack token"
        )

    # Fetch Slack workspace members
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://slack.com/api/users.list",
                headers={"Authorization": f"Bearer {access_token}"}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Slack API returned status {response.status_code}"
                )

            data = response.json()
            logger.debug(f"Slack API response: ok={data.get('ok')}, error={data.get('error')}")
            if not data.get("ok"):
                error = data.get("error", "unknown")
                logger.error(f"Slack API returned error: {error}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Slack API error: {error}"
                )

            members = data.get("members", [])
            logger.debug(f"Fetched {len(members)} Slack workspace members")

            # Build email -> slack_user_id mapping (exclude deleted/bots, require email)
            email_to_slack_id = {
                member.get("profile", {}).get("email", "").lower(): member.get("id")
                for member in members
                if not member.get("deleted")
                and not member.get("is_bot")
                and member.get("profile", {}).get("email")
                and member.get("id")
            }

            logger.debug(f"Built mapping for {len(email_to_slack_id)} Slack users with emails")

            # DEBUG: Log current user and org info
            logger.info(f"🔍 SLACK_SYNC_DEBUG: Current user: {current_user.email}, org_id: {current_user.organization_id}")

            # DEBUG: Log sample of Slack emails
            slack_emails = list(email_to_slack_id.keys())[:5]
            logger.info(f"🔍 SLACK_SYNC_DEBUG: Sample Slack emails: {slack_emails}")

            # Update correlations for team members only (user_id=NULL)
            # Match by organization + email to support team roster
            # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
            # Only match team members (user_id IS NULL), not personal correlations
            correlations = db.query(UserCorrelation).filter(
                UserCorrelation.organization_id == current_user.organization_id,
                UserCorrelation.organization_id.isnot(None),
                UserCorrelation.user_id.is_(None),  # Only team members, not personal correlations
                UserCorrelation.email.in_(list(email_to_slack_id.keys()))
            ).all()

            # DEBUG: Log found correlations
            logger.info(f"🔍 SLACK_SYNC_DEBUG: Found {len(correlations)} user_correlations to match")
            if len(correlations) > 0:
                sample_emails = [c.email for c in correlations[:5]]
                logger.info(f"🔍 SLACK_SYNC_DEBUG: Sample correlation emails: {sample_emails}")

            # DEBUG: Check if current user is in correlations
            current_user_correlation = next((c for c in correlations if c.email.lower() == current_user.email.lower()), None)
            if current_user_correlation:
                logger.info(f"✅ SLACK_SYNC_DEBUG: Current user {current_user.email} found in correlations")
            else:
                logger.warning(f"⚠️ SLACK_SYNC_DEBUG: Current user {current_user.email} NOT in correlations")
                # Check if current user is in Slack
                if current_user.email.lower() in email_to_slack_id:
                    logger.warning(f"⚠️ SLACK_SYNC_DEBUG: But current user IS in Slack with ID: {email_to_slack_id[current_user.email.lower()]}")
                else:
                    logger.warning(f"⚠️ SLACK_SYNC_DEBUG: Current user NOT in Slack either")

            updated_count = 0
            for correlation in correlations:
                slack_id = email_to_slack_id.get(correlation.email.lower())
                if slack_id:
                    correlation.slack_user_id = slack_id
                    updated_count += 1
                    logger.info(f"✅ SLACK_SYNC_MATCH: {mask_email(correlation.email)} -> {slack_id}")
                else:
                    logger.warning(f"⚠️ SLACK_SYNC_NOMATCH: {mask_email(correlation.email)} not found in Slack")

            db.commit()

            return {
                "success": True,
                "message": f"Synced Slack user IDs for {updated_count} users",
                "stats": {
                    "total_slack_members": len(members),
                    "members_with_email": len(email_to_slack_id),
                    "user_correlations": len(correlations),
                    "updated": updated_count,
                    "skipped": len(correlations) - updated_count
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Failed to sync Slack user IDs: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync Slack user IDs: {str(e)}"
        )


# Survey-related models and endpoints
class SlackSurveySubmission(BaseModel):
    """Model for Slack burnout survey submissions."""
    analysis_id: int
    user_email: str
    feeling_score: int  # 1-5 scale: How user is feeling (1=struggling, 5=very good)
    workload_score: int  # 1-5 scale: How manageable workload feels (1=overwhelming, 5=very manageable)
    stress_factors: list[str]  # Array of stress factors
    personal_circumstances: str = None  # 'significantly', 'somewhat', 'no', 'prefer_not_say'
    additional_comments: str = ""
    is_anonymous: bool = False


class SlackModalPayload(BaseModel):
    """Model for Slack modal interaction payloads."""
    trigger_id: str
    user_id: str
    team_id: str
    user_email: str = ""


@router.get("/slack-users")
async def get_slack_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get list of Slack workspace members for user mapping interface.
    Returns user IDs, names, and emails.
    """
    logger.info(f"🔍 SLACK_USERS_ENDPOINT: Request from user {current_user.id}, email={current_user.email}, org_id={current_user.organization_id}")

    workspace_mapping = get_active_workspace_mapping(db, current_user)
    if not workspace_mapping:
        logger.warning(f"❌ SLACK_USERS_ENDPOINT: No workspace mapping found for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active Slack workspace connection found"
        )

    logger.info(f"✅ SLACK_USERS_ENDPOINT: Found workspace mapping, workspace_id={workspace_mapping.workspace_id}")

    # Get the bot token from SlackIntegration
    slack_integration = db.query(SlackIntegration).filter(
        SlackIntegration.workspace_id == workspace_mapping.workspace_id
    ).first()

    if not slack_integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Slack bot token not found"
        )

    try:
        access_token = decrypt_token(slack_integration.slack_token)

        # Validate decrypted token format
        if not access_token or not isinstance(access_token, str):
            logger.error("Decrypted token is empty or invalid type")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid Slack token format"
            )

        if not access_token.startswith(("xoxb-", "xoxp-")):
            logger.error("Decrypted token has invalid format (expected xoxb- or xoxp- prefix)")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid Slack token format"
            )

        logger.info("✅ SLACK_USERS_ENDPOINT: Token decrypted and validated successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to decrypt Slack token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt Slack token"
        )

    # Check cache first to avoid rate limiting
    # Validate workspace_id for cache key (should be alphanumeric from Slack)
    cache_key = workspace_mapping.workspace_id
    if not cache_key or not isinstance(cache_key, str) or len(cache_key) > 100:
        logger.error(f"Invalid workspace_id for cache key: {cache_key}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid workspace configuration"
        )

    now = datetime.now(timezone.utc)

    if cache_key in _slack_users_cache:
        cached_time, cached_users = _slack_users_cache[cache_key]
        age_seconds = (now - cached_time).total_seconds()

        if age_seconds < CACHE_TTL_SECONDS:
            logger.info(f"🎯 SLACK_USERS_CACHE_HIT: Returning cached data (age: {int(age_seconds)}s)")
            return {"users": cached_users}
        else:
            logger.info(f"⏰ SLACK_USERS_CACHE_EXPIRED: Cache expired (age: {int(age_seconds)}s), fetching fresh data")
    else:
        logger.info(f"🔄 SLACK_USERS_CACHE_MISS: No cache found, fetching from Slack API")

    # Fetch Slack workspace members
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://slack.com/api/users.list",
                headers={"Authorization": f"Bearer {access_token}"}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Slack API returned status {response.status_code}"
                )

            data = response.json()
            if not data.get("ok"):
                error = data.get("error", "unknown")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Slack API error: {error}"
                )

            members = data.get("members", [])
            logger.info(f"📥 SLACK_USERS_ENDPOINT: Fetched {len(members)} total members from Slack API")

            # Format users for frontend
            slack_users = []
            for member in members:
                if not member.get("deleted") and not member.get("is_bot"):
                    profile = member.get("profile", {})
                    slack_users.append({
                        "id": member.get("id"),
                        "name": profile.get("real_name") or profile.get("display_name") or member.get("name"),
                        "email": profile.get("email"),
                        "avatar": profile.get("image_72")
                    })

            logger.info(f"✅ SLACK_USERS_ENDPOINT: Returning {len(slack_users)} active non-bot Slack users")

            # Log sample for debugging
            if slack_users:
                sample = slack_users[:3]
                logger.info(f"📋 SLACK_USERS_ENDPOINT: Sample users: {[(u['name'], u['email']) for u in sample]}")

            # Store in cache to avoid rate limiting
            _slack_users_cache[cache_key] = (now, slack_users)
            logger.info(f"💾 SLACK_USERS_CACHE_STORED: Cached {len(slack_users)} users for workspace {cache_key}")

            return {"users": slack_users}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching Slack users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch Slack users"
        )


@router.get("/debug/correlation")
async def debug_user_correlation(
    email: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Debug endpoint to check if a user exists in user_correlations table.
    If email not provided, checks current user's organization for all correlations.
    """
    try:
        if email:
            # Check specific email
            correlation = db.query(UserCorrelation).filter(
                UserCorrelation.email == email.lower()
            ).first()

            if correlation:
                return {
                    "found": True,
                    "email": correlation.email,
                    "name": correlation.name,
                    "slack_user_id": correlation.slack_user_id,
                    "github_username": correlation.github_username,
                    "rootly_email": correlation.rootly_email,
                    "pagerduty_user_id": correlation.pagerduty_user_id,
                    "user_id": correlation.user_id,
                    "created_at": correlation.created_at.isoformat() if correlation.created_at else None
                }
            else:
                return {
                    "found": False,
                    "email": email,
                    "message": f"No user_correlation found for {email}"
                }
        else:
            # Show all correlations for current user's organization
            # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
            correlations = db.query(UserCorrelation).filter(
                UserCorrelation.organization_id == current_user.organization_id,
                UserCorrelation.organization_id.isnot(None)
            ).all()

            return {
                "total_correlations": len(correlations),
                "correlations": [
                    {
                        "email": c.email,
                        "name": c.name,
                        "slack_user_id": c.slack_user_id,
                        "github_username": c.github_username
                    }
                    for c in correlations
                ]
            }

    except Exception as e:
        logging.error(f"Error debugging correlation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}"
        )


@router.get("/user/me")
async def get_slack_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user's Slack information including email.
    Useful for debugging user correlation issues.
    """
    try:
        # Get user's Slack integration
        slack_integration = db.query(SlackIntegration).filter(
            SlackIntegration.user_id == current_user.id
        ).first()

        if not slack_integration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No Slack integration found. Please connect Slack first."
            )

        # Decrypt token
        slack_token = decrypt_token(slack_integration.slack_token)

        # Call Slack API to get user info
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://slack.com/api/users.info",
                params={"user": slack_integration.slack_user_id},
                headers={"Authorization": f"Bearer {slack_token}"}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to fetch Slack user info"
                )

            data = response.json()

            if not data.get("ok"):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Slack API error: {data.get('error', 'Unknown error')}"
                )

            user_info = data.get("user", {})
            profile = user_info.get("profile", {})

            return {
                "slack_user_id": slack_integration.slack_user_id,
                "workspace_id": slack_integration.workspace_id,
                "real_name": user_info.get("real_name"),
                "display_name": profile.get("display_name"),
                "email": profile.get("email"),  # This is what you need!
                "is_admin": user_info.get("is_admin"),
                "is_owner": user_info.get("is_owner")
            }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching Slack user info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching Slack user info: {str(e)}"
        )


@router.post("/commands/oncall-health")
async def handle_oncall_health_command(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Handle /oncall-health slash command from Slack.
    Opens a modal with the 3-question burnout survey.
    """
    await verify_slack_request_signature(request)
    form = await request.form()
    token = str(form.get("token", ""))
    team_id = str(form.get("team_id", ""))
    team_domain = str(form.get("team_domain", ""))
    channel_id = str(form.get("channel_id", ""))
    channel_name = str(form.get("channel_name", ""))
    user_id = str(form.get("user_id", ""))
    user_name = str(form.get("user_name", ""))
    command = str(form.get("command", ""))
    text = str(form.get("text", ""))
    response_url = str(form.get("response_url", ""))
    trigger_id = str(form.get("trigger_id", ""))

    try:
        # Log incoming slash command for debugging
        logger.info(f"🎯 Slash command received: /oncall-health from user {user_id} in workspace {team_id}")
        logger.debug(f"Command details - trigger_id: {trigger_id}, channel: {channel_id}, text: '{text}'")

        # Extract user info from Slack command form data
        # user_id, trigger_id, team_id are already available as form parameters

        if not user_id or not trigger_id:
            logger.error("Missing user_id or trigger_id in slash command")
            return {"text": "⚠️ Sorry, there was an error processing your request. Please try again."}

        # Find workspace mapping to get organization
        workspace_mapping = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.workspace_id == team_id,
            SlackWorkspaceMapping.status == 'active'
        ).first()

        if not workspace_mapping:
            return {
                "text": "⚠️ This Slack workspace is not registered with any organization. Please ask your admin to connect this workspace through the dashboard.",
                "response_type": "ephemeral"
            }

        # Get organization
        organization = workspace_mapping.organization
        if not organization:
            return {
                "text": f"⚠️ Workspace is registered but not linked to an organization (mapping org_id: {workspace_mapping.organization_id}). Please contact support.",
                "response_type": "ephemeral"
            }

        if organization.status != 'active':
            return {
                "text": f"⚠️ Organization '{organization.name}' has status '{organization.status}' (needs 'active'). Please contact support.",
                "response_type": "ephemeral"
            }

        # Find the current active analysis FOR THIS ORGANIZATION (optional - surveys can be submitted without analysis)
        latest_analysis = db.query(Analysis).filter(
            Analysis.status == "completed",
            Analysis.organization_id == organization.id
        ).order_by(Analysis.created_at.desc()).first()

        # Check if user is in the organization roster (ORGANIZATION-SCOPED)
        # Use organization_id directly for multi-tenancy support
        user_correlation = db.query(UserCorrelation).filter(
            UserCorrelation.slack_user_id == user_id,
            UserCorrelation.organization_id == organization.id
        ).first()

        # If not found by slack_user_id, try to get Slack email and match by email
        if not user_correlation:
            # Try to fetch user's email from Slack API
            try:
                # Get workspace bot token from SlackIntegration
                slack_integration = db.query(SlackIntegration).filter(
                    SlackIntegration.workspace_id == team_id
                ).first()

                if slack_integration and slack_integration.slack_token:
                    import httpx
                    slack_token = decrypt_token(slack_integration.slack_token)

                    async with httpx.AsyncClient() as client:
                        response = await client.get(
                            "https://slack.com/api/users.info",
                            params={"user": user_id},
                            headers={"Authorization": f"Bearer {slack_token}"}
                        )

                        if response.status_code == 200:
                            data = response.json()
                            if data.get("ok"):
                                user_email = data.get("user", {}).get("profile", {}).get("email")

                                if user_email:
                                    # Try to find by email using organization_id for multi-tenancy
                                    user_correlation = db.query(UserCorrelation).filter(
                                        UserCorrelation.email == user_email.lower(),
                                        UserCorrelation.organization_id == organization.id
                                    ).first()

                                    # If found, update with Slack user ID for future lookups
                                    if user_correlation:
                                        user_correlation.slack_user_id = user_id
                                        db.commit()
                                        logging.info(f"Auto-populated Slack user ID for {mask_email(user_email)}")
            except Exception as e:
                logging.error(f"Error fetching Slack user email: {str(e)}")
                # Continue without Slack email lookup

        if not user_correlation:
            return {
                "text": f"👋 Hi! I couldn't find you in the {organization.name} team roster. Please ask your manager to ensure you're included in the burnout analysis.",
                "response_type": "ephemeral"
            }

        # Check for existing survey response today (match by email)
        from datetime import datetime, timezone
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        existing_report = db.query(UserBurnoutReport).filter(
            UserBurnoutReport.email == user_correlation.email,
            UserBurnoutReport.submitted_at >= today_start
        ).first()

        # Create and open interactive Slack modal
        # Pass organization_id and optional analysis_id
        modal_view = create_burnout_survey_modal(
            organization_id=organization.id,
            user_id=user_correlation.user_id,
            analysis_id=latest_analysis.id if latest_analysis else None,
            is_update=bool(existing_report)
        )

        # Get workspace bot token to open modal
        slack_integration = db.query(SlackIntegration).filter(
            SlackIntegration.workspace_id == team_id
        ).first()

        if not slack_integration or not slack_integration.slack_token:
            # Fallback to old button-based approach if no token
            survey_url = f"{settings.FRONTEND_URL}/survey?email={user_correlation.email}"
            if latest_analysis:
                survey_url += f"&analysis={latest_analysis.id}"

            return {
                "text": "📝 Opening your 2-minute burnout survey...",
                "response_type": "ephemeral",
                "attachments": [{
                    "fallback": "Burnout Survey",
                    "color": "good",
                    "actions": [{
                        "type": "button",
                        "text": "Open Survey",
                        "url": survey_url,
                        "style": "primary"
                    }]
                }]
            }

        # Open modal using Slack API
        import httpx
        slack_token = decrypt_token(slack_integration.slack_token)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://slack.com/api/views.open",
                headers={
                    "Authorization": f"Bearer {slack_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "trigger_id": trigger_id,
                    "view": modal_view
                }
            )

            result = response.json()

            if not result.get("ok"):
                logging.error(f"Failed to open modal: {result.get('error')}")
                # Fallback to button approach
                survey_url = f"{settings.FRONTEND_URL}/survey?email={user_correlation.email}"
                if latest_analysis:
                    survey_url += f"&analysis={latest_analysis.id}"

                return {
                    "text": "📝 Click below to open your burnout survey:",
                    "response_type": "ephemeral",
                    "attachments": [{
                        "fallback": "Burnout Survey",
                        "actions": [{
                            "type": "button",
                            "text": "Open Survey",
                            "url": survey_url,
                            "style": "primary"
                        }]
                    }]
                }

        # Modal opened successfully - return 200 with no body
        # Slack will show the modal, so no command response needed
        from fastapi.responses import Response
        return Response(status_code=200)

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error handling burnout survey command: {str(e)}")
        return {
            "text": "⚠️ Sorry, there was an error opening the survey. Please try again or contact your manager.",
            "response_type": "ephemeral"
        }


@router.post("/interactions")
async def handle_slack_interactions(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Handle Slack interactive component submissions (modals, buttons, etc).
    This is called when user submits the burnout survey modal.
    """
    await verify_slack_request_signature(request)
    form = await request.form()
    payload = str(form.get("payload", ""))
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Slack interaction payload"
        )

    try:
        import json
        logging.info(f"Received Slack interaction payload: {payload[:500]}...")  # Log first 500 chars
        data = json.loads(payload)
        logging.info(f"Parsed interaction type: {data.get('type')}")

        interaction_type = data.get("type")

        # Handle button clicks (e.g., "Take Survey" button from DM)
        if interaction_type == "block_actions":
            actions = data.get("actions", [])
            for action in actions:
                if action.get("action_id") == "open_burnout_survey":
                    # Extract data from button value
                    # Format: "user_id|organization_id|email" or "None|organization_id|email"
                    value = action.get("value", "")
                    try:
                        parts = value.split("|")
                        if len(parts) == 3:
                            # New format with email
                            user_id_str, organization_id_str, user_email = parts
                            try:
                                user_id = None if user_id_str == 'None' or not user_id_str else int(user_id_str)
                            except ValueError:
                                logging.error(f"Invalid user_id in button value: '{user_id_str}'")
                                return {"text": "Invalid survey data: malformed user ID"}

                            try:
                                organization_id = int(organization_id_str)
                            except ValueError:
                                logging.error(f"Invalid organization_id in button value: '{organization_id_str}'")
                                return {"text": "Invalid survey data: malformed organization ID"}
                        else:
                            # Old format (backwards compatibility)
                            # Note: This only works for old buttons that had valid integer user_ids
                            # Old broken buttons with "None" would have already failed, so no need to handle that case
                            try:
                                user_id, organization_id = map(int, parts)
                                user_email = None
                            except ValueError as e:
                                logging.error(f"Failed to parse old format button value '{value}': {e}")
                                return {"text": "Invalid survey data: button format not recognized. Please contact your manager for a new survey link."}
                    except Exception as e:
                        logging.error(f"Failed to parse button value '{value}': {e}")
                        return {"text": "Invalid survey data"}

                    # Get user's Slack ID
                    slack_user = data.get("user", {})
                    slack_user_id = slack_user.get("id")
                    trigger_id = data.get("trigger_id")

                    # Check for existing report today (match by email)
                    from datetime import datetime, timezone
                    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

                    # Try to get user account if user_id is available
                    user = None
                    if user_id:
                        user = db.query(User).filter(User.id == user_id).first()

                    # If no user account but we have email, check for existing report by email
                    existing_report = None
                    if user and user.email:
                        normalized_email = normalize_survey_email(user.email)
                        existing_report = db.query(UserBurnoutReport).filter(
                            func.lower(UserBurnoutReport.email) == normalized_email,
                            UserBurnoutReport.submitted_at >= today_start
                        ).first()
                    elif user_email:
                        normalized_email = normalize_survey_email(user_email)
                        # Synced member without user account - check by email
                        existing_report = db.query(UserBurnoutReport).filter(
                            func.lower(UserBurnoutReport.email) == normalized_email,
                            UserBurnoutReport.submitted_at >= today_start
                        ).first()

                    # Open modal
                    # For synced members without accounts, pass user_email in metadata
                    modal_view = create_burnout_survey_modal(
                        organization_id=organization_id,
                        user_id=user_id,  # Can be None for synced members
                        analysis_id=None,
                        is_update=bool(existing_report),
                        user_email=user_email  # Pass email for synced members
                    )

                    # Get Slack token to open modal
                    team_id = data.get("team", {}).get("id")
                    slack_integration = db.query(SlackIntegration).filter(
                        SlackIntegration.workspace_id == team_id
                    ).first()

                    if slack_integration and slack_integration.slack_token:
                        import httpx
                        slack_token = decrypt_token(slack_integration.slack_token)

                        async with httpx.AsyncClient() as client:
                            response = await client.post(
                                "https://slack.com/api/views.open",
                                headers={"Authorization": f"Bearer {slack_token}"},
                                json={"trigger_id": trigger_id, "view": modal_view}
                            )

                            result = response.json()
                            if not result.get("ok"):
                                logging.error(f"Failed to open modal: {result.get('error')}")
                                return {"text": "Sorry, couldn't open the survey. Please try again."}

                    # Acknowledge the button click
                    return {"response_action": "clear"}

        # Handle modal submission
        if interaction_type == "view_submission":
            view = data.get("view", {})
            callback_id = view.get("callback_id")

            if callback_id == "burnout_survey_modal":
                # Extract form values from modal
                values = view.get("state", {}).get("values", {})

                try:
                    # Question 1: How are you feeling today? (1-5 scale)
                    feeling_str = values.get("feeling_block", {}).get("feeling_input", {}).get("selected_option", {}).get("value", "okay")
                    feeling_map = {
                        "very_good": 5,
                        "good": 4,
                        "okay": 3,
                        "not_great": 2,
                        "struggling": 1
                    }
                    # Store feeling as feeling_score (1-5 scale: higher = feeling better)
                    feeling_score = feeling_map.get(feeling_str, 3)

                    # Question 2: What's having the biggest impact? (single-select)
                    stress_sources_block = values.get("stress_sources_block", {})
                    stress_sources_input = stress_sources_block.get("stress_sources_input", {})
                    selected_option = stress_sources_input.get("selected_option", {})
                    selected_value = selected_option.get("value") if selected_option else None

                    # Store as array for consistency with database schema
                    stress_factors = [selected_value] if selected_value else []

                    # Derive workload_score based on selected stress source
                    # Map stress sources to workload intensity (inverse relationship)
                    stress_intensity_map = {
                        'oncall_frequency': 2,      # High impact
                        'after_hours': 2,           # High impact
                        'incident_complexity': 3,   # Moderate impact
                        'time_pressure': 3,         # Moderate impact
                        'team_support': 2,          # High impact (lack of support)
                        'work_life_balance': 2,     # High impact
                        'personal': 4,              # Lower work impact (external)
                        'other': 3                  # Moderate impact (unknown)
                    }
                    workload_score = stress_intensity_map.get(selected_value, 5) if selected_value else 5

                    # Check if personal circumstances was selected
                    personal_circumstances = 'yes' if selected_value == 'personal' else None

                    # Get optional comments
                    comments_block = values.get("comments_block") or {}
                    comments_input = comments_block.get("comments_input")
                    comments = comments_input.get("value", "") if comments_input else ""

                    # Extract data from private_metadata
                    metadata = json.loads(view.get("private_metadata", "{}"))
                    user_id = metadata.get("user_id")
                    organization_id = metadata.get("organization_id")  # Optional now
                    analysis_id = metadata.get("analysis_id")  # Optional - may be None
                    user_email = metadata.get("user_email")  # For synced members without accounts

                    # Need either user_id or user_email
                    if not user_id and not user_email:
                        return {"response_action": "errors", "errors": {"comments_block": "Invalid survey data: missing user identification"}}
                except Exception as e:
                    logging.error(f"Error parsing survey values: {str(e)}", exc_info=True)
                    return {"response_action": "errors", "errors": {"comments_block": "Error submitting survey. Please try again."}}

                # Check if user already submitted today (within last 24 hours)
                from datetime import datetime, timedelta, timezone
                today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

                # Try to get user account if user_id is available
                user = None
                if user_id:
                    user = db.query(User).filter(User.id == user_id).first()

                # Determine email to use for report
                report_email = None
                if user and user.email:
                    report_email = normalize_survey_email(user.email)
                elif user_email:
                    # Synced member without user account
                    # Validate email format
                    if '@' not in user_email or len(user_email) < 3:
                        logging.error(f"Invalid email format: '{user_email}'")
                        return {"response_action": "errors", "errors": {"comments_block": "Invalid email format"}}
                    report_email = normalize_survey_email(user_email)
                else:
                    return {"response_action": "errors", "errors": {"comments_block": "Unable to identify user email"}}

                # Check if user already submitted today (match by email)
                # This allows only 1 survey per user per day, regardless of organization
                existing_report = db.query(UserBurnoutReport).filter(
                    func.lower(UserBurnoutReport.email) == report_email,
                    UserBurnoutReport.submitted_at >= today_start
                ).order_by(UserBurnoutReport.submitted_at.desc()).first()

                # Extract email_domain from report_email
                email_domain = report_email.split('@')[1] if '@' in report_email else None

                is_update = False
                if existing_report:
                    # Update existing report
                    existing_report.feeling_score = feeling_score
                    existing_report.workload_score = workload_score
                    existing_report.stress_factors = stress_factors
                    existing_report.personal_circumstances = personal_circumstances
                    existing_report.additional_comments = comments
                    existing_report.submitted_via = 'slack'
                    if analysis_id is not None:
                        existing_report.analysis_id = analysis_id
                    if organization_id is not None:
                        existing_report.organization_id = organization_id
                    existing_report.email = report_email  # Refresh email in case it changed
                    existing_report.email_domain = email_domain  # Refresh email_domain
                    existing_report.user_id = user_id  # Update user_id if they created an account
                    existing_report.updated_at = datetime.now(timezone.utc)
                    logging.info(f"Updated existing report ID {existing_report.id} for email {report_email}")
                    is_update = True
                else:
                    # Create new burnout report
                    new_report = UserBurnoutReport(
                        user_id=user_id,  # Can be None for synced members
                        email=report_email,
                        organization_id=organization_id,
                        email_domain=email_domain,
                        analysis_id=analysis_id,  # Optional - may be None
                        feeling_score=feeling_score,
                        workload_score=workload_score,
                        stress_factors=stress_factors,
                        personal_circumstances=personal_circumstances,
                        additional_comments=comments,
                        submitted_via='slack',
                        submitted_at=datetime.now(timezone.utc)
                    )
                    db.add(new_report)
                    logging.info(f"Created new report for email {report_email} (user_id={user_id})")

                db.commit()

                # Notify org admins about survey submission (only for new submissions, not updates)
                # Only send notifications if the submitter has a User account
                if not is_update and user:
                    try:
                        notification_service = NotificationService(db)
                        if analysis_id:
                            # Get analysis for notification context
                            analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
                            if analysis:
                                notification_service.create_survey_submitted_notification(
                                    user=user,
                                    organization_id=organization_id,
                                    analysis=analysis
                                )
                                logging.info(f"Created survey submission notifications for org {organization_id}")
                        else:
                            # No analysis_id - still notify admins
                            notification_service.create_survey_submitted_notification(
                                user=user,
                                organization_id=organization_id,
                                analysis=None
                            )
                            logging.info(f"Created survey submission notifications for org {organization_id} (no analysis)")
                    except Exception as e:
                        logging.error(f"Failed to create survey submission notifications: {str(e)}")
                        # Don't fail the survey submission if notification fails
                elif not is_update and not user:
                    logging.info(f"Skipping notification for synced member without User account (email={report_email})")

                # Return success response with different message for updates
                if is_update:
                    success_message = "*Check-in updated successfully*\n\n_You already submitted today. Your response has been updated._\n\nYour feedback helps us:\n• Monitor team well-being\n• Identify workload issues early\n• Support a healthier on-call experience\n\nThank you for contributing to a healthier team."
                else:
                    success_message = "*Check-in submitted successfully*\n\nYour feedback helps us:\n• Monitor team well-being\n• Identify workload issues early\n• Support a healthier on-call experience\n\nThank you for contributing to a healthier team."

                return {
                    "response_action": "update",
                    "view": {
                        "type": "modal",
                        "title": {"type": "plain_text", "text": "Thank You"},
                        "close": {"type": "plain_text", "text": "Close"},
                        "blocks": [
                            {
                                "type": "section",
                                "text": {
                                    "type": "mrkdwn",
                                    "text": success_message
                                }
                            }
                        ]
                    }
                }

        # For other interaction types, just acknowledge
        return {}

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error handling Slack interaction: {str(e)}")
        import traceback
        logging.error(f"Traceback: {traceback.format_exc()}")
        return {
            "response_action": "errors",
            "errors": {
                "comments_block": "Error submitting survey. Please try again."
            }
        }


@router.post("/survey/submit")
async def submit_slack_burnout_survey(
    submission: SlackSurveySubmission,
    db: Session = Depends(get_db)
):
    """
    Submit burnout survey response from Slack.
    """
    try:
        # Find the user by email
        report_email = normalize_survey_email(submission.user_email)
        user_correlation = db.query(UserCorrelation).filter(
            func.lower(UserCorrelation.email) == report_email
        ).first()

        if not user_correlation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found in team roster"
            )

        # Validate analysis exists
        analysis = db.query(Analysis).filter(
            Analysis.id == submission.analysis_id
        ).first()

        if not analysis:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Analysis not found"
            )

        today_start, _ = get_utc_day_bounds()

        # One Slack survey response per person per day, regardless of which
        # analysis/token/org path they came from.
        existing_report = db.query(UserBurnoutReport).filter(
            func.lower(UserBurnoutReport.email) == report_email,
            UserBurnoutReport.submitted_at >= today_start
        ).order_by(UserBurnoutReport.submitted_at.desc()).first()

        # Get user for email_domain
        user = db.query(User).filter(User.id == user_correlation.user_id).first()
        email_domain = user.email_domain if user else None

        if existing_report:
            existing_report.user_id = user_correlation.user_id
            existing_report.email = report_email
            existing_report.organization_id = analysis.organization_id
            existing_report.email_domain = email_domain
            if submission.analysis_id is not None:
                existing_report.analysis_id = submission.analysis_id
            existing_report.feeling_score = submission.feeling_score
            existing_report.workload_score = submission.workload_score
            existing_report.stress_factors = submission.stress_factors
            existing_report.personal_circumstances = submission.personal_circumstances
            existing_report.additional_comments = submission.additional_comments
            existing_report.submitted_via = 'slack'
            existing_report.is_anonymous = submission.is_anonymous
            db.commit()
            db.refresh(existing_report)
            report = existing_report
        else:
            report = UserBurnoutReport(
                user_id=user_correlation.user_id,
                email=report_email,
                organization_id=analysis.organization_id,
                email_domain=email_domain,
                analysis_id=submission.analysis_id,
                feeling_score=submission.feeling_score,
                workload_score=submission.workload_score,
                stress_factors=submission.stress_factors,
                personal_circumstances=submission.personal_circumstances,
                additional_comments=submission.additional_comments,
                submitted_via='slack',
                is_anonymous=submission.is_anonymous
            )

            db.add(report)
            db.commit()
            db.refresh(report)

        return {
            "success": True,
            "message": "Survey submitted successfully!",
            "report_id": report.id,
            "submitted_at": report.submitted_at.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Error submitting burnout survey: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit survey"
        )


@router.get("/survey/status/{analysis_id}")
async def get_team_survey_status(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get team survey response status for an analysis (manager view).
    """
    try:
        # Validate analysis exists and belongs to current user
        analysis = db.query(Analysis).filter(
            Analysis.id == analysis_id,
            Analysis.user_id == current_user.id
        ).first()

        if not analysis:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Analysis not found"
            )

        # Get team members from the analysis results. A scheduled survey response
        # should count anywhere this member appears, not only on a single
        # analysis_id-linked report row.
        team_members = extract_analysis_member_emails(analysis.results)
        today_start, _ = get_utc_day_bounds()

        survey_responses = []
        if team_members:
            raw_responses = db.query(UserBurnoutReport).filter(
                or_(
                    UserBurnoutReport.analysis_id == analysis_id,
                    (
                        func.lower(UserBurnoutReport.email).in_(team_members) &
                        (UserBurnoutReport.submitted_at >= today_start)
                    )
                )
            ).order_by(
                UserBurnoutReport.email.asc(),
                UserBurnoutReport.submitted_at.desc()
            ).all()

            responses_by_email = {}
            for response in raw_responses:
                normalized_email = normalize_survey_email(response.email)
                if normalized_email and normalized_email not in responses_by_email:
                    responses_by_email[normalized_email] = response
            survey_responses = list(responses_by_email.values())

        # Calculate response statistics
        total_members = len(team_members)
        responses_collected = len(survey_responses)
        response_rate = (responses_collected / total_members * 100) if total_members > 0 else 0

        # Identify non-responders (use email from survey response directly)
        responded_emails = {
            normalize_survey_email(response.email)
            for response in survey_responses
            if response.email
        }

        non_responders = [email for email in team_members if email not in responded_emails]

        return {
            "analysis_id": analysis_id,
            "total_members": total_members,
            "responses_collected": responses_collected,
            "response_rate": round(response_rate, 1),
            "non_responders": non_responders,
            "survey_responses": [
                {
                    "user_email": response.email,
                    "feeling_score": response.feeling_score,
                    "workload_score": response.workload_score,
                    "stress_factors": response.stress_factors,
                    "submitted_at": response.submitted_at.isoformat(),
                    "submitted_via": response.submitted_via,
                    "is_anonymous": response.is_anonymous
                }
                for response in survey_responses
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting survey status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get survey status"
        )


def create_burnout_survey_modal(organization_id: int, user_id: int, analysis_id: int = None, is_update: bool = False, user_email: str = None) -> dict:
    """
    Create Slack modal view for burnout survey.

    Args:
        organization_id: Organization ID (required)
        user_id: User ID (can be None for synced members without accounts)
        analysis_id: Analysis ID (optional - for linking survey to specific analysis)
        is_update: Whether this is updating an existing survey today
        user_email: User email (required if user_id is None)
    """
    import json

    # Store metadata to be retrieved on submission
    metadata = {
        "user_id": user_id,
        "organization_id": organization_id,
        "user_email": user_email,  # Store email for synced members
        "analysis_id": analysis_id
    }

    modal_title = "Update Check-in" if is_update else "On-Call Health Check-in"
    intro_text = "*Update your health check-in*\n\nYou already submitted today. Your previous response will be updated." if is_update else "*Quick health check-in*\n\nYour responses help improve team health and workload distribution. All responses are confidential."

    return {
        "type": "modal",
        "callback_id": "burnout_survey_modal",
        "private_metadata": json.dumps(metadata),
        "title": {
            "type": "plain_text",
            "text": modal_title,
            "emoji": True
        },
        "submit": {
            "type": "plain_text",
            "text": "Submit",
            "emoji": True
        },
        "close": {
            "type": "plain_text",
            "text": "Cancel",
            "emoji": True
        },
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": intro_text
                }
            },
            {
                "type": "divider"
            },
            {
                "type": "input",
                "block_id": "feeling_block",
                "element": {
                    "type": "static_select",
                    "action_id": "feeling_input",
                    "placeholder": {
                        "type": "plain_text",
                        "text": "Select how you're feeling"
                    },
                    "options": [
                        {"text": {"type": "plain_text", "text": "Very good"}, "value": "very_good"},
                        {"text": {"type": "plain_text", "text": "Good"}, "value": "good"},
                        {"text": {"type": "plain_text", "text": "Okay"}, "value": "okay"},
                        {"text": {"type": "plain_text", "text": "Not great"}, "value": "not_great"},
                        {"text": {"type": "plain_text", "text": "Struggling"}, "value": "struggling"}
                    ]
                },
                "label": {
                    "type": "plain_text",
                    "text": "How are you feeling today?"
                }
            },
            {
                "type": "input",
                "block_id": "stress_sources_block",
                "element": {
                    "type": "static_select",
                    "action_id": "stress_sources_input",
                    "placeholder": {
                        "type": "plain_text",
                        "text": "Select one"
                    },
                    "options": [
                        {"text": {"type": "plain_text", "text": "On-call frequency"}, "value": "oncall_frequency"},
                        {"text": {"type": "plain_text", "text": "After-hours incidents"}, "value": "after_hours"},
                        {"text": {"type": "plain_text", "text": "Incident complexity"}, "value": "incident_complexity"},
                        {"text": {"type": "plain_text", "text": "Time pressure"}, "value": "time_pressure"},
                        {"text": {"type": "plain_text", "text": "Team support"}, "value": "team_support"},
                        {"text": {"type": "plain_text", "text": "Work-life balance"}, "value": "work_life_balance"},
                        {"text": {"type": "plain_text", "text": "Personal"}, "value": "personal"},
                        {"text": {"type": "plain_text", "text": "Other"}, "value": "other"}
                    ]
                },
                "label": {
                    "type": "plain_text",
                    "text": "What's having the biggest impact on you right now?"
                },
                "optional": True
            },
            {
                "type": "input",
                "block_id": "comments_block",
                "element": {
                    "type": "plain_text_input",
                    "action_id": "comments_input",
                    "placeholder": {
                        "type": "plain_text",
                        "text": "Share any additional context (optional)"
                    },
                    "multiline": True
                },
                "label": {
                    "type": "plain_text",
                    "text": "Would you like to share any additional context?"
                },
                "optional": True
            }
        ]
    }


@router.get("/workspace/status")
async def get_workspace_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Diagnostic endpoint to check Slack workspace registration status.
    Returns detailed information about workspace mappings and integrations.
    """
    try:
        from ...models import Organization

        # Check for workspace mappings
        workspace_mappings = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.owner_user_id == current_user.id
        ).all()

        # Check for user's Slack integrations
        slack_integrations = db.query(SlackIntegration).filter(
            SlackIntegration.user_id == current_user.id
        ).all()

        # Check for organization-level mappings
        org_mappings = []
        if current_user.organization_id:
            # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
            org_mappings = db.query(SlackWorkspaceMapping).filter(
                SlackWorkspaceMapping.organization_id == current_user.organization_id,
                SlackWorkspaceMapping.organization_id.isnot(None)
            ).all()

        # Check organization status
        organization_info = None
        if current_user.organization_id:
            org = db.query(Organization).filter(
                Organization.id == current_user.organization_id
            ).first()
            if org:
                organization_info = {
                    "id": org.id,
                    "name": org.name,
                    "status": org.status if hasattr(org, 'status') else "unknown"
                }

        return {
            "user_workspace_mappings": [
                {
                    "workspace_id": m.workspace_id,
                    "workspace_name": m.workspace_name,
                    "organization_id": m.organization_id,
                    "status": m.status,
                    "created_at": m.registered_at.isoformat() if m.registered_at else None
                }
                for m in workspace_mappings
            ],
            "organization_workspace_mappings": [
                {
                    "workspace_id": m.workspace_id,
                    "workspace_name": m.workspace_name,
                    "owner_user_id": m.owner_user_id,
                    "organization_id": m.organization_id,
                    "status": m.status
                }
                for m in org_mappings
            ],
            "slack_integrations": [
                {
                    "workspace_id": si.workspace_id,
                    "token_source": si.token_source,
                    "connected_at": si.created_at.isoformat() if si.created_at else None
                }
                for si in slack_integrations
            ],
            "current_user": {
                "id": current_user.id,
                "email": current_user.email,
                "organization_id": current_user.organization_id
            },
            "organization": organization_info,
            "diagnosis": {
                "has_workspace_mapping": len(workspace_mappings) > 0 or len(org_mappings) > 0,
                "has_slack_integration": len(slack_integrations) > 0,
                "organization_exists": organization_info is not None,
                "organization_active": organization_info.get("status") == "active" if organization_info else False,
                "issue": None if (len(workspace_mappings) > 0 or len(org_mappings) > 0) else
                        "No workspace mapping found. Slack /oncall-health command will not work."
            }
        }

    except Exception as e:
        logging.error(f"Error checking workspace status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking workspace status: {str(e)}"
        )


@router.post("/workspace/register")
async def register_workspace_manual(
    workspace_id: str = Form(...),
    workspace_name: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually register a Slack workspace that wasn't properly registered during OAuth.
    This fixes the "workspace not registered" error for /oncall-health command.
    """
    try:
        # Check if workspace mapping already exists
        existing_mapping = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.workspace_id == workspace_id
        ).first()

        if existing_mapping:
            # Update existing mapping
            existing_mapping.workspace_name = workspace_name
            existing_mapping.organization_id = current_user.organization_id
            existing_mapping.status = 'active'
            # Don't set updated_at manually - SQLAlchemy handles it with onupdate
            db.commit()

            return {
                "success": True,
                "message": "Workspace mapping updated successfully",
                "mapping": {
                    "workspace_id": existing_mapping.workspace_id,
                    "workspace_name": existing_mapping.workspace_name,
                    "organization_id": existing_mapping.organization_id,
                    "status": existing_mapping.status
                }
            }
        else:
            # Create new mapping
            # Don't pass created_at/updated_at - they're auto-generated by server_default
            new_mapping = SlackWorkspaceMapping(
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                organization_id=current_user.organization_id,
                owner_user_id=current_user.id,
                status='active'
            )
            db.add(new_mapping)
            db.commit()

            return {
                "success": True,
                "message": "Workspace registered successfully! /oncall-health command should now work.",
                "mapping": {
                    "workspace_id": new_mapping.workspace_id,
                    "workspace_name": new_mapping.workspace_name,
                    "organization_id": new_mapping.organization_id,
                    "status": new_mapping.status
                }
            }

    except Exception as e:
        db.rollback()
        logging.error(f"Error registering workspace: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error registering workspace: {str(e)}"
        )
