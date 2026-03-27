"""
Service for retrieving Slack OAuth tokens.
Centralizes token retrieval logic for consistent access across the application.
"""
import logging
from typing import Optional, Tuple, Dict
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.slack_integration import SlackIntegration
from ..models.slack_workspace_mapping import SlackWorkspaceMapping
from ..api.endpoints.slack import decrypt_token

logger = logging.getLogger(__name__)


class SlackFeatureConfig:
    """Configuration for Slack features enabled for a workspace."""
    def __init__(self, survey_enabled: bool = False):
        self.survey_enabled = survey_enabled

    def to_dict(self) -> Dict[str, bool]:
        return {
            'survey_enabled': self.survey_enabled
        }


class SlackTokenService:
    """Service for retrieving and managing Slack OAuth tokens."""

    def __init__(self, db: Session):
        self.db = db

    def _get_active_workspace_mapping_for_organization(
        self,
        organization_id: int,
    ) -> Optional[SlackWorkspaceMapping]:
        """Return the most recently registered active workspace for an organization."""
        return (
            self.db.query(SlackWorkspaceMapping)
            .filter(
                SlackWorkspaceMapping.organization_id == organization_id,
                SlackWorkspaceMapping.status == 'active',
            )
            .order_by(
                SlackWorkspaceMapping.registered_at.desc(),
                SlackWorkspaceMapping.id.desc(),
            )
            .first()
        )

    def get_oauth_token_for_workspace(self, workspace_id: str) -> Optional[str]:
        """
        Get a decrypted OAuth Slack token for a specific workspace.

        Tries the newest OAuth integrations first and falls back if older rows are stale
        or contain undecryptable tokens.
        """
        slack_integrations = (
            self.db.query(SlackIntegration)
            .filter(
                SlackIntegration.workspace_id == workspace_id,
                SlackIntegration.token_source == "oauth",
            )
            .order_by(
                SlackIntegration.updated_at.desc(),
                SlackIntegration.created_at.desc(),
                SlackIntegration.id.desc(),
            )
            .all()
        )

        if not slack_integrations:
            logger.warning(
                f"No OAuth Slack integrations found for workspace {workspace_id}"
            )
            return None

        for slack_integration in slack_integrations:
            if not slack_integration.slack_token:
                logger.warning(
                    f"Skipping Slack integration {slack_integration.id} with no token "
                    f"(workspace {workspace_id})"
                )
                continue

            try:
                token = decrypt_token(slack_integration.slack_token)
                logger.debug(
                    f"Successfully retrieved OAuth Slack token from integration "
                    f"{slack_integration.id} for workspace {workspace_id}"
                )
                return token
            except Exception as e:
                logger.warning(
                    f"Failed to decrypt Slack token for integration "
                    f"{slack_integration.id} in workspace {workspace_id}: {e}"
                )

        logger.error(
            f"No valid decryptable OAuth Slack token found for workspace {workspace_id}"
        )
        return None

    def get_oauth_token_for_user(self, user: User) -> Optional[str]:
        """
        Get the decrypted OAuth Slack token for a user's organization.

        Args:
            user: User object with organization_id

        Returns:
            Decrypted Slack bot token, or None if not found
        """
        if not user.organization_id:
            logger.warning(f"User {user.id} has no organization_id, cannot retrieve Slack token")
            return None

        return self.get_oauth_token_for_organization(user.organization_id)

    def get_oauth_token_for_organization(self, organization_id: int) -> Optional[str]:
        """
        Get the decrypted OAuth Slack token for an organization.

        Args:
            organization_id: Organization ID

        Returns:
            Decrypted Slack bot token, or None if not found
        """
        # Find active workspace mapping for this organization
        workspace_mapping = self._get_active_workspace_mapping_for_organization(
            organization_id
        )

        if not workspace_mapping:
            logger.debug(f"No active Slack workspace mapping found for org {organization_id}")
            return None

        return self.get_oauth_token_for_workspace(workspace_mapping.workspace_id)

    def get_workspace_info_for_user(self, user: User) -> Optional[Tuple[str, str]]:
        """
        Get workspace ID and name for a user's organization.

        Args:
            user: User object with organization_id

        Returns:
            Tuple of (workspace_id, workspace_name) or None if not found
        """
        if not user.organization_id:
            return None

        workspace_mapping = self._get_active_workspace_mapping_for_organization(
            user.organization_id
        )

        if workspace_mapping:
            return (workspace_mapping.workspace_id, workspace_mapping.workspace_name)

        return None

    def get_feature_config_for_user(self, user: User) -> Optional[SlackFeatureConfig]:
        """
        Get Slack feature configuration for a user's organization.

        Args:
            user: User object with organization_id

        Returns:
            SlackFeatureConfig or None if no workspace found
        """
        if not user.organization_id:
            return None

        workspace_mapping = self._get_active_workspace_mapping_for_organization(
            user.organization_id
        )

        if not workspace_mapping:
            return None

        return SlackFeatureConfig(
            survey_enabled=workspace_mapping.survey_enabled or False
        )

    def get_feature_config_for_organization(self, organization_id: int) -> Optional[SlackFeatureConfig]:
        """
        Get Slack feature configuration for an organization.

        Args:
            organization_id: Organization ID

        Returns:
            SlackFeatureConfig or None if no workspace found
        """
        workspace_mapping = self._get_active_workspace_mapping_for_organization(
            organization_id
        )

        if not workspace_mapping:
            return None

        return SlackFeatureConfig(
            survey_enabled=workspace_mapping.survey_enabled or False
        )


def get_slack_token_for_user(db: Session, user: User) -> Optional[str]:
    """
    Convenience function to get OAuth Slack token for a user.

    Args:
        db: Database session
        user: User object

    Returns:
        Decrypted Slack bot token or None
    """
    service = SlackTokenService(db)
    return service.get_oauth_token_for_user(user)


def get_slack_token_for_organization(db: Session, organization_id: int) -> Optional[str]:
    """
    Convenience function to get OAuth Slack token for an organization.

    Args:
        db: Database session
        organization_id: Organization ID

    Returns:
        Decrypted Slack bot token or None
    """
    service = SlackTokenService(db)
    return service.get_oauth_token_for_organization(organization_id)
