"""
Login audit service for recording successful authentications.
"""
from __future__ import annotations

import ipaddress
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.user_login_event import UserLoginEvent

logger = logging.getLogger(__name__)
MAX_IP_ADDRESS_LENGTH = 64
MAX_USER_AGENT_LENGTH = 1000
VALID_AUTH_METHODS = {"password", "google", "github", "okta", "oauth", "unknown"}


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


def _normalize_auth_method(value: Optional[str]) -> str:
    """Return a validated auth method suitable for persistent audit logs."""
    candidate = (value or "").strip().lower()
    if candidate in VALID_AUTH_METHODS:
        return candidate
    return "unknown"


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
        normalized_auth_method = _normalize_auth_method(auth_method)
        previous_last_login_at = user.last_login_at
        previous_login_count = user.login_count
        updated_login_count = int(user.login_count or 0) + 1
        now = datetime.now(timezone.utc)

        try:
            login_event = UserLoginEvent(
                user_id=user.id,
                organization_id=user.organization_id,
                auth_method=normalized_auth_method,
                ip_address=get_request_ip(request),
                user_agent=get_request_user_agent(request),
                logged_in_at=now,
            )
            self.db.add(login_event)
            self.db.execute(
                update(User)
                .where(User.id == user.id)
                .values(
                    last_login_at=now,
                    login_count=func.coalesce(User.login_count, 0) + 1,
                )
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            user.last_login_at = previous_last_login_at
            user.login_count = previous_login_count
            logger.error(
                "Database constraint violation while recording login audit for user %s: %s",
                getattr(user, "id", None),
                exc,
            )
            return False
        except SQLAlchemyError:
            self.db.rollback()
            user.last_login_at = previous_last_login_at
            user.login_count = previous_login_count
            logger.exception("Database error while recording login audit event for user %s", getattr(user, "id", None))
            return False
        except Exception:
            self.db.rollback()
            user.last_login_at = previous_last_login_at
            user.login_count = previous_login_count
            logger.exception("Failed to record login audit event for user %s", getattr(user, "id", None))
            return False

        user.last_login_at = now
        user.login_count = updated_login_count
        try:
            self.db.refresh(user)
        except Exception:
            logger.warning(
                "Login audit persisted for user %s but refresh failed; using locally computed summary fields",
                getattr(user, "id", None),
                exc_info=True,
            )
            user.last_login_at = now
            user.login_count = updated_login_count

        return True
