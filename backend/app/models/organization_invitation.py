"""
Organization invitation model for inviting users with Gmail/shared domain emails.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base

class OrganizationInvitation(Base):
    """
    Invitation system for adding users to organizations.
    Needed for Gmail users and other shared domain emails.
    """
    __tablename__ = "organization_invitations"

    id = Column(Integer, primary_key=True, index=True)

    # Organization and user info
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(20), default="member")  # 'admin', 'member'

    # Invitation tracking
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    token = Column(String(255), unique=True, nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="pending")  # 'pending', 'accepted', 'expired', 'revoked'

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    used_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    organization = relationship("Organization")
    inviter = relationship("User", foreign_keys=[invited_by])

    def to_dict(self):
        return {
            'id': self.id,
            'organization_id': self.organization_id,
            'email': self.email,
            'role': self.role,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'organization_name': self.organization.name if self.organization else None
        }

    @property
    def is_expired(self) -> bool:
        """Check if invitation has expired."""
        if not self.expires_at:
            return False
        from datetime import datetime, timezone
        return datetime.now(timezone.utc) > self.expires_at

    @property
    def is_pending(self) -> bool:
        """Check if invitation is still pending."""
        return self.status == 'pending' and not self.is_expired

    def __repr__(self):
        return f"<OrganizationInvitation(email='{self.email}', org_id={self.organization_id}, status='{self.status}')>"