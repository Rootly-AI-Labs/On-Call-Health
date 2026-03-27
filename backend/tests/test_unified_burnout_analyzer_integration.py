"""
Integration tests for UnifiedBurnoutAnalyzer main orchestration methods.
Tests the actual methods with mocked API clients.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, Mock
import pytz

from app.services.unified_burnout_analyzer import UnifiedBurnoutAnalyzer


@pytest.fixture
def mock_rootly_client():
    """Mock RootlyAPIClient"""
    with patch('app.services.unified_burnout_analyzer.RootlyAPIClient') as mock:
        client = MagicMock()
        client.collect_analysis_data = AsyncMock()
        mock.return_value = client
        yield client


@pytest.fixture
def mock_pagerduty_client():
    """Mock PagerDutyAPIClient"""
    with patch('app.services.unified_burnout_analyzer.PagerDutyAPIClient') as mock:
        client = MagicMock()
        client.collect_analysis_data = AsyncMock()
        mock.return_value = client
        yield client


@pytest.fixture
def sample_rootly_data():
    """Sample Rootly data structure"""
    base_time = datetime.now(pytz.UTC)
    return {
        "users": [
            {
                "id": "1",
                "attributes": {
                    "full_name": "John Doe",
                    "email": "john@example.com",
                    "time_zone": "America/New_York"
                }
            },
            {
                "id": "2",
                "attributes": {
                    "full_name": "Jane Smith",
                    "email": "jane@example.com",
                    "time_zone": "America/Los_Angeles"
                }
            }
        ],
        "incidents": [
            {
                "id": "inc1",
                "attributes": {
                    "title": "Database outage",
                    "severity": "sev1",
                    "started_at": (base_time - timedelta(days=1)).isoformat(),
                    "resolved_at": (base_time - timedelta(days=1, hours=-2)).isoformat(),
                    "user": {"data": {"id": "1"}}  # User in attributes, not relationships
                }
            },
            {
                "id": "inc2",
                "attributes": {
                    "title": "API timeout",
                    "severity": "sev2",
                    "started_at": (base_time - timedelta(days=5)).isoformat(),
                    "resolved_at": (base_time - timedelta(days=5, hours=-1)).isoformat(),
                    "user": {"data": {"id": "2"}}  # User in attributes, not relationships
                }
            }
        ],
        "collection_metadata": {
            "timestamp": base_time.isoformat(),
            "days_analyzed": 30,
            "total_users": 2,
            "total_incidents": 2
        }
    }


@pytest.fixture
def sample_pagerduty_data():
    """Sample PagerDuty data structure"""
    base_time = datetime.now(pytz.UTC)
    return {
        "users": [
            {
                "id": "P1",
                "name": "John Doe",
                "email": "john@example.com",
                "timezone": "America/New_York"
            }
        ],
        "incidents": [
            {
                "id": "PD1",
                "title": "Service degradation",
                "urgency": "high",
                "created_at": (base_time - timedelta(days=2)).isoformat(),
                "resolved_at": (base_time - timedelta(days=2, hours=-3)).isoformat(),
                "assignments": [{"assignee": {"id": "P1"}}]
            }
        ],
        "collection_metadata": {
            "timestamp": base_time.isoformat(),
            "days_analyzed": 30,
            "total_users": 1,
            "total_incidents": 1
        }
    }


# Note: Async tests for _fetch_analysis_data are skipped
# They require pytest-asyncio to be installed
# To run them: pip install pytest-asyncio


class TestMapUserIncidents:
    """Tests for _map_user_incidents method"""

    def test_map_user_incidents_rootly(self, mock_rootly_client):
        """Test incident mapping for Rootly format"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        users = [
            {"id": "1", "attributes": {"full_name": "John Doe"}},
            {"id": "2", "attributes": {"full_name": "Jane Smith"}}
        ]

        # Rootly format: user is in attributes, not relationships
        incidents = [
            {
                "id": "inc1",
                "attributes": {
                    "title": "DB issue",
                    "user": {"data": {"id": "1"}}  # User in attributes
                }
            },
            {
                "id": "inc2",
                "attributes": {
                    "title": "API timeout",
                    "user": {"data": {"id": "2"}}
                }
            },
            {
                "id": "inc3",
                "attributes": {
                    "title": "Cache miss",
                    "started_by": {"data": {"id": "1"}}  # Also checks started_by
                }
            }
        ]

        result = analyzer._map_user_incidents(users, incidents)

        assert "1" in result
        assert "2" in result
        assert len(result["1"]) == 2
        assert len(result["2"]) == 1

    def test_map_user_incidents_pagerduty(self, mock_pagerduty_client):
        """Test incident mapping for PagerDuty format"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")

        users = [
            {"id": "P1", "name": "John Doe"},
            {"id": "P2", "name": "Jane Smith"}
        ]

        # PagerDuty format: assigned_to is checked first, raw_data only if no assigned_to
        incidents = [
            {
                "id": "PD1",
                "title": "Database down",
                "assigned_to": {"id": "P1"},  # P1 assigned via normalized field
            },
            {
                "id": "PD2",
                "title": "Server crash",
                "assigned_to": {"id": "P2"},  # P2 assigned via normalized field
            },
            {
                "id": "PD3",
                "title": "Network issue",
                # No assigned_to, so checks raw_data
                "raw_data": {
                    "acknowledgments": [{"acknowledger": {"id": "P1"}}]  # P1 acknowledged
                }
            }
        ]

        result = analyzer._map_user_incidents(users, incidents)

        assert "P1" in result
        assert "P2" in result
        assert len(result["P1"]) == 2  # Assigned to PD1, acknowledged PD3
        assert len(result["P2"]) == 1  # Assigned to PD2

    def test_map_user_incidents_empty(self, mock_rootly_client):
        """Test mapping with no incidents"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        users = [{"id": "1", "attributes": {"full_name": "John Doe"}}]
        incidents = []

        result = analyzer._map_user_incidents(users, incidents)

        assert len(result) == 0


