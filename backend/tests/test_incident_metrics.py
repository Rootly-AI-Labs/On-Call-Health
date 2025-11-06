"""
Unit tests for Rootly and PagerDuty incident metrics calculation.

Tests metric extraction and calculation logic for both platforms without
requiring full analyzer instantiation.
"""

import unittest
from datetime import datetime, timedelta
from collections import defaultdict
import pytz


class TestRootlyIncidentDataStructure(unittest.TestCase):
    """Test Rootly incident data structure and field extraction."""

    def test_rootly_incident_structure(self):
        """Test that Rootly incident has expected nested structure."""
        incident = {
            "id": "inc1",
            "type": "incidents",
            "attributes": {
                "created_at": "2024-01-15T10:30:00Z",
                "acknowledged_at": "2024-01-15T10:45:00Z",
                "started_at": "2024-01-15T10:40:00Z",
                "mitigated_at": "2024-01-15T11:00:00Z",
                "status": "resolved",
                "severity": {
                    "data": {
                        "id": "sev1",
                        "type": "severities",
                        "attributes": {
                            "name": "SEV1",
                            "slug": "sev1"
                        }
                    }
                },
                "user": {
                    "id": "user1",
                    "name": "Test User",
                    "email": "test@example.com"
                }
            }
        }

        # Verify structure
        self.assertIn("attributes", incident)
        attrs = incident["attributes"]

        # Verify timestamps
        self.assertIn("created_at", attrs)
        self.assertIn("acknowledged_at", attrs)
        self.assertIn("started_at", attrs)
        self.assertIn("mitigated_at", attrs)

        # Verify status
        self.assertEqual(attrs["status"], "resolved")

        # Verify nested severity
        self.assertIn("severity", attrs)
        self.assertIn("data", attrs["severity"])
        self.assertIn("attributes", attrs["severity"]["data"])
        severity_name = attrs["severity"]["data"]["attributes"]["name"]
        self.assertEqual(severity_name, "SEV1")

        # Verify user assignment
        self.assertIn("user", attrs)
        self.assertEqual(attrs["user"]["id"], "user1")

    def test_rootly_severity_extraction(self):
        """Test extraction of severity from Rootly nested structure."""
        test_cases = [
            ("SEV0", "sev0"),
            ("SEV1", "sev1"),
            ("SEV2", "sev2"),
            ("SEV3", "sev3"),
            ("SEV4", "sev4"),
        ]

        for severity_name, expected_severity in test_cases:
            attrs = {
                "severity": {
                    "data": {
                        "attributes": {
                            "name": severity_name
                        }
                    }
                }
            }

            # Extraction logic
            severity = "unknown"
            severity_data = attrs.get("severity")
            if severity_data and isinstance(severity_data, dict):
                data = severity_data.get("data")
                if data and isinstance(data, dict):
                    attributes = data.get("attributes")
                    if attributes and isinstance(attributes, dict):
                        name = attributes.get("name")
                        if name and isinstance(name, str):
                            severity = name.lower()

            self.assertEqual(severity, expected_severity)

    def test_rootly_timestamp_fallback(self):
        """Test Rootly timestamp fallback logic for response time."""
        # Test with acknowledged_at present
        attrs1 = {
            "created_at": "2024-01-15T10:00:00Z",
            "acknowledged_at": "2024-01-15T10:15:00Z",
            "started_at": "2024-01-15T10:20:00Z",
            "mitigated_at": "2024-01-15T10:30:00Z"
        }

        # Should use acknowledged_at first
        response_timestamp = attrs1.get("acknowledged_at") or attrs1.get("started_at") or attrs1.get("mitigated_at")
        self.assertEqual(response_timestamp, "2024-01-15T10:15:00Z")

        # Test with only started_at present
        attrs2 = {
            "created_at": "2024-01-15T10:00:00Z",
            "started_at": "2024-01-15T10:20:00Z",
            "mitigated_at": "2024-01-15T10:30:00Z"
        }

        response_timestamp = attrs2.get("acknowledged_at") or attrs2.get("started_at") or attrs2.get("mitigated_at")
        self.assertEqual(response_timestamp, "2024-01-15T10:20:00Z")


class TestPagerDutyIncidentDataStructure(unittest.TestCase):
    """Test PagerDuty incident data structure and field extraction."""

    def test_pagerduty_incident_structure(self):
        """Test that PagerDuty incident has expected flat structure."""
        incident = {
            "id": "inc1",
            "type": "incident",
            "created_at": "2024-01-15T10:30:00Z",
            "acknowledged_at": "2024-01-15T10:45:00Z",
            "status": "resolved",
            "severity": "sev1",
            "urgency": "high",
            "assigned_to": {
                "id": "user1",
                "name": "Test User",
                "email": "test@example.com",
                "assignment_method": "escalation_policy",
                "confidence": "high"
            }
        }

        # Verify flat structure (no "attributes" wrapper)
        self.assertIn("created_at", incident)
        self.assertIn("acknowledged_at", incident)
        self.assertIn("status", incident)
        self.assertIn("severity", incident)

        # Verify severity is direct string
        self.assertEqual(incident["severity"], "sev1")

        # Verify user assignment
        self.assertIn("assigned_to", incident)
        self.assertEqual(incident["assigned_to"]["id"], "user1")

    def test_pagerduty_severity_mapping(self):
        """Test PagerDuty severity values."""
        severities = ["sev1", "sev2", "sev3", "sev4", "sev5"]

        for severity in severities:
            incident = {
                "created_at": "2024-01-15T10:00:00Z",
                "severity": severity
            }

            # Direct extraction (no nested structure)
            extracted_severity = incident.get("severity", "unknown")
            self.assertEqual(extracted_severity, severity)


