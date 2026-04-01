"""
User login audit event model.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .base import Base


class UserLoginEvent(Base):
    __tablename__ = "user_login_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    auth_method = Column(String(50), nullable=False)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(1000), nullable=True)
    logged_in_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    user = relationship("User", back_populates="login_events")
    organization = relationship("Organization")

    def __repr__(self):
        return (
            f"<UserLoginEvent(user_id={self.user_id}, auth_method='{self.auth_method}', "
            f"logged_in_at={self.logged_in_at})>"
        )
