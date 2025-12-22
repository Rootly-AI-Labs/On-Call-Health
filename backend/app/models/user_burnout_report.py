"""
User Burnout Report model for storing self-reported burnout assessments.
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base

class UserBurnoutReport(Base):
    """
    Stores user self-reported burnout assessments independent of analyses.
    Enables daily/periodic tracking of self-reported burnout over time.
    """
    __tablename__ = "user_burnout_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, nullable=True)  # Nullable - FK removed in migration 019
    email_domain = Column(String(255), nullable=True, index=True)  # Domain-based grouping for aggregation
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=True)  # Optional - for linking to specific analysis

    # Core self-reported scores (0-100 scale to match OCB)
    self_reported_score = Column(Integer, nullable=False)  # 0-100 burnout score
    energy_level = Column(Integer, nullable=False)  # 1-5 scale (Very Low to Very High)

    # Stress factors as JSON array
    stress_factors = Column(JSON, nullable=True)  # ["incident_volume", "work_hours", "on_call_burden", ...]

    # Personal circumstances flag (non-work factors)
    personal_circumstances = Column(String(20), nullable=True)  # 'significantly', 'somewhat', 'no', 'prefer_not_say'

    # Optional context
    additional_comments = Column(Text, nullable=True)  # Free text feedback

    # Metadata
    submitted_via = Column(String(20), default='web')  # 'web', 'slack', 'email'
    is_anonymous = Column(Boolean, default=False)  # For anonymous submissions
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="burnout_reports")
    # Note: organization_id FK was removed in migration 019 - no relationship
    analysis = relationship("Analysis", backref="user_burnout_reports")

    def to_dict(self):
        """Convert model to dictionary for API responses."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'analysis_id': self.analysis_id,
            'self_reported_score': self.self_reported_score,
            'energy_level': self.energy_level,
            'stress_factors': self.stress_factors,
            'personal_circumstances': self.personal_circumstances,
            'additional_comments': self.additional_comments,
            'submitted_via': self.submitted_via,
            'is_anonymous': self.is_anonymous,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @property
    def energy_level_text(self):
        """Convert numeric energy level to human-readable text."""
        energy_map = {
            1: "Very Low",
            2: "Low",
            3: "Moderate",
            4: "High",
            5: "Very High"
        }
        return energy_map.get(self.energy_level, "Unknown")

    @property
    def risk_level(self):
        """Calculate risk level from self-reported score using OCB ranges."""
        if self.self_reported_score < 25:
            return 'healthy'
        elif self.self_reported_score < 50:
            return 'fair'
        elif self.self_reported_score < 75:
            return 'poor'
        else:
            return 'critical'

    def calculate_variance(self, automated_score):
        """Calculate variance between self-reported and automated scores."""
        if automated_score is None:
            return None
        return self.self_reported_score - automated_score