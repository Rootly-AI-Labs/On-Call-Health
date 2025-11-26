"""
API endpoints for manual mapping management.
"""
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel, Field

from ...models import get_db, UserMapping
from ...auth.dependencies import get_current_active_user
from ...models.user import User
from ...services.manual_mapping_service import ManualMappingService
from ...core.rate_limiting import mapping_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models for request/response
class CreateMappingRequest(BaseModel):
    source_platform: str = Field(..., description="Source platform (rootly, pagerduty, jira)")
    source_identifier: str = Field(..., description="Source identifier (email, name)")
    target_platform: str = Field(..., description="Target platform (github, slack)")
    target_identifier: str = Field(..., description="Target identifier (username, user_id)")
    mapping_type: str = Field(default="manual", description="Type of mapping")

class UpdateMappingRequest(BaseModel):
    target_identifier: str = Field(..., description="New target identifier")

class BulkMappingRequest(BaseModel):
    mappings: List[CreateMappingRequest] = Field(..., description="List of mappings to create")

class MappingValidationRequest(BaseModel):
    target_platform: str = Field(..., description="Target platform to validate")
    target_identifier: str = Field(..., description="Target identifier to validate")

class MappingResponse(BaseModel):
    id: int
    source_platform: str
    source_identifier: str
    target_platform: str
    target_identifier: str
    mapping_type: str
    confidence_score: Optional[float]
    last_verified: Optional[str]
    created_at: str
    updated_at: Optional[str]
    status: str
    is_verified: bool
    mapping_key: str

class MappingStatisticsResponse(BaseModel):
    total_mappings: int
    manual_mappings: int
    auto_detected_mappings: int
    verified_mappings: int
    verification_rate: float
    platform_breakdown: Dict[str, Dict[str, int]]
    last_updated: Optional[str]

class SuggestionResponse(BaseModel):
    target_identifier: str
    confidence: float
    evidence: List[str]
    method: str

