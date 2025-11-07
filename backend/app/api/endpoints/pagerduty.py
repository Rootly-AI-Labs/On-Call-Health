"""
PagerDuty integration API endpoints.
"""

from datetime import datetime
from typing import List, Optional
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ...models import get_db, User
from ...models.rootly_integration import RootlyIntegration
from ...auth.dependencies import get_current_active_user
from ...core.pagerduty_client import PagerDutyAPIClient

router = APIRouter()
logger = logging.getLogger(__name__)

class TokenTestRequest(BaseModel):
    token: str

class TokenTestResponse(BaseModel):
    valid: bool
    account_info: Optional[dict] = None
    error: Optional[str] = None

class AddIntegrationRequest(BaseModel):
    token: str
    name: Optional[str] = None
    platform: str = "pagerduty"

class IntegrationResponse(BaseModel):
    id: int
    name: str
    organization_name: str
    total_users: int
    total_services: Optional[int] = None
    is_default: bool
    created_at: str
    last_used_at: Optional[str] = None
    token_suffix: str
    platform: str

class UpdateIntegrationRequest(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None

@router.post("/token/test", response_model=TokenTestResponse)
async def test_pagerduty_token(
    request: TokenTestRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Test a PagerDuty API token and get account information."""
    client = PagerDutyAPIClient(request.token)
    result = await client.test_connection()
    
    if result["valid"]:
        # Check if this organization is already connected
        org_name = result["account_info"]["organization_name"]
        logger.info(f"PagerDuty organization: {org_name}")
        
        # Get all existing integrations for debugging
        all_existing = db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id
        ).all()
        logger.debug(f"Existing integrations: {len(all_existing)} found for user {current_user.id}")
        
        existing = db.query(RootlyIntegration).filter(
            and_(
                RootlyIntegration.user_id == current_user.id,
                RootlyIntegration.organization_name == org_name,
                RootlyIntegration.platform == "pagerduty"
            )
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "This PagerDuty account is already connected",
                    "existing_integration": existing.name
                }
            )
        
        # Add can_add flag
        result["account_info"]["can_add"] = True
    
    return result

@router.get("/integrations")
async def get_pagerduty_integrations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all PagerDuty integrations for the current user."""
    integrations = db.query(RootlyIntegration).filter(
        and_(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.platform == "pagerduty"
        )
    ).all()
    
    result_integrations = []
    for i in integrations:
        integration_data = {
            "id": i.id,
            "name": i.name,
            "organization_name": i.organization_name,
            "total_users": i.total_users,
            "is_default": i.is_default,
            "created_at": i.created_at.isoformat(),
            "last_used_at": i.last_used_at.isoformat() if i.last_used_at else None,
            "token_suffix": f"****{i.api_token[-4:]}" if i.api_token and len(i.api_token) >= 4 else "****",
            "platform": i.platform
        }
        
        # Check permissions for this integration
        if i.api_token:
            try:
                client = PagerDutyAPIClient(i.api_token)
                permissions = await client.check_permissions()
                integration_data["permissions"] = permissions
            except Exception as e:
                logger.warning(f"Failed to check permissions for integration {i.id}: {e}")
                # If we can't check permissions, include a note
                integration_data["permissions"] = {
                    "users": {"access": False, "error": f"Permission check failed: {str(e)}"},
                    "incidents": {"access": False, "error": f"Permission check failed: {str(e)}"}
                }
        
        result_integrations.append(integration_data)

    return {
        "integrations": result_integrations,
        "total": len(result_integrations)
    }

@router.post("/integrations", response_model=IntegrationResponse)
async def add_pagerduty_integration(
    request: AddIntegrationRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add a new PagerDuty integration."""
    # Test the token first
    client = PagerDutyAPIClient(request.token)
    test_result = await client.test_connection()
    
    if not test_result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid PagerDuty API token"
        )
    
    account_info = test_result["account_info"]
    org_name = account_info["organization_name"]
    
    # Check for duplicates
    existing = db.query(RootlyIntegration).filter(
        and_(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.organization_name == org_name,
            RootlyIntegration.platform == "pagerduty"
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This PagerDuty account is already connected"
        )
    
    # Check if this is the first integration
    existing_count = db.query(RootlyIntegration).filter(
        RootlyIntegration.user_id == current_user.id
    ).count()
    
    # Create new integration
    integration = RootlyIntegration(
        user_id=current_user.id,
        name=request.name or org_name,
        api_token=request.token,
        organization_name=org_name,
        total_users=account_info["total_users"],
        is_default=(existing_count == 0),
        platform="pagerduty"
    )
    
    db.add(integration)
    db.commit()
    db.refresh(integration)
    
    return IntegrationResponse(
        id=integration.id,
        name=integration.name,
        organization_name=integration.organization_name,
        total_users=integration.total_users,
        total_services=account_info.get("total_services", 0),
        is_default=integration.is_default,
        created_at=integration.created_at.isoformat(),
        last_used_at=None,
        token_suffix=integration.api_token[-4:] if len(integration.api_token) > 4 else "****",
        platform=integration.platform
    )

@router.put("/integrations/{integration_id}", response_model=IntegrationResponse)
def update_pagerduty_integration(
    integration_id: int,
    request: UpdateIntegrationRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a PagerDuty integration."""
    integration = db.query(RootlyIntegration).filter(
        and_(
            RootlyIntegration.id == integration_id,
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.platform == "pagerduty"
        )
    ).first()
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Integration not found"
        )
    
    if request.name is not None:
        integration.name = request.name
    
    if request.is_default is not None:
        # If setting as default, unset other defaults
        if request.is_default:
            db.query(RootlyIntegration).filter(
                and_(
                    RootlyIntegration.user_id == current_user.id,
                    RootlyIntegration.id != integration_id
                )
            ).update({"is_default": False})
        integration.is_default = request.is_default
    
    db.commit()
    db.refresh(integration)
    
    return IntegrationResponse(
        id=integration.id,
        name=integration.name,
        organization_name=integration.organization_name,
        total_users=integration.total_users,
        total_services=integration.total_users,
        is_default=integration.is_default,
        created_at=integration.created_at.isoformat(),
        last_used_at=integration.last_used_at.isoformat() if integration.last_used_at else None,
        token_suffix=integration.api_token[-4:] if len(integration.api_token) > 4 else "****",
        platform=integration.platform
    )


@router.delete("/integrations/{integration_id}")
def delete_pagerduty_integration(
    integration_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a PagerDuty integration."""
    integration = db.query(RootlyIntegration).filter(
        and_(
            RootlyIntegration.id == integration_id,
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.platform == "pagerduty"
        )
    ).first()
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Integration not found"
        )
    
    # If this was default, make another one default
    if integration.is_default:
        other_integration = db.query(RootlyIntegration).filter(
            and_(
                RootlyIntegration.user_id == current_user.id,
                RootlyIntegration.id != integration_id
            )
        ).first()
        
        if other_integration:
            other_integration.is_default = True
    
    db.delete(integration)
    db.commit()
    
    return {"status": "success", "message": "Integration deleted successfully"}