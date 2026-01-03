"""
Integration mapping model for tracking successful and failed user mapping attempts.
Supports both automatic (AI-detected) and manual (user-created) mappings.
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base

class IntegrationMapping(Base):
    __tablename__ = "integration_mappings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL for org-scoped users
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)  # For org-scoped mappings
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=True)  # Track which analysis this was from
    
    # Source platform (where we got the identifier from)
    source_platform = Column(String(50), nullable=False)  # "rootly", "pagerduty"
    source_identifier = Column(String(255), nullable=False)  # email, name, etc.
    
    # Target platform (what we're trying to map to)
    target_platform = Column(String(50), nullable=False)  # "github", "slack"
    target_identifier = Column(String(255), nullable=True)  # username, user_id if successful
    
    # Mapping result
    mapping_successful = Column(Boolean, nullable=False, default=False)
    mapping_method = Column(String(100), nullable=True)  # "manual_mapping", "api_search", "email_lookup", etc.
    error_message = Column(Text, nullable=True)  # Error details if failed
    
    # Metadata
    data_collected = Column(Boolean, nullable=False, default=False)  # Whether we successfully collected data
    data_points_count = Column(Integer, nullable=True)  # Number of data points collected (commits, messages, etc.)
    
    # Manual mapping support - TEMPORARILY COMMENTED OUT until migration runs
    # mapping_source = Column(String(20), nullable=True, default='auto')  # 'auto', 'manual', 'verified'
    # created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who created manual mappings
    # confidence_score = Column(Float, nullable=True)  # For auto-detected mappings (0.0-1.0)
    # last_verified = Column(DateTime(timezone=True), nullable=True)  # When mapping was last verified
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="integration_mappings", foreign_keys=[user_id])
    organization = relationship("Organization")
    analysis = relationship("Analysis", back_populates="integration_mappings")
    # created_by = relationship("User", foreign_keys=[created_by_user_id], post_update=True)  # TEMPORARILY COMMENTED OUT
    
    def __repr__(self):
        status = "✓" if self.mapping_successful else "✗"
        return f"<IntegrationMapping({status} {self.source_platform}:{self.source_identifier} -> {self.target_platform}:{self.target_identifier})>"
    
    @property
    def mapping_key(self) -> str:
        """Unique key for this mapping attempt."""
        return f"{self.source_platform}:{self.source_identifier} -> {self.target_platform}"
    
    @property
    def success_rate_key(self) -> str:
        """Key for calculating success rates."""
        return f"{self.source_platform} -> {self.target_platform}"
    
    @property
    def is_manual(self) -> bool:
        """Check if this is a manual mapping (temporarily always False until migration)."""
        return False  # Will be implemented after migration
    
    @property
    def is_verified(self) -> bool:
        """Check if mapping has been verified recently (temporarily always False until migration)."""
        return False  # Will be implemented after migration
    
    @property
    def status(self) -> str:
        """Get human-readable status (simplified until migration)."""
        if self.mapping_successful:
            return "auto_detected"
        else:
            return "failed"
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses (simplified during migration)."""
        return {
            "id": self.id,
            "source_platform": self.source_platform,
            "source_identifier": self.source_identifier,
            "target_platform": self.target_platform,
            "target_identifier": self.target_identifier,
            "mapping_successful": self.mapping_successful,
            "mapping_method": self.mapping_method,
            "error_message": self.error_message,
            "data_collected": self.data_collected,
            "data_points_count": self.data_points_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "mapping_key": self.mapping_key,
            # Simplified fields for migration period
            "mapping_source": 'auto',  # Default until migration
            "is_manual": False,  # Default until migration
            "confidence_score": None,  # Will be implemented after migration
            "last_verified": None,  # Will be implemented after migration
            "status": self.status,
            "is_verified": False,  # Default until migration
            "created_by_user_id": None,  # Will be implemented after migration
            # Compatibility fields for frontend
            "source": "integration"  # Default until migration
        }
    
    # TEMPORARILY COMMENTED OUT until migration completes
    # @classmethod
    # def create_manual_mapping(
    #     cls,
    #     user_id: int,
    #     source_platform: str,
    #     source_identifier: str,
    #     target_platform: str,
    #     target_identifier: str,
    #     created_by_user_id: int,
    #     analysis_id: int = None
    # ):
    #     """Create a new manual mapping."""
    #     return cls(
    #         user_id=user_id,
    #         analysis_id=analysis_id,
    #         source_platform=source_platform,
    #         source_identifier=source_identifier,
    #         target_platform=target_platform,
    #         target_identifier=target_identifier,
    #         mapping_successful=True,  # Manual mappings are successful by definition
    #         mapping_method="manual",
    #         mapping_source="manual",
    #         created_by_user_id=created_by_user_id,
    #         last_verified=func.now()  # Manual mappings are verified on creation
    #     )
    
    # def update_target_identifier(self, new_target_identifier: str, updated_by_user_id: int):
    #     """Update the target identifier and convert to manual mapping (user has taken ownership)."""
    #     old_source = self.mapping_source
    #     
    #     self.target_identifier = new_target_identifier
    #     self.mapping_successful = True
    #     self.mapping_source = 'manual'  # Convert to manual since user edited it
    #     self.mapping_method = 'manual_edit'  # Track that this was edited
    #     self.created_by_user_id = updated_by_user_id
    #     self.last_verified = func.now()
    #     self.updated_at = func.now()
    #     # Clear any previous error messages
    #     self.error_message = None
    #     
    #     # Log the conversion for debugging
    #     import logging
    #     logger = logging.getLogger(__name__)
    #     logger.info(f"🔄 Converting mapping from '{old_source}' to 'manual' after user edit: {self.source_identifier} -> {new_target_identifier}")