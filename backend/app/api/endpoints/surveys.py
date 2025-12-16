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
    is_active: bool = True
    time_utc: str  # Format: "HH:MM" (e.g., "09:00")
    timezone: str = "America/New_York"
    frequency_type: str = "daily"  # 'daily', 'weekday', 'weekly', 'biweekly', 'monthly'
    day_of_week: Optional[int] = None  # 0-6 (Monday=0), required for weekly/biweekly
    day_of_month: Optional[int] = None  # 1-31, required for monthly
    send_reminder: bool = True
    reminder_time: Optional[str] = None  # Format: "HH:MM" or None
    reminder_hours_after: int = 5
    message_template: Optional[str] = None
    reminder_message_template: Optional[str] = None


class SurveyScheduleResponse(BaseModel):
    """Schema for survey schedule response."""
    id: int
    organization_id: int
    is_active: bool
    time_utc: str
    timezone: str
    frequency_type: str
    day_of_week: Optional[int]
    day_of_month: Optional[int]
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


@router.get("/schedules")
async def list_survey_schedules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all survey schedules for user's organization."""
    schedules = db.query(SurveySchedule).filter(
        SurveySchedule.organization_id == current_user.organization_id
    ).order_by(SurveySchedule.created_at).all()

    return {
        "schedules": [
            {
                "id": schedule.id,
                "organization_id": schedule.organization_id,
                "is_active": schedule.is_active,
                "time_utc": str(schedule.time_utc),
                "timezone": schedule.timezone,
                "frequency_type": schedule.frequency_type,
                "day_of_week": schedule.day_of_week,
                "day_of_month": schedule.day_of_month,
                "send_reminder": schedule.send_reminder,
                "reminder_time": str(schedule.reminder_time) if schedule.reminder_time else None,
                "reminder_hours_after": schedule.reminder_hours_after,
                "message_template": schedule.message_template,
                "reminder_message_template": schedule.reminder_message_template,
                "created_at": schedule.created_at.isoformat() if schedule.created_at else None,
                "updated_at": schedule.updated_at.isoformat() if schedule.updated_at else None
            }
            for schedule in schedules
        ],
        "count": len(schedules),
        "max_schedules": 3
    }


