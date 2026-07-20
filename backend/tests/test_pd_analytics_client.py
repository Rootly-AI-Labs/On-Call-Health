"""Tests for PagerDuty Analytics API fetching, entitlement caching, and the
REST fallback that keeps unentitled/free accounts working.
"""
import asyncio
import unittest
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytz
from datetime import datetime

from app.core.pagerduty_client import (
    PagerDutyAPIClient,
    PagerDutyDataCollector,
    PagerDutyAnalyticsUnavailable,
)


def _make_response(status, json_body=None):
    resp = MagicMock()
    resp.status = status
    resp.__aenter__ = AsyncMock(return_value=resp)
    resp.__aexit__ = AsyncMock(return_value=False)
    resp.json = AsyncMock(return_value=json_body or {})
    resp.text = AsyncMock(return_value="error body")
    return resp


def _make_session(post_responses):
    """Session whose .post() returns each response in turn (as a context mgr)."""
    session = MagicMock()
    session.post.side_effect = list(post_responses)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


SINCE = datetime.now(pytz.UTC) - timedelta(days=7)


class TestAnalyticsEntitlement(unittest.TestCase):
    def setUp(self):
        self.client = PagerDutyAPIClient("test_token")

    def _run(self, coro):
        return asyncio.run(coro)

    @patch("app.core.pagerduty_client.set_cached_api_response")
    @patch("app.core.pagerduty_client.get_cached_api_response", return_value=None)
    @patch("aiohttp.ClientSession")
    def test_402_raises_and_caches_unavailable(self, sess_cls, _get, set_cache):
        sess_cls.return_value = _make_session([_make_response(402)])
        with self.assertRaises(PagerDutyAnalyticsUnavailable) as ctx:
            self._run(self.client.get_analytics_incidents(since=SINCE))
        self.assertEqual(ctx.exception.status, 402)
        # Negative verdict cached so we stop probing.
        set_cache.assert_called_once()
        cached_payload = set_cache.call_args.args[3]
        self.assertEqual(cached_payload, {"available": False, "status": 402})

    @patch("app.core.pagerduty_client.set_cached_api_response")
    @patch("app.core.pagerduty_client.get_cached_api_response", return_value=None)
    @patch("aiohttp.ClientSession")
    def test_403_raises(self, sess_cls, _get, _set):
        sess_cls.return_value = _make_session([_make_response(403)])
        with self.assertRaises(PagerDutyAnalyticsUnavailable):
            self._run(self.client.get_analytics_incidents(since=SINCE))

    @patch(
        "app.core.pagerduty_client.get_cached_api_response",
        return_value={"available": False, "status": 402},
    )
    @patch("aiohttp.ClientSession")
    def test_cached_unavailable_short_circuits_without_http(self, sess_cls, _get):
        session = _make_session([])
        sess_cls.return_value = session
        with self.assertRaises(PagerDutyAnalyticsUnavailable):
            self._run(self.client.get_analytics_incidents(since=SINCE))
        # No network call should have been made.
        session.post.assert_not_called()

    @patch("app.core.pagerduty_client.set_cached_api_response")
    @patch("app.core.pagerduty_client.get_cached_api_response", return_value=None)
    @patch("aiohttp.ClientSession")
    def test_success_returns_data_and_caches_available(self, sess_cls, _get, set_cache):
        body = {"data": [{"id": "PINC1"}, {"id": "PINC2"}], "next_cursor": None}
        sess_cls.return_value = _make_session([_make_response(200, body)])
        result = self._run(self.client.get_analytics_incidents(since=SINCE))
        self.assertEqual(len(result), 2)
        set_cache.assert_called_once()
        self.assertEqual(set_cache.call_args.args[3], {"available": True})

    @patch("app.core.pagerduty_client.set_cached_api_response")
    @patch("app.core.pagerduty_client.get_cached_api_response", return_value=None)
    @patch("aiohttp.ClientSession")
    def test_cursor_pagination(self, sess_cls, _get, _set):
        page1 = _make_response(200, {"data": [{"id": "A"}], "next_cursor": "cur1"})
        page2 = _make_response(200, {"data": [{"id": "B"}], "next_cursor": None})
        sess_cls.return_value = _make_session([page1, page2])
        result = self._run(self.client.get_analytics_incidents(since=SINCE, limit=5000))
        self.assertEqual([i["id"] for i in result], ["A", "B"])


class TestCollectAllDataFallback(unittest.TestCase):
    """When the Analytics API is unavailable, collect_all_data must fall back to
    the REST /incidents endpoint rather than returning an empty analysis."""

    def _run(self, coro):
        return asyncio.run(coro)

    def test_falls_back_to_rest_on_unavailable(self):
        collector = PagerDutyDataCollector("test_token")
        collector.client.get_users = AsyncMock(
            return_value=[{"id": "PUSR1", "email": "a@x.com", "name": "A"}]
        )
        collector.client.get_analytics_incidents = AsyncMock(
            side_effect=PagerDutyAnalyticsUnavailable(402)
        )
        collector.client.get_incidents = AsyncMock(
            return_value=[{"id": "PINC1"}]
        )
        # Stub the legacy REST normalizer so the test targets the fallback wiring,
        # not the enhanced-extraction internals.
        collector._normalize_with_enhanced_assignment_extraction = MagicMock(
            return_value={"incidents": [{"id": "PINC1"}], "users": [], "metadata": {}}
        )

        result = self._run(collector.collect_all_data(days_back=7))

        collector.client.get_incidents.assert_awaited_once()
        collector._normalize_with_enhanced_assignment_extraction.assert_called_once()
        self.assertEqual(
            result["collection_metadata"]["data_source"], "pagerduty_rest_fallback"
        )
        self.assertEqual(len(result["incidents"]), 1)


if __name__ == "__main__":
    unittest.main()
