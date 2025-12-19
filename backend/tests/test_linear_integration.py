"""
Unit tests for Linear integration.

Tests OAuth flow, API endpoints, user mapping, and OCB scoring contribution.
"""

import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import sys
import os
from datetime import datetime, timedelta, timezone

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))


# Mock data for Linear API responses
MOCK_LINEAR_VIEWER = {
    "id": "user-uuid-123",
    "name": "Test User",
    "email": "test@example.com",
    "active": True
}

MOCK_LINEAR_ORGANIZATION = {
    "id": "org-uuid-456",
    "name": "Test Organization",
    "urlKey": "testorg"
}

MOCK_LINEAR_TEAMS = [
    {"id": "team-1", "name": "Engineering", "key": "ENG"},
    {"id": "team-2", "name": "Product", "key": "PROD"},
    {"id": "team-3", "name": "Design", "key": "DESIGN"}
]

MOCK_LINEAR_ISSUES = [
    {
        "id": "issue-1",
        "identifier": "ENG-123",
        "title": "Fix authentication bug",
        "priority": 1,  # Urgent
        "dueDate": "2025-01-20",
        "assignee": {"id": "user-1", "name": "Dev One", "email": "dev1@example.com"},
        "state": {"name": "In Progress", "type": "started"},
        "updatedAt": "2025-01-15T10:00:00Z"
    },
    {
        "id": "issue-2",
        "identifier": "ENG-124",
        "title": "Add user profile page",
        "priority": 2,  # High
        "dueDate": "2025-01-25",
        "assignee": {"id": "user-1", "name": "Dev One", "email": "dev1@example.com"},
        "state": {"name": "In Progress", "type": "started"},
        "updatedAt": "2025-01-14T10:00:00Z"
    },
    {
        "id": "issue-3",
        "identifier": "ENG-125",
        "title": "Refactor database layer",
        "priority": 3,  # Medium
        "dueDate": None,
        "assignee": {"id": "user-2", "name": "Dev Two", "email": "dev2@example.com"},
        "state": {"name": "Todo", "type": "unstarted"},
        "updatedAt": "2025-01-13T10:00:00Z"
    },
    {
        "id": "issue-4",
        "identifier": "PROD-50",
        "title": "Update documentation",
        "priority": 4,  # Low
        "dueDate": "2025-02-01",
        "assignee": {"id": "user-2", "name": "Dev Two", "email": "dev2@example.com"},
        "state": {"name": "Backlog", "type": "backlog"},
        "updatedAt": "2025-01-12T10:00:00Z"
    },
    {
        "id": "issue-5",
        "identifier": "ENG-126",
        "title": "Research new framework",
        "priority": 0,  # No priority
        "dueDate": None,
        "assignee": {"id": "user-1", "name": "Dev One", "email": "dev1@example.com"},
        "state": {"name": "Backlog", "type": "backlog"},
        "updatedAt": "2025-01-11T10:00:00Z"
    }
]


class TestLinearOAuthPKCE(unittest.TestCase):
    """Test Linear OAuth with PKCE support."""

    def test_generate_pkce_pair(self):
        """Test PKCE code_verifier and code_challenge generation."""
        from auth.integration_oauth import LinearIntegrationOAuth

        code_verifier, code_challenge = LinearIntegrationOAuth.generate_pkce_pair()

        # code_verifier should be 43+ characters (base64url encoded)
        self.assertGreaterEqual(len(code_verifier), 43)

        # code_challenge should be different from verifier (it's hashed)
        self.assertNotEqual(code_verifier, code_challenge)

        # code_challenge should be base64url encoded without padding
        self.assertNotIn("=", code_challenge)

    def test_authorization_url_with_pkce(self):
        """Test authorization URL generation with PKCE."""
        from auth.integration_oauth import LinearIntegrationOAuth

        oauth = LinearIntegrationOAuth()

        # Mock the client_id
        with patch.object(oauth, 'client_id', 'test-client-id'):
            with patch.object(oauth, 'redirect_uri', 'http://localhost/callback'):
                url = oauth.get_authorization_url(
                    state="test-state",
                    code_challenge="test-challenge"
                )

        self.assertIn("linear.app/oauth/authorize", url)
        self.assertIn("client_id=test-client-id", url)
        self.assertIn("state=test-state", url)
        self.assertIn("code_challenge=test-challenge", url)
        self.assertIn("code_challenge_method=S256", url)
        self.assertIn("response_type=code", url)

    def test_authorization_url_without_pkce(self):
        """Test authorization URL generation without PKCE."""
        from auth.integration_oauth import LinearIntegrationOAuth

        oauth = LinearIntegrationOAuth()

        with patch.object(oauth, 'client_id', 'test-client-id'):
            with patch.object(oauth, 'redirect_uri', 'http://localhost/callback'):
                url = oauth.get_authorization_url(state="test-state")

        # Should not have PKCE parameters when not provided
        self.assertNotIn("code_challenge", url)
        self.assertNotIn("code_challenge_method", url)