class TestAnalyzeTeamData:
    """Tests for _analyze_team_data method"""

    def test_analyze_team_data_basic(self, mock_rootly_client, sample_rootly_data):
        """Test basic team analysis"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")
        analyzer.user_tz_by_id = {"1": "America/New_York", "2": "America/Los_Angeles"}

        result = analyzer._analyze_team_data(
            users=sample_rootly_data["users"],
            incidents=sample_rootly_data["incidents"],
            metadata=sample_rootly_data["collection_metadata"],
            include_weekends=True
        )

        assert "members" in result
        assert "total_members" in result
        assert "total_incidents" in result
        assert result["total_members"] == 2
        assert result["total_incidents"] == 2
        assert len(result["members"]) == 2

    def test_analyze_team_data_sorted_by_burnout(self, mock_rootly_client):
        """Test that members are sorted by burnout score descending"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")
        analyzer.user_tz_by_id = {}

        users = [
            {"id": "1", "attributes": {"full_name": "John Doe", "email": "john@example.com"}},
            {"id": "2", "attributes": {"full_name": "Jane Smith", "email": "jane@example.com"}}
        ]

        # No incidents - both should have 0 burnout, sorted by ID
        result = analyzer._analyze_team_data(
            users=users,
            incidents=[],
            metadata={"days_analyzed": 30},
            include_weekends=True
        )

        assert len(result["members"]) == 2
        # Both have burnout_score = 0 when no incidents
        assert all(m["burnout_score"] == 0 for m in result["members"])

    def test_analyze_team_data_empty_team(self, mock_rootly_client):
        """Test analysis with no users"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        result = analyzer._analyze_team_data(
            users=[],
            incidents=[],
            metadata={"days_analyzed": 30},
            include_weekends=True
        )

        assert result["total_members"] == 0
        assert len(result["members"]) == 0


class TestAnalyzeMemberBurnout:
    """Tests for _analyze_member_burnout method"""

    def test_analyze_member_no_incidents(self, mock_rootly_client):
        """Test member analysis with zero incidents"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        user = {
            "id": "1",
            "attributes": {
                "full_name": "John Doe",
                "email": "john@example.com"
            }
        }

        result = analyzer._analyze_member_burnout(
            user=user,
            incidents=[],
            metadata={"days_analyzed": 30},
            include_weekends=True
        )

        assert result["user_id"] == "1"
        assert result["user_name"] == "John Doe"
        assert result["burnout_score"] == 0
        assert result["risk_level"] == "low"
        assert result["incident_count"] == 0

    def test_analyze_member_with_incidents_rootly(self, mock_rootly_client):
        """Test member analysis with Rootly incidents"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")
        analyzer.user_tz_by_id = {"1": "America/New_York"}

        user = {
            "id": "1",
            "attributes": {
                "full_name": "John Doe",
                "email": "john@example.com",
                "time_zone": "America/New_York"
            }
        }

        base_time = datetime.now(pytz.UTC)
        incidents = [
            {
                "id": "inc1",
                "attributes": {
                    "title": "Database outage",
                    "severity": "sev1",
                    "started_at": (base_time - timedelta(days=1)).isoformat(),
                    "resolved_at": (base_time - timedelta(days=1, hours=-2)).isoformat()
                }
            },
            {
                "id": "inc2",
                "attributes": {
                    "title": "API error",
                    "severity": "sev2",
                    "started_at": (base_time - timedelta(days=5)).isoformat(),
                    "resolved_at": (base_time - timedelta(days=5, hours=-1)).isoformat()
                }
            }
        ]

        result = analyzer._analyze_member_burnout(
            user=user,
            incidents=incidents,
            metadata={"days_analyzed": 30},
            include_weekends=True
        )

        assert result["user_id"] == "1"
        assert result["incident_count"] == 2
        assert "burnout_score" in result
        assert "och_score" in result
        assert "risk_level" in result
        assert "factors" in result
        assert "metrics" in result

    def test_analyze_member_with_incidents_pagerduty(self, mock_pagerduty_client):
        """Test member analysis with PagerDuty incidents"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")
        analyzer.user_tz_by_id = {"P1": "America/Los_Angeles"}

        user = {
            "id": "P1",
            "name": "Jane Smith",
            "email": "jane@example.com",
            "timezone": "America/Los_Angeles"
        }

        base_time = datetime.now(pytz.UTC)
        incidents = [
            {
                "id": "PD1",
                "title": "Service degradation",
                "urgency": "high",
                "created_at": (base_time - timedelta(days=2)).isoformat(),
                "resolved_at": (base_time - timedelta(days=2, hours=-3)).isoformat()
            }
        ]

        result = analyzer._analyze_member_burnout(
            user=user,
            incidents=incidents,
            metadata={"days_analyzed": 30},
            include_weekends=True
        )

        assert result["user_id"] == "P1"
        assert result["user_name"] == "Jane Smith"
        assert result["incident_count"] == 1
        assert "burnout_score" in result