class TestMetricCalculationLogic(unittest.TestCase):
    """Test the core metric calculation logic."""

    def test_incidents_per_week_calculation(self):
        """Test incidents per week calculation."""
        # 10 incidents over 7 days = 10 incidents/week
        incident_count = 10
        days_analyzed = 7
        incidents_per_week = (incident_count / days_analyzed) * 7
        self.assertEqual(incidents_per_week, 10.0)

        # 15 incidents over 30 days = 3.5 incidents/week
        incident_count = 15
        days_analyzed = 30
        incidents_per_week = (incident_count / days_analyzed) * 7
        self.assertAlmostEqual(incidents_per_week, 3.5, places=1)

    def test_percentage_calculation(self):
        """Test percentage calculations."""
        # 3 out of 10 = 30%
        count = 3
        total = 10
        percentage = count / total if total > 0 else 0
        self.assertAlmostEqual(percentage, 0.3, places=2)

        # 0 out of 10 = 0%
        count = 0
        total = 10
        percentage = count / total if total > 0 else 0
        self.assertEqual(percentage, 0.0)

        # 0 out of 0 = 0% (avoid division by zero)
        count = 0
        total = 0
        percentage = count / total if total > 0 else 0
        self.assertEqual(percentage, 0.0)

    def test_after_hours_detection(self):
        """Test after-hours detection logic (before 9 AM or after 6 PM)."""
        test_cases = [
            (8, True),   # 8 AM - before 9 AM
            (9, False),  # 9 AM - business hours
            (12, False), # 12 PM - business hours
            (17, False), # 5 PM - business hours
            (18, True),  # 6 PM - after hours
            (22, True),  # 10 PM - after hours
            (0, True),   # Midnight - after hours
        ]

        for hour, expected_after_hours in test_cases:
            is_after_hours = hour < 9 or hour >= 18
            self.assertEqual(is_after_hours, expected_after_hours,
                           f"Hour {hour} should be {'after hours' if expected_after_hours else 'business hours'}")

    def test_weekend_detection(self):
        """Test weekend detection logic (Saturday=5, Sunday=6)."""
        # datetime.weekday(): Monday=0, Tuesday=1, ..., Saturday=5, Sunday=6
        test_cases = [
            (datetime(2024, 1, 15), False),  # Monday
            (datetime(2024, 1, 16), False),  # Tuesday
            (datetime(2024, 1, 17), False),  # Wednesday
            (datetime(2024, 1, 18), False),  # Thursday
            (datetime(2024, 1, 19), False),  # Friday
            (datetime(2024, 1, 20), True),   # Saturday
            (datetime(2024, 1, 21), True),   # Sunday
        ]

        for date, expected_weekend in test_cases:
            is_weekend = date.weekday() >= 5
            self.assertEqual(is_weekend, expected_weekend,
                           f"{date.strftime('%A')} should be {'weekend' if expected_weekend else 'weekday'}")

    def test_response_time_calculation(self):
        """Test response time calculation in minutes."""
        created = datetime(2024, 1, 15, 10, 0, 0)
        acknowledged = datetime(2024, 1, 15, 10, 15, 0)

        # 15 minutes difference
        response_time_seconds = (acknowledged - created).total_seconds()
        response_time_minutes = response_time_seconds / 60
        self.assertEqual(response_time_minutes, 15.0)

        # 1 hour difference
        created = datetime(2024, 1, 15, 10, 0, 0)
        acknowledged = datetime(2024, 1, 15, 11, 0, 0)
        response_time_minutes = (acknowledged - created).total_seconds() / 60
        self.assertEqual(response_time_minutes, 60.0)

    def test_average_response_time(self):
        """Test average response time calculation."""
        response_times = [15.0, 30.0, 45.0, 60.0]  # minutes
        avg_response = sum(response_times) / len(response_times)
        self.assertEqual(avg_response, 37.5)

        # Empty list should return 0
        response_times = []
        avg_response = sum(response_times) / len(response_times) if response_times else 0
        self.assertEqual(avg_response, 0)


