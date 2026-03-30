"""
Login audit service for recording successful authentications.
"""
from __future__ import annotations

import ipaddress
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.user_login_event import UserLoginEvent

logger = logging.getLogger(__name__)
MAX_IP_ADDRESS_LENGTH = 64
MAX_USER_AGENT_LENGTH = 1000


def _normalize_ip(value: Optional[str]) -> Optional[str]:
    """Return a validated, normalized IP address string when possible."""
    if not value:
        return None

    candidate = value.strip()
    if not candidate:
        return None

    try:
        return str(ipaddress.ip_address(candidate))[:MAX_IP_ADDRESS_LENGTH]
    except ValueError:
        return None


def get_request_ip(request: Optional[Request]) -> Optional[str]:
    """Extract a best-effort client IP address from the request."""
    if request is None:
        return None

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_hop = _normalize_ip(forwarded_for.split(",")[0])
        if first_hop:
            return first_hop

    real_ip = request.headers.get("x-real-ip")
    normalized_real_ip = _normalize_ip(real_ip)
    if normalized_real_ip:
        return normalized_real_ip

    client = getattr(request, "client", None)
    return _normalize_ip(getattr(client, "host", None))


def get_request_user_agent(request: Optional[Request]) -> Optional[str]:
    """Extract the user agent from the request when available."""
    if request is None:
        return None
    user_agent = request.headers.get("user-agent")
    if not user_agent:
        return None
    return user_agent[:MAX_USER_AGENT_LENGTH]


class LoginAuditService:
    """Centralized login audit recorder."""

    def __init__(self, db: Session):
        self.db = db

    def record_login_success(
        self,
        user: User,
        auth_method: str,
        request: Optional[Request] = None,
    ) -> bool:
        """
        Persist a successful login event and update user summary fields.

        Returns True when the audit write succeeds, False otherwise.
        This method is intentionally fail-open so auth flows are not blocked
        by audit persistence problems.

        Note that the ORM-backed user summary fields must be updated before
        commit so SQLAlchemy persists them in the same transaction as the
        login event. On failure we restore the in-memory object to keep the
        auth response consistent for the remainder of the request.
        """
        previous_last_login_at = user.last_login_at
        previous_login_count = user.login_count
        try:
            now = datetime.now(timezone.utc)
            login_event = UserLoginEvent(
                user_id=user.id,
                organization_id=user.organization_id,
                auth_method=auth_method,
                ip_address=get_request_ip(request),
                user_agent=get_request_user_agent(request),
                logged_in_at=now,
            )
            self.db.add(login_event)

            user.last_login_at = now
            user.login_count = int(user.login_count or 0) + 1

            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            user.last_login_at = previous_last_login_at
            user.login_count = previous_login_count
            logger.exception("Failed to record login audit event for user %s", getattr(user, "id", None))
            return False