@router.post("/schedules")
async def create_survey_schedule(
    schedule_data: SurveyScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new survey schedule for an organization.
    Only org admins can configure schedules.
    Maximum 3 schedules per organization.
    """
    # Check if user is admin (super_admin or org_admin)
    if not current_user.is_admin():
        raise HTTPException(status_code=403, detail="Only admins can configure survey schedules")

    organization_id = current_user.organization_id

    # Check schedule limit
    existing_count = db.query(SurveySchedule).filter(
        SurveySchedule.organization_id == organization_id
    ).count()

    if existing_count >= 3:
        raise HTTPException(
            status_code=400,
            detail="Maximum of 3 schedules per organization. Delete an existing schedule to add a new one."
        )

    # Validate frequency-specific requirements
    if schedule_data.frequency_type in ['weekly', 'biweekly']:
        if schedule_data.day_of_week is None:
            raise HTTPException(status_code=400, detail="day_of_week required for weekly/biweekly schedules")
        if not 0 <= schedule_data.day_of_week <= 6:
            raise HTTPException(status_code=400, detail="day_of_week must be 0-6 (Monday=0, Sunday=6)")

    if schedule_data.frequency_type == 'monthly':
        if schedule_data.day_of_month is None:
            raise HTTPException(status_code=400, detail="day_of_month required for monthly schedules")
        if not 1 <= schedule_data.day_of_month <= 31:
            raise HTTPException(status_code=400, detail="day_of_month must be 1-31")

    # Parse time strings
    try:
        hour, minute = map(int, schedule_data.time_utc.split(":"))
        time_utc = time(hour=hour, minute=minute)

        reminder_time = None
        if schedule_data.reminder_time:
            r_hour, r_minute = map(int, schedule_data.reminder_time.split(":"))
            reminder_time = time(hour=r_hour, minute=r_minute)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM (e.g., 09:00)")

    # Create new schedule
    schedule = SurveySchedule(
        organization_id=organization_id,
        is_active=schedule_data.is_active,
        time_utc=time_utc,
        timezone=schedule_data.timezone,
        frequency_type=schedule_data.frequency_type,
        day_of_week=schedule_data.day_of_week,
        day_of_month=schedule_data.day_of_month,
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
    logger.info(f"Created survey schedule {schedule.id} for org {organization_id}")

    # Reload scheduler with new schedule
    if SCHEDULER_AVAILABLE and survey_scheduler:
        try:
            survey_scheduler.schedule_organization_surveys(db)
        except Exception as e:
            logger.error(f"Failed to reload scheduler: {e}")

    return {
        "id": schedule.id,
        "organization_id": schedule.organization_id,
        "is_active": schedule.is_active,
        "time_utc": str(schedule.time_utc),
        "timezone": schedule.timezone,
        "frequency_type": schedule.frequency_type,
        "day_of_week": schedule.day_of_week,
        "day_of_month": schedule.day_of_month,
        "send_reminder": schedule.send_reminder,
        "reminder_time": str(schedule.reminder_time) if schedule.reminder_time else None,
        "reminder_hours_after": schedule.reminder_hours_after,
        "message_template": schedule.message_template,
        "reminder_message_template": schedule.reminder_message_template,
        "message": "Survey schedule created successfully"
    }


@router.put("/schedules/{schedule_id}")
async def update_survey_schedule(
    schedule_id: int,
    schedule_data: SurveyScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update an existing survey schedule.
    Only org admins can configure schedules.
    """
    # Check if user is admin
    if not current_user.is_admin():
        raise HTTPException(status_code=403, detail="Only admins can configure survey schedules")

    organization_id = current_user.organization_id

    # Get existing schedule
    schedule = db.query(SurveySchedule).filter(
        SurveySchedule.id == schedule_id,
        SurveySchedule.organization_id == organization_id
    ).first()

    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Validate frequency-specific requirements
    if schedule_data.frequency_type in ['weekly', 'biweekly']:
        if schedule_data.day_of_week is None:
            raise HTTPException(status_code=400, detail="day_of_week required for weekly/biweekly schedules")
        if not 0 <= schedule_data.day_of_week <= 6:
            raise HTTPException(status_code=400, detail="day_of_week must be 0-6 (Monday=0, Sunday=6)")

    if schedule_data.frequency_type == 'monthly':
        if schedule_data.day_of_month is None:
            raise HTTPException(status_code=400, detail="day_of_month required for monthly schedules")
        if not 1 <= schedule_data.day_of_month <= 31:
            raise HTTPException(status_code=400, detail="day_of_month must be 1-31")

    # Parse time strings
    try:
        hour, minute = map(int, schedule_data.time_utc.split(":"))
        time_utc = time(hour=hour, minute=minute)

        reminder_time = None
        if schedule_data.reminder_time:
            r_hour, r_minute = map(int, schedule_data.reminder_time.split(":"))
            reminder_time = time(hour=r_hour, minute=r_minute)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM (e.g., 09:00)")

    # Update schedule
    schedule.is_active = schedule_data.is_active
    schedule.time_utc = time_utc
    schedule.timezone = schedule_data.timezone
    schedule.frequency_type = schedule_data.frequency_type
    schedule.day_of_week = schedule_data.day_of_week
    schedule.day_of_month = schedule_data.day_of_month
    schedule.send_reminder = schedule_data.send_reminder
    schedule.reminder_time = reminder_time
    schedule.reminder_hours_after = schedule_data.reminder_hours_after

    if schedule_data.message_template:
        schedule.message_template = schedule_data.message_template
    if schedule_data.reminder_message_template:
        schedule.reminder_message_template = schedule_data.reminder_message_template

    db.commit()
    db.refresh(schedule)
    logger.info(f"Updated survey schedule {schedule_id} for org {organization_id}")

    # Reload scheduler
    if SCHEDULER_AVAILABLE and survey_scheduler:
        try:
            survey_scheduler.schedule_organization_surveys(db)
        except Exception as e:
            logger.error(f"Failed to reload scheduler: {e}")

    return {
        "id": schedule.id,
        "organization_id": schedule.organization_id,
        "is_active": schedule.is_active,
        "time_utc": str(schedule.time_utc),
        "timezone": schedule.timezone,
        "frequency_type": schedule.frequency_type,
        "day_of_week": schedule.day_of_week,
        "day_of_month": schedule.day_of_month,
        "send_reminder": schedule.send_reminder,
        "reminder_time": str(schedule.reminder_time) if schedule.reminder_time else None,
        "reminder_hours_after": schedule.reminder_hours_after,
        "message_template": schedule.message_template,
        "reminder_message_template": schedule.reminder_message_template,
        "message": "Survey schedule updated successfully"
    }


@router.delete("/schedules/{schedule_id}")
async def delete_survey_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a survey schedule.
    Only org admins can delete schedules.
    """
    # Check if user is admin
    if not current_user.is_admin():
        raise HTTPException(status_code=403, detail="Only admins can configure survey schedules")

    organization_id = current_user.organization_id

    # Get schedule
    schedule = db.query(SurveySchedule).filter(
        SurveySchedule.id == schedule_id,
        SurveySchedule.organization_id == organization_id
    ).first()

    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    db.delete(schedule)
    db.commit()
    logger.info(f"Deleted survey schedule {schedule_id} for org {organization_id}")

    # Reload scheduler
    if SCHEDULER_AVAILABLE and survey_scheduler:
        try:
            survey_scheduler.schedule_organization_surveys(db)
        except Exception as e:
            logger.error(f"Failed to reload scheduler: {e}")

    return {
        "success": True,
        "message": "Survey schedule deleted successfully"
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
    Only admins can trigger manual deliveries.
    Requires confirmation to prevent accidental sends.
    """
    # Check if user is an admin (super_admin or org_admin)
    if not current_user.is_admin():
        raise HTTPException(status_code=403, detail="Only admins can manually trigger survey delivery")

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
