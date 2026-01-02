"""
Enhanced GitHub collector that records mapping data with smart caching.
"""
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from .github_collector import collect_team_github_data as original_collect_team_github_data
from .mapping_recorder import MappingRecorder

logger = logging.getLogger(__name__)

async def collect_team_github_data_with_mapping(
    team_emails: List[str], 
    days: int = 30, 
    github_token: str = None,
    user_id: Optional[int] = None,
    analysis_id: Optional[int] = None,
    source_platform: str = "rootly",
    email_to_name: Optional[Dict[str, str]] = None
) -> Dict[str, Dict]:
    """
    Enhanced version of collect_team_github_data that records mapping attempts.
    
    Phase 2: Uses smart caching service when enabled, falls back to original logic.
    """
    # Phase 2: Check if smart caching is enabled
    use_smart_caching = os.getenv('USE_SMART_GITHUB_CACHING', 'true').lower() == 'true'
    
    # OPTIMIZATION: Check if we should use fast mode for analysis performance
    # DISABLED by default - fast mode was using mock data instead of real GitHub API data
    # User requested: "i dont want any hardcoded mappings nor any fake data"
    fast_mode = os.getenv('GITHUB_FAST_MODE', 'false').lower() == 'true'
    
    # FAST MODE: Only use existing synced mappings from integrations page
    # This avoids redundant GitHub API calls since users are synced via "Sync Members"
    if fast_mode and user_id:
        from .github_collector import GitHubCollector
        from ..models import UserCorrelation
        from ..models import SessionLocal

        db = SessionLocal()
        try:
            collector = GitHubCollector()
            github_data = {}

            # Query UserCorrelation for synced GitHub usernames
            # Don't filter by user_id - allow lookups across the organization
            user_correlations = db.query(UserCorrelation).filter(
                UserCorrelation.email.in_(team_emails),
                UserCorrelation.github_username.isnot(None)
            ).all()

            # Create a lookup dict: email -> github_username
            email_to_github = {uc.email: uc.github_username for uc in user_correlations}

            if len(email_to_github) == 0:
                logger.warning(f"💻 GitHub: No synced usernames found in UserCorrelation")

            # Generate mock data for users with synced mappings
            for email in team_emails:
                github_username = email_to_github.get(email)
                if github_username:
                    github_data[email] = collector._generate_mock_github_data(
                        github_username, email,
                        datetime.now() - timedelta(days=days),
                        datetime.now()
                    )

            return github_data
        finally:
            db.close()
    
    if use_smart_caching and user_id:
        try:
            from .github_mapping_service import GitHubMappingService
            mapping_service = GitHubMappingService()
            return await mapping_service.get_smart_github_data(
                team_emails=team_emails,
                days=days,
                github_token=github_token,
                user_id=user_id,
                analysis_id=analysis_id,
                source_platform=source_platform,
                email_to_name=email_to_name
            )
        except Exception as e:
            logger.error(f"💻 GitHub: Smart caching failed: {e}")
            # Fall through to original logic
    recorder = MappingRecorder() if user_id else None
    
    # Phase 1.3: Track processed emails to prevent duplicates within this analysis session
    processed_emails = set()
    
    # Call original function with user_id for manual mapping support
    # Pass email_to_name mapping for better GitHub username matching
    from .github_collector import GitHubCollector
    collector = GitHubCollector()
    github_data = {}
    
    for email in team_emails:
        try:
            # Get full name for this email if available
            full_name = email_to_name.get(email) if email_to_name else None
            
            # Collect data with full name for better matching
            user_data = await collector.collect_github_data_for_user(
                email, days, github_token, user_id, full_name=full_name
            )
            if user_data:
                github_data[email] = user_data
        except Exception as e:
            logger.error(f"Failed to collect GitHub data for {email}: {e}")
    
    # Record mapping attempts if we have user context
    if recorder and user_id:
        for email in team_emails:
            # Phase 1.3: Skip if already processed in this session
            if email in processed_emails:
                logger.debug(f"Skipping {email} - already processed in this analysis session")
                continue
            processed_emails.add(email)
            if email in github_data:
                # Successful mapping
                data_points = 0
                user_data = github_data[email]
                
                # Count data points from actual GitHub data structure
                if isinstance(user_data, dict):
                    metrics = user_data.get("metrics", {})
                    data_points += metrics.get("total_commits", 0)
                    data_points += metrics.get("total_pull_requests", 0)
                    data_points += metrics.get("total_reviews", 0)
                
                # Try to extract the GitHub username from the data
                github_username = None

                # Extract from data
                if isinstance(user_data, dict) and "username" in user_data:
                    github_username = user_data["username"]
                elif isinstance(user_data, dict) and "github_username" in user_data:
                    github_username = user_data["github_username"]

                # Look up user_id and organization_id for this specific email
                member_user_id, org_id = recorder.get_user_and_org_for_email(email, analysis_id)

                if github_username:
                    # All mappings are now discovered via API
                    mapping_method = "api_discovery"

                    recorder.record_successful_mapping(
                        user_id=member_user_id,  # NULL if team member hasn't logged in
                        organization_id=org_id,
                        analysis_id=analysis_id,
                        source_platform=source_platform,
                        source_identifier=email,
                        target_platform="github",
                        target_identifier=github_username,
                        mapping_method=mapping_method,
                        data_points_count=data_points
                    )
                    logger.info(f"💻 GitHub: {email} -> {github_username} ({data_points} data points)")
                else:
                    # Data collected but no clear username
                    recorder.record_successful_mapping(
                        user_id=member_user_id,
                        organization_id=org_id,
                        analysis_id=analysis_id,
                        source_platform=source_platform,
                        source_identifier=email,
                        target_platform="github",
                        target_identifier="unknown",
                        mapping_method="api_collection",
                        data_points_count=data_points
                    )
            else:
                # Look up user_id and organization_id for failed mapping too
                member_user_id, org_id = recorder.get_user_and_org_for_email(email, analysis_id)

                # Failed mapping
                recorder.record_failed_mapping(
                    user_id=member_user_id,
                    organization_id=org_id,
                    analysis_id=analysis_id,
                    source_platform=source_platform,
                    source_identifier=email,
                    target_platform="github",
                    error_message="No GitHub data found for email",
                    mapping_method="email_search"
                )
    
    return github_data