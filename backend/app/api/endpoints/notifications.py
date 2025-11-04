"""
Notifications API endpoints for the integrations page notifications panel.
"""
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...models import get_db, User
from ...auth.dependencies import get_current_active_user
from ...services.notification_service import NotificationService

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"]
)

@router.get("/")
@router.get("")
async def get_notifications(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Get notifications for the current user with pagination support."""

    notification_service = NotificationService(db)

    notifications = notification_service.get_user_notifications(current_user, limit, offset)
    unread_count = notification_service.get_unread_count(current_user)
    total_count = notification_service.get_total_count(current_user)

    return {
        "notifications": [n.to_dict() for n in notifications],
        "unread_count": unread_count,
        "total_count": total_count,
        "has_more": (offset + len(notifications)) < total_count
    }

@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Mark a specific notification as read."""

    notification_service = NotificationService(db)

    if notification_service.mark_as_read(notification_id, current_user):
        return {"message": "Notification marked as read"}
    else:
        raise HTTPException(status_code=404, detail="Notification not found")

@router.post("/mark-all-read")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Mark all notifications as read for the current user."""

    notification_service = NotificationService(db)
    count = notification_service.mark_all_as_read(current_user)

    return {
        "message": f"Marked {count} notifications as read",
        "count": count
    }

@router.delete("/clear-all")
async def clear_all_notifications(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Clear all notifications for the current user."""

    notification_service = NotificationService(db)
    count = notification_service.clear_all_notifications(current_user)

    return {
        "message": f"Cleared {count} notifications",
        "count": count
    }

@router.delete("/{notification_id}")
async def dismiss_notification(
    notification_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Dismiss a notification."""

    notification_service = NotificationService(db)

    if notification_service.dismiss_notification(notification_id, current_user):
        return {"message": "Notification dismissed"}
    else:
        raise HTTPException(status_code=404, detail="Notification not found")

@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, int]:
    """Get count of unread notifications for badge display."""

    notification_service = NotificationService(db)
    count = notification_service.get_unread_count(current_user)

    return {"unread_count": count}