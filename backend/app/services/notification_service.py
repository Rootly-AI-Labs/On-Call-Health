"""
Service for creating and managing user notifications.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlalchemy.orm import Session

from ..models import UserNotification, User, OrganizationInvitation, Analysis, Organization

class NotificationService:
    """Service for creating and managing notifications."""

    def __init__(self, db: Session):
        self.db = db

    def create_invitation_notification(self, invitation: OrganizationInvitation) -> UserNotification:
        """Create notification for organization invitation."""

        # Try to find existing user by email
        user = self.db.query(User).filter(User.email == invitation.email).first()

        notification = UserNotification(
            user_id=user.id if user else None,
            email=invitation.email,
            organization_id=invitation.organization_id,
            type='invitation',
            title=f"Invitation to join {invitation.organization.name}",
            message=f"You've been invited to join {invitation.organization.name} as a {invitation.role}.",
            action_url=f"/invitations/accept/{invitation.id}",
            action_text="Accept Invitation",
            organization_invitation_id=invitation.id,
            priority='high',
            expires_at=invitation.expires_at
        )

        self.db.add(notification)
        self.db.commit()
        return notification

    def create_invitation_accepted_notification(self, invitation: OrganizationInvitation, accepted_by: User) -> List[UserNotification]:
        """Notify the inviter and org admins that someone accepted an invitation."""
        notifications = []

        # First, notify the person who sent the invitation
        inviter = self.db.query(User).filter(User.id == invitation.invited_by).first()
        if inviter and inviter.id != accepted_by.id:  # Don't notify if they accepted their own invite
            invitation_notification = UserNotification(
                user_id=inviter.id,
                organization_id=invitation.organization_id,
                type='invitation',
                title=f"{accepted_by.name or accepted_by.email} accepted your invitation",
                message=f"{accepted_by.email} accepted your invitation and joined {invitation.organization.name} as a {invitation.role}.",
                action_url=f"/integrations?tab=members",
                action_text="View Team Members",
                priority='high'
            )
            notifications.append(invitation_notification)
            self.db.add(invitation_notification)

        # Also notify org admins (but not the inviter again or the person who accepted)
        org_admins = self.db.query(User).filter(
            User.organization_id == invitation.organization_id,
            User.role.in_(['org_admin', 'super_admin']),
            User.id != invitation.invited_by,  # Don't duplicate notification for inviter
            User.id != accepted_by.id  # Don't notify the person who accepted
        ).all()

        for admin in org_admins:
            admin_notification = UserNotification(
                user_id=admin.id,
                organization_id=invitation.organization_id,
                type='integration',
                title=f"New team member: {accepted_by.name or accepted_by.email}",
                message=f"{accepted_by.email} accepted an invitation and joined {invitation.organization.name}.",
                action_url=f"/integrations?tab=members",
                action_text="View Members",
                priority='normal'
            )
            notifications.append(admin_notification)
            self.db.add(admin_notification)

        self.db.commit()
        return notifications

    def create_survey_submitted_notification(self, user: User, organization_id: int, analysis: Optional[Analysis] = None) -> List[UserNotification]:
        """Notify org admins when someone submits a survey."""
        notifications = []

        # Get org admins for the organization
        org_admins = self.db.query(User).filter(
            User.organization_id == organization_id,
            User.role.in_(['org_admin', 'super_admin']),
            User.id != user.id  # Don't notify the user who submitted
        ).all()

        # Build notification message
        user_name = user.name or user.email
        title = "Survey received"
        message = f"A burnout survey was sent to you via Slack DM. Please take 2 minutes to complete it."

        for admin in org_admins:
            notification = UserNotification(
                user_id=admin.id,
                organization_id=organization_id,
                type='survey',
                title=title,
                message=message,
                action_url=None,
                action_text=None,
                analysis_id=analysis.id if analysis else None,
                priority='normal'
            )
            notifications.append(notification)
            self.db.add(notification)

        self.db.commit()
        return notifications

    def create_analysis_complete_notification(self, analysis: Analysis) -> List[UserNotification]:
        """Notify organization members when analysis is complete."""
        notifications = []

        # Notify all organization members
        org_members = self.db.query(User).filter(
            User.organization_id == analysis.organization_id
        ).all()

        for member in org_members:
            notification = UserNotification(
                user_id=member.id,
                organization_id=analysis.organization_id,
                type='analysis',
                title="Team burnout analysis complete",
                message=f"Your team's latest burnout analysis is ready to view.",
                action_url=f"/analyses/{analysis.id}",
                action_text="View Results",
                analysis_id=analysis.id,
                priority='high'
            )
            notifications.append(notification)
            self.db.add(notification)

        self.db.commit()
        return notifications

    def create_slack_connected_notification(self, user: User, workspace_name: str) -> UserNotification:
        """Notify when Slack workspace is connected."""
        notification = UserNotification(
            user_id=user.id,
            organization_id=user.organization_id,
            type='integration',
            title="Slack workspace connected",
            message=f"Successfully connected {workspace_name} to your organization.",
            action_url="/integrations",
            action_text="View Integrations",
            priority='normal'
        )

        self.db.add(notification)
        self.db.commit()
        return notification

    def create_survey_reminder_notification(self, user: User, analysis: Analysis) -> UserNotification:
        """Create reminder for pending survey."""
        notification = UserNotification(
            user_id=user.id,
            organization_id=user.organization_id,
            type='reminder',
            title="Complete your burnout survey",
            message=f"Your team's burnout analysis is waiting for your input.",
            action_url=f"/surveys/{analysis.id}",
            action_text="Take Survey",
            analysis_id=analysis.id,
            priority='high',
            expires_at=datetime.now(timezone.utc) + timedelta(days=7)
        )

        self.db.add(notification)
        self.db.commit()
        return notification

    def get_user_notifications(self, user: User, limit: int = 20, offset: int = 0) -> List[UserNotification]:
        """Get notifications for a user with pagination support."""
        notifications = self.db.query(UserNotification).filter(
            ((UserNotification.user_id == user.id) |
             (UserNotification.email == user.email)),
            UserNotification.status.notin_(['dismissed', 'acted'])
        ).order_by(
            UserNotification.priority.desc(),
            UserNotification.created_at.desc()
        ).offset(offset).limit(limit).all()

        return notifications

    def get_unread_count(self, user: User) -> int:
        """Get count of unread notifications for a user."""
        return self.db.query(UserNotification).filter(
            ((UserNotification.user_id == user.id) |
             (UserNotification.email == user.email)),
            UserNotification.status == 'unread'
        ).count()

    def get_total_count(self, user: User) -> int:
        """Get total count of non-dismissed notifications for a user."""
        return self.db.query(UserNotification).filter(
            ((UserNotification.user_id == user.id) |
             (UserNotification.email == user.email)),
            UserNotification.status.notin_(['dismissed', 'acted'])
        ).count()

    def mark_as_read(self, notification_id: int, user: User) -> bool:
        """Mark notification as read."""
        notification = self.db.query(UserNotification).filter(
            UserNotification.id == notification_id,
            ((UserNotification.user_id == user.id) |
             (UserNotification.email == user.email))
        ).first()

        if notification:
            notification.mark_as_read()
            self.db.commit()
            return True

        return False

    def mark_all_as_read(self, user: User) -> int:
        """Mark all notifications as read for a user."""
        notifications = self.db.query(UserNotification).filter(
            ((UserNotification.user_id == user.id) |
             (UserNotification.email == user.email)),
            UserNotification.status == 'unread'
        ).all()

        for notification in notifications:
            notification.mark_as_read()

        self.db.commit()
        return len(notifications)

    def dismiss_notification(self, notification_id: int, user: User) -> bool:
        """Dismiss notification."""
        notification = self.db.query(UserNotification).filter(
            UserNotification.id == notification_id,
            ((UserNotification.user_id == user.id) |
             (UserNotification.email == user.email))
        ).first()

        if notification:
            notification.status = 'dismissed'
            self.db.commit()
            return True

        return False

    def clear_all_notifications(self, user: User) -> int:
        """Clear all notifications for a user by marking them as dismissed."""
        notifications = self.db.query(UserNotification).filter(
            ((UserNotification.user_id == user.id) |
             (UserNotification.email == user.email)),
            UserNotification.status != 'dismissed'
        ).all()

        for notification in notifications:
            notification.status = 'dismissed'

        self.db.commit()
        return len(notifications)

    def create_survey_delivery_notification(
        self,
        organization_id: int,
        triggered_by: Optional[User],
        recipient_count: int,
        is_manual: bool = False
    ) -> List[UserNotification]:
        """
        Create notification when surveys are delivered.

        Args:
            organization_id: Organization ID
            triggered_by: User who triggered (None for scheduled)
            recipient_count: Number of recipients
            is_manual: True if manually triggered, False if scheduled
        """
        notifications = []

        # Get org admins (include the person who triggered - they want confirmation)
        org_admins = self.db.query(User).filter(
            User.organization_id == organization_id,
            User.role.in_(['org_admin', 'super_admin'])
        ).all()

        if is_manual and triggered_by:
            title = "Scheduled surveys sent"
            message = f"Daily burnout surveys were automatically sent to {recipient_count} team members via Slack."
        else:
            title = "Scheduled surveys sent"
            message = f"Daily burnout surveys were automatically sent to {recipient_count} team members via Slack."

        for admin in org_admins:
            notification = UserNotification(
                user_id=admin.id,
                organization_id=organization_id,
                type='survey',
                title=title,
                message=message,
                action_url=None,
                action_text=None,
                priority='low' if not is_manual else 'normal'
            )
            notifications.append(notification)
            self.db.add(notification)

        self.db.commit()
        return notifications

    def create_survey_received_notification(
        self,
        user_id: int,
        organization_id: int,
        is_reminder: bool = False
    ) -> UserNotification:
        """
        Create notification when a user receives a survey DM.

        Args:
            user_id: User who received the survey
            organization_id: Organization ID
            is_reminder: True if this is a reminder, False if initial survey
        """
        if is_reminder:
            title = "Survey reminder sent"
            message = "A reminder to complete your burnout survey was sent to you via Slack DM."
        else:
            # Don't create notification for survey received - user gets it in Slack
            return None

        notification = UserNotification(
            user_id=user_id,
            organization_id=organization_id,
            type='survey',
            title=title,
            message=message,
            action_url=None,
            action_text=None,
            priority='normal'
        )
        self.db.add(notification)
        self.db.commit()
        return notification

    def cleanup_expired_notifications(self):
        """Clean up expired notifications."""
        expired = self.db.query(UserNotification).filter(
            UserNotification.expires_at < datetime.now(timezone.utc)
        ).all()

        for notification in expired:
            notification.status = 'expired'

        self.db.commit()
        return len(expired)