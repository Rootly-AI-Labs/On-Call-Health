"""
Enhanced Linear matcher for auto-mapping users to Linear accounts.

Matches by email first (exact match), falls back to fuzzy name matching.
Implements global caching for Linear workspace users to optimize repeated lookups.
"""
import logging
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

# Global cache for Linear users per workspace
_linear_users_cache: Dict[str, List[Dict]] = {}


class EnhancedLinearMatcher:
    """
    Matches team members to Linear users using email-based and name-based strategies.

    Strategy:
    1. Try exact email match (case-insensitive)
    2. Fall back to fuzzy name matching (>70% similarity threshold)
    """

    def __init__(self):
        self.cache = _linear_users_cache

    async def match_email_to_linear(
        self,
        team_email: str,
        linear_users: List[Dict],
        confidence_threshold: float = 0.70
    ) -> Optional[Tuple[str, str, float]]:
        """
        Match a team email to a Linear user.

        Args:
            team_email: Email from Rootly/PagerDuty
            linear_users: List of Linear users with id, email, name
            confidence_threshold: Minimum similarity score (0-1.0)

        Returns:
            Tuple of (linear_user_id, linear_name, confidence_score) or None
        """
        team_email_lower = team_email.lower()

        # Strategy 1: Try exact email match first
        for linear_user in linear_users:
            linear_email = linear_user.get("email")
            if linear_email and linear_email.lower() == team_email_lower:
                user_id = linear_user.get("id")
                name = linear_user.get("name")
                logger.debug(f"✅ Email match: {team_email} -> {user_id} ({name})")
                return (user_id, name, 1.0)

        # Strategy 2: Try fuzzy name matching as fallback
        # Extract name from email (part before @)
        email_name = team_email.split("@")[0].lower()

        best_match = None
        best_score = 0.0

        for linear_user in linear_users:
            name = linear_user.get("name", "").lower()
            user_id = linear_user.get("id")

            if not name or not user_id:
                continue

            # Try full name matching
            score = SequenceMatcher(None, email_name, name).ratio()

            # Also try component matching (first/last name parts)
            email_parts = email_name.split(".")
            name_parts = name.split()

            # Check if email parts are in display name
            if len(email_parts) >= 1 and len(name_parts) >= 1:
                # Check if first part matches first name
                if email_parts[0] and name_parts[0]:
                    first_name_score = SequenceMatcher(
                        None,
                        email_parts[0],
                        name_parts[0]
                    ).ratio()
                    score = max(score, first_name_score * 0.85)

            # Check if all email parts appear in display name
            if len(email_parts) >= 2 and len(name_parts) >= 2:
                if email_parts[-1] and name_parts[-1]:
                    last_name_score = SequenceMatcher(
                        None,
                        email_parts[-1],
                        name_parts[-1]
                    ).ratio()
                    if last_name_score > 0.85:
                        score = max(score, 0.75)

            if score > best_score and score >= confidence_threshold:
                best_score = score
                best_match = (user_id, linear_user.get("name"), score)

        if best_match:
            user_id, name, score = best_match
            logger.debug(
                f"⚠️  Name match: {team_email} -> {user_id} ({name}) "
                f"(score: {score:.2f})"
            )
            return best_match

        logger.debug(f"❌ No match found for {team_email}")
        return None

    async def match_name_to_linear(
        self,
        team_name: str,
        linear_users: List[Dict],
        confidence_threshold: float = 0.70
    ) -> Optional[Tuple[str, str, float]]:
        """
        Match a team member name to a Linear user.
        Used as fallback when email is not available.

        Args:
            team_name: Display name (e.g., "John Doe")
            linear_users: List of Linear users
            confidence_threshold: Minimum similarity score

        Returns:
            Tuple of (linear_user_id, linear_name, confidence_score) or None
        """
        team_name_lower = team_name.lower().strip()

        best_match = None
        best_score = 0.0

        for linear_user in linear_users:
            linear_name = linear_user.get("name", "").lower().strip()
            user_id = linear_user.get("id")

            if not linear_name or not user_id:
                continue

            # Direct name similarity
            score = SequenceMatcher(None, team_name_lower, linear_name).ratio()

            # Component-based matching for names like "John Doe" vs "Doe, John"
            team_parts = team_name_lower.split()
            linear_parts = linear_name.split()

            # Check if both parts of name appear (regardless of order)
            if len(team_parts) >= 2 and len(linear_parts) >= 2:
                # Last name match is strongest indicator
                if (team_parts[-1] in linear_name and team_parts[0] in linear_name):
                    score = max(score, 0.80)

            if score > best_score and score >= confidence_threshold:
                best_score = score
                best_match = (user_id, linear_user.get("name"), score)

        if best_match:
            user_id, name, score = best_match
            logger.debug(
                f"⚠️  Name match: {team_name} -> {user_id} ({name}) "
                f"(score: {score:.2f})"
            )
            return best_match

        return None

    def get_cached_linear_users(self, workspace_id: str) -> Optional[List[Dict]]:
        """Get cached Linear users for workspace."""
        return self.cache.get(workspace_id)

    def cache_linear_users(self, workspace_id: str, users: List[Dict]) -> None:
        """Cache Linear users for workspace."""
        self.cache[workspace_id] = users
        logger.info(f"Cached {len(users)} Linear users for workspace {workspace_id}")

    def clear_cache(self, workspace_id: Optional[str] = None) -> None:
        """Clear cache for specific workspace or all workspaces."""
        if workspace_id:
            if workspace_id in self.cache:
                del self.cache[workspace_id]
                logger.info(f"Cleared Linear user cache for workspace {workspace_id}")
        else:
            self.cache.clear()
            logger.info("Cleared all Linear user cache")
