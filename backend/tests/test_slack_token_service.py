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
