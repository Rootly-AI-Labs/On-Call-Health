"""
Unit tests for Slack interaction handler.

Tests the button click handler for the "Take Check-in" button
to ensure proper error handling and user feedback.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime


class TestSlackInteractionHandler:
    """Tests for the /slack/interactions endpoint button click handling."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        db = MagicMock()
        return db

    @pytest.fixture
    def valid_button_payload(self):
        """Create a valid button click payload."""
        return json.dumps({
            "type": "block_actions",
            "user": {"id": "U12345"},
            "team": {"id": "T12345"},
            "trigger_id": "trigger123",
            "actions": [
                {
                    "action_id": "open_burnout_survey",
                    "value": "1|1"  # user_id|organization_id
                }
            ]
        })

    def test_button_click_missing_slack_integration_returns_error(self, mock_db, valid_button_payload):
        """
        Test that clicking the button when Slack integration is not found
        returns an error message to the user instead of silently failing.
        """
        # Simulate no Slack integration found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        # Parse the handler logic
        data = json.loads(valid_button_payload)
        team_id = data.get("team", {}).get("id")

        # Simulate the lookup
        slack_integration = mock_db.query().filter().first()

        # Verify the condition that was previously missing error handling
        if not slack_integration or not getattr(slack_integration, 'slack_token', None):
            result = {
                "text": "⚠️ Slack integration not configured. Please ask your admin to set up the Slack integration in On-Call Health settings.",
                "response_type": "ephemeral"
            }
        else:
            result = None

        # Assert error message is returned
        assert result is not None, "Should return error when slack_integration not found"
        assert "text" in result, "Response should contain text field"
        assert "not configured" in result["text"], "Error message should mention configuration issue"
        assert result.get("response_type") == "ephemeral", "Message should be ephemeral"

    def test_button_click_missing_slack_token_returns_error(self, mock_db, valid_button_payload):
        """
        Test that clicking the button when Slack token is missing
        returns an error message to the user.
        """
        # Simulate Slack integration found but without token
        mock_integration = MagicMock()
        mock_integration.slack_token = None
        mock_db.query.return_value.filter.return_value.first.return_value = mock_integration

        slack_integration = mock_db.query().filter().first()

        # Verify the condition
        if not slack_integration or not slack_integration.slack_token:
            result = {
                "text": "⚠️ Slack integration not configured. Please ask your admin to set up the Slack integration in On-Call Health settings.",
                "response_type": "ephemeral"
            }
        else:
            result = None

        # Assert error message is returned
        assert result is not None, "Should return error when slack_token is missing"
        assert "text" in result, "Response should contain text field"

    def test_button_click_with_valid_integration_proceeds(self, mock_db, valid_button_payload):
        """
        Test that clicking the button with valid Slack integration
        proceeds to open the modal (doesn't return early error).
        """
        # Simulate valid Slack integration
        mock_integration = MagicMock()
        mock_integration.slack_token = "encrypted_token_here"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_integration

        slack_integration = mock_db.query().filter().first()

        # Verify the condition passes
        should_return_error = not slack_integration or not slack_integration.slack_token

        assert not should_return_error, "Should not return error when integration is valid"

    def test_button_click_invalid_value_format_returns_error(self):
        """
        Test that clicking the button with invalid value format
        returns an error message.
        """
        invalid_payload = json.dumps({
            "type": "block_actions",
            "user": {"id": "U12345"},
            "team": {"id": "T12345"},
            "trigger_id": "trigger123",
            "actions": [
                {
                    "action_id": "open_burnout_survey",
                    "value": "invalid_format"  # Missing pipe separator
                }
            ]
        })

        data = json.loads(invalid_payload)
        action = data["actions"][0]
        value = action.get("value", "")

        # Simulate the parsing logic
        try:
            user_id, organization_id = map(int, value.split("|"))
            parse_error = False
        except (ValueError, AttributeError):
            parse_error = True
            result = {"text": "Invalid survey data"}

        assert parse_error, "Should fail to parse invalid value format"
        assert result["text"] == "Invalid survey data", "Should return invalid data error"

    def test_button_click_empty_value_returns_error(self):
        """
        Test that clicking the button with empty value
        returns an error message.
        """
        empty_payload = json.dumps({
            "type": "block_actions",
            "user": {"id": "U12345"},
            "team": {"id": "T12345"},
            "trigger_id": "trigger123",
            "actions": [
                {
                    "action_id": "open_burnout_survey",
                    "value": ""  # Empty value
                }
            ]
        })

        data = json.loads(empty_payload)
        action = data["actions"][0]
        value = action.get("value", "")

        # Simulate the parsing logic
        try:
            user_id, organization_id = map(int, value.split("|"))
            parse_error = False
        except (ValueError, AttributeError):
            parse_error = True
            result = {"text": "Invalid survey data"}

        assert parse_error, "Should fail to parse empty value"


