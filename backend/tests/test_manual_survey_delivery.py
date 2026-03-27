import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.endpoints.surveys import ManualDeliveryRequest, manual_survey_delivery


def _build_first_query(result):
    query = MagicMock()
    query.filter.return_value.first.return_value = result
    return query


def _build_db(*results):
    db = MagicMock()
    db.query.side_effect = [_build_first_query(result) for result in results]
    return db


def test_manual_delivery_preserves_missing_recipient_http_exception():
    current_user = SimpleNamespace(
        id=1,
        email="admin@example.com",
        role="admin",
        organization_id=42,
    )
    workspace_mapping = SimpleNamespace(id=7, workspace_id="T123")
    scheduler = MagicMock()
    scheduler._get_survey_recipients.return_value = [
        {
            "email": "alice@example.com",
            "name": "Alice",
            "slack_user_id": "U123",
            "user_id": 100,
        }
    ]
    db = _build_db(SimpleNamespace(id=7))

    with patch(
        "app.api.endpoints.surveys.verify_survey_workspace_access",
        return_value=(42, workspace_mapping),
    ), patch("app.api.endpoints.surveys.SCHEDULER_AVAILABLE", True), patch(
        "app.api.endpoints.surveys.survey_scheduler",
        scheduler,
    ):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(
                manual_survey_delivery(
                    ManualDeliveryRequest(confirmed=True, recipient_emails=None),
                    current_user=current_user,
                    db=db,
                )
            )

    assert exc.value.status_code == 400
    assert "No recipients selected" in exc.value.detail


def test_manual_delivery_returns_actionable_error_when_workspace_token_missing():
    current_user = SimpleNamespace(
        id=1,
        email="admin@example.com",
        role="admin",
        organization_id=42,
    )
    workspace_mapping = SimpleNamespace(id=7, workspace_id="T123")
    scheduler = MagicMock()
    scheduler._get_survey_recipients.return_value = [
        {
            "email": "alice@example.com",
            "name": "Alice",
            "slack_user_id": "U123",
            "user_id": 100,
        }
    ]
    db = _build_db(SimpleNamespace(id=7), None)

    with patch(
        "app.api.endpoints.surveys.verify_survey_workspace_access",
        return_value=(42, workspace_mapping),
    ), patch("app.api.endpoints.surveys.SCHEDULER_AVAILABLE", True), patch(
        "app.api.endpoints.surveys.survey_scheduler",
        scheduler,
    ), patch(
        "app.services.slack_token_service.SlackTokenService.get_oauth_token_for_workspace",
        return_value=None,
    ):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(
                manual_survey_delivery(
                    ManualDeliveryRequest(
                        confirmed=True,
                        recipient_emails=["alice@example.com"],
                    ),
                    current_user=current_user,
                    db=db,
                )
            )

    assert exc.value.status_code == 400
    assert "Please reconnect Slack and try again" in exc.value.detail
