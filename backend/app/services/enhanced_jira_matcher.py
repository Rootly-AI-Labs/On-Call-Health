"""
Enhanced Jira matcher for auto-mapping users to Jira accounts.

Matches by email first (exact match), falls back to fuzzy name matching.
Implements global caching for Jira workspace users to optimize repeated lookups.
"""
import logging
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

# Global cache for Jira users per workspace
_jira_users_cache: Dict[str, List[Dict]] = {}


class EnhancedJiraMatcher:
    """
    Matches team members to Jira users using email-based and name-based strategies.

    Strategy:
    1. Try exact email match (case-insensitive)
    2. Fall back to fuzzy name matching (>70% similarity threshold)
    """

    def __init__(self):
        self.cache = _jira_users_cache

    async def match_email_to_jira(
        self,
        team_email: str,
        jira_users: List[Dict],
        confidence_threshold: float = 0.70
    ) -> Optional[Tuple[str, str, float]]:
        """
        Match a team email to a Jira user.

        Args:
            team_email: Email from Rootly/PagerDuty
            jira_users: List of Jira users with account_id, email, displayName
            confidence_threshold: Minimum similarity score (0-1.0)

        Returns:
            Tuple of (jira_account_id, jira_display_name, confidence_score) or None
        """
        team_email_lower = team_email.lower()

        # Strategy 1: Try exact email match first
        for jira_user in jira_users:
            jira_email = jira_user.get("email")
            if jira_email and jira_email.lower() == team_email_lower:
                account_id = jira_user.get("account_id")
                display_name = jira_user.get("display_name")
                logger.debug(f"✅ Email match: {team_email} -> {account_id} ({display_name})")
                return (account_id, display_name, 1.0)

        # Strategy 2: Try fuzzy name matching as fallback
        # Extract name from email (part before @)
        email_name = team_email.split("@")[0].lower()

        best_match = None
        best_score = 0.0

        for jira_user in jira_users:
            display_name = jira_user.get("display_name", "").lower()
            account_id = jira_user.get("account_id")

            if not display_name or not account_id:
                continue

            # Try full name matching
            score = SequenceMatcher(None, email_name, display_name).ratio()

            # Also try component matching (first/last name parts)
            email_parts = email_name.split(".")
            display_parts = display_name.split()

            # Check if email parts are in display name
            if len(email_parts) >= 1 and len(display_parts) >= 1:
                # Check if first part matches first name
                if email_parts[0] and display_parts[0]:
                    first_name_score = SequenceMatcher(
                        None,
                        email_parts[0],
                        display_parts[0]
                    ).ratio()
                    score = max(score, first_name_score * 0.85)

            # Check if all email parts appear in display name
            if len(email_parts) >= 2 and len(display_parts) >= 2:
                if email_parts[-1] and display_parts[-1]:
                    last_name_score = SequenceMatcher(
                        None,
                        email_parts[-1],
                        display_parts[-1]
                    ).ratio()
                    if last_name_score > 0.85:
                        score = max(score, 0.75)

            if score > best_score and score >= confidence_threshold:
                best_score = score
                best_match = (account_id, jira_user.get("display_name"), score)

        if best_match:
            account_id, display_name, score = best_match
            logger.debug(
                f"⚠️  Name match: {team_email} -> {account_id} ({display_name}) "
                f"(score: {score:.2f})"
            )
            return best_match

        logger.debug(f"❌ No match found for {team_email}")
        return None

    async def match_name_to_jira(
        self,
        team_name: str,
        jira_users: List[Dict],
        confidence_threshold: float = 0.70
    ) -> Optional[Tuple[str, str, float]]:
        """
        Match a team member name to a Jira user.
        Used as fallback when email is not available.

        Args:
            team_name: Display name (e.g., "John Doe")
            jira_users: List of Jira users
            confidence_threshold: Minimum similarity score

        Returns:
            Tuple of (jira_account_id, jira_display_name, confidence_score) or None
        """
        team_name_lower = team_name.lower().strip()

        best_match = None
        best_score = 0.0

        for jira_user in jira_users:
            jira_name = jira_user.get("display_name", "").lower().strip()
            account_id = jira_user.get("account_id")

            if not jira_name or not account_id:
                continue

            # Direct name similarity
            score = SequenceMatcher(None, team_name_lower, jira_name).ratio()

            # Component-based matching for names like "John Doe" vs "Doe, John"
            team_parts = team_name_lower.split()
            jira_parts = jira_name.split()

            # Check if both parts of name appear (regardless of order)
            if len(team_parts) >= 2 and len(jira_parts) >= 2:
                # Last name match is strongest indicator
                if (team_parts[-1] in jira_name and team_parts[0] in jira_name):
                    score = max(score, 0.80)

            if score > best_score and score >= confidence_threshold:
                best_score = score
                best_match = (account_id, jira_user.get("display_name"), score)

        if best_match:
            account_id, display_name, score = best_match
            logger.debug(
                f"⚠️  Name match: {team_name} -> {account_id} ({display_name}) "
                f"(score: {score:.2f})"
            )
            return best_match

        return None

    def get_cached_jira_users(self, workspace_id: str) -> Optional[List[Dict]]:
        """Get cached Jira users for workspace."""
        return self.cache.get(workspace_id)

    def cache_jira_users(self, workspace_id: str, users: List[Dict]) -> None:
        """Cache Jira users for workspace."""
        self.cache[workspace_id] = users
        logger.info(f"Cached {len(users)} Jira users for workspace {workspace_id}")

    def clear_cache(self, workspace_id: Optional[str] = None) -> None:
        """Clear cache for specific workspace or all workspaces."""
        if workspace_id:
            if workspace_id in self.cache:
                del self.cache[workspace_id]
                logger.info(f"Cleared Jira user cache for workspace {workspace_id}")
        else:
            self.cache.clear()
            logger.info("Cleared all Jira user cache")
