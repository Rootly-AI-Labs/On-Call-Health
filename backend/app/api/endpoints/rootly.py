"""
Rootly integration API endpoints.
"""
from typing import Dict, Any, List
from datetime import datetime, timedelta
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, status, Request, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...models import get_db, User, RootlyIntegration, UserCorrelation, GitHubIntegration
from ...auth.dependencies import get_current_active_user
from ...core.rootly_client import RootlyAPIClient
from ...core.rate_limiting import integration_rate_limit
from ...core.input_validation import RootlyTokenRequest, RootlyIntegrationRequest

logger = logging.getLogger(__name__)

router = APIRouter()

class RootlyTokenUpdate(BaseModel):
    token: str

class RootlyIntegrationAdd(BaseModel):
    token: str
    name: str

class RootlyIntegrationUpdate(BaseModel):
    name: str = None
    is_default: bool = None
    api_token: str = None

class RootlyTestResponse(BaseModel):
    status: str
    message: str
    account_info: Dict[str, Any] = None
    error_code: str = None

@router.post("/token/test")
@integration_rate_limit("integration_test")
async def test_rootly_token_preview(
    request: Request,
    token_request: RootlyTokenRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Test Rootly token and return preview info without saving."""
    # Test the token first (strip whitespace)
    token = token_request.token.strip()
    client = RootlyAPIClient(token)
    test_result = await client.test_connection()
    
    logger.info(f"Rootly test connection: {test_result.get('status', 'unknown')} - {test_result.get('organization_name', 'N/A')}")
    
    if test_result["status"] != "success":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Invalid Rootly token",
                "error": test_result["message"],
                "error_code": test_result.get("error_code")
            }
        )
    
    # Extract organization info from test result
    account_info = test_result.get("account_info", {})
    organization_name = account_info.get("organization_name")
    total_users = account_info.get("total_users", 0)
    
    # Use organization name if available, otherwise use a generic name
    # Don't fabricate names from email domains or other sources
    if organization_name:
        base_name = organization_name
    else:
        # No organization name found in Rootly - use generic name
        base_name = "Rootly Integration"
    
    # Check if user already has this exact token (only active integrations)
    existing_token = db.query(RootlyIntegration).filter(
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.api_token == token,  # Use stripped token
        RootlyIntegration.is_active == True
    ).first()
    
    if existing_token:
        return {
            "status": "duplicate_token",
            "message": f"This token is already connected as '{existing_token.name}'",
            "existing_integration": {
                "id": existing_token.id,
                "name": existing_token.name,
                "organization_name": existing_token.organization_name
            }
        }
    
    # Generate a unique name if team name already exists
    existing_names = [
        integration.name for integration in 
        db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.platform == "rootly"
        ).all()
    ]
    
    suggested_name = base_name
    counter = 2
    while suggested_name in existing_names:
        suggested_name = f"{base_name} #{counter}"
        counter += 1
    
    # Check permissions for the token
    permissions = await client.check_permissions()
    
    return {
        "status": "success",
        "message": "Token is valid and ready to add",
        "preview": {
            "organization_name": organization_name,
            "suggested_name": suggested_name,
            "total_users": total_users,
            "can_add": True
        },
        "account_info": {
            **account_info,
            "permissions": permissions
        }
    }

@router.post("/token/add")
async def add_rootly_integration(
    integration_data: RootlyIntegrationAdd,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add a new Rootly integration after testing."""
    # Strip whitespace from token
    token = integration_data.token.strip()

    # Test the token again to ensure it's still valid
    client = RootlyAPIClient(token)
    test_result = await client.test_connection()
    
    if test_result["status"] != "success":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Token is no longer valid",
                "error": test_result["message"],
                "error_code": test_result.get("error_code")
            }
        )
    
    # Check if user already has this exact token (prevent duplicates, only active integrations)
    existing_token = db.query(RootlyIntegration).filter(
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.api_token == token,  # Use stripped token
        RootlyIntegration.is_active == True
    ).first()
    
    if existing_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": f"This token is already connected as '{existing_token.name}'",
                "existing_integration": {
                    "id": existing_token.id,
                    "name": existing_token.name,
                    "organization_name": existing_token.organization_name
                }
            }
        )
    
    # Extract organization info from test result
    account_info = test_result.get("account_info", {})
    organization_name = account_info.get("organization_name")
    total_users = account_info.get("total_users", 0)
    
    # Check if this will be the user's first Rootly integration (make it default)
    existing_integrations = db.query(RootlyIntegration).filter(
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.platform == "rootly"
    ).count()
    is_first_integration = existing_integrations == 0
    
    # Create the new integration with cached permissions
    from datetime import timezone
    new_integration = RootlyIntegration(
        user_id=current_user.id,
        name=integration_data.name,
        organization_name=organization_name,
        api_token=token,  # Use stripped token
        total_users=total_users,
        is_default=is_first_integration,  # First integration becomes default
        is_active=True,
        created_at=datetime.utcnow(),
        last_used_at=datetime.utcnow(),
        cached_permissions=permissions,  # Cache permissions from preview
        permissions_checked_at=datetime.now(timezone.utc)  # Set cache timestamp
    )
    
    try:
        db.add(new_integration)
        db.commit()
        db.refresh(new_integration)

        # Include permissions in response (use cached from preview)
        # This prevents showing "insufficient permissions" while waiting for list reload
        return {
            "status": "success",
            "message": f"Rootly integration '{integration_data.name}' added successfully",
            "integration": {
                "id": new_integration.id,
                "name": new_integration.name,
                "organization_name": new_integration.organization_name,
                "total_users": new_integration.total_users,
                "is_default": new_integration.is_default,
                "created_at": new_integration.created_at.isoformat(),
                "permissions": permissions  # Include permissions from preview validation
            }
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save integration: {str(e)}"
        )