@router.get("/manual-mappings", summary="Get all manual mappings for current user")
async def get_user_mappings(
    target_platform: Optional[str] = Query(None, description="Filter by target platform"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> List[MappingResponse]:
    """Get all manual mappings for the current user."""
    try:
        service = ManualMappingService(db)
        
        if target_platform:
            mappings = service.get_platform_mappings(current_user.id, target_platform)
        else:
            mappings = service.get_user_mappings(current_user.id)
        
        return [MappingResponse(**mapping.to_dict()) for mapping in mappings]
    except Exception as e:
        logger.error(f"Error fetching user mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch mappings")

@router.post("/manual-mappings", summary="Create a new manual mapping")
async def create_mapping(
    request: CreateMappingRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> MappingResponse:
    """Create a new manual mapping."""
    try:
        service = ManualMappingService(db)
        
        mapping = service.create_mapping(
            user_id=current_user.id,
            source_platform=request.source_platform,
            source_identifier=request.source_identifier,
            target_platform=request.target_platform,
            target_identifier=request.target_identifier,
            created_by=current_user.id,
            mapping_type=request.mapping_type
        )
        
        return MappingResponse(**mapping.to_dict())
    except Exception as e:
        logger.error(f"Error creating mapping: {e}")
        raise HTTPException(status_code=500, detail="Failed to create mapping")

@router.put("/manual-mappings/{mapping_id}", summary="Update an existing mapping")
async def update_mapping(
    mapping_id: int,
    request: UpdateMappingRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> MappingResponse:
    """Update an existing mapping."""
    try:
        # Get existing mapping
        mapping = db.query(UserMapping).filter(
            UserMapping.id == mapping_id,
            UserMapping.user_id == current_user.id
        ).first()
        
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        
        # Update mapping
        mapping.target_identifier = request.target_identifier
        mapping.updated_at = func.now()
        mapping.last_verified = func.now()  # Reset verification on update
        
        db.commit()
        db.refresh(mapping)
        
        return MappingResponse(**mapping.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating mapping: {e}")
        raise HTTPException(status_code=500, detail="Failed to update mapping")

@router.delete("/manual-mappings/{mapping_id}", summary="Delete a mapping")
async def delete_mapping(
    mapping_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a mapping."""
    try:
        service = ManualMappingService(db)
        
        if service.delete_mapping(mapping_id, current_user.id):
            return {"message": "Mapping deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Mapping not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting mapping: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete mapping")

@router.post("/manual-mappings/{mapping_id}/verify", summary="Verify a mapping")
async def verify_mapping(
    mapping_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Mark a mapping as verified."""
    try:
        service = ManualMappingService(db)
        
        if service.verify_mapping(mapping_id, current_user.id):
            return {"message": "Mapping verified successfully"}
        else:
            raise HTTPException(status_code=404, detail="Mapping not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying mapping: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify mapping")

@router.post("/manual-mappings/bulk", summary="Bulk create mappings")
async def bulk_create_mappings(
    request: BulkMappingRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Bulk create multiple mappings."""
    try:
        service = ManualMappingService(db)
        
        mappings_data = [mapping.dict() for mapping in request.mappings]
        created_mappings, errors = service.bulk_create_mappings(
            user_id=current_user.id,
            mappings_data=mappings_data,
            created_by=current_user.id
        )
        
        return {
            "created_count": len(created_mappings),
            "error_count": len(errors),
            "mappings": [MappingResponse(**mapping.to_dict()) for mapping in created_mappings],
            "errors": errors
        }
    except Exception as e:
        logger.error(f"Error bulk creating mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to bulk create mappings")

@router.get("/manual-mappings/statistics", summary="Get mapping statistics")
async def get_mapping_statistics(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> MappingStatisticsResponse:
    """Get mapping statistics for the current user."""
    try:
        service = ManualMappingService(db)
        stats = service.get_mapping_statistics(current_user.id)
        
        # Convert datetime to string
        if stats["last_updated"]:
            stats["last_updated"] = stats["last_updated"].isoformat()
        
        return MappingStatisticsResponse(**stats)
    except Exception as e:
        logger.error(f"Error fetching mapping statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")

@router.get("/manual-mappings/suggestions", summary="Get mapping suggestions")
async def get_mapping_suggestions(
    source_platform: str = Query(..., description="Source platform"),
    source_identifier: str = Query(..., description="Source identifier"),
    target_platform: str = Query(..., description="Target platform"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> List[SuggestionResponse]:
    """Get mapping suggestions based on existing patterns."""
    try:
        service = ManualMappingService(db)
        suggestions = service.suggest_mappings(
            user_id=current_user.id,
            source_platform=source_platform,
            source_identifier=source_identifier,
            target_platform=target_platform
        )
        
        return [SuggestionResponse(**suggestion) for suggestion in suggestions]
    except Exception as e:
        logger.error(f"Error fetching mapping suggestions: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch suggestions")

@router.post("/manual-mappings/validate", summary="Validate a mapping")
async def validate_mapping(
    request: MappingValidationRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Validate if a target identifier exists and is active."""
    try:
        # For now, return a basic validation
        # TODO: Implement actual validation against GitHub/Slack APIs
        validation_result = {
            "valid": True,  # Placeholder
            "exists": True,  # Placeholder
            "platform": request.target_platform,
            "identifier": request.target_identifier,
            "last_activity": None,  # Would check API for last activity
            "activity_score": 0.8,  # Placeholder confidence score
            "message": "Validation not yet implemented - assuming valid"
        }
        
        return validation_result
    except Exception as e:
        logger.error(f"Error validating mapping: {e}")
        raise HTTPException(status_code=500, detail="Failed to validate mapping")

@router.get("/manual-mappings/unmapped", summary="Get unmapped identifiers")
async def get_unmapped_identifiers(
    source_platform: str = Query(..., description="Source platform"),
    target_platform: str = Query(..., description="Target platform"),
    source_identifiers: str = Query(..., description="Comma-separated source identifiers"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get source identifiers that don't have mappings to target platform."""
    try:
        service = ManualMappingService(db)
        identifier_list = [id.strip() for id in source_identifiers.split(",")]
        
        unmapped = service.get_unmapped_identifiers(
            user_id=current_user.id,
            source_platform=source_platform,
            source_identifiers=identifier_list,
            target_platform=target_platform
        )
        
        return {
            "unmapped_identifiers": unmapped,
            "total_checked": len(identifier_list),
            "unmapped_count": len(unmapped),
            "mapping_coverage": (len(identifier_list) - len(unmapped)) / len(identifier_list) if identifier_list else 0
        }
    except Exception as e:
        logger.error(f"Error fetching unmapped identifiers: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch unmapped identifiers")

@router.post("/manual-mappings/cleanup-duplicates", summary="Clean up duplicate mappings")
async def cleanup_duplicate_mappings(
    target_platform: str = Query("github", description="Target platform to clean up"),
    dry_run: bool = Query(True, description="If true, only return what would be cleaned up"),
    remove_test_emails: bool = Query(True, description="If true, also remove emails with + symbols (test emails)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Clean up duplicate mappings and optionally remove test emails with + symbols."""
    try:
        logger.info(f"Starting duplicate cleanup for user {current_user.id}, platform {target_platform}")
        
        # Debug: Show all mappings for this user/platform
        all_mappings = db.query(UserMapping).filter(
            UserMapping.user_id == current_user.id,
            UserMapping.target_platform == target_platform
        ).all()
        
        logger.info(f"Found {len(all_mappings)} total mappings for platform {target_platform}")
        for mapping in all_mappings:
            logger.info(f"  Mapping {mapping.id}: {mapping.source_platform}:{mapping.source_identifier} -> {mapping.target_identifier}")
        
        # Find duplicates: same user_id + source_platform + source_identifier + target_platform
        from sqlalchemy import and_, func
        
        # Query to find duplicates - group by source_identifier only since source_platform can be null
        subquery = db.query(
            UserMapping.user_id,
            UserMapping.source_identifier,
            UserMapping.target_platform,
            func.count(UserMapping.id).label('mapping_count'),
            func.min(UserMapping.id).label('keep_id'),
            func.max(UserMapping.updated_at).label('latest_update')
        ).filter(
            UserMapping.user_id == current_user.id,
            UserMapping.target_platform == target_platform
        ).group_by(
            UserMapping.user_id,
            UserMapping.source_identifier,
            UserMapping.target_platform
        ).having(func.count(UserMapping.id) > 1).subquery()
        
        # Get the actual duplicate records
        duplicates = db.query(UserMapping).join(
            subquery,
            and_(
                UserMapping.user_id == subquery.c.user_id,
                UserMapping.source_identifier == subquery.c.source_identifier,
                UserMapping.target_platform == subquery.c.target_platform
            )
        ).all()
        
        # Group duplicates by source identifier  
        logger.info(f"Found {len(duplicates)} duplicate mapping records")
        for dup in duplicates:
            logger.info(f"  Duplicate: {dup.id} - {dup.source_platform}:{dup.source_identifier} -> {dup.target_identifier}")
        
        duplicate_groups = {}
        for mapping in duplicates:
            # Use just the email as the key since source_platform can be null
            key = mapping.source_identifier
            if key not in duplicate_groups:
                duplicate_groups[key] = []
            duplicate_groups[key].append(mapping)
            
        logger.info(f"Grouped into {len(duplicate_groups)} duplicate groups")
        for key, group in duplicate_groups.items():
            logger.info(f"  Group {key}: {len(group)} mappings")
        
        cleanup_plan = []
        total_to_remove = 0
        
        # Process duplicate groups
        for key, group in duplicate_groups.items():
            if len(group) <= 1:
                continue
                
            # Sort by: non-empty target_identifier first, then manual, then by most recent update, then by ID
            group.sort(key=lambda x: (
                not bool(x.target_identifier and x.target_identifier.strip()),  # Non-empty target first
                not (x.mapping_type == 'manual' if x.mapping_type else False),  # Manual first (handle None)
                -(x.updated_at.timestamp() if x.updated_at else 0),  # Most recent first
                -x.id  # Highest ID first
            ))
            
            keep = group[0]
            remove = group[1:]
            total_to_remove += len(remove)
            
            cleanup_plan.append({
                "type": "duplicate",
                "source_identifier": keep.source_identifier,
                "keep": {
                    "id": keep.id,
                    "target_identifier": keep.target_identifier,
                    "mapping_type": keep.mapping_type,
                    "updated_at": keep.updated_at.isoformat() if keep.updated_at else None
                },
                "remove": [{
                    "id": m.id,
                    "target_identifier": m.target_identifier,
                    "mapping_type": m.mapping_type,
                    "updated_at": m.updated_at.isoformat() if m.updated_at else None
                } for m in remove]
            })
        
        # Find test emails with + symbols
        test_email_mappings = []
        if remove_test_emails:
            test_emails = db.query(UserMapping).filter(
                UserMapping.user_id == current_user.id,
                UserMapping.target_platform == target_platform,
                UserMapping.source_identifier.like('%+%')
            ).all()
            
            logger.info(f"Found {len(test_emails)} test email mappings with + symbols")
            for mapping in test_emails:
                logger.info(f"  Test email: {mapping.id} - {mapping.source_identifier} -> {mapping.target_identifier}")
                test_email_mappings.append({
                    "id": mapping.id,
                    "source_identifier": mapping.source_identifier,
                    "target_identifier": mapping.target_identifier,
                    "mapping_type": mapping.mapping_type,
                    "updated_at": mapping.updated_at.isoformat() if mapping.updated_at else None
                })
                total_to_remove += 1
            
            if test_email_mappings:
                cleanup_plan.append({
                    "type": "test_emails",
                    "source_identifier": "emails_with_plus_symbols", 
                    "keep": None,
                    "remove": test_email_mappings
                })
        
        if not dry_run and cleanup_plan:
            # Actually remove the duplicates and test emails
            removed_count = 0
            for plan in cleanup_plan:
                for remove_mapping in plan["remove"]:
                    mapping = db.query(UserMapping).filter(
                        UserMapping.id == remove_mapping["id"],
                        UserMapping.user_id == current_user.id
                    ).first()
                    if mapping:
                        db.delete(mapping)
                        removed_count += 1
            
            db.commit()
            logger.info(f"Removed {removed_count} mappings for user {current_user.id}")
        
        # Calculate stats
        duplicate_groups = [plan for plan in cleanup_plan if plan["type"] == "duplicate"]
        test_email_groups = [plan for plan in cleanup_plan if plan["type"] == "test_emails"]
        total_duplicates = sum(len(plan["remove"]) for plan in duplicate_groups)
        total_test_emails = sum(len(plan["remove"]) for plan in test_email_groups)
        
        return {
            "dry_run": dry_run,
            "total_duplicate_groups": len(duplicate_groups),
            "total_duplicates_found": total_duplicates,
            "total_test_emails_found": total_test_emails,
            "total_to_remove": total_to_remove,
            "cleanup_plan": cleanup_plan,
            "message": f"{'Would remove' if dry_run else 'Removed'} {total_duplicates} duplicate mappings and {total_test_emails} test email mappings"
        }
        
    except Exception as e:
        logger.error(f"Error during duplicate cleanup: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clean up duplicates: {str(e)}")

@router.post("/manual-mappings/run-github-mapping", summary="Run GitHub mapping process")
async def run_github_mapping(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Run the enhanced GitHub mapping process for all unmapped users."""
    try:
        logger.info(f"Starting GitHub mapping for user {current_user.id}")
        from ...services.enhanced_github_matcher import EnhancedGitHubMatcher
        from ...models import GitHubIntegration, RootlyIntegration
        import asyncio
        
        # Set a timeout for the entire operation to prevent server timeouts
        timeout_seconds = 45  # Railway/server timeout is usually 60s
        
        # Get GitHub integration - check personal first, then beta token
        github_integration = db.query(GitHubIntegration).filter(
            GitHubIntegration.user_id == current_user.id,
            GitHubIntegration.github_token.isnot(None)
        ).first()
        
        github_token = None
        if github_integration:
            # Decrypt personal GitHub token
            from .github import decrypt_token
            github_token = decrypt_token(github_integration.github_token)
            logger.info(f"Using personal GitHub integration for user {current_user.id}")
        else:
            # Try beta GitHub token from environment
            import os
            beta_github_token = os.getenv('GITHUB_TOKEN')
            if beta_github_token:
                github_token = beta_github_token
                logger.info(f"Using beta GitHub token for user {current_user.id}")
        
        if not github_token:
            raise HTTPException(status_code=400, detail="GitHub integration not found")
        
        # Get unmapped Rootly users
        service = ManualMappingService(db)
        
        # Get all Rootly/PagerDuty users
        rootly_integrations = db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.platform.in_(["rootly", "pagerduty"])
        ).all()
        
        all_users = []
        for integration in rootly_integrations:
            # Get users from this integration
            if integration.platform == "rootly":
                from ...core.rootly_client import RootlyAPIClient
                # Strip token to handle any whitespace issues
                api_token = integration.api_token.strip() if integration.api_token else None
                if not api_token:
                    logger.error(f"Integration {integration.id} has empty API token")
                    continue

                client = RootlyAPIClient(api_token)
                try:
                    users_data = await client.get_users()
                except Exception as e:
                    logger.error(f"Failed to fetch users from Rootly integration {integration.id}: {e}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot fetch users from Rootly integration '{integration.name}'. The API token may be invalid or expired. Please check your Rootly integration and reconnect if needed."
                    )
                for user in users_data:
                    # Extract from nested attributes structure
                    attributes = user.get("attributes", {})
                    email = attributes.get("email")
                    name = attributes.get("full_name") or attributes.get("name")
                    
                    # Include users with either email OR name
                    if (email and email.strip()) or (name and name.strip()):
                        all_users.append({
                            "email": email.strip() if email else None,
                            "name": name.strip() if name else None,
                            "platform": "rootly",
                            "integration_id": integration.id
                        })
                    else:
                        logger.warning(f"Skipping user - no email or name: {user}")
                        continue
            # TODO: Add PagerDuty support
        
        # Get existing mappings
        existing_mappings = service.get_platform_mappings(
            user_id=current_user.id,
            target_platform="github"
        )
        mapped_identifiers = {m.source_identifier for m in existing_mappings if m.source_platform == "rootly"}
        
        # Filter unmapped users (check both email and name as identifiers)
        unmapped_users = []
        for user in all_users:
            user_email = user.get("email")
            user_name = user.get("name")
            
            # Skip if already mapped by email
            if user_email and user_email in mapped_identifiers:
                continue
                
            # Skip if already mapped by name (fallback identifier)
            if user_name and user_name in mapped_identifiers:
                continue
                
            # Include if has either email or name
            if user_email or user_name:
                unmapped_users.append(user)
        
        # Discover GitHub organizations from the token instead of hardcoding
        try:
            from ...services.enhanced_github_matcher import EnhancedGitHubMatcher
            temp_matcher = EnhancedGitHubMatcher(github_token, [])  # Empty org list initially
            github_orgs = await temp_matcher.discover_accessible_organizations()
            logger.info(f"🔍 Discovered {len(github_orgs)} accessible organizations: {github_orgs}")
        except Exception as e:
            logger.error(f"Failed to discover organizations from token, using fallback: {e}")
            # Fallback to checking integration settings or defaults
            github_orgs = []
            if hasattr(github_integration, 'github_organizations') and github_integration.github_organizations:
                import json
                try:
                    github_orgs = json.loads(github_integration.github_organizations)
                except:
                    github_orgs = ["Rootly-AI-Labs", "rootlyhq"]
            
            if not github_orgs:
                github_orgs = ["Rootly-AI-Labs", "rootlyhq"]
            
        # Run matching process with timeout protection
        async def run_matching_with_timeout():
            matcher = EnhancedGitHubMatcher(github_token, github_orgs)
            results = []
            
            # Limit to first 20 users to prevent timeouts
            limited_users = unmapped_users[:20]
            if len(unmapped_users) > 20:
                logger.info(f"⏱️ Processing first 20 users out of {len(unmapped_users)} to prevent timeouts")
            
            for i, user in enumerate(limited_users):
                user_email = user.get("email")
                user_name = user.get("name")
                github_username = None
                match_method = None
                
                try:
                    # Skip email-based matching since GitHub emails are usually private
                    # Go directly to optimized name-based matching
                    if user_name:
                        logger.info(f"[{i+1}/{len(limited_users)}] Trying optimized name-based matching for '{user_name}'")
                        github_username = await matcher.match_name_to_github(
                            full_name=user_name,
                            fallback_email=user_email  # Use email as additional context if available
                        )
                        if github_username:
                            match_method = "name"
                    
                    # Skip old email-based matching entirely
                    else:
                        logger.info(f"[{i+1}/{len(limited_users)}] No name available for user, cannot perform matching")
                    
                    if github_username:
                        # Use email as identifier if available, otherwise use name
                        source_identifier = user_email if user_email else user_name
                        
                        # Create mapping
                        service.create_mapping(
                            user_id=current_user.id,
                            source_platform=user["platform"],
                            source_identifier=source_identifier,
                            target_platform="github",
                            target_identifier=github_username,
                            created_by=current_user.id,
                            mapping_type="automated"
                        )
                        
                        results.append({
                            "email": user_email,
                            "name": user_name,
                            "github_username": github_username,
                            "status": "mapped",
                            "platform": user["platform"],
                            "match_method": match_method
                        })
                    else:
                        results.append({
                            "email": user_email,
                            "name": user_name,
                            "github_username": None,
                            "status": "not_found",
                            "platform": user["platform"]
                        })
                        
                except Exception as e:
                    identifier = user_email or user_name or "unknown user"
                    logger.error(f"Error mapping {identifier}: {e}")
                    results.append({
                        "email": user_email,
                        "name": user_name,
                        "github_username": None,
                        "status": "error",
                        "error": str(e),
                        "platform": user["platform"]
                    })
                    
            return results
        
        # Execute with timeout
        try:
            results = await asyncio.wait_for(run_matching_with_timeout(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            logger.error(f"GitHub mapping timed out after {timeout_seconds} seconds")
            return {
                "total_processed": 0,
                "mapped": 0,
                "not_found": 0,
                "errors": 1,
                "success_rate": 0,
                "results": [],
                "error": f"Request timed out after {timeout_seconds} seconds. Please try again with fewer users."
            }
        
        # Calculate summary stats
        mapped_count = len([r for r in results if r["status"] == "mapped"])
        not_found_count = len([r for r in results if r["status"] == "not_found"])
        error_count = len([r for r in results if r["status"] == "error"])
        
        return {
            "total_processed": len(results),
            "mapped": mapped_count,
            "not_found": not_found_count,
            "errors": error_count,
            "success_rate": mapped_count / len(results) if results else 0,
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running GitHub mapping: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to run GitHub mapping: {str(e)}")

@router.post("/manual-mappings/run-jira-mapping", summary="Run Jira mapping process")
async def run_jira_mapping(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Run the Jira mapping process for all unmapped users using email-based matching.

    Strategy:
    1. Try exact email match first (case-insensitive)
    2. Fall back to fuzzy name matching (>70% threshold)
    3. Creates UserMapping records for persistent storage
    4. Returns detailed results for frontend display
    """
    try:
        logger.info(f"Starting Jira mapping for user {current_user.id}")
        from ...models import JiraIntegration, RootlyIntegration
        from ...services.enhanced_jira_matcher import EnhancedJiraMatcher
        from ...services.jira_user_sync_service import _decrypt_token

        # Get Jira integration
        jira_integration = db.query(JiraIntegration).filter(
            JiraIntegration.user_id == current_user.id
        ).first()

        if not jira_integration or not jira_integration.access_token or not jira_integration.jira_cloud_id:
            raise HTTPException(status_code=400, detail="Jira integration not found")

        # Get unmapped Rootly users
        service = ManualMappingService(db)

        # Get all Rootly/PagerDuty users
        rootly_integrations = db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.platform.in_(["rootly", "pagerduty"])
        ).all()

        all_users = []
        for integration in rootly_integrations:
            if integration.platform == "rootly":
                from ...core.rootly_client import RootlyAPIClient
                api_token = integration.api_token.strip() if integration.api_token else None
                if not api_token:
                    logger.error(f"Integration {integration.id} has empty API token")
                    continue

                client = RootlyAPIClient(api_token)
                try:
                    users_data = await client.get_users()
                except Exception as e:
                    logger.error(f"Failed to fetch users from Rootly integration {integration.id}: {e}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot fetch users from Rootly integration '{integration.name}'. The API token may be invalid or expired."
                    )
                for user in users_data:
                    attributes = user.get("attributes", {})
                    email = attributes.get("email")
                    name = attributes.get("full_name") or attributes.get("name")

                    if (email and email.strip()) or (name and name.strip()):
                        all_users.append({
                            "email": email.strip() if email else None,
                            "name": name.strip() if name else None,
                            "platform": "rootly",
                            "integration_id": integration.id
                        })
                    else:
                        logger.warning(f"Skipping user - no email or name: {user}")

        # Get existing mappings
        existing_mappings = service.get_platform_mappings(
            user_id=current_user.id,
            target_platform="jira"
        )
        mapped_identifiers = {m.source_identifier for m in existing_mappings if m.source_platform == "rootly"}

        # Filter unmapped users
        unmapped_users = []
        for user in all_users:
            user_email = user.get("email")
            user_name = user.get("name")

            if user_email and user_email in mapped_identifiers:
                continue
            if user_name and user_name in mapped_identifiers:
                continue

            if user_email or user_name:
                unmapped_users.append(user)

        # Fetch Jira users with email support
        try:
            from ...services.jira_user_sync_service import JiraUserSyncService

            access_token = _decrypt_token(jira_integration.access_token)
            jira_service = JiraUserSyncService(db)
            jira_users = await jira_service._fetch_jira_users(
                access_token,
                jira_integration.jira_cloud_id
            )
            logger.info(f"🔍 Fetched {len(jira_users)} Jira users")
        except Exception as e:
            logger.error(f"Failed to fetch Jira users: {e}")
            raise HTTPException(status_code=400, detail="Failed to fetch Jira users")

        # Use EnhancedJiraMatcher for email-first matching
        matcher = EnhancedJiraMatcher()
        results = []

        for i, user in enumerate(unmapped_users[:20]):  # Limit to 20 to prevent timeouts
            user_email = user.get("email")
            user_name = user.get("name")
            match_result = None
            match_method = None

            try:
                # Try email-based matching first (new primary strategy)
                if user_email:
                    logger.debug(
                        f"[{i+1}/{len(unmapped_users[:20])}] Trying email-based matching for '{user_email}'"
                    )
                    match_result = await matcher.match_email_to_jira(
                        team_email=user_email,
                        jira_users=jira_users,
                        confidence_threshold=0.70
                    )
                    if match_result:
                        match_method = "email"

                # Fall back to name-based matching if email doesn't match
                if not match_result and user_name:
                    logger.debug(
                        f"[{i+1}/{len(unmapped_users[:20])}] Trying name-based matching for '{user_name}'"
                    )
                    match_result = await matcher.match_name_to_jira(
                        team_name=user_name,
                        jira_users=jira_users,
                        confidence_threshold=0.70
                    )
                    if match_result:
                        match_method = "name"

                if match_result:
                    jira_account_id, jira_display_name, confidence_score = match_result
                    source_identifier = user_email if user_email else user_name

                    # Create persistent UserMapping record
                    service.create_mapping(
                        user_id=current_user.id,
                        source_platform=user["platform"],
                        source_identifier=source_identifier,
                        target_platform="jira",
                        target_identifier=jira_account_id,
                        created_by=current_user.id,
                        mapping_type="automated"
                    )

                    results.append({
                        "email": user_email,
                        "name": user_name,
                        "jira_username": jira_display_name,
                        "jira_account_id": jira_account_id,
                        "status": "mapped",
                        "platform": user["platform"],
                        "match_method": match_method,
                        "confidence": confidence_score
                    })
                    logger.info(
                        f"✅ Mapped {user_email or user_name} -> {jira_account_id} "
                        f"via {match_method} (confidence: {confidence_score:.2f})"
                    )
                else:
                    results.append({
                        "email": user_email,
                        "name": user_name,
                        "jira_username": None,
                        "status": "not_found",
                        "platform": user["platform"]
                    })
                    logger.debug(f"❌ No match found for {user_email or user_name}")

            except Exception as e:
                identifier = user_email or user_name or "unknown user"
                logger.error(f"Error mapping {identifier}: {e}")
                results.append({
                    "email": user_email,
                    "name": user_name,
                    "jira_username": None,
                    "status": "error",
                    "error": str(e),
                    "platform": user["platform"]
                })

        # Calculate summary stats
        mapped_count = len([r for r in results if r["status"] == "mapped"])
        not_found_count = len([r for r in results if r["status"] == "not_found"])
        error_count = len([r for r in results if r["status"] == "error"])

        logger.info(
            f"🎯 Jira mapping complete: {mapped_count} mapped, "
            f"{not_found_count} not found, {error_count} errors"
        )

        return {
            "total_processed": len(results),
            "mapped": mapped_count,
            "not_found": not_found_count,
            "errors": error_count,
            "success_rate": mapped_count / len(results) if results else 0,
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running Jira mapping: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to run Jira mapping: {str(e)}")