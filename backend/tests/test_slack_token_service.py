import unittest
import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.slack_token_service import SlackTokenService


class TestSlackTokenService(unittest.TestCase):
    def _build_query(self, result):
        query = MagicMock()
        query.filter.return_value.first.return_value = result
        return query

    def _build_query_with_all(self, results):
        query = MagicMock()
        filtered = query.filter.return_value
        ordered = filtered.order_by.return_value
        ordered.all.return_value = results
        return query

    def test_returns_none_when_token_decryption_fails(self):
        db = MagicMock()
        workspace_mapping = SimpleNamespace(
            organization_id=42,
            workspace_id="T123",
            status="active",
        )
        slack_integration = SimpleNamespace(
            id=99,
            workspace_id="T123",
            token_source="oauth",
            slack_token="invalid-encrypted-token",
        )

        db.query.side_effect = [
            self._build_query(workspace_mapping),
            self._build_query(slack_integration),
        ]

        service = SlackTokenService(db)

        with patch(
            "app.services.slack_token_service.decrypt_token",
            side_effect=Exception("bad token"),
        ):
            token = service.get_oauth_token_for_organization(42)

        self.assertIsNone(token)

    def test_falls_back_to_older_valid_token_when_newer_one_fails(self):
        db = MagicMock()
        invalid_integration = SimpleNamespace(
            id=101,
            workspace_id="T123",
            token_source="oauth",
            slack_token="invalid-encrypted-token",
            updated_at=None,
            created_at=None,
        )
        valid_integration = SimpleNamespace(
            id=100,
            workspace_id="T123",
            token_source="oauth",
            slack_token="valid-encrypted-token",
            updated_at=None,
            created_at=None,
        )

        db.query.return_value = self._build_query_with_all(
            [invalid_integration, valid_integration]
        )

        service = SlackTokenService(db)

        with patch(
            "app.services.slack_token_service.decrypt_token",
            side_effect=[Exception("bad token"), "xoxb-valid-token"],
        ):
            token = service.get_oauth_token_for_workspace("T123")

        self.assertEqual(token, "xoxb-valid-token")

    def test_returns_decrypted_token_when_available(self):
        db = MagicMock()
        workspace_mapping = SimpleNamespace(
            organization_id=42,
            workspace_id="T123",
            status="active",
        )
        slack_integration = SimpleNamespace(
            id=99,
            workspace_id="T123",
            token_source="oauth",
            slack_token="encrypted-token",
        )

        db.query.side_effect = [
            self._build_query(workspace_mapping),
            self._build_query(slack_integration),
        ]

        service = SlackTokenService(db)

        with patch(
            "app.services.slack_token_service.decrypt_token",
            return_value="xoxb-valid-token",
        ):
            token = service.get_oauth_token_for_organization(42)

        self.assertEqual(token, "xoxb-valid-token")

    def test_organization_lookup_uses_most_recent_workspace(self):
        db = MagicMock()
        workspace_mapping = SimpleNamespace(
            organization_id=42,
            workspace_id="T456",
            status="active",
        )

        workspace_query = MagicMock()
        workspace_query.filter.return_value.order_by.return_value.first.return_value = (
            workspace_mapping
        )
        db.query.return_value = workspace_query

        service = SlackTokenService(db)

        with patch.object(
            service,
            "get_oauth_token_for_workspace",
            return_value="xoxb-valid-token",
        ) as get_for_workspace:
            token = service.get_oauth_token_for_organization(42)

        self.assertEqual(token, "xoxb-valid-token")
        get_for_workspace.assert_called_once_with("T456")
