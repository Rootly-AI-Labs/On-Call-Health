"""
AI Usage integration model for storing OpenAI and Anthropic API keys.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base


class AIUsageIntegration(Base):
    __tablename__ = "ai_usage_integrations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)

    # OpenAI
    openai_api_key = Column(Text, nullable=True)       # Encrypted
    openai_org_id = Column(String(200), nullable=True)  # Optional org ID for OpenAI
    openai_enabled = Column(Boolean, default=False)

    # Anthropic
    anthropic_api_key = Column(Text, nullable=True)    # Encrypted
    anthropic_workspace_id = Column(String(200), nullable=True)
    anthropic_enabled = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="ai_usage_integrations")
    organization = relationship("Organization", back_populates="ai_usage_integrations")

    def __repr__(self):
        return f"<AIUsageIntegration(id={self.id}, user_id={self.user_id}, openai={self.openai_enabled}, anthropic={self.anthropic_enabled})>"

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key) and self.openai_enabled

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key) and self.anthropic_enabled

    @property
    def is_connected(self) -> bool:
        return self.has_openai or self.has_anthropic
