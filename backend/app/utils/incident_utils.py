"""
Utility functions for processing and slimming incident data.

This module provides functions to reduce incident payload sizes while preserving
all data needed by the application.
"""
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


def slim_user_object(user_obj: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Extract minimal user information from nested user object.

    Reduces user object from ~5KB (with permissions, relationships, etc.)
    to ~50 bytes (just id, email, name).

    Original structure:
    {
      "data": {
        "id": "3497",
        "type": "users",
        "attributes": {
          "name": "JP Cheung",
          "email": "jp@rootly.com",
          "phone": "+1...",
          ... (10+ more fields)
        },
        "relationships": {
          "role": { "data": { ... permissions ... } },
          "on_call_role": { ... },
          ... (8 types)
        }
      }
    }

    Slimmed to:
    {
      "id": "3497",
      "email": "jp@rootly.com",
      "name": "JP Cheung"
    }

    Args:
        user_obj: Full user object from Rootly API incident data

    Returns:
        Simplified user dict with just id, email, and name, or None if invalid
    """
    if not user_obj or not isinstance(user_obj, dict):
        return None

    # Handle both direct attributes and nested data structure
    if 'data' in user_obj:
        user_data = user_obj['data']
        if not user_data or not isinstance(user_data, dict):
            return None

        user_attrs = user_data.get('attributes', {})
        return {
            'id': user_data.get('id'),
            'email': user_attrs.get('email'),
            'name': user_attrs.get('name') or user_attrs.get('full_name')
        }
    else:
        # Already simplified structure - return as-is
        return user_obj


def extract_severity_name(severity_obj: Optional[Any]) -> Optional[str]:
    """
    Extract just the severity name (e.g., "SEV0", "SEV2") from complex nested object.

    Original structure:
    {
      "data": {
        "id": "...",
        "type": "severities",
        "attributes": {
          "name": "SEV2",
          "slug": "sev2",
          "description": "...",
          "severity": "medium",
          "color": "#FBE4A0",
          ... (10+ more fields)
        }
      }
    }

    Slimmed to: "SEV2"

    Args:
        severity_obj: Severity object from Rootly API

    Returns:
        Severity name string (e.g., "SEV0", "SEV2") or None
    """
    if not severity_obj:
        return None

    # Already a string
    if isinstance(severity_obj, str):
        return severity_obj

    # Extract from nested structure
    if isinstance(severity_obj, dict):
        if 'data' in severity_obj:
            sev_data = severity_obj['data']
            if isinstance(sev_data, dict) and 'attributes' in sev_data:
                return sev_data['attributes'].get('name')
        # Fallback: check if attributes at top level
        if 'attributes' in severity_obj:
            return severity_obj['attributes'].get('name')

    return None


def slim_incident(incident: Dict[str, Any]) -> Dict[str, Any]:
    """
    Slim down incident data from ~27KB to ~1-2KB by removing unnecessary fields.

    This function reduces incident payload size by ~96-97% while preserving all
    fields actually used by the application:

    PRESERVED FIELDS:
    - Core incident info: id, sequential_id, title, summary, status, severity
    - Timestamps: created_at, started_at, acknowledged_at, mitigated_at, resolved_at
    - Slimmed user objects: user, started_by, resolved_by, mitigated_by
      (reduced from 5KB each to 50 bytes - just id, email, name)
    - Slack channel links: id, name, url, deep_link (for UI navigation)

    REMOVED FIELDS (98+ fields totaling ~25KB):
    - User permissions and roles (30+ fields per user object)
    - Integration URLs for 20+ services (Zoom, Jira, GitHub, etc.)
    - Unused metadata (slug, short_url, etc.)
    - Relationships data (15 types)
    - User contact details (phone, devices, notification rules)

    PERFORMANCE:
    - Original: ~27KB per incident (165 incidents = 3.92 MB)
    - Slimmed: ~1KB per incident (165 incidents = 0.13 MB)
    - Reduction: 96.7% (saves 3.79 MB per analysis)

    Args:
        incident: Full incident object from Rootly API

    Returns:
        Slimmed incident dict with same structure but fewer fields

    Example:
        >>> original_size = len(json.dumps(incident))  # 27,013 bytes
        >>> slimmed = slim_incident(incident)
        >>> slimmed_size = len(json.dumps(slimmed))     # 853 bytes
        >>> reduction = 1 - (slimmed_size / original_size)  # 96.8%
    """
    if not incident or not isinstance(incident, dict):
        logger.warning(f"Invalid incident object: {type(incident)}")
        return incident

    attrs = incident.get('attributes', {})

    # Build slimmed incident preserving structure compatibility
    slimmed = {
        'id': incident.get('id'),
        'type': incident.get('type'),
        'attributes': {
            # Core incident fields (used throughout analysis logic)
            'sequential_id': attrs.get('sequential_id'),
            'title': attrs.get('title'),
            'summary': attrs.get('summary'),
            'status': attrs.get('status'),
            'severity': extract_severity_name(attrs.get('severity')),

            # Timestamps (all used in burnout analysis calculations)
            'created_at': attrs.get('created_at'),
            'started_at': attrs.get('started_at'),
            'acknowledged_at': attrs.get('acknowledged_at'),
            'mitigated_at': attrs.get('mitigated_at'),
            'resolved_at': attrs.get('resolved_at'),

            # User objects (slimmed from 5KB to ~50 bytes each)
            # These are used to map incidents to team members
            'user': slim_user_object(attrs.get('user')),
            'started_by': slim_user_object(attrs.get('started_by')),
            'resolved_by': slim_user_object(attrs.get('resolved_by')),
            'mitigated_by': slim_user_object(attrs.get('mitigated_by')),

            # Slack integration (for UI links to incident channels)
            # Allows users to click through to full incident context
            'slack_channel_id': attrs.get('slack_channel_id'),
            'slack_channel_name': attrs.get('slack_channel_name'),
            'slack_channel_url': attrs.get('slack_channel_url'),
            'slack_channel_deep_link': attrs.get('slack_channel_deep_link'),
        }
    }

    # Remove None values to save additional space
    slimmed['attributes'] = {k: v for k, v in slimmed['attributes'].items() if v is not None}

    return slimmed


def slim_incidents(incidents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Slim down a list of incidents.

    Convenience function to apply slim_incident() to a list of incidents
    and log the results.

    Args:
        incidents: List of full incident objects

    Returns:
        List of slimmed incident objects
    """
    if not incidents:
        return incidents

    original_size = sum(len(str(inc)) for inc in incidents)
    slimmed = [slim_incident(inc) for inc in incidents]
    slimmed_size = sum(len(str(inc)) for inc in slimmed)

    reduction_pct = (1 - slimmed_size / original_size) * 100 if original_size > 0 else 0

    logger.info(
        f"Slimmed {len(incidents)} incidents: "
        f"{original_size / 1024 / 1024:.2f} MB → {slimmed_size / 1024 / 1024:.2f} MB "
        f"({reduction_pct:.1f}% reduction)"
    )

    return slimmed