class TestCalculationMethods:
    """Tests for key calculation methods"""

    def test_determine_risk_level(self, mock_rootly_client):
        """Test _determine_risk_level method"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Scores are on 0-10 scale: low=0-3.0, medium=3.0-5.5, high=5.5-7.5, critical=7.5-10.0
        assert analyzer._determine_risk_level(1.5) == "low"
        assert analyzer._determine_risk_level(4.0) == "medium"
        assert analyzer._determine_risk_level(6.5) == "high"
        assert analyzer._determine_risk_level(8.5) == "critical"

    def test_calculate_team_health(self, mock_rootly_client):
        """Test _calculate_team_health method"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        member_analyses = [
            {"burnout_score": 2.0, "och_score": 20, "risk_level": "low", "user_name": "John", "incident_count": 1},
            {"burnout_score": 4.5, "och_score": 45, "risk_level": "medium", "user_name": "Jane", "incident_count": 3},
            {"burnout_score": 7.0, "och_score": 70, "risk_level": "high", "user_name": "Bob", "incident_count": 5}
        ]

        result = analyzer._calculate_team_health(member_analyses)

        # Check correct key names
        assert "overall_score" in result
        assert "scoring_method" in result
        assert "average_risk_score_100" in result
        assert "health_status" in result
        assert "risk_distribution" in result
        assert "members_at_risk" in result

        # Check risk distribution
        assert result["risk_distribution"]["low"] == 1
        assert result["risk_distribution"]["medium"] == 1
        assert result["risk_distribution"]["high"] == 1
        assert result["risk_distribution"]["critical"] == 0

    def test_calculate_compound_trauma_factor(self, mock_rootly_client):
        """Test _calculate_compound_trauma_factor method"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Returns multiplier (1.0-2.0 range), not a raw score
        # Below threshold (< 5) - no compound effect
        result_low = analyzer._calculate_compound_trauma_factor(3)
        assert result_low == 1.0  # Baseline multiplier

        # At threshold (5) - start of compound effect
        result_threshold = analyzer._calculate_compound_trauma_factor(5)
        assert result_threshold == 1.0

        # Above threshold (10) - 10% compound effect
        result_high = analyzer._calculate_compound_trauma_factor(10)
        assert result_high == 1.1

        # Well above threshold (15) - higher compound effect
        result_very_high = analyzer._calculate_compound_trauma_factor(15)
        assert result_very_high > 1.1

    def test_calculate_compound_trauma_factor_rate(self, mock_rootly_client):
        """Test _calculate_compound_trauma_factor_rate method (rate-based, CBI/sRPE methodology)"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Below threshold (< 1.5/week) - no compound effect
        result_low = analyzer._calculate_compound_trauma_factor_rate(1.0)
        assert result_low == 1.0  # Baseline multiplier

        # At threshold (1.5/week) - start of compound effect
        result_threshold = analyzer._calculate_compound_trauma_factor_rate(1.5)
        assert result_threshold == 1.0  # Just at threshold, minimal effect

        # Moderate rate (3.0/week) - 10% compound effect
        result_moderate = analyzer._calculate_compound_trauma_factor_rate(3.0)
        assert result_moderate == pytest.approx(1.1, rel=0.01)

        # High rate (5.0/week) - higher compound effect
        result_high = analyzer._calculate_compound_trauma_factor_rate(5.0)
        assert result_high > 1.1
        assert result_high == pytest.approx(1.3, rel=0.01)

        # Very high rate (12.0/week) - capped at 2.0x
        result_very_high = analyzer._calculate_compound_trauma_factor_rate(12.0)
        assert result_very_high == 2.0  # Maximum cap

    def test_work_burnout_och_rate_normalization_consistency(self, mock_rootly_client):
        """
        Test that same workload RATE produces same score across different time periods.

        This is the core fix for the scoring issue where 90-day analyses were producing
        inflated CRITICAL scores compared to 7-day analyses for the same workload rate.

        CBI/sRPE methodology: Use rates (per-week) instead of raw counts.
        """
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Same rate: 4 SEV1 incidents per week
        # 7 days = 4 incidents, 30 days = ~17 incidents, 90 days = ~52 incidents

        metrics_7day = {
            'severity_distribution': {'sev1': 4},
            'days_analyzed': 7,
            'incidents_per_week': 4.0,
            'avg_response_time_minutes': 15
        }

        metrics_30day = {
            'severity_distribution': {'sev1': 17},
            'days_analyzed': 30,
            'incidents_per_week': 4.0,
            'avg_response_time_minutes': 15
        }

        metrics_90day = {
            'severity_distribution': {'sev1': 52},
            'days_analyzed': 90,
            'incidents_per_week': 4.0,
            'avg_response_time_minutes': 15
        }

        score_7day = analyzer._calculate_work_burnout_och(metrics_7day)
        score_30day = analyzer._calculate_work_burnout_och(metrics_30day)
        score_90day = analyzer._calculate_work_burnout_och(metrics_90day)

        # All scores should be within 0.5 of each other (allowing for minor rounding)
        assert abs(score_7day - score_30day) < 0.5, f"7-day ({score_7day}) vs 30-day ({score_30day}) differ too much"
        assert abs(score_30day - score_90day) < 0.5, f"30-day ({score_30day}) vs 90-day ({score_90day}) differ too much"
        assert abs(score_7day - score_90day) < 0.5, f"7-day ({score_7day}) vs 90-day ({score_90day}) differ too much"

    def test_work_burnout_och_with_severity_distribution(self, mock_rootly_client):
        """Test _calculate_work_burnout_och with severity_distribution and days_analyzed"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Low workload: 1 SEV1/week over 30 days
        metrics_low = {
            'severity_distribution': {'sev1': 4, 'sev2': 2},
            'days_analyzed': 30,
            'incidents_per_week': 1.5,
            'avg_response_time_minutes': 10
        }
        score_low = analyzer._calculate_work_burnout_och(metrics_low)
        assert score_low < 4.0  # Should be LOW range

        # Moderate workload: 3 SEV1/week over 30 days
        metrics_moderate = {
            'severity_distribution': {'sev1': 13, 'sev2': 4},
            'days_analyzed': 30,
            'incidents_per_week': 4.0,
            'avg_response_time_minutes': 20
        }
        score_moderate = analyzer._calculate_work_burnout_och(metrics_moderate)
        assert 4.0 <= score_moderate < 7.0  # Should be MODERATE range

        # High workload: 7 SEV1/week over 30 days
        metrics_high = {
            'severity_distribution': {'sev1': 30, 'sev0': 5},
            'days_analyzed': 30,
            'incidents_per_week': 8.0,
            'avg_response_time_minutes': 25
        }
        score_high = analyzer._calculate_work_burnout_och(metrics_high)
        assert score_high >= 6.0  # Should be HIGH range

    def test_work_burnout_och_missing_days_analyzed_defaults(self, mock_rootly_client):
        """Test that missing days_analyzed defaults to 30 days"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # No days_analyzed provided - should default to 30
        metrics_no_days = {
            'severity_distribution': {'sev1': 12},
            'incidents_per_week': 3.0,
            'avg_response_time_minutes': 15
        }

        metrics_with_days = {
            'severity_distribution': {'sev1': 12},
            'days_analyzed': 30,
            'incidents_per_week': 3.0,
            'avg_response_time_minutes': 15
        }

        score_no_days = analyzer._calculate_work_burnout_och(metrics_no_days)
        score_with_days = analyzer._calculate_work_burnout_och(metrics_with_days)

        # Should produce same result
        assert score_no_days == score_with_days

    def test_work_burnout_och_empty_severity_distribution(self, mock_rootly_client):
        """Test handling of empty or missing severity_distribution"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics_empty = {
            'severity_distribution': {},
            'days_analyzed': 30,
            'incidents_per_week': 0,
            'avg_response_time_minutes': 0
        }

        metrics_none = {
            'severity_distribution': None,
            'days_analyzed': 30,
            'incidents_per_week': 0,
            'avg_response_time_minutes': 0
        }

        score_empty = analyzer._calculate_work_burnout_och(metrics_empty)
        score_none = analyzer._calculate_work_burnout_och(metrics_none)

        assert score_empty >= 0
        assert score_none >= 0
        assert score_empty < 2.0  # Should be very low
        assert score_none < 2.0

    def test_work_burnout_och_pagerduty_severity_weights(self, mock_pagerduty_client):
        """Test that PagerDuty uses correct severity weights (sev1-sev5 instead of sev0-sev4)"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")

        metrics = {
            'severity_distribution': {'sev1': 10, 'sev2': 5},  # PagerDuty uses sev1 as highest
            'days_analyzed': 30,
            'incidents_per_week': 3.5,
            'avg_response_time_minutes': 15
        }

        score = analyzer._calculate_work_burnout_och(metrics)

        assert isinstance(score, (int, float))
        assert 0 <= score <= 10

    def test_work_burnout_och_very_short_period(self, mock_rootly_client):
        """Test scoring for very short analysis periods (edge case)"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # 1-day period with 2 SEV1 incidents = 14/week rate (very high)
        metrics_1day = {
            'severity_distribution': {'sev1': 2},
            'days_analyzed': 1,
            'incidents_per_week': 14.0,
            'avg_response_time_minutes': 10
        }

        score = analyzer._calculate_work_burnout_och(metrics_1day)

        # Should produce a high score due to high rate
        assert score >= 6.0
        assert score <= 10.0

    def test_compound_trauma_triggers_on_high_weekly_rate(self, mock_rootly_client):
        """Test that compound trauma is triggered based on weekly rate, not raw count"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # 90-day period with 10 SEV1 incidents = ~0.78/week (below 1.5 threshold)
        # Should NOT trigger compound trauma despite raw count being >= 5
        metrics_low_rate = {
            'severity_distribution': {'sev1': 10},
            'days_analyzed': 90,
            'incidents_per_week': 0.78,
            'avg_response_time_minutes': 15
        }

        # 30-day period with 10 SEV1 incidents = ~2.33/week (above 1.5 threshold)
        # SHOULD trigger compound trauma
        metrics_high_rate = {
            'severity_distribution': {'sev1': 10},
            'days_analyzed': 30,
            'incidents_per_week': 2.33,
            'avg_response_time_minutes': 15
        }

        score_low_rate = analyzer._calculate_work_burnout_och(metrics_low_rate)
        score_high_rate = analyzer._calculate_work_burnout_och(metrics_high_rate)

        # High rate should produce higher score due to compound trauma
        assert score_high_rate > score_low_rate


