"""
Survey scheduling and preferences API endpoints.
"""
import logging
from datetime import time, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from ...models import get_db, User
from ...models.survey_schedule import SurveySchedule, UserSurveyPreference
from ...models.user_burnout_report import UserBurnoutReport
from ...models.user_notification import UserNotification
from ...auth.dependencies import get_current_user
from ...services.notification_service import NotificationService

logger = logging.getLogger(__name__)

# Import survey_scheduler conditionally to prevent crashes
try:
    from ...services.survey_scheduler import survey_scheduler
    SCHEDULER_AVAILABLE = True
except Exception as e:
    logger.warning(f"Survey scheduler not available: {e}")
    survey_scheduler = None
    SCHEDULER_AVAILABLE = False
router = APIRouter()


def verify_survey_workspace_access(db: Session, user: User):
    """
    Verify user has access to configure/send surveys for their organization.
    Returns (organization_id, workspace_mapping) if valid.
    Raises HTTPException if validation fails.
    """
    if user.role != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can manage surveys")

    organization_id = user.organization_id
    if not organization_id:
        raise HTTPException(
            status_code=400,
            detail="You must belong to an organization to manage surveys."
        )

    from ...models.slack_workspace_mapping import SlackWorkspaceMapping
    workspace_mapping = db.query(SlackWorkspaceMapping).filter(
        SlackWorkspaceMapping.organization_id == organization_id,
        SlackWorkspaceMapping.status == 'active',
        SlackWorkspaceMapping.survey_enabled == True
    ).order_by(SlackWorkspaceMapping.registered_at.desc()).first()

    if not workspace_mapping:
        raise HTTPException(
            status_code=404,
            detail="No active Slack workspace with surveys enabled found for your organization. Please connect Slack and enable surveys first."
        )

    # Verify workspace owner is in the same organization (prevent cross-org access)
    if workspace_mapping.owner_user_id:
        owner = db.query(User).filter(User.id == workspace_mapping.owner_user_id).first()
        if owner and owner.organization_id is not None and owner.organization_id != organization_id:
            raise HTTPException(
                status_code=403,
                detail="This Slack workspace was connected by a different organization."
            )

    return organization_id, workspace_mapping


class SurveyScheduleCreate(BaseModel):
    """Schema for creating/updating survey schedule."""
    enabled: bool = True
    send_time: str  # Format: "HH:MM" (e.g., "09:00")
    timezone: str = "America/New_York"
    send_weekdays_only: Optional[bool] = None  # DEPRECATED: Use frequency_type instead
    frequency_type: Optional[str] = None  # 'daily', 'weekday', 'weekly' (default: 'weekday')
    day_of_week: Optional[int] = None  # 0-6 (Monday=0, Sunday=6), required for weekly
    send_reminder: bool = True
    reminder_time: Optional[str] = None  # Format: "HH:MM" or None
    reminder_hours_after: int = 5
    message_template: Optional[str] = None
    reminder_message_template: Optional[str] = None
    follow_up_reminders_enabled: bool = True
    follow_up_message_template: Optional[str] = None


class SurveyScheduleResponse(BaseModel):
    """Schema for survey schedule response."""
    id: int
    organization_id: int
    enabled: bool
    send_time: str
    timezone: str
    send_weekdays_only: bool  # Computed for backwards compatibility
    frequency_type: str  # 'daily', 'weekday', 'weekly'
    day_of_week: Optional[int]  # 0-6 (Monday=0, Sunday=6)
    send_reminder: bool
    reminder_time: Optional[str]
    reminder_hours_after: int
    message_template: str
    reminder_message_template: str
    follow_up_reminders_enabled: bool
    follow_up_message_template: Optional[str]
    last_modified_by_user_id: Optional[int]
    last_modified_by_name: Optional[str]
    last_modified_at: Optional[str]


class UserPreferenceUpdate(BaseModel):
    """Schema for updating user survey preferences."""
    receive_daily_surveys: Optional[bool] = None
    receive_slack_dms: Optional[bool] = None
    receive_reminders: Optional[bool] = None
    custom_send_time: Optional[str] = None
    custom_timezone: Optional[str] = None


