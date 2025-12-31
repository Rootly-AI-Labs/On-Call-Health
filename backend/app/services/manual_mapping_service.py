"""
Manual mapping service for managing user platform correlations.
"""
import logging
from typing import Dict, List, Optional, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime, timedelta

from ..models import UserMapping, UserCorrelation, get_db

logger = logging.getLogger(__name__)

class ManualMappingService:
    """Service for managing manual user mappings across platforms."""
    
    def __init__(self, db: Session = None):
        self.db = db or next(get_db())
    
    def create_mapping(
        self,
        user_id: int,
        source_platform: str,
        source_identifier: str,
        target_platform: str,
        target_identifier: str,
        created_by: int,
        mapping_type: str = "manual"
    ) -> UserMapping:
        """Create a new manual mapping.

        For GitHub and Jira mappings, ensures that each account is mapped to only one user
        at a time by removing that account from any other user who previously had it assigned.
        Also syncs the mapping to UserCorrelation table for consistency.
        """

        # Remove this account from any other user FIRST (both UserMapping and UserCorrelation)
        # This ensures the account is freed from any previous user before assigning to new user
        if target_platform == "github":
            self.remove_github_from_all_other_users(user_id, target_identifier)
        elif target_platform == "jira":
            self.remove_jira_from_all_other_users(user_id, target_identifier)
        elif target_platform == "linear":
            self.remove_linear_from_all_other_users(user_id, target_identifier)

        # Check if mapping already exists for THIS user
        existing = self.get_mapping(
            user_id, source_platform, source_identifier, target_platform
        )

        if existing:
            # Update existing mapping
            existing.target_identifier = target_identifier
            existing.mapping_type = mapping_type
            existing.updated_at = datetime.now()
            existing.last_verified = datetime.now() if mapping_type == "manual" else None

            self.db.commit()
            self.db.refresh(existing)
            logger.info(f"Updated existing mapping: {existing}")

            # Sync to UserCorrelation table
            self._sync_mapping_to_correlation(user_id, source_identifier, target_platform, target_identifier)

            return existing

        # Create new mapping
        mapping = UserMapping.create_manual_mapping(
            user_id=user_id,
            source_platform=source_platform,
            source_identifier=source_identifier,
            target_platform=target_platform,
            target_identifier=target_identifier,
            created_by=created_by
        )

        self.db.add(mapping)
        self.db.commit()
        self.db.refresh(mapping)

        logger.info(f"Created new mapping: {mapping}")

        # Sync to UserCorrelation table
        self._sync_mapping_to_correlation(user_id, source_identifier, target_platform, target_identifier)

        return mapping

    def _sync_mapping_to_correlation(
        self,
        user_id: int,
        source_identifier: str,
        target_platform: str,
        target_identifier: str
    ) -> None:
        """Sync a manual mapping to the UserCorrelation table.

        This ensures that manual mappings are reflected in the UserCorrelation table,
        which is used by the analysis and team management views.

        Args:
            user_id: The user ID who owns this mapping
            source_identifier: The source email (used to find the UserCorrelation record)
            target_platform: The target platform (github, jira, etc.)
            target_identifier: The account identifier on the target platform
        """
        logger.info(f"🔄 Syncing manual mapping to UserCorrelation for user {user_id}: {source_identifier} -> {target_platform}:{target_identifier}")

        # Find or create UserCorrelation record for this user and email
        correlation = self.db.query(UserCorrelation).filter(
            and_(
                UserCorrelation.user_id == user_id,
                UserCorrelation.email == source_identifier
            )
        ).first()

        if not correlation:
            logger.info(f"📝 Creating new UserCorrelation record for user {user_id}, email: {source_identifier}")
            # Create new correlation if it doesn't exist
            correlation = UserCorrelation(
                user_id=user_id,
                email=source_identifier
            )
            self.db.add(correlation)
        else:
            logger.info(f"📝 Found existing UserCorrelation {correlation.id} for user {user_id}, email: {source_identifier}")

        # Update the platform-specific field
        if target_platform == "github":
            old_value = correlation.github_username
            correlation.github_username = target_identifier
            logger.info(f"✅ Updated GitHub in UserCorrelation {correlation.id if correlation.id else 'NEW'}: '{old_value}' -> '{target_identifier}'")
        elif target_platform == "jira":
            old_value = correlation.jira_account_id
            correlation.jira_account_id = target_identifier
            logger.info(f"✅ Updated Jira in UserCorrelation {correlation.id if correlation.id else 'NEW'}: '{old_value}' -> '{target_identifier}'")
        elif target_platform == "slack":
            old_value = correlation.slack_user_id
            correlation.slack_user_id = target_identifier
            logger.info(f"✅ Updated Slack in UserCorrelation {correlation.id if correlation.id else 'NEW'}: '{old_value}' -> '{target_identifier}'")
        elif target_platform == "linear":
            old_value = correlation.linear_user_id
            correlation.linear_user_id = target_identifier
            logger.info(f"✅ Updated Linear in UserCorrelation {correlation.id if correlation.id else 'NEW'}: '{old_value}' -> '{target_identifier}'")

        self.db.commit()
        logger.info(f"💾 Committed sync to UserCorrelation for {source_identifier}")

    def _remove_account_from_other_users(
        self,
        current_user_id: int,
        target_identifier: str,
        target_platform: str
    ) -> int:
        """Remove a target account from any other users who have it mapped.

        This ensures that each account (GitHub username, Jira account, etc.) is mapped
        to only one user at a time, preventing duplicate assignments.

        Args:
            current_user_id: The user who should keep the mapping
            target_identifier: The account identifier (e.g., GitHub username)
            target_platform: The platform (e.g., "github")

        Returns:
            Number of mappings removed from other users
        """
        # Find all mappings for this target account from OTHER users
        conflicting_mappings = self.db.query(UserMapping).filter(
            and_(
                UserMapping.user_id != current_user_id,
                UserMapping.target_platform == target_platform,
                UserMapping.target_identifier == target_identifier
            )
        ).all()

        if not conflicting_mappings:
            return 0

        removed_count = len(conflicting_mappings)
        for mapping in conflicting_mappings:
            logger.info(
                f"Removing {target_platform} account '{target_identifier}' from user {mapping.user_id} "
                f"(assigned to user {current_user_id})"
            )
            self.db.delete(mapping)

        return removed_count

    def remove_github_username_from_other_correlations(
        self,
        current_user_id: int,
        github_username: str,
        organization_id: int = None
    ) -> int:
        """Remove a GitHub username from any other user correlations.

        This ensures that each GitHub username is mapped to only one user at a time
        in the UserCorrelation table, preventing duplicate assignments.

        Args:
            current_user_id: The user who should keep the mapping
            github_username: The GitHub username to make unique
            organization_id: Optional organization ID for multi-tenancy

        Returns:
            Number of correlations updated
        """
        # Build query to find conflicting correlations
        query = self.db.query(UserCorrelation).filter(
            and_(
                UserCorrelation.user_id != current_user_id,
                UserCorrelation.github_username == github_username
            )
        )

        # Add organization filter if provided
        if organization_id:
            query = query.filter(UserCorrelation.organization_id == organization_id)

        conflicting_correlations = query.all()

        if not conflicting_correlations:
            return 0

        removed_count = len(conflicting_correlations)
        for correlation in conflicting_correlations:
            logger.info(
                f"Removing GitHub username '{github_username}' from user {correlation.user_id} "
                f"correlation {correlation.id} (assigned to user {current_user_id})"
            )
            correlation.github_username = None

        return removed_count

    def remove_jira_account_from_other_correlations(
        self,
        current_user_id: int,
        jira_account_id: str,
        organization_id: int = None
    ) -> int:
        """Remove a Jira account ID from any other user correlations.

        This ensures that each Jira account ID is mapped to only one user at a time
        in the UserCorrelation table, preventing duplicate assignments.

        Args:
            current_user_id: The user who should keep the mapping
            jira_account_id: The Jira account ID to make unique
            organization_id: Optional organization ID for multi-tenancy

        Returns:
            Number of correlations updated
        """
        # Build query to find conflicting correlations
        query = self.db.query(UserCorrelation).filter(
            and_(
                UserCorrelation.user_id != current_user_id,
                UserCorrelation.jira_account_id == jira_account_id
            )
        )

        # Add organization filter if provided
        if organization_id:
            query = query.filter(UserCorrelation.organization_id == organization_id)

        conflicting_correlations = query.all()

        if not conflicting_correlations:
            return 0

        removed_count = len(conflicting_correlations)
        for correlation in conflicting_correlations:
            logger.info(
                f"Removing Jira account '{jira_account_id}' from user {correlation.user_id} "
                f"correlation {correlation.id} (assigned to user {current_user_id})"
            )
            correlation.jira_account_id = None
            correlation.jira_email = None

        return removed_count

    def remove_github_from_all_other_users(
        self,
        current_user_id: int,
        github_username: str
    ) -> int:
        """Remove GitHub username from ALL other users (both UserMapping and UserCorrelation).

        This ensures complete deduplication across manual mappings and synced correlations.

        Args:
            current_user_id: The user who should keep the mapping
            github_username: The GitHub username to make unique

        Returns:
            Total number of records updated (from both tables)
        """
        logger.info(f"🔍 Starting removal of GitHub username '{github_username}' from all users except {current_user_id}")
        removed_count = 0

        # 1. Remove from UserMapping table (manual mappings)
        logger.info(f"🔍 Searching UserMapping table for conflicting mappings...")
        conflicting_mappings = self.db.query(UserMapping).filter(
            and_(
                UserMapping.user_id != current_user_id,
                UserMapping.target_platform == "github",
                UserMapping.target_identifier == github_username
            )
        ).all()

        logger.info(f"🔍 Found {len(conflicting_mappings)} conflicting UserMapping records")
        for mapping in conflicting_mappings:
            logger.info(
                f"🗑️  Deleting UserMapping {mapping.id}: user {mapping.user_id}, "
                f"source: {mapping.source_identifier} -> GitHub: {github_username}"
            )
            self.db.delete(mapping)
            removed_count += 1

        # 2. Remove from UserCorrelation table (synced correlations)
        logger.info(f"🔍 Searching UserCorrelation table for conflicting correlations...")
        conflicting_correlations = self.db.query(UserCorrelation).filter(
            and_(
                UserCorrelation.user_id != current_user_id,
                UserCorrelation.github_username == github_username
            )
        ).all()

        logger.info(f"🔍 Found {len(conflicting_correlations)} conflicting UserCorrelation records")
        for correlation in conflicting_correlations:
            logger.info(
                f"🗑️  Clearing GitHub from UserCorrelation {correlation.id}: "
                f"user {correlation.user_id}, email: {correlation.email}, "
                f"GitHub: {correlation.github_username} -> None"
            )
            correlation.github_username = None
            removed_count += 1

        # Commit the removals immediately to ensure they're persisted
        if removed_count > 0:
            self.db.commit()
            logger.info(f"✅ Committed removal of GitHub username '{github_username}' from {removed_count} records")
        else:
            logger.info(f"ℹ️  No conflicting records found for GitHub username '{github_username}'")

        return removed_count

    def remove_jira_from_all_other_users(
        self,
        current_user_id: int,
        jira_account_id: str
    ) -> int:
        """Remove Jira account ID from ALL other users (both UserMapping and UserCorrelation).

        This ensures complete deduplication across manual mappings and synced correlations.

        Args:
            current_user_id: The user who should keep the mapping
            jira_account_id: The Jira account ID to make unique

        Returns:
            Total number of records updated (from both tables)
        """
        logger.info(f"🔍 Starting removal of Jira account '{jira_account_id}' from all users except {current_user_id}")
        removed_count = 0

        # 1. Remove from UserMapping table (manual mappings)
        logger.info(f"🔍 Searching UserMapping table for conflicting mappings...")
        conflicting_mappings = self.db.query(UserMapping).filter(
            and_(
                UserMapping.user_id != current_user_id,
                UserMapping.target_platform == "jira",
                UserMapping.target_identifier == jira_account_id
            )
        ).all()

        logger.info(f"🔍 Found {len(conflicting_mappings)} conflicting UserMapping records")
        for mapping in conflicting_mappings:
            logger.info(
                f"🗑️  Deleting UserMapping {mapping.id}: user {mapping.user_id}, "
                f"source: {mapping.source_identifier} -> Jira: {jira_account_id}"
            )
            self.db.delete(mapping)
            removed_count += 1

        # 2. Remove from UserCorrelation table (synced correlations)
        logger.info(f"🔍 Searching UserCorrelation table for conflicting correlations...")
        conflicting_correlations = self.db.query(UserCorrelation).filter(
            and_(
                UserCorrelation.user_id != current_user_id,
                UserCorrelation.jira_account_id == jira_account_id
            )
        ).all()

        logger.info(f"🔍 Found {len(conflicting_correlations)} conflicting UserCorrelation records")
        for correlation in conflicting_correlations:
            logger.info(
                f"🗑️  Clearing Jira from UserCorrelation {correlation.id}: "
                f"user {correlation.user_id}, email: {correlation.email}, "
                f"Jira: {correlation.jira_account_id} -> None"
            )
            correlation.jira_account_id = None
            correlation.jira_email = None
            removed_count += 1

        # Commit the removals immediately to ensure they're persisted
        if removed_count > 0:
            self.db.commit()
            logger.info(f"✅ Committed removal of Jira account '{jira_account_id}' from {removed_count} records")
        else:
            logger.info(f"ℹ️  No conflicting records found for Jira account '{jira_account_id}'")

        return removed_count

    def remove_linear_from_all_other_users(
        self,
        current_user_id: int,
        linear_user_id: str
    ) -> int:
        """Remove Linear user ID from ALL other users (both UserMapping and UserCorrelation).

        This ensures complete deduplication across manual mappings and synced correlations.

        Args:
            current_user_id: The user who should keep the mapping
            linear_user_id: The Linear user ID to make unique

        Returns:
            Total number of records updated (from both tables)
        """
        logger.info(f"🔍 Starting removal of Linear user '{linear_user_id}' from all users except {current_user_id}")
        removed_count = 0

        # 1. Remove from UserMapping table (manual mappings)
        logger.info(f"🔍 Searching UserMapping table for conflicting mappings...")
        conflicting_mappings = self.db.query(UserMapping).filter(
            and_(
                UserMapping.user_id != current_user_id,
                UserMapping.target_platform == "linear",
                UserMapping.target_identifier == linear_user_id
            )
        ).all()

        logger.info(f"🔍 Found {len(conflicting_mappings)} conflicting UserMapping records")
        for mapping in conflicting_mappings:
            logger.info(
                f"🗑️  Deleting UserMapping {mapping.id}: user {mapping.user_id}, "
                f"source: {mapping.source_identifier} -> Linear: {linear_user_id}"
            )
            self.db.delete(mapping)
            removed_count += 1

        # 2. Remove from UserCorrelation table (synced correlations)
        logger.info(f"🔍 Searching UserCorrelation table for conflicting correlations...")
        conflicting_correlations = self.db.query(UserCorrelation).filter(
            and_(
                UserCorrelation.user_id != current_user_id,
                UserCorrelation.linear_user_id == linear_user_id
            )
        ).all()

        logger.info(f"🔍 Found {len(conflicting_correlations)} conflicting UserCorrelation records")
        for correlation in conflicting_correlations:
            logger.info(
                f"🗑️  Clearing Linear from UserCorrelation {correlation.id}: "
                f"user {correlation.user_id}, email: {correlation.email}, "
                f"Linear: {correlation.linear_user_id} -> None"
            )
            correlation.linear_user_id = None
            correlation.linear_email = None
            removed_count += 1

        # Commit the removals immediately to ensure they're persisted
        if removed_count > 0:
            self.db.commit()
            logger.info(f"✅ Committed removal of Linear user '{linear_user_id}' from {removed_count} records")
        else:
            logger.info(f"ℹ️  No conflicting records found for Linear user '{linear_user_id}'")

        return removed_count

    def get_mapping(
        self,
        user_id: int,
        source_platform: str,
        source_identifier: str,
        target_platform: str
    ) -> Optional[UserMapping]:
        """Get a specific mapping."""
        return self.db.query(UserMapping).filter(
            and_(
                UserMapping.user_id == user_id,
                UserMapping.source_platform == source_platform,
                UserMapping.source_identifier == source_identifier,
                UserMapping.target_platform == target_platform
            )
        ).first()
    
    def get_user_mappings(self, user_id: int) -> List[UserMapping]:
        """Get all mappings for a user."""
        return self.db.query(UserMapping).filter(
            UserMapping.user_id == user_id
        ).order_by(
            UserMapping.source_platform,
            UserMapping.target_platform,
            UserMapping.source_identifier
        ).all()
    
    def get_platform_mappings(
        self, 
        user_id: int, 
        target_platform: str
    ) -> List[UserMapping]:
        """Get all mappings for a specific target platform."""
        return self.db.query(UserMapping).filter(
            and_(
                UserMapping.user_id == user_id,
                UserMapping.target_platform == target_platform
            )
        ).order_by(UserMapping.source_identifier).all()
    
    def delete_mapping(self, mapping_id: int, user_id: int) -> bool:
        """Delete a mapping (with ownership check)."""
        mapping = self.db.query(UserMapping).filter(
            and_(
                UserMapping.id == mapping_id,
                UserMapping.user_id == user_id
            )
        ).first()
        
        if mapping:
            self.db.delete(mapping)
            self.db.commit()
            logger.info(f"Deleted mapping: {mapping}")
            return True
        
        return False
    
    def lookup_target_identifier(
        self,
        user_id: int,
        source_platform: str,
        source_identifier: str,
        target_platform: str
    ) -> Optional[str]:
        """Look up target identifier for a mapping."""
        mapping = self.get_mapping(user_id, source_platform, source_identifier, target_platform)
        return mapping.target_identifier if mapping else None
    
    def get_mapping_statistics(self, user_id: int) -> Dict[str, Any]:
        """Get mapping statistics for a user."""
        mappings = self.get_user_mappings(user_id)
        
        total = len(mappings)
        manual_count = len([m for m in mappings if m.mapping_type == "manual"])
        auto_count = len([m for m in mappings if m.mapping_type == "auto_detected"])
        verified_count = len([m for m in mappings if m.is_verified])
        
        # Platform breakdown
        platform_stats = {}
        for mapping in mappings:
            key = f"{mapping.source_platform}_to_{mapping.target_platform}"
            if key not in platform_stats:
                platform_stats[key] = {"total": 0, "verified": 0, "manual": 0}
            
            platform_stats[key]["total"] += 1
            if mapping.is_verified:
                platform_stats[key]["verified"] += 1
            if mapping.mapping_type == "manual":
                platform_stats[key]["manual"] += 1
        
        return {
            "total_mappings": total,
            "manual_mappings": manual_count,
            "auto_detected_mappings": auto_count,
            "verified_mappings": verified_count,
            "verification_rate": verified_count / total if total > 0 else 0,
            "platform_breakdown": platform_stats,
            "last_updated": max([m.updated_at for m in mappings]) if mappings else None
        }
    
    def verify_mapping(self, mapping_id: int, user_id: int) -> bool:
        """Mark a mapping as verified."""
        mapping = self.db.query(UserMapping).filter(
            and_(
                UserMapping.id == mapping_id,
                UserMapping.user_id == user_id
            )
        ).first()
        
        if mapping:
            mapping.last_verified = datetime.now()
            mapping.updated_at = datetime.now()
            self.db.commit()
            logger.info(f"Verified mapping: {mapping}")
            return True
        
        return False
    
    def bulk_create_mappings(
        self,
        user_id: int,
        mappings_data: List[Dict[str, str]],
        created_by: int
    ) -> Tuple[List[UserMapping], List[str]]:
        """Bulk create mappings with error handling."""
        created_mappings = []
        errors = []
        
        for data in mappings_data:
            try:
                mapping = self.create_mapping(
                    user_id=user_id,
                    source_platform=data["source_platform"],
                    source_identifier=data["source_identifier"],
                    target_platform=data["target_platform"],
                    target_identifier=data["target_identifier"],
                    created_by=created_by,
                    mapping_type=data.get("mapping_type", "manual")
                )
                created_mappings.append(mapping)
            except Exception as e:
                error_msg = f"Failed to create mapping {data}: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)
        
        return created_mappings, errors
    
    def get_unmapped_identifiers(
        self,
        user_id: int,
        source_platform: str,
        source_identifiers: List[str],
        target_platform: str
    ) -> List[str]:
        """Get source identifiers that don't have mappings to target platform."""
        existing_mappings = self.db.query(UserMapping.source_identifier).filter(
            and_(
                UserMapping.user_id == user_id,
                UserMapping.source_platform == source_platform,
                UserMapping.target_platform == target_platform,
                UserMapping.source_identifier.in_(source_identifiers)
            )
        ).all()
        
        mapped_identifiers = {m[0] for m in existing_mappings}
        return [identifier for identifier in source_identifiers if identifier not in mapped_identifiers]
    
    def suggest_mappings(
        self,
        user_id: int,
        source_platform: str,
        source_identifier: str,
        target_platform: str
    ) -> List[Dict[str, Any]]:
        """Suggest potential mappings based on patterns."""
        suggestions = []
        
        # Look for similar patterns in existing mappings
        existing_mappings = self.db.query(UserMapping).filter(
            and_(
                UserMapping.user_id == user_id,
                UserMapping.source_platform == source_platform,
                UserMapping.target_platform == target_platform
            )
        ).all()
        
        if not existing_mappings:
            return suggestions
        
        # Extract patterns from existing mappings
        for mapping in existing_mappings:
            source = mapping.source_identifier
            target = mapping.target_identifier
            
            # Pattern 1: Email username extraction
            if "@" in source and "@" in source_identifier:
                source_username = source.split("@")[0]
                target_username = target
                new_source_username = source_identifier.split("@")[0]
                
                # Simple username matching
                if source_username.lower() in target_username.lower():
                    suggested_target = target_username.replace(source_username, new_source_username)
                    suggestions.append({
                        "target_identifier": suggested_target,
                        "confidence": 0.7,
                        "evidence": [f"Username pattern from {source} -> {target}"],
                        "method": "username_pattern"
                    })
            
            # Pattern 2: Domain/organization pattern
            if "." in target and target_platform == "github":
                # GitHub username might follow company patterns
                if source_identifier.split("@")[0] == source.split("@")[0]:
                    suggestions.append({
                        "target_identifier": target,
                        "confidence": 0.4,
                        "evidence": [f"Same username as {source}"],
                        "method": "username_reuse"
                    })
        
        # Remove duplicates and sort by confidence
        unique_suggestions = {}
        for suggestion in suggestions:
            key = suggestion["target_identifier"]
            if key not in unique_suggestions or suggestion["confidence"] > unique_suggestions[key]["confidence"]:
                unique_suggestions[key] = suggestion
        
        return sorted(unique_suggestions.values(), key=lambda x: x["confidence"], reverse=True)[:5]