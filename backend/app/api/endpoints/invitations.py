"""
Organization invitations API endpoints.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from ...models import get_db, User, OrganizationInvitation, Organization, UserNotification
from ...auth.dependencies import get_current_active_user, get_current_user_optional
from ...services.notification_service import NotificationService

class CreateInvitationRequest(BaseModel):
    email: EmailStr
    role: str = "member"

router = APIRouter(
    prefix="/invitations",
    tags=["invitations"]
)

@router.post("/create")
async def create_invitation(
    request: CreateInvitationRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Create new organization invitation (for organization admins).
    """
    # Check if user has an organization
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="You must be part of an organization to invite others")

    # Check if user can invite (admin or super_admin)
    if current_user.role not in ['admin', 'org_admin', 'super_admin']:  # Support both during transition
        raise HTTPException(status_code=403, detail="Only organization admins can invite users")

    # Check if user already exists with this email
    existing_user = db.query(User).filter(User.email.ilike(request.email)).first()
    if existing_user and existing_user.organization_id:
        raise HTTPException(status_code=400, detail="User with this email already belongs to an organization")

    # Check for pending invitation with same email to same org
    existing_invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.email.ilike(request.email),
        OrganizationInvitation.organization_id == current_user.organization_id,
        OrganizationInvitation.status == "pending"
    ).first()

    if existing_invitation:
        raise HTTPException(status_code=400, detail="Invitation already pending for this email")

    try:
        # Create invitation
        invitation = OrganizationInvitation(
            organization_id=current_user.organization_id,
            email=request.email.lower(),
            role=request.role,
            invited_by=current_user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=30)  # 30 days expiry
        )

        db.add(invitation)
        db.commit()
        db.refresh(invitation)

        # Send notification
        notification_service = NotificationService(db)
        notification_service.create_invitation_notification(invitation)

        return {
            "success": True,
            "message": f"Invitation sent to {request.email}",
            "invitation_id": invitation.id,
            "expires_at": invitation.expires_at.isoformat()
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create invitation: {str(e)}")

@router.get("/pending")
async def list_pending_invitations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    List pending invitations for users with the same email domain or organization.
    """
    if not current_user.email:
        raise HTTPException(status_code=400, detail="User email not found")

    # Extract domain from current user's email
    email_domain = current_user.email.split('@')[1] if '@' in current_user.email else None

    if not email_domain:
        raise HTTPException(status_code=400, detail="Invalid email format")

    # Check if user can view invitations (admin or super_admin)
    if current_user.role not in ['admin', 'org_admin', 'super_admin']:  # Support both during transition
        raise HTTPException(status_code=403, detail="Only organization admins can view invitations")

    try:
        # Get pending invitations for this email domain or organization
        query = db.query(OrganizationInvitation).filter(
            OrganizationInvitation.status == "pending"
        )

        # Filter by organization_id if user has one, otherwise by email domain
        if current_user.organization_id:
            query = query.filter(OrganizationInvitation.organization_id == current_user.organization_id)
        else:
            query = query.filter(OrganizationInvitation.email.like(f'%@{email_domain}'))

        invitations = query.order_by(OrganizationInvitation.created_at.desc()).all()

        invitation_list = []
        for invitation in invitations:
            # Get the user who sent the invitation
            invited_by_user = db.query(User).filter(User.id == invitation.invited_by).first()

            invitation_data = {
                "id": invitation.id,
                "email": invitation.email,
                "role": invitation.role,
                "status": invitation.status,
                "created_at": invitation.created_at.isoformat(),
                "expires_at": invitation.expires_at.isoformat(),
                "is_expired": invitation.is_expired,
                "invited_by": {
                    "id": invited_by_user.id if invited_by_user else None,
                    "name": invited_by_user.name if invited_by_user else "Unknown",
                    "email": invited_by_user.email if invited_by_user else "Unknown"
                }
            }
            invitation_list.append(invitation_data)

        return {
            "invitations": invitation_list,
            "total": len(invitation_list),
            "organization": {
                "id": current_user.organization_id,
                "name": current_user.organization.name if current_user.organization else "Unknown"
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch invitations: {str(e)}")

@router.get("/organization/members")
async def list_organization_members(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    List all members of current user's organization with their roles.
    """
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="You must be part of an organization")

    try:
        # Get all users in this organization
        members = db.query(User).filter(
            User.organization_id == current_user.organization_id
        ).order_by(User.name.asc()).all()

        member_list = []
        for member in members:
            member_data = {
                "id": member.id,
                "name": member.name,
                "email": member.email,
                "role": member.role,
                "joined_org_at": member.joined_org_at.isoformat() if member.joined_org_at else None,
                "created_at": member.created_at.isoformat() if member.created_at else None,
                "is_current_user": member.id == current_user.id
            }
            member_list.append(member_data)

        return {
            "members": member_list,
            "total": len(member_list),
            "organization": {
                "id": current_user.organization_id,
                "name": current_user.organization.name if current_user.organization else "Unknown"
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch members: {str(e)}")

@router.get("/accept/{invitation_id}")
async def accept_invitation_page(
    invitation_id: int,
    request: Request,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Accept invitation page - can be accessed by authenticated or unauthenticated users.
    If unauthenticated, will show login prompt. If authenticated, will process acceptance.
    """
    # Get invitation
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id,
        OrganizationInvitation.status == "pending"
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found or already processed")

    if invitation.is_expired:
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # If user is not authenticated, return invitation details for login
    if not current_user:
        return {
            "requires_auth": True,
            "invitation": invitation.to_dict(),
            "organization_name": invitation.organization.name,
            "message": "Please log in to accept this invitation"
        }

    # Check if current user's email matches invitation
    if current_user.email.lower() != invitation.email.lower():
        raise HTTPException(
            status_code=403,
            detail="This invitation is for a different email address"
        )

    # Check if user is already in an organization
    if current_user.organization_id and current_user.organization_id != invitation.organization_id:
        raise HTTPException(
            status_code=400,
            detail="You are already a member of another organization"
        )

    # Process acceptance
    try:
        # Update user's organization
        current_user.organization_id = invitation.organization_id
        current_user.role = invitation.role
        current_user.joined_org_at = datetime.now(timezone.utc)

        # Mark invitation as accepted
        invitation.status = "accepted"
        invitation.used_at = datetime.now(timezone.utc)

        # Commit changes
        db.commit()

        # Create notifications
        notification_service = NotificationService(db)

        # Notify admins about the acceptance
        admin_notifications = notification_service.create_invitation_accepted_notification(
            invitation, current_user
        )

        # Mark the original invitation notification as acted upon
        original_notification = db.query(UserNotification).filter(
            UserNotification.organization_invitation_id == invitation.id,
            UserNotification.email == current_user.email
        ).first()

        if original_notification:
            original_notification.mark_as_acted()
            db.commit()

        return {
            "success": True,
            "message": f"Successfully joined {invitation.organization.name}!",
            "organization": {
                "id": invitation.organization.id,
                "name": invitation.organization.name
            },
            "role": invitation.role,
            "redirect_url": "/dashboard"  # Frontend can redirect here
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to accept invitation: {str(e)}")

@router.post("/accept/{invitation_id}")
async def accept_invitation_api(
    invitation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    API endpoint to accept invitation (for programmatic access).
    """
    # Get invitation
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id,
        OrganizationInvitation.status == "pending"
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found or already processed")

    if invitation.is_expired:
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Check if current user's email matches invitation
    if current_user.email.lower() != invitation.email.lower():
        raise HTTPException(
            status_code=403,
            detail="This invitation is for a different email address"
        )

    # Check if user is already in an organization
    if current_user.organization_id and current_user.organization_id != invitation.organization_id:
        raise HTTPException(
            status_code=400,
            detail="You are already a member of another organization"
        )

    # Process acceptance
    try:
        # Update user's organization
        current_user.organization_id = invitation.organization_id
        current_user.role = invitation.role
        current_user.joined_org_at = datetime.now(timezone.utc)

        # Mark invitation as accepted
        invitation.status = "accepted"
        invitation.used_at = datetime.now(timezone.utc)

        # Commit changes
        db.commit()

        # Create notifications
        notification_service = NotificationService(db)

        # Notify admins about the acceptance
        notification_service.create_invitation_accepted_notification(invitation, current_user)

        return {
            "success": True,
            "message": f"Successfully joined {invitation.organization.name}!",
            "organization": {
                "id": invitation.organization.id,
                "name": invitation.organization.name
            },
            "role": invitation.role
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to accept invitation: {str(e)}")

@router.get("/{invitation_id}")
async def get_invitation_details(
    invitation_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get invitation details (public endpoint for showing invitation info before login).
    """
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    return {
        "invitation": invitation.to_dict(),
        "organization_name": invitation.organization.name,
        "is_expired": invitation.is_expired,
        "is_pending": invitation.is_pending
    }

@router.post("/resend/{invitation_id}")
async def resend_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Resend invitation notification (org admins only).
    """
    # Get invitation
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Check if current user can resend (admin or super admin)
    if not current_user.organization_id == invitation.organization_id or current_user.role not in ['admin', 'org_admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="Not authorized to resend this invitation")

    if invitation.status == "accepted":
        raise HTTPException(status_code=400, detail="Invitation has already been accepted")

    # Create new notification
    notification_service = NotificationService(db)
    notification_service.create_invitation_notification(invitation)

    return {
        "success": True,
        "message": "Invitation notification resent successfully"
    }

@router.post("/reject/{invitation_id}")
async def reject_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Reject/deny invitation (for invited users).
    """
    # Get invitation
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id,
        OrganizationInvitation.status == "pending"
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found or already processed")

    if invitation.is_expired:
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Check if current user's email matches invitation
    if current_user.email.lower() != invitation.email.lower():
        raise HTTPException(
            status_code=403,
            detail="This invitation is for a different email address"
        )

    try:
        # Mark invitation as rejected
        invitation.status = "rejected"
        invitation.used_at = datetime.now(timezone.utc)

        # Commit changes
        db.commit()

        # Create notification for the person who sent the invitation
        notification_service = NotificationService(db)

        # Get the person who sent the invitation
        invited_by = db.query(User).filter(User.id == invitation.invited_by).first()
        if invited_by:
            # Create notification for admin/manager who sent invitation
            admin_notification = UserNotification(
                user_id=invited_by.id,
                email=invited_by.email,
                title="Invitation Rejected",
                message=f"{current_user.email} declined the invitation to join {invitation.organization.name}",
                type="invitation_rejected",
                organization_invitation_id=invitation.id,
                created_at=datetime.now(timezone.utc)
            )
            db.add(admin_notification)

        # Mark the original invitation notification as acted upon
        original_notification = db.query(UserNotification).filter(
            UserNotification.organization_invitation_id == invitation.id,
            UserNotification.email == current_user.email
        ).first()

        if original_notification:
            original_notification.mark_as_acted()

        db.commit()

        return {
            "success": True,
            "message": f"Invitation to join {invitation.organization.name} has been declined",
            "organization": {
                "id": invitation.organization.id,
                "name": invitation.organization.name
            }
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reject invitation: {str(e)}")

@router.delete("/{invitation_id}")
async def revoke_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Revoke/cancel invitation (for org admins who sent it).
    """
    # Get invitation
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Check if current user can revoke (org admin of same org, or person who sent it)
    if not (
        (current_user.organization_id == invitation.organization_id and
         current_user.role in ['admin', 'org_admin', 'super_admin']) or
        current_user.id == invitation.invited_by
    ):
        raise HTTPException(status_code=403, detail="Not authorized to revoke this invitation")

    if invitation.status == "accepted":
        raise HTTPException(status_code=400, detail="Cannot revoke an accepted invitation")

    try:
        # Mark invitation as revoked
        invitation.status = "revoked"
        invitation.used_at = datetime.now(timezone.utc)

        # Mark related notifications as acted upon
        related_notifications = db.query(UserNotification).filter(
            UserNotification.organization_invitation_id == invitation.id
        ).all()

        for notification in related_notifications:
            notification.mark_as_acted()

        db.commit()

        return {
            "success": True,
            "message": f"Invitation to {invitation.email} has been revoked",
            "invitation": {
                "id": invitation.id,
                "email": invitation.email,
                "status": invitation.status
            }
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to revoke invitation: {str(e)}")