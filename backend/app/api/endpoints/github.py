"""
GitHub integration API endpoints for OAuth and data collection.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any
import secrets
import json
import os
import logging
from cryptography.fernet import Fernet
import base64
from datetime import datetime
from pydantic import BaseModel

from ...models import get_db, User, GitHubIntegration, UserCorrelation
from ...auth.dependencies import get_current_user
from ...auth.integration_oauth import github_integration_oauth
from ...core.config import settings

router = APIRouter(prefix="/github", tags=["github-integration"])
logger = logging.getLogger(__name__)

# Helper function to validate user has organization
def require_organization(user: User) -> None:
    """Raise HTTPException if user doesn't belong to an organization."""
    if not user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="You must belong to an organization to use this feature. Please contact support."
        )

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

@router.post("/connect")
async def connect_github(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initiate GitHub OAuth flow for integration.
    Returns authorization URL for frontend to redirect to.
    """
    # Check if OAuth credentials are configured
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured. Please contact your administrator to set up GitHub integration."
        )
    
    # Generate state parameter for security
    state = secrets.token_urlsafe(32)
    
    # Store state in session or database (simplified for this example)
    # In production, you'd want to store this more securely
    auth_url = github_integration_oauth.get_authorization_url(state=state)
    
    return {
        "authorization_url": auth_url,
        "state": state
    }

@router.get("/callback")
async def github_callback(
    code: str,
    state: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Handle GitHub OAuth callback and store integration.
    """
    try:
        # Exchange code for token
        token_data = await github_integration_oauth.exchange_code_for_token(code)
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get access token from GitHub"
            )
        
        # Get user info
        user_info = await github_integration_oauth.get_user_info(access_token)
        github_username = user_info.get("login")
        
        if not github_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get GitHub username"
            )
        
        # Get user's organizations
        try:
            orgs = await github_integration_oauth.get_organizations(access_token)
            org_names = [org.get("login") for org in orgs if org.get("login")]
        except Exception:
            org_names = []  # Organizations might not be accessible
        
        # Get user's emails for correlation
        try:
            emails = await github_integration_oauth.get_all_emails(access_token)
            email_addresses = [email.get("email") for email in emails]
        except Exception:
            email_addresses = []
        
        # Encrypt the token
        encrypted_token = encrypt_token(access_token)
        
        # Check if integration already exists
        existing_integration = db.query(GitHubIntegration).filter(
            GitHubIntegration.user_id == current_user.id
        ).first()
        
        if existing_integration:
            # Update existing integration
            existing_integration.github_token = encrypted_token
            existing_integration.github_username = github_username
            existing_integration.organizations = org_names
            existing_integration.token_source = "oauth"
            existing_integration.updated_at = datetime.utcnow()
            integration = existing_integration
        else:
            # Create new integration
            integration = GitHubIntegration(
                user_id=current_user.id,
                github_token=encrypted_token,
                github_username=github_username,
                organizations=org_names,
                token_source="oauth"
            )
            db.add(integration)
        
        # Update user correlations (organization-scoped for multi-tenancy)
        for email in email_addresses:
            existing_correlation = db.query(UserCorrelation).filter(
                UserCorrelation.organization_id == current_user.organization_id,
                UserCorrelation.email == email
            ).first()

            if existing_correlation:
                existing_correlation.github_username = github_username
            else:
                correlation = UserCorrelation(
                    user_id=current_user.id,
                    organization_id=current_user.organization_id,
                    email=email,
                    github_username=github_username
                )
                db.add(correlation)
        
        db.commit()
        
        return {
            "success": True,
            "message": "GitHub integration connected successfully",
            "integration": {
                "id": integration.id,
                "github_username": github_username,
                "organizations": org_names,
                "emails_connected": len(email_addresses)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect GitHub integration: {str(e)}"
        )

@router.post("/test")
async def test_github_integration(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Test GitHub integration permissions and connectivity.
    Supports both personal integrations and beta token.
    """
    # Check for personal integration first
    integration = db.query(GitHubIntegration).filter(
        GitHubIntegration.user_id == current_user.id
    ).first()
    
    access_token = None
    is_beta = False
    
    if integration and integration.github_token:
        # User has personal integration
        try:
            access_token = decrypt_token(integration.github_token)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to decrypt token: {str(e)}"
            )
    else:
        # Check for beta GitHub token from Railway
        beta_github_token = os.getenv('GITHUB_TOKEN')
        if beta_github_token:
            access_token = beta_github_token
            is_beta = True
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No GitHub integration found"
            )
    
    try:
        # Test token with GitHub API
        import httpx
        headers = {
            "Authorization": f"token {access_token}",
            "Accept": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            # Get user info
            user_response = await client.get("https://api.github.com/user", headers=headers)
            if user_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"GitHub API error: {user_response.status_code}"
                )
            
            user_info = user_response.json()
            
            # Test repository access
            repos_response = await client.get("https://api.github.com/user/repos?per_page=1", headers=headers)
            can_access_repos = repos_response.status_code == 200
            
            # Test organization access
            orgs_response = await client.get("https://api.github.com/user/orgs", headers=headers)
            can_access_orgs = orgs_response.status_code == 200
            orgs = orgs_response.json() if can_access_orgs else []
            
            # Check rate limit
            rate_limit_response = await client.get("https://api.github.com/rate_limit", headers=headers)
            rate_limit_info = rate_limit_response.json() if rate_limit_response.status_code == 200 else {}
            
            permissions = {
                "repo_access": can_access_repos,
                "org_access": can_access_orgs,
                "rate_limit": rate_limit_info.get("rate", {})
            }
        
        if is_beta:
            # Return beta token test results
            return {
                "success": True,
                "integration": {
                    "github_username": user_info.get("login"),
                    "organizations": [org.get("login") for org in orgs],
                    "token_source": "beta",
                    "is_beta": True,
                    "connected_at": datetime.now().isoformat(),
                    "last_updated": datetime.now().isoformat()
                },
                "permissions": permissions,
                "user_info": {
                    "username": user_info.get("login"),
                    "name": user_info.get("name"),
                    "public_repos": user_info.get("public_repos"),
                    "followers": user_info.get("followers"),
                    "following": user_info.get("following")
                }
            }
        else:
            # Return personal integration test results
            return {
                "success": True,
                "integration": {
                    "github_username": integration.github_username,
                    "organizations": integration.organizations,
                    "token_source": integration.token_source,
                    "is_beta": False,
                    "connected_at": integration.created_at.isoformat(),
                    "last_updated": integration.updated_at.isoformat()
                },
                "permissions": permissions,
                "user_info": {
                    "username": user_info.get("login"),
                    "name": user_info.get("name"),
                    "public_repos": user_info.get("public_repos"),
                    "followers": user_info.get("followers"),
                    "following": user_info.get("following")
                }
            }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to test GitHub integration: {str(e)}"
        )

@router.get("/status")
async def get_github_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get GitHub integration status for current user, including beta token access.
    """
    # Check for user's personal integration first
    integration = db.query(GitHubIntegration).filter(
        GitHubIntegration.user_id == current_user.id
    ).first()
    
    # Check for beta GitHub token from Railway environment
    beta_github_token = os.getenv('GITHUB_TOKEN')
    logger.info(f"Beta GitHub token check: exists={beta_github_token is not None}, length={len(beta_github_token) if beta_github_token else 0}")
    
    # If user has personal integration, return that
    if integration:
        # Get token preview
        token_preview = None
        try:
            if integration.github_token:
                decrypted_token = decrypt_token(integration.github_token)
                token_preview = f"...{decrypted_token[-4:]}" if decrypted_token else None
        except Exception:
            pass  # Token preview is optional
        
        return {
            "connected": True,
            "integration": {
                "id": integration.id,
                "github_username": integration.github_username,
                "organizations": integration.organizations,
                "token_source": integration.token_source,
                "is_oauth": integration.is_oauth,
                "supports_refresh": integration.supports_refresh,
                "connected_at": integration.created_at.isoformat(),
                "last_updated": integration.updated_at.isoformat(),
                "token_preview": token_preview,
                "is_beta": False
            }
        }
    
    # If no personal integration but beta token exists, provide beta access
    elif beta_github_token:
        try:
            # Test the beta token and get basic info
            import httpx
            headers = {
                "Authorization": f"token {beta_github_token}",
                "Accept": "application/json"
            }
            
            async with httpx.AsyncClient() as client:
                # Get user info
                user_response = await client.get("https://api.github.com/user", headers=headers)
                if user_response.status_code == 200:
                    user_info = user_response.json()
                    github_username = user_info.get("login", "beta-user")
                    
                    # Get organizations
                    try:
                        orgs_response = await client.get("https://api.github.com/user/orgs", headers=headers)
                        if orgs_response.status_code == 200:
                            orgs = orgs_response.json()
                            org_names = [org.get("login") for org in orgs if org.get("login")]
                        else:
                            org_names = []
                    except Exception:
                        org_names = []
                    
                    logger.info(f"Beta GitHub token working: {github_username}, orgs: {org_names}")
                    
                    return {
                        "connected": True,
                        "integration": {
                            "id": "beta-github",
                            "github_username": github_username,
                            "organizations": org_names,
                            "token_source": "beta",
                            "is_oauth": False,
                            "supports_refresh": False,
                            "connected_at": datetime.now().isoformat(),
                            "last_updated": datetime.now().isoformat(),
                            "token_preview": f"***{beta_github_token[-4:]}",
                            "is_beta": True
                        }
                    }
                else:
                    logger.warning(f"Beta GitHub token test failed: {user_response.status_code}")
                    
        except Exception as e:
            # Only log as warning since this is just a connection test, not critical functionality
            logger.warning(f"Beta GitHub token test failed: {str(e)[:100]}...")
    
    # No integration available
    return {
        "connected": False,
        "integration": None
    }

class TokenRequest(BaseModel):
    token: str

@router.post("/token")
async def connect_github_with_token(
    request: TokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Connect GitHub integration using a personal access token.
    """
    try:
        # Validate token by making a test API call
        headers = {
            "Authorization": f"token {request.token}",
            "Accept": "application/json"
        }
        
        # Test the token by getting user info
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get("https://api.github.com/user", headers=headers)
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid GitHub token or insufficient permissions"
                )
            
            user_info = response.json()
            github_username = user_info.get("login")
            
            if not github_username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to get GitHub username from token"
                )
            
            # Get user's organizations (optional)
            try:
                orgs_response = await client.get("https://api.github.com/user/orgs", headers=headers)
                if orgs_response.status_code == 200:
                    orgs = orgs_response.json()
                    org_names = [org.get("login") for org in orgs if org.get("login")]
                else:
                    org_names = []
            except Exception:
                org_names = []
            
            # Get user's emails for correlation (optional)
            try:
                emails_response = await client.get("https://api.github.com/user/emails", headers=headers)
                if emails_response.status_code == 200:
                    emails = emails_response.json()
                    email_addresses = [email.get("email") for email in emails if email.get("verified")]
                else:
                    email_addresses = []
            except Exception:
                email_addresses = []
        
        # Encrypt the token
        encrypted_token = encrypt_token(request.token)
        
        # Check if integration already exists
        existing_integration = db.query(GitHubIntegration).filter(
            GitHubIntegration.user_id == current_user.id
        ).first()
        
        if existing_integration:
            # Update existing integration
            existing_integration.github_token = encrypted_token
            existing_integration.github_username = github_username
            existing_integration.organizations = org_names
            existing_integration.token_source = "manual"
            existing_integration.updated_at = datetime.utcnow()
            integration = existing_integration
        else:
            # Create new integration
            integration = GitHubIntegration(
                user_id=current_user.id,
                github_token=encrypted_token,
                github_username=github_username,
                organizations=org_names,
                token_source="manual"
            )
            db.add(integration)
        
        # Update user correlations (organization-scoped for multi-tenancy)
        for email in email_addresses:
            existing_correlation = db.query(UserCorrelation).filter(
                UserCorrelation.organization_id == current_user.organization_id,
                UserCorrelation.email == email
            ).first()

            if existing_correlation:
                existing_correlation.github_username = github_username
            else:
                correlation = UserCorrelation(
                    user_id=current_user.id,
                    organization_id=current_user.organization_id,
                    email=email,
                    github_username=github_username
                )
                db.add(correlation)
        
        db.commit()
        
        return {
            "success": True,
            "message": "GitHub integration connected successfully with personal access token",
            "integration": {
                "id": integration.id,
                "github_username": github_username,
                "organizations": org_names,
                "token_source": "manual",
                "emails_connected": len(email_addresses)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect GitHub integration: {str(e)}"
        )

@router.delete("/disconnect")
async def disconnect_github(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Disconnect GitHub integration for current user.
    """
    integration = db.query(GitHubIntegration).filter(
        GitHubIntegration.user_id == current_user.id
    ).first()

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GitHub integration not found"
        )

    try:
        # Remove GitHub data from user correlations (organization-scoped)
        correlations = db.query(UserCorrelation).filter(
            UserCorrelation.organization_id == current_user.organization_id
        ).all()

        for correlation in correlations:
            correlation.github_username = None

        # Delete the integration
        db.delete(integration)
        db.commit()

        return {
            "success": True,
            "message": "GitHub integration disconnected successfully"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disconnect GitHub integration: {str(e)}"
        )

@router.get("/org-members")
async def get_org_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all GitHub organization members for the current user's integration.
    Supports both personal integrations and beta token.
    """
    # Check for personal integration first
    integration = db.query(GitHubIntegration).filter(
        GitHubIntegration.user_id == current_user.id
    ).first()

    access_token = None
    organizations = []

    if integration and integration.github_token:
        # User has personal integration
        try:
            access_token = decrypt_token(integration.github_token)
            organizations = integration.organizations or []
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to decrypt token: {str(e)}"
            )
    else:
        # Check for beta GitHub token from Railway
        beta_github_token = os.getenv('GITHUB_TOKEN')
        if beta_github_token:
            access_token = beta_github_token
            # Default organizations for beta
            organizations = ['rootlyhq', 'Rootly-AI-Labs']
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No GitHub integration found"
            )

    if not organizations:
        return {
            "members": [],
            "total_members": 0,
            "organizations": []
        }

    try:
        # Fetch members from all organizations
        import httpx
        headers = {
            "Authorization": f"token {access_token}",
            "Accept": "application/json"
        }

        all_members = set()

        async with httpx.AsyncClient() as client:
            for org in organizations:
                page = 1
                while True:
                    response = await client.get(
                        f"https://api.github.com/orgs/{org}/members?per_page=100&page={page}",
                        headers=headers
                    )

                    if response.status_code != 200:
                        logger.warning(f"Failed to fetch members for {org}: {response.status_code}")
                        break

                    members_data = response.json()
                    if not members_data:
                        break

                    for member in members_data:
                        all_members.add(member.get("login"))

                    # Check if there are more pages
                    if len(members_data) < 100:
                        break
                    page += 1

        # Sort alphabetically
        sorted_members = sorted(list(all_members))

        return {
            "members": sorted_members,
            "total_members": len(sorted_members),
            "organizations": organizations
        }

    except Exception as e:
        logger.error(f"Failed to fetch org members: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch organization members: {str(e)}"
        )