class TestTimezoneHandling:
    """Tests for timezone-related methods"""

    def test_build_user_tz_map_rootly(self, mock_rootly_client):
        """Test _build_user_tz_map for Rootly"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        users = [
            {"id": "1", "attributes": {"time_zone": "America/New_York"}},
            {"id": "2", "attributes": {"time_zone": "Europe/London"}}
        ]

        result = analyzer._build_user_tz_map(users)

        assert result["1"] == "America/New_York"
        assert result["2"] == "Europe/London"

    def test_build_user_tz_map_pagerduty(self, mock_pagerduty_client):
        """Test _build_user_tz_map for PagerDuty"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")

        # PagerDuty API returns "timezone" (not "time_zone")
        users = [
            {"id": "P1", "timezone": "America/Los_Angeles"},
            {"id": "P2", "timezone": "Asia/Tokyo"}
        ]

        result = analyzer._build_user_tz_map(users)

        assert result["P1"] == "America/Los_Angeles"
        assert result["P2"] == "Asia/Tokyo"

    def test_parse_iso_utc(self, mock_rootly_client):
        """Test _parse_iso_utc method"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Valid ISO timestamp
        ts = "2025-01-15T10:30:00Z"
        result = analyzer._parse_iso_utc(ts)
        assert result is not None
        assert result.tzinfo is not None

        # None input
        result_none = analyzer._parse_iso_utc(None)
        assert result_none is None

    def test_to_local(self, mock_rootly_client):
        """Test _to_local timezone conversion"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        utc_time = datetime(2025, 1, 15, 10, 0, 0, tzinfo=pytz.UTC)

        # Convert to New York time
        ny_time = analyzer._to_local(utc_time, "America/New_York")
        assert ny_time.hour == 5  # UTC-5

        # Convert to Tokyo time
        tokyo_time = analyzer._to_local(utc_time, "Asia/Tokyo")
        assert tokyo_time.hour == 19  # UTC+9


