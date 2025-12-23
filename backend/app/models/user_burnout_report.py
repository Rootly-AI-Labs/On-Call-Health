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

    # Core self-reported scores (1-5 scale)
    feeling_score = Column(Integer, nullable=False)  # 1-5 scale: How user is feeling (1=struggling, 5=very good)
    workload_score = Column(Integer, nullable=False)  # 1-5 scale: How manageable workload feels (1=overwhelming, 5=very manageable)

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
            'feeling_score': self.feeling_score,
            'workload_score': self.workload_score,
            'stress_factors': self.stress_factors,
            'personal_circumstances': self.personal_circumstances,
            'additional_comments': self.additional_comments,
            'submitted_via': self.submitted_via,
            'is_anonymous': self.is_anonymous,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @property
    def workload_text(self):
        """Convert numeric workload score to human-readable text."""
        workload_map = {
            1: "Overwhelming",
            2: "Barely Manageable",
            3: "Somewhat Manageable",
            4: "Manageable",
            5: "Very Manageable"
        }
        return workload_map.get(self.workload_score, "Unknown")

    @property
    def feeling_text(self):
        """Convert numeric feeling score to human-readable text."""
        feeling_map = {
            1: "Struggling",
            2: "Not Great",
            3: "Okay",
            4: "Good",
            5: "Very Good"
        }
        return feeling_map.get(self.feeling_score, "Unknown")

    @property
    def risk_level(self):
        """Calculate risk level from feeling and workload scores (1-5 scale).
        Lower scores indicate higher risk."""
        # Average the two scores to get overall health (1-5 scale)
        avg_score = (self.feeling_score + self.workload_score) / 2

        if avg_score >= 4:
            return 'healthy'
        elif avg_score >= 3:
            return 'fair'
        elif avg_score >= 2:
            return 'poor'
        else:
            return 'critical'