@router.get("/integrations")
async def list_integrations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all Rootly integrations for the current user with permissions."""
    import time
    start_time = time.time()
    logger.info(f"🔍 [ROOTLY] Starting list_integrations for user {current_user.id}")

    integrations = db.query(RootlyIntegration).filter(
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.is_active == True,
        RootlyIntegration.platform == "rootly"
    ).order_by(RootlyIntegration.created_at.desc()).all()

    logger.info(f"🔍 [ROOTLY] DB query took {time.time() - start_time:.2f}s, found {len(integrations)} integrations")

    # Prepare base integration data first (fast, no API calls)
    result_integrations = []
    permission_tasks = []
    from datetime import datetime, timedelta, timezone

    for idx, integration in enumerate(integrations):
        integration_data = {
            "id": integration.id,
            "name": integration.name,
            "organization_name": integration.organization_name,
            "total_users": integration.total_users,
            "is_default": integration.is_default,
            "created_at": integration.created_at.isoformat(),
            "last_used_at": integration.last_used_at.isoformat() if integration.last_used_at else None,
            "token_suffix": f"****{integration.api_token[-4:]}" if integration.api_token and len(integration.api_token) >= 4 else "****"
        }
        result_integrations.append(integration_data)

        # Check if we have cached permissions (cache for 1 hour)
        cache_valid = False
        if integration.cached_permissions and integration.permissions_checked_at:
            cache_age = datetime.now(timezone.utc) - integration.permissions_checked_at
            cache_valid = cache_age < timedelta(hours=1)
            if cache_valid:
                integration_data["permissions"] = integration.cached_permissions
                logger.info(f"✅ Using cached permissions for '{integration.name}' (ID={integration.id}) - cached {int(cache_age.total_seconds())}s ago")

        # Queue permission check task if token exists and cache is stale/missing
        if integration.api_token and not cache_valid:
            client = RootlyAPIClient(integration.api_token)
            permission_tasks.append((idx, client.check_permissions(), integration.id))
        elif not integration.api_token:
            # No token - set immediately
            integration_data["permissions"] = {
                "users": {"access": None, "error": "No API token configured"},
                "incidents": {"access": None, "error": "No API token configured"}
            }

    # Run all permission checks in parallel with 10s timeout each
    if permission_tasks:
        import asyncio
        logger.info(f"🔍 [ROOTLY] Checking permissions for {len(permission_tasks)} integrations in parallel...")
        perm_start = time.time()

        async def check_with_timeout(idx, task, integration_id):
            try:
                result = await asyncio.wait_for(task, timeout=10.0)
                return (idx, result, None, integration_id)
            except asyncio.TimeoutError:
                return (idx, None, "timeout", integration_id)
            except Exception as e:
                return (idx, None, str(e), integration_id)

        # Run all checks concurrently
        results = await asyncio.gather(*[check_with_timeout(idx, task, int_id) for idx, task, int_id in permission_tasks])

        # Apply results and cache them
        for idx, permissions, error, integration_id in results:
            if error == "timeout":
                result_integrations[idx]["permissions"] = {
                    "users": {"access": None, "error": "Rootly API timeout - check back later"},
                    "incidents": {"access": None, "error": "Rootly API timeout - check back later"}
                }
                logger.warning(f"⚠️ Integration '{result_integrations[idx]['name']}' (ID={result_integrations[idx]['id']}) - Permission check TIMEOUT")
                # Don't cache timeouts
            elif error:
                result_integrations[idx]["permissions"] = {
                    "users": {"access": None, "error": f"Rootly API unavailable: {error}"},
                    "incidents": {"access": None, "error": f"Rootly API unavailable: {error}"}
                }
                logger.warning(f"⚠️ Integration '{result_integrations[idx]['name']}' (ID={result_integrations[idx]['id']}) - Permission check ERROR: {error}")
                # Don't cache errors
            else:
                result_integrations[idx]["permissions"] = permissions
                users_access = permissions.get('users', {}).get('access', False)
                incidents_access = permissions.get('incidents', {}).get('access', False)
                logger.info(f"✅ Integration '{result_integrations[idx]['name']}' (ID={result_integrations[idx]['id']}) - Permissions: users={users_access}, incidents={incidents_access}")

                # Cache successful permission checks
                try:
                    integration = db.query(RootlyIntegration).filter(RootlyIntegration.id == integration_id).first()
                    if integration:
                        integration.cached_permissions = permissions
                        integration.permissions_checked_at = datetime.now(timezone.utc)
                        db.commit()
                        logger.info(f"💾 Cached permissions for integration ID={integration_id}")
                except Exception as cache_error:
                    logger.warning(f"⚠️ Failed to cache permissions for integration ID={integration_id}: {cache_error}")
                    db.rollback()

        logger.info(f"🔍 [ROOTLY] All permission checks completed in {time.time() - perm_start:.2f}s")

    total_time = time.time() - start_time
    logger.info(f"🔍 [ROOTLY] COMPLETE: Returning {len(result_integrations)} integrations, total time: {total_time:.2f}s")
    return {
        "integrations": result_integrations
    }


@router.get("/integrations/{integration_id}/permissions")
async def check_integration_permissions(
    integration_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Check API permissions for a specific integration."""
    integration = db.query(RootlyIntegration).filter(
        RootlyIntegration.id == integration_id,
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.is_active == True
    ).first()
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Integration not found"
        )
    
    if not integration.api_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Integration has no API token configured"
        )
    
    try:
        client = RootlyAPIClient(integration.api_token)
        permissions = await client.check_permissions()
        
        # Add helpful recommendations
        recommendations = []
        if not permissions.get("incidents", {}).get("access", False):
            recommendations.append({
                "type": "error",
                "title": "Missing Incidents Permission",
                "message": "Your API token needs 'incidents:read' permission to fetch incident data for burnout analysis.",
                "action": "Update your Rootly API token with the required permission."
            })
        
        if not permissions.get("users", {}).get("access", False):
            recommendations.append({
                "type": "error", 
                "title": "Missing Users Permission",
                "message": "Your API token needs 'users:read' permission to fetch team member data.",
                "action": "Update your Rootly API token with the required permission."
            })
        
        if not recommendations:
            recommendations.append({
                "type": "success",
                "title": "All Permissions OK",
                "message": "Your API token has all required permissions for burnout analysis.",
                "action": "You're ready to run analyses!"
            })
        
        return {
            "integration_id": integration_id,
            "integration_name": integration.name,
            "permissions": permissions,
            "recommendations": recommendations,
            "status": "error" if any(r["type"] == "error" for r in recommendations) else "success"
        }
        
    except Exception as e:
        logger.error(f"Failed to check permissions for integration {integration_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check permissions: {str(e)}"
        )