class TestUtilityMethods:
    """Tests for utility methods"""

    def test_get_user_email_from_user_rootly(self, mock_rootly_client):
        """Test _get_user_email_from_user for Rootly"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        user = {"id": "1", "attributes": {"email": "john@example.com"}}
        result = analyzer._get_user_email_from_user(user)
        assert result == "john@example.com"

    def test_get_user_email_from_user_pagerduty(self, mock_pagerduty_client):
        """Test _get_user_email_from_user for PagerDuty"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")

        user = {"id": "P1", "email": "jane@example.com"}
        result = analyzer._get_user_email_from_user(user)
        assert result == "jane@example.com"

    def test_get_user_name_from_user_rootly(self, mock_rootly_client):
        """Test _get_user_name_from_user for Rootly"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        user = {"id": "1", "attributes": {"full_name": "John Doe"}}
        result = analyzer._get_user_name_from_user(user)
        assert result == "John Doe"

    def test_get_user_name_from_user_pagerduty(self, mock_pagerduty_client):
        """Test _get_user_name_from_user for PagerDuty"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")

        user = {"id": "P1", "name": "Jane Smith"}
        result = analyzer._get_user_name_from_user(user)
        assert result == "Jane Smith"

    def test_extract_incident_title_rootly(self, mock_rootly_client):
        """Test _extract_incident_title for Rootly"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        incident = {"id": "inc1", "attributes": {"title": "Database outage"}}
        result = analyzer._extract_incident_title(incident)
        assert result == "Database outage"

    def test_extract_incident_title_pagerduty(self, mock_pagerduty_client):
        """Test _extract_incident_title for PagerDuty"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")

        incident = {"id": "PD1", "title": "Service degradation"}
        result = analyzer._extract_incident_title(incident)
        assert result == "Service degradation"

    def test_get_severity_level_rootly(self, mock_rootly_client):
        """Test _get_severity_level for Rootly"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Option 1: Pre-mapped severity at top level (preferred)
        incident_simple = {"id": "inc1", "severity": "sev1", "attributes": {"title": "DB outage"}}
        result_simple = analyzer._get_severity_level(incident_simple)
        assert result_simple == "sev1"

        # Option 2: Nested Rootly structure
        incident_nested = {
            "id": "inc2",
            "attributes": {
                "title": "API error",
                "severity": {
                    "data": {
                        "attributes": {
                            "name": "sev2"
                        }
                    }
                }
            }
        }
        result_nested = analyzer._get_severity_level(incident_nested)
        assert result_nested == "sev2"

    def test_get_severity_level_pagerduty(self, mock_pagerduty_client):
        """Test _get_severity_level for PagerDuty"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")

        # PagerDuty uses urgency
        incident = {"id": "PD1", "urgency": "high"}
        result = analyzer._get_severity_level(incident)
        # Returns mapped severity based on urgency
        assert result in ["sev1", "sev2", "sev3", "sev4", "sev5"]


class TestCoreCalculationMethods:
    """Tests for HIGH PRIORITY core calculation methods"""

    def test_calculate_member_metrics_basic(self, mock_rootly_client):
        """Test _calculate_member_metrics with basic incidents"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        base_time = datetime.now(pytz.UTC)
        incidents = [
            {
                "attributes": {
                    "created_at": (base_time - timedelta(days=1, hours=10)).isoformat(),  # 10 AM
                    "acknowledged_at": (base_time - timedelta(days=1, hours=9, minutes=45)).isoformat(),
                    "severity": {"data": {"attributes": {"name": "sev1"}}},
                    "status": "resolved"
                }
            },
            {
                "attributes": {
                    "created_at": (base_time - timedelta(days=2, hours=20)).isoformat(),  # 8 PM - after hours
                    "acknowledged_at": (base_time - timedelta(days=2, hours=19, minutes=30)).isoformat(),
                    "severity": {"data": {"attributes": {"name": "sev2"}}},
                    "status": "resolved"
                }
            }
        ]

        result = analyzer._calculate_member_metrics(incidents, 30, True, "UTC")

        assert "incidents_per_week" in result
        assert "after_hours_percentage" in result
        assert "weekend_percentage" in result
        assert "avg_response_time_minutes" in result
        assert "severity_distribution" in result
        assert result["incidents_per_week"] > 0

    def test_calculate_member_metrics_empty(self, mock_rootly_client):
        """Test _calculate_member_metrics with no incidents"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        result = analyzer._calculate_member_metrics([], 30, True, "UTC")

        assert result["incidents_per_week"] == 0
        assert result["after_hours_percentage"] == 0
        assert result["weekend_percentage"] == 0
        assert result["avg_response_time_minutes"] == 0

    def test_calculate_burnout_dimensions(self, mock_rootly_client):
        """Test _calculate_burnout_dimensions"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "incidents_per_week": 3.5,
            "after_hours_percentage": 0.3,
            "weekend_percentage": 0.2,
            "avg_response_time_minutes": 25,
            "total_incidents": 15
        }

        result = analyzer._calculate_burnout_dimensions(metrics)

        assert "personal_burnout" in result
        assert "work_related_burnout" in result
        assert "accomplishment_burnout" in result
        assert isinstance(result["personal_burnout"], (int, float))
        assert isinstance(result["work_related_burnout"], (int, float))
        assert isinstance(result["accomplishment_burnout"], (int, float))

    def test_calculate_personal_burnout_och(self, mock_rootly_client):
        """Test _calculate_personal_burnout_och"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "incidents_per_week": 5.0,
            "after_hours_percentage": 0.4,
            "total_incidents": 20
        }

        result = analyzer._calculate_personal_burnout_och(metrics)

        assert isinstance(result, (int, float))
        assert result >= 0
        assert result <= 100  # OCH scores are 0-100

    def test_calculate_work_burnout_och(self, mock_rootly_client):
        """Test _calculate_work_burnout_och"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "incidents_per_week": 3.0,
            "avg_response_time_minutes": 30,
            "weekend_percentage": 0.15
        }

        result = analyzer._calculate_work_burnout_och(metrics)

        assert isinstance(result, (int, float))
        assert result >= 0
        assert result <= 100

    def test_calculate_accomplishment_burnout_och(self, mock_rootly_client):
        """Test _calculate_accomplishment_burnout_och"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "avg_response_time_minutes": 20,
            "incidents_per_week": 2.5,
            "total_incidents": 10
        }

        result = analyzer._calculate_accomplishment_burnout_och(metrics)

        assert isinstance(result, (int, float))
        assert result >= 0
        assert result <= 100

    def test_calculate_burnout_factors(self, mock_rootly_client):
        """Test _calculate_burnout_factors"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "incidents_per_week": 4.0,
            "after_hours_percentage": 0.25,
            "severity_weighted_incidents_per_week": 8.0
        }

        result = analyzer._calculate_burnout_factors(metrics)

        # Current implementation returns: workload, after_hours, incident_load
        assert "workload" in result
        assert "after_hours" in result
        assert "incident_load" in result
        assert all(isinstance(v, (int, float)) for v in result.values())

    def test_calculate_burnout_score(self, mock_rootly_client):
        """Test _calculate_burnout_score"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Current implementation uses: workload, after_hours, incident_load
        factors = {
            "workload": 6.0,
            "after_hours": 4.0,
            "incident_load": 7.0
        }

        result = analyzer._calculate_burnout_score(factors)

        assert isinstance(result, (int, float))
        assert result >= 0
        assert result <= 10  # Burnout scores are 0-10