@router.post("/survey-schedule")
async def create_or_update_survey_schedule(
    schedule_data: SurveyScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create or update survey schedule for an organization.
    Only admins in the organization that owns the Slack workspace can configure schedules.
    """
    organization_id, _ = verify_survey_workspace_access(db, current_user)

    # Determine frequency_type (supports both old and new fields)
    VALID_FREQUENCIES = ['daily', 'weekday', 'weekly']
    if schedule_data.frequency_type:
        frequency_type = schedule_data.frequency_type
        if frequency_type not in VALID_FREQUENCIES:
            raise HTTPException(
                status_code=400,
                detail=f"frequency_type must be one of: {VALID_FREQUENCIES}"
            )
        if frequency_type == 'weekly':
            if schedule_data.day_of_week is None:
                raise HTTPException(status_code=400, detail="day_of_week required for weekly schedules")
            if not 0 <= schedule_data.day_of_week <= 6:
                raise HTTPException(status_code=400, detail="day_of_week must be 0-6 (Monday=0, Sunday=6)")
    elif schedule_data.send_weekdays_only is not None:
        frequency_type = 'weekday' if schedule_data.send_weekdays_only else 'daily'
    else:
        frequency_type = 'weekday'

    # Parse time strings
    def parse_time_string(time_str: str) -> time:
        hour, minute = map(int, time_str.split(":"))
        return time(hour=hour, minute=minute)

    try:
        send_time = parse_time_string(schedule_data.send_time)
        reminder_time = parse_time_string(schedule_data.reminder_time) if schedule_data.reminder_time else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM (e.g., 09:00)")

    # Check if schedule exists (order by id desc for deterministic results)
    existing_schedule = db.query(SurveySchedule).options(
        joinedload(SurveySchedule.last_modified_by)
    ).filter(
        SurveySchedule.organization_id == organization_id
    ).order_by(SurveySchedule.id.desc()).first()

    if existing_schedule:
        # Update existing
        existing_schedule.enabled = schedule_data.enabled
        existing_schedule.send_time = send_time
        existing_schedule.timezone = schedule_data.timezone
        existing_schedule.send_weekdays_only = (frequency_type == 'weekday')  # Keep in sync for backwards compat
        existing_schedule.frequency_type = frequency_type
        existing_schedule.day_of_week = schedule_data.day_of_week if frequency_type == 'weekly' else None
        existing_schedule.send_reminder = schedule_data.send_reminder
        existing_schedule.reminder_time = reminder_time
        existing_schedule.reminder_hours_after = schedule_data.reminder_hours_after

        if schedule_data.message_template:
            existing_schedule.message_template = schedule_data.message_template
        if schedule_data.reminder_message_template:
            existing_schedule.reminder_message_template = schedule_data.reminder_message_template

        existing_schedule.follow_up_reminders_enabled = schedule_data.follow_up_reminders_enabled
        if schedule_data.follow_up_message_template:
            existing_schedule.follow_up_message_template = schedule_data.follow_up_message_template

        # Track who made this change
        existing_schedule.last_modified_by_user_id = current_user.id

        db.commit()
        db.refresh(existing_schedule)
        schedule = existing_schedule
        logger.info(f"Updated survey schedule for org {organization_id} by user {current_user.id}")
    else:
        # Create new
        schedule = SurveySchedule(
            organization_id=organization_id,
            enabled=schedule_data.enabled,
            send_time=send_time,
            timezone=schedule_data.timezone,
            send_weekdays_only=(frequency_type == 'weekday'),  # Keep in sync for backwards compat
            frequency_type=frequency_type,
            day_of_week=schedule_data.day_of_week if frequency_type == 'weekly' else None,
            send_reminder=schedule_data.send_reminder,
            reminder_time=reminder_time,
            reminder_hours_after=schedule_data.reminder_hours_after,
            follow_up_reminders_enabled=schedule_data.follow_up_reminders_enabled,
            last_modified_by_user_id=current_user.id
        )

        if schedule_data.message_template:
            schedule.message_template = schedule_data.message_template
        if schedule_data.reminder_message_template:
            schedule.reminder_message_template = schedule_data.reminder_message_template
        if schedule_data.follow_up_message_template:
            schedule.follow_up_message_template = schedule_data.follow_up_message_template

        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        logger.info(f"Created survey schedule for org {organization_id} by user {current_user.id}")

    # Reload scheduler with new schedule
    if SCHEDULER_AVAILABLE and survey_scheduler:
        try:
            survey_scheduler.schedule_organization_surveys(db)
        except Exception as e:
            logger.error(f"Failed to reload scheduler: {e}")
            # Continue anyway - schedule is saved in DB

    # Get last modified by user info
    last_modified_by_name = None
    if schedule.last_modified_by_user_id:
        try:
            if schedule.last_modified_by and hasattr(schedule.last_modified_by, 'name'):
                last_modified_by_name = schedule.last_modified_by.name
        except Exception as e:
            logger.warning(f"Failed to load last_modified_by user for schedule {schedule.id}: {e}")

    return {
        "id": schedule.id,
        "organization_id": schedule.organization_id,
        "enabled": schedule.enabled,
        "send_time": str(schedule.send_time),
        "timezone": schedule.timezone,
        "send_weekdays_only": (schedule.frequency_type == 'weekday'),  # Computed for backwards compat
        "frequency_type": schedule.frequency_type,
        "day_of_week": schedule.day_of_week,
        "send_reminder": schedule.send_reminder,
        "reminder_time": str(schedule.reminder_time) if schedule.reminder_time else None,
        "reminder_hours_after": schedule.reminder_hours_after,
        "message_template": schedule.message_template,
        "reminder_message_template": schedule.reminder_message_template,
        "follow_up_reminders_enabled": schedule.follow_up_reminders_enabled,
        "follow_up_message_template": schedule.follow_up_message_template,
        "last_modified_by_user_id": schedule.last_modified_by_user_id,
        "last_modified_by_name": last_modified_by_name,
        "last_modified_at": schedule.last_modified_at.isoformat() if schedule.last_modified_at else None,
        "message": "Survey schedule configured successfully"
    }


@router.get("/survey-schedule")
async def get_survey_schedule(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current survey schedule for user's organization."""
    schedule = db.query(SurveySchedule).options(
        joinedload(SurveySchedule.last_modified_by)
    ).filter(
        # SECURITY: Explicitly check IS NOT NULL to prevent NULL == NULL matching
        SurveySchedule.organization_id == current_user.organization_id,
        SurveySchedule.organization_id.isnot(None)
    ).first()

    if not schedule:
        # Return consistent structure even when no schedule exists
        return {
            "enabled": False,
            "send_time": None,
            "timezone": "America/New_York",
            "send_weekdays_only": True,
            "frequency_type": "weekday",
            "day_of_week": None,
            "send_reminder": False,
            "reminder_time": None,
            "reminder_hours_after": 5,
            "follow_up_reminders_enabled": True,
            "follow_up_message_template": None,
            "last_modified_by_user_id": None,
            "last_modified_by_name": None,
            "last_modified_at": None,
            "message": "No survey schedule configured"
        }

    # Derive frequency_type with fallback for legacy data
    effective_frequency = schedule.frequency_type or ('weekday' if schedule.send_weekdays_only else 'daily')

    # Get last modified by user info
    last_modified_by_name = None
    if schedule.last_modified_by_user_id:
        try:
            if schedule.last_modified_by and hasattr(schedule.last_modified_by, 'name'):
                last_modified_by_name = schedule.last_modified_by.name
        except Exception as e:
            logger.warning(f"Failed to load last_modified_by user for schedule {schedule.id}: {e}")

    return {
        "id": schedule.id,
        "organization_id": schedule.organization_id,
        "enabled": schedule.enabled,
        "send_time": str(schedule.send_time),
        "timezone": schedule.timezone,
        "send_weekdays_only": effective_frequency == 'weekday',
        "frequency_type": effective_frequency,
        "day_of_week": schedule.day_of_week,
        "send_reminder": schedule.send_reminder,
        "reminder_time": str(schedule.reminder_time) if schedule.reminder_time else None,
        "reminder_hours_after": schedule.reminder_hours_after,
        "message_template": schedule.message_template,
        "reminder_message_template": schedule.reminder_message_template,
        "follow_up_reminders_enabled": schedule.follow_up_reminders_enabled if schedule.follow_up_reminders_enabled is not None else True,
        "follow_up_message_template": schedule.follow_up_message_template,
        "last_modified_by_user_id": schedule.last_modified_by_user_id,
        "last_modified_by_name": last_modified_by_name,
        "last_modified_at": schedule.last_modified_at.isoformat() if schedule.last_modified_at else None
    }


@router.put("/survey-preferences")
async def update_survey_preferences(
    preferences: UserPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user's survey preferences."""
    # Get or create user preference
    user_pref = db.query(UserSurveyPreference).filter(
        UserSurveyPreference.user_id == current_user.id
    ).first()

    if not user_pref:
        user_pref = UserSurveyPreference(user_id=current_user.id)
        db.add(user_pref)

    # Update fields if provided
    if preferences.receive_daily_surveys is not None:
        user_pref.receive_daily_surveys = preferences.receive_daily_surveys
    if preferences.receive_slack_dms is not None:
        user_pref.receive_slack_dms = preferences.receive_slack_dms
    if preferences.receive_reminders is not None:
        user_pref.receive_reminders = preferences.receive_reminders

    if preferences.custom_send_time:
        try:
            hour, minute = map(int, preferences.custom_send_time.split(":"))
            user_pref.custom_send_time = time(hour=hour, minute=minute)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")

    if preferences.custom_timezone:
        user_pref.custom_timezone = preferences.custom_timezone

    db.commit()
    db.refresh(user_pref)

    return {
        "user_id": user_pref.user_id,
        "receive_daily_surveys": user_pref.receive_daily_surveys,
        "receive_slack_dms": user_pref.receive_slack_dms,
        "receive_reminders": user_pref.receive_reminders,
        "custom_send_time": str(user_pref.custom_send_time) if user_pref.custom_send_time else None,
        "custom_timezone": user_pref.custom_timezone,
        "message": "Preferences updated successfully"
    }


@router.get("/survey-preferences")
async def get_survey_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's survey preferences."""
    user_pref = db.query(UserSurveyPreference).filter(
        UserSurveyPreference.user_id == current_user.id
    ).first()

    if not user_pref:
        # Return defaults
        return {
            "user_id": current_user.id,
            "receive_daily_surveys": True,
            "receive_slack_dms": True,
            "receive_reminders": True,
            "custom_send_time": None,
            "custom_timezone": None
        }

    return {
        "user_id": user_pref.user_id,
        "receive_daily_surveys": user_pref.receive_daily_surveys,
        "receive_slack_dms": user_pref.receive_slack_dms,
        "receive_reminders": user_pref.receive_reminders,
        "custom_send_time": str(user_pref.custom_send_time) if user_pref.custom_send_time else None,
        "custom_timezone": user_pref.custom_timezone
    }


class ManualDeliveryRequest(BaseModel):
    """Schema for manual survey delivery with confirmation."""
    confirmed: bool = False
    recipient_emails: Optional[List[str]] = None  # If provided, only send to these emails


@router.post("/survey-schedule/manual-delivery")
async def manual_survey_delivery(
    request: ManualDeliveryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger survey delivery.
    Requires confirmation to prevent accidental sends.
    Only admins in the organization that owns the Slack workspace can send surveys.
    """
    organization_id, workspace_mapping = verify_survey_workspace_access(db, current_user)

    # Check if scheduler is available
    if not SCHEDULER_AVAILABLE or survey_scheduler is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Survey scheduler is not available. Please try again later."
        )

    # Helper to filter recipients by email list
    def filter_recipients(all_recipients, email_filter):
        if not email_filter:
            return all_recipients
        email_set = {e.lower() for e in email_filter}
        return [r for r in all_recipients if r['email'].lower() in email_set]

    # Get all eligible recipients (manual sends skip saved recipient filter)
    all_recipients = survey_scheduler._get_survey_recipients(
        organization_id, db, is_reminder=False, apply_saved_recipients=False
    )

    # First call without confirmation - return preview
    if not request.confirmed:
        recipients = filter_recipients(all_recipients, request.recipient_emails)
        return {
            "requires_confirmation": True,
            "message": f"This will send surveys to {len(recipients)} team members via Slack DM.",
            "recipient_count": len(recipients),
            "recipients": [{"name": r.get('name', 'Unknown'), "email": r['email']} for r in recipients],
            "note": "To proceed, send this request again with 'confirmed': true"
        }

    # Confirmed - trigger survey delivery
    try:
        logger.info(f"Manual survey delivery triggered by {current_user.email} for org {organization_id}")

        # Re-verify workspace is still enabled (prevent TOCTOU race condition)
        from ...models.slack_workspace_mapping import SlackWorkspaceMapping
        workspace_check = db.query(SlackWorkspaceMapping).filter(
            SlackWorkspaceMapping.id == workspace_mapping.id,
            SlackWorkspaceMapping.status == 'active',
            SlackWorkspaceMapping.survey_enabled == True
        ).first()

        if not workspace_check:
            raise HTTPException(
                status_code=400,
                detail="Slack workspace surveys have been disabled. Please enable surveys and try again."
            )

        # Must provide recipient_emails when confirmed (prevents accidental mass sends)
        if not request.recipient_emails:
            raise HTTPException(
                status_code=400,
                detail="No recipients selected. Please select at least one team member to send surveys to."
            )

        recipients = filter_recipients(all_recipients, request.recipient_emails)
        logger.info(f"Filtered to {len(recipients)} selected recipients from {len(all_recipients)} total")

        if not recipients:
            raise HTTPException(
                status_code=400,
                detail="None of the selected emails were found in the available recipients. Please select valid team members."
            )

        # Send surveys directly using the same logic as scheduled sends
        from ...services.slack_dm_sender import SlackDMSender
        from ...services.slack_token_service import SlackTokenService

        slack_service = SlackTokenService(db)
        slack_token = slack_service.get_oauth_token_for_workspace(
            workspace_mapping.workspace_id
        )
        if not slack_token:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No valid Slack token is available for the connected workspace. "
                    "Please reconnect Slack and try again."
                )
            )

        dm_sender = SlackDMSender()
        sent_count = 0
        failed_count = 0

        # Get custom message template from schedule if exists
        schedule = db.query(SurveySchedule).filter(
            SurveySchedule.organization_id == organization_id
        ).first()
        message_template = schedule.message_template if schedule else None

        # Send DMs to selected recipients
        # Manual surveys are always sent (admin explicitly selected recipients)
        failed_recipients = []  # Track failures with details
        for user in recipients:
            try:
                await dm_sender.send_survey_dm(
                    slack_token=slack_token,
                    slack_user_id=user['slack_user_id'],
                    user_id=user['user_id'],
                    organization_id=organization_id,
                    message=message_template,
                    user_email=user['email']
                )
                sent_count += 1
            except Exception as e:
                failed_count += 1
                error_msg = str(e)
                logger.error(f"Failed to send survey to {user['email']}: {error_msg}")
                failed_recipients.append({
                    "email": user['email'],
                    "error": error_msg
                })

        # Create notification for admins
        notification_service = NotificationService(db)
        notification_service.create_survey_delivery_notification(
            organization_id=organization_id,
            triggered_by=current_user,
            recipient_count=sent_count,  # Use actual sent count, not requested count
            is_manual=True
        )

        # Build response message
        message = f"Sent surveys to {sent_count} recipient(s)"
        if failed_count > 0:
            message += f". {failed_count} failed"

        return {
            "success": True,
            "message": message,
            "recipient_count": len(recipients),
            "sent_count": sent_count,
            "failed_count": failed_count,
            "failed_recipients": failed_recipients,
            "triggered_by": current_user.email
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Manual survey delivery failed: {str(e)}")

        # Create error notification for admin who triggered it
        notification_service = NotificationService(db)
        error_notification = UserNotification(
            user_id=current_user.id,
            organization_id=organization_id,
            type='survey',
            title="❌ Survey delivery failed",
            message=f"Manual survey delivery failed: {str(e)}",
            action_url="/integrations?tab=surveys",
            action_text="Check Settings",
            priority='high'
        )
        db.add(error_notification)
        db.commit()

        raise HTTPException(status_code=500, detail=f"Survey delivery failed: {str(e)}")


@router.get("/user/{user_id}/results")
def get_user_survey_results(
    user_id: int,
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get survey results for a specific user.
    Only accessible by admins in the same organization.
    """
    # Check if requesting user is admin
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=403,
            detail="Only admins can view survey results."
        )

    # Get the target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify same organization
    if current_user.organization_id != target_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot view survey results from different organization."
        )

    # Get survey results from the last N days
    since = datetime.now(timezone.utc) - timedelta(days=days)

    results = db.query(UserBurnoutReport).filter(
        UserBurnoutReport.user_id == user_id,
        UserBurnoutReport.submitted_at >= since
    ).order_by(UserBurnoutReport.submitted_at.desc()).all()

    return {
        "user_id": user_id,
        "user_email": target_user.email,
        "user_name": target_user.name,
        "days": days,
        "results": [
            {
                "id": r.id,
                "feeling_score": r.feeling_score,
                "workload_score": r.workload_score,
                "feeling_text": r.feeling_text,
                "workload_text": r.workload_text,
                "risk_level": r.risk_level,
                "additional_comments": r.additional_comments,
                "submitted_via": r.submitted_via,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None
            }
            for r in results
        ]
    }
