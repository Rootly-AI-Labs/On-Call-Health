"""
Scheduled survey delivery service using APScheduler.
Sends daily burnout check-in DMs to Slack users.
"""
import logging
import os
from datetime import datetime, time, date, timedelta, timezone
from typing import List, Dict, Tuple, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_
import pytz

from ..models.survey_schedule import SurveySchedule, UserSurveyPreference
from ..models.user import User
from ..models.user_correlation import UserCorrelation
from ..models.slack_integration import SlackIntegration
from ..models.slack_workspace_mapping import SlackWorkspaceMapping
from ..models.user_burnout_report import UserBurnoutReport
from ..models.survey_period import SurveyPeriod
from ..models import SessionLocal
from ..core.distributed_lock import with_distributed_lock
from .slack_dm_sender import SlackDMSender
from .notification_service import NotificationService
from .survey_recipient_service import get_saved_recipient_ids_for_org
from .survey_response_service import get_utc_day_bounds, normalize_survey_email
from .slack_token_service import get_slack_token_for_organization, SlackTokenService
from ..utils import mask_email

logger = logging.getLogger(__name__)

SURVEY_DELIVERY_LOCK_TTL = int(os.getenv("SURVEY_DELIVERY_LOCK_TTL", "600"))
SURVEY_DELIVERY_LOCK_TIMEOUT = float(os.getenv("SURVEY_DELIVERY_LOCK_TIMEOUT", "2"))