@router.put("/integrations/{integration_id}")
async def update_integration(
    integration_id: int,
    update_data: RootlyIntegrationUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a Rootly integration name or set as default."""
    integration = db.query(RootlyIntegration).filter(
        RootlyIntegration.id == integration_id,
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.platform == "rootly"
    ).first()
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Integration not found"
        )
    
    # Handle name update
    if update_data.name is not None:
        # Check if new name conflicts with existing integrations
        existing_with_name = db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.name == update_data.name,
            RootlyIntegration.id != integration_id,
            RootlyIntegration.is_active == True
        ).first()
        
        if existing_with_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An integration with the name '{update_data.name}' already exists"
            )
        
        integration.name = update_data.name
    
    # Handle setting as default
    if update_data.is_default is not None and update_data.is_default:
        # First, set all other Rootly integrations for this user to not default
        db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.platform == "rootly",
            RootlyIntegration.is_active == True
        ).update({"is_default": False})
        
        # Then set this one as default
        integration.is_default = True
    
    try:
        db.commit()
        db.refresh(integration)
        
        message = ""
        if update_data.name is not None and update_data.is_default:
            message = f"Integration renamed to '{update_data.name}' and set as default"
        elif update_data.name is not None:
            message = f"Integration renamed to '{update_data.name}'"
        elif update_data.is_default:
            message = "Integration set as default"
        
        return {
            "status": "success",
            "message": message,
            "integration": {
                "id": integration.id,
                "name": integration.name,
                "organization_name": integration.organization_name,
                "total_users": integration.total_users,
                "is_default": integration.is_default,
                "created_at": integration.created_at.isoformat(),
                "last_used_at": integration.last_used_at.isoformat() if integration.last_used_at else None
            }
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update integration: {str(e)}"
        )

@router.delete("/integrations/{integration_id}")
async def delete_integration(
    integration_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete/revoke a Rootly integration."""
    integration = db.query(RootlyIntegration).filter(
        RootlyIntegration.id == integration_id,
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.platform == "rootly"
    ).first()
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Integration not found"
        )
    
    try:
        integration_name = integration.name
        
        # Soft delete - mark as inactive
        integration.is_active = False
        db.commit()
        
        return {
            "status": "success",
            "message": f"Integration '{integration_name}' has been revoked"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete integration: {str(e)}"
        )

@router.post("/integrations/{integration_id}/refresh-permissions")
async def refresh_integration_permissions(
    integration_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Manually refresh permissions for an integration (ignores cache)."""
    integration = db.query(RootlyIntegration).filter(
        RootlyIntegration.id == integration_id,
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.platform == "rootly"
    ).first()

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Integration not found"
        )

    if not integration.api_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Integration has no API token configured"
        )

    try:
        # Force check permissions (ignore cache)
        client = RootlyAPIClient(integration.api_token)
        permissions = await client.check_permissions()

        # Update cache
        from datetime import timezone
        integration.cached_permissions = permissions
        integration.permissions_checked_at = datetime.now(timezone.utc)
        db.commit()

        users_access = permissions.get('users', {}).get('access', False)
        incidents_access = permissions.get('incidents', {}).get('access', False)
        logger.info(f"✅ Refreshed permissions for '{integration.name}' (ID={integration.id}) - users={users_access}, incidents={incidents_access}")

        return {
            "status": "success",
            "message": f"Permissions refreshed for '{integration.name}'",
            "permissions": permissions
        }
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to refresh permissions for integration ID={integration_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh permissions: {str(e)}"
        )

@router.get("/token/test")
async def test_rootly_token(
    current_user: User = Depends(get_current_active_user)
) -> RootlyTestResponse:
    """Test the current user's Rootly API token."""
    if not current_user.rootly_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Rootly token configured"
        )
    
    client = RootlyAPIClient(current_user.rootly_token)
    test_result = await client.test_connection()
    
    return RootlyTestResponse(**test_result)