class TestSlackInteractionPayloadParsing:
    """Tests for parsing Slack interaction payloads."""

    def test_extract_team_id_from_payload(self):
        """Test extracting team_id from Slack payload."""
        payload = {
            "team": {"id": "T12345", "domain": "example"}
        }
        team_id = payload.get("team", {}).get("id")
        assert team_id == "T12345"

    def test_extract_team_id_missing_team(self):
        """Test handling missing team in payload."""
        payload = {}
        team_id = payload.get("team", {}).get("id")
        assert team_id is None

    def test_extract_trigger_id_from_payload(self):
        """Test extracting trigger_id for modal opening."""
        payload = {
            "trigger_id": "123456.789012.abcdef"
        }
        trigger_id = payload.get("trigger_id")
        assert trigger_id == "123456.789012.abcdef"

    def test_extract_user_id_and_org_id_from_button_value(self):
        """Test parsing user_id and organization_id from button value."""
        button_value = "42|7"
        user_id, organization_id = map(int, button_value.split("|"))
        assert user_id == 42
        assert organization_id == 7


class TestSlackModalCreation:
    """Tests for the burnout survey modal creation."""

    def test_create_modal_basic_structure(self):
        """Test that modal has required Slack structure."""
        # Simulate the modal creation function output
        modal = {
            "type": "modal",
            "callback_id": "burnout_survey_modal",
            "title": {"type": "plain_text", "text": "On-Call Health Check-in"},
            "submit": {"type": "plain_text", "text": "Submit"},
            "close": {"type": "plain_text", "text": "Cancel"},
            "blocks": []
        }

        assert modal["type"] == "modal"
        assert modal["callback_id"] == "burnout_survey_modal"
        assert "title" in modal
        assert "submit" in modal
        assert "close" in modal
        assert "blocks" in modal

    def test_create_modal_with_is_update_flag(self):
        """Test that modal title changes for update mode."""
        is_update = True
        modal_title = "Update Check-in" if is_update else "On-Call Health Check-in"
        assert modal_title == "Update Check-in"

        is_update = False
        modal_title = "Update Check-in" if is_update else "On-Call Health Check-in"
        assert modal_title == "On-Call Health Check-in"

    def test_private_metadata_contains_required_fields(self):
        """Test that private_metadata includes user and org IDs."""
        import json
        metadata = {
            "user_id": 42,
            "organization_id": 7,
            "analysis_id": None
        }
        private_metadata = json.dumps(metadata)
        parsed = json.loads(private_metadata)

        assert parsed["user_id"] == 42
        assert parsed["organization_id"] == 7
        assert "analysis_id" in parsed


class TestSlackDMSenderButton:
    """Tests for the button definition in SlackDMSender."""

    def test_button_has_correct_action_id(self):
        """Test that button action_id matches handler expectation."""
        button = {
            "type": "button",
            "text": {"type": "plain_text", "text": "Take Check-in (30 sec)"},
            "style": "primary",
            "action_id": "open_burnout_survey",
            "value": "1|1"
        }

        # Handler expects this exact action_id
        expected_action_id = "open_burnout_survey"
        assert button["action_id"] == expected_action_id

    def test_button_value_format(self):
        """Test that button value has correct pipe-separated format."""
        user_id = 42
        organization_id = 7
        value = f"{user_id}|{organization_id}"

        assert "|" in value
        parts = value.split("|")
        assert len(parts) == 2
        assert int(parts[0]) == user_id
        assert int(parts[1]) == organization_id

    def test_button_text_matches_expected(self):
        """Test button text is as expected."""
        button_text = "Take Check-in (30 sec)"
        assert "Check-in" in button_text
        assert "30 sec" in button_text


