"""
User model for authentication and user management.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)  # Primary email
    name = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=True)  # NULL for OAuth users
    
    # Legacy fields for backward compatibility - will be deprecated
    provider = Column(String(50), nullable=True)  # 'google', 'github', or NULL
    provider_id = Column(String(255), nullable=True)  # OAuth provider user ID
    
    is_verified = Column(Boolean, default=False)  # TRUE for OAuth users
    rootly_token = Column(Text, nullable=True)  # Encrypted Rootly API token
    
    # LLM Integration fields
    llm_token = Column(Text, nullable=True)  # Encrypted custom LLM API token
    llm_provider = Column(String(50), nullable=True)  # 'openai', 'anthropic', etc.
    active_llm_token_source = Column(String(20), default='system')  # 'system' or 'custom' - which token is currently active

    # Organization and role management
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    role = Column(String(20), default="user")  # 'super_admin', 'org_admin', 'manager', 'user'
    joined_org_at = Column(DateTime(timezone=True), server_default=func.now())
    last_active_at = Column(DateTime(timezone=True))
    status = Column(String(20), default="active")  # 'active', 'suspended', 'pending'

    # Domain-based data sharing
    email_domain = Column(String(255), nullable=True, index=True)  # Extracted from email for grouping users

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    organization = relationship("Organization", back_populates="users")
    analyses = relationship("Analysis", back_populates="user")
    rootly_integrations = relationship("RootlyIntegration", back_populates="user")
    oauth_providers = relationship("OAuthProvider", back_populates="user", cascade="all, delete-orphan")
    emails = relationship("UserEmail", back_populates="user", cascade="all, delete-orphan")
    github_integrations = relationship("GitHubIntegration", back_populates="user", cascade="all, delete-orphan")
    slack_integrations = relationship("SlackIntegration", back_populates="user", cascade="all, delete-orphan")
    user_correlations = relationship("UserCorrelation", back_populates="user", cascade="all, delete-orphan")
    integration_mappings = relationship("IntegrationMapping", back_populates="user", cascade="all, delete-orphan")
    user_mappings_owned = relationship("UserMapping", foreign_keys="UserMapping.user_id", back_populates="user", cascade="all, delete-orphan")
    user_mappings_created = relationship("UserMapping", foreign_keys="UserMapping.created_by", back_populates="creator")
    owned_slack_workspaces = relationship("SlackWorkspaceMapping", back_populates="owner")
    jira_integrations = relationship("JiraIntegration", back_populates="user", cascade="all, delete-orphan")
    owned_jira_workspaces = relationship("JiraWorkspaceMapping", back_populates="owner")

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', providers={len(self.oauth_providers)})>"
    
    @property
    def primary_oauth_provider(self):
        """Get the primary OAuth provider for this user."""
        for provider in self.oauth_providers:
            if provider.is_primary:
                return provider
        return self.oauth_providers[0] if self.oauth_providers else None
    
    @property
    def all_emails(self):
        """Get all verified emails for this user."""
        return [email.email for email in self.emails if email.is_verified]

    def update_email_domain(self):
        """Extract and update email_domain from email address."""
        if self.email and '@' in self.email:
            self.email_domain = self.email.split('@')[1].lower()
        return self.email_domain

    def has_provider(self, provider_name: str) -> bool:
        """Check if user has a specific OAuth provider linked."""
        return any(p.provider == provider_name for p in self.oauth_providers)
    
    @property
    def github_integration(self):
        """Get the GitHub integration for this user."""
        return self.github_integrations[0] if self.github_integrations else None
    
    @property
    def slack_integration(self):
        """Get the Slack integration for this user."""
        return self.slack_integrations[0] if self.slack_integrations else None

    @property
    def jira_integration(self):
        """Get the Jira integration for this user."""
        return self.jira_integrations[0] if self.jira_integrations else None
    
    @property
    def primary_correlation(self):
        """Get the primary user correlation for this user."""
        return self.user_correlations[0] if self.user_correlations else None
    
    def has_github_integration(self) -> bool:
        """Check if user has GitHub integration set up."""
        return len(self.github_integrations) > 0
    
    def has_slack_integration(self) -> bool:
        """Check if user has Slack integration set up."""
        return len(self.slack_integrations) > 0
    
    def has_llm_token(self) -> bool:
        """Check if user has LLM token configured."""
        return self.llm_token is not None and self.llm_provider is not None

    def has_jira_integration(self) -> bool:
        """Check if user has Jira integration set up."""
        return len(self.jira_integrations) > 0

    @property
    def connected_platforms(self) -> list:
        """Get list of all connected platforms for this user."""
        platforms = []
        if self.rootly_integrations:
            platforms.append("rootly")
        if self.github_integrations:
            platforms.append("github")
        if self.slack_integrations:
            platforms.append("slack")
        # Check for PagerDuty through correlations
        if self.user_correlations and any(c.pagerduty_user_id for c in self.user_correlations):
            platforms.append("pagerduty")
        return platforms

    # Role-based properties
    @property
    def is_super_admin(self) -> bool:
        """Check if user is a super admin."""
        return self.role == 'super_admin'

    @property
    def is_org_admin(self) -> bool:
        """Check if user is an organization admin."""
        return self.role in ['super_admin', 'org_admin']

    def is_admin(self) -> bool:
        """Check if user is an admin (super_admin or org_admin)."""
        return self.is_org_admin

    @property
    def is_manager(self) -> bool:
        """Check if user can manage analyses and surveys."""
        return self.role in ['super_admin', 'org_admin', 'manager']

    @property
    def is_active(self) -> bool:
        """Check if user account is active."""
        return self.status == 'active'

    def can_manage_organization(self, org_id: int = None) -> bool:
        """Check if user can manage organization settings."""
        if self.is_super_admin:
            return True
        if self.role == 'org_admin' and (org_id is None or self.organization_id == org_id):
            return True
        return False

    def can_manage_users(self, org_id: int = None) -> bool:
        """Check if user can manage other users."""
        return self.can_manage_organization(org_id)

    def can_create_analyses(self) -> bool:
        """Check if user can create burnout analyses."""
        return self.is_manager

    def to_dict(self, include_sensitive=False):
        """Convert user to dictionary for API responses."""
        data = {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'status': self.status,
            'is_verified': self.is_verified,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active_at': self.last_active_at.isoformat() if self.last_active_at else None,
            'connected_platforms': self.connected_platforms
        }

        if self.organization:
            data['organization'] = {
                'id': self.organization.id,
                'name': self.organization.name,
                'domain': self.organization.domain
            }

        if include_sensitive and self.is_super_admin:
            data['organization_id'] = self.organization_id
            data['joined_org_at'] = self.joined_org_at.isoformat() if self.joined_org_at else None

        return data