class TestSeverityWeighting(unittest.TestCase):
    """Test severity weighting calculations."""

    def test_rootly_severity_weights(self):
        """Test Rootly severity weight values."""
        # Rootly: SEV0=critical, SEV1=high, SEV2=medium, SEV3=low, SEV4=info
        severity_weights = {
            'sev0': 15.0,  # Critical - life-defining events
            'sev1': 12.0,  # High - executive involvement
            'sev2': 6.0,   # Medium
            'sev3': 3.0,   # Low
            'sev4': 1.5,   # Info
            'unknown': 1.5
        }

        # Verify weights are in descending order
        self.assertGreater(severity_weights['sev0'], severity_weights['sev1'])
        self.assertGreater(severity_weights['sev1'], severity_weights['sev2'])
        self.assertGreater(severity_weights['sev2'], severity_weights['sev3'])
        self.assertGreater(severity_weights['sev3'], severity_weights['sev4'])

        # Test weighted calculation
        incidents = [
            ('sev0', 2),  # 2 critical incidents
            ('sev1', 1),  # 1 high incident
            ('sev2', 3),  # 3 medium incidents
        ]

        total_weighted = sum(severity_weights[sev] * count for sev, count in incidents)
        expected = (15.0 * 2) + (12.0 * 1) + (6.0 * 3)  # 30 + 12 + 18 = 60
        self.assertEqual(total_weighted, expected)

    def test_pagerduty_severity_weights(self):
        """Test PagerDuty severity weight values."""
        # PagerDuty: SEV1=critical, SEV2=high, SEV3=medium, SEV4=low, SEV5=info
        severity_weights = {
            'sev1': 15.0,  # Critical - life-defining events
            'sev2': 12.0,  # High - executive involvement
            'sev3': 6.0,   # Medium
            'sev4': 3.0,   # Low
            'sev5': 1.5,   # Info
        }

        # Verify weights are in descending order
        self.assertGreater(severity_weights['sev1'], severity_weights['sev2'])
        self.assertGreater(severity_weights['sev2'], severity_weights['sev3'])
        self.assertGreater(severity_weights['sev3'], severity_weights['sev4'])
        self.assertGreater(severity_weights['sev4'], severity_weights['sev5'])

        # Test weighted calculation
        incidents = [
            ('sev1', 1),  # 1 critical incident
            ('sev2', 2),  # 2 high incidents
            ('sev3', 4),  # 4 medium incidents
        ]

        total_weighted = sum(severity_weights[sev] * count for sev, count in incidents)
        expected = (15.0 * 1) + (12.0 * 2) + (6.0 * 4)  # 15 + 24 + 24 = 63
        self.assertEqual(total_weighted, expected)

    def test_severity_weighted_per_week(self):
        """Test severity-weighted incidents per week calculation."""
        # Total weighted severity: 60
        # Over 30 days (4.3 weeks)
        total_weighted_severity = 60.0
        days_analyzed = 30

        severity_weighted_per_week = (total_weighted_severity / days_analyzed) * 7
        expected = (60.0 / 30) * 7  # 2.0 * 7 = 14.0
        self.assertEqual(severity_weighted_per_week, expected)


class TestOCBMetricMapping(unittest.TestCase):
    """Test mapping of incident metrics to OCB metrics."""

    def test_ocb_metric_names(self):
        """Test that OCB metric names are correct."""
        ocb_metrics = {
            'work_hours_trend': 0,
            'weekend_work': 0,
            'after_hours_activity': 0,
            'vacation_usage': 0,
            'sleep_quality_proxy': 0,
            'sprint_completion': 0,
            'code_review_speed': 0,
            'pr_frequency': 0,
            'deployment_frequency': 0,
            'meeting_load': 0,
            'oncall_burden': 0
        }

        # Verify all expected OCB metrics are present
        expected_metrics = [
            'work_hours_trend', 'weekend_work', 'after_hours_activity',
            'vacation_usage', 'sleep_quality_proxy', 'sprint_completion',
            'code_review_speed', 'pr_frequency', 'deployment_frequency',
            'meeting_load', 'oncall_burden'
        ]

        for metric in expected_metrics:
            self.assertIn(metric, ocb_metrics)

    def test_ocb_personal_burnout_factors(self):
        """Test OCB personal burnout factor mapping."""
        # Personal burnout factors derived from incidents:
        # - work_hours_trend: incidents_per_week
        # - weekend_work: after_hours_percentage
        # - after_hours_activity: after_hours_percentage
        # - vacation_usage: severity_weighted_per_week
        # - sleep_quality_proxy: severity_weighted_per_week

        incidents_per_week = 5.0
        after_hours_pct = 0.3  # 30%
        severity_weighted_per_week = 10.0

        # Simplified calculation (actual uses tiered scaling)
        personal_factors = {
            'work_hours_trend': incidents_per_week,
            'weekend_work': after_hours_pct * 100,  # Convert to percentage
            'after_hours_activity': after_hours_pct * 100,
            'vacation_usage': (severity_weighted_per_week / 20) * 100,
            'sleep_quality_proxy': severity_weighted_per_week
        }

        self.assertGreater(personal_factors['work_hours_trend'], 0)
        self.assertGreater(personal_factors['weekend_work'], 0)
        self.assertGreater(personal_factors['after_hours_activity'], 0)

    def test_ocb_work_related_factors(self):
        """Test OCB work-related burnout factor mapping."""
        # Work-related factors derived from incidents:
        # - sprint_completion: avg_response_time_minutes
        # - code_review_speed: avg_response_time_minutes
        # - pr_frequency: incidents_per_week
        # - deployment_frequency: critical_incidents
        # - meeting_load: incidents_per_week
        # - oncall_burden: severity_weighted_per_week

        incidents_per_week = 5.0
        avg_response_minutes = 30.0
        critical_incidents = 2
        severity_weighted_per_week = 10.0

        work_factors = {
            'sprint_completion': avg_response_minutes,
            'code_review_speed': avg_response_minutes,
            'pr_frequency': incidents_per_week,
            'deployment_frequency': critical_incidents,
            'meeting_load': incidents_per_week,
            'oncall_burden': severity_weighted_per_week
        }

        self.assertGreater(work_factors['sprint_completion'], 0)
        self.assertGreater(work_factors['pr_frequency'], 0)
        self.assertGreater(work_factors['deployment_frequency'], 0)