@router.get("/data/preview")
async def preview_rootly_data(
    days: int = 7,
    current_user: User = Depends(get_current_active_user)
):
    """Preview Rootly data without running full analysis."""
    if not current_user.rootly_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Rootly token configured"
        )
    
    try:
        client = RootlyAPIClient(current_user.rootly_token)
        
        # Get limited data for preview
        users = await client.get_users(limit=10)
        incidents = await client.get_incidents(days_back=days, limit=20)
        
        # Create preview summary
        preview = {
            "users_sample": len(users),
            "incidents_sample": len(incidents),
            "date_range_days": days,
            "sample_user": users[0] if users else None,
            "sample_incident": incidents[0] if incidents else None
        }
        
        return preview
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview data: {str(e)}"
        )

@router.get("/debug/incidents")
async def debug_rootly_incidents(
    integration_id: int,
    days: int = 7,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Debug endpoint to show raw Rootly incident data and processing steps."""
    # Get the integration
    integration = db.query(RootlyIntegration).filter(
        RootlyIntegration.id == integration_id,
        RootlyIntegration.user_id == current_user.id,
        RootlyIntegration.is_active == True
    ).first()
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Integration not found"
        )
    
    try:
        # Initialize client with this integration
        client = RootlyAPIClient(integration.api_token)
        
        # Get date range information
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        debug_info = {
            "integration_info": {
                "id": integration.id,
                "name": integration.name,
                "organization_name": integration.organization_name,
                "platform": integration.platform,
                "token_suffix": f"****{integration.api_token[-4:]}" if len(integration.api_token) >= 4 else "****"
            },
            "date_range": {
                "days_back": days,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "timezone": "UTC"
            },
            "api_test_results": {},
            "raw_api_response": {},
            "processed_data": {},
            "filters_applied": {},
            "errors": []
        }
        
        # Step 1: Test basic connection
        logger.info(f"DEBUG: Testing connection for integration {integration.id}")
        try:
            connection_test = await client.test_connection()
            debug_info["api_test_results"]["connection"] = connection_test
        except Exception as e:
            debug_info["errors"].append(f"Connection test failed: {str(e)}")
            debug_info["api_test_results"]["connection"] = {"status": "error", "message": str(e)}
        
        # Step 2: Test permissions
        logger.info(f"DEBUG: Testing permissions for integration {integration.id}")
        try:
            permissions = await client.check_permissions()
            debug_info["api_test_results"]["permissions"] = permissions
        except Exception as e:
            debug_info["errors"].append(f"Permission check failed: {str(e)}")
            debug_info["api_test_results"]["permissions"] = {"error": str(e)}
        
        # Step 3: Get raw incidents with detailed logging
        logger.info(f"DEBUG: Fetching incidents for {days} days from integration {integration.id}")
        try:
            # Get incidents with limit for debugging
            incidents = await client.get_incidents(days_back=days, limit=100)
            
            debug_info["raw_api_response"] = {
                "total_incidents_fetched": len(incidents),
                "sample_incidents": incidents[:3] if incidents else [],  # First 3 for inspection
                "incident_date_range": [],
                "status_breakdown": {},
                "severity_breakdown": {}
            }
            
            # Analyze the incidents
            if incidents:
                # Extract dates and analyze distribution
                incident_dates = []
                status_counts = {}
                severity_counts = {}
                
                for incident in incidents:
                    attrs = incident.get("attributes", {})
                    created_at = attrs.get("created_at")
                    status = attrs.get("status", "unknown")
                    
                    # Count status
                    status_counts[status] = status_counts.get(status, 0) + 1
                    
                    # Count severity
                    severity = "unknown"
                    severity_data = attrs.get("severity")
                    if severity_data and isinstance(severity_data, dict):
                        data = severity_data.get("data")
                        if data and isinstance(data, dict):
                            attributes = data.get("attributes")
                            if attributes and isinstance(attributes, dict):
                                name = attributes.get("name")
                                if name and isinstance(name, str):
                                    severity = name.lower()
                    severity_counts[severity] = severity_counts.get(severity, 0) + 1
                    
                    # Parse and collect dates
                    if created_at:
                        try:
                            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            incident_dates.append(dt.isoformat())
                        except:
                            pass
                
                # Sort dates to show range
                if incident_dates:
                    incident_dates.sort()
                    debug_info["raw_api_response"]["incident_date_range"] = [
                        incident_dates[0],  # Earliest
                        incident_dates[-1]  # Latest
                    ]
                
                debug_info["raw_api_response"]["status_breakdown"] = status_counts
                debug_info["raw_api_response"]["severity_breakdown"] = severity_counts
            
        except Exception as e:
            debug_info["errors"].append(f"Incident fetch failed: {str(e)}")
            debug_info["raw_api_response"]["error"] = str(e)
            incidents = []
        
        # Step 4: Show filtering logic
        debug_info["filters_applied"] = {
            "date_filter": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "filter_string": f"filter[created_at][gte]={start_date.isoformat()}&filter[created_at][lte]={end_date.isoformat()}"
            },
            "incidents_in_range": 0,
            "incidents_outside_range": 0,
            "date_parsing_errors": 0
        }
        
        # Analyze date filtering
        if incidents:
            in_range = 0
            outside_range = 0
            parsing_errors = 0
            
            for incident in incidents:
                attrs = incident.get("attributes", {})
                created_at = attrs.get("created_at")
                
                if created_at:
                    try:
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        if start_date <= dt <= end_date:
                            in_range += 1
                        else:
                            outside_range += 1
                    except:
                        parsing_errors += 1
                else:
                    parsing_errors += 1
            
            debug_info["filters_applied"]["incidents_in_range"] = in_range
            debug_info["filters_applied"]["incidents_outside_range"] = outside_range
            debug_info["filters_applied"]["date_parsing_errors"] = parsing_errors
        
        # Step 5: Show processed data structure
        debug_info["processed_data"] = {
            "total_incidents_processed": len(incidents),
            "users_referenced": set(),
            "incident_processing_summary": {}
        }
        
        # Extract user references from incidents
        user_references = set()
        if incidents:
            for incident in incidents:
                attrs = incident.get("attributes", {})
                
                # Check various user fields
                for field in ["user", "started_by", "resolved_by"]:
                    user_data = attrs.get(field)
                    if user_data and isinstance(user_data, dict):
                        data = user_data.get("data")
                        if data and isinstance(data, dict) and data.get("id"):
                            user_references.add(str(data["id"]))
            
            debug_info["processed_data"]["users_referenced"] = list(user_references)
            debug_info["processed_data"]["unique_users_count"] = len(user_references)
        
        # Step 6: Get users for comparison
        try:
            users = await client.get_users(limit=50)
            debug_info["processed_data"]["total_users_fetched"] = len(users)
            debug_info["processed_data"]["sample_users"] = users[:2] if users else []
        except Exception as e:
            debug_info["errors"].append(f"User fetch failed: {str(e)}")
            debug_info["processed_data"]["user_fetch_error"] = str(e)
        
        return debug_info

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Debug failed: {str(e)}"
        )


@router.get("/integrations/{integration_id}/users")
async def get_integration_users(
    integration_id: str,  # Changed to str to support beta IDs like "beta-rootly"
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Fetch all users from a specific Rootly/PagerDuty integration.
    Used to show team members who can submit burnout surveys.
    Supports both numeric IDs and beta integration string IDs.
    """
    try:
        # Check if this is a beta integration (string ID like "beta-rootly")
        if integration_id in ["beta-rootly", "beta-pagerduty"]:
            # Use environment variable token for beta integrations
            if integration_id == "beta-rootly":
                beta_token = os.getenv('ROOTLY_API_TOKEN')
                platform = "rootly"
                integration_name = "Rootly (Beta Access)"
            else:  # beta-pagerduty
                beta_token = os.getenv('PAGERDUTY_API_TOKEN')
                platform = "pagerduty"
                integration_name = "PagerDuty (Beta Access)"

            if not beta_token:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Beta {platform} token not configured"
                )

            # Fetch users using beta token
            if platform == "rootly":
                from app.core.rootly_client import RootlyAPIClient
                client = RootlyAPIClient(beta_token)
                users = await client.get_users(limit=limit)

                formatted_users = []
                for user in users:
                    # Rootly API uses JSONAPI format with attributes nested
                    attrs = user.get("attributes", {})
                    user_email = attrs.get("email")

                    # Check for existing user correlations
                    user_correlations = db.query(UserCorrelation).filter(
                        UserCorrelation.email == user_email
                    ).all()

                    # Collect unique GitHub usernames
                    github_usernames = list(set([
                        uc.github_username for uc in user_correlations
                        if uc.github_username
                    ]))

                    formatted_users.append({
                        "id": user.get("id"),
                        "email": user_email,
                        "name": attrs.get("name") or attrs.get("full_name"),
                        "platform": "rootly",
                        "platform_user_id": user.get("id"),
                        "github_usernames": github_usernames,
                        "has_github_mapping": len(github_usernames) > 0
                    })

                return {
                    "integration_id": integration_id,
                    "integration_name": integration_name,
                    "platform": "rootly",
                    "total_users": len(formatted_users),
                    "users": formatted_users
                }
            else:  # pagerduty
                from app.core.pagerduty_client import PagerDutyAPIClient
                client = PagerDutyAPIClient(beta_token)
                users = await client.get_users(limit=limit)

                formatted_users = []
                for user in users:
                    formatted_users.append({
                        "id": user.get("id"),
                        "email": user.get("email"),
                        "name": user.get("name"),
                        "platform": "pagerduty",
                        "platform_user_id": user.get("id")
                    })

                return {
                    "integration_id": integration_id,
                    "integration_name": integration_name,
                    "platform": "pagerduty",
                    "total_users": len(formatted_users),
                    "users": formatted_users
                }

        # Handle regular (non-beta) numeric integration IDs
        try:
            numeric_id = int(integration_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid integration ID: {integration_id}"
            )

        # Get the integration and verify it belongs to the user
        integration = db.query(RootlyIntegration).filter(
            RootlyIntegration.id == numeric_id,
            RootlyIntegration.user_id == current_user.id
        ).first()

        if not integration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Integration not found"
            )

        # Fetch users based on platform
        if integration.platform == "rootly":
            from app.core.rootly_client import RootlyAPIClient
            client = RootlyAPIClient(integration.api_token)
            users = await client.get_users(limit=limit)

            # Format user data
            formatted_users = []
            for user in users:
                # Rootly API uses JSONAPI format with attributes nested
                attrs = user.get("attributes", {})
                user_email = attrs.get("email")

                # Check for existing user correlations
                user_correlations = db.query(UserCorrelation).filter(
                    UserCorrelation.email == user_email
                ).all()

                # Collect unique GitHub usernames
                github_usernames = list(set([
                    uc.github_username for uc in user_correlations
                    if uc.github_username
                ]))

                formatted_users.append({
                    "id": user.get("id"),
                    "email": user_email,
                    "name": attrs.get("name") or attrs.get("full_name"),
                    "platform": "rootly",
                    "platform_user_id": user.get("id"),
                    "github_usernames": github_usernames,
                    "has_github_mapping": len(github_usernames) > 0
                })

            return {
                "integration_id": integration_id,
                "integration_name": integration.name,
                "platform": "rootly",
                "total_users": len(formatted_users),
                "users": formatted_users
            }

        elif integration.platform == "pagerduty":
            from app.core.pagerduty_client import PagerDutyAPIClient
            client = PagerDutyAPIClient(integration.api_token)
            users = await client.get_users(limit=limit)

            # Format user data
            formatted_users = []
            for user in users:
                formatted_users.append({
                    "id": user.get("id"),
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "platform": "pagerduty",
                    "platform_user_id": user.get("id")
                })

            return {
                "integration_id": integration_id,
                "integration_name": integration.name,
                "platform": "pagerduty",
                "total_users": len(formatted_users),
                "users": formatted_users
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Platform {integration.platform} not supported for user fetching"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch users from integration {integration_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch users: {str(e)}"
        )

