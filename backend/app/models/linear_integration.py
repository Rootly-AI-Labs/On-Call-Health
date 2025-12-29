"""
Linear integration model for storing Linear OAuth tokens and user mappings.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base


class LinearIntegration(Base):
    __tablename__ = "linear_integrations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # OAuth tokens (encrypted)
    access_token = Column(Text, nullable=True)  # Encrypted Linear access token
    refresh_token = Column(Text, nullable=True)  # Encrypted Linear refresh token (24hr expiry)

    # Linear workspace info
    workspace_id = Column(String(100), nullable=False, index=True)  # Linear organization ID
    workspace_name = Column(String(255), nullable=True)  # Organization name
    workspace_url_key = Column(String(255), nullable=True)  # URL key (e.g., "mycompany" in linear.app/mycompany)

    # Linear user info
    linear_user_id = Column(String(100), nullable=True, index=True)  # Linear user UUID
    linear_display_name = Column(String(255), nullable=True)  # User's display name in Linear
    linear_email = Column(String(255), nullable=True)  # User's email in Linear

    # Multi-workspace support (user can have access to multiple Linear organizations)
    accessible_workspaces = Column(JSON, default=list)  # List of all Linear orgs user has access to

    # Token metadata
    token_source = Column(String(20), default="oauth")  # 'oauth' or 'manual' (API key)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)  # When access token expires

    # PKCE support
    pkce_code_verifier = Column(Text, nullable=True)  # Stored temporarily during OAuth flow

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="linear_integrations")

    def __repr__(self):
        return f"<LinearIntegration(id={self.id}, user_id={self.user_id}, workspace='{self.workspace_name}')>"

    @property
    def has_token(self) -> bool:
        """Check if this integration has a valid token."""
        return self.access_token is not None and len(self.access_token) > 0

    @property
    def has_refresh_token(self) -> bool:
        """Check if this integration has a refresh token."""
        return self.refresh_token is not None and len(self.refresh_token) > 0

    @property
    def is_oauth(self) -> bool:
        """Check if this integration uses OAuth tokens."""
        return self.token_source == "oauth"

    @property
    def is_manual(self) -> bool:
        """Check if this integration uses manual API key."""
        return self.token_source == "manual"

    @property
    def supports_refresh(self) -> bool:
        """Check if this integration supports token refresh."""
        return self.is_oauth and self.has_refresh_token

    @property
    def needs_refresh(self) -> bool:
        """Check if token needs refresh (within 1 hour of expiry for 24hr tokens)."""
        if not self.token_expires_at:
            return False
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc)
        # Refresh if less than 1 hour until expiry (more aggressive for 24hr tokens)
        return (self.token_expires_at - now).total_seconds() < 3600

    @property
    def accessible_orgs(self) -> list:
        """Get list of accessible Linear organizations."""
        if isinstance(self.accessible_workspaces, list):
            return self.accessible_workspaces
        return []

    def add_accessible_workspace(self, workspace_info: dict):
        """Add an accessible Linear workspace."""
        if not isinstance(self.accessible_workspaces, list):
            self.accessible_workspaces = []
        # Check if workspace already exists
        existing = next(
            (w for w in self.accessible_workspaces if w.get('id') == workspace_info.get('id')),
            None
        )
        if not existing:
            self.accessible_workspaces.append(workspace_info)