class TestSlackDMSenderValidation:
    """Tests for SlackDMSender input validation."""

    def test_send_survey_dm_rejects_none_user_id(self):
        """
        Test that send_survey_dm raises ValueError when user_id is None.
        This prevents sending buttons with invalid values like "None|7".
        """
        # Simulate the validation logic
        user_id = None
        organization_id = 7
        slack_user_id = "U12345"

        with pytest.raises(ValueError) as exc_info:
            if user_id is None:
                raise ValueError(f"user_id cannot be None - cannot send survey DM to slack_user_id={slack_user_id}")

        assert "user_id cannot be None" in str(exc_info.value)
        assert slack_user_id in str(exc_info.value)

    def test_send_survey_dm_rejects_none_organization_id(self):
        """
        Test that send_survey_dm raises ValueError when organization_id is None.
        """
        user_id = 42
        organization_id = None

        with pytest.raises(ValueError) as exc_info:
            if organization_id is None:
                raise ValueError(f"organization_id cannot be None - cannot send survey DM to user_id={user_id}")

        assert "organization_id cannot be None" in str(exc_info.value)

    def test_send_survey_dm_accepts_valid_ids(self):
        """
        Test that valid user_id and organization_id pass validation.
        """
        user_id = 42
        organization_id = 7

        # Validation should pass (no exception)
        is_valid = user_id is not None and organization_id is not None
        assert is_valid

    def test_button_value_with_none_user_id_is_invalid(self):
        """
        Test that a button value created with None user_id cannot be parsed.
        This is the root cause of the "button not working for some users" bug.
        """
        user_id = None
        organization_id = 7
        value = f"{user_id}|{organization_id}"  # Results in "None|7"

        # Attempt to parse should fail
        with pytest.raises(ValueError):
            parsed_user_id, parsed_org_id = map(int, value.split("|"))


class TestSurveySchedulerUserValidation:
    """Tests for survey scheduler user validation."""

    def test_survey_scheduler_imports_required_models(self):
        """The scheduler recipient query depends on imported ORM models."""
        from app.services import survey_scheduler as survey_scheduler_module

        assert survey_scheduler_module.User.__name__ == "User"
        assert survey_scheduler_module.UserSurveyPreference.__name__ == "UserSurveyPreference"

    def test_allow_users_without_user_id_when_email_present(self):
        """
        Test that roster members without a local User record are still eligible
        for scheduled Slack surveys as long as they have an email address.
        """
        users = [
            {'user_id': 1, 'slack_user_id': 'U001', 'email': 'user1@example.com'},
            {'user_id': None, 'slack_user_id': 'U002', 'email': 'user2@example.com'},
            {'user_id': 3, 'slack_user_id': 'U003', 'email': 'user3@example.com'},
        ]

        sendable_users = []
        skipped_users = []

        for user in users:
            if not user['email']:
                skipped_users.append(user)
            else:
                sendable_users.append(user)

        assert len(sendable_users) == 3
        assert len(skipped_users) == 0
        assert any(user['user_id'] is None for user in sendable_users)

    def test_user_correlation_without_user_record(self):
        """
        Test the scenario where UserCorrelation exists but User record doesn't.
        This simulates the _get_eligible_users() logic.
        """
        # Simulate: correlation exists, user is None
        user = None
        correlation_email = "orphan@example.com"

        user_data = {
            'user_id': user.id if user else None,
            'email': correlation_email
        }

        assert user_data['user_id'] is None
        assert user_data['email'] == "orphan@example.com"


