"""
Service for syncing all users from Rootly/PagerDuty to UserCorrelation table.
Ensures all team members can submit burnout surveys regardless of incident involvement.
Includes smart GitHub username matching using ML/AI-powered matching.
"""
import logging
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from sqlalchemy.exc import IntegrityError, OperationalError
from app.models import User, UserCorrelation, RootlyIntegration, GitHubIntegration, UserMapping, SurveyPeriod

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

            # Fetch users from the platform (respecting team scope if set)
            if integration.platform == "rootly":
                team_name = getattr(integration, 'team_name', None)
                users = await self._fetch_rootly_users(integration.api_token, team_name=team_name)
            elif integration.platform == "pagerduty":
                users = await self._fetch_pagerduty_users(integration.api_token)
            else:
                raise ValueError(f"Unsupported platform: {integration.platform}")

            # If API returned 0 users, it likely failed/timed out
            # Don't wipe existing users - just return existing count
            if not users or len(users) == 0:
                logger.warning(f"API returned 0 users for {integration.platform} integration {integration_id} - preserving existing users")
                existing_count = self.db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == current_user.id
                ).count()
                return {
                    "created": 0,
                    "updated": 0,
                    "skipped": 0,
                    "total": existing_count,
                    "removed": 0,
                    "warning": f"{integration.platform.title()} API returned 0 users (possible timeout). Existing {existing_count} users preserved."
                }

            # NOTE: We don't delete existing users anymore - we update them instead
            # This preserves manually mapped GitHub/Jira usernames across syncs
            # The _sync_users_to_correlation method handles both create and update

            # Get list of emails from this sync
            synced_emails = set(user.get("email", "").lower().strip() for user in users if user.get("email"))

            # Sync users to UserCorrelation
            stats = self._sync_users_to_correlation(
                users=users,
                platform=integration.platform,
                current_user=current_user,
                integration_id=str(integration_id)  # Store which integration synced this user
            )

            # Remove users who are no longer in Rootly/PagerDuty
            removed_count = self._remove_missing_users(
                integration_id=str(integration_id),
                current_user=current_user,
                synced_emails=synced_emails
            )
            stats['removed'] = removed_count

            logger.info(
                f"Synced {stats['created']} new users, updated {stats['updated']} existing users "
                f"from {integration.platform} integration {integration_id}"
            )

            # Create User records for any UserCorrelations that don't have matching User records
            # This ensures the Slack survey button works for all synced members
            user_records_created = self._ensure_user_records_exist(current_user)
            stats['user_records_created'] = user_records_created
            if user_records_created > 0:
                logger.info(f"Created {user_records_created} User records for orphan correlations")

            # After syncing Rootly/PagerDuty users, try to match GitHub usernames
            # Wrap in try-except to ensure GitHub failures don't block Jira/Slack matching
            try:
                github_stats = await self._match_github_usernames(current_user)
                if github_stats:
                    stats['github_matched'] = github_stats['matched']
                    stats['github_skipped'] = github_stats['skipped']

                    # Also count total users with GitHub usernames (for display)
                    total_with_github = self.db.query(UserCorrelation).filter(
                        UserCorrelation.user_id == current_user.id,
                        UserCorrelation.github_username.isnot(None),
                        UserCorrelation.github_username != ''
                    ).count()
                    stats['github_total'] = total_with_github

                    logger.info(
                        f"GitHub matching: {github_stats['matched']} new matches, "
                        f"{github_stats['skipped']} skipped, {total_with_github} total"
                    )
                # If None is returned (no GitHub integration), don't set stats
                # This prevents frontend from showing "Matched 0 users to GitHub"
            except Exception as e:
                error_msg = f"GitHub matching failed: {str(e)}"
                logger.error(f"{error_msg} - continuing with other integrations")
                stats['github_matched'] = 0
                stats['github_skipped'] = 0
                stats['github_error'] = error_msg

            # After syncing Rootly/PagerDuty users, try to match Jira accounts
            # Wrap in try-except to ensure Jira failures don't block other operations
            try:
                jira_stats = await self._match_jira_users(current_user)
                if jira_stats:
                    stats['jira_matched'] = jira_stats['matched']
                    stats['jira_skipped'] = jira_stats['skipped']
                    logger.info(
                        f"Jira matching: {jira_stats['matched']} users matched, "
                        f"{jira_stats['skipped']} skipped"
                    )
                # If None is returned (no Jira integration), don't set stats
                # This prevents frontend from showing "Matched 0 users to Jira"
            except Exception as e:
                error_msg = f"Jira matching failed: {str(e)}"
                logger.error(f"{error_msg} - continuing with other operations")
                stats['jira_matched'] = 0
                stats['jira_skipped'] = 0
                stats['jira_error'] = error_msg

            # After syncing Rootly/PagerDuty users, try to match Linear accounts
            # Wrap in try-except to ensure Linear failures don't block other operations
            try:
                linear_stats = await self._match_linear_users(current_user)
                if linear_stats:
                    stats['linear_matched'] = linear_stats['matched']
                    stats['linear_skipped'] = linear_stats['skipped']
                    logger.info(
                        f"Linear matching: {linear_stats['matched']} users matched, "
                        f"{linear_stats['skipped']} skipped"
                    )
                # If None is returned (no Linear integration), don't set stats
                # This prevents frontend from showing "Matched 0 users to Linear"
            except Exception as e:
                error_msg = f"Linear matching failed: {str(e)}"
                logger.error(f"{error_msg} - continuing with other operations")
                stats['linear_matched'] = 0
                stats['linear_skipped'] = 0
                stats['linear_error'] = error_msg

            # After syncing Rootly/PagerDuty users, try to match Slack user IDs
            # Wrap in try-except to ensure Slack failures don't block other operations
            logger.info(f"🚀 SYNC: Attempting Slack matching for user {current_user.id}, email={current_user.email}")
            try:
                slack_stats = await self._match_slack_users(current_user)
                logger.info(f"📊 SYNC: Slack matching returned: {slack_stats}")
                if slack_stats:
                    stats['slack_matched'] = slack_stats['matched']
                    stats['slack_skipped'] = slack_stats['skipped']
                    logger.info(
                        f"✅ SYNC: Slack matching complete - {slack_stats['matched']} users matched, "
                        f"{slack_stats['skipped']} skipped"
                    )
                else:
                    logger.info("ℹ️ SYNC: Slack matching returned None (no Slack integration or not applicable)")
                # If None is returned (no Slack integration), don't set stats
                # This prevents frontend from showing "Matched 0 users to Slack"
            except Exception as e:
                error_msg = f"Slack matching failed: {str(e)}"
                logger.error(f"❌ SYNC: {error_msg} - continuing with other operations")
                logger.exception(e)  # Log full traceback
                stats['slack_matched'] = 0
                stats['slack_skipped'] = 0
                stats['slack_error'] = error_msg

            # After syncing, try to match OpenAI accounts by email
            try:
                openai_stats = await self._match_openai_users(current_user)
                if openai_stats:
                    stats['openai_matched'] = openai_stats['matched']
                    stats['openai_skipped'] = openai_stats['skipped']
                    logger.info(
                        f"OpenAI matching: {openai_stats['matched']} users matched, "
                        f"{openai_stats['skipped']} skipped"
                    )
            except Exception as e:
                logger.error(f"OpenAI matching failed: {e} - continuing")
                stats['openai_matched'] = 0
                stats['openai_skipped'] = 0

            return stats

        except Exception as e:
            logger.error(f"Error syncing integration users: {e}")
            raise

    async def _fetch_rootly_users(self, api_token: str, team_name: str = None) -> List[Dict[str, Any]]:
        """Fetch incident responders from Rootly API (IR role holders only).

        If team_name is provided, only users who are members of that team are returned.
        """
        client = RootlyAPIClient(api_token)

        # Fetch users with IR role data
        raw_users, included_roles = await client.get_users(limit=10000, include_role=True)

        # Filter to only incident responders (exclude observers/no_access)
        filtered_users = client.filter_incident_responders(raw_users, included_roles)
        logger.info(f"Rootly: Filtered {len(raw_users)} total users → {len(filtered_users)} incident responders")

        # If a team scope is set, further filter to only team members
        if team_name:
            team_user_ids = await client.get_team_user_ids(team_name)
            if team_user_ids:
                team_user_ids_set = set(team_user_ids)
                before = len(filtered_users)
                filtered_users = [u for u in filtered_users if str(u.get("id")) in team_user_ids_set]
                logger.info(
                    f"Rootly sync: team scope '{team_name}' → {before} IR responders → {len(filtered_users)} team members"
                )
            else:
                logger.warning(
                    f"Rootly sync: could not fetch member IDs for team '{team_name}', syncing all IR responders"
                )

        # Extract from JSONAPI format
        users = []
        for user in filtered_users:
            attrs = user.get("attributes", {})
            users.append({
                "id": user.get("id"),
                "email": attrs.get("email"),
                "name": attrs.get("name") or attrs.get("full_name"),
                "timezone": attrs.get("time_zone"),  # User's configured timezone
                "avatar_url": attrs.get("avatar_url"),  # Profile image URL
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
                "timezone": user.get("time_zone"),  # User's configured timezone
                "avatar_url": user.get("avatar_url"),  # Profile image URL
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

        # Use organization_id for multi-tenancy
        organization_id = current_user.organization_id
        user_id = current_user.id

        # Beta mode: If no organization, set organization_id to None
        # Data will be isolated by user_id instead (personal correlations)
        if not organization_id:
            organization_id = None  # Allow NULL for users without organizations
            logger.info(f"User {user_id} has no organization_id - creating personal correlations (beta mode)")

        for user in users:
            email = user.get("email")
            if not email:
                skipped += 1
                logger.warning(f"Skipping user {user.get('id')} - no email")
                continue

            email = email.lower().strip()

            # Check if correlation already exists
            # SECURITY: Separate lookup logic for self vs team members
            # - For current user's email: use (user_id, email) - personal correlation
            # - For team members: use (organization_id, email, user_id=NULL) - org-scoped roster
            # This prevents one user from overwriting another user's correlations

            # Determine user_id assignment FIRST (before querying)
            # CHANGED: In org mode, ALL users (including current user) use team roster (user_id=NULL)
            # This prevents duplicate-looking entries where same email has both personal + roster records
            if organization_id:
                # Multi-tenant mode: Everyone is team roster (user_id=NULL)
                assigned_user_id = None
                if email.lower() == current_user.email.lower():
                    logger.debug(f"Creating org-scoped correlation for current user {email} (team roster)")
                else:
                    logger.debug(f"Creating org-scoped correlation for team member {email}")
            else:
                # Beta mode: Personal correlations only (user_id=current_user.id)
                assigned_user_id = current_user.id
                logger.debug(f"Creating personal correlation for {email} (beta mode)")

            # Query with correct uniqueness key based on assigned_user_id
            if assigned_user_id is not None:
                # Beta mode OR current user: check (user_id, email)
                all_correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == assigned_user_id,
                    UserCorrelation.email == email
                ).all()
            else:
                # Multi-tenant team member: check (organization_id, email, user_id IS NULL)
                # Security fix: Add explicit NULL check to prevent SQL injection via NULL bypass
                all_correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.organization_id.isnot(None),
                    UserCorrelation.organization_id == organization_id,
                    UserCorrelation.email == email,
                    UserCorrelation.user_id.is_(None)
                ).all()

            # Handle found correlations
            if len(all_correlations) > 1:
                logger.info(f"Found {len(all_correlations)} records for email {email}")
                correlation = self._merge_duplicate_correlations(all_correlations, organization_id, email)
            elif len(all_correlations) == 1:
                correlation = all_correlations[0]
            else:
                correlation = None

            if correlation:
                # Update existing correlation
                updated += self._update_correlation(correlation, user, platform, integration_id)
            else:
                # Final safety check: ensure no record exists for the correct uniqueness key
                # This is a last-resort check in case the query above missed something
                if assigned_user_id is not None:
                    existing_record = self.db.query(UserCorrelation).filter(
                        UserCorrelation.user_id == assigned_user_id,
                        UserCorrelation.email == email
                    ).first()
                else:
                    existing_record = self.db.query(UserCorrelation).filter(
                        UserCorrelation.organization_id == organization_id,
                        UserCorrelation.email == email,
                        UserCorrelation.user_id.is_(None)
                    ).first()

                if existing_record:
                    # Record exists but wasn't found by previous query
                    # Update it instead of creating new one
                    logger.warning(
                        f"Found existing record via safety check: org={organization_id}, "
                        f"email={email}. Updating instead of inserting."
                    )
                    updated += self._update_correlation(existing_record, user, platform, integration_id)
                else:
                    # Check for existing row by platform user ID to prevent duplicates
                    # across account re-creations (e.g. user_id changed from 54→82→85)
                    platform_record = None
                    if platform == "rootly" and user.get("id"):
                        platform_record = self.db.query(UserCorrelation).filter(
                            UserCorrelation.rootly_user_id == str(user["id"]),
                            UserCorrelation.email == email
                        ).first()
                    elif platform == "pagerduty" and user.get("id"):
                        platform_record = self.db.query(UserCorrelation).filter(
                            UserCorrelation.pagerduty_user_id == str(user["id"]),
                            UserCorrelation.email == email
                        ).first()

                    if platform_record:
                        logger.info(
                            f"Found existing {platform} record by platform user ID for {email} "
                            f"(row id={platform_record.id}, user_id={platform_record.user_id}). Updating instead of inserting."
                        )
                        updated += self._update_correlation(platform_record, user, platform, integration_id)
                    else:
                        # Safe to create new correlation
                        # Extract email domain from the user's email address
                        email_domain = email.split("@")[1].lower() if "@" in email else None

                        correlation = UserCorrelation(
                            user_id=assigned_user_id,  # NULL for team members (org mode), current_user.id for own/beta mode
                            organization_id=organization_id,  # Multi-tenancy key (or NULL for beta mode)
                            email_domain=email_domain,  # User's actual domain for data sharing
                            email=email,
                            name=user.get("name"),  # Store user's display name
                            timezone=user.get("timezone"),  # User's timezone from Rootly/PagerDuty
                            avatar_url=user.get("avatar_url"),  # Profile image from PagerDuty/Rootly
                            integration_ids=[integration_id] if integration_id else []  # Initialize array
                        )
                        self._update_correlation(correlation, user, platform, integration_id)
                        self.db.add(correlation)
                        created += 1

        # Commit all changes with retry logic for race conditions and transient errors
        max_retries = 3
        for attempt in range(max_retries):
            try:
                self.db.commit()
                # MONITORING: Log successful sync stats
                logger.info(
                    f"✅ SYNC_SUCCESS: org_id={organization_id}, "
                    f"created={created}, updated={updated}, skipped={skipped}"
                )
                break
            except IntegrityError as e:
                self.db.rollback()
                error_str = str(e.orig)
                # Check for any of the UserCorrelation unique constraint violations
                is_duplicate_key = any(constraint in error_str for constraint in [
                    'uq_user_correlation_user_email',  # Personal correlations (user_id, email)
                    'uq_user_correlations_org_email',  # Org roster (organization_id, email) WHERE user_id IS NULL
                ])

                if is_duplicate_key:
                    # MONITORING: Log duplicate attempts with context for alerting
                    logger.warning(
                        f"🚨 DUPLICATE_ATTEMPT: org_id={organization_id}, "
                        f"user_id={user_id}, attempt={attempt+1}/{max_retries}, "
                        f"created={created}, updated={updated}, error={error_str}"
                    )
                    if attempt < max_retries - 1:
                        logger.warning(f"Retrying after concurrent insert...")
                        continue
                    else:
                        # ALERT: This should rarely happen with proper constraints
                        logger.error(
                            f"❌ DUPLICATE_FAILURE: Failed to commit after {max_retries} attempts. "
                            f"org_id={organization_id}, created={created}, updated={updated}"
                        )
                        raise
                else:
                    # Different IntegrityError, don't retry
                    logger.error(f"IntegrityError during commit: {e}")
                    raise
            except OperationalError as e:
                # Transient database errors (connection, deadlock, timeout)
                self.db.rollback()
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Database operational error (attempt {attempt+1}/{max_retries}): {e}. Retrying..."
                    )
                    continue
                else:
                    logger.error(f"OperationalError after {max_retries} attempts: {e}")
                    raise
            except Exception as e:
                # Non-retryable errors
                self.db.rollback()
                logger.error(f"Unexpected error committing user sync: {e}")
                raise

        # Restore GitHub usernames from user_mappings table after sync
        # This ensures manually set GitHub usernames persist across syncs
        self._restore_github_usernames_from_mappings(current_user)

        return {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(users)
        }

    def _ensure_user_records_exist(self, current_user: User) -> int:
        """
        Create User records for any UserCorrelations that don't have matching User records.

        This is necessary because:
        - UserCorrelation records are created when syncing from Rootly/PagerDuty
        - User records are normally only created when someone logs in via OAuth
        - The Slack survey button requires a User record to function properly

        Args:
            current_user: The user performing the sync (used to get organization_id)

        Returns:
            Number of User records created
        """
        from sqlalchemy import func

        organization_id = current_user.organization_id
        if not organization_id:
            logger.warning("Cannot create User records without organization_id")
            return 0

        # Find all UserCorrelations in this org that don't have matching User records
        orphan_correlations = self.db.query(UserCorrelation).outerjoin(
            User, func.lower(User.email) == func.lower(UserCorrelation.email)
        ).filter(
            UserCorrelation.organization_id == organization_id,
            UserCorrelation.email.isnot(None),
            User.id.is_(None)  # No matching User record
        ).all()

        if not orphan_correlations:
            logger.debug("No orphan correlations found - all users have User records")
            return 0

        logger.info(f"Found {len(orphan_correlations)} UserCorrelations without User records")

        created_count = 0
        for correlation in orphan_correlations:
            try:
                # Check one more time that no User exists (in case of race condition)
                existing_user = self.db.query(User).filter(
                    func.lower(User.email) == func.lower(correlation.email)
                ).first()

                if existing_user:
                    logger.debug(f"User already exists for {correlation.email} - skipping")
                    continue

                # Create new User record
                new_user = User(
                    email=correlation.email.lower(),
                    name=correlation.name or correlation.email.split('@')[0],
                    organization_id=organization_id,
                    is_verified=False,  # Not verified since they haven't logged in
                    # Don't set provider/provider_id - they haven't authenticated
                )
                new_user.update_email_domain()
                self.db.add(new_user)
                self.db.flush()  # Get the user ID

                logger.info(f"Created User record for {correlation.email} (id={new_user.id})")
                created_count += 1

            except Exception as e:
                logger.error(f"Failed to create User record for {correlation.email}: {e}")
                continue

        # Commit all new User records
        try:
            self.db.commit()
            logger.info(f"Successfully created {created_count} User records")
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to commit new User records: {e}")
            return 0

        return created_count

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
        from datetime import datetime, timezone
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

        # Update timezone if available and different
        if user.get("timezone") and correlation.timezone != user["timezone"]:
            correlation.timezone = user["timezone"]
            updated = True

        # Update avatar_url if available and different
        if user.get("avatar_url") and correlation.avatar_url != user["avatar_url"]:
            correlation.avatar_url = user["avatar_url"]
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

    def _merge_duplicate_correlations(
        self,
        correlations: list,
        organization_id: int,
        email: str
    ) -> UserCorrelation:
        """
        Merge duplicate UserCorrelation records into one "best" record.

        Strategy:
        1. Pick the best record (most complete data)
        2. Merge all fields from other records into it
        3. Delete the duplicate records
        4. Return the merged record

        Priority for "best" record:
        1. Has github_username
        2. Has slack_user_id
        3. Has jira_account_id
        4. Has most integration_ids
        5. Most recent created_at
        """
        if len(correlations) <= 1:
            return correlations[0] if correlations else None

        logger.warning(
            f"🔀 MERGING {len(correlations)} duplicate records for {email} (org {organization_id})"
        )

        # Sort by data completeness to find the "best" record
        def score_record(r):
            score = 0
            if r.github_username: score += 1000
            if r.slack_user_id: score += 100
            if r.jira_account_id: score += 50
            if r.linear_user_id: score += 25
            if r.integration_ids: score += len(r.integration_ids) * 10
            return score

        sorted_correlations = sorted(correlations, key=score_record, reverse=True)
        keep_record = sorted_correlations[0]
        duplicate_records = sorted_correlations[1:]

        logger.info(
            f"  ✅ KEEPING: ID={keep_record.id} | "
            f"github={keep_record.github_username} | "
            f"slack={keep_record.slack_user_id} | "
            f"integration_ids={keep_record.integration_ids}"
        )

        # Merge data from duplicates into keep_record
        for dup in duplicate_records:
            logger.info(
                f"  🔀 MERGING: ID={dup.id} | "
                f"github={dup.github_username} | "
                f"slack={dup.slack_user_id} | "
                f"integration_ids={dup.integration_ids}"
            )

            # Merge integration_ids arrays
            if dup.integration_ids:
                if not keep_record.integration_ids:
                    keep_record.integration_ids = []
                for int_id in dup.integration_ids:
                    if int_id not in keep_record.integration_ids:
                        keep_record.integration_ids = keep_record.integration_ids + [int_id]
                        logger.info(f"    ➕ Added integration_id: {int_id}")

            # Merge platform-specific fields (only if keep_record doesn't have them)
            if dup.github_username and not keep_record.github_username:
                keep_record.github_username = dup.github_username
                logger.info(f"    ➕ Added github_username: {dup.github_username}")

            if dup.slack_user_id and not keep_record.slack_user_id:
                keep_record.slack_user_id = dup.slack_user_id
                logger.info(f"    ➕ Added slack_user_id: {dup.slack_user_id}")

            if dup.jira_account_id and not keep_record.jira_account_id:
                keep_record.jira_account_id = dup.jira_account_id
                keep_record.jira_email = dup.jira_email
                logger.info(f"    ➕ Added jira_account_id: {dup.jira_account_id}")

            if dup.linear_user_id and not keep_record.linear_user_id:
                keep_record.linear_user_id = dup.linear_user_id
                keep_record.linear_email = dup.linear_email
                logger.info(f"    ➕ Added linear_user_id: {dup.linear_user_id}")

            if dup.rootly_user_id and not keep_record.rootly_user_id:
                keep_record.rootly_user_id = dup.rootly_user_id
                keep_record.rootly_email = dup.rootly_email
                logger.info(f"    ➕ Added rootly_user_id: {dup.rootly_user_id}")

            if dup.pagerduty_user_id and not keep_record.pagerduty_user_id:
                keep_record.pagerduty_user_id = dup.pagerduty_user_id
                logger.info(f"    ➕ Added pagerduty_user_id: {dup.pagerduty_user_id}")

            # Merge name if keep_record doesn't have it
            if dup.name and not keep_record.name:
                keep_record.name = dup.name
                logger.info(f"    ➕ Added name: {dup.name}")

            # Prefer non-NULL user_id
            if dup.user_id and not keep_record.user_id:
                keep_record.user_id = dup.user_id
                logger.info(f"    ➕ Added user_id: {dup.user_id}")

            # Update all foreign key references before deleting
            # Update survey_periods that reference this duplicate correlation
            survey_periods = self.db.query(SurveyPeriod).filter(
                SurveyPeriod.user_correlation_id == dup.id
            ).all()

            if survey_periods:
                # Ensure keep_record has an ID before using it as FK reference
                # NOTE: flush() does NOT expose data to concurrent transactions in READ COMMITTED isolation.
                # It only synchronizes SQLAlchemy's session with the current transaction's state.
                # Other transactions remain isolated until commit(), where unique constraints enforce atomicity.
                if keep_record.id is None:
                    try:
                        self.db.flush()
                        # Verify ID was actually assigned
                        if keep_record.id is None:
                            raise ValueError(
                                f"Failed to assign ID to keep_record after flush for {email}. "
                                f"This indicates a database constraint violation or connection issue."
                            )
                        logger.info(f"    💾 Flushed keep_record to get ID: {keep_record.id}")
                    except Exception as flush_error:
                        logger.error(
                            f"    ❌ Failed to flush keep_record for {email}: {flush_error}. "
                            f"Cannot safely merge duplicates without valid ID."
                        )
                        # Re-raise to prevent FK updates with NULL ID
                        raise

                logger.info(f"    🔗 Updating {len(survey_periods)} survey_periods to reference ID={keep_record.id}")
                for period in survey_periods:
                    period.user_correlation_id = keep_record.id

                # Flush to persist the updates before deleting
                self.db.flush()
                logger.info(f"    ✅ Flushed survey_periods updates to database")

            # Delete the duplicate record
            logger.info(f"    ❌ DELETING duplicate ID={dup.id}")
            self.db.delete(dup)

        logger.info(
            f"  ✅ MERGED into ID={keep_record.id} | "
            f"integration_ids={keep_record.integration_ids}"
        )

        return keep_record

    def _remove_missing_users(
        self,
        integration_id: str,
        current_user: User,
        synced_emails: set
    ) -> int:
        """
        Remove users who are no longer present in Rootly/PagerDuty.
        This is a hard delete since the user is confirmed to be removed from the source.

        Args:
            integration_id: The integration ID
            current_user: The user performing the sync
            synced_emails: Set of email addresses that were in the sync

        Returns:
            Number of users removed
        """
        # Find all users from this integration
        correlations = self.db.query(UserCorrelation).filter(
            UserCorrelation.user_id == current_user.id
        ).all()

        removed = 0
        for correlation in correlations:
            # Check if this integration_id is in the array
            if correlation.integration_ids and integration_id in correlation.integration_ids:
                # Check if user's email was NOT in this sync
                if correlation.email not in synced_emails:
                    # User was removed from Rootly/PagerDuty - delete them
                    self.db.delete(correlation)
                    removed += 1
                    logger.info(f"Removed user no longer in {integration_id}: {correlation.email}")

        if removed > 0:
            self.db.commit()
            logger.info(f"Removed {removed} users no longer in integration {integration_id}")

        return removed

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
            # For org mode: match team roster (user_id IS NULL)
            # For personal mode: match personal correlations (user_id == user.id)
            if user.organization_id:
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.organization_id == user.organization_id,
                    UserCorrelation.user_id.is_(None),
                    UserCorrelation.github_username.is_(None)
                ).all()
            else:
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

                    # Check if there's a manual mapping for this user's GitHub account
                    # Manual mappings should take precedence over automatic matching
                    manual_mapping = self.db.query(UserMapping).filter(
                        and_(
                            UserMapping.user_id == user.id,
                            UserMapping.source_identifier == correlation.email,
                            UserMapping.target_platform == "github",
                            UserMapping.mapping_type == "manual"
                        )
                    ).first()

                    if manual_mapping:
                        # Manual mapping exists - respect it and don't overwrite
                        logger.info(f"⚠️  Skipping {correlation.email} - manual GitHub mapping exists: {manual_mapping.target_identifier}")
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

    def _restore_github_usernames_from_mappings(self, current_user: User) -> int:
        """
        Restore GitHub usernames from user_mappings table to user_correlations.
        This ensures manually set GitHub usernames persist across syncs.

        Returns:
            Number of GitHub usernames restored
        """
        from ..models import UserMapping

        try:
            restored = 0

            # Get all manual GitHub mappings for this user
            mappings = self.db.query(UserMapping).filter(
                UserMapping.user_id == current_user.id,
                UserMapping.target_platform == "github",
                UserMapping.target_identifier.isnot(None),
                UserMapping.target_identifier != ""
            ).all()

            logger.info(f"Found {len(mappings)} GitHub mappings to restore")

            for mapping in mappings:
                # Find the corresponding user_correlation by email
                correlation = self.db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == current_user.id,
                    UserCorrelation.email == mapping.source_identifier
                ).first()

                if correlation:
                    # Restore GitHub username if missing or different
                    if not correlation.github_username or correlation.github_username != mapping.target_identifier:
                        correlation.github_username = mapping.target_identifier
                        restored += 1
                        logger.debug(f"Restored GitHub username for {mapping.source_identifier}: {mapping.target_identifier}")

            # Commit all restorations
            if restored > 0:
                self.db.commit()
                logger.info(f"✅ Restored {restored} GitHub usernames from user_mappings")

            return restored

        except Exception as e:
            logger.error(f"Error restoring GitHub usernames: {e}")
            self.db.rollback()
            return 0

    async def _match_slack_users(self, user: User) -> Optional[Dict[str, int]]:
        """
        Match all synced users to Slack accounts using email matching.

        This uses email exact matching to link user_correlations with Slack user IDs.

        Returns statistics about matching results.
        """
        try:
            from app.models import SlackWorkspaceMapping
            from app.services.slack_token_service import SlackTokenService
            import httpx

            # Check for Slack workspace mapping
            logger.info(f"🔍 SLACK_MATCH: Checking Slack workspace for user {user.id}, email={user.email}, org_id={user.organization_id}")
            workspace_mapping = (
                self.db.query(SlackWorkspaceMapping)
                .filter(SlackWorkspaceMapping.organization_id == user.organization_id)
                .order_by(
                    SlackWorkspaceMapping.registered_at.desc(),
                    SlackWorkspaceMapping.id.desc(),
                )
                .first()
            )

            if not workspace_mapping:
                logger.info("❌ SLACK_MATCH: No Slack workspace connected for this organization")
                return None

            logger.info(f"✅ SLACK_MATCH: Found workspace mapping, workspace_id={workspace_mapping.workspace_id}")

            slack_service = SlackTokenService(self.db)
            access_token = slack_service.get_oauth_token_for_workspace(
                workspace_mapping.workspace_id
            )

            if not access_token:
                logger.info("❌ SLACK_MATCH: No valid Slack token found for workspace")
                return None

            logger.info(f"✅ SLACK_MATCH: Found usable Slack token, starting matching for user {user.id}")

            # Fetch Slack workspace members using async httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    "https://slack.com/api/users.list",
                    headers={"Authorization": f"Bearer {access_token}"}
                )

            if response.status_code != 200:
                logger.error(f"Slack API returned status {response.status_code}")
                return None

            data = response.json()

            if not data or not data.get("ok"):
                logger.error(f"Slack API error: {data.get('error') if data else 'unknown'}")
                return None

            members = data.get("members", [])
            logger.info(f"📥 SLACK_MATCH: Fetched {len(members)} total Slack members from API")

            # Build email -> slack_user_id mapping
            email_to_slack_id = {
                member.get("profile", {}).get("email", "").lower(): member.get("id")
                for member in members
                if not member.get("deleted")
                and not member.get("is_bot")
                and member.get("profile", {}).get("email")
                and member.get("id")
            }

            logger.info(f"📧 SLACK_MATCH: Built mapping for {len(email_to_slack_id)} Slack users with emails")

            # Log sample of Slack emails for debugging
            sample_emails = list(email_to_slack_id.keys())[:5]
            logger.info(f"📧 SLACK_MATCH: Sample Slack emails: {sample_emails}")

            # Check if current user's email is in Slack
            if user.email.lower() in email_to_slack_id:
                logger.info(f"✅ SLACK_MATCH: Current user {user.email} found in Slack workspace")
            else:
                logger.warning(f"⚠️ SLACK_MATCH: Current user {user.email} NOT found in Slack workspace")

            if not email_to_slack_id:
                logger.info("❌ SLACK_MATCH: No Slack users with emails found to match")
                return {"matched": 0, "skipped": 0}

            # Get all synced users without Slack IDs
            # For org mode: match team roster (user_id IS NULL)
            # For personal mode: match personal correlations (user_id == user.id)
            if user.organization_id:
                logger.info(f"🔍 SLACK_MATCH: Querying team roster for org_id={user.organization_id}, user_id IS NULL, slack_user_id IS NULL")
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.organization_id == user.organization_id,
                    UserCorrelation.user_id.is_(None),
                    UserCorrelation.slack_user_id.is_(None)
                ).all()
            else:
                logger.info(f"🔍 SLACK_MATCH: Querying personal correlations for user_id={user.id}")
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == user.id,
                    UserCorrelation.slack_user_id.is_(None)
                ).all()

            logger.info(f"📋 SLACK_MATCH: Found {len(correlations)} correlations without Slack IDs")

            # Log sample of correlation emails
            if correlations:
                sample_corr_emails = [c.email for c in correlations[:5] if c.email]
                logger.info(f"📋 SLACK_MATCH: Sample correlation emails: {sample_corr_emails}")

            if not correlations:
                logger.info("ℹ️ SLACK_MATCH: No users need Slack matching (all already have Slack IDs)")
                return {"matched": 0, "skipped": 0}

            logger.info(f"🔄 SLACK_MATCH: Starting to match {len(correlations)} users with {len(email_to_slack_id)} Slack users")

            matched = 0
            skipped = 0

            # Try to match each correlation to a Slack user
            for correlation in correlations:
                # Check if there's a manual mapping for this user's Slack account
                # Manual mappings should take precedence over automatic matching
                manual_mapping = self.db.query(UserMapping).filter(
                    and_(
                        UserMapping.user_id == user.id,
                        UserMapping.source_identifier == correlation.email,
                        UserMapping.target_platform == "slack",
                        UserMapping.mapping_type == "manual"
                    )
                ).first()

                if manual_mapping:
                    # Manual mapping exists - respect it and don't overwrite
                    logger.info(f"⚠️  Skipping {correlation.email} - manual Slack mapping exists: {manual_mapping.target_identifier}")
                    skipped += 1
                    continue

                # Try exact email match
                if correlation.email:
                    slack_id = email_to_slack_id.get(correlation.email.lower())
                    if slack_id:
                        correlation.slack_user_id = slack_id
                        matched += 1
                        logger.info(f"✅ Matched {correlation.email} to Slack ID {slack_id}")
                    else:
                        logger.debug(f"No Slack match for {correlation.email}")
                        skipped += 1
                else:
                    logger.debug(f"Skipping correlation without email")
                    skipped += 1

            # Commit changes
            if matched > 0:
                self.db.commit()
                logger.info(f"✅ SLACK_MATCH: Successfully matched {matched} users to Slack accounts")
            else:
                logger.info(f"ℹ️ SLACK_MATCH: No new Slack matches (0 matched, {skipped} skipped)")

            logger.info(f"📊 SLACK_MATCH: Final results - matched: {matched}, skipped: {skipped}")
            return {"matched": matched, "skipped": skipped}

        except Exception as e:
            logger.error(f"Error matching Slack users: {e}")
            self.db.rollback()
            return None

    async def _match_jira_users(self, user: User) -> Optional[Dict[str, int]]:
        """
        Match all synced users to Jira accounts using email and name matching.

        This uses:
        - Email exact matching (primary)
        - Name similarity matching (fuzzy matching fallback)

        Returns statistics about matching results.
        """
        try:
            from app.models import JiraIntegration
            from app.services.jira_user_sync_service import JiraUserSyncService as JiraSync
            from cryptography.fernet import Fernet
            import base64
            from app.core.config import settings

            # Check if user has an active Jira integration
            jira_int = self.db.query(JiraIntegration).filter(
                JiraIntegration.user_id == user.id
            ).first()

            if not jira_int:
                logger.info("Skipping Jira matching - no active Jira integration for user")
                return None

            logger.info(f"Starting Jira account matching for user {user.id}")

            # Decrypt token
            key = settings.JWT_SECRET_KEY.encode()
            key = base64.urlsafe_b64encode(key[:32].ljust(32, b'\0'))
            fernet = Fernet(key)
            access_token = fernet.decrypt(jira_int.access_token.encode()).decode()

            # Fetch Jira users
            jira_sync_service = JiraSync(self.db)
            jira_users = await jira_sync_service._fetch_jira_users(access_token, jira_int.jira_cloud_id)

            if not jira_users:
                logger.info("No Jira users found to match")
                return {"matched": 0, "skipped": 0}

            # Get all synced users without Jira account IDs
            # For org mode: match team roster (user_id IS NULL)
            # For personal mode: match personal correlations (user_id == user.id)
            if user.organization_id:
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.organization_id == user.organization_id,
                    UserCorrelation.user_id.is_(None),
                    UserCorrelation.jira_account_id.is_(None)
                ).all()
            else:
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == user.id,
                    UserCorrelation.jira_account_id.is_(None)
                ).all()

            if not correlations:
                logger.info("No users need Jira matching")
                return {"matched": 0, "skipped": 0}

            logger.info(f"Found {len(correlations)} users to match with {len(jira_users)} Jira users")

            matched = 0
            skipped = 0

            # Try to match each correlation to a Jira user
            for correlation in correlations:
                jira_match = None

                # 1. Try exact email match first (primary)
                if correlation.email:
                    jira_match = next(
                        (ju for ju in jira_users if ju.get("email") and ju["email"].lower() == correlation.email.lower()),
                        None
                    )

                # Check if there's a manual mapping for this user's Jira account
                # Manual mappings should take precedence over automatic matching
                manual_mapping = self.db.query(UserMapping).filter(
                    and_(
                        UserMapping.user_id == user.id,
                        UserMapping.source_identifier == correlation.email,
                        UserMapping.target_platform == "jira",
                        UserMapping.mapping_type == "manual"
                    )
                ).first()

                if manual_mapping:
                    # Manual mapping exists - respect it and don't overwrite
                    logger.info(f"⚠️  Skipping {correlation.email} - manual Jira mapping exists: {manual_mapping.target_identifier}")
                    skipped += 1
                    continue

                # 2. Fall back to name-based fuzzy matching
                if not jira_match and correlation.name:
                    from difflib import SequenceMatcher
                    best_score = 0.70  # 70% threshold
                    for jira_user in jira_users:
                        jira_name = jira_user.get("display_name", "")
                        if jira_name:
                            score = SequenceMatcher(None, correlation.name.lower(), jira_name.lower()).ratio()
                            if score > best_score:
                                best_score = score
                                jira_match = jira_user

                if jira_match:
                    correlation.jira_account_id = jira_match.get("account_id")
                    correlation.jira_email = jira_match.get("email")
                    matched += 1
                    logger.info(f"✅ Matched {correlation.name} ({correlation.email}) to Jira: {jira_match.get('display_name')}")
                else:
                    skipped += 1
                    logger.debug(f"❌ No Jira match for {correlation.name} ({correlation.email})")

            # Commit all changes
            if matched > 0:
                self.db.commit()
                logger.info(f"✅ Completed {matched} Jira account matches")

            return {
                "matched": matched,
                "skipped": skipped,
                "total": len(correlations)
            }

        except Exception as e:
            logger.error(f"Error in Jira matching: {e}", exc_info=True)
            self.db.rollback()
            return None

    async def _match_linear_users(self, user: User) -> Optional[Dict[str, int]]:
        """
        Match all synced users to Linear accounts using email and name matching.

        This uses:
        - Email exact matching (primary)
        - Name similarity matching (fuzzy matching fallback)

        Returns statistics about matching results.
        """
        try:
            from app.models import LinearIntegration
            from app.services.enhanced_linear_matcher import EnhancedLinearMatcher
            from app.auth.integration_oauth import linear_integration_oauth
            from cryptography.fernet import Fernet
            import base64
            from app.core.config import settings

            # Check if user has an active Linear integration
            linear_int = self.db.query(LinearIntegration).filter(
                LinearIntegration.user_id == user.id
            ).first()

            if not linear_int or linear_int.workspace_id == "pending":
                logger.info("Skipping Linear matching - no active Linear integration for user")
                return None

            logger.info(f"Starting Linear account matching for user {user.id}")

            # Decrypt token
            key = settings.JWT_SECRET_KEY.encode()
            key = base64.urlsafe_b64encode(key[:32].ljust(32, b'\0'))
            fernet = Fernet(key)
            access_token = fernet.decrypt(linear_int.access_token.encode()).decode()

            # Fetch Linear users via GraphQL API (paginated)
            all_users = []
            cursor = None
            max_pages = 20

            for _ in range(max_pages):
                result = await linear_integration_oauth.get_users(
                    access_token,
                    first=100,
                    after=cursor,
                )

                nodes = result.get("nodes", [])
                all_users.extend(nodes)

                page_info = result.get("pageInfo", {})
                if not page_info.get("hasNextPage"):
                    break
                cursor = page_info.get("endCursor")

            # Filter to active users with required fields
            linear_users = [
                {
                    "id": u.get("id"),
                    "name": u.get("name"),
                    "email": u.get("email"),
                }
                for u in all_users
                if u.get("id") and u.get("name") and u.get("active", True)
            ]

            if not linear_users:
                logger.info("No Linear users found to match")
                return {"matched": 0, "skipped": 0}

            # Get all synced users without Linear account IDs
            # For org mode: match team roster (user_id IS NULL)
            # For personal mode: match personal correlations (user_id == user.id)
            if user.organization_id:
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.organization_id == user.organization_id,
                    UserCorrelation.user_id.is_(None),
                    UserCorrelation.linear_user_id.is_(None)
                ).all()
            else:
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == user.id,
                    UserCorrelation.linear_user_id.is_(None)
                ).all()

            if not correlations:
                logger.info("No users need Linear matching")
                return {"matched": 0, "skipped": 0}

            logger.info(f"Found {len(correlations)} users to match with {len(linear_users)} Linear users")

            matched = 0
            skipped = 0

            # Initialize matcher
            matcher = EnhancedLinearMatcher()

            # Try to match each correlation to a Linear user
            for correlation in correlations:
                # Check if there's a manual mapping for this user's Linear account
                # Manual mappings should take precedence over automatic matching
                manual_mapping = self.db.query(UserMapping).filter(
                    and_(
                        UserMapping.user_id == user.id,
                        UserMapping.source_identifier == correlation.email,
                        UserMapping.target_platform == "linear",
                        UserMapping.mapping_type == "manual"
                    )
                ).first()

                if manual_mapping:
                    # Manual mapping exists - respect it and don't overwrite
                    logger.info(f"⚠️  Skipping {correlation.email} - manual Linear mapping exists: {manual_mapping.target_identifier}")
                    skipped += 1
                    continue

                # Try email-based matching (primary strategy)
                match_result = await matcher.match_email_to_linear(
                    team_email=correlation.email,
                    linear_users=linear_users,
                    confidence_threshold=0.70
                )

                # Fallback to name matching if email fails and name exists
                if not match_result and correlation.name:
                    match_result = await matcher.match_name_to_linear(
                        team_name=correlation.name,
                        linear_users=linear_users,
                        confidence_threshold=0.70
                    )

                if match_result:
                    linear_user_id, linear_name, confidence = match_result
                    correlation.linear_user_id = linear_user_id

                    # Also set linear_email if available
                    linear_user = next(
                        (u for u in linear_users if u["id"] == linear_user_id),
                        None
                    )
                    if linear_user and linear_user.get("email"):
                        correlation.linear_email = linear_user["email"]

                    matched += 1
                    logger.info(f"✅ Matched {correlation.name} ({correlation.email}) to Linear: {linear_name} (confidence: {confidence:.2f})")
                else:
                    skipped += 1
                    logger.debug(f"❌ No Linear match for {correlation.name} ({correlation.email})")

            # Commit all changes
            if matched > 0:
                self.db.commit()
                logger.info(f"✅ Completed {matched} Linear account matches")

            return {
                "matched": matched,
                "skipped": skipped,
                "total": len(correlations)
            }

        except Exception as e:
            logger.error(f"Error in Linear matching: {e}", exc_info=True)
            self.db.rollback()
            return None

    async def _match_openai_users(self, user: User) -> Optional[Dict[str, int]]:
        """
        Match synced users to OpenAI accounts by exact email.
        Only runs when an AIUsageIntegration with openai_enabled exists.
        """
        try:
            from app.models import AIUsageIntegration
            from app.services.ai_usage_collector import fetch_openai_members
            import base64
            from cryptography.fernet import Fernet
            from app.core.config import settings

            # Find AI usage integration scoped to this user's org (or user)
            if user.organization_id:
                ai_int = self.db.query(AIUsageIntegration).filter(
                    AIUsageIntegration.organization_id == user.organization_id,
                    AIUsageIntegration.openai_enabled == True,
                ).first()
            else:
                ai_int = self.db.query(AIUsageIntegration).filter(
                    AIUsageIntegration.user_id == user.id,
                    AIUsageIntegration.organization_id.is_(None),
                    AIUsageIntegration.openai_enabled == True,
                ).first()

            if not ai_int:
                logger.info("Skipping OpenAI matching - no active OpenAI integration")
                return None

            # Decrypt key
            key = settings.JWT_SECRET_KEY.encode()
            key = base64.urlsafe_b64encode(key[:32].ljust(32, b'\0'))
            api_key = Fernet(key).decrypt(ai_int.openai_api_key.encode()).decode()

            # Fetch OpenAI members: {user_id -> email}
            uid_to_email = await fetch_openai_members(api_key)
            if not uid_to_email:
                logger.info("No OpenAI members returned")
                return {"matched": 0, "skipped": 0}

            email_to_uid = {email.lower(): uid for uid, email in uid_to_email.items()}

            # Get correlations without OpenAI mapping yet
            if user.organization_id:
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.organization_id == user.organization_id,
                    UserCorrelation.user_id.is_(None),
                    UserCorrelation.openai_user_id.is_(None),
                ).all()
            else:
                correlations = self.db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == user.id,
                    UserCorrelation.openai_user_id.is_(None),
                ).all()

            matched = 0
            skipped = 0
            for corr in correlations:
                if not corr.email:
                    skipped += 1
                    continue
                uid = email_to_uid.get(corr.email.lower())
                if uid:
                    # Enforce uniqueness within scope
                    conflict_filter = [
                        UserCorrelation.id != corr.id,
                        UserCorrelation.openai_user_id == uid,
                    ]
                    if user.organization_id:
                        conflict_filter.append(UserCorrelation.organization_id == user.organization_id)
                    else:
                        conflict_filter.append(UserCorrelation.user_id == user.id)
                    for c in self.db.query(UserCorrelation).filter(*conflict_filter).all():
                        c.openai_user_id = None
                    corr.openai_user_id = uid
                    matched += 1
                    logger.info(f"✅ OpenAI matched {corr.email} → {uid}")
                else:
                    skipped += 1

            if matched > 0:
                self.db.commit()
                logger.info(f"✅ Completed {matched} OpenAI account matches")

            return {"matched": matched, "skipped": skipped, "total": len(correlations)}

        except Exception as e:
            logger.error(f"Error in OpenAI matching: {e}", exc_info=True)
            self.db.rollback()
            return None
