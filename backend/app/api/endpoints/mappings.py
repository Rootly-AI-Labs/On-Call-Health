"""
API endpoints for integration mapping data.
"""
import logging
import os
import re
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...models import get_db, IntegrationMapping
from ...auth.dependencies import get_current_active_user
from ...models.user import User
from ...services.mapping_recorder import MappingRecorder

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/mappings", summary="Get user's integration mappings")
async def get_user_mappings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> List[dict]:
    """Get all integration mappings for the current user."""
    try:
        recorder = MappingRecorder(db)
        mappings = recorder.get_user_mappings(current_user.id)
        return [mapping.to_dict() for mapping in mappings]
    except Exception as e:
        logger.error(f"Error fetching user mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch mappings")

@router.get("/mappings/recent", summary="Get recent integration mappings")
async def get_recent_mappings(
    limit: int = 10,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> List[dict]:
    """Get recent integration mappings for the current user."""
    try:
        recorder = MappingRecorder(db)
        mappings = recorder.get_recent_mappings(current_user.id, limit)
        return [mapping.to_dict() for mapping in mappings]
    except Exception as e:
        logger.error(f"Error fetching recent mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch recent mappings")

@router.get("/mappings/statistics", summary="Get mapping statistics")
async def get_mapping_statistics(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> dict:
    """Get mapping statistics for the current user."""
    try:
        recorder = MappingRecorder(db)
        stats = recorder.get_mapping_statistics(current_user.id)
        return stats
    except Exception as e:
        logger.error(f"Error fetching mapping statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch mapping statistics")

@router.get("/mappings/analysis/{analysis_id}", summary="Get mappings for specific analysis")
async def get_analysis_mappings(
    analysis_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> dict:
    """Get all integration mappings for a specific analysis with proper team member statistics, including manual mappings."""
    try:
        # Verify the analysis belongs to the current user
        from ...models import Analysis, UserMapping
        analysis = db.query(Analysis).filter(
            Analysis.id == analysis_id,
            Analysis.user_id == current_user.id
        ).first()
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        recorder = MappingRecorder(db)
        integration_mappings = recorder.get_analysis_mappings(analysis_id)
        
        # Get all manual mappings for this user and target platform
        # We'll filter them later to prioritize analysis-relevant ones
        manual_mappings = db.query(UserMapping).filter(
            UserMapping.user_id == current_user.id,
            UserMapping.target_platform.in_(["github", "slack", "jira"])  # Only include relevant platforms
        ).all()
        
        # Get emails from integration mappings for analysis context
        integration_emails = set(m.source_identifier for m in integration_mappings)
        
        # Convert to common format and merge, with deduplication
        all_mappings = []
        seen_emails = set()
        
        # First, add manual mappings (they take priority)
        for manual_mapping in manual_mappings:
            # Check if this manual mapping is relevant to current analysis
            is_analysis_relevant = manual_mapping.source_identifier in integration_emails
            email = manual_mapping.source_identifier
            seen_emails.add(email)
            
            # Convert UserMapping to IntegrationMapping-like format
            mapping_dict = {
                "id": f"manual_{manual_mapping.id}",  # Prefix to avoid conflicts
                "source_identifier": manual_mapping.source_identifier,
                "target_identifier": manual_mapping.target_identifier,
                "target_platform": manual_mapping.target_platform,
                "mapping_successful": True,  # Manual mappings are considered successful
                "data_collected": False,  # Manual mappings don't have data collection status
                "data_points_count": 0,
                "created_at": manual_mapping.created_at.isoformat() if manual_mapping.created_at else None,
                "updated_at": manual_mapping.updated_at.isoformat() if manual_mapping.updated_at else None,
                "source": "manual",
                "is_manual": True,
                "mapping_type": manual_mapping.mapping_type,
                "status": manual_mapping.status,
                "confidence_score": manual_mapping.confidence_score,
                "last_verified": manual_mapping.last_verified.isoformat() if manual_mapping.last_verified else None,
                "is_analysis_relevant": is_analysis_relevant
            }
            all_mappings.append(mapping_dict)
        
        # Then add integration mappings, but skip emails that already have manual mappings
        for mapping in integration_mappings:
            email = mapping.source_identifier
            if email not in seen_emails:  # Only add if no manual mapping exists for this email
                mapping_dict = mapping.to_dict()
                mapping_dict["source"] = "integration"
                mapping_dict["is_manual"] = False
                all_mappings.append(mapping_dict)
                seen_emails.add(email)
        
        # Calculate proper team member statistics (including manual mappings)
        github_mappings = [m for m in all_mappings if m["target_platform"] == "github"]
        
        # Get unique team members from mappings (attempted mappings)
        unique_mapped_emails = set(m["source_identifier"] for m in github_mappings)
        attempted_mappings = len(unique_mapped_emails)
        
        # TEMPORARY FIX: Use attempted mappings as total team size to avoid math errors  
        # This will show accurate success rate based on who we actually attempted to map
        total_team_members = attempted_mappings  # Use consistent source
        
        logger.info(f"🚨 TEMP FIX (analysis): Using attempted mappings ({attempted_mappings}) as total team size to prevent math errors")
        
        # Count successful mappings (unique emails with successful mapping)
        successful_emails = set()
        members_with_data = 0
        
        logger.info(f"🔍 MAPPING DEBUG: Processing {len(github_mappings)} total mappings")
        for i, mapping in enumerate(github_mappings):
            email = mapping["source_identifier"] 
            target = mapping.get("target_identifier", "")
            is_successful = mapping["mapping_successful"]
            is_valid_target = target and target != "unknown" and target.strip() != ""
            
            logger.info(f"🔍 MAPPING {i+1}: {email} -> {target} | successful:{is_successful} | valid_target:{is_valid_target}")
            
            if is_successful and is_valid_target:
                successful_emails.add(email)
                if mapping.get("data_points_count") and mapping["data_points_count"] > 0:
                    members_with_data += 1
        
        successful_mappings = len(successful_emails)
        failed_mappings = attempted_mappings - successful_mappings  # Users with mapping attempts but no valid GitHub username
        
        # Calculate success rate based on attempted mappings (consistent denominator)
        success_rate = (successful_mappings / total_team_members * 100) if total_team_members > 0 else 0
        
        logger.info(f"🎯 CALCULATION SUMMARY:")
        logger.info(f"   - Total attempted mappings: {attempted_mappings}")
        logger.info(f"   - Successful mappings (valid GitHub usernames): {successful_mappings}")
        logger.info(f"   - Failed mappings (no GitHub username): {failed_mappings}")
        logger.info(f"   - Success rate: {success_rate:.1f}%")
        logger.info(f"   - Should show: {successful_mappings} mapped, {failed_mappings} unmapped")
        
        return {
            "mappings": all_mappings,
            "statistics": {
                "total_attempts": total_team_members,  # Total attempted (same as attempted_mappings with temp fix)
                "mapped_members": successful_mappings,  # Users with valid GitHub usernames
                "members_with_data": members_with_data,
                "overall_success_rate": round(success_rate, 1),
                "failed_mappings": failed_mappings,  # Users without valid GitHub usernames
                "manual_mappings_count": len([m for m in all_mappings if m["is_manual"]]),
                "attempted_mappings": attempted_mappings,
                "unmapped_members": failed_mappings  # Show failed mappings as unmapped
            },
            "analysis_id": analysis_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis mappings")

@router.get("/mappings/platform/{platform}", summary="Get mappings for specific platform")
async def get_platform_mappings(
    platform: str,
    limit: int = 50,  # Default limit to prevent overwhelming UI
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> List[dict]:
    """Get recent integration mappings for a specific target platform, including manual mappings and user names."""
    try:
        from ...models import UserMapping, Analysis
        import json
        
        # Get user names and check if GitHub was enabled in the most recent completed analysis
        user_name_lookup = {}
        github_was_enabled = False
        recent_analysis = db.query(Analysis).filter(
            Analysis.user_id == current_user.id,
            Analysis.status == "completed",
            Analysis.results.isnot(None)
        ).order_by(Analysis.created_at.desc()).first()
        
        if recent_analysis and recent_analysis.results:
            try:
                results = json.loads(recent_analysis.results) if isinstance(recent_analysis.results, str) else recent_analysis.results
                
                # Check if GitHub was enabled in the analysis
                data_sources = results.get("data_sources", {})
                github_was_enabled = data_sources.get("github_data", False) if isinstance(data_sources, dict) else "github" in data_sources
                
                team_analysis = results.get("team_analysis", {})
                members = team_analysis.get("members", []) if isinstance(team_analysis, dict) else team_analysis
                
                # Build email to name lookup
                for member in members:
                    email = member.get("user_email")
                    name = member.get("user_name")
                    if email and name:
                        user_name_lookup[email.lower()] = name
                        
                logger.info(f"🔍 DEBUG: Loaded {len(user_name_lookup)} user names from analysis {recent_analysis.id}")
                logger.info(f"🔍 DEBUG: GitHub was enabled in analysis: {github_was_enabled}")
            except Exception as e:
                logger.warning(f"Could not extract user names from analysis: {e}")
        
        # Get most recent integration mappings, limited to prevent UI overload
        integration_mappings = db.query(IntegrationMapping).filter(
            IntegrationMapping.user_id == current_user.id,
            IntegrationMapping.target_platform == platform
        ).order_by(IntegrationMapping.created_at.desc()).limit(limit).all()
        
        # Get manual mappings for this platform
        manual_mappings = db.query(UserMapping).filter(
            UserMapping.user_id == current_user.id,
            UserMapping.target_platform == platform
        ).all()
        
        # Revert to working dual-table approach temporarily
        all_mappings = []
        seen_emails = set()
        
        # First, add manual mappings (they take priority)
        for manual_mapping in manual_mappings:
            email = manual_mapping.source_identifier
            seen_emails.add(email)
            
            mapping_dict = {
                "id": f"manual_{manual_mapping.id}",  # Prefix to avoid conflicts
                "source_identifier": manual_mapping.source_identifier,
                "source_name": user_name_lookup.get(manual_mapping.source_identifier.lower(), ""),  # Add user name
                "target_identifier": manual_mapping.target_identifier,
                "target_platform": manual_mapping.target_platform,
                "mapping_successful": True,  # Manual mappings are considered successful
                "data_collected": False,  # Manual mappings don't have data collection status
                "data_points_count": 0,
                "created_at": manual_mapping.created_at.isoformat() if manual_mapping.created_at else None,
                "updated_at": manual_mapping.updated_at.isoformat() if manual_mapping.updated_at else None,
                "source": "manual",
                "is_manual": True,
                "mapping_type": manual_mapping.mapping_type,
                "status": manual_mapping.status,
                "confidence_score": manual_mapping.confidence_score,
                "last_verified": manual_mapping.last_verified.isoformat() if manual_mapping.last_verified else None,
                "mapping_method": "manual"  # Add this for the Method column
            }
            all_mappings.append(mapping_dict)
        
        # Then add integration mappings, but skip emails that already have manual mappings
        for mapping in integration_mappings:
            email = mapping.source_identifier
            if email not in seen_emails:  # Only add if no manual mapping exists for this email
                mapping_dict = mapping.to_dict()
                mapping_dict["source"] = "integration"
                mapping_dict["is_manual"] = False
                mapping_dict["source_name"] = user_name_lookup.get(email.lower(), "")  # Add user name
                all_mappings.append(mapping_dict)
                seen_emails.add(email)
        
        logger.info(f"🔍 DEBUG: Platform {platform} endpoint returning {len(integration_mappings)} integration + {len(manual_mappings)} manual mappings")
        
        return all_mappings
    except Exception as e:
        logger.error(f"Error fetching platform mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch platform mappings")

@router.get("/mappings/success-rate", summary="Get success rates by platform")
async def get_success_rates(
    platform: str = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> dict:
    """Get success rates broken down by platform combinations - now returns team member focused statistics.
    If platform is specified, returns statistics for that platform only."""
    try:
        from ...models import UserMapping, Analysis
        import json
        logger.info(f"🔍 DEBUG: Getting success rates for user {current_user.id}, platform: {platform}")
        
        # Check if GitHub was enabled in the most recent analysis
        github_was_enabled = False
        recent_analysis = db.query(Analysis).filter(
            Analysis.user_id == current_user.id,
            Analysis.status == "completed",
            Analysis.results.isnot(None)
        ).order_by(Analysis.created_at.desc()).first()
        
        if recent_analysis and recent_analysis.results:
            try:
                results = json.loads(recent_analysis.results) if isinstance(recent_analysis.results, str) else recent_analysis.results
                data_sources = results.get("data_sources", {})
                github_was_enabled = data_sources.get("github_data", False) if isinstance(data_sources, dict) else "github" in data_sources
            except Exception as e:
                logger.warning(f"Could not check if GitHub was enabled: {e}")
        
        # Get integration mappings for this user, optionally filtered by platform
        query = db.query(IntegrationMapping).filter(
            IntegrationMapping.user_id == current_user.id
        )
        
        if platform:
            query = query.filter(IntegrationMapping.target_platform == platform)
            logger.info(f"🔍 DEBUG: Filtering by platform: {platform}")
            
        # Apply same ordering and limit as platform endpoint to ensure consistency
        integration_mappings = query.order_by(IntegrationMapping.created_at.desc()).limit(50).all()
        
        # Get manual mappings for this platform
        manual_query = db.query(UserMapping).filter(
            UserMapping.user_id == current_user.id
        )
        if platform:
            manual_query = manual_query.filter(UserMapping.target_platform == platform)
        manual_mappings = manual_query.all()
        
        logger.info(f"🔍 DEBUG: Found {len(integration_mappings)} integration + {len(manual_mappings)} manual mappings for user {current_user.id}, platform: {platform}")
        
        if not integration_mappings and not manual_mappings:
            return {
                "overall_success_rate": 0,
                "total_attempts": 0,
                "mapped_members": 0,
                "members_with_data": 0
            }
        
        # Calculate team member statistics (unique by email) including both integration and manual mappings
        unique_emails = set()
        successful_emails = set()
        members_with_data = 0
        
        # Process integration mappings
        for mapping in integration_mappings:
            email = mapping.source_identifier
            unique_emails.add(email)
            
            # Count successful mappings (team members with successful mapping)
            if mapping.mapping_successful and mapping.target_identifier != "unknown":
                successful_emails.add(email)
                # Count members with actual data points
                if mapping.data_collected and mapping.data_points_count and mapping.data_points_count > 0:
                    members_with_data += 1
        
        # Process manual mappings (all are considered successful)
        for manual_mapping in manual_mappings:
            email = manual_mapping.source_identifier
            unique_emails.add(email)
            successful_emails.add(email)  # Manual mappings are always successful
            # Manual mappings don't have data collection
        
        # TEMPORARY FIX: Use attempted mappings as total team size to avoid math errors
        # This will show accurate success rate based on who we actually attempted to map
        attempted_mappings = len(unique_emails)
        total_team_members = attempted_mappings  # Use consistent source to avoid math errors
        
        logger.info(f"🚨 TEMP FIX: Using attempted mappings ({attempted_mappings}) as total team size to prevent negative numbers")
        
        total_successful = len(successful_emails)
        failed_mappings = attempted_mappings - total_successful  # Users with mapping attempts but no valid GitHub username
        overall_success_rate = (total_successful / total_team_members * 100) if total_team_members > 0 else 0
        
        logger.info(f"🎯 PLATFORM CALCULATION SUMMARY:")
        logger.info(f"   - Total team members (from analysis): {total_team_members}")
        logger.info(f"   - Attempted mappings (in DB): {attempted_mappings}") 
        logger.info(f"   - Successful mappings: {total_successful}")
        logger.info(f"   - Success rate: {overall_success_rate:.1f}%")
        logger.info(f"   - Unmapped members: {total_team_members - attempted_mappings}")
        logger.info(f"   - Integration mappings processed: {len(integration_mappings)}")
        logger.info(f"   - Manual mappings processed: {len(manual_mappings)}")
        
        logger.info(f"🔍 DEBUG: Calculated stats - Total: {total_team_members}, Successful: {total_successful}, Success Rate: {overall_success_rate:.1f}%, With Data: {members_with_data}")
        logger.info(f"🔍 DEBUG: Unique emails: {list(unique_emails)}")
        logger.info(f"🔍 DEBUG: Successful emails: {list(successful_emails)}")
        
        return {
            "overall_success_rate": round(overall_success_rate, 1),
            "total_attempts": total_team_members,
            "mapped_members": total_successful,
            "members_with_data": members_with_data,
            "manual_mappings_count": len(manual_mappings),
            "github_was_enabled": github_was_enabled if platform == "github" else None,
            "attempted_mappings": attempted_mappings,
            "unmapped_members": failed_mappings  # Users without valid GitHub usernames
        }
    except Exception as e:
        logger.error(f"Error fetching success rates: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch success rates")

@router.get("/mappings/github/health", summary="Get GitHub API health and performance metrics")
async def get_github_api_health(
    current_user: User = Depends(get_current_active_user)
) -> dict:
    """Get GitHub API manager health status and performance metrics."""
    try:
        from ...services.github_api_manager import github_api_manager
        health_status = github_api_manager.get_health_status()
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "github_api_health": health_status,
            "recommendations": _generate_health_recommendations(health_status)
        }
    except Exception as e:
        logger.error(f"Error fetching GitHub API health: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch GitHub API health")

@router.get("/mappings/github/cache-stats", summary="Get GitHub mapping cache statistics")
async def get_github_cache_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> dict:
    """Get GitHub mapping cache performance statistics."""
    try:
        from ...services.github_mapping_service import GitHubMappingService
        mapping_service = GitHubMappingService(db)
        cache_stats = mapping_service.get_cache_statistics(current_user.id)
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "cache_statistics": cache_stats,
            "performance_insights": _generate_cache_insights(cache_stats)
        }
    except Exception as e:
        logger.error(f"Error fetching cache statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch cache statistics")

def _generate_health_recommendations(health_status: dict) -> List[str]:
    """Generate actionable recommendations based on GitHub API health."""
    recommendations = []
    
    rate_limit = health_status.get("rate_limit_usage", {})
    performance = health_status.get("performance_metrics", {})
    circuit_state = health_status.get("circuit_breaker_state")
    
    # Rate limit recommendations
    usage_pct = rate_limit.get("usage_percentage", 0)
    if usage_pct > 90:
        recommendations.append("🚨 Rate limit usage is very high (>90%). Consider implementing request batching.")
    elif usage_pct > 70:
        recommendations.append("⚠️ Rate limit usage is elevated (>70%). Monitor usage closely.")
    
    # Circuit breaker recommendations
    if circuit_state == "open":
        recommendations.append("🔴 Circuit breaker is OPEN. GitHub API calls are being blocked due to failures.")
    elif circuit_state == "half_open":
        recommendations.append("🟡 Circuit breaker is HALF_OPEN. System is attempting recovery.")
    
    # Performance recommendations
    success_rate = performance.get("success_rate", 0)
    if success_rate < 90:
        recommendations.append(f"📉 Success rate is below 90% ({success_rate:.1f}%). Check API token and permissions.")
    
    avg_response = performance.get("average_response_time", 0)
    if avg_response > 5:
        recommendations.append(f"⏱️ Average response time is high ({avg_response:.2f}s). Consider request optimization.")
    
    if not recommendations:
        recommendations.append("✅ GitHub API health is good. No immediate action required.")
    
    return recommendations

def _generate_cache_insights(cache_stats: dict) -> List[str]:
    """Generate insights based on cache performance."""
    insights = []
    
    cache_efficiency = cache_stats.get("cache_efficiency", 0)
    total_mappings = cache_stats.get("total_mappings", 0)
    
    if cache_efficiency > 80:
        insights.append(f"🚀 Excellent cache efficiency ({cache_efficiency:.1f}%). Most mappings are being reused.")
    elif cache_efficiency > 60:
        insights.append(f"✅ Good cache efficiency ({cache_efficiency:.1f}%). Room for minor optimization.")
    elif cache_efficiency > 40:
        insights.append(f"⚠️ Moderate cache efficiency ({cache_efficiency:.1f}%). Consider reviewing mapping TTL policies.")
    else:
        insights.append(f"🔴 Low cache efficiency ({cache_efficiency:.1f}%). Many mappings are being recreated.")
    
    if total_mappings == 0:
        insights.append("ℹ️ No mapping data available yet. Cache statistics will improve after running analyses.")
    
    fresh_mappings = cache_stats.get("fresh_mappings", 0)
    stale_mappings = cache_stats.get("stale_mappings", 0)
    
    if stale_mappings > fresh_mappings:
        insights.append("🧹 Many stale mappings detected. Cache cleanup may improve performance.")
    
    return insights

def _validate_github_username_format(username: str) -> bool:
    """Validate GitHub username format."""
    if not username or len(username) < 1 or len(username) > 39:
        return False
    # GitHub username rules: alphanumeric and hyphens, cannot start/end with hyphen
    pattern = r'^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$'
    return bool(re.match(pattern, username))

async def _get_beta_github_organizations(github_token: str) -> List[str]:
    """Get organizations for beta GitHub token."""
    try:
        import httpx
        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            # Get user's organizations
            org_response = await client.get(
                "https://api.github.com/user/orgs", 
                headers=headers,
                timeout=10.0
            )
            
            if org_response.status_code == 200:
                orgs = org_response.json()
                return [org["login"] for org in orgs]
            else:
                logger.warning(f"Failed to get beta GitHub organizations: {org_response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Error getting beta GitHub organizations: {e}")
        return []

@router.get("/mappings/github/validate/{username}", summary="Validate GitHub username")
async def validate_github_username(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> dict:
    """Validate if a GitHub username exists and is accessible."""
    try:
        # Input validation
        if not _validate_github_username_format(username):
            return {
                "valid": False,
                "error": "Invalid username format",
                "message": "GitHub username must be 1-39 characters, alphanumeric with hyphens, cannot start/end with hyphen"
            }
        
        from ...models import GitHubIntegration
        
        # Get GitHub integration for auth - check personal first, then beta token
        integration = db.query(GitHubIntegration).filter(
            GitHubIntegration.user_id == current_user.id,
            GitHubIntegration.github_token.isnot(None)
        ).first()
        
        github_token = None
        beta_organizations = []
        is_beta_token = False
        
        if integration and integration.has_token:
            # Use personal GitHub token
            try:
                from ...api.endpoints.github import decrypt_token
                github_token = decrypt_token(integration.github_token)
                logger.info(f"Using personal GitHub token for validation by user {current_user.id}")
            except Exception as e:
                logger.error(f"Failed to decrypt GitHub token: {e}")
                return {
                    "valid": False,
                    "error": "Failed to decrypt token",
                    "message": "Token decryption error"
                }
        else:
            # Try beta GitHub token from environment
            beta_github_token = os.getenv('GITHUB_TOKEN')
            if beta_github_token:
                github_token = beta_github_token
                is_beta_token = True
                # Get organizations for beta token
                beta_organizations = await _get_beta_github_organizations(github_token)
                logger.info(f"Using beta GitHub token for validation by user {current_user.id}, orgs: {beta_organizations}")
        
        if not github_token:
            return {
                "valid": False,
                "error": "No GitHub integration found",
                "message": "Please connect GitHub integration first"
            }
        
        from ...services.github_api_manager import github_api_manager
        
        # Check if user exists
        user_info = await github_api_manager.fetch_user_info(
            username=username,
            token=github_token
        )
        
        if user_info and not user_info.get("error"):
            # Check organization membership
            org_list = []
            
            if is_beta_token:
                # For beta token, use the organizations from the beta token
                org_list = beta_organizations
            elif integration and integration.organizations:
                # For personal token, use configured organizations
                org_list = integration.organizations if isinstance(integration.organizations, list) else []
            
            # Perform organization check if we have organizations to check
            if org_list:
                from ...services.enhanced_github_matcher import EnhancedGitHubMatcher
                
                try:
                    matcher = EnhancedGitHubMatcher(github_token, org_list)
                    is_org_member = await matcher._verify_user_in_organizations(username)
                    
                    if not is_org_member:
                        org_names = ", ".join(org_list)
                        token_type = "beta GitHub token" if is_beta_token else "your configured"
                        return {
                            "valid": False,
                            "error": "Not in organization",
                            "message": f"GitHub user '{username}' is not a member of {token_type} organizations: {org_names}"
                        }
                except Exception as e:
                    logger.warning(f"Organization verification failed, proceeding without check: {e}")
                    # Continue without org check if verification fails
            
            return {
                "valid": True,
                "username": user_info.get("login"),
                "name": user_info.get("name"),
                "avatar_url": user_info.get("avatar_url"),
                "company": user_info.get("company"),
                "bio": user_info.get("bio"),
                "public_repos": user_info.get("public_repos"),
                "created_at": user_info.get("created_at")
            }
        else:
            return {
                "valid": False,
                "error": "User not found",
                "message": f"GitHub user '{username}' not found or not accessible"
            }
            
    except Exception as e:
        logger.error(f"Error validating GitHub username {username}: {e}")
        return {
            "valid": False,
            "error": "Validation failed", 
            "message": "Unable to validate GitHub username at this time"
        }

@router.put("/mappings/{mapping_id}/edit", summary="Edit a mapping's target identifier")
async def edit_mapping(
    mapping_id: int,
    new_target_identifier: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> dict:
    """Edit any mapping's target identifier (temporarily disabled during migration)."""
    return {
        "success": False,
        "error": "Feature temporarily disabled",
        "message": "Mapping editing is temporarily disabled during database migration. Please try again later."
    }

@router.post("/mappings/cleanup-duplicates", summary="Clean up duplicate mappings for all platforms")
async def cleanup_duplicate_mappings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> dict:
    """
    Clean up duplicate mappings for both GitHub and Slack, keeping only the most recent for each user-email-platform.
    This removes stale data from before Phase 1 fixes.
    """
    try:
        from sqlalchemy import text
        
        logger.info(f"🧹 Starting duplicate cleanup for user {current_user.id}")
        
        # Get duplicates for this user across all platforms
        query = text("""
        SELECT target_platform, source_identifier, COUNT(*) as duplicate_count,
               array_agg(id ORDER BY created_at DESC) as mapping_ids,
               array_agg(target_identifier ORDER BY created_at DESC) as usernames,
               array_agg(mapping_successful ORDER BY created_at DESC) as success_flags
        FROM integration_mappings 
        WHERE target_platform IN ('github', 'slack') AND user_id = :user_id
        GROUP BY target_platform, source_identifier 
        HAVING COUNT(*) > 1
        ORDER BY target_platform, COUNT(*) DESC
        """)
        
        duplicates = db.execute(query, {"user_id": current_user.id}).fetchall()
        
        if not duplicates:
            return {
                "message": "✅ No duplicate mappings found for your account",
                "duplicates_found": 0,
                "duplicates_removed": 0,
                "emails_processed": 0
            }
        
        total_deleted = 0
        emails_processed = 0
        platforms_processed = set()
        
        for row in duplicates:
            platform = row[0]
            email = row[1]
            duplicate_count = row[2]
            mapping_ids = row[3]  # Already sorted DESC by created_at
            usernames = row[4]
            success_flags = row[5]
            
            platforms_processed.add(platform)
            emails_processed += 1
            
            # Keep the most recent (first), delete the rest
            keep_id = mapping_ids[0]
            delete_ids = mapping_ids[1:]
            
            logger.info(f"📧 {platform} - {email}: Keeping ID {keep_id} -> {usernames[0]}, deleting {len(delete_ids)} older mappings")
            
            # Delete older mappings
            delete_query = text("DELETE FROM integration_mappings WHERE id = ANY(:ids)")
            result = db.execute(delete_query, {"ids": delete_ids})
            deleted_count = result.rowcount
            total_deleted += deleted_count
        
        # Commit all deletions
        db.commit()
        
        platforms_list = list(platforms_processed)
        logger.info(f"🎉 Cleanup complete: {emails_processed} email-platform combos processed, {total_deleted} duplicates removed across {platforms_list}")
        
        return {
            "message": f"🎉 Successfully cleaned up duplicate mappings across {len(platforms_processed)} platform(s)!",
            "duplicates_found": sum(row[2] - 1 for row in duplicates),  # Total duplicates (excluding kept ones)
            "duplicates_removed": total_deleted,
            "emails_processed": emails_processed,
            "platforms_processed": platforms_list,
            "next_steps": [
                "Run a new burnout analysis with GitHub/Slack integration",
                "Check GitHub and Slack Data Mapping modals",
                "Verify each team member appears only once per platform"
            ]
        }
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed for user {current_user.id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")