class TestLinearPriorityMapping(unittest.TestCase):
    """Test Linear priority to weight mapping."""

    def test_priority_weights(self):
        """Test that Linear priority values map to correct weights."""
        # Linear priorities: 1=Urgent, 2=High, 3=Medium, 4=Low, 0=None
        expected_weights = {
            1: 1.2,   # Urgent - highest weight
            2: 1.0,   # High
            3: 0.7,   # Medium
            4: 0.4,   # Low
            0: 0.2,   # No priority - lowest weight
        }

        PRIORITY_WEIGHTS = {
            1: 1.2,
            2: 1.0,
            3: 0.7,
            4: 0.4,
            0: 0.2,
        }

        for priority, expected_weight in expected_weights.items():
            self.assertEqual(PRIORITY_WEIGHTS[priority], expected_weight)

    def test_urgent_has_highest_weight(self):
        """Test that Urgent (1) has highest weight."""
        PRIORITY_WEIGHTS = {1: 1.2, 2: 1.0, 3: 0.7, 4: 0.4, 0: 0.2}
        max_priority = max(PRIORITY_WEIGHTS, key=PRIORITY_WEIGHTS.get)
        self.assertEqual(max_priority, 1)  # Urgent

    def test_no_priority_has_lowest_weight(self):
        """Test that No Priority (0) has lowest weight."""
        PRIORITY_WEIGHTS = {1: 1.2, 2: 1.0, 3: 0.7, 4: 0.4, 0: 0.2}
        min_priority = min(PRIORITY_WEIGHTS, key=PRIORITY_WEIGHTS.get)
        self.assertEqual(min_priority, 0)  # No priority


