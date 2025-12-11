"""
Survey scheduling and preferences API endpoints.
"""
import logging
from datetime import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ...models import get_db, User
from ...models.survey_schedule import SurveySchedule, UserSurveyPreference
from ...models.user_notification import UserNotification
from ...auth.dependencies import get_current_user
from ...services.notification_service import NotificationService

# Import survey_scheduler conditionally to prevent crashes
try:
    from ...services.survey_scheduler import survey_scheduler
    SCHEDULER_AVAILABLE = True
except Exception as e:
    logger.warning(f"Survey scheduler not available: {e}")
    survey_scheduler = None
    SCHEDULER_AVAILABLE = False

logger = logging.getLogger(__name__)
router = APIRouter()


class SurveyScheduleCreate(BaseModel):
    """Schema for creating/updating survey schedule."""
    enabled: bool = True
    send_time: str  # Format: "HH:MM" (e.g., "09:00")
    timezone: str = "America/New_York"
    send_weekdays_only: bool = True
    send_reminder: bool = True
    reminder_time: Optional[str] = None  # Format: "HH:MM" or None
    reminder_hours_after: int = 5
    message_template: Optional[str] = None
    reminder_message_template: Optional[str] = None


class SurveyScheduleResponse(BaseModel):
    """Schema for survey schedule response."""
    id: int
    organization_id: int
    enabled: bool
    send_time: str
    timezone: str
    send_weekdays_only: bool
    send_reminder: bool
    reminder_time: Optional[str]
    reminder_hours_after: int
    message_template: str
    reminder_message_template: str


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
    Only org admins can configure schedules.
    """
    # Check if user is admin (super_admin or org_admin)
    if not current_user.is_admin():
        raise HTTPException(status_code=403, detail="Only admins can configure survey schedules")

    organization_id = current_user.organization_id

    # Parse time strings
    try:
        hour, minute = map(int, schedule_data.send_time.split(":"))
        send_time = time(hour=hour, minute=minute)

        reminder_time = None
        if schedule_data.reminder_time:
            r_hour, r_minute = map(int, schedule_data.reminder_time.split(":"))
            reminder_time = time(hour=r_hour, minute=r_minute)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM (e.g., 09:00)")

    # Check if schedule exists
    existing_schedule = db.query(SurveySchedule).filter(
        SurveySchedule.organization_id == organization_id
    ).first()

    if existing_schedule:
        # Update existing
        existing_schedule.enabled = schedule_data.enabled
        existing_schedule.send_time = send_time
        existing_schedule.timezone = schedule_data.timezone
        existing_schedule.send_weekdays_only = schedule_data.send_weekdays_only
        existing_schedule.send_reminder = schedule_data.send_reminder
        existing_schedule.reminder_time = reminder_time
        existing_schedule.reminder_hours_after = schedule_data.reminder_hours_after

        if schedule_data.message_template:
            existing_schedule.message_template = schedule_data.message_template
        if schedule_data.reminder_message_template:
            existing_schedule.reminder_message_template = schedule_data.reminder_message_template

        db.commit()
        db.refresh(existing_schedule)
        schedule = existing_schedule
        logger.info(f"Updated survey schedule for org {organization_id}")
    else:
        # Create new
        schedule = SurveySchedule(
            organization_id=organization_id,
            enabled=schedule_data.enabled,
            send_time=send_time,
            timezone=schedule_data.timezone,
            send_weekdays_only=schedule_data.send_weekdays_only,
            send_reminder=schedule_data.send_reminder,
            reminder_time=reminder_time,
            reminder_hours_after=schedule_data.reminder_hours_after
        )

        if schedule_data.message_template:
            schedule.message_template = schedule_data.message_template
        if schedule_data.reminder_message_template:
            schedule.reminder_message_template = schedule_data.reminder_message_template

        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        logger.info(f"Created survey schedule for org {organization_id}")

    # Reload scheduler with new schedule
    if SCHEDULER_AVAILABLE and survey_scheduler:
        try:
            survey_scheduler.schedule_organization_surveys(db)
        except Exception as e:
            logger.error(f"Failed to reload scheduler: {e}")
            # Continue anyway - schedule is saved in DB

    return {
        "id": schedule.id,
        "organization_id": schedule.organization_id,
        "enabled": schedule.enabled,
        "send_time": str(schedule.send_time),
        "timezone": schedule.timezone,
        "send_weekdays_only": schedule.send_weekdays_only,
        "send_reminder": schedule.send_reminder,
        "reminder_time": str(schedule.reminder_time) if schedule.reminder_time else None,
        "reminder_hours_after": schedule.reminder_hours_after,
        "message_template": schedule.message_template,
        "reminder_message_template": schedule.reminder_message_template,
        "message": "Survey schedule configured successfully"
    }


@router.get("/survey-schedule")
async def get_survey_schedule(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current survey schedule for user's organization."""
    schedule = db.query(SurveySchedule).filter(
        SurveySchedule.organization_id == current_user.organization_id
    ).first()

    if not schedule:
        # Return consistent structure even when no schedule exists
        return {
            "enabled": False,
            "send_time": None,
            "timezone": "America/New_York",
            "send_weekdays_only": True,
            "send_reminder": False,
            "reminder_time": None,
            "reminder_hours_after": 5,
            "message": "No survey schedule configured"
        }

    return {
        "id": schedule.id,
        "organization_id": schedule.organization_id,
        "enabled": schedule.enabled,
        "send_time": str(schedule.send_time),
        "timezone": schedule.timezone,
        "send_weekdays_only": schedule.send_weekdays_only,
        "send_reminder": schedule.send_reminder,
        "reminder_time": str(schedule.reminder_time) if schedule.reminder_time else None,
        "reminder_hours_after": schedule.reminder_hours_after,
        "message_template": schedule.message_template,
        "reminder_message_template": schedule.reminder_message_template
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


@router.post("/survey-schedule/manual-delivery")
async def manual_survey_delivery(
    request: ManualDeliveryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger survey delivery.
    Requires confirmation to prevent accidental sends.
    """
    organization_id = current_user.organization_id

    # First call without confirmation - return preview
    if not request.confirmed:
        # Get recipients count
        recipients = survey_scheduler._get_survey_recipients(organization_id, db, is_reminder=False)

        return {
            "requires_confirmation": True,
            "message": f"This will send surveys to {len(recipients)} team members via Slack DM.",
            "recipient_count": len(recipients),
            "recipients": [
                {
                    "name": r.get('name', 'Unknown'),
                    "email": r['email']
                } for r in recipients
            ],
            "note": "To proceed, send this request again with 'confirmed': true"
        }

    # Confirmed - trigger survey delivery
    try:
        logger.info(f"Manual survey delivery triggered by {current_user.email} for org {organization_id}")

        # Get recipients before sending
        recipients = survey_scheduler._get_survey_recipients(organization_id, db, is_reminder=False)
        recipient_count = len(recipients)

        # Trigger delivery
        await survey_scheduler._send_organization_surveys(organization_id, db, is_reminder=False)

        # Create notification for admins
        notification_service = NotificationService(db)
        notification_service.create_survey_delivery_notification(
            organization_id=organization_id,
            triggered_by=current_user,
            recipient_count=recipient_count,
            is_manual=True
        )

        return {
            "success": True,
            "message": f"Survey delivery triggered successfully to {recipient_count} recipients",
            "recipient_count": recipient_count,
            "triggered_by": current_user.email
        }

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
