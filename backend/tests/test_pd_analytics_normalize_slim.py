"""Tests for PagerDuty Analytics normalization → slim round-trip.

These lock in the field mapping between `_normalize_analytics_incidents`
(producer) and `slim_pd_incident` / `slim_incidents` (consumers). A mismatch
here previously zeroed out multi-user attribution (`all_user_ids`) and the
per-incident metrics (`seconds_to_first_ack`, `auto_resolved`) shown in the UI.
"""
import unittest

from app.core.pagerduty_client import PagerDutyDataCollector
from app.utils import incident_utils
from app.utils.incident_utils import (
    slim_pd_incident,
    slim_incidents,
    _RAW_INCIDENT_STORAGE_CAP,
)


USERS = [
    {"id": "PUSR1", "email": "alice@example.com", "name": "Alice"},
    {"id": "PUSR2", "email": "bob@example.com", "name": "Bob"},
    {"id": "PUSR3", "email": "carol@example.com", "name": "Carol"},
]


def _analytics_incident(**overrides):
    """A representative raw Analytics-API incident row."""
    inc = {
        "id": "PINC1",
        # Analytics API returns the incident title under `description`, not `title`.
        "description": "Database latency spike",
        "created_at": "2026-04-01T10:00:00Z",
        "resolved_at": "2026-04-01T10:30:00Z",
        "urgency": "high",
        "assigned_user_ids": ["PUSR1"],
        "acknowledged_user_ids": ["PUSR2"],
        "joined_user_ids": ["PUSR3"],
        "seconds_to_first_ack": 42,
        "seconds_to_resolve": 1800,
        "auto_resolved": False,
        "escalation_count": 1,
        "off_hour_interruptions": 2,
        "sleep_hour_interruptions": 1,
        "business_hour_interruptions": 0,
        "total_interruptions": 3,
        "engaged_seconds": 600,
        "service_name": "api-gateway",
        "team_name": "Platform",
        "priority_name": "P1",
        "escalation_policy_name": "Default",
        "incident_number": 4242,
    }
    inc.update(overrides)
    return inc


class TestNormalizeAnalyticsIncidents(unittest.TestCase):
    def setUp(self):
        self.collector = PagerDutyDataCollector("test_token")

    def _normalize(self, incidents, users=USERS):
        return self.collector._normalize_analytics_incidents(incidents, users)

    def test_primary_assignee_and_email_resolution(self):
        result = self._normalize([_analytics_incident()])
        inc = result["incidents"][0]
        self.assertEqual(inc["assigned_to"]["id"], "PUSR1")
        self.assertEqual(inc["assigned_to"]["email"], "alice@example.com")
        self.assertEqual(inc["assigned_to"]["name"], "Alice")

    def test_falls_back_to_acknowledger_when_no_assignee(self):
        inc = _analytics_incident(assigned_user_ids=[])
        result = self._normalize([inc])
        self.assertEqual(result["incidents"][0]["assigned_to"]["id"], "PUSR2")

    def test_analytics_user_ids_is_union_of_all_roles(self):
        inc = self._normalize([_analytics_incident()])["incidents"][0]
        self.assertEqual(inc["analytics_user_ids"], ["PUSR1", "PUSR2", "PUSR3"])

    def test_metrics_nested_under_analytics_data(self):
        inc = self._normalize([_analytics_incident()])["incidents"][0]
        self.assertEqual(inc["analytics_data"]["seconds_to_first_ack"], 42)
        self.assertEqual(inc["analytics_data"]["off_hour_interruptions"], 2)
        self.assertFalse(inc["analytics_data"]["auto_resolved"])

    def test_title_falls_back_to_description(self):
        inc = self._normalize([_analytics_incident()])["incidents"][0]
        self.assertEqual(inc["title"], "Database latency spike")

    def test_no_assignee_when_no_users_involved(self):
        inc = _analytics_incident(
            assigned_user_ids=[], acknowledged_user_ids=[], joined_user_ids=[]
        )
        result = self._normalize([inc])
        self.assertIsNone(result["incidents"][0]["assigned_to"])


class TestSlimPdIncident(unittest.TestCase):
    """slim_pd_incident must read from the NORMALIZED shape, not the raw one."""

    def setUp(self):
        self.collector = PagerDutyDataCollector("test_token")
        self.normalized = self.collector._normalize_analytics_incidents(
            [_analytics_incident()], USERS
        )["incidents"][0]

    def test_all_user_ids_populated_from_analytics_user_ids(self):
        # Regression: slimmer previously read a non-existent `all_user_ids`
        # off the normalized incident and always produced [].
        slim = slim_pd_incident(self.normalized)
        self.assertEqual(slim["all_user_ids"], ["PUSR1", "PUSR2", "PUSR3"])

    def test_metrics_read_from_analytics_data(self):
        # Regression: these were read at top level and were always None.
        slim = slim_pd_incident(self.normalized)
        self.assertEqual(slim["seconds_to_first_ack"], 42)
        self.assertEqual(slim["auto_resolved"], False)

    def test_user_mapped_from_assigned_to(self):
        slim = slim_pd_incident(self.normalized)
        self.assertEqual(slim["user"]["email"], "alice@example.com")

    def test_title_present(self):
        slim = slim_pd_incident(self.normalized)
        self.assertEqual(slim["title"], "Database latency spike")

    def test_handles_non_dict_gracefully(self):
        self.assertIsNone(slim_pd_incident(None))


class TestSlimIncidentsCaps(unittest.TestCase):
    def test_count_cap_enforced_for_pagerduty(self):
        incidents = [{"id": f"P{i}", "assigned_to": None} for i in range(_RAW_INCIDENT_STORAGE_CAP + 50)]
        slimmed = slim_incidents(incidents, platform="pagerduty")
        self.assertEqual(len(slimmed), _RAW_INCIDENT_STORAGE_CAP)

    def test_byte_cap_truncates(self):
        # Shrink the byte cap so a modest list trips it, then confirm truncation.
        original = incident_utils._RAW_INCIDENT_MAX_BYTES
        incident_utils._RAW_INCIDENT_MAX_BYTES = 500
        try:
            incidents = [
                {"id": f"P{i}", "title": "x" * 100, "assigned_to": None}
                for i in range(100)
            ]
            slimmed = slim_incidents(incidents, platform="pagerduty")
            self.assertLess(len(slimmed), 100)
        finally:
            incident_utils._RAW_INCIDENT_MAX_BYTES = original

    def test_empty_list_returns_empty(self):
        self.assertEqual(slim_incidents([], platform="pagerduty"), [])


if __name__ == "__main__":
    unittest.main()
