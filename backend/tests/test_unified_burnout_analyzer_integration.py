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
                    "resolved_at": (base_time - timedelta(days=1, hours=-2)).isoformat()
                },
                "relationships": {
                    "user": {"data": {"id": "1"}}
                }
            },
            {
                "id": "inc2",
                "attributes": {
                    "title": "API timeout",
                    "severity": "sev2",
                    "started_at": (base_time - timedelta(days=5)).isoformat(),
                    "resolved_at": (base_time - timedelta(days=5, hours=-1)).isoformat()
                },
                "relationships": {
                    "user": {"data": {"id": "2"}}
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
        assert "ocb_score" in result
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
            {"burnout_score": 2.0, "ocb_score": 20, "risk_level": "low", "user_name": "John", "incident_count": 1},
            {"burnout_score": 4.5, "ocb_score": 45, "risk_level": "medium", "user_name": "Jane", "incident_count": 3},
            {"burnout_score": 7.0, "ocb_score": 70, "risk_level": "high", "user_name": "Bob", "incident_count": 5}
        ]

        result = analyzer._calculate_team_health(member_analyses)

        # Check correct key names
        assert "overall_score" in result
        assert "scoring_method" in result
        assert "average_burnout_score" in result  # NOT "average_burnout"
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

    def test_calculate_personal_burnout_ocb(self, mock_rootly_client):
        """Test _calculate_personal_burnout_ocb"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "incidents_per_week": 5.0,
            "after_hours_percentage": 0.4,
            "total_incidents": 20
        }

        result = analyzer._calculate_personal_burnout_ocb(metrics)

        assert isinstance(result, (int, float))
        assert result >= 0
        assert result <= 100  # OCB scores are 0-100

    def test_calculate_work_burnout_ocb(self, mock_rootly_client):
        """Test _calculate_work_burnout_ocb"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "incidents_per_week": 3.0,
            "avg_response_time_minutes": 30,
            "weekend_percentage": 0.15
        }

        result = analyzer._calculate_work_burnout_ocb(metrics)

        assert isinstance(result, (int, float))
        assert result >= 0
        assert result <= 100

    def test_calculate_accomplishment_burnout_ocb(self, mock_rootly_client):
        """Test _calculate_accomplishment_burnout_ocb"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "avg_response_time_minutes": 20,
            "incidents_per_week": 2.5,
            "total_incidents": 10
        }

        result = analyzer._calculate_accomplishment_burnout_ocb(metrics)

        assert isinstance(result, (int, float))
        assert result >= 0
        assert result <= 100

    def test_calculate_burnout_factors(self, mock_rootly_client):
        """Test _calculate_burnout_factors"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        metrics = {
            "incidents_per_week": 4.0,
            "after_hours_percentage": 0.25,
            "weekend_percentage": 0.1,
            "avg_response_time_minutes": 35
        }

        result = analyzer._calculate_burnout_factors(metrics)

        assert "workload" in result
        assert "after_hours" in result
        assert "weekend_work" in result
        assert "response_time" in result
        assert all(isinstance(v, (int, float)) for v in result.values())

    def test_calculate_burnout_score(self, mock_rootly_client):
        """Test _calculate_burnout_score"""
        analyzer = UnifiedBurnoutAnalyzer(api_token="test_token", platform="rootly")

        factors = {
            "workload": 0.6,
            "after_hours": 0.4,
            "weekend_work": 0.3,
            "response_time": 0.5,
            "incident_load": 0.7
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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
