"""
Slack workspace mapping model for correlating Slack workspaces to organizations.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base

class SlackWorkspaceMapping(Base):
    """
    Maps Slack workspaces to specific organizations/users.
    Ensures multi-tenant isolation for Slack slash commands.
    """
    __tablename__ = "slack_workspace_mappings"

    id = Column(Integer, primary_key=True, index=True)

    # Slack workspace info
    workspace_id = Column(String(20), nullable=False, unique=True)  # T01234567
    workspace_name = Column(String(255), nullable=True)  # "Acme Corp"
    workspace_domain = Column(String(255), nullable=True)  # "acme-corp.slack.com"

    # Organization mapping
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # Manager who connected
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)  # Organization reference
    organization_domain = Column(String(255), nullable=True)  # "company.com"

    # Registration tracking
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    registered_via = Column(String(20), default="oauth")  # "oauth", "manual", "admin"

    # Status
    status = Column(String(20), default="active")  # "active", "suspended", "pending"

    # Feature flags - what capabilities are enabled for this workspace
    survey_enabled = Column(Boolean, default=False)  # Slash command surveys via /burnout
    granted_scopes = Column(String(500), nullable=True)  # Comma-separated list of OAuth scopes

    # Relationships
    owner = relationship("User", back_populates="owned_slack_workspaces")
    organization = relationship("Organization", back_populates="workspace_mappings")

    # Constraints
    __table_args__ = (
        UniqueConstraint('workspace_id', name='unique_workspace_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'workspace_id': self.workspace_id,
            'workspace_name': self.workspace_name,
            'workspace_domain': self.workspace_domain,
            'owner_user_id': self.owner_user_id,
            'organization_domain': self.organization_domain,
            'registered_at': self.registered_at.isoformat() if self.registered_at else None,
            'status': self.status,
            'survey_enabled': self.survey_enabled,
            'granted_scopes': self.granted_scopes
        }

    @property
    def is_active(self) -> bool:
        return self.status == 'active'

    def __repr__(self):
        return f"<SlackWorkspaceMapping(workspace_id='{self.workspace_id}', owner_user_id={self.owner_user_id})>"