@router.post("/integrations/{integration_id}/sync-users")
async def sync_integration_users(
    integration_id: str,  # Support both numeric and beta IDs
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Sync all users from a Rootly/PagerDuty integration to UserCorrelation table.
    
    This ensures ALL team members can submit burnout surveys via Slack,
    not just those who appear in incident data.
    
    Returns sync statistics showing how many users were created/updated.
    """
    try:
        from app.services.user_sync_service import UserSyncService
        import os
        from app.core.rootly_client import RootlyAPIClient
        from app.core.pagerduty_client import PagerDutyAPIClient

        # Handle beta integrations - use shared tokens from env
        if integration_id in ["beta-rootly", "beta-pagerduty"]:
            sync_service = UserSyncService(db)

            # Get beta token from environment
            if integration_id == "beta-rootly":
                beta_token = os.getenv('ROOTLY_API_TOKEN')
                if not beta_token:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Beta Rootly token not configured"
                    )
                # Fetch users directly from API
                client = RootlyAPIClient(beta_token)
                raw_users = await client.get_users(limit=10000)
                users = []
                for user in raw_users:
                    attrs = user.get("attributes", {})
                    users.append({
                        "id": user.get("id"),
                        "email": attrs.get("email"),
                        "name": attrs.get("name") or attrs.get("full_name"),
                        "platform": "rootly"
                    })
                platform = "rootly"
            else:  # beta-pagerduty
                beta_token = os.getenv('PAGERDUTY_API_TOKEN')
                if not beta_token:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Beta PagerDuty token not configured"
                    )
                # Fetch users directly from API
                client = PagerDutyAPIClient(beta_token)
                raw_users = await client.get_users(limit=10000)
                users = []
                for user in raw_users:
                    users.append({
                        "id": user.get("id"),
                        "email": user.get("email"),
                        "name": user.get("name"),
                        "platform": "pagerduty"
                    })
                platform = "pagerduty"

            # Sync to user_correlations with organization_id
            stats = sync_service.sync_users_from_list(
                users=users,
                platform=platform,
                current_user=current_user,
                integration_id=integration_id
            )

            # After syncing, try to match GitHub usernames
            github_stats = await sync_service._match_github_usernames(current_user)
            if github_stats:
                stats['github_matched'] = github_stats['matched']
                stats['github_skipped'] = github_stats['skipped']
                logger.info(
                    f"GitHub matching: {github_stats['matched']} users matched, "
                    f"{github_stats['skipped']} skipped"
                )

            return {
                "success": True,
                "message": f"Successfully synced {stats['total']} users from beta integration",
                "stats": stats
            }

        # Regular integration - convert to integer
        try:
            numeric_id = int(integration_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid integration ID: {integration_id}"
            )

        # Sync users from database integration
        sync_service = UserSyncService(db)

        # Perform sync - GitHub matching is handled internally by _match_github_usernames()
        stats = await sync_service.sync_integration_users(
            integration_id=numeric_id,
            current_user=current_user
        )

        # Build detailed message
        message_parts = [f"Successfully synced {stats['total']} users from integration"]
        if stats.get('github_matched'):
            message_parts.append(f"GitHub: {stats['github_matched']} users matched")
        if stats.get('github_skipped'):
            message_parts.append(f"({stats['github_skipped']} skipped)")

        return {
            "success": True,
            "message": ". ".join(message_parts),
            "stats": stats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing integration users: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync users: {str(e)}"
        )

@router.get("/integrations/{integration_id}/oncall-users")
async def get_oncall_users(
    integration_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get list of users currently on-call from a Rootly/PagerDuty integration.
    Returns emails of users who are currently on-call.
    Used to highlight on-call users when selecting survey recipients.
    """
    try:
        from datetime import datetime, timedelta
        from app.core.rootly_client import RootlyAPIClient
        from app.core.pagerduty_client import PagerDutyAPIClient

        # Handle beta integrations
        if integration_id in ["beta-rootly", "beta-pagerduty"]:
            if integration_id == "beta-rootly":
                beta_token = os.getenv('ROOTLY_API_TOKEN')
                if not beta_token:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Beta Rootly token not configured"
                    )
                client = RootlyAPIClient(beta_token)
            else:  # beta-pagerduty
                beta_token = os.getenv('PAGERDUTY_API_TOKEN')
                if not beta_token:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Beta PagerDuty token not configured"
                    )
                client = PagerDutyAPIClient(beta_token)
        else:
            # Regular integration
            try:
                numeric_id = int(integration_id)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid integration ID: {integration_id}"
                )

            integration = db.query(RootlyIntegration).filter(
                RootlyIntegration.id == numeric_id,
                RootlyIntegration.user_id == current_user.id
            ).first()

            if not integration:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Integration not found"
                )

            if integration.platform == "rootly":
                client = RootlyAPIClient(integration.api_token)
            elif integration.platform == "pagerduty":
                from app.core.pagerduty_client import PagerDutyAPIClient
                client = PagerDutyAPIClient(integration.api_token)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Platform {integration.platform} not supported"
                )

        # Get current on-call shifts (last 24 hours to current + 1 hour)
        end_date = datetime.now() + timedelta(hours=1)
        start_date = datetime.now() - timedelta(hours=24)

        on_call_shifts = await client.get_on_call_shifts(start_date, end_date)
        on_call_emails = await client.extract_on_call_users_from_shifts(on_call_shifts)

        return {
            "integration_id": integration_id,
            "total_oncall": len(on_call_emails),
            "oncall_emails": list(on_call_emails),
            "checked_at": datetime.now().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching on-call users: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch on-call users: {str(e)}"
        )