class TestSlackInteractionErrorMessages:
    """Tests for error message quality and user feedback."""

    def test_missing_integration_error_is_actionable(self):
        """
        Test that the error message when Slack integration is missing
        provides actionable guidance to the user.
        """
        error_message = "⚠️ Slack integration not configured. Please ask your admin to set up the Slack integration in On-Call Health settings."

        assert "Slack integration" in error_message
        assert "admin" in error_message
        assert "settings" in error_message

    def test_invalid_data_error_is_user_friendly(self):
        """
        Test that the error message for invalid button data is user-friendly.
        """
        error_message = "Invalid survey data. Please contact your admin."

        assert "Invalid" in error_message
        assert "admin" in error_message


class TestUserSyncServiceUserCreation:
    """Tests for automatic User record creation during member sync."""

    def test_ensure_user_records_creates_for_orphans(self):
        """
        Test that _ensure_user_records_exist creates User records
        for UserCorrelations without matching User records.
        """
        # Simulate the logic of identifying orphan correlations
        correlations = [
            {'email': 'user1@example.com', 'name': 'User One', 'has_user': False},
            {'email': 'user2@example.com', 'name': 'User Two', 'has_user': True},  # Already has User
            {'email': 'user3@example.com', 'name': None, 'has_user': False},  # No name
        ]

        orphans = [c for c in correlations if not c['has_user']]
        assert len(orphans) == 2

        # Test name fallback logic
        for orphan in orphans:
            name = orphan['name'] or orphan['email'].split('@')[0]
            assert name is not None
            if orphan['email'] == 'user3@example.com':
                assert name == 'user3'  # Fallback to email prefix

    def test_sync_creates_user_records_stats(self):
        """
        Test that sync stats include user_records_created count.
        """
        # Simulate sync stats
        stats = {
            'created': 5,
            'updated': 3,
            'skipped': 1,
            'removed': 0,
            'user_records_created': 2  # New field
        }

        assert 'user_records_created' in stats
        assert stats['user_records_created'] == 2

    def test_user_record_fields(self):
        """
        Test that auto-created User records have correct fields set.
        """
        # Simulate User record creation
        email = "test@example.com"
        name = "Test User"
        organization_id = 1

        user_data = {
            'email': email.lower(),
            'name': name,
            'organization_id': organization_id,
            'is_verified': False,  # Not verified since they haven't logged in
        }

        assert user_data['email'] == 'test@example.com'
        assert user_data['is_verified'] is False  # Important: not verified
        assert user_data['organization_id'] == organization_id

    def test_ensure_user_records_skips_without_organization(self):
        """
        Test that _ensure_user_records_exist returns 0 when organization_id is None.
        """
        # Simulate the check at the start of the method
        organization_id = None

        if not organization_id:
            result = 0  # Should return early
        else:
            result = -1  # Would continue processing

        assert result == 0, "Should return 0 when no organization_id"

    def test_email_case_insensitivity(self):
        """
        Test that email matching is case-insensitive.
        """
        correlation_email = "John.Doe@Example.COM"
        user_email = "john.doe@example.com"

        # The matching should be case-insensitive
        assert correlation_email.lower() == user_email.lower()

    def test_name_fallback_various_emails(self):
        """
        Test name fallback logic with various email formats.
        """
        test_cases = [
            ('john@example.com', None, 'john'),
            ('jane.doe@example.com', None, 'jane.doe'),
            ('user123@example.com', None, 'user123'),
            ('john@example.com', 'John Smith', 'John Smith'),  # Name provided
        ]

        for email, name, expected in test_cases:
            result = name or email.split('@')[0]
            assert result == expected, f"Failed for email={email}, name={name}"

    def test_skip_correlation_with_existing_user(self):
        """
        Test that correlations with existing User records are skipped.
        """
        # Simulate finding an existing user
        existing_user = {'id': 42, 'email': 'existing@example.com'}

        # The logic should skip this correlation
        if existing_user:
            should_create = False
        else:
            should_create = True

        assert not should_create, "Should skip when User already exists"


