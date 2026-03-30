import asyncio
import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from starlette.requests import Request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.api.endpoints.auth import (
    PasswordLoginRequest,
    exchange_auth_code_for_token,
    password_login,
)


def _build_request():
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/",
            "headers": [(b"user-agent", b"TestAgent/1.0")],
            "client": ("127.0.0.1", 12345),
            "query_string": b"",
        }
    )


def test_password_login_records_audit_and_returns_summary_fields():
    user = SimpleNamespace(
        id=7,
        email="user@example.com",
        name="Test User",
        password_hash="$2b$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcdefghijklmn",
        last_login_at=None,
        login_count=0,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    request = _build_request()
    login_request = PasswordLoginRequest(email="user@example.com", password="secret")

    def _record_login_success(*args, **kwargs):
        user.last_login_at = datetime(2026, 3, 30, 19, 0, tzinfo=timezone.utc)
        user.login_count = 1
        return True

    with patch("app.api.endpoints.auth.bcrypt.checkpw", return_value=True), patch(
        "app.api.endpoints.auth.create_access_token",
        return_value="jwt-token",
    ), patch("app.api.endpoints.auth.LoginAuditService") as audit_service_cls:
        audit_service_cls.return_value.record_login_success.side_effect = _record_login_success

        result = asyncio.run(
            password_login(
                request=request,
                login_request=login_request,
                db=db,
            )
        )

    assert result["access_token"] == "jwt-token"
    assert result["user"]["login_count"] == 1
    assert result["user"]["last_login_at"] == "2026-03-30T19:00:00+00:00"
    audit_service_cls.return_value.record_login_success.assert_called_once_with(
        user=user,
        auth_method="password",
        request=request,
    )


def test_password_login_succeeds_even_if_audit_logging_fails():
    user = SimpleNamespace(
        id=7,
        email="user@example.com",
        name="Test User",
        password_hash="$2b$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcdefghijklmn",
        last_login_at=None,
        login_count=0,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    with patch("app.api.endpoints.auth.bcrypt.checkpw", return_value=True), patch(
        "app.api.endpoints.auth.create_access_token",
        return_value="jwt-token",
    ), patch("app.api.endpoints.auth.LoginAuditService") as audit_service_cls:
        audit_service_cls.return_value.record_login_success.return_value = False

        result = asyncio.run(
            password_login(
                request=_build_request(),
                login_request=PasswordLoginRequest(email="user@example.com", password="secret"),
                db=db,
            )
        )

    assert result["access_token"] == "jwt-token"
    assert result["user"]["login_count"] == 0
    assert result["user"]["last_login_at"] is None


def test_exchange_token_records_oauth_method_for_audit():
    request = _build_request()
    user = SimpleNamespace(id=11, last_login_at=None, login_count=2)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    with patch(
        "app.api.endpoints.auth.get_oauth_code",
        return_value={
            "jwt_token": "oauth-jwt",
            "user_id": 11,
            "expires_at": datetime(2026, 3, 30, 19, 0, tzinfo=timezone.utc),
            "auth_method": "google",
        },
    ), patch("app.api.endpoints.auth.LoginAuditService") as audit_service_cls:
        result = asyncio.run(
            exchange_auth_code_for_token(
                request=request,
                code="temp-code",
                db=db,
            )
        )

    assert result["access_token"] == "oauth-jwt"
    assert result["user_id"] == 11
    audit_service_cls.return_value.record_login_success.assert_called_once_with(
        user=user,
        auth_method="google",
        request=request,
    )
