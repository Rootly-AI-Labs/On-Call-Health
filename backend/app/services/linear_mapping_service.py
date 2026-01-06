"""
Smart Linear Mapping Service - Enterprise-grade caching and data management.

Mirrors Jira mapping service:
- Separates stable mapping data (email -> linear_user_id) from dynamic activity data
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


class LinearMappingService:
    """
    Smart caching service for Linear mappings vs activity data.

    Design Principles:
    - Mapping data (email -> linear_user_id) is stable: cache for 7 days
    - Activity data (issues, workload) is dynamic: refresh per analysis
    - Failed mappings: retry every 24 hours
    """

    # Cache TTL policies
    MAPPING_CACHE_DAYS = 7      # Linear account mappings stable for week
    FAILED_RETRY_HOURS = 24     # Retry failed mappings daily

    def __init__(self, db: Session = None):
        self.db = db

    async def get_smart_linear_data(
        self,
        team_emails: List[str],
        linear_token: str = None,
        user_id: Optional[int] = None,
        analysis_id: Optional[int] = None,
        source_platform: str = "rootly"
    ) -> Dict[str, Dict]:
        """
        Smart Linear data collection with intelligent caching.

        Strategy:
        1. Check for recent successful mappings (reuse if < 7 days old)
        2. For cached mappings: use cached linear_user_id
        3. For missing/stale mappings: attempt new mapping
        4. For failed mappings: retry if > 24 hours old
        """
        logger.info(f"🧠 SMART CACHING: Processing {len(team_emails)} emails for Linear analysis {analysis_id}")

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
                    'linear_user_id': cached_mapping.target_identifier,
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
            IntegrationMapping.target_platform == "linear"
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
        linear_users: List[Dict[str, Any]],
        user_id: Optional[int] = None,
        source_platform: str = "rootly"
    ) -> Dict[str, Any]:
        """
        Auto-map team members to Linear users using email-first strategy.

        Used during manual "Run Auto-Mapping" button click to create persistent mappings.
        Uses EnhancedLinearMatcher for sophisticated email and name-based matching.

        Args:
            team_members: List of team member dicts with email, name
            linear_users: List of Linear user dicts with id, name, email
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

        from .enhanced_linear_matcher import EnhancedLinearMatcher
        from .manual_mapping_service import ManualMappingService

        matcher = EnhancedLinearMatcher()
        mapping_service = ManualMappingService(self.db)
        mapped_count = 0
        not_found_count = 0
        error_count = 0

        logger.info(f"🔄 Auto-mapping {len(team_members)} team members to Linear users")

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
                    match_result = await matcher.match_email_to_linear(
                        team_email=team_email,
                        linear_users=linear_users,
                        confidence_threshold=0.70
                    )
                    if match_result:
                        match_method = "email"

                # Fall back to name matching
                if not match_result and team_name:
                    logger.debug(f"Trying name match for {team_name}")
                    match_result = await matcher.match_name_to_linear(
                        team_name=team_name,
                        linear_users=linear_users,
                        confidence_threshold=0.70
                    )
                    if match_result:
                        match_method = "name"

                if match_result:
                    linear_user_id, linear_display_name, confidence_score = match_result
                    source_identifier = team_email or team_name

                    # Create persistent UserMapping record
                    mapping_service.create_mapping(
                        user_id=user_id,
                        source_platform=source_platform,
                        source_identifier=source_identifier,
                        target_platform="linear",
                        target_identifier=linear_user_id,
                        created_by=user_id,
                        mapping_type="automated"
                    )

                    results.append({
                        "email": team_email,
                        "name": team_name,
                        "linear_user_id": linear_user_id,
                        "linear_display_name": linear_display_name,
                        "status": "mapped",
                        "match_method": match_method,
                        "confidence": confidence_score
                    })
                    mapped_count += 1
                    logger.info(
                        f"✅ Mapped {team_email or team_name} -> {linear_user_id} "
                        f"({linear_display_name}) via {match_method}"
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

    def record_linear_mappings(
        self,
        team_emails: List[str],
        linear_workload_data: Dict[str, Any],
        user_id: Optional[int] = None,
        analysis_id: Optional[int] = None,
        source_platform: str = "rootly"
    ) -> Dict[str, Any]:
        """
        Records Linear user mappings for team emails using workload data.

        Args:
            team_emails: List of team member emails to map
            linear_workload_data: Dict with linear_user_id -> {name, email, count, priorities, tickets}
            user_id: Current user ID for tracking
            analysis_id: Analysis ID for tracking
            source_platform: Source platform name (default: "rootly")

        Returns:
            Statistics: {mapped, failed, skipped, total, success_rate, results}
        """
        if not self.db:
            logger.warning("Cannot record mappings without database context")
            return {
                "mapped": 0,
                "failed": len(team_emails),
                "skipped": 0,
                "total": len(team_emails),
                "success_rate": 0.0,
                "reason": "no_db_context"
            }

        from .mapping_recorder import MappingRecorder

        recorder = MappingRecorder(self.db)
        mapped_count = 0
        failed_count = 0
        skipped_count = 0

        # Build lookups from workload data
        linear_users_by_email = {}
        linear_users_by_name = {}

        for linear_user_id, user_data in linear_workload_data.items():
            user_email = user_data.get("assignee_email", "").lower() if user_data.get("assignee_email") else None
            user_name = user_data.get("assignee_name", "")
            ticket_count = user_data.get("count", 0)

            if user_email:
                linear_users_by_email[user_email] = (linear_user_id, user_name, ticket_count)
            if user_name:
                linear_users_by_name[user_name] = (linear_user_id, user_email, ticket_count)

        logger.info(f"📋 Recording Linear mappings for {len(team_emails)} emails")
        logger.debug(f"Lookup tables: {len(linear_users_by_email)} by email, {len(linear_users_by_name)} by name")

        results = []

        for email in team_emails:
            email_lower = email.lower()

            # Strategy 1: Try exact email match
            if email_lower in linear_users_by_email:
                linear_user_id, name, ticket_count = linear_users_by_email[email_lower]

                # Record successful mapping
                recorder.record_successful_mapping(
                    user_id=user_id,
                    analysis_id=analysis_id,
                    source_platform=source_platform,
                    source_identifier=email,
                    target_platform="linear",
                    target_identifier=linear_user_id,
                    mapping_method="email_match",
                    data_points_count=ticket_count
                )

                results.append({
                    "email": email,
                    "linear_user_id": linear_user_id,
                    "linear_display_name": name,
                    "status": "mapped",
                    "method": "email",
                    "ticket_count": ticket_count
                })
                mapped_count += 1
                logger.debug(f"✅ Email match: {email} -> {linear_user_id} ({name})")

            else:
                # Record failed mapping
                recorder.record_failed_mapping(
                    user_id=user_id,
                    analysis_id=analysis_id,
                    source_platform=source_platform,
                    source_identifier=email,
                    target_platform="linear",
                    error_message="No Linear user found with matching email",
                    mapping_method="email_search"
                )

                results.append({
                    "email": email,
                    "status": "failed",
                    "error": "No matching email found"
                })
                failed_count += 1
                logger.debug(f"❌ No match: {email}")

        total = len(team_emails)
        success_rate = (mapped_count / total * 100) if total > 0 else 0

        stats = {
            "mapped": mapped_count,
            "failed": failed_count,
            "skipped": skipped_count,
            "total": total,
            "success_rate": success_rate,
            "results": results
        }

        logger.info(
            f"📊 Mapping complete: {mapped_count} mapped, {failed_count} failed, "
            f"{skipped_count} skipped ({success_rate:.1f}% success)"
        )

        return stats