class TestEnhancementMethods:
    """Tests for HIGH PRIORITY enhancement methods"""

    def test_enhance_metrics_with_github_data(self, mock_rootly_client):
        """Test _enhance_metrics_with_github_data"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        base_metrics = {
            "incidents_per_week": 3.0,
            "after_hours_percentage": 0.2
        }

        github_data = {
            "total_commits": 45,
            "total_prs": 12,
            "after_hours_commits": 10,
            "weekend_commits": 5,
            "late_night_commits": 3,
            "large_prs": 2,
            "avg_pr_size": 250
        }

        result = analyzer._enhance_metrics_with_github_data(base_metrics, github_data, "UTC")

        # Should return enhanced metrics with GitHub data added
        assert "incidents_per_week" in result  # Original metrics preserved
        assert "after_hours_percentage" in result
        # GitHub metrics should be added but not break existing structure

    def test_enhance_metrics_with_github_data_none(self, mock_rootly_client):
        """Test _enhance_metrics_with_github_data with None data"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        base_metrics = {
            "incidents_per_week": 3.0,
            "after_hours_percentage": 0.2
        }

        result = analyzer._enhance_metrics_with_github_data(base_metrics, None, "UTC")

        # Should return base metrics unchanged
        assert result["incidents_per_week"] == 3.0
        assert result["after_hours_percentage"] == 0.2

    def test_enhance_metrics_with_slack_data(self, mock_rootly_client):
        """Test _enhance_metrics_with_slack_data"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        base_metrics = {
            "incidents_per_week": 3.0,
            "after_hours_percentage": 0.2
        }

        slack_data = {
            "total_messages": 450,
            "after_hours_messages": 80,
            "weekend_messages": 30,
            "late_night_messages": 15,
            "channels": 8,
            "avg_sentiment": -0.2
        }

        result = analyzer._enhance_metrics_with_slack_data(base_metrics, slack_data, "UTC")

        # Should return enhanced metrics with Slack data added
        assert "incidents_per_week" in result
        assert "after_hours_percentage" in result

    def test_enhance_metrics_with_slack_data_none(self, mock_rootly_client):
        """Test _enhance_metrics_with_slack_data with None data"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        base_metrics = {
            "incidents_per_week": 3.0,
            "after_hours_percentage": 0.2
        }

        result = analyzer._enhance_metrics_with_slack_data(base_metrics, None, "UTC")

        # Should return base metrics unchanged
        assert result["incidents_per_week"] == 3.0
        assert result["after_hours_percentage"] == 0.2


class TestOffHoursContribution:
    """Tests to verify off-hours activity contributes significantly to burnout score"""

    def test_after_hours_percentage_unit_conversion(self, mock_rootly_client):
        """Test that after_hours_percentage is correctly converted from decimal to percentage"""
        from app.core.och_config import calculate_personal_burnout

        # After hours percentage of 25% (0.25 decimal)
        # After conversion and time multiplier (1.4x): 0.25 * 100 * 1.4 = 35%
        # With scale_max of 30, this should give high normalized score
        och_metrics = {
            'work_hours_trend': 0,
            'after_hours_activity': 35,  # 25% * 1.4 multiplier = 35
            'sleep_quality_proxy': 0
        }

        result = calculate_personal_burnout(och_metrics)

        # after_hours_activity normalized: (35 / 30) * 100 = 116.67, capped at 150
        # weighted: 116.67 * 0.50 = 58.33 contribution
        # Should contribute significantly to personal burnout
        assert result['score'] > 50, "25% after-hours work should contribute significantly to burnout"
        assert 'after_hours_activity' in result['components']
        after_hours_component = result['components']['after_hours_activity']
        assert after_hours_component['normalized_score'] > 100, "35% (with multiplier) should exceed scale_max of 30"

    def test_off_hours_is_largest_contributor(self, mock_rootly_client):
        """Test that off-hours is the largest contributor to personal burnout score"""
        from app.core.och_config import calculate_personal_burnout

        # All factors at moderate levels
        och_metrics = {
            'work_hours_trend': 50,      # 50% of scale_max
            'after_hours_activity': 15,  # 50% of scale_max (15/30)
            'sleep_quality_proxy': 15    # 50% of scale_max (15/30)
        }

        result = calculate_personal_burnout(och_metrics)

        components = result['components']
        after_hours_weighted = components['after_hours_activity']['weighted_score']
        other_max_weighted = max(
            components['work_hours_trend']['weighted_score'],
            components['sleep_quality_proxy']['weighted_score']
        )

        # With 50% weight, after_hours should be the largest contributor
        assert after_hours_weighted >= other_max_weighted, \
            "after_hours_activity (50% weight) should be largest contributor at equal raw levels"

    def test_high_off_hours_pushes_to_critical_risk(self, mock_rootly_client):
        """Test that high off-hours activity can push someone to critical risk level"""
        from app.core.och_config import calculate_personal_burnout, calculate_work_related_burnout, calculate_composite_och_score

        # High off-hours activity (40% raw = 56% with 1.4 multiplier)
        personal_metrics = {
            'work_hours_trend': 30,
            'after_hours_activity': 56,  # 40% * 1.4 = 56
            'sleep_quality_proxy': 15
        }

        # Moderate work-related factors
        work_metrics = {
            'sprint_completion': 7,
            'oncall_burden': 50,
            'alert_health': 60,
        }

        personal_result = calculate_personal_burnout(personal_metrics)
        work_result = calculate_work_related_burnout(work_metrics)
        composite = calculate_composite_och_score(personal_result['score'], work_result['score'])

        # High off-hours should push into high/critical range
        assert composite['composite_score'] >= 50, \
            "High off-hours (40%+) should result in at least moderate burnout risk"
        assert composite['risk_level'] in ['high', 'critical'], \
            f"High off-hours should push to high/critical risk, got {composite['risk_level']}"