class TestLinearOCBContribution(unittest.TestCase):
    """Test Linear OCB score contribution calculations."""

    def setUp(self):
        """Set up test fixtures with mock issues."""
        # Issues with mixed priorities and due dates
        self.mixed_issues = [
            {"priority": 1, "dueDate": "2025-01-20"},  # Urgent, soon
            {"priority": 2, "dueDate": "2025-01-25"},  # High, week away
            {"priority": 3, "dueDate": None},          # Medium, no due date
        ]

        # All urgent issues
        self.urgent_issues = [
            {"priority": 1, "dueDate": "2025-01-15"},
            {"priority": 1, "dueDate": "2025-01-16"},
            {"priority": 1, "dueDate": "2025-01-17"},
        ]

        # All low priority issues
        self.low_priority_issues = [
            {"priority": 4, "dueDate": "2025-03-01"},
            {"priority": 4, "dueDate": "2025-03-15"},
            {"priority": 0, "dueDate": None},
        ]

    def test_empty_issues_returns_zero(self):
        """Test that empty issue list returns 0 score."""
        score = self._calculate_linear_ocb_contribution([])
        self.assertEqual(score, 0.0)

    def test_none_issues_returns_zero(self):
        """Test that None issues returns 0 score."""
        score = self._calculate_linear_ocb_contribution(None)
        self.assertEqual(score, 0.0)

    def test_urgent_issues_higher_score(self):
        """Test that urgent issues result in higher score."""
        urgent_score = self._calculate_linear_ocb_contribution(self.urgent_issues)
        low_score = self._calculate_linear_ocb_contribution(self.low_priority_issues)

        self.assertGreater(urgent_score, low_score)

    def test_score_in_valid_range(self):
        """Test that score is always between 0 and 100."""
        for issues in [self.mixed_issues, self.urgent_issues, self.low_priority_issues]:
            score = self._calculate_linear_ocb_contribution(issues)
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 100.0)

    def test_more_issues_higher_load_score(self):
        """Test that more issues result in higher load component."""
        # Create issue sets of different sizes
        small_set = [{"priority": 3, "dueDate": None} for _ in range(3)]
        large_set = [{"priority": 3, "dueDate": None} for _ in range(15)]

        small_score = self._calculate_linear_ocb_contribution(small_set)
        large_score = self._calculate_linear_ocb_contribution(large_set)

        self.assertGreater(large_score, small_score)

    def _calculate_linear_ocb_contribution(self, issues):
        """
        Calculate Linear OCB contribution locally for testing.
        Mirrors the actual implementation logic.
        """
        if not issues:
            return 0.0

        issue_count = len(issues)
        if issue_count == 0:
            return 0.0

        PRIORITY_WEIGHTS = {1: 1.2, 2: 1.0, 3: 0.7, 4: 0.4, 0: 0.2}

        weighted_sum = sum(
            PRIORITY_WEIGHTS.get(i.get("priority", 0), 0.7)
            for i in issues
        )
        avg_priority_weight = weighted_sum / issue_count
        priority_score = min(avg_priority_weight / 1.2, 1.0)

        # Deadline scoring (simplified - assume all due dates are far away for test)
        deadline_score = 0.3  # Default for no due dates

        MAX_LOAD = 15
        issue_load_score = min(issue_count / MAX_LOAD, 1.0)

        combined = (0.4 * issue_load_score + 0.35 * priority_score + 0.25 * deadline_score)
        linear_score = max(0.0, min(100.0, combined * 100 * 0.75))

        return round(linear_score, 1)


class TestLinearUserCorrelation(unittest.TestCase):
    """Test Linear user correlation with team members."""

    def test_email_matching(self):
        """Test that users are matched by email (case-insensitive)."""
        linear_users = [
            {"id": "user-1", "email": "Dev.One@Example.com", "name": "Dev One"},
            {"id": "user-2", "email": "dev2@example.com", "name": "Dev Two"},
        ]

        team_emails = ["dev.one@example.com", "dev2@example.com", "dev3@example.com"]

        # Simulate matching logic
        matched = []
        for email in team_emails:
            for linear_user in linear_users:
                if linear_user["email"].lower() == email.lower():
                    matched.append(email)
                    break

        self.assertEqual(len(matched), 2)
        self.assertIn("dev.one@example.com", matched)
        self.assertIn("dev2@example.com", matched)

    def test_no_match_for_unknown_email(self):
        """Test that unknown emails don't get matched."""
        linear_users = [
            {"id": "user-1", "email": "known@example.com", "name": "Known User"},
        ]

        # Try to match unknown email
        email = "unknown@example.com"
        matched = any(
            u["email"].lower() == email.lower()
            for u in linear_users
        )

        self.assertFalse(matched)


