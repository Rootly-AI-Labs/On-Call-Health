"""
Tests for POST /rootly/token/teams endpoint.
"""
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.endpoints.rootly import router
from app.auth.dependencies import get_current_active_user
from app.models import User, get_db


test_app = FastAPI()
test_app.include_router(router, prefix="/rootly")

VALID_ROOTLY_TOKEN = f"rootly_{'a' * 64}"


@pytest.fixture
def mock_user():
    user = Mock(spec=User)
    user.id = 1
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def client(mock_user, mock_db):
    test_app.dependency_overrides[get_current_active_user] = lambda: mock_user
    test_app.dependency_overrides[get_db] = lambda: mock_db

    with TestClient(test_app) as test_client:
        yield test_client

    test_app.dependency_overrides.clear()


def test_get_rootly_teams_marks_existing_scopes(client, mock_db):
    mock_query = MagicMock()
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query

    existing_team_scope = MagicMock()
    existing_team_scope.id = 12
    existing_team_scope.name = "Rootly - Acme Backend"
    existing_team_scope.team_name = "Backend"
    existing_team_scope.api_token = VALID_ROOTLY_TOKEN

    existing_org_scope = MagicMock()
    existing_org_scope.id = 9
    existing_org_scope.name = "Rootly - Acme"
    existing_org_scope.team_name = None
    existing_org_scope.api_token = VALID_ROOTLY_TOKEN

    mock_query.all.return_value = [existing_team_scope, existing_org_scope]
    mock_db.query.return_value = mock_query

    with patch("app.api.endpoints.rootly.RootlyAPIClient") as mock_client_class:
        mock_client = mock_client_class.return_value
        mock_client.get_teams = AsyncMock(return_value=[
            {"id": "1", "name": "Backend", "slug": "backend", "member_count": 4},
            {"id": "2", "name": "SRE", "slug": "sre", "member_count": 3},
        ])

        response = client.post("/rootly/token/teams", json={"token": VALID_ROOTLY_TOKEN})

    assert response.status_code == 200
    data = response.json()

    assert data["all_teams_scope"]["already_added"] is True
    assert data["all_teams_scope"]["existing_integration_name"] == "Rootly - Acme"
    assert data["all_teams_scope"]["existing_integration_id"] == 9

    teams_by_name = {team["name"]: team for team in data["teams"]}
    assert teams_by_name["Backend"]["already_added"] is True
    assert teams_by_name["Backend"]["existing_integration_name"] == "Rootly - Acme Backend"
    assert teams_by_name["Backend"]["existing_integration_id"] == 12

    assert teams_by_name["SRE"]["already_added"] is False
    assert teams_by_name["SRE"]["existing_integration_name"] is None
    assert teams_by_name["SRE"]["existing_integration_id"] is None

def test_get_rootly_teams_returns_no_existing_scope_when_none_found(client, mock_db):
    mock_query = MagicMock()
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = []
    mock_db.query.return_value = mock_query

    with patch("app.api.endpoints.rootly.RootlyAPIClient") as mock_client_class:
        mock_client = mock_client_class.return_value
        mock_client.get_teams = AsyncMock(return_value=[
            {"id": "1", "name": "Core", "slug": "core", "member_count": 2},
        ])

        response = client.post("/rootly/token/teams", json={"token": VALID_ROOTLY_TOKEN})

    assert response.status_code == 200
    data = response.json()

    assert data["all_teams_scope"]["already_added"] is False
    assert data["all_teams_scope"]["existing_integration_name"] is None
    assert data["all_teams_scope"]["existing_integration_id"] is None
    assert data["teams"][0]["already_added"] is False


def test_get_rootly_teams_matches_token_with_stored_whitespace(client, mock_db):
    mock_query = MagicMock()
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query

    existing_team_scope = MagicMock()
    existing_team_scope.id = 5
    existing_team_scope.name = "Rootly - Core"
    existing_team_scope.team_name = "Core"
    existing_team_scope.api_token = f"  {VALID_ROOTLY_TOKEN}  "

    mock_query.all.return_value = [existing_team_scope]
    mock_db.query.return_value = mock_query

    with patch("app.api.endpoints.rootly.RootlyAPIClient") as mock_client_class:
        mock_client = mock_client_class.return_value
        mock_client.get_teams = AsyncMock(return_value=[
            {"id": "1", "name": "Core", "slug": "core", "member_count": 2},
        ])

        response = client.post("/rootly/token/teams", json={"token": VALID_ROOTLY_TOKEN})

    assert response.status_code == 200
    data = response.json()
    assert data["teams"][0]["already_added"] is True
    assert data["teams"][0]["existing_integration_name"] == "Rootly - Core"


def test_sync_integration_users_returns_401_for_expired_rootly_token(client, mock_db):
    mock_query = MagicMock()
    mock_query.filter.return_value = mock_query

    integration = MagicMock()
    integration.id = 80
    integration.user_id = 1
    integration.platform = "rootly"
    integration.last_synced_by = None
    integration.last_synced_at = None

    mock_query.first.return_value = integration
    mock_db.query.return_value = mock_query

    with patch(
        "app.services.user_sync_service.UserSyncService.sync_integration_users",
        new=AsyncMock(side_effect=Exception("API request failed: 401")),
    ):
        response = client.post("/rootly/integrations/80/sync-users")

    assert response.status_code == 401
    assert response.json()["detail"] == (
        "The Rootly token is expired or invalid. Please reconnect Rootly and try again."
    )
