"""
Enhanced Slack collector that records mapping data.
"""
import logging
from typing import Dict, List, Optional
from .slack_collector import collect_team_slack_data as original_collect_team_slack_data
from .mapping_recorder import MappingRecorder

logger = logging.getLogger(__name__)

async def collect_team_slack_data_with_mapping(
    team_identifiers: List[str], 
    days: int = 30, 
    slack_token: str = None, 
    mock_mode: bool = False, 
    use_names: bool = False,
    user_id: Optional[int] = None,
    analysis_id: Optional[int] = None,
    source_platform: str = "rootly"
) -> Dict[str, Dict]:
    """
    Enhanced version of collect_team_slack_data that records mapping attempts.
    """
    recorder = MappingRecorder() if user_id else None
    
    # Call original function with user_id for UserCorrelation lookup
    slack_data = await original_collect_team_slack_data(team_identifiers, days, slack_token, mock_mode, use_names, user_id)
    
    # Record mapping attempts if we have user context
    if recorder and user_id:
        for identifier in team_identifiers:
            if identifier in slack_data:
                # Successful mapping
                data_points = 0
                user_data = slack_data[identifier]
                
                # Count data points from various possible locations
                if isinstance(user_data, dict):
                    # Check for messages array
                    data_points += len(user_data.get("messages", []))
                    # Check for message_count field
                    data_points += user_data.get("message_count", 0)
                    # Check for metrics.total_messages (most common format)
                    if "metrics" in user_data and isinstance(user_data["metrics"], dict):
                        data_points += user_data["metrics"].get("total_messages", 0)
                    # Check for activity_data.messages_sent
                    if "activity_data" in user_data and isinstance(user_data["activity_data"], dict):
                        data_points += user_data["activity_data"].get("messages_sent", 0)
                
                # Try to extract the Slack user ID from the data
                slack_user_id = None
                if isinstance(user_data, dict) and "slack_user_id" in user_data:
                    slack_user_id = user_data["slack_user_id"]
                elif isinstance(user_data, dict) and "user_id" in user_data:
                    slack_user_id = user_data["user_id"]
                
                if slack_user_id:
                    # Determine mapping method
                    from .slack_collector import SlackCollector
                    # Look up user_id and organization_id for this specific identifier
                    member_user_id, org_id = recorder.get_user_and_org_for_email(identifier, analysis_id)

                    collector = SlackCollector()
                    if use_names and identifier in collector.name_to_slack_mappings:
                        mapping_method = "manual_name_mapping"
                    elif not use_names and identifier in collector.email_to_slack_mappings:
                        mapping_method = "manual_email_mapping"
                    else:
                        mapping_method = "api_search"

                    recorder.record_successful_mapping(
                        user_id=member_user_id,
                        organization_id=org_id,
                        analysis_id=analysis_id,
                        source_platform=source_platform,
                        source_identifier=identifier,
                        target_platform="slack",
                        target_identifier=slack_user_id,
                        mapping_method=mapping_method,
                        data_points_count=data_points
                    )
                    logger.info(f"✓ Recorded successful Slack mapping: {identifier} -> {slack_user_id} ({data_points} data points)")
                else:
                    # Look up for data collection record
                    member_user_id, org_id = recorder.get_user_and_org_for_email(identifier, analysis_id)

                    # Data collected but no clear user ID
                    recorder.record_successful_mapping(
                        user_id=member_user_id,
                        organization_id=org_id,
                        analysis_id=analysis_id,
                        source_platform=source_platform,
                        source_identifier=identifier,
                        target_platform="slack",
                        target_identifier="unknown",
                        mapping_method="data_collection",
                        data_points_count=data_points
                    )
                    logger.info(f"? Recorded Slack data collection: {identifier} -> unknown user ({data_points} data points)")
            else:
                # Look up for failed mapping
                member_user_id, org_id = recorder.get_user_and_org_for_email(identifier, analysis_id)

                # Failed mapping
                error_msg = f"No Slack data found for {'name' if use_names else 'email'}: {identifier}"
                if mock_mode:
                    error_msg += " (mock mode)"

                recorder.record_failed_mapping(
                    user_id=member_user_id,
                    organization_id=org_id,
                    analysis_id=analysis_id,
                    source_platform=source_platform,
                    source_identifier=identifier,
                    target_platform="slack",
                    error_message=error_msg,
                    mapping_method="name_search" if use_names else "email_search"
                )
                logger.info(f"✗ Recorded failed Slack mapping: {identifier} -> no data found")
    
    return slack_data