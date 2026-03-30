import unittest
import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.models.user import User
from app.models.user_login_event import UserLoginEvent
from app.services.login_audit_service import (
    LoginAuditService,
    get_request_ip,
    get_request_user_agent,
    MAX_USER_AGENT_LENGTH,
)


class LoginAuditServiceTests(unittest.TestCase):
    def test_record_login_success_updates_user_and_creates_event(self):
        db = MagicMock()
        user = User(id=7, email="user@example.com", organization_id=3)
        user.login_count = 2
        request = SimpleNamespace(
            headers={"user-agent": "TestAgent/1.0"},
            client=SimpleNamespace(host="10.0.0.10"),
        )

        result = LoginAuditService(db).record_login_success(
            user=user,
            auth_method="google",
            request=request,
        )

        self.assertTrue(result)
        self.assertEqual(user.login_count, 3)
        self.assertIsNotNone(user.last_login_at)
        db.add.assert_called_once()
        db.commit.assert_called_once()

        login_event = db.add.call_args.args[0]
        self.assertIsInstance(login_event, UserLoginEvent)
        self.assertEqual(login_event.user_id, 7)
        self.assertEqual(login_event.organization_id, 3)
        self.assertEqual(login_event.auth_method, "google")
        self.assertEqual(login_event.ip_address, "10.0.0.10")
        self.assertEqual(login_event.user_agent, "TestAgent/1.0")

    def test_record_login_success_restores_user_if_commit_fails(self):
        db = MagicMock()
        db.commit.side_effect = RuntimeError("db down")
        user = User(id=9, email="user@example.com", organization_id=5)
        user.login_count = 4
        user.last_login_at = None
        request = SimpleNamespace(headers={}, client=SimpleNamespace(host="10.0.0.20"))

        result = LoginAuditService(db).record_login_success(
            user=user,
            auth_method="password",
            request=request,
        )

        self.assertFalse(result)
        self.assertEqual(user.login_count, 4)
        self.assertIsNone(user.last_login_at)
        db.rollback.assert_called_once()

    def test_get_request_ip_prefers_forwarded_for(self):
        request = SimpleNamespace(
            headers={"x-forwarded-for": "203.0.113.10, 10.0.0.1"},
            client=SimpleNamespace(host="10.0.0.1"),
        )
        self.assertEqual(get_request_ip(request), "203.0.113.10")

    def test_get_request_ip_ignores_invalid_forwarded_values(self):
        request = SimpleNamespace(
            headers={"x-forwarded-for": "definitely-not-an-ip", "x-real-ip": "198.51.100.8"},
            client=SimpleNamespace(host="10.0.0.1"),
        )
        self.assertEqual(get_request_ip(request), "198.51.100.8")

    def test_get_request_ip_returns_none_for_invalid_values(self):
        request = SimpleNamespace(
            headers={"x-forwarded-for": "bad-ip", "x-real-ip": "still-bad"},
            client=SimpleNamespace(host="not-an-ip"),
        )
        self.assertIsNone(get_request_ip(request))

    def test_get_request_user_agent_returns_header(self):
        request = SimpleNamespace(headers={"user-agent": "Mozilla/Test"}, client=None)
        self.assertEqual(get_request_user_agent(request), "Mozilla/Test")

    def test_get_request_user_agent_truncates_long_values(self):
        user_agent = "a" * (MAX_USER_AGENT_LENGTH + 50)
        request = SimpleNamespace(headers={"user-agent": user_agent}, client=None)
        self.assertEqual(get_request_user_agent(request), "a" * MAX_USER_AGENT_LENGTH)


if __name__ == "__main__":
    unittest.main()
