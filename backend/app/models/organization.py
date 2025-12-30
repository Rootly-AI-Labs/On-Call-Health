"""
Organization model for multi-tenant support.
"""
from sqlalchemy import Column, Integer, String, DateTime, JSON, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base

class Organization(Base):
    """
    Organization model for grouping users and providing multi-tenant isolation.
    Each organization represents a company/team using the burnout detector.
    """
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    domain = Column(String(255), unique=True, nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)

    # Contact information
    primary_contact_email = Column(String(255))
    billing_email = Column(String(255))
    website = Column(String(255))

    # Subscription and limits
    plan_type = Column(String(50), default="free")  # 'free', 'pro', 'enterprise'
    max_users = Column(Integer, default=50)
    max_analyses_per_month = Column(Integer, default=5)

    # Status and timestamps
    status = Column(String(20), default="active")  # 'active', 'suspended', 'pending'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Flexible settings as JSON
    settings = Column(JSON, default=dict)

    # Relationships
    users = relationship("User", back_populates="organization")
    analyses = relationship("Analysis", back_populates="organization")
    workspace_mappings = relationship("SlackWorkspaceMapping", back_populates="organization")
    jira_workspace_mappings = relationship("JiraWorkspaceMapping", back_populates="organization")

    # Constraints
    __table_args__ = (
        CheckConstraint(func.char_length(name) >= 2, name='organization_name_min_length'),
        CheckConstraint(domain.op('~')(r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'), name='organization_domain_format'),
    )

    def to_dict(self):
        """Convert organization to dictionary for API responses."""
        return {
            'id': self.id,
            'name': self.name,
            'domain': self.domain,
            'slug': self.slug,
            'plan_type': self.plan_type,
            'status': self.status,
            'user_count': len(self.users) if self.users else 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'website': self.website,
            'settings': self.settings or {}
        }

    @property
    def is_active(self) -> bool:
        """Check if organization is active."""
        return self.status == 'active'

    @property
    def admin_users(self):
        """Get all admin users for this organization."""
        return [user for user in self.users if user.role == 'admin']

    @property
    def regular_users(self):
        """Get all non-admin users for this organization."""
        return [user for user in self.users if user.role == 'member']

    def can_add_user(self) -> bool:
        """Check if organization can add more users based on plan limits."""
        current_user_count = len(self.users) if self.users else 0
        return current_user_count < self.max_users

    def __repr__(self):
        return f"<Organization(name='{self.name}', domain='{self.domain}', users={len(self.users) if self.users else 0})>"