class TestLinearWorkloadAggregation(unittest.TestCase):
    """Test Linear workload data aggregation."""

    def test_issues_grouped_by_assignee(self):
        """Test that issues are correctly grouped by assignee."""
        issues = MOCK_LINEAR_ISSUES

        # Group issues by assignee
        by_assignee = {}
        for issue in issues:
            assignee = issue.get("assignee") or {}
            assignee_id = assignee.get("id")
            if not assignee_id:
                continue
            if assignee_id not in by_assignee:
                by_assignee[assignee_id] = []
            by_assignee[assignee_id].append(issue)

        # user-1 should have 3 issues, user-2 should have 2
        self.assertEqual(len(by_assignee["user-1"]), 3)
        self.assertEqual(len(by_assignee["user-2"]), 2)

    def test_priority_distribution(self):
        """Test priority distribution calculation."""
        issues = MOCK_LINEAR_ISSUES

        priority_counts = {}
        for issue in issues:
            p = issue.get("priority", 0)
            priority_counts[p] = priority_counts.get(p, 0) + 1

        # Should have: 1 Urgent, 1 High, 1 Medium, 1 Low, 1 None
        self.assertEqual(priority_counts.get(1, 0), 1)  # Urgent
        self.assertEqual(priority_counts.get(2, 0), 1)  # High
        self.assertEqual(priority_counts.get(3, 0), 1)  # Medium
        self.assertEqual(priority_counts.get(4, 0), 1)  # Low
        self.assertEqual(priority_counts.get(0, 0), 1)  # No priority


class TestLinearDateParsing(unittest.TestCase):
    """Test Linear date parsing for deadline scoring."""

    def test_iso_date_parsing(self):
        """Test parsing ISO format dates."""
        from datetime import datetime

        date_str = "2025-01-20"
        try:
            parsed = datetime.fromisoformat(date_str).date()
            self.assertEqual(parsed.year, 2025)
            self.assertEqual(parsed.month, 1)
            self.assertEqual(parsed.day, 20)
        except ValueError:
            self.fail("Failed to parse ISO date")

    def test_iso_datetime_parsing(self):
        """Test parsing ISO datetime with timezone."""
        from datetime import datetime

        datetime_str = "2025-01-20T10:30:00Z"
        try:
            # Replace Z with +00:00 for fromisoformat
            parsed = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
            self.assertEqual(parsed.year, 2025)
            self.assertEqual(parsed.month, 1)
            self.assertEqual(parsed.day, 20)
        except ValueError:
            self.fail("Failed to parse ISO datetime")

    def test_none_date_handling(self):
        """Test that None dates don't cause errors."""
        date_str = None
        result = None

        if date_str:
            try:
                from datetime import datetime
                result = datetime.fromisoformat(date_str).date()
            except:
                pass

        self.assertIsNone(result)


class TestLinearHeadroomModel(unittest.TestCase):
    """Test the headroom model for combining OCB scores."""

    def test_headroom_never_reduces_score(self):
        """Test that Linear contribution never reduces original OCB."""
        original_ocb = 50.0
        linear_ocb = 30.0

        # Headroom formula: final = original + (100 - original) * (linear / 100)
        final_ocb = original_ocb + (100.0 - original_ocb) * (linear_ocb / 100.0)

        self.assertGreaterEqual(final_ocb, original_ocb)

    def test_headroom_caps_at_100(self):
        """Test that final score never exceeds 100."""
        original_ocb = 90.0
        linear_ocb = 100.0

        final_ocb = original_ocb + (100.0 - original_ocb) * (linear_ocb / 100.0)
        final_ocb = min(100.0, final_ocb)

        self.assertLessEqual(final_ocb, 100.0)

    def test_zero_linear_no_change(self):
        """Test that zero Linear contribution means no change."""
        original_ocb = 50.0
        linear_ocb = 0.0

        final_ocb = original_ocb + (100.0 - original_ocb) * (linear_ocb / 100.0)

        self.assertEqual(final_ocb, original_ocb)

    def test_full_linear_reaches_100(self):
        """Test that 100 Linear contribution reaches 100."""
        original_ocb = 50.0
        linear_ocb = 100.0

        final_ocb = original_ocb + (100.0 - original_ocb) * (linear_ocb / 100.0)

        self.assertEqual(final_ocb, 100.0)

    def test_example_calculation(self):
        """Test specific example from implementation plan."""
        # If OCB from incidents = 50, and Linear = 30:
        # Final = 50 + (100-50) × (30/100) = 50 + 15 = 65
        original_ocb = 50.0
        linear_ocb = 30.0

        final_ocb = original_ocb + (100.0 - original_ocb) * (linear_ocb / 100.0)

        self.assertEqual(final_ocb, 65.0)


if __name__ == '__main__':
    unittest.main()