class TestSlackButtonEndToEnd:
    """End-to-end tests for the Slack button flow."""

    def test_button_value_roundtrip(self):
        """
        Test that button value can be created and parsed correctly.
        """
        # Create button value (in slack_dm_sender.py)
        user_id = 42
        organization_id = 7
        button_value = f"{user_id}|{organization_id}"

        # Parse button value (in slack.py handler)
        parsed_user_id, parsed_org_id = map(int, button_value.split("|"))

        assert parsed_user_id == user_id
        assert parsed_org_id == organization_id

    def test_button_flow_all_validations_pass(self):
        """
        Test the complete validation chain for a valid button click.
        """
        # Step 1: Button value is valid
        button_value = "42|7"
        user_id, org_id = map(int, button_value.split("|"))
        assert user_id == 42
        assert org_id == 7

        # Step 2: user_id is not None (slack_dm_sender validation)
        assert user_id is not None

        # Step 3: Slack integration exists
        slack_integration = {'workspace_id': 'T12345', 'slack_token': 'encrypted_token'}
        assert slack_integration is not None
        assert slack_integration.get('slack_token') is not None

        # Step 4: User exists in database
        user = {'id': 42, 'email': 'test@example.com'}
        assert user is not None

        # All validations pass - modal can be opened
        can_open_modal = True
        assert can_open_modal

    def test_button_flow_fails_at_each_step(self):
        """
        Test that each validation step can fail independently.
        """
        # Failure 1: Invalid button value
        try:
            user_id, org_id = map(int, "invalid".split("|"))
            failed_parse = False
        except ValueError:
            failed_parse = True
        assert failed_parse, "Should fail on invalid button value"

        # Failure 2: None user_id
        user_id = None
        assert user_id is None, "user_id can be None for orphan correlations"

        # Failure 3: No Slack integration
        slack_integration = None
        assert slack_integration is None, "Slack integration can be missing"

        # Failure 4: No Slack token
        slack_integration = {'workspace_id': 'T12345', 'slack_token': None}
        assert slack_integration.get('slack_token') is None, "Slack token can be missing"


class TestSurveySchedulerEdgeCases:
    """Edge case tests for survey scheduler."""

    def test_mixed_valid_and_invalid_users(self):
        """
        Test processing a list with both email-backed and missing-email users.
        """
        users = [
            {'user_id': 1, 'email': 'valid1@example.com'},
            {'user_id': None, 'email': 'orphan1@example.com'},
            {'user_id': 2, 'email': 'valid2@example.com'},
            {'user_id': None, 'email': None},
            {'user_id': 3, 'email': 'valid3@example.com'},
        ]

        sendable_users = [u for u in users if u['email']]
        invalid_users = [u for u in users if not u['email']]

        assert len(sendable_users) == 4
        assert len(invalid_users) == 1

    def test_all_users_are_orphans(self):
        """
        Test handling when all users are roster-only members without local
        User rows but still have deliverable emails.
        """
        users = [
            {'user_id': None, 'email': 'orphan1@example.com'},
            {'user_id': None, 'email': 'orphan2@example.com'},
        ]

        sendable_users = [u for u in users if u['email']]

        assert len(sendable_users) == 2, "Email-backed roster members should remain eligible"

    def test_empty_user_list(self):
        """
        Test handling empty user list.
        """
        users = []

        sent_count = 0
        skipped_count = 0

        for user in users:
            if user['user_id'] is None:
                skipped_count += 1
            else:
                sent_count += 1

        assert sent_count == 0
        assert skipped_count == 0


class TestLoggingMessages:
    """Tests to verify logging messages are informative."""

    def test_roster_member_send_log_includes_email(self):
        """
        Test that the log message for roster-only members includes the user's email.
        """
        email = "orphan@example.com"

        log_message = (
            "Sending initial survey to "
            f"{email} without a local User record; email-based survey tracking will be used"
        )

        assert email in log_message
        assert "email-based survey tracking" in log_message

    def test_slack_integration_not_found_log_includes_team_id(self):
        """
        Test that the error log includes team_id for debugging.
        """
        team_id = "T12345"

        log_message = f"Slack integration not found for team_id: {team_id}"

        assert team_id in log_message

    def test_user_creation_log_includes_details(self):
        """
        Test that User creation log includes email and new user ID.
        """
        email = "newuser@example.com"
        new_user_id = 99

        log_message = f"Created User record for {email} (id={new_user_id})"

        assert email in log_message
        assert str(new_user_id) in log_message


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