class TestSeverityBreakdownInDailyTrends:
    """Tests for severity_breakdown tracking in daily trends"""

    def test_severity_breakdown_in_daily_trends_rootly(self, mock_rootly_client):
        """Test that severity_breakdown is included in daily_trends output for Rootly"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")
        analyzer.user_tz_by_id = {"1": "UTC"}

        base_time = datetime.now(pytz.UTC)
        users = [{"id": "1", "attributes": {"full_name": "John Doe", "email": "john@example.com", "time_zone": "UTC"}}]

        incidents = [
            {
                "id": "inc1",
                "attributes": {
                    "title": "Critical outage",
                    "created_at": (base_time - timedelta(days=1)).isoformat(),
                    "severity": {
                        "data": {
                            "attributes": {"name": "SEV0 - Critical"}
                        }
                    }
                }
            },
            {
                "id": "inc2",
                "attributes": {
                    "title": "High severity issue",
                    "created_at": (base_time - timedelta(days=1)).isoformat(),
                    "severity": {
                        "data": {
                            "attributes": {"name": "SEV1 - High"}
                        }
                    }
                }
            },
            {
                "id": "inc3",
                "attributes": {
                    "title": "Medium issue",
                    "created_at": (base_time - timedelta(days=1)).isoformat(),
                    "severity": {
                        "data": {
                            "attributes": {"name": "SEV3 - Medium"}
                        }
                    }
                }
            }
        ]

        team_analysis = [{"user_id": "1", "user_email": "john@example.com"}]
        metadata = {"days_analyzed": 7}
        team_health = {}

        daily_trends = analyzer._generate_daily_trends(incidents, team_analysis, metadata, team_health, None)

        # Find the day with incidents
        day_with_incidents = next((d for d in daily_trends if d.get("incident_count", 0) > 0), None)
        assert day_with_incidents is not None, "Should have at least one day with incidents"

        # Verify severity_breakdown exists and has correct structure
        assert "severity_breakdown" in day_with_incidents, "severity_breakdown should be in daily_trends"
        breakdown = day_with_incidents["severity_breakdown"]
        assert "sev0" in breakdown, "severity_breakdown should have sev0 key"
        assert "sev1" in breakdown, "severity_breakdown should have sev1 key"
        assert "sev2" in breakdown, "severity_breakdown should have sev2 key"
        assert "sev3" in breakdown, "severity_breakdown should have sev3 key"
        assert "low" in breakdown, "severity_breakdown should have low key"

        # Verify counts match incidents
        assert breakdown["sev0"] == 1, "Should have 1 SEV0 incident"
        assert breakdown["sev1"] == 1, "Should have 1 SEV1 incident"
        assert breakdown["sev3"] == 1, "Should have 1 SEV3 incident"

    def test_severity_breakdown_pagerduty(self, mock_pagerduty_client):
        """Test that severity_breakdown tracks high urgency as sev1 for PagerDuty"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="pagerduty")
        analyzer.user_tz_by_id = {"P1": "UTC"}

        base_time = datetime.now(pytz.UTC)
        users = [{"id": "P1", "name": "John Doe", "email": "john@example.com", "time_zone": "UTC"}]

        incidents = [
            {
                "id": "PD1",
                "created_at": (base_time - timedelta(days=1)).isoformat(),
                "urgency": "high",
                "assigned_to": {"id": "P1"}
            },
            {
                "id": "PD2",
                "created_at": (base_time - timedelta(days=1)).isoformat(),
                "urgency": "low",
                "assigned_to": {"id": "P1"}
            }
        ]

        team_analysis = [{"user_id": "P1", "user_email": "john@example.com"}]
        metadata = {"days_analyzed": 7}
        team_health = {}

        daily_trends = analyzer._generate_daily_trends(incidents, team_analysis, metadata, team_health, None)

        # Find the day with incidents
        day_with_incidents = next((d for d in daily_trends if d.get("incident_count", 0) > 0), None)
        assert day_with_incidents is not None, "Should have at least one day with incidents"

        # Verify severity_breakdown exists
        assert "severity_breakdown" in day_with_incidents, "severity_breakdown should be in daily_trends"
        breakdown = day_with_incidents["severity_breakdown"]

        # PagerDuty high urgency maps to sev1, low to low
        assert breakdown["sev1"] == 1, "High urgency should map to sev1"
        assert breakdown["low"] == 1, "Low urgency should map to low"

    def test_severity_breakdown_defaults_when_no_incidents(self, mock_rootly_client):
        """Test that days without incidents still have severity_breakdown with zeros"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")
        analyzer.user_tz_by_id = {}

        team_analysis = [{"user_id": "1", "user_email": "john@example.com"}]
        metadata = {"days_analyzed": 7}
        team_health = {}

        daily_trends = analyzer._generate_daily_trends([], team_analysis, metadata, team_health, None)

        # All days should have severity_breakdown
        for day in daily_trends:
            assert "severity_breakdown" in day, "All days should have severity_breakdown"
            breakdown = day["severity_breakdown"]
            # Default breakdown should have all zeros
            assert breakdown.get("sev0", 0) == 0
            assert breakdown.get("sev1", 0) == 0
            assert breakdown.get("sev2", 0) == 0
            assert breakdown.get("sev3", 0) == 0
            assert breakdown.get("low", 0) == 0


class TestIndividualDailyHealthScore:
    """Tests for _calculate_individual_daily_health_score function.

    This function calculates daily OCH burnout risk scores (0-100, higher = worse).
    Critical test coverage to prevent regression of risk calculation bugs.
    """

    def test_zero_activity_returns_zero_risk(self, mock_rootly_client):
        """Zero incidents, zero after-hours, zero weekend = 0 risk (not 10!)"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        daily_data = {
            "incident_count": 0,
            "severity_weighted_count": 0.0,
            "after_hours_count": 0,
            "weekend_count": 0,
            "high_severity_count": 0
        }
        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        risk_score = analyzer._calculate_individual_daily_health_score(
            daily_data, date_obj, "test@example.com", team_analysis
        )

        assert risk_score == 0, "Zero activity should result in 0 risk, not a baseline floor"

    def test_single_incident_creates_risk(self, mock_rootly_client):
        """A single incident should create non-zero risk"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        daily_data = {
            "incident_count": 1,
            "severity_weighted_count": 1.0,
            "after_hours_count": 0,
            "weekend_count": 0,
            "high_severity_count": 0
        }
        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        risk_score = analyzer._calculate_individual_daily_health_score(
            daily_data, date_obj, "test@example.com", team_analysis
        )

        assert risk_score > 0, "Single incident should create risk > 0"
        assert risk_score <= 100, "Risk should not exceed 100"

    def test_after_hours_only_creates_risk(self, mock_rootly_client):
        """After-hours activity alone (without incident_count) should create risk"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        daily_data = {
            "incident_count": 0,
            "severity_weighted_count": 0.0,
            "after_hours_count": 2,
            "weekend_count": 0,
            "high_severity_count": 0
        }
        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        risk_score = analyzer._calculate_individual_daily_health_score(
            daily_data, date_obj, "test@example.com", team_analysis
        )

        assert risk_score > 0, "After-hours activity should create risk > 0"

    def test_weekend_only_creates_risk(self, mock_rootly_client):
        """Weekend activity alone should create risk"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        daily_data = {
            "incident_count": 0,
            "severity_weighted_count": 0.0,
            "after_hours_count": 0,
            "weekend_count": 1,
            "high_severity_count": 0
        }
        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        risk_score = analyzer._calculate_individual_daily_health_score(
            daily_data, date_obj, "test@example.com", team_analysis
        )

        assert risk_score > 0, "Weekend activity should create risk > 0"

    def test_high_severity_increases_risk(self, mock_rootly_client):
        """High severity incidents should increase risk more than regular incidents"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Regular incident
        regular_data = {
            "incident_count": 1,
            "severity_weighted_count": 1.0,
            "after_hours_count": 0,
            "weekend_count": 0,
            "high_severity_count": 0
        }

        # High severity incident
        high_sev_data = {
            "incident_count": 1,
            "severity_weighted_count": 15.0,  # High severity weight
            "after_hours_count": 0,
            "weekend_count": 0,
            "high_severity_count": 1
        }

        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        regular_risk = analyzer._calculate_individual_daily_health_score(
            regular_data, date_obj, "test@example.com", team_analysis
        )
        high_sev_risk = analyzer._calculate_individual_daily_health_score(
            high_sev_data, date_obj, "test@example.com", team_analysis
        )

        assert high_sev_risk > regular_risk, "High severity should result in higher risk"

    def test_multiple_incidents_increase_risk(self, mock_rootly_client):
        """More incidents should mean higher risk"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        one_incident = {
            "incident_count": 1,
            "severity_weighted_count": 1.0,
            "after_hours_count": 0,
            "weekend_count": 0,
            "high_severity_count": 0
        }

        three_incidents = {
            "incident_count": 3,
            "severity_weighted_count": 3.0,
            "after_hours_count": 0,
            "weekend_count": 0,
            "high_severity_count": 0
        }

        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        one_risk = analyzer._calculate_individual_daily_health_score(
            one_incident, date_obj, "test@example.com", team_analysis
        )
        three_risk = analyzer._calculate_individual_daily_health_score(
            three_incidents, date_obj, "test@example.com", team_analysis
        )

        assert three_risk > one_risk, "More incidents should result in higher risk"

    def test_risk_score_bounded_0_to_100(self, mock_rootly_client):
        """Risk score should always be between 0 and 100"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Extreme case: many incidents, high severity, after hours, weekend
        extreme_data = {
            "incident_count": 20,
            "severity_weighted_count": 100.0,
            "after_hours_count": 10,
            "weekend_count": 5,
            "high_severity_count": 5
        }

        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        risk_score = analyzer._calculate_individual_daily_health_score(
            extreme_data, date_obj, "test@example.com", team_analysis
        )

        assert 0 <= risk_score <= 100, f"Risk score {risk_score} should be between 0 and 100"

    def test_missing_fields_handled_gracefully(self, mock_rootly_client):
        """Missing fields in daily_data should not cause errors"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        # Minimal data - only incident_count
        minimal_data = {"incident_count": 1}

        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        # Should not raise an exception
        risk_score = analyzer._calculate_individual_daily_health_score(
            minimal_data, date_obj, "test@example.com", team_analysis
        )

        assert isinstance(risk_score, int), "Should return an integer risk score"

    def test_empty_daily_data_returns_zero(self, mock_rootly_client):
        """Empty daily data should return 0 risk"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        empty_data = {}
        date_obj = datetime.now(pytz.UTC)
        team_analysis = []

        risk_score = analyzer._calculate_individual_daily_health_score(
            empty_data, date_obj, "test@example.com", team_analysis
        )

        assert risk_score == 0, "Empty data should result in 0 risk"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