@router.get("/synced-users")
async def get_synced_users(
    integration_id: str = None,
    include_oncall_status: bool = True,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all synced users from UserCorrelation table for the current user.
    These are team members who can submit burnout surveys via Slack.
    Optionally filter by integration_id to show only users from a specific organization.
    Optionally include on-call status for each user (default: true).
    """
    try:
        from sqlalchemy import func, cast, String

        # Fetch all user correlations for this user
        query = db.query(UserCorrelation).filter(
            UserCorrelation.user_id == current_user.id
        )

        # Get all correlations, then filter in Python
        # This is simpler and works across all database types
        correlations = query.order_by(UserCorrelation.name).all()

        # Filter by integration_id if provided (check if value is in JSON array)
        if integration_id:
            filtered_correlations = []
            for corr in correlations:
                # Only include if integration_id is in the integration_ids array
                # Skip users with NULL integration_ids (not yet synced from any org)
                if corr.integration_ids and integration_id in corr.integration_ids:
                    filtered_correlations.append(corr)
            correlations = filtered_correlations

        # Fetch on-call emails if requested
        oncall_emails = set()
        if include_oncall_status and integration_id:
            try:
                from datetime import datetime, timedelta
                from app.core.rootly_client import RootlyAPIClient
                from app.core.pagerduty_client import PagerDutyAPIClient

                client = None

                # Get the integration to determine platform
                if integration_id in ["beta-rootly", "beta-pagerduty"]:
                    logger.info(f"📞 Fetching on-call status for beta integration: {integration_id}")
                    if integration_id == "beta-rootly":
                        beta_token = os.getenv('ROOTLY_API_TOKEN')
                        if beta_token:
                            client = RootlyAPIClient(beta_token)
                            logger.info("✅ Created Rootly client for beta integration")
                    else:
                        beta_token = os.getenv('PAGERDUTY_API_TOKEN')
                        if beta_token:
                            client = PagerDutyAPIClient(beta_token)
                            logger.info("✅ Created PagerDuty client for beta integration")
                else:
                    try:
                        numeric_id = int(integration_id)
                        logger.info(f"📞 Fetching on-call status for integration_id: {numeric_id}")
                        integration = db.query(RootlyIntegration).filter(
                            RootlyIntegration.id == numeric_id,
                            RootlyIntegration.user_id == current_user.id
                        ).first()

                        if integration:
                            logger.info(f"✅ Found integration: {integration.name} (platform: {integration.platform})")
                            if integration.platform == "rootly":
                                client = RootlyAPIClient(integration.api_token)
                                logger.info("✅ Created Rootly API client")
                            elif integration.platform == "pagerduty":
                                client = PagerDutyAPIClient(integration.api_token)
                                logger.info("✅ Created PagerDuty API client")
                        else:
                            logger.warning(f"⚠️  No integration found with id {numeric_id} for user {current_user.id}")
                    except ValueError:
                        logger.warning(f"⚠️  Invalid integration_id format: {integration_id}")

                # Fetch on-call shifts
                if client:
                    logger.info("🔍 Fetching on-call shifts...")
                    end_date = datetime.now() + timedelta(hours=1)
                    start_date = datetime.now() - timedelta(hours=24)
                    on_call_shifts = await client.get_on_call_shifts(start_date, end_date)
                    oncall_emails = await client.extract_on_call_users_from_shifts(on_call_shifts)
                    logger.info(f"✅ Found {len(oncall_emails)} on-call users: {list(oncall_emails)}")
                else:
                    logger.warning("⚠️  No client created, skipping on-call status fetch")
            except Exception as e:
                logger.error(f"❌ Failed to fetch on-call status: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                # Continue without on-call status

        # Format the response
        synced_users = []
        for corr in correlations:
            # Determine platform based on which fields are populated
            platforms = []
            if corr.rootly_email:
                platforms.append("rootly")
            if corr.pagerduty_user_id:
                platforms.append("pagerduty")
            if corr.github_username:
                platforms.append("github")
            if corr.slack_user_id:
                platforms.append("slack")

            # Check if user is currently on-call
            is_oncall = corr.email.lower() in {email.lower() for email in oncall_emails}

            synced_users.append({
                "id": corr.id,
                "name": corr.name,
                "email": corr.email,
                "platforms": platforms,
                "github_username": corr.github_username,
                "slack_user_id": corr.slack_user_id,
                "rootly_user_id": corr.rootly_user_id,  # Added for Rootly incident matching
                "pagerduty_user_id": corr.pagerduty_user_id,  # Added for PagerDuty incident matching
                "is_oncall": is_oncall,
                "created_at": corr.created_at.isoformat() if corr.created_at else None
            })

        return {
            "total": len(synced_users),
            "users": synced_users,
            "oncall_status_included": include_oncall_status
        }

    except Exception as e:
        logger.error(f"Error fetching synced users: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch synced users: {str(e)}"
        )


@router.put("/integrations/{integration_id}/survey-recipients")
async def update_survey_recipients(
    integration_id: str,
    recipient_ids: List[int] = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Save selected survey recipients for an integration.
    These users will receive automated burnout survey invitations via Slack.

    If recipient_ids is empty, this will RESET to default behavior (send to all users).
    """
    try:
        # Handle beta integrations - they can't save recipients (no database row)
        if integration_id in ["beta-rootly", "beta-pagerduty"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot save recipients for beta integrations. Please add a personal integration."
            )

        # Convert to numeric ID
        try:
            numeric_id = int(integration_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid integration ID: {integration_id}"
            )

        # Get the integration
        integration = db.query(RootlyIntegration).filter(
            RootlyIntegration.id == numeric_id,
            RootlyIntegration.user_id == current_user.id
        ).first()

        if not integration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Integration not found"
            )

        # If empty list, set to None to revert to default behavior
        if len(recipient_ids) == 0:
            integration.survey_recipients = None
            db.commit()
            logger.info(
                f"User {current_user.id} cleared survey recipients for integration {integration_id} - "
                f"reverting to default (all users)"
            )
            return {
                "success": True,
                "message": "Survey recipients cleared. All users with Slack will receive surveys (default behavior).",
                "integration_id": integration_id,
                "recipient_count": 0,
                "is_default": True
            }

        # Validate that all recipient IDs belong to this user's correlations
        valid_ids = db.query(UserCorrelation.id).filter(
            UserCorrelation.user_id == current_user.id,
            UserCorrelation.id.in_(recipient_ids)
        ).all()
        valid_id_set = {row[0] for row in valid_ids}

        invalid_ids = [rid for rid in recipient_ids if rid not in valid_id_set]
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid recipient IDs: {invalid_ids}"
            )

        # Update the integration with new recipients
        integration.survey_recipients = recipient_ids
        db.commit()

        logger.info(
            f"User {current_user.id} updated survey recipients for integration {integration_id}: "
            f"{len(recipient_ids)} recipients selected"
        )

        return {
            "success": True,
            "message": f"Survey recipients updated: {len(recipient_ids)} users selected",
            "integration_id": integration_id,
            "recipient_count": len(recipient_ids),
            "is_default": False
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update survey recipients: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update survey recipients: {str(e)}"
        )