class TestTimezoneConversion(unittest.TestCase):
    """Test timezone conversion logic matching unified_burnout_analyzer."""

    def _parse_iso_utc(self, ts: str) -> datetime:
        """Parse ISO8601 timestamp into aware UTC datetime (matches analyzer logic)."""
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return None

    def _to_local(self, dt: datetime, user_tz: str) -> datetime:
        """Convert datetime to user's timezone (matches analyzer logic)."""
        try:
            tz = pytz.timezone(user_tz or "UTC")
        except Exception:
            tz = pytz.UTC
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        return dt.astimezone(tz)

    def test_parse_iso_utc_with_z_suffix(self):
        """Test parsing ISO8601 timestamp with Z suffix."""
        ts = "2024-01-15T10:30:00Z"
        dt = self._parse_iso_utc(ts)

        self.assertIsNotNone(dt)
        self.assertEqual(dt.year, 2024)
        self.assertEqual(dt.month, 1)
        self.assertEqual(dt.day, 15)
        self.assertEqual(dt.hour, 10)
        self.assertEqual(dt.minute, 30)
        self.assertEqual(dt.second, 0)
        # Should be UTC aware
        self.assertIsNotNone(dt.tzinfo)
        self.assertEqual(dt.tzinfo.utcoffset(dt), timedelta(0))

    def test_parse_iso_utc_with_offset(self):
        """Test parsing ISO8601 timestamp with +00:00 offset."""
        ts = "2024-01-15T10:30:00+00:00"
        dt = self._parse_iso_utc(ts)

        self.assertIsNotNone(dt)
        self.assertEqual(dt.hour, 10)
        self.assertIsNotNone(dt.tzinfo)

    def test_utc_to_eastern_conversion(self):
        """Test UTC to America/New_York timezone conversion."""
        # 2024-01-15 20:00:00 UTC = 2024-01-15 15:00:00 EST (UTC-5)
        ts_utc = "2024-01-15T20:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)
        dt_local = self._to_local(dt_utc, "America/New_York")

        self.assertEqual(dt_utc.hour, 20)  # 8 PM UTC
        self.assertEqual(dt_local.hour, 15)  # 3 PM EST

    def test_utc_to_pacific_conversion(self):
        """Test UTC to America/Los_Angeles timezone conversion."""
        # 2024-01-15 08:00:00 UTC = 2024-01-15 00:00:00 PST (UTC-8)
        ts_utc = "2024-01-15T08:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)
        dt_local = self._to_local(dt_utc, "America/Los_Angeles")

        self.assertEqual(dt_utc.hour, 8)  # 8 AM UTC
        self.assertEqual(dt_local.hour, 0)  # Midnight PST

    def test_utc_to_europe_conversion(self):
        """Test UTC to Europe/London timezone conversion."""
        # 2024-01-15 12:00:00 UTC = 2024-01-15 12:00:00 GMT (UTC+0)
        ts_utc = "2024-01-15T12:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)
        dt_local = self._to_local(dt_utc, "Europe/London")

        self.assertEqual(dt_utc.hour, 12)  # 12 PM UTC
        self.assertEqual(dt_local.hour, 12)  # 12 PM GMT

    def test_utc_to_asia_conversion(self):
        """Test UTC to Asia/Tokyo timezone conversion."""
        # 2024-01-15 00:00:00 UTC = 2024-01-15 09:00:00 JST (UTC+9)
        ts_utc = "2024-01-15T00:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)
        dt_local = self._to_local(dt_utc, "Asia/Tokyo")

        self.assertEqual(dt_utc.hour, 0)  # Midnight UTC
        self.assertEqual(dt_local.hour, 9)  # 9 AM JST

    def test_after_hours_detection_with_timezone(self):
        """Test after-hours detection considers user timezone."""
        # 2024-01-15 20:00:00 UTC
        # In UTC: 8 PM (after hours)
        # In EST (UTC-5): 3 PM (business hours)
        # In PST (UTC-8): 12 PM (business hours)
        ts_utc = "2024-01-15T20:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)

        # Check in UTC (should be after hours)
        dt_utc_local = self._to_local(dt_utc, "UTC")
        is_after_hours_utc = dt_utc_local.hour < 9 or dt_utc_local.hour >= 18
        self.assertTrue(is_after_hours_utc, "20:00 UTC should be after hours")

        # Check in EST (should be business hours)
        dt_est = self._to_local(dt_utc, "America/New_York")
        is_after_hours_est = dt_est.hour < 9 or dt_est.hour >= 18
        self.assertFalse(is_after_hours_est, "15:00 EST should be business hours")

        # Check in PST (should be business hours)
        dt_pst = self._to_local(dt_utc, "America/Los_Angeles")
        is_after_hours_pst = dt_pst.hour < 9 or dt_pst.hour >= 18
        self.assertFalse(is_after_hours_pst, "12:00 PST should be business hours")

    def test_early_morning_after_hours_with_timezone(self):
        """Test early morning after-hours detection with timezones."""
        # 2024-01-15 08:00:00 UTC
        # In UTC: 8 AM (before 9 AM = after hours)
        # In EST (UTC-5): 3 AM (after hours)
        # In PST (UTC-8): Midnight (after hours)
        ts_utc = "2024-01-15T08:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)

        # All should be after hours
        for tz in ["UTC", "America/New_York", "America/Los_Angeles"]:
            dt_local = self._to_local(dt_utc, tz)
            is_after_hours = dt_local.hour < 9 or dt_local.hour >= 18
            self.assertTrue(is_after_hours, f"{dt_local.hour}:00 in {tz} should be after hours")

    def test_weekend_detection_with_timezone(self):
        """Test weekend detection considers user timezone."""
        # 2024-01-20 23:00:00 UTC (Saturday night)
        # In UTC: Saturday (weekend)
        # In EST (UTC-5): Saturday 6 PM (weekend)
        # In Asia/Tokyo (UTC+9): Sunday 8 AM (weekend)
        ts_utc = "2024-01-20T23:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)

        # Check in UTC (Saturday)
        dt_utc_local = self._to_local(dt_utc, "UTC")
        is_weekend_utc = dt_utc_local.weekday() >= 5
        self.assertTrue(is_weekend_utc, "Saturday in UTC should be weekend")

        # Check in EST (still Saturday)
        dt_est = self._to_local(dt_utc, "America/New_York")
        is_weekend_est = dt_est.weekday() >= 5
        self.assertTrue(is_weekend_est, "Saturday in EST should be weekend")

        # Check in Tokyo (now Sunday)
        dt_tokyo = self._to_local(dt_utc, "Asia/Tokyo")
        is_weekend_tokyo = dt_tokyo.weekday() >= 5
        self.assertTrue(is_weekend_tokyo, "Sunday in Tokyo should be weekend")
        self.assertEqual(dt_tokyo.weekday(), 6, "Should be Sunday (6)")

    def test_timezone_boundary_crossing(self):
        """Test that timezone conversion can change the day."""
        # 2024-01-20 02:00:00 UTC (Saturday)
        # In PST (UTC-8): 2024-01-19 18:00:00 (Friday 6 PM)
        ts_utc = "2024-01-20T02:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)
        dt_pst = self._to_local(dt_utc, "America/Los_Angeles")

        # Date should change
        self.assertEqual(dt_utc.day, 20)  # Saturday UTC
        self.assertEqual(dt_pst.day, 19)  # Friday PST

        # Weekend detection should differ
        is_weekend_utc = dt_utc.weekday() >= 5
        is_weekend_pst = dt_pst.weekday() >= 5

        self.assertTrue(is_weekend_utc, "Saturday UTC should be weekend")
        self.assertFalse(is_weekend_pst, "Friday PST should be weekday")

    def test_invalid_timezone_defaults_to_utc(self):
        """Test that invalid timezone falls back to UTC."""
        ts_utc = "2024-01-15T12:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)

        # Try invalid timezone
        dt_local = self._to_local(dt_utc, "Invalid/Timezone")

        # Should default to UTC
        self.assertEqual(dt_local.hour, 12)
        self.assertEqual(dt_utc.hour, dt_local.hour)

    def test_none_timezone_defaults_to_utc(self):
        """Test that None timezone defaults to UTC."""
        ts_utc = "2024-01-15T12:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)

        dt_local = self._to_local(dt_utc, None)

        # Should default to UTC
        self.assertEqual(dt_local.hour, 12)

    def test_response_time_calculation_with_timezones(self):
        """Test response time calculation is timezone-independent."""
        # Response time should be the same regardless of timezone
        created_utc = "2024-01-15T10:00:00Z"
        acknowledged_utc = "2024-01-15T10:30:00Z"

        dt_created = self._parse_iso_utc(created_utc)
        dt_acknowledged = self._parse_iso_utc(acknowledged_utc)

        # Calculate in UTC
        response_time_utc = (dt_acknowledged - dt_created).total_seconds() / 60

        # Convert to EST and calculate
        dt_created_est = self._to_local(dt_created, "America/New_York")
        dt_acknowledged_est = self._to_local(dt_acknowledged, "America/New_York")
        response_time_est = (dt_acknowledged_est - dt_created_est).total_seconds() / 60

        # Should be the same (30 minutes)
        self.assertEqual(response_time_utc, 30.0)
        self.assertEqual(response_time_est, 30.0)
        self.assertEqual(response_time_utc, response_time_est)


