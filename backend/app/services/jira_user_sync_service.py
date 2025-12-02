"""
Service for syncing Jira users to UserCorrelation table using email-based matching with name fallback.
Since Jira API now returns email addresses for users, we match by email first.
Falls back to fuzzy name matching if email is unavailable or no email match found.
"""
import logging
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from difflib import SequenceMatcher
from app.models import User, UserCorrelation, JiraIntegration
from app.auth.integration_oauth import jira_integration_oauth

logger = logging.getLogger(__name__)


def _decrypt_token(encrypted_token: str) -> str:
    """Decrypt Jira access token."""
    from cryptography.fernet import Fernet
    import base64
    from app.core.config import settings

    key = settings.JWT_SECRET_KEY.encode()
    key = base64.urlsafe_b64encode(key[:32].ljust(32, b'\0'))
    fernet = Fernet(key)
    return fernet.decrypt(encrypted_token.encode()).decode()


class JiraUserSyncService:
    """Service to sync Jira users to UserCorrelation table using name-based matching."""

    def __init__(self, db: Session):
        self.db = db

    async def sync_jira_users(
        self,
        current_user: User
    ) -> Dict[str, Any]:
        """
        Sync all users from Jira workspace to UserCorrelation using name-based matching.

        Args:
            current_user: The user who owns this Jira integration

        Returns:
            Dictionary with sync statistics
        """
        try:
            # Get the user's Jira integration
            integration = self.db.query(JiraIntegration).filter(
                JiraIntegration.user_id == current_user.id
            ).first()

            if not integration:
                raise ValueError("Jira integration not found. Please connect your Jira account first.")

            if not integration.jira_cloud_id:
                raise ValueError("Jira cloud ID not found in integration")

            # Decrypt access token
            access_token = _decrypt_token(integration.access_token)

            # Fetch users from Jira
            jira_users = await self._fetch_jira_users(
                access_token,
                integration.jira_cloud_id
            )

            logger.info(f"Fetched {len(jira_users)} users from Jira workspace")

            # Sync users to UserCorrelation using name-based matching
            stats = self._sync_users_to_correlation(
                jira_users=jira_users,
                current_user=current_user
            )

            logger.info(
                f"Synced {stats['matched']} Jira users, {stats['created']} new records, "
                f"{stats['updated']} updated, {stats['skipped']} skipped (no match)"
            )

            return stats

        except Exception as e:
            logger.error(f"Error syncing Jira users: {e}")
            raise

    async def _fetch_jira_users(
        self,
        access_token: str,
        cloud_id: str
    ) -> List[Dict[str, Any]]:
        """
        Fetch all users from Jira workspace using the /rest/api/3/users/search endpoint.

        Returns list of users with accountId and displayName.
        """
        import httpx

        all_users = []
        start_at = 0
        max_results = 100  # Jira API pagination limit

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }

        base_url = f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/users/search"

        async with httpx.AsyncClient() as client:
            while True:
                # Fetch a page of users
                params = {
                    "startAt": start_at,
                    "maxResults": max_results
                }

                response = await client.get(base_url, headers=headers, params=params)

                if response.status_code != 200:
                    logger.error(f"Failed to fetch Jira users: {response.text}")
                    break

                users_page = response.json()

                if not users_page:
                    break

                # Extract relevant user data - only real users with accountId and displayName
                for user in users_page:
                    account_id = user.get("accountId")
                    display_name = user.get("displayName")

                    # Skip if missing essential fields
                    if not account_id or not display_name:
                        logger.debug(f"Skipping user with missing fields: accountId={account_id}, displayName={display_name}")
                        continue

                    # Skip service accounts and bots (typically have account types we want to exclude)
                    account_type = user.get("accountType", "user")
                    if account_type not in ["user", "atlassian"]:
                        logger.debug(f"Skipping non-user account: {display_name} (type: {account_type})")
                        continue

                    all_users.append({
                        "account_id": account_id,
                        "display_name": display_name,
                        "email": user.get("emailAddress"),  # May be None due to privacy settings
                        "active": user.get("active", True)
                    })

                    # Log when email is missing
                    if not user.get("emailAddress"):
                        logger.debug(f"User {display_name} ({account_id}) has no email address (privacy settings)")

                # Check if we've fetched all users
                if len(users_page) < max_results:
                    break

                start_at += max_results

        # Filter to only active users
        active_users = [u for u in all_users if u.get("active", True)]

        logger.info(f"Fetched {len(active_users)} active users from Jira (total: {len(all_users)})")

        return active_users

    def _sync_users_to_correlation(
        self,
        jira_users: List[Dict[str, Any]],
        current_user: User
    ) -> Dict[str, int]:
        """
        Sync Jira users to UserCorrelation using email-based matching, with fuzzy name matching fallback.

        Strategy:
        1. For each Jira user (has displayName, accountId, email)
        2. Try to find matching UserCorrelation by email (exact match)
        3. If email not found or unavailable, fall back to fuzzy name similarity
        4. Update the record with jira_account_id and jira_email
        """
        matched = 0
        created = 0
        updated = 0
        skipped = 0

        organization_id = current_user.organization_id
        user_id = current_user.id

        # Get all existing UserCorrelation records for this org
        existing_correlations = self.db.query(UserCorrelation).filter(
            UserCorrelation.organization_id == organization_id
        ).all() if organization_id else []

        # Also query by user_id for beta mode (no org)
        if not organization_id:
            existing_correlations = self.db.query(UserCorrelation).filter(
                UserCorrelation.user_id == user_id
            ).all()
            logger.info(f"Beta mode: Found {len(existing_correlations)} existing correlations for user")

        for jira_user in jira_users:
            display_name = jira_user.get("display_name")
            account_id = jira_user.get("account_id")
            email = jira_user.get("email")

            if not display_name or not account_id:
                skipped += 1
                logger.warning(f"Skipping Jira user {account_id} - missing display_name or account_id")
                continue

            # Strategy: Try email first, then fall back to name matching
            matched_correlation = None
            match_method = None

            # 1. Try email-based matching first (if email is available)
            if email:
                matched_correlation = next(
                    (c for c in existing_correlations if c.email and c.email.lower() == email.lower()),
                    None
                )
                if matched_correlation:
                    match_method = "email"

            # 2. Fall back to fuzzy name matching if no email match
            if not matched_correlation:
                matched_correlation = self._find_best_name_match(
                    jira_name=display_name,
                    correlations=existing_correlations
                )
                if matched_correlation:
                    match_method = "name"

            if matched_correlation:
                # Check if there's a manual mapping for this user's Jira account
                # Manual mappings should take precedence over automatic matching
                from ..models import UserMapping
                manual_mapping = self.db.query(UserMapping).filter(
                    and_(
                        UserMapping.user_id == current_user.id,
                        UserMapping.source_identifier == matched_correlation.email,
                        UserMapping.target_platform == "jira",
                        UserMapping.mapping_type == "manual"
                    )
                ).first()

                if manual_mapping:
                    # Manual mapping exists - respect it and don't overwrite
                    logger.info(
                        f"⚠️  Skipping Jira sync for {matched_correlation.email} - manual mapping exists: {manual_mapping.target_identifier}"
                    )
                    skipped += 1
                    continue

                # Update existing correlation with Jira data
                needs_update = False

                if matched_correlation.jira_account_id != account_id:
                    matched_correlation.jira_account_id = account_id
                    needs_update = True

                if email and matched_correlation.jira_email != email:
                    matched_correlation.jira_email = email
                    needs_update = True

                if needs_update:
                    updated += 1
                    logger.info(
                        f"✅ Matched Jira user '{display_name}' ({email or 'no-email'}) to '{matched_correlation.name}' "
                        f"via {match_method} matching"
                    )

                matched += 1
            else:
                # No match found - skip
                skipped += 1
                logger.debug(
                    f"❌ No match found for Jira user '{display_name}' (email: {email}, account_id: {account_id})"
                )

        # Commit all changes
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error committing Jira user sync: {e}")
            raise

        return {
            "matched": matched,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(jira_users)
        }

    def _find_best_name_match(
        self,
        jira_name: str,
        correlations: List[UserCorrelation],
        threshold: float = 0.80  # 80% similarity required
    ) -> Optional[UserCorrelation]:
        """
        Find the best matching UserCorrelation record by name similarity.

        Uses fuzzy matching to handle:
        - "John Smith" (Jira) → "John Smith" (UserCorrelation)
        - "J. Smith" (Jira) → "John Smith" (UserCorrelation)
        - Case differences, extra spaces, etc.

        Returns:
            Best matching UserCorrelation record or None if no good match
        """
        best_match = None
        best_score = 0.0

        # Normalize Jira name for comparison
        jira_name_normalized = jira_name.lower().strip()

        for correlation in correlations:
            if not correlation.name:
                continue

            # Normalize correlation name
            corr_name_normalized = correlation.name.lower().strip()

            # Calculate similarity score
            score = SequenceMatcher(None, jira_name_normalized, corr_name_normalized).ratio()

            # Also try matching parts (first name, last name)
            jira_parts = jira_name_normalized.split()
            corr_parts = corr_name_normalized.split()

            # If both have at least 2 parts (first + last name)
            if len(jira_parts) >= 2 and len(corr_parts) >= 2:
                # Check if last names match well
                last_name_score = SequenceMatcher(
                    None,
                    jira_parts[-1],
                    corr_parts[-1]
                ).ratio()

                # If last names match strongly, boost the score
                if last_name_score > 0.85:
                    score = max(score, last_name_score * 0.9)

            if score > best_score and score >= threshold:
                best_score = score
                best_match = correlation

        if best_match:
            logger.debug(
                f"Name match: '{jira_name}' → '{best_match.name}' "
                f"(score: {best_score:.2f})"
            )

        return best_match
