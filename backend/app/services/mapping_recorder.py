"""
Service for recording integration mapping attempts and results.
"""
import logging
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models import IntegrationMapping, get_db

logger = logging.getLogger(__name__)

class MappingRecorder:
    """Records and manages integration mapping data."""
    
    def __init__(self, db: Session = None):
        self.db = db or next(get_db())
    
    def record_mapping_attempt(
        self,
        user_id: int,
        analysis_id: Optional[int],
        source_platform: str,
        source_identifier: str,
        target_platform: str,
        mapping_successful: bool = False,
        target_identifier: Optional[str] = None,
        mapping_method: Optional[str] = None,
        error_message: Optional[str] = None,
        data_collected: bool = False,
        data_points_count: Optional[int] = None
    ) -> Optional[IntegrationMapping]:
        """Record a mapping attempt."""

        # Validate user_id is an integer (not a PagerDuty/Rootly user ID string)
        if not isinstance(user_id, int):
            logger.warning(f"Skipping mapping record - user_id must be an integer database ID, got {type(user_id).__name__}: {user_id}")
            return None

        # Verify user exists to prevent foreign key violations
        from ..models import User
        user_exists = self.db.query(User).filter(User.id == user_id).first()
        if not user_exists:
            logger.warning(f"Skipping mapping record - user {user_id} does not exist")
            return None

        # If analysis_id is provided, verify it exists
        if analysis_id is not None:
            from ..models import Analysis
            analysis_exists = self.db.query(Analysis).filter(Analysis.id == analysis_id).first()
            if not analysis_exists:
                logger.warning(f"Skipping mapping record - analysis {analysis_id} does not exist")
                return None
        
        # Check if this exact mapping already exists for this analysis
        existing = self.db.query(IntegrationMapping).filter(
            and_(
                IntegrationMapping.user_id == user_id,
                IntegrationMapping.analysis_id == analysis_id,
                IntegrationMapping.source_platform == source_platform,
                IntegrationMapping.source_identifier == source_identifier,
                IntegrationMapping.target_platform == target_platform
            )
        ).first()
        
        if existing:
            # Update existing record
            existing.mapping_successful = mapping_successful
            existing.target_identifier = target_identifier
            existing.mapping_method = mapping_method
            existing.error_message = error_message
            existing.data_collected = data_collected
            existing.data_points_count = data_points_count
            mapping = existing
        else:
            # Create new record
            mapping = IntegrationMapping(
                user_id=user_id,
                analysis_id=analysis_id,
                source_platform=source_platform,
                source_identifier=source_identifier,
                target_platform=target_platform,
                mapping_successful=mapping_successful,
                target_identifier=target_identifier,
                mapping_method=mapping_method,
                error_message=error_message,
                data_collected=data_collected,
                data_points_count=data_points_count
            )
            self.db.add(mapping)
        
        self.db.commit()
        self.db.refresh(mapping)
        
        logger.info(f"Recorded mapping: {mapping}")
        return mapping
    
    def record_successful_mapping(
        self,
        user_id: int,
        analysis_id: Optional[int],
        source_platform: str,
        source_identifier: str,
        target_platform: str,
        target_identifier: str,
        mapping_method: str,
        data_points_count: Optional[int] = None
    ) -> IntegrationMapping:
        """Record a successful mapping."""
        return self.record_mapping_attempt(
            user_id=user_id,
            analysis_id=analysis_id,
            source_platform=source_platform,
            source_identifier=source_identifier,
            target_platform=target_platform,
            mapping_successful=True,
            target_identifier=target_identifier,
            mapping_method=mapping_method,
            data_collected=data_points_count is not None and data_points_count > 0,
            data_points_count=data_points_count
        )
    
    def record_failed_mapping(
        self,
        user_id: int,
        analysis_id: Optional[int],
        source_platform: str,
        source_identifier: str,
        target_platform: str,
        error_message: str,
        mapping_method: Optional[str] = None
    ) -> IntegrationMapping:
        """Record a failed mapping."""
        return self.record_mapping_attempt(
            user_id=user_id,
            analysis_id=analysis_id,
            source_platform=source_platform,
            source_identifier=source_identifier,
            target_platform=target_platform,
            mapping_successful=False,
            error_message=error_message,
            mapping_method=mapping_method,
            data_collected=False
        )
    
    def get_user_mappings(self, user_id: int) -> List[IntegrationMapping]:
        """Get all mappings for a user."""
        return self.db.query(IntegrationMapping).filter(
            IntegrationMapping.user_id == user_id
        ).order_by(IntegrationMapping.created_at.desc()).all()
    
    def get_analysis_mappings(self, analysis_id: int) -> List[IntegrationMapping]:
        """Get all mappings for an analysis."""
        return self.db.query(IntegrationMapping).filter(
            IntegrationMapping.analysis_id == analysis_id
        ).order_by(IntegrationMapping.created_at.desc()).all()
    
    def get_mapping_statistics(self, user_id: Optional[int] = None) -> Dict[str, Any]:
        """Get mapping statistics."""
        query = self.db.query(IntegrationMapping)
        if user_id:
            query = query.filter(IntegrationMapping.user_id == user_id)
        
        mappings = query.all()
        
        stats = {
            "total_attempts": len(mappings),
            "successful_mappings": len([m for m in mappings if m.mapping_successful]),
            "failed_mappings": len([m for m in mappings if not m.mapping_successful]),
            "success_rate": 0.0,
            "platform_stats": {},
            "method_stats": {}
        }
        
        if stats["total_attempts"] > 0:
            stats["success_rate"] = stats["successful_mappings"] / stats["total_attempts"]
        
        # Platform-specific stats
        for mapping in mappings:
            platform_key = f"{mapping.source_platform} -> {mapping.target_platform}"
            if platform_key not in stats["platform_stats"]:
                stats["platform_stats"][platform_key] = {
                    "total": 0,
                    "successful": 0,
                    "failed": 0,
                    "success_rate": 0.0
                }
            
            stats["platform_stats"][platform_key]["total"] += 1
            if mapping.mapping_successful:
                stats["platform_stats"][platform_key]["successful"] += 1
            else:
                stats["platform_stats"][platform_key]["failed"] += 1
        
        # Calculate success rates for each platform combination
        for platform_key in stats["platform_stats"]:
            platform_stats = stats["platform_stats"][platform_key]
            if platform_stats["total"] > 0:
                platform_stats["success_rate"] = platform_stats["successful"] / platform_stats["total"]
        
        # Method-specific stats
        for mapping in mappings:
            if mapping.mapping_method:
                if mapping.mapping_method not in stats["method_stats"]:
                    stats["method_stats"][mapping.mapping_method] = {
                        "total": 0,
                        "successful": 0,
                        "success_rate": 0.0
                    }
                
                stats["method_stats"][mapping.mapping_method]["total"] += 1
                if mapping.mapping_successful:
                    stats["method_stats"][mapping.mapping_method]["successful"] += 1
        
        # Calculate success rates for each method
        for method in stats["method_stats"]:
            method_stats = stats["method_stats"][method]
            if method_stats["total"] > 0:
                method_stats["success_rate"] = method_stats["successful"] / method_stats["total"]
        
        return stats
    
    def get_recent_mappings(self, user_id: int, limit: int = 10) -> List[IntegrationMapping]:
        """Get recent mappings for a user."""
        return self.db.query(IntegrationMapping).filter(
            IntegrationMapping.user_id == user_id
        ).order_by(IntegrationMapping.created_at.desc()).limit(limit).all()
    
    def clear_analysis_mappings(self, analysis_id: int) -> int:
        """Clear all mappings for a specific analysis to prevent duplicates."""
        deleted_count = self.db.query(IntegrationMapping).filter(
            IntegrationMapping.analysis_id == analysis_id
        ).delete()
        self.db.commit()
        logger.info(f"Cleared {deleted_count} existing mappings for analysis {analysis_id}")
        return deleted_count
    
    def cleanup_stale_mappings(self, days_old: int = 30) -> int:
        """Remove mappings older than specified days."""
        from datetime import datetime, timedelta
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        
        deleted_count = self.db.query(IntegrationMapping).filter(
            IntegrationMapping.created_at < cutoff_date
        ).delete()
        self.db.commit()
        logger.info(f"Cleaned up {deleted_count} mappings older than {days_old} days")
        return deleted_count