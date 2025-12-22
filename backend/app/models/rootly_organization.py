"""
Rootly Organization model for tracking which Rootly orgs are being analyzed.
Decouples the Rootly org being analyzed from the app tenant organization.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base


class RootlyOrganization(Base):
    __tablename__ = "rootly_organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    domain = Column(String(255), unique=True, nullable=True)  # Canonical identifier
    app_tenant_id = Column(Integer, ForeignKey("organizations.id"), default=1)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    app_tenant = relationship("Organization")
    created_by = relationship("User")

    def __repr__(self):
        return f"<RootlyOrganization(id={self.id}, name='{self.name}', domain='{self.domain}')>"
