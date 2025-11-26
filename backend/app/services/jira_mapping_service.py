"""
Smart Jira Mapping Service - Enterprise-grade caching and data management.

Mirrors GitHub mapping service:
- Separates stable mapping data (email -> jira_account_id) from dynamic activity data
- Implements intelligent caching to optimize performance
- Supports both email-based and name-based matching
- Records auto-detected mappings to IntegrationMapping table for analysis tracking
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from sqlalchemy.orm import Session
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


class JiraMappingService:
    """
    Smart caching service for Jira mappings vs activity data.

    Design Principles:
    - Mapping data (email -> jira_account_id) is stable: cache for 7 days
    - Activity data (tickets, workload) is dynamic: refresh per analysis
    - Failed mappings: retry every 24 hours
    """

    # Cache TTL policies
    MAPPING_CACHE_DAYS = 7      # Jira account mappings stable for week
    FAILED_RETRY_HOURS = 24     # Retry failed mappings daily

    def __init__(self, db: Session = None):
        self.db = db

    async def get_smart_jira_data(
        self,
        team_emails: List[str],
        jira_token: str = None,
        user_id: Optional[int] = None,
        analysis_id: Optional[int] = None,
        source_platform: str = "rootly"
    ) -> Dict[str, Dict]:
        """
        Smart Jira data collection with intelligent caching.

        Strategy:
        1. Check for recent successful mappings (reuse if < 7 days old)
        2. For cached mappings: use cached account_id
        3. For missing/stale mappings: attempt new mapping
        4. For failed mappings: retry if > 24 hours old
        """
        logger.info(f"🧠 SMART CACHING: Processing {len(team_emails)} emails for Jira analysis {analysis_id}")

        results = {}
        emails_needing_mapping = []
        cache_stats = {"hits": 0, "misses": 0, "refreshes": 0, "retries": 0}

        # Phase 1: Analyze cache status for each email
        for email in team_emails:
            cached_mapping = self._get_cached_mapping(email, user_id)

            if cached_mapping and self._is_mapping_fresh(cached_mapping):
                # Cache HIT: Reuse mapping
                cache_stats["hits"] += 1
                results[email] = {
                    'jira_account_id': cached_mapping.target_identifier,
                    'source': 'cache',
                    'cached': True
                }
                logger.debug(f"📋 Cache HIT: {email} -> {cached_mapping.target_identifier}")

            elif cached_mapping and self._is_mapping_stale(cached_mapping):
                # Cache STALE: Mapping old, needs refresh
                cache_stats["refreshes"] += 1
                emails_needing_mapping.append(email)
                logger.debug(f"🔄 Cache STALE: {email} mapping is {self._get_mapping_age_days(cached_mapping)} days old")

            elif cached_mapping and not cached_mapping.mapping_successful:
                # Failed mapping: retry if enough time passed
                if self._should_retry_failed_mapping(cached_mapping):
                    cache_stats["retries"] += 1
                    emails_needing_mapping.append(email)
                    logger.debug(f"🔄 RETRY: {email} failed mapping ready for retry")
                else:
                    logger.debug(f"⏳ SKIP: {email} failed mapping too recent to retry")

            else:
                # Cache MISS: No mapping exists
                cache_stats["misses"] += 1
                emails_needing_mapping.append(email)
                logger.debug(f"❌ Cache MISS: {email} no mapping found")

        # Phase 2: Create new mappings for cache misses (not implemented in this service)
        # This will be handled by the sync service or analysis pipeline
        if emails_needing_mapping:
            logger.info(f"🆕 NEW MAPPINGS: {len(emails_needing_mapping)} emails need mapping")

        # Log performance metrics
        total_emails = len(team_emails)
        cache_hit_rate = (cache_stats["hits"] / total_emails) * 100 if total_emails > 0 else 0
        logger.info(f"📊 CACHE PERFORMANCE: {cache_hit_rate:.1f}% hit rate - "
                   f"Hits: {cache_stats['hits']}, Misses: {cache_stats['misses']}, "
                   f"Refreshes: {cache_stats['refreshes']}, Retries: {cache_stats['retries']}")

        return results

    def _get_cached_mapping(self, email: str, user_id: int) -> Optional[Any]:
        """Get the most recent mapping for an email."""
        if not self.db:
            return None

        from ..models import IntegrationMapping
        return self.db.query(IntegrationMapping).filter(
            IntegrationMapping.user_id == user_id,
            IntegrationMapping.source_identifier == email,
            IntegrationMapping.target_platform == "jira"
        ).order_by(IntegrationMapping.created_at.desc()).first()

    def _is_mapping_fresh(self, mapping) -> bool:
        """Check if mapping is fresh (successful and < 7 days old)."""
        if not mapping.mapping_successful:
            return False
        age_days = self._get_mapping_age_days(mapping)
        return age_days < self.MAPPING_CACHE_DAYS

    def _is_mapping_stale(self, mapping) -> bool:
        """Check if mapping is stale (successful but > 7 days old)."""
        if not mapping.mapping_successful:
            return False
        age_days = self._get_mapping_age_days(mapping)
        return age_days >= self.MAPPING_CACHE_DAYS

    def _should_retry_failed_mapping(self, mapping) -> bool:
        """Check if failed mapping should be retried (> 24 hours old)."""
        if mapping.mapping_successful:
            return False
        age_hours = self._get_mapping_age_hours(mapping)
        return age_hours >= self.FAILED_RETRY_HOURS

    def _get_mapping_age_days(self, mapping) -> int:
        """Get age of mapping in days."""
        now = datetime.utcnow()
        age = now - mapping.created_at
        return age.days

    def _get_mapping_age_hours(self, mapping) -> int:
        """Get age of mapping in hours."""
        now = datetime.utcnow()
        age = now - mapping.created_at
        return int(age.total_seconds() / 3600)

    async def auto_map_users(
        self,
        team_members: List[Dict[str, Any]],
        jira_users: List[Dict[str, Any]],
        user_id: Optional[int] = None,
        source_platform: str = "rootly"
    ) -> Dict[str, Any]:
        """
        Auto-map team members to Jira users using email-first strategy.

        Used during manual "Run Auto-Mapping" button click to create persistent mappings.
        Uses EnhancedJiraMatcher for sophisticated email and name-based matching.

        Args:
            team_members: List of team member dicts with email, name
            jira_users: List of Jira user dicts with account_id, email, display_name
            user_id: Current user for context
            source_platform: Source platform name (default: "rootly")

        Returns:
            Mapping statistics with per-user results
        """
        if not user_id or not self.db:
            logger.warning("Cannot auto-map without user_id or database context")
            return {
                "total_processed": len(team_members),
                "mapped": 0,
                "not_found": 0,
                "errors": 0,
                "success_rate": 0.0,
                "reason": "missing_context"
            }

        from .enhanced_jira_matcher import EnhancedJiraMatcher
        from .manual_mapping_service import ManualMappingService

        matcher = EnhancedJiraMatcher()
        mapping_service = ManualMappingService(self.db)
        mapped_count = 0
        not_found_count = 0
        error_count = 0

        logger.info(f"🔄 Auto-mapping {len(team_members)} team members to Jira users")

        results = []

        for team_member in team_members:
            team_email = team_member.get("email")
            team_name = team_member.get("name")
            match_result = None
            match_method = None

            try:
                # Try email-based matching first
                if team_email:
                    logger.debug(f"Trying email match for {team_email}")
                    match_result = await matcher.match_email_to_jira(
                        team_email=team_email,
                        jira_users=jira_users,
                        confidence_threshold=0.70
                    )
                    if match_result:
                        match_method = "email"

                # Fall back to name matching
                if not match_result and team_name:
                    logger.debug(f"Trying name match for {team_name}")
                    match_result = await matcher.match_name_to_jira(
                        team_name=team_name,
                        jira_users=jira_users,
                        confidence_threshold=0.70
                    )
                    if match_result:
                        match_method = "name"

                if match_result:
                    jira_account_id, jira_display_name, confidence_score = match_result
                    source_identifier = team_email or team_name

                    # Create persistent UserMapping record
                    mapping_service.create_mapping(
                        user_id=user_id,
                        source_platform=source_platform,
                        source_identifier=source_identifier,
                        target_platform="jira",
                        target_identifier=jira_account_id,
                        created_by=user_id,
                        mapping_type="automated"
                    )

                    results.append({
                        "email": team_email,
                        "name": team_name,
                        "jira_account_id": jira_account_id,
                        "jira_display_name": jira_display_name,
                        "status": "mapped",
                        "match_method": match_method,
                        "confidence": confidence_score
                    })
                    mapped_count += 1
                    logger.info(
                        f"✅ Mapped {team_email or team_name} -> {jira_account_id} "
                        f"({jira_display_name}) via {match_method}"
                    )
                else:
                    results.append({
                        "email": team_email,
                        "name": team_name,
                        "status": "not_found"
                    })
                    not_found_count += 1
                    logger.debug(f"❌ No match for {team_email or team_name}")

            except Exception as e:
                identifier = team_email or team_name or "unknown"
                logger.error(f"Error mapping {identifier}: {e}")
                results.append({
                    "email": team_email,
                    "name": team_name,
                    "status": "error",
                    "error": str(e)
                })
                error_count += 1

        stats = {
            "total_processed": len(team_members),
            "mapped": mapped_count,
            "not_found": not_found_count,
            "errors": error_count,
            "success_rate": (mapped_count / len(team_members) * 100) if team_members else 0,
            "results": results
        }

        logger.info(
            f"🎯 Auto-mapping complete: {mapped_count} mapped, "
            f"{not_found_count} not found, {error_count} errors "
            f"({stats['success_rate']:.1f}% success)"
        )

        return stats

    def record_jira_mappings(
        self,
        team_emails: List[str],
        jira_workload_data: Dict[str, Any],
        user_id: Optional[int] = None,
        analysis_id: Optional[int] = None,
        source_platform: str = "rootly"
    ) -> Dict[str, Any]:
        """
        Record auto-detected Jira mappings from workload data.

        Strategy:
        1. For each team email, try to find matching Jira user by email (exact match)
        2. Fall back to fuzzy name matching if email not found
        3. Record successful/failed mappings to IntegrationMapping table
        4. Track data points (ticket count)

        Args:
            team_emails: List of source platform emails (from Rootly/PagerDuty)
            jira_workload_data: Per-responder workload data from Jira API
                {
                    "assignee_account_id": "...",
                    "assignee_email": "...",
                    "assignee_name": "...",
                    "count": 15,  # ticket count
                    "priorities": {...},
                    "tickets": [...]
                }
            user_id: Current user for context
            analysis_id: Analysis that triggered this mapping
            source_platform: Source platform name (default: "rootly")

        Returns:
            Mapping statistics
        """
        if not user_id or not self.db:
            logger.warning("Cannot record Jira mappings without user_id or database context")
            return {
                "mapped": 0,
                "failed": 0,
                "skipped": 0,
                "total": len(team_emails),
                "reason": "missing_context"
            }

        from .mapping_recorder import MappingRecorder

        recorder = MappingRecorder(self.db)
        mapped_count = 0
        failed_count = 0
        skipped_count = 0

        logger.info(f"📊 Recording Jira mappings for {len(team_emails)} team emails")

        # Build lookup: email -> account_id from workload data
        jira_users_by_email: Dict[str, Tuple[str, str, int]] = {}  # email -> (account_id, name, ticket_count)
        jira_users_by_name: Dict[str, Tuple[str, str, int]] = {}   # name -> (account_id, email, ticket_count)

        for jira_user in jira_workload_data.values() if isinstance(jira_workload_data, dict) else []:
            account_id = jira_user.get("assignee_account_id")
            email = jira_user.get("assignee_email")
            name = jira_user.get("assignee_name")
            ticket_count = jira_user.get("count", 0)

            if account_id and email:
                jira_users_by_email[email.lower()] = (account_id, name, ticket_count)

            if account_id and name:
                jira_users_by_name[name.lower()] = (account_id, email, ticket_count)

        logger.debug(f"Built lookup: {len(jira_users_by_email)} by email, {len(jira_users_by_name)} by name")

        # Try to match each team email to a Jira user
        for team_email in team_emails:
            team_email_lower = team_email.lower()
            account_id = None
            jira_email = None
            jira_name = None
            ticket_count = 0
            match_method = None

            # Strategy 1: Try exact email match first
            if team_email_lower in jira_users_by_email:
                account_id, jira_name, ticket_count = jira_users_by_email[team_email_lower]
                jira_email = team_email
                match_method = "email_match"
                logger.debug(f"✅ Email match: {team_email} -> {account_id}")

            # Strategy 2: Try fuzzy name matching as fallback
            # (would require name mapping which we don't have in this context)
            # For now, we only record email matches

            if account_id and match_method:
                # Record successful mapping
                recorder.record_successful_mapping(
                    user_id=user_id,
                    analysis_id=analysis_id,
                    source_platform=source_platform,
                    source_identifier=team_email,
                    target_platform="jira",
                    target_identifier=account_id,
                    mapping_method=match_method,
                    data_points_count=ticket_count
                )
                mapped_count += 1
                logger.info(
                    f"💾 Recorded Jira mapping: {team_email} -> {account_id} "
                    f"({jira_name}, {ticket_count} tickets) via {match_method}"
                )
            else:
                # Record failed mapping
                recorder.record_failed_mapping(
                    user_id=user_id,
                    analysis_id=analysis_id,
                    source_platform=source_platform,
                    source_identifier=team_email,
                    target_platform="jira",
                    error_message="No Jira user found with matching email",
                    mapping_method="email_search"
                )
                failed_count += 1
                logger.debug(f"❌ Failed to map: {team_email}")

        stats = {
            "mapped": mapped_count,
            "failed": failed_count,
            "skipped": skipped_count,
            "total": len(team_emails),
            "success_rate": (mapped_count / len(team_emails) * 100) if team_emails else 0
        }

        logger.info(
            f"📊 Jira mapping complete: {mapped_count} mapped, "
            f"{failed_count} failed, {skipped_count} skipped "
            f"({stats['success_rate']:.1f}% success rate)"
        )

        return stats
