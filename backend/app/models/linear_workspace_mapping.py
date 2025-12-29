"""
Linear workspace mapping model for correlating Linear organizations to app organizations.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Boolean, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base


class LinearWorkspaceMapping(Base):
    """
    Maps Linear organizations (workspaces) to specific organizations/users.
    Ensures multi-tenant isolation for Linear data collection.
    """
    __tablename__ = "linear_workspace_mappings"

    id = Column(Integer, primary_key=True, index=True)

    # Linear workspace info
    workspace_id = Column(String(100), nullable=False, unique=True)  # Unique Linear organization ID
    workspace_name = Column(String(255), nullable=True)  # Organization name
    workspace_url_key = Column(String(255), nullable=True)  # URL key (e.g., "mycompany")

    # Organization mapping
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # User who connected
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)  # Organization reference

    # Team configuration - which teams to monitor (Linear uses teams instead of projects)
    team_ids = Column(JSON, default=list)  # e.g., ["team-uuid-1", "team-uuid-2"]
    team_names = Column(JSON, default=list)  # Human-readable names for display

    # Registration tracking
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    registered_via = Column(String(20), default="oauth")  # "oauth", "manual", "admin"

    # Status
    status = Column(String(20), default="active")  # "active", "suspended", "pending"

    # Feature flags - what capabilities are enabled for this workspace
    collection_enabled = Column(Boolean, default=True)  # Enable data collection
    workload_metrics_enabled = Column(Boolean, default=True)  # Calculate workload metrics

    # OAuth scopes granted
    granted_scopes = Column(String(500), nullable=True)  # Comma-separated list of OAuth scopes

    # Last collection metadata
    last_collection_at = Column(DateTime(timezone=True), nullable=True)
    last_collection_status = Column(String(50), nullable=True)  # "success", "partial", "failed"

    # Relationships
    owner = relationship("User", back_populates="owned_linear_workspaces")
    organization = relationship("Organization", back_populates="linear_workspace_mappings")

    # Constraints
    __table_args__ = (
        UniqueConstraint('workspace_id', name='unique_linear_workspace_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'workspace_id': self.workspace_id,
            'workspace_name': self.workspace_name,
            'workspace_url_key': self.workspace_url_key,
            'owner_user_id': self.owner_user_id,
            'organization_id': self.organization_id,
            'team_ids': self.team_ids,
            'team_names': self.team_names,
            'registered_at': self.registered_at.isoformat() if self.registered_at else None,
            'status': self.status,
            'collection_enabled': self.collection_enabled,
            'workload_metrics_enabled': self.workload_metrics_enabled,
            'granted_scopes': self.granted_scopes,
            'last_collection_at': self.last_collection_at.isoformat() if self.last_collection_at else None,
            'last_collection_status': self.last_collection_status
        }

    @property
    def is_active(self) -> bool:
        return self.status == 'active'

    @property
    def has_teams_configured(self) -> bool:
        """Check if teams are configured for monitoring."""
        return isinstance(self.team_ids, list) and len(self.team_ids) > 0

    def add_team(self, team_id: str, team_name: str = None):
        """Add a team to monitor."""
        if not isinstance(self.team_ids, list):
            self.team_ids = []
        if not isinstance(self.team_names, list):
            self.team_names = []

        if team_id not in self.team_ids:
            self.team_ids.append(team_id)
            if team_name:
                self.team_names.append(team_name)

    def remove_team(self, team_id: str):
        """Remove a team from monitoring."""
        if isinstance(self.team_ids, list) and team_id in self.team_ids:
            idx = self.team_ids.index(team_id)
            self.team_ids.pop(idx)
            if isinstance(self.team_names, list) and len(self.team_names) > idx:
                self.team_names.pop(idx)

    def set_teams(self, teams: list):
        """Set all teams to monitor. Expects list of dicts with 'id' and 'name' keys."""
        self.team_ids = [t.get('id') for t in teams if t.get('id')]
        self.team_names = [t.get('name') for t in teams if t.get('name')]

    def __repr__(self):
        return f"<LinearWorkspaceMapping(workspace_id='{self.workspace_id}', name='{self.workspace_name}', owner_user_id={self.owner_user_id})>"