@router.get("/integrations/{integration_id}/survey-recipients")
async def get_survey_recipients(
    integration_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get saved survey recipients for an integration.
    Returns list of UserCorrelation IDs that should receive surveys.
    """
    try:
        # Handle beta integrations
        if integration_id in ["beta-rootly", "beta-pagerduty"]:
            return {
                "integration_id": integration_id,
                "recipient_ids": [],
                "recipient_count": 0,
                "is_beta": True,
                "message": "Beta integrations use default recipient settings"
            }

        # Convert to numeric ID
        try:
            numeric_id = int(integration_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid integration ID: {integration_id}"
            )

        # Get the integration
        integration = db.query(RootlyIntegration).filter(
            RootlyIntegration.id == numeric_id,
            RootlyIntegration.user_id == current_user.id
        ).first()

        if not integration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Integration not found"
            )

        recipient_ids = integration.survey_recipients or []

        return {
            "integration_id": integration_id,
            "recipient_ids": recipient_ids,
            "recipient_count": len(recipient_ids),
            "is_beta": False
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get survey recipients: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get survey recipients: {str(e)}"
        )


@router.patch("/user-correlation/{correlation_id}/github-username")
async def update_user_correlation_github_username(
    correlation_id: int,
    github_username: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Manually update GitHub username for a UserCorrelation.
    Used when automatic correlation fails and user needs to manually map.
    """
    try:
        # Fetch the correlation - ensure it belongs to current user
        correlation = db.query(UserCorrelation).filter(
            UserCorrelation.id == correlation_id,
            UserCorrelation.user_id == current_user.id
        ).first()

        if not correlation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User correlation not found or doesn't belong to you"
            )

        # Validate and process GitHub username
        github_username = github_username.strip()

        # Update the GitHub username (allow empty string to clear mapping)
        old_username = correlation.github_username

        if github_username == "":
            # Clear the mapping
            correlation.github_username = None
            db.commit()
            logger.info(
                f"User {current_user.id} cleared GitHub username for {correlation.email} "
                f"(was: {old_username})"
            )
            message = "GitHub username mapping cleared"
        else:
            # Set the mapping
            correlation.github_username = github_username
            db.commit()
            logger.info(
                f"User {current_user.id} manually updated GitHub username for {correlation.email}: "
                f"{old_username} → {github_username}"
            )
            message = f"GitHub username updated to {github_username}"

        return {
            "success": True,
            "message": message,
            "correlation": {
                "id": correlation.id,
                "email": correlation.email,
                "name": correlation.name,
                "github_username": correlation.github_username,
                "slack_user_id": correlation.slack_user_id
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update GitHub username: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update GitHub username: {str(e)}"
        )