class SurveyScheduler:
    """
    Manages scheduled delivery of daily burnout surveys via Slack DM.
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.dm_sender = SlackDMSender()

    def start(self):
        """Start the scheduler."""
        self.scheduler.start()
        logger.debug("Survey scheduler started")

    def stop(self):
        """Stop the scheduler."""
        self.scheduler.shutdown()
        logger.debug("Survey scheduler stopped")

    def _get_org_date(self, org_timezone: str) -> date:
        """Get current date in organization's timezone."""
        try:
            tz = pytz.timezone(org_timezone)
            return datetime.now(tz).date()
        except Exception:
            return date.today()

    def _get_recipient_delivery_lock_key(self, email: str) -> str:
        """Build a cross-schedule lock key for one recipient."""
        return f"survey_delivery:recipient:{normalize_survey_email(email)}"

    def _has_survey_touchpoint_today(
        self,
        db: Session,
        email: str,
        day_start_utc: datetime,
        day_end_utc: datetime,
        exclude_organization_id: Optional[int] = None
    ) -> bool:
        """
        Check whether a recipient already got a survey ping or submitted today.

        This prevents duplicate scheduled DMs across overlapping org/account/token
        paths while still letting one response count everywhere the member belongs.
        Reminder paths can exclude the current org so a valid same-org reminder is
        not blocked by that org's own initial send.
        """
        normalized_email = normalize_survey_email(email)
        if not normalized_email:
            return False

        existing_report = db.query(UserBurnoutReport.id).filter(
            func.lower(UserBurnoutReport.email) == normalized_email,
            UserBurnoutReport.submitted_at >= day_start_utc,
            UserBurnoutReport.submitted_at <= day_end_utc
        ).first()
        if existing_report:
            return True

        touchpoint_query = db.query(SurveyPeriod.id).filter(
            func.lower(SurveyPeriod.email) == normalized_email
        )
        if exclude_organization_id is not None:
            touchpoint_query = touchpoint_query.filter(
                SurveyPeriod.organization_id != exclude_organization_id
            )

        existing_touchpoint = touchpoint_query.filter(
            or_(
                and_(
                    SurveyPeriod.initial_sent_at.isnot(None),
                    SurveyPeriod.initial_sent_at >= day_start_utc,
                    SurveyPeriod.initial_sent_at <= day_end_utc
                ),
                and_(
                    SurveyPeriod.last_reminder_sent_at.isnot(None),
                    SurveyPeriod.last_reminder_sent_at >= day_start_utc,
                    SurveyPeriod.last_reminder_sent_at <= day_end_utc
                )
            )
        ).first()
        return existing_touchpoint is not None

    def _calculate_period_bounds(
        self,
        frequency_type: str,
        reference_date: date,
        day_of_week: Optional[int] = None
    ) -> Tuple[date, date]:
        """
        Calculate the start and end dates for a survey period.

        Args:
            frequency_type: 'daily', 'weekday', or 'weekly'
            reference_date: The date to calculate the period for (in org timezone)
            day_of_week: For weekly frequency, which day starts the week (0=Monday, 6=Sunday)

        Returns:
            Tuple of (period_start_date, period_end_date)
        """
        if frequency_type == 'daily':
            return reference_date, reference_date
        elif frequency_type == 'weekday':
            days_since_monday = reference_date.weekday()
            monday = reference_date - timedelta(days=days_since_monday)
            friday = monday + timedelta(days=4)
            return monday, friday
        elif frequency_type == 'weekly':
            if day_of_week is None:
                day_of_week = 0
            days_since_target = (reference_date.weekday() - day_of_week) % 7
            period_start = reference_date - timedelta(days=days_since_target)
            period_end = period_start + timedelta(days=6)
            return period_start, period_end
        else:
            logger.warning(f"Unknown frequency type '{frequency_type}', defaulting to single day period")
            return reference_date, reference_date

    def _create_or_update_survey_period(
        self,
        db: Session,
        organization_id: int,
        user_correlation: UserCorrelation,
        user_id: Optional[int],
        email: str,
        frequency_type: str,
        period_start: date,
        period_end: date,
        sent_at: datetime,
        org_timezone: str = 'UTC'
    ) -> Optional[SurveyPeriod]:
        """
        Create a new SurveyPeriod record, expiring any existing pending period.
        Uses row-level locking and INSERT to prevent race conditions.
        Includes idempotency check to prevent duplicate sends.

        Args:
            org_timezone: Organization timezone for accurate date boundary calculation
        """
        from sqlalchemy.exc import IntegrityError

        try:
            # Calculate today's date boundaries in organization timezone
            org_tz = pytz.timezone(org_timezone)
            today_local = self._get_org_date(org_timezone)
            today_start_local = org_tz.localize(datetime.combine(today_local, time.min))
            today_end_local = org_tz.localize(datetime.combine(today_local, time.max))
            today_start_utc = today_start_local.astimezone(timezone.utc)
            today_end_utc = today_end_local.astimezone(timezone.utc)

            # IDEMPOTENCY CHECK: First check if we already sent for this period today (in org timezone)
            # This handles the common case without attempting an insert
            # Use BETWEEN to handle timezone boundaries correctly (e.g., PST 11:30 PM = UTC next day)
            existing_period_today = db.query(SurveyPeriod).filter(
                SurveyPeriod.organization_id == organization_id,
                SurveyPeriod.user_correlation_id == user_correlation.id,
                SurveyPeriod.period_start_date == period_start,
                SurveyPeriod.period_end_date == period_end,
                SurveyPeriod.initial_sent_at >= today_start_utc,
                SurveyPeriod.initial_sent_at <= today_end_utc
            ).first()

            if existing_period_today:
                logger.debug(f"Skipping survey period creation - already exists (ID {existing_period_today.id}) for correlation {user_correlation.id}")
                return existing_period_today

            # Expire any other pending periods (from different date ranges)
            # Use skip_locked to avoid blocking - if another transaction is expiring, that's fine
            other_pending_periods = db.query(SurveyPeriod).filter(
                SurveyPeriod.organization_id == organization_id,
                SurveyPeriod.user_correlation_id == user_correlation.id,
                SurveyPeriod.status == 'pending',
                SurveyPeriod.period_start_date != period_start  # Different period
            ).with_for_update(skip_locked=True).all()

            for period in other_pending_periods:
                period.mark_expired()
                logger.debug(f"Expired old period {period.id} for user (correlation {user_correlation.id})")

            # Create new period inside a nested transaction so a concurrent insert
            # only rolls back this insert attempt instead of the whole session.
            new_period = SurveyPeriod(
                organization_id=organization_id,
                user_correlation_id=user_correlation.id,
                user_id=user_id,
                email=email,
                frequency_type=frequency_type,
                period_start_date=period_start,
                period_end_date=period_end,
                status='pending',
                initial_sent_at=sent_at,
                reminder_count=0
            )

            try:
                with db.begin_nested():
                    db.add(new_period)
                    db.flush()
                logger.debug(f"Created survey period {new_period.id}: {frequency_type} period {period_start} to {period_end}")
                return new_period
            except IntegrityError as ie:
                # Race condition: another transaction created the period between our
                # check and insert. The nested transaction rollback keeps the outer
                # session state intact, so we can safely look up the winner.
                logger.debug(f"IntegrityError creating period - concurrent transaction created it: {str(ie)}")
                existing = db.query(SurveyPeriod).filter(
                    SurveyPeriod.organization_id == organization_id,
                    SurveyPeriod.user_correlation_id == user_correlation.id,
                    SurveyPeriod.period_start_date == period_start,
                    SurveyPeriod.period_end_date == period_end,
                    SurveyPeriod.initial_sent_at >= today_start_utc,
                    SurveyPeriod.initial_sent_at <= today_end_utc
                ).first()
                return existing

        except IntegrityError as e:
            logger.error(f"Integrity error creating survey period for correlation {user_correlation.id}: {str(e)}")
            db.rollback()
            return None
        except Exception as e:
            logger.error(f"Unexpected error creating survey period for correlation {user_correlation.id}: {str(e)}")
            db.rollback()
            return None

    def _expire_overdue_periods(self, db: Session, organization_id: int, org_timezone: str) -> int:
        """
        Expire any pending periods that have passed their end date.
        Uses row-level locking to prevent race conditions.
        """
        today = self._get_org_date(org_timezone)
        expired_count = 0

        # Use FOR UPDATE to lock rows during update
        overdue_periods = db.query(SurveyPeriod).filter(
            SurveyPeriod.organization_id == organization_id,
            SurveyPeriod.status == 'pending',
            SurveyPeriod.period_end_date < today
        ).with_for_update().all()

        for period in overdue_periods:
            period.mark_expired()
            expired_count += 1
            logger.debug(f"Auto-expired period {period.id}")

        if expired_count > 0:
            logger.info(f"Auto-expired {expired_count} overdue survey periods for org {organization_id}")

        return expired_count

    def _build_follow_up_message(self, schedule: SurveySchedule, period: SurveyPeriod) -> str:
        """Build the follow-up reminder message based on the schedule and period."""
        template = schedule.follow_up_message_template
        if not template:
            template = (
                "Hi! This is a reminder for your {frequency} check-in. "
                "You just need to answer it once this {period_name}, or I'll remind you again tomorrow."
            )
        return template.format(
            frequency=period.frequency_display,
            period_name=period.period_name
        )

    def _get_enabled_schedule(
        self,
        db: Session,
        organization_id: int,
        job_name: str
    ) -> Optional[SurveySchedule]:
        """Load the enabled survey schedule for an organization."""
        schedule = db.query(SurveySchedule).filter(
            SurveySchedule.organization_id == organization_id,
            SurveySchedule.enabled == True
        ).first()

        if not schedule:
            logger.debug(f"No enabled survey schedule found for org {organization_id}, skipping {job_name}")
            return None

        return schedule

    def _get_delivery_lock_key(self, organization_id: int) -> str:
        """
        Build the distributed lock key for scheduled survey delivery.

        We intentionally serialize initial sends, same-day reminders, and follow-up
        reminders for an organization to avoid overlapping Slack DMs.
        """
        return f"survey_delivery:org:{organization_id}"

    async def _run_survey_job(self, organization_id: int, is_reminder: bool = False):
        """Open a fresh DB session for each scheduled survey job execution."""
        db = SessionLocal()
        try:
            await self._send_organization_surveys(organization_id, db, is_reminder)
        finally:
            db.close()

    async def _run_follow_up_job(self, organization_id: int):
        """Open a fresh DB session for each scheduled follow-up job execution."""
        db = SessionLocal()
        try:
            await self._send_follow_up_reminders(organization_id, db)
        finally:
            db.close()

    async def _send_follow_up_reminders(self, organization_id: int, db: Session):
        """
        Send follow-up reminders to users with pending survey periods.
        Includes idempotency checks to prevent duplicate sends on the same day.
        """
        try:
            logger.debug(f"Starting follow-up reminder delivery for organization {organization_id}")

            lock_key = self._get_delivery_lock_key(organization_id)
            async with with_distributed_lock(
                lock_key,
                ttl_seconds=SURVEY_DELIVERY_LOCK_TTL,
                timeout_seconds=SURVEY_DELIVERY_LOCK_TIMEOUT
            ) as lock_acquired:
                if not lock_acquired:
                    logger.info(
                        f"Skipping follow-up reminders for org {organization_id} - "
                        "could not acquire delivery lock"
                    )
                    return

                schedule = self._get_enabled_schedule(db, organization_id, "follow-up reminders")
                if not schedule:
                    return

                if not schedule.follow_up_reminders_enabled:
                    logger.debug(f"Follow-up reminders disabled for org {organization_id}")
                    return

                org_timezone = schedule.timezone or 'UTC'
                today = self._get_org_date(org_timezone)

                # First, expire any overdue periods
                self._expire_overdue_periods(db, organization_id, org_timezone)

                slack_service = SlackTokenService(db)
                feature_config = slack_service.get_feature_config_for_organization(organization_id)

                if not feature_config or not feature_config.survey_enabled:
                    logger.debug(f"Survey feature not enabled for org {organization_id}")
                    return

                slack_token = get_slack_token_for_organization(db, organization_id)
                if not slack_token:
                    logger.warning(f"No Slack OAuth token available for org {organization_id}")
                    return

                # Get all pending periods within their date range
                pending_periods = db.query(SurveyPeriod).filter(
                    SurveyPeriod.organization_id == organization_id,
                    SurveyPeriod.status == 'pending',
                    SurveyPeriod.period_start_date <= today,
                    SurveyPeriod.period_end_date >= today
                ).all()

                sent_count = 0
                skipped_initial = 0
                skipped_already_sent = 0
                skipped_completed = 0
                failed_count = 0

                # Calculate today's date boundaries in org timezone for accurate date comparisons
                org_tz = pytz.timezone(org_timezone)
                today_start_local = org_tz.localize(datetime.combine(today, time.min))
                today_end_local = org_tz.localize(datetime.combine(today, time.max))
                today_start_utc = today_start_local.astimezone(timezone.utc)
                today_end_utc = today_end_local.astimezone(timezone.utc)

                for period in pending_periods:
                    try:
                        # Skip if initial was sent today (don't double-send on first day)
                        # Use org timezone boundaries to handle edge cases (e.g., PST 11:30 PM = UTC next day)
                        if period.initial_sent_at and today_start_utc <= period.initial_sent_at <= today_end_utc:
                            skipped_initial += 1
                            continue

                        # IDEMPOTENCY CHECK: Skip if we already sent a reminder today
                        # Use org timezone boundaries for accurate comparison
                        if period.last_reminder_sent_at and today_start_utc <= period.last_reminder_sent_at <= today_end_utc:
                            skipped_already_sent += 1
                            logger.debug(f"Skipping period {period.id} - reminder already sent today")
                            continue

                        # Check if user has already completed the survey in this period
                        # Use organization timezone to create proper date boundaries, then convert to UTC
                        period_start_local = org_tz.localize(datetime.combine(period.period_start_date, time.min))
                        period_end_local = org_tz.localize(datetime.combine(period.period_end_date, time.max))
                        period_start_utc = period_start_local.astimezone(pytz.UTC)
                        period_end_utc = period_end_local.astimezone(pytz.UTC)
                        completed_report = db.query(UserBurnoutReport).filter(
                            UserBurnoutReport.email == period.email,
                            UserBurnoutReport.submitted_at >= period_start_utc,
                            UserBurnoutReport.submitted_at <= period_end_utc
                        ).first()

                        if completed_report:
                            # Use FOR UPDATE to lock the row before updating
                            locked_period = db.query(SurveyPeriod).filter(
                                SurveyPeriod.id == period.id
                            ).with_for_update().first()
                            if locked_period:
                                locked_period.mark_completed(completed_report.id)
                            skipped_completed += 1
                            logger.debug(f"Marked period {period.id} as completed")
                            continue

                        correlation = db.query(UserCorrelation).filter(
                            UserCorrelation.id == period.user_correlation_id
                        ).first()

                        if not correlation or not correlation.slack_user_id:
                            logger.warning(f"No Slack ID for period {period.id}")
                            failed_count += 1
                            continue

                        # Check user preferences
                        if period.user_id:
                            preference = db.query(UserSurveyPreference).filter(
                                UserSurveyPreference.user_id == period.user_id
                            ).first()

                            if preference:
                                if not preference.receive_daily_surveys or not preference.receive_reminders:
                                    continue
                        normalized_email = normalize_survey_email(period.email)
                        recipient_lock_key = self._get_recipient_delivery_lock_key(normalized_email)
                        async with with_distributed_lock(
                            recipient_lock_key,
                            ttl_seconds=60,
                            timeout_seconds=0.25
                        ) as recipient_lock_acquired:
                            if not recipient_lock_acquired:
                                skipped_already_sent += 1
                                logger.info(
                                    "Skipping follow-up for %s - recipient already being processed elsewhere",
                                    mask_email(normalized_email),
                                )
                                continue

                            if self._has_survey_touchpoint_today(
                                db,
                                normalized_email,
                                today_start_utc,
                                today_end_utc,
                                exclude_organization_id=organization_id,
                            ):
                                skipped_already_sent += 1
                                logger.debug(
                                    "Skipping follow-up for %s - already contacted or responded today",
                                    mask_email(normalized_email),
                                )
                                continue

                            message = self._build_follow_up_message(schedule, period)

                            await self.dm_sender.send_survey_dm(
                                slack_token=slack_token,
                                slack_user_id=correlation.slack_user_id,
                                user_id=period.user_id,
                                organization_id=organization_id,
                                message=message,
                                user_email=normalized_email
                            )

                            # Lock and update the period
                            locked_period = db.query(SurveyPeriod).filter(
                                SurveyPeriod.id == period.id
                            ).with_for_update().first()
                            if locked_period:
                                locked_period.record_reminder_sent()
                            db.commit()
                            sent_count += 1

                            logger.debug(f"Sent follow-up reminder #{period.reminder_count + 1} for period {period.id}")

                    except Exception as e:
                        logger.error(f"Failed to send follow-up for period {period.id}: {str(e)}")
                        db.rollback()
                        failed_count += 1

                db.commit()

                logger.info(
                    f"Follow-up reminder delivery complete for org {organization_id}: "
                    f"{sent_count} sent, {skipped_initial} skipped (initial today), "
                    f"{skipped_already_sent} skipped (already sent today), "
                    f"{skipped_completed} already completed, {failed_count} failed"
                )

        except Exception as e:
            logger.error(f"Error in follow-up reminder delivery for org {organization_id}: {str(e)}")
            db.rollback()

    def schedule_organization_surveys(self, db: Session):
        """
        Schedule survey delivery for all active organizations.
        Called on app startup and when schedules are updated.
        """
        # Remove existing jobs
        self.scheduler.remove_all_jobs()

        # Get all enabled survey schedules
        schedules = db.query(SurveySchedule).filter(
            SurveySchedule.enabled == True
        ).all()

        for schedule in schedules:
            self._add_schedule_job(schedule)

        logger.debug(f"Scheduled surveys for {len(schedules)} organizations")

    def _add_schedule_job(self, schedule: SurveySchedule):
        """
        Add a cron job for a specific organization's survey schedule.
        Supports daily, weekday, and weekly frequencies.
        """
        org_timezone = pytz.timezone(schedule.timezone)
        send_hour = schedule.send_time.hour
        send_minute = schedule.send_time.minute

        # Determine frequency type (with fallback for old data)
        frequency_type = schedule.frequency_type or ('weekday' if schedule.send_weekdays_only else 'daily')

        # Build cron trigger based on frequency type
        day_of_week_cron = None
        if frequency_type == 'daily':
            freq_desc = "daily"
        elif frequency_type == 'weekday':
            day_of_week_cron = 'mon-fri'
            freq_desc = "weekdays only"
        elif frequency_type == 'weekly':
            if schedule.day_of_week is None:
                logger.error(f"Schedule {schedule.id} has weekly frequency but no day_of_week - skipping")
                return
            days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
            day_of_week_cron = days[schedule.day_of_week]
            freq_desc = f"weekly on {day_of_week_cron.capitalize()}"
        else:
            logger.error(f"Unknown frequency type: {frequency_type} - skipping schedule {schedule.id}")
            return

        trigger = CronTrigger(
            hour=send_hour,
            minute=send_minute,
            day_of_week=day_of_week_cron,
            timezone=org_timezone
        )

        # Add initial survey job
        job_id = f"survey_org_{schedule.organization_id}"
        self.scheduler.add_job(
            self._run_survey_job,
            trigger=trigger,
            args=[schedule.organization_id, False],  # False = not a reminder
            id=job_id,
            replace_existing=True
        )

        logger.debug(
            f"Scheduled survey for org {schedule.organization_id} "
            f"{freq_desc} at {send_hour:02d}:{send_minute:02d} {schedule.timezone}"
        )

        # Add reminder job if enabled
        if schedule.send_reminder:
            if schedule.reminder_time:
                reminder_hour = schedule.reminder_time.hour
                reminder_minute = schedule.reminder_time.minute
            else:
                # Calculate reminder time as X hours after initial send
                initial_time = datetime.combine(datetime.today(), schedule.send_time)
                reminder_datetime = initial_time + timedelta(hours=schedule.reminder_hours_after)
                reminder_hour = reminder_datetime.hour
                reminder_minute = reminder_datetime.minute

            reminder_trigger = CronTrigger(
                hour=reminder_hour,
                minute=reminder_minute,
                day_of_week=day_of_week_cron,
                timezone=org_timezone
            )

            reminder_job_id = f"reminder_org_{schedule.organization_id}"
            self.scheduler.add_job(
                self._run_survey_job,
                trigger=reminder_trigger,
                args=[schedule.organization_id, True],
                id=reminder_job_id,
                replace_existing=True
            )

            logger.debug(
                f"Scheduled reminders for org {schedule.organization_id} "
                f"at {reminder_hour:02d}:{reminder_minute:02d} {schedule.timezone}"
            )

        # Add follow-up reminder job if enabled (runs daily at same time as initial survey)
        if schedule.follow_up_reminders_enabled:
            followup_trigger = CronTrigger(
                hour=send_hour,
                minute=send_minute,
                timezone=org_timezone
            )

            followup_job_id = f"followup_org_{schedule.organization_id}"
            self.scheduler.add_job(
                self._run_follow_up_job,
                trigger=followup_trigger,
                args=[schedule.organization_id],
                id=followup_job_id,
                replace_existing=True
            )

            logger.debug(
                f"Scheduled follow-up reminders for org {schedule.organization_id} "
                f"daily at {send_hour:02d}:{send_minute:02d} {schedule.timezone}"
            )

    async def _send_organization_surveys(self, organization_id: int, db: Session, is_reminder: bool = False):
        """
        Send surveys to all opted-in users in an organization.

        Args:
            organization_id: ID of the organization
            db: Database session
            is_reminder: If True, only send to users who haven't completed survey today
        """
        try:
            message_type = "reminder" if is_reminder else "initial survey"
            logger.debug(f"Starting {message_type} delivery for organization {organization_id}")

            lock_key = self._get_delivery_lock_key(organization_id)
            async with with_distributed_lock(
                lock_key,
                ttl_seconds=SURVEY_DELIVERY_LOCK_TTL,
                timeout_seconds=SURVEY_DELIVERY_LOCK_TIMEOUT
            ) as lock_acquired:
                if not lock_acquired:
                    logger.info(
                        f"Skipping {message_type} delivery for org {organization_id} - "
                        "could not acquire delivery lock"
                    )
                    return

                schedule = self._get_enabled_schedule(db, organization_id, message_type)
                if not schedule:
                    return

                org_timezone = schedule.timezone

                # Expire any overdue periods before processing
                self._expire_overdue_periods(db, organization_id, org_timezone)

                # Check if survey feature is enabled for this organization
                slack_service = SlackTokenService(db)
                feature_config = slack_service.get_feature_config_for_organization(organization_id)

                if not feature_config or not feature_config.survey_enabled:
                    logger.info(
                        f"Survey feature not enabled for org {organization_id}, skipping {message_type} delivery"
                    )
                    return

                # Get Slack OAuth token for this organization
                slack_token = get_slack_token_for_organization(db, organization_id)

                if not slack_token:
                    logger.warning(f"No Slack OAuth token available for org {organization_id}")
                    return

                # Get all users in organization who should receive surveys
                users = self._get_survey_recipients(organization_id, db, is_reminder)

                # Choose appropriate message template
                message_template = None
                if schedule:
                    message_template = schedule.reminder_message_template if is_reminder else schedule.message_template

                # Send DMs
                sent_count = 0
                failed_count = 0
                skipped_count = 0
                today_start_utc, today_end_utc = get_utc_day_bounds()

                for user in users:
                    try:
                        normalized_email = normalize_survey_email(user.get('email'))
                        if not normalized_email:
                            skipped_count += 1
                            logger.warning("Skipping DM for user with missing email")
                            continue

                        if user['user_id'] is None:
                            logger.info(
                                "Sending %s to %s without a local User record; email-based survey tracking will be used",
                                message_type,
                                mask_email(normalized_email),
                            )

                        recipient_lock_key = self._get_recipient_delivery_lock_key(normalized_email)
                        async with with_distributed_lock(
                            recipient_lock_key,
                            ttl_seconds=60,
                            timeout_seconds=0.25
                        ) as recipient_lock_acquired:
                            if not recipient_lock_acquired:
                                skipped_count += 1
                                logger.info(
                                    "Skipping %s delivery for %s - recipient already being processed elsewhere",
                                    message_type,
                                    mask_email(normalized_email),
                                )
                                continue

                            if self._has_survey_touchpoint_today(db, normalized_email, today_start_utc, today_end_utc):
                                skipped_count += 1
                                logger.debug(
                                    "Skipping %s delivery for %s - already contacted or responded today",
                                    message_type,
                                    mask_email(normalized_email),
                                )
                                continue

                            # If reminder, check if user already completed survey today
                            # Check is scoped by recipient email so roster-only members without
                            # local User rows are treated the same as members with accounts.
                            if is_reminder:
                                already_completed = db.query(UserBurnoutReport).filter(
                                    func.lower(UserBurnoutReport.email) == normalized_email,
                                    UserBurnoutReport.submitted_at >= today_start_utc
                                ).first()

                                if already_completed:
                                    skipped_count += 1
                                    logger.debug(
                                        "Skipping reminder for %s - already completed",
                                        mask_email(normalized_email),
                                    )
                                    continue

                            await self.dm_sender.send_survey_dm(
                                slack_token=slack_token,
                                slack_user_id=user['slack_user_id'],
                                user_id=user['user_id'],
                                organization_id=organization_id,
                                message=message_template,
                                user_email=normalized_email
                            )
                            sent_count += 1

                            # Create notification for the user who received the survey
                            if user['user_id'] is not None:
                                try:
                                    notification_service = NotificationService(db)
                                    notification_service.create_survey_received_notification(
                                        user_id=user['user_id'],
                                        organization_id=organization_id,
                                        is_reminder=is_reminder,
                                        commit=False
                                    )
                                except Exception as notif_error:
                                    logger.error(f"Failed to create notification for user {user['user_id']}: {str(notif_error)}")

                            # Create survey period for follow-up tracking (only for initial sends)
                            if not is_reminder and schedule and user.get('correlation'):
                                try:
                                    frequency_type = schedule.frequency_type or 'weekday'
                                    period_start, period_end = self._calculate_period_bounds(
                                        frequency_type,
                                        self._get_org_date(org_timezone),
                                        schedule.day_of_week
                                    )

                                    self._create_or_update_survey_period(
                                        db=db,
                                        organization_id=organization_id,
                                        user_correlation=user['correlation'],
                                        user_id=user['user_id'],
                                        email=normalized_email,
                                        frequency_type=frequency_type,
                                        period_start=period_start,
                                        period_end=period_end,
                                        sent_at=datetime.now(timezone.utc),
                                        org_timezone=org_timezone
                                    )
                                except Exception as period_error:
                                    logger.error(f"Failed to create survey period: {str(period_error)}")

                            db.commit()

                    except Exception as e:
                        logger.error(f"Failed to send DM to user {user['user_id']}: {str(e)}")
                        db.rollback()
                        failed_count += 1

                if is_reminder:
                    logger.info(
                        f"Reminder delivery complete for org {organization_id}: "
                        f"{sent_count} sent, {skipped_count} already completed, {failed_count} failed"
                    )
                else:
                    logger.info(
                        f"Initial survey delivery complete for org {organization_id}: "
                        f"{sent_count} sent, {failed_count} failed"
                    )

                    # Create notification for admins (only for initial delivery, not reminders)
                    if sent_count > 0:
                        try:
                            notification_service = NotificationService(db)
                            notification_service.create_survey_delivery_notification(
                                organization_id=organization_id,
                                triggered_by=None,  # Scheduled delivery
                                recipient_count=sent_count,
                                is_manual=False,
                                commit=False
                            )
                        except Exception as e:
                            logger.error(f"Failed to create delivery notification: {str(e)}")

                db.commit()

        except Exception as e:
            logger.error(f"Error in daily survey delivery for org {organization_id}: {str(e)}")
            db.rollback()

    def _get_survey_recipients(self, organization_id: int, db: Session, is_reminder: bool = False, apply_saved_recipients: bool = True) -> List[Dict]:
        """
        Get list of users who should receive surveys.
        Returns users with Slack correlation and survey opt-in.
        Filters by saved recipient selections if configured.

        Args:
            organization_id: Organization ID
            db: Database session
            is_reminder: If True, also check reminder preferences
            apply_saved_recipients: If True, apply saved recipient filter (for automated surveys). If False, return all eligible users (for manual sends).
        """
        # Get saved recipient selections for this organization (only if apply_saved_recipients is True)
        saved_recipient_ids = None

        if apply_saved_recipients:
            saved_recipient_ids = get_saved_recipient_ids_for_org(db, organization_id)
            if saved_recipient_ids is not None:
                logger.info(f"Using saved recipient list for org {organization_id}: {len(saved_recipient_ids)} users selected")
            else:
                logger.debug(f"No saved recipient list found for org {organization_id}, using default (all users)")
        else:
            logger.debug(f"Skipping saved recipient filter for org {organization_id} (manual send)")

        # Query UserCorrelations first to include all team members (even those without User accounts)
        # Left join to User for those who have accounts
        # Order by correlation.id DESC to get the most recent correlation if duplicates exist
        users = db.query(UserCorrelation, User, UserSurveyPreference).outerjoin(
            User,
            and_(
                User.organization_id == UserCorrelation.organization_id,
                User.email == UserCorrelation.email
            )
        ).outerjoin(
            UserSurveyPreference, User.id == UserSurveyPreference.user_id
        ).filter(
            UserCorrelation.organization_id == organization_id,
            UserCorrelation.slack_user_id.isnot(None)  # Must have Slack ID
        ).order_by(UserCorrelation.id.desc()).all()

        # Use a dict to deduplicate by email (prevents duplicate surveys to same person)
        # Query is ordered by correlation.id DESC, so we keep the most recent correlation
        recipients_dict = {}
        for correlation, user, preference in users:
            # CRITICAL: Validate email matching to prevent wrong user mapping (only if user exists)
            if user and user.email != correlation.email:
                logger.error(
                    f"CRITICAL: Email mismatch! User {user.id} email={user.email} "
                    f"but correlation {correlation.id} email={correlation.email}. "
                    f"Skipping to prevent sending to wrong Slack user."
                )
                continue

            normalized_email = normalize_survey_email(correlation.email)
            if not normalized_email:
                logger.warning("Skipping correlation %s - missing email", correlation.id)
                continue

            # Skip if we already processed this email (keep most recent correlation)
            if normalized_email in recipients_dict:
                logger.debug(f"Duplicate email {correlation.email}, keeping first correlation (most recent)")
                continue

            # NEW: Filter by saved recipient selections if configured
            if saved_recipient_ids is not None and correlation.id not in saved_recipient_ids:
                logger.debug(f"Skipping correlation {correlation.id} - not in saved recipients")
                continue

            # Check if user opted out (default is opted-in) - only applies if they have a User account
            if user and preference and not preference.receive_daily_surveys:
                continue
            if user and preference and not preference.receive_slack_dms:
                continue

            # For reminders, also check reminder opt-out
            if is_reminder and user and preference and not preference.receive_reminders:
                continue

            recipients_dict[normalized_email] = {
                'user_id': user.id if user else None,
                'slack_user_id': correlation.slack_user_id,
                'email': normalized_email,
                'name': (user.name if user else None) or correlation.name,
                'correlation': correlation
            }

        return list(recipients_dict.values())


# Global scheduler instance
survey_scheduler = SurveyScheduler()
