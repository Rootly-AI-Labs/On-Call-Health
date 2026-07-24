"""
Tests for PagerDuty API client check_permissions parallelization.
"""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.pagerduty_client import PagerDutyAPIClient


def _make_mock_response(status_code):
    """Create a mock aiohttp response that works as an async context manager."""
    mock_response = MagicMock()
    mock_response.status = status_code
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)
    return mock_response


def _make_mock_session(mock_response):
    """Create a mock aiohttp session where get() returns mock_response as context manager."""
    mock_session = MagicMock()
    mock_session.get.return_value = mock_response
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    return mock_session


class TestCheckPermissions(unittest.TestCase):
    """Test suite for PagerDutyAPIClient.check_permissions()."""

    def setUp(self):
        self.client = PagerDutyAPIClient("test_api_token")

    def _run_async(self, coro):
        return asyncio.run(coro)

    @patch("aiohttp.ClientSession")
    def test_all_endpoints_accessible(self, mock_session_cls):
        """Test that all 4 endpoints return access=True when API returns 200."""
        mock_response = _make_mock_response(200)
        mock_session = _make_mock_session(mock_response)
        mock_session_cls.return_value = mock_session

        result = self._run_async(self.client.check_permissions())

        for endpoint in ["users", "incidents", "services", "oncalls"]:
            self.assertTrue(result[endpoint]["access"], f"{endpoint} should have access")
            self.assertIsNone(result[endpoint]["error"], f"{endpoint} should have no error")

    @patch("aiohttp.ClientSession")
    def test_unauthorized_token(self, mock_session_cls):
        """Test that 401 response is handled correctly."""
        mock_response = _make_mock_response(401)
        mock_session = _make_mock_session(mock_response)
        mock_session_cls.return_value = mock_session

        result = self._run_async(self.client.check_permissions())

        for endpoint in ["users", "incidents", "services", "oncalls"]:
            self.assertFalse(result[endpoint]["access"])
            self.assertIn("Unauthorized", result[endpoint]["error"])

    @patch("aiohttp.ClientSession")
    def test_forbidden_returns_permission_hint(self, mock_session_cls):
        """Test that 403 response includes the specific permission name."""
        mock_response = _make_mock_response(403)
        mock_session = _make_mock_session(mock_response)
        mock_session_cls.return_value = mock_session

        result = self._run_async(self.client.check_permissions())

        self.assertIn("users:read", result["users"]["error"])
        self.assertIn("incidents:read", result["incidents"]["error"])
        self.assertIn("services:read", result["services"]["error"])
        self.assertIn("oncalls:read", result["oncalls"]["error"])

    @patch("aiohttp.ClientSession")
    def test_connection_error_per_endpoint(self, mock_session_cls):
        """Test that connection errors are captured per endpoint."""
        mock_session = MagicMock()
        mock_session.get.side_effect = Exception("Network timeout")
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session_cls.return_value = mock_session

        result = self._run_async(self.client.check_permissions())

        for endpoint in ["users", "incidents", "services", "oncalls"]:
            self.assertFalse(result[endpoint]["access"])
            self.assertIn("Connection error", result[endpoint]["error"])

    @patch("aiohttp.ClientSession")
    def test_session_creation_failure(self, mock_session_cls):
        """Test that session creation failure marks all endpoints as error."""
        mock_session_cls.return_value.__aenter__ = AsyncMock(
            side_effect=Exception("Cannot create session")
        )
        mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = self._run_async(self.client.check_permissions())

        for endpoint in ["users", "incidents", "services", "oncalls"]:
            self.assertFalse(result[endpoint]["access"])
            self.assertIn("Connection error", result[endpoint]["error"])

    @patch("aiohttp.ClientSession")
    def test_returns_all_endpoints(self, mock_session_cls):
        """Test that result always contains every probed endpoint key."""
        mock_response = _make_mock_response(200)
        mock_session = _make_mock_session(mock_response)
        mock_session_cls.return_value = mock_session

        result = self._run_async(self.client.check_permissions())

        self.assertEqual(
            set(result.keys()),
            {"users", "incidents", "services", "oncalls", "analytics"},
        )


if __name__ == "__main__":
    unittest.main()
