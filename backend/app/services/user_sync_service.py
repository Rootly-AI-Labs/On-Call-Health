"""
Service for syncing all users from Rootly/PagerDuty to UserCorrelation table.
Ensures all team members can submit burnout surveys regardless of incident involvement.
Includes smart GitHub username matching using ML/AI-powered matching.
"""
import logging
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from app.models import User, UserCorrelation, RootlyIntegration, GitHubIntegration
from app.core.rootly_client import RootlyAPIClient
from app.core.pagerduty_client import PagerDutyAPIClient
from app.services.enhanced_github_matcher import EnhancedGitHubMatcher

logger = logging.getLogger(__name__)


class UserSyncService:
    """Service to sync all users from integrations to UserCorrelation table."""

    def __init__(self, db: Session):
        self.db = db

    async def sync_integration_users(
        self,
        integration_id: int,
        current_user: User
    ) -> Dict[str, Any]:
        """
        Sync all users from a Rootly/PagerDuty integration to UserCorrelation.

        Args:
            integration_id: The integration to sync from
            current_user: The user who owns this integration

        Returns:
            Dictionary with sync statistics
        """
        try:
            # Get the integration
            integration = self.db.query(RootlyIntegration).filter(
                RootlyIntegration.id == integration_id,
                RootlyIntegration.user_id == current_user.id
            ).first()

            if not integration:
                raise ValueError(f"Integration {integration_id} not found")

            # Fetch users from the platform
            if integration.platform == "rootly":
                users = await self._fetch_rootly_users(integration.api_token)
            elif integration.platform == "pagerduty":
                users = await self._fetch_pagerduty_users(integration.api_token)
            else:
                raise ValueError(f"Unsupported platform: {integration.platform}")

            # Delete existing users from this integration before syncing fresh list
            deleted_count = self._delete_integration_users(
                integration_id=str(integration_id),
                current_user=current_user
            )
            if deleted_count > 0:
                logger.info(f"Deleted {deleted_count} existing users from integration {integration_id} before re-sync")

            # Sync users to UserCorrelation
            stats = self._sync_users_to_correlation(
                users=users,
                platform=integration.platform,
                current_user=current_user,
                integration_id=str(integration_id)  # Store which integration synced this user
            )
            stats['deleted'] = deleted_count

            logger.info(
                f"Synced {stats['created']} new users, updated {stats['updated']} existing users "
                f"from {integration.platform} integration {integration_id}"
            )

            # After syncing Rootly/PagerDuty users, try to match GitHub usernames
            github_stats = await self._match_github_usernames(current_user)
            if github_stats:
                stats['github_matched'] = github_stats['matched']
                stats['github_skipped'] = github_stats['skipped']
                logger.info(
                    f"GitHub matching: {github_stats['matched']} users matched, "
                    f"{github_stats['skipped']} skipped"
                )

            return stats

        except Exception as e:
            logger.error(f"Error syncing integration users: {e}")
            raise

    async def _fetch_rootly_users(self, api_token: str) -> List[Dict[str, Any]]:
        """Fetch incident responders from Rootly API (IR role holders only)."""
        client = RootlyAPIClient(api_token)

        # Fetch users with IR role data
        raw_users, included_roles = await client.get_users(limit=10000, include_role=True)

        # Filter to only incident responders (exclude observers/no_access)
        filtered_users = client.filter_incident_responders(raw_users, included_roles)
        logger.info(f"Rootly: Filtered {len(raw_users)} total users → {len(filtered_users)} incident responders")

        # Extract from JSONAPI format
        users = []
        for user in filtered_users:
            attrs = user.get("attributes", {})
            users.append({
                "id": user.get("id"),
                "email": attrs.get("email"),
                "name": attrs.get("name") or attrs.get("full_name"),
                "platform": "rootly"
            })

        return users

    async def _fetch_pagerduty_users(self, api_token: str) -> List[Dict[str, Any]]:
        """Fetch all users from PagerDuty API."""
        client = PagerDutyAPIClient(api_token)
        raw_users = await client.get_users(limit=10000)

        # PagerDuty format (may need adjustment based on actual API response)
        users = []
        for user in raw_users:
            users.append({
                "id": user.get("id"),
                "email": user.get("email"),
                "name": user.get("name"),
                "platform": "pagerduty"
            })

        return users

    def _delete_integration_users(
        self,
        integration_id: str,
        current_user: User
    ) -> int:
        """
        Delete all users previously synced from this integration.
        This ensures a clean slate before re-syncing with updated filtering.

        Returns:
            Number of users deleted
        """
        user_id = current_user.id

        # Get all correlations for this user that have this integration_id in their integration_ids array
        correlations = self.db.query(UserCorrelation).filter(
            UserCorrelation.user_id == user_id
        ).all()

        deleted = 0
        for correlation in correlations:
            # Check if this integration_id is in the JSON array
            if correlation.integration_ids and integration_id in correlation.integration_ids:
                self.db.delete(correlation)
                deleted += 1

        self.db.commit()

        return deleted

    def _sync_users_to_correlation(
        self,
        users: List[Dict[str, Any]],
        platform: str,
        current_user: User,
        integration_id: str = None
    ) -> Dict[str, int]:
        """
        Sync users to UserCorrelation table.

        Creates new records or updates existing ones.
        Uses organization_id for multi-tenancy support.
        """
        created = 0
        updated = 0
        skipped = 0

        # Use organization_id for multi-tenancy (fallback to user_id for beta mode)
        organization_id = current_user.organization_id
        user_id = current_user.id

        # Beta mode: If no organization, isolate by user_id instead
        if not organization_id:
            logger.info(f"User {user_id} has no organization_id - using user_id for isolation (beta mode)")

        for user in users:
            email = user.get("email")
            if not email:
                skipped += 1
                logger.warning(f"Skipping user {user.get('id')} - no email")
                continue

            email = email.lower().strip()

            # Check if correlation already exists
            # Check by (user_id, email) to match the unique constraint
            correlation = self.db.query(UserCorrelation).filter(
                UserCorrelation.user_id == user_id,
                UserCorrelation.email == email
            ).first()

            if correlation:
                # Update existing correlation
                updated += self._update_correlation(correlation, user, platform, integration_id)
            else:
                # Create new correlation
                correlation = UserCorrelation(
                    user_id=current_user.id,  # Keep for backwards compatibility
                    organization_id=organization_id,  # Multi-tenancy key
                    email=email,
                    name=user.get("name"),  # Store user's display name
                    integration_ids=[integration_id] if integration_id else []  # Initialize array
                )
                self._update_correlation(correlation, user, platform, integration_id)
                self.db.add(correlation)
                created += 1

        # Commit all changes
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error committing user sync: {e}")
            raise

        return {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(users)
        }

    def _update_correlation(
        self,
        correlation: UserCorrelation,
        user: Dict[str, Any],
        platform: str,
        integration_id: str = None
    ) -> int:
        """
        Update a UserCorrelation record with platform-specific data.
        Returns 1 if updated, 0 if no changes.
        """
        updated = False

        # Update integration_ids array - add if not already present
        if integration_id:
            if not correlation.integration_ids:
                correlation.integration_ids = [integration_id]
                updated = True
            elif integration_id not in correlation.integration_ids:
                correlation.integration_ids = correlation.integration_ids + [integration_id]
                updated = True

        # Update name if available and different
        if user.get("name") and correlation.name != user["name"]:
            correlation.name = user["name"]
            updated = True

        if platform == "rootly":
            # Store both the Rootly user ID and email
            if user.get("id") and (not correlation.rootly_user_id or correlation.rootly_user_id != user["id"]):
                correlation.rootly_user_id = user["id"]
                updated = True
            if not correlation.rootly_email or correlation.rootly_email != user["email"]:
                correlation.rootly_email = user["email"]
                updated = True
        elif platform == "pagerduty":
            if not correlation.pagerduty_user_id or correlation.pagerduty_user_id != user["id"]:
                correlation.pagerduty_user_id = user["id"]
                updated = True

        return 1 if updated else 0

    def sync_users_from_list(
        self,
        users: List[Dict[str, Any]],
        platform: str,
        current_user: User,
        integration_id: str = None
    ) -> Dict[str, int]:
        """
        Public method to sync a list of users to UserCorrelation.

        Used for beta integrations or when users are already fetched externally.

        Args:
            users: List of user dictionaries with id, email, name
            platform: "rootly" or "pagerduty"
            current_user: The user syncing these members
            integration_id: Optional integration identifier

        Returns:
            Dictionary with sync statistics
        """
        return self._sync_users_to_correlation(
            users=users,
            platform=platform,
            current_user=current_user,
            integration_id=integration_id
        )

    async def sync_all_integrations(self, current_user: User) -> Dict[str, Any]:
        """
        Sync users from ALL of the user's integrations.

        Useful for initial setup or bulk sync.
        """
        integrations = self.db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.is_active == True
        ).all()

        total_stats = {
            "integrations_synced": 0,
            "total_created": 0,
            "total_updated": 0,
            "total_skipped": 0,
            "errors": []
        }

        for integration in integrations:
            try:
                stats = await self.sync_integration_users(
                    integration_id=integration.id,
                    current_user=current_user
                )
                total_stats["integrations_synced"] += 1
                total_stats["total_created"] += stats["created"]
                total_stats["total_updated"] += stats["updated"]
                total_stats["total_skipped"] += stats["skipped"]
            except Exception as e:
                error_msg = f"Failed to sync integration {integration.id}: {str(e)}"
                logger.error(error_msg)
                total_stats["errors"].append(error_msg)

        return total_stats

    def _get_github_integration(self, user: User) -> Optional[GitHubIntegration]:
        """Get the user's GitHub integration with token, fallback to env var."""
        from cryptography.fernet import Fernet
        import base64
        import os
        from app.core.config import settings

        github_int = self.db.query(GitHubIntegration).filter(
            GitHubIntegration.user_id == user.id,
            GitHubIntegration.github_token.isnot(None)
        ).first()

        if github_int:
            # Decrypt token from database
            try:
                key = settings.JWT_SECRET_KEY.encode()
                key = base64.urlsafe_b64encode(key[:32].ljust(32, b'\0'))
                fernet = Fernet(key)
                github_int.decrypted_token = fernet.decrypt(github_int.github_token.encode()).decode()
                return github_int
            except Exception as e:
                logger.error(f"Failed to decrypt GitHub token: {e}")
                return None

        logger.info(f"No GitHub integration found for user {user.id}")
        return None

    async def _match_github_usernames(self, user: User) -> Optional[Dict[str, int]]:
        """
        Match all synced users to GitHub usernames using smart AI/ML matching.

        This uses the EnhancedGitHubMatcher which performs:
        - Name similarity matching (fuzzy matching)
        - Username pattern matching
        - Organization member lookup

        Returns statistics about matching results.
        """
        try:
            # Check if user has an actual GitHub integration (not just beta token fallback)
            github_int = self.db.query(GitHubIntegration).filter(
                GitHubIntegration.user_id == user.id,
                GitHubIntegration.github_token.isnot(None)
            ).first()

            if not github_int:
                logger.info("Skipping GitHub matching - no active GitHub integration for user")
                return None

            # Get the decrypted token
            github_int = self._get_github_integration(user)
            if not github_int:
                logger.info("Skipping GitHub matching - failed to get GitHub integration")
                return None

            # Get organizations from integration
            organizations = github_int.organizations if isinstance(github_int.organizations, list) else []
            if not organizations:
                logger.info("Skipping GitHub matching - no organizations configured")
                return None

            logger.info(f"Starting GitHub username matching for orgs: {organizations}")

            # Initialize matcher
            matcher = EnhancedGitHubMatcher(
                github_token=github_int.decrypted_token,
                organizations=organizations
            )

            # Get all synced users without GitHub usernames
            correlations = self.db.query(UserCorrelation).filter(
                UserCorrelation.user_id == user.id,
                UserCorrelation.github_username.is_(None)
            ).all()

            if not correlations:
                logger.info("No users need GitHub matching")
                return {"matched": 0, "skipped": 0}

            logger.info(f"Found {len(correlations)} users to match with GitHub")

            matched = 0
            skipped = 0

            # Match each user
            for i, correlation in enumerate(correlations):
                try:
                    # Skip users without names (can't match without a name)
                    if not correlation.name:
                        logger.debug(f"⏭️  Skipping {correlation.email} - no name available")
                        skipped += 1
                        continue

                    # Use name for matching (email is secondary)
                    github_username = await matcher.match_name_to_github(
                        full_name=correlation.name,
                        fallback_email=correlation.email
                    )

                    if github_username:
                        correlation.github_username = github_username
                        matched += 1
                        logger.info(f"✅ Matched {correlation.name} ({correlation.email}) -> {github_username}")
                    else:
                        skipped += 1
                        logger.debug(f"❌ No GitHub match for {correlation.name} ({correlation.email})")

                    # Commit in batches of 10 to balance performance and data safety
                    if (i + 1) % 10 == 0:
                        self.db.commit()
                        logger.debug(f"💾 Committed batch of matches ({i + 1}/{len(correlations)})")

                except Exception as e:
                    logger.warning(f"Error matching {correlation.email}: {e}")
                    skipped += 1
                    self.db.rollback()  # Rollback failed match

            # Final commit for any remaining changes
            if matched > 0:
                self.db.commit()
                logger.info(f"✅ Completed {matched} GitHub username matches")

            return {
                "matched": matched,
                "skipped": skipped,
                "total": len(correlations)
            }

        except Exception as e:
            logger.error(f"Error in GitHub matching: {e}")
            self.db.rollback()
            return None