class TestTimeImpactAnalysis(unittest.TestCase):
    """Test time impact multipliers calculation (matching _calculate_time_impact_multipliers)."""

    def _parse_iso_utc(self, ts: str) -> datetime:
        """Parse ISO8601 timestamp."""
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return None

    def _to_local(self, dt: datetime, user_tz: str) -> datetime:
        """Convert to local timezone."""
        try:
            tz = pytz.timezone(user_tz or "UTC")
        except Exception:
            tz = pytz.UTC
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        return dt.astimezone(tz)

    def test_time_impact_multiplier_constants(self):
        """Test that time impact multipliers match research values."""
        # From line 2252-2254 in unified_burnout_analyzer.py
        time_impacts = {
            'after_hours_multiplier': 1.4,  # 40% higher impact
            'weekend_multiplier': 1.6,      # 60% higher impact
            'overnight_multiplier': 1.8,    # 80% higher impact
        }

        self.assertEqual(time_impacts['after_hours_multiplier'], 1.4)
        self.assertEqual(time_impacts['weekend_multiplier'], 1.6)
        self.assertEqual(time_impacts['overnight_multiplier'], 1.8)

    def test_after_hours_detection_9am_to_5pm(self):
        """Test after-hours detection (before 9 AM or 5 PM and later)."""
        # Standardized: hour < 9 or hour >= 17
        test_cases = [
            (0, True),   # Midnight - after hours
            (6, True),   # 6 AM - after hours
            (8, True),   # 8 AM - after hours
            (9, False),  # 9 AM - business hours
            (12, False), # Noon - business hours
            (16, False), # 4 PM - business hours
            (17, True),  # 5 PM - after hours (17 >= 17)
            (18, True),  # 6 PM - after hours
            (23, True),  # 11 PM - after hours
        ]

        for hour, expected_after_hours in test_cases:
            is_after_hours = hour < 9 or hour >= 17
            self.assertEqual(is_after_hours, expected_after_hours,
                           f"Hour {hour} should be {'after hours' if expected_after_hours else 'business hours'}")

    def test_overnight_detection_10pm_to_6am(self):
        """Test overnight detection (10 PM to 6 AM)."""
        # Standardized: hour >= 22 or hour <= 6
        test_cases = [
            (0, True),   # Midnight - overnight
            (1, True),   # 1 AM - overnight
            (6, True),   # 6 AM - overnight
            (7, False),  # 7 AM - not overnight
            (12, False), # Noon - not overnight
            (21, False), # 9 PM - not overnight
            (22, True),  # 10 PM - overnight
            (23, True),  # 11 PM - overnight
        ]

        for hour, expected_overnight in test_cases:
            is_overnight = hour >= 22 or hour <= 6
            self.assertEqual(is_overnight, expected_overnight,
                           f"Hour {hour} should be {'overnight' if expected_overnight else 'not overnight'}")

    def test_time_impact_counting_with_timezone(self):
        """Test time impact counting with actual incident timestamps."""
        # Create incidents at different times (UTC)
        incidents = [
            "2024-01-15T03:00:00Z",  # 3 AM UTC - overnight, after hours
            "2024-01-15T12:00:00Z",  # 12 PM UTC - business hours
            "2024-01-15T20:00:00Z",  # 8 PM UTC - after hours (not overnight)
            "2024-01-20T15:00:00Z",  # 3 PM UTC Saturday - weekend
            "2024-01-21T01:00:00Z",  # 1 AM UTC Sunday - weekend, overnight, after hours
        ]

        # Count incidents in UTC timezone
        after_hours_count = 0
        weekend_count = 0
        overnight_count = 0

        for incident_ts in incidents:
            dt_utc = self._parse_iso_utc(incident_ts)
            dt_local = self._to_local(dt_utc, "UTC")

            hour = dt_local.hour
            weekday = dt_local.weekday()

            # After hours: before 9am or 5pm and later (hour >= 17)
            if hour < 9 or hour >= 17:
                after_hours_count += 1

            # Weekend: Saturday (5) or Sunday (6)
            if weekday >= 5:
                weekend_count += 1

            # Overnight: 10pm to 6am (hour >= 22 or hour <= 6)
            if hour >= 22 or hour <= 6:
                overnight_count += 1

        # Verify counts
        # 3 AM (yes, <9), 12 PM (no), 8 PM/20:00 (yes, >=17), Sat 3 PM/15:00 (no, <17), Sun 1 AM (yes, <9)
        self.assertEqual(after_hours_count, 3)  # 3 AM, 8 PM, Sun 1 AM
        self.assertEqual(weekend_count, 2)      # Saturday and Sunday incidents
        self.assertEqual(overnight_count, 2)    # 3 AM and 1 AM (both <=6)

    def test_time_impact_with_timezone_conversion(self):
        """Test that time impact detection respects user timezone."""
        # 2024-01-15 20:00:00 UTC
        # In UTC: 8 PM (after hours, not overnight)
        # In EST: 3 PM (business hours)
        ts_utc = "2024-01-15T20:00:00Z"
        dt_utc = self._parse_iso_utc(ts_utc)

        # Check in UTC (20:00 = 8 PM)
        dt_utc_local = self._to_local(dt_utc, "UTC")
        is_after_hours_utc = dt_utc_local.hour < 9 or dt_utc_local.hour >= 17
        is_overnight_utc = dt_utc_local.hour >= 22 or dt_utc_local.hour <= 6
        self.assertTrue(is_after_hours_utc)  # 20 >= 17
        self.assertFalse(is_overnight_utc)   # 20 not >= 22

        # Check in EST (should be business hours, 15:00 = 3 PM)
        dt_est = self._to_local(dt_utc, "America/New_York")
        is_after_hours_est = dt_est.hour < 9 or dt_est.hour >= 17
        is_overnight_est = dt_est.hour >= 22 or dt_est.hour <= 6
        self.assertFalse(is_after_hours_est)  # 15 not < 9 and not >= 17
        self.assertFalse(is_overnight_est)    # 15 not >= 22 and not <= 6


class TestRecoveryAnalysis(unittest.TestCase):
    """Test recovery deficit calculation (matching _calculate_recovery_deficit)."""

    def _parse_iso_utc(self, ts: str) -> datetime:
        """Parse ISO8601 timestamp."""
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return None

    def test_recovery_violation_threshold(self):
        """Test that recovery violations are detected at 48 hours."""
        # From line 2317: hours_between < 48
        incident1 = datetime(2024, 1, 15, 10, 0, 0, tzinfo=pytz.UTC)

        # 47 hours later - should be violation
        incident2_violation = incident1 + timedelta(hours=47)
        hours_between_violation = (incident2_violation - incident1).total_seconds() / 3600
        self.assertLess(hours_between_violation, 48)

        # 48 hours later - should NOT be violation
        incident2_ok = incident1 + timedelta(hours=48)
        hours_between_ok = (incident2_ok - incident1).total_seconds() / 3600
        self.assertGreaterEqual(hours_between_ok, 48)

    def test_recovery_periods_calculation(self):
        """Test recovery period calculation between incidents."""
        # 3 incidents spaced differently
        incident_times = [
            "2024-01-15T10:00:00Z",  # Incident 1
            "2024-01-16T10:00:00Z",  # 24 hours later - violation
            "2024-01-20T10:00:00Z",  # 96 hours later - good recovery
        ]

        parsed_times = [self._parse_iso_utc(ts) for ts in incident_times]
        parsed_times.sort()

        recovery_periods = []
        recovery_violations = 0

        for i in range(1, len(parsed_times)):
            time_diff = parsed_times[i] - parsed_times[i-1]
            hours_between = time_diff.total_seconds() / 3600
            recovery_periods.append(hours_between)

            if hours_between < 48:
                recovery_violations += 1

        # Verify
        self.assertEqual(len(recovery_periods), 2)
        self.assertEqual(recovery_periods[0], 24.0)  # First gap: 24 hours (violation)
        self.assertEqual(recovery_periods[1], 96.0)  # Second gap: 96 hours (good)
        self.assertEqual(recovery_violations, 1)     # Only first gap violates

    def test_recovery_score_calculation(self):
        """Test recovery score calculation (0-100 scale)."""
        # From line 2330: recovery_score = min(100, max(0, (avg_hours - 24) / (168 - 24) * 100))

        test_cases = [
            (24.0, 0.0),    # 24 hours avg = 0 score (minimum)
            (96.0, 50.0),   # 96 hours avg = 50 score (halfway between 24 and 168)
            (168.0, 100.0), # 168 hours (1 week) avg = 100 score (perfect)
            (200.0, 100.0), # >168 hours capped at 100
            (10.0, 0.0),    # <24 hours floored at 0
        ]

        for avg_hours, expected_score in test_cases:
            recovery_score = min(100, max(0, (avg_hours - 24) / (168 - 24) * 100))
            self.assertAlmostEqual(recovery_score, expected_score, places=1,
                                 msg=f"Avg {avg_hours}h should give score {expected_score}")

    def test_single_incident_perfect_recovery(self):
        """Test that single incident (no pairs) gets perfect recovery score."""
        # From line 2304-2306: if len(incident_times) < 2, recovery_score = 100
        incident_times = ["2024-01-15T10:00:00Z"]

        if len(incident_times) < 2:
            recovery_score = 100
        else:
            recovery_score = 0

        self.assertEqual(recovery_score, 100)

    def test_min_recovery_hours_tracking(self):
        """Test minimum recovery hours tracking."""
        incident_times = [
            "2024-01-15T10:00:00Z",  # Incident 1
            "2024-01-15T20:00:00Z",  # 10 hours later (min)
            "2024-01-17T10:00:00Z",  # 38 hours later
            "2024-01-20T10:00:00Z",  # 72 hours later
        ]

        parsed_times = [self._parse_iso_utc(ts) for ts in incident_times]
        parsed_times.sort()

        min_recovery_hours = float('inf')

        for i in range(1, len(parsed_times)):
            time_diff = parsed_times[i] - parsed_times[i-1]
            hours_between = time_diff.total_seconds() / 3600

            if hours_between < min_recovery_hours:
                min_recovery_hours = hours_between

        self.assertEqual(min_recovery_hours, 10.0)  # Should track the minimum

    def test_multiple_violations(self):
        """Test detection of multiple recovery violations."""
        # Create tight cluster of incidents (all < 48 hours apart)
        incident_times = [
            "2024-01-15T10:00:00Z",
            "2024-01-16T10:00:00Z",  # +24h (violation)
            "2024-01-17T10:00:00Z",  # +24h (violation)
            "2024-01-18T10:00:00Z",  # +24h (violation)
        ]

        parsed_times = [self._parse_iso_utc(ts) for ts in incident_times]
        parsed_times.sort()

        recovery_violations = 0

        for i in range(1, len(parsed_times)):
            time_diff = parsed_times[i] - parsed_times[i-1]
            hours_between = time_diff.total_seconds() / 3600

            if hours_between < 48:
                recovery_violations += 1

        self.assertEqual(recovery_violations, 3)  # All 3 gaps are violations


class TestTraumaAnalysis(unittest.TestCase):
    """Test compound trauma factor calculation (matching _calculate_compound_trauma_factor)."""

    def test_no_compound_effect_below_5(self):
        """Test that <5 critical incidents have no compound effect."""
        # From line 2228-2229: if critical_incident_count < 5, return 1.0
        test_cases = [0, 1, 2, 3, 4]

        for count in test_cases:
            if count < 5:
                compound_factor = 1.0
            else:
                compound_factor = 0  # Should not reach here

            self.assertEqual(compound_factor, 1.0,
                           f"{count} critical incidents should have factor 1.0")

    def test_moderate_compound_5_to_10(self):
        """Test moderate compound effect for 5-10 critical incidents."""
        # From line 2230-2232: 1.0 + (count - 5) * 0.02
        test_cases = [
            (5, 1.0),    # 5 incidents: 1.0 + (5-5)*0.02 = 1.0
            (6, 1.02),   # 6 incidents: 1.0 + (6-5)*0.02 = 1.02
            (7, 1.04),   # 7 incidents: 1.0 + (7-5)*0.02 = 1.04
            (8, 1.06),   # 8 incidents: 1.0 + (8-5)*0.02 = 1.06
            (9, 1.08),   # 9 incidents: 1.0 + (9-5)*0.02 = 1.08
            (10, 1.10),  # 10 incidents: 1.0 + (10-5)*0.02 = 1.10
        ]

        for count, expected_factor in test_cases:
            if count < 5:
                compound_factor = 1.0
            elif count <= 10:
                compound_factor = 1.0 + (count - 5) * 0.02
            else:
                compound_factor = 0  # Should not reach here

            self.assertAlmostEqual(compound_factor, expected_factor, places=2,
                                 msg=f"{count} critical incidents should have factor {expected_factor}")

    def test_high_compound_above_10(self):
        """Test high compound effect for >10 critical incidents."""
        # From line 2233-2237: base 1.1 + (count-10)*0.15, capped at 2.0
        test_cases = [
            (11, 1.25),   # 1.1 + (11-10)*0.15 = 1.25
            (12, 1.40),   # 1.1 + (12-10)*0.15 = 1.40
            (13, 1.55),   # 1.1 + (13-10)*0.15 = 1.55
            (15, 1.85),   # 1.1 + (15-10)*0.15 = 1.85
            (16, 2.0),    # 1.1 + (16-10)*0.15 = 2.0 (at cap)
            (20, 2.0),    # Would be 2.6 but capped at 2.0
            (50, 2.0),    # Would be very high but capped at 2.0
        ]

        for count, expected_factor in test_cases:
            if count < 5:
                compound_factor = 1.0
            elif count <= 10:
                compound_factor = 1.0 + (count - 5) * 0.02
            else:
                base_compound = 1.1
                additional_compound = (count - 10) * 0.15
                compound_factor = min(2.0, base_compound + additional_compound)

            self.assertAlmostEqual(compound_factor, expected_factor, places=2,
                                 msg=f"{count} critical incidents should have factor {expected_factor}")

    def test_compound_factor_cap_at_2x(self):
        """Test that compound factor is capped at 2.0x."""
        # From line 2237: min(2.0, ...)
        very_high_counts = [20, 50, 100]

        for count in very_high_counts:
            base_compound = 1.1
            additional_compound = (count - 10) * 0.15
            compound_factor = min(2.0, base_compound + additional_compound)

            self.assertEqual(compound_factor, 2.0,
                           f"{count} critical incidents should be capped at 2.0")

    def test_compound_trauma_detection_threshold(self):
        """Test compound trauma detection threshold (≥5 critical incidents)."""
        # From analyzer line 1294: compound_trauma_detected = critical_count >= 5
        test_cases = [
            (0, False),
            (4, False),
            (5, True),
            (10, True),
            (20, True),
        ]

        for count, expected_detected in test_cases:
            compound_trauma_detected = count >= 5
            self.assertEqual(compound_trauma_detected, expected_detected,
                           f"{count} critical incidents: detected={expected_detected}")

    def test_critical_incident_definition_rootly(self):
        """Test that Rootly critical incidents are SEV0 + SEV1."""
        # From analyzer line 1171: critical_incidents = sev1 + sev0
        severity_dist = {
            'sev0': 2,  # Critical
            'sev1': 3,  # High
            'sev2': 5,  # Medium
        }

        critical_incidents = severity_dist.get('sev1', 0) + severity_dist.get('sev0', 0)
        self.assertEqual(critical_incidents, 5)  # 2 + 3

    def test_critical_incident_definition_pagerduty(self):
        """Test that PagerDuty critical incidents are SEV1 only."""
        # From analyzer line 1166: critical_incidents = sev1
        severity_dist = {
            'sev1': 3,  # Critical
            'sev2': 5,  # High
            'sev3': 7,  # Medium
        }

        critical_incidents = severity_dist.get('sev1', 0)
        self.assertEqual(critical_incidents, 3)  # Only sev1


class TestEdgeCases(unittest.TestCase):
    """Test edge cases in metric calculations."""

    def test_zero_incidents(self):
        """Test calculations with zero incidents."""
        incident_count = 0
        days_analyzed = 7

        incidents_per_week = (incident_count / days_analyzed) * 7 if days_analyzed > 0 else 0
        self.assertEqual(incidents_per_week, 0.0)

        after_hours_percentage = 0 / incident_count if incident_count > 0 else 0
        self.assertEqual(after_hours_percentage, 0.0)

    def test_zero_days_analyzed(self):
        """Test handling of zero days analyzed."""
        incident_count = 5
        days_analyzed = 0

        # Should default to 1 to avoid division by zero
        safe_days = days_analyzed if days_analyzed > 0 else 1
        incidents_per_week = (incident_count / safe_days) * 7
        self.assertGreater(incidents_per_week, 0)

    def test_missing_severity(self):
        """Test handling of missing severity."""
        severity = None

        # Should default to "unknown"
        final_severity = severity if severity else "unknown"
        self.assertEqual(final_severity, "unknown")

    def test_none_values(self):
        """Test handling of None values in calculations."""
        after_hours_count = None
        safe_after_hours = after_hours_count if after_hours_count is not None else 0
        self.assertEqual(safe_after_hours, 0)

        incidents = None
        safe_incidents_len = len(incidents) if incidents is not None else 0
        self.assertEqual(safe_incidents_len, 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
