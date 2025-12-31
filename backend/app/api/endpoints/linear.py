# app/api/endpoints/linear.py
"""
Linear integration API endpoints for OAuth and data collection.

- Uses OAuth 2.0 flow with PKCE support.
- Uses GraphQL API at https://api.linear.app/graphql
- Access tokens expire in 24 hours.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone as dt_timezone, date
import logging
import base64
import secrets

from cryptography.fernet import Fernet

from ...models import get_db, User, LinearIntegration, LinearWorkspaceMapping, UserCorrelation
from ...auth.dependencies import get_current_user
from ...auth.integration_oauth import linear_integration_oauth, LinearIntegrationOAuth
from ...core.config import settings

router = APIRouter(prefix="/linear", tags=["linear-integration"])
logger = logging.getLogger(__name__)


# -------------------------------
# Small helpers
# -------------------------------
def _short(s: Optional[str], n: int = 12) -> str:
    if not s:
        return "None"
    return f"{s[:n]}…({len(s)})"


REQUESTED_SCOPES = ["read"]


# -------------------------------
# Encryption helpers (same as Jira)
# -------------------------------
def get_encryption_key() -> bytes:
    key = settings.JWT_SECRET_KEY.encode()
    return base64.urlsafe_b64encode(key[:32].ljust(32, b"\0"))


def encrypt_token(token: str) -> str:
    return Fernet(get_encryption_key()).encrypt(token.encode()).decode()


def decrypt_token(encrypted_token: str) -> str:
    return Fernet(get_encryption_key()).decrypt(encrypted_token.encode()).decode()


# -------------------------------
# Token freshness helper
# -------------------------------
def needs_refresh(expires_at: Optional[datetime], skew_minutes: int = 60) -> bool:
    """Check if token needs refresh. Use 60 min buffer for 24hr tokens."""
    if not expires_at:
        return False
    now = datetime.now(dt_timezone.utc)
    return expires_at <= now + timedelta(minutes=skew_minutes)


# -------------------------------
# Connect (start OAuth with PKCE)
# -------------------------------
@router.post("/connect")
async def connect_linear(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start Linear OAuth flow with PKCE."""
    if not settings.LINEAR_CLIENT_ID or not settings.LINEAR_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Linear OAuth is not configured. Please contact your administrator.",
        )

    # Generate PKCE pair
    code_verifier, code_challenge = LinearIntegrationOAuth.generate_pkce_pair()

    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)

    # Store code_verifier temporarily in the integration (will be used in callback)
    # If integration exists, update it; otherwise we'll create it in callback
    integration = db.query(LinearIntegration).filter(
        LinearIntegration.user_id == current_user.id
    ).first()

    if integration:
        integration.pkce_code_verifier = encrypt_token(code_verifier)
        integration.updated_at = datetime.now(dt_timezone.utc)
    else:
        # Create a placeholder integration to store PKCE verifier
        integration = LinearIntegration(
            user_id=current_user.id,
            workspace_id="pending",  # Will be updated in callback
            pkce_code_verifier=encrypt_token(code_verifier),
            token_source="oauth",
        )
        db.add(integration)

    db.commit()

    auth_url = linear_integration_oauth.get_authorization_url(
        state=state,
        code_challenge=code_challenge
    )

    logger.info("[Linear] OAuth init by user=%s, org=%s", current_user.id, current_user.organization_id)

    return {
        "authorization_url": auth_url,
        "state": state,
    }


# -------------------------------
# Core callback handler
# -------------------------------
async def _process_callback(code: str, state: Optional[str], db: Session, current_user: User) -> Dict[str, Any]:
    try:
        logger.info("[Linear] Processing callback code=%s state=%s", _short(code), _short(state))

        user = current_user
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        user_id = user.id
        organization_id = user.organization_id

        # Get existing integration for PKCE verifier
        integration = db.query(LinearIntegration).filter(
            LinearIntegration.user_id == user_id
        ).first()

        code_verifier = None
        if integration and integration.pkce_code_verifier:
            try:
                code_verifier = decrypt_token(integration.pkce_code_verifier)
            except Exception:
                logger.warning("[Linear] Could not decrypt PKCE verifier, proceeding without it")

        # 1) Exchange code for tokens
        try:
            token_data = await linear_integration_oauth.exchange_code_for_token(
                code,
                code_verifier=code_verifier
            )
        except HTTPException as ex:
            msg = str(ex.detail or "")
            if "invalid_grant" in msg or "authorization code" in msg.lower():
                logger.warning("[Linear] Code already used; treating as idempotent success.")
                if integration and integration.workspace_id != "pending":
                    return {
                        "success": True,
                        "redirect_url": f"{settings.FRONTEND_URL}/integrations?linear_connected=1&reuse=1"
                    }
            raise

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 86400)  # Linear default is 24 hours

        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token from Linear")

        # 2) Get organization (workspace) info
        org_info = await linear_integration_oauth.get_organization(access_token)
        workspace_id = org_info.get("id")
        workspace_name = org_info.get("name")
        workspace_url_key = org_info.get("urlKey")

        if not workspace_id:
            raise HTTPException(status_code=400, detail="Could not get Linear organization info")

        # 3) Get user (viewer) info
        try:
            viewer = await linear_integration_oauth.get_viewer(access_token)
            linear_user_id = viewer.get("id")
            linear_display_name = viewer.get("name")
            linear_email = viewer.get("email")
        except Exception as e:
            logger.warning("[Linear] viewer query failed: %s", e)
            linear_user_id = linear_display_name = linear_email = None

        token_expires_at = datetime.now(dt_timezone.utc) + timedelta(seconds=expires_in)
        enc_access = encrypt_token(access_token)
        enc_refresh = encrypt_token(refresh_token) if refresh_token else None

        # 4) Upsert integration
        now = datetime.now(dt_timezone.utc)

        if integration:
            integration.access_token = enc_access
            integration.refresh_token = enc_refresh
            integration.workspace_id = workspace_id
            integration.workspace_name = workspace_name
            integration.workspace_url_key = workspace_url_key
            integration.linear_user_id = linear_user_id
            integration.linear_display_name = linear_display_name
            integration.linear_email = linear_email
            integration.token_source = "oauth"
            integration.token_expires_at = token_expires_at
            integration.pkce_code_verifier = None  # Clear after use
            integration.updated_at = now
            logger.info("[Linear] Updated integration for user %s", user_id)
        else:
            integration = LinearIntegration(
                user_id=user_id,
                access_token=enc_access,
                refresh_token=enc_refresh,
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                workspace_url_key=workspace_url_key,
                linear_user_id=linear_user_id,
                linear_display_name=linear_display_name,
                linear_email=linear_email,
                token_source="oauth",
                token_expires_at=token_expires_at,
                created_at=now,
                updated_at=now,
            )
            db.add(integration)
            logger.info("[Linear] Created integration for user %s", user_id)

        # 5) Workspace mapping
        if organization_id:
            mapping = db.query(LinearWorkspaceMapping).filter(
                LinearWorkspaceMapping.workspace_id == workspace_id,
                LinearWorkspaceMapping.organization_id == organization_id,
            ).first()
            if not mapping:
                mapping = LinearWorkspaceMapping(
                    workspace_id=workspace_id,
                    workspace_name=workspace_name,
                    workspace_url_key=workspace_url_key,
                    owner_user_id=user_id,
                    organization_id=organization_id,
                    registered_via="oauth",
                    status="active",
                    collection_enabled=True,
                    workload_metrics_enabled=True,
                    granted_scopes=",".join(REQUESTED_SCOPES),
                )
                db.add(mapping)
                logger.info("[Linear] Created workspace mapping for org %s", organization_id)

        # 6) Correlate user
        if linear_email and linear_user_id and organization_id:
            corr = db.query(UserCorrelation).filter(
                UserCorrelation.organization_id == organization_id,
                UserCorrelation.email == linear_email,
            ).first()
            if corr:
                corr.linear_user_id = linear_user_id
                corr.linear_email = linear_email
            else:
                db.add(
                    UserCorrelation(
                        user_id=user_id,
                        organization_id=organization_id,
                        email=linear_email,
                        name=linear_display_name,
                        linear_user_id=linear_user_id,
                        linear_email=linear_email,
                    )
                )

        db.commit()

        return {
            "success": True,
            "redirect_url": f"{settings.FRONTEND_URL}/integrations?linear_connected=1"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Linear] OAuth callback error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/callback")
async def linear_oauth_callback_get(
    code: str = Query(...),
    state: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await _process_callback(code, state, db, current_user)


@router.post("/callback")
async def linear_oauth_callback_post(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code: Optional[str] = None
    state: Optional[str] = None

    ctype = request.headers.get("content-type", "")

    if ctype.startswith("application/json"):
        try:
            body = await request.json()
            code = body.get("code")
            state = body.get("state")
        except Exception:
            pass

    if not code:
        try:
            form = await request.form()
            code = code or form.get("code")
            state = state if state is not None else form.get("state")
        except Exception:
            pass

    if not code:
        q = request.query_params
        code = code or q.get("code")
        state = state if state is not None else q.get("state")

    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    return await _process_callback(code, state, db, current_user)


# -------------------------------
# Status
# -------------------------------
@router.get("/status")
async def get_linear_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get Linear integration status."""
    integration = db.query(LinearIntegration).filter(
        LinearIntegration.user_id == current_user.id
    ).first()

    if not integration or integration.workspace_id == "pending":
        return {"connected": False, "integration": None}

    token_preview = None
    try:
        if integration.access_token:
            dec = decrypt_token(integration.access_token)
            token_preview = f"...{dec[-4:]}" if dec else None
    except Exception:
        pass

    workspace_mapping = None
    if current_user.organization_id:
        workspace_mapping = db.query(LinearWorkspaceMapping).filter(
            LinearWorkspaceMapping.workspace_id == integration.workspace_id,
            LinearWorkspaceMapping.organization_id == current_user.organization_id,
        ).first()

    response = {
        "connected": True,
        "integration": {
            "id": integration.id,
            "workspace_id": integration.workspace_id,
            "workspace_name": integration.workspace_name,
            "workspace_url_key": integration.workspace_url_key,
            "linear_user_id": integration.linear_user_id,
            "linear_display_name": integration.linear_display_name,
            "linear_email": integration.linear_email,
            "token_source": integration.token_source,
            "is_oauth": integration.token_source == "oauth",
            "supports_refresh": (integration.token_source == "oauth") and bool(integration.refresh_token),
            "token_expires_at": integration.token_expires_at.isoformat() if integration.token_expires_at else None,
            "updated_at": integration.updated_at.isoformat() if integration.updated_at else None,
            "token_preview": token_preview,
        },
    }

    if workspace_mapping:
        response["workspace"] = {
            "id": workspace_mapping.id,
            "team_ids": workspace_mapping.team_ids,
            "team_names": workspace_mapping.team_names,
            "collection_enabled": workspace_mapping.collection_enabled,
            "workload_metrics_enabled": workspace_mapping.workload_metrics_enabled,
            "last_collection_at": workspace_mapping.last_collection_at.isoformat()
            if workspace_mapping.last_collection_at
            else None,
        }

    return response


# -------------------------------
# Teams
# -------------------------------
@router.get("/teams")
async def list_linear_teams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all teams in the Linear workspace."""
    integration = db.query(LinearIntegration).filter(
        LinearIntegration.user_id == current_user.id
    ).first()

    if not integration or integration.workspace_id == "pending":
        raise HTTPException(
            status_code=404,
            detail="Linear integration not found. Please connect your Linear account first.",
        )

    access_token = await _get_valid_token(integration, db)
    teams = await linear_integration_oauth.get_teams(access_token)

    # Get workspace mapping to mark selected teams
    selected_team_ids = []
    if current_user.organization_id:
        mapping = db.query(LinearWorkspaceMapping).filter(
            LinearWorkspaceMapping.workspace_id == integration.workspace_id,
            LinearWorkspaceMapping.organization_id == current_user.organization_id,
        ).first()
        if mapping and mapping.team_ids:
            selected_team_ids = mapping.team_ids

    return {
        "teams": [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "key": t.get("key"),
                "is_selected": t.get("id") in selected_team_ids,
            }
            for t in teams
        ],
        "total_count": len(teams),
    }


@router.post("/select-teams")
async def select_linear_teams(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Select which teams to monitor for burnout analysis."""
    integration = db.query(LinearIntegration).filter(
        LinearIntegration.user_id == current_user.id
    ).first()

    if not integration or integration.workspace_id == "pending":
        raise HTTPException(
            status_code=404,
            detail="Linear integration not found.",
        )

    body = await request.json()
    team_ids = body.get("team_ids", [])

    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Organization required to configure team selection.",
        )

    # Verify team IDs exist
    access_token = await _get_valid_token(integration, db)
    all_teams = await linear_integration_oauth.get_teams(access_token)
    all_team_ids = {t.get("id") for t in all_teams}
    team_map = {t.get("id"): t.get("name") for t in all_teams}

    invalid_ids = set(team_ids) - all_team_ids
    if invalid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid team IDs: {list(invalid_ids)}",
        )

    # Update workspace mapping
    mapping = db.query(LinearWorkspaceMapping).filter(
        LinearWorkspaceMapping.workspace_id == integration.workspace_id,
        LinearWorkspaceMapping.organization_id == current_user.organization_id,
    ).first()

    if mapping:
        mapping.team_ids = team_ids
        mapping.team_names = [team_map.get(tid, "") for tid in team_ids]
    else:
        mapping = LinearWorkspaceMapping(
            workspace_id=integration.workspace_id,
            workspace_name=integration.workspace_name,
            workspace_url_key=integration.workspace_url_key,
            owner_user_id=current_user.id,
            organization_id=current_user.organization_id,
            team_ids=team_ids,
            team_names=[team_map.get(tid, "") for tid in team_ids],
            registered_via="team_selection",
            status="active",
        )
        db.add(mapping)

    db.commit()

    return {
        "success": True,
        "selected_teams": [
            {"id": tid, "name": team_map.get(tid, "")}
            for tid in team_ids
        ],
    }


# -------------------------------
# Test connection
# -------------------------------
@router.post("/test")
async def test_linear_integration(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Test Linear connection and fetch workload preview."""
    integration = db.query(LinearIntegration).filter(
        LinearIntegration.user_id == current_user.id
    ).first()

    if not integration or integration.workspace_id == "pending":
        raise HTTPException(
            status_code=404,
            detail="Linear integration not found. Please connect your Linear account first.",
        )

    access_token = await _get_valid_token(integration, db)

    # Test permissions
    permissions = await linear_integration_oauth.test_permissions(access_token)

    # Get user info
    viewer = await linear_integration_oauth.get_viewer(access_token)

    # Fetch workload preview - active issues not in completed/canceled states
    # Linear state types: backlog, unstarted, started, completed, canceled
    filter_dict = {
        "state": {"type": {"nin": ["completed", "canceled"]}},
    }

    all_issues = []
    cursor = None
    max_pages = 10

    for _ in range(max_pages):
        result = await linear_integration_oauth.get_issues(
            access_token,
            first=100,
            after=cursor,
            filter_dict=filter_dict,
        )

        nodes = result.get("nodes", [])
        all_issues.extend(nodes)

        page_info = result.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    # Aggregate by assignee
    per_assignee: Dict[str, Dict[str, Any]] = {}
    for issue in all_issues:
        assignee = issue.get("assignee") or {}
        assignee_id = assignee.get("id") or "unassigned"
        assignee_name = assignee.get("name") or "Unassigned"
        assignee_email = assignee.get("email")

        if assignee_id not in per_assignee:
            per_assignee[assignee_id] = {
                "assignee_id": assignee_id,
                "assignee_name": assignee_name,
                "assignee_email": assignee_email,
                "count": 0,
                "priorities": {},
                "tickets": [],
            }

        per_assignee[assignee_id]["count"] += 1

        # Priority (0=None, 1=Urgent, 2=High, 3=Medium, 4=Low)
        priority = issue.get("priority", 0)
        priority_name = _priority_to_name(priority)
        per_assignee[assignee_id]["priorities"][priority_name] = \
            per_assignee[assignee_id]["priorities"].get(priority_name, 0) + 1

        per_assignee[assignee_id]["tickets"].append({
            "id": issue.get("id"),
            "identifier": issue.get("identifier"),
            "title": issue.get("title"),
            "priority": priority,
            "priority_name": priority_name,
            "due_date": issue.get("dueDate"),
            "state": issue.get("state", {}).get("name"),
        })

    logger.info(
        "[Linear/Test] user=%s workspace=%s total_issues=%s assignees=%s",
        current_user.id,
        integration.workspace_name,
        len(all_issues),
        len(per_assignee),
    )

    return {
        "success": True,
        "permissions": permissions,
        "user": {
            "id": viewer.get("id"),
            "name": viewer.get("name"),
            "email": viewer.get("email"),
        },
        "workspace": {
            "id": integration.workspace_id,
            "name": integration.workspace_name,
            "url_key": integration.workspace_url_key,
        },
        "workload_preview": {
            "total_issues": len(all_issues),
            "assignee_count": len(per_assignee),
            "per_assignee": list(per_assignee.values()),
        },
    }


# -------------------------------
# Sync users
# -------------------------------
@router.post("/sync-users")
async def sync_linear_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sync Linear users to UserCorrelation table."""
    integration = db.query(LinearIntegration).filter(
        LinearIntegration.user_id == current_user.id
    ).first()

    if not integration or integration.workspace_id == "pending":
        raise HTTPException(
            status_code=404,
            detail="Linear integration not found.",
        )

    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Organization required for user sync.",
        )

    access_token = await _get_valid_token(integration, db)

    # Fetch all users with pagination
    all_users = []
    cursor = None
    max_pages = 20

    for _ in range(max_pages):
        result = await linear_integration_oauth.get_users(
            access_token,
            first=100,
            after=cursor,
        )

        nodes = result.get("nodes", [])
        all_users.extend(nodes)

        page_info = result.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    # Filter active users
    active_users = [u for u in all_users if u.get("active", True)]

    matched = 0
    created = 0
    skipped = 0

    for linear_user in active_users:
        linear_id = linear_user.get("id")
        linear_email = linear_user.get("email")
        linear_name = linear_user.get("name")

        if not linear_email:
            skipped += 1
            continue

        # Find existing correlation by email
        corr = db.query(UserCorrelation).filter(
            UserCorrelation.organization_id == current_user.organization_id,
            UserCorrelation.email == linear_email,
        ).first()

        if corr:
            if not corr.linear_user_id:
                corr.linear_user_id = linear_id
                corr.linear_email = linear_email
                matched += 1
            else:
                skipped += 1
        else:
            # Create new correlation
            db.add(UserCorrelation(
                user_id=current_user.id,
                organization_id=current_user.organization_id,
                email=linear_email,
                name=linear_name,
                linear_user_id=linear_id,
                linear_email=linear_email,
            ))
            created += 1

    db.commit()

    logger.info(
        "[Linear/SyncUsers] org=%s total=%s matched=%s created=%s skipped=%s",
        current_user.organization_id,
        len(active_users),
        matched,
        created,
        skipped,
    )

    return {
        "success": True,
        "total_linear_users": len(active_users),
        "matched": matched,
        "created": created,
        "skipped": skipped,
    }


# -------------------------------
# Disconnect
# -------------------------------
@router.delete("/disconnect")
async def disconnect_linear(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect Linear integration."""
    integration = db.query(LinearIntegration).filter(
        LinearIntegration.user_id == current_user.id
    ).first()

    if not integration:
        raise HTTPException(
            status_code=404,
            detail="Linear integration not found.",
        )

    # Remove workspace mapping if exists
    if current_user.organization_id:
        db.query(LinearWorkspaceMapping).filter(
            LinearWorkspaceMapping.workspace_id == integration.workspace_id,
            LinearWorkspaceMapping.organization_id == current_user.organization_id,
        ).delete()

    # Remove integration
    db.delete(integration)
    db.commit()

    logger.info("[Linear] Disconnected for user %s", current_user.id)

    return {"success": True, "message": "Linear integration disconnected."}


# -------------------------------
# Helper functions
# -------------------------------
async def _get_valid_token(integration: LinearIntegration, db: Session) -> str:
    """Get a valid access token, refreshing if necessary."""
    if needs_refresh(integration.token_expires_at) and integration.refresh_token:
        logger.info("[Linear] Refreshing access token for user %s", integration.user_id)
        try:
            refresh_token = decrypt_token(integration.refresh_token)
            token_data = await linear_integration_oauth.refresh_access_token(refresh_token)

            new_access_token = token_data.get("access_token")
            new_refresh_token = token_data.get("refresh_token") or refresh_token
            expires_in = token_data.get("expires_in", 86400)

            if new_access_token:
                integration.access_token = encrypt_token(new_access_token)
                integration.refresh_token = encrypt_token(new_refresh_token)
                integration.token_expires_at = datetime.now(dt_timezone.utc) + timedelta(seconds=expires_in)
                integration.updated_at = datetime.now(dt_timezone.utc)
                db.commit()
                return new_access_token
        except Exception as e:
            logger.warning("[Linear] Token refresh failed: %s", e)

    return decrypt_token(integration.access_token)


def _priority_to_name(priority: int) -> str:
    """Convert Linear priority number to name."""
    mapping = {
        0: "No priority",
        1: "Urgent",
        2: "High",
        3: "Medium",
        4: "Low",
    }
    return mapping.get(priority, "Unknown")


# -------------------------------
# Linear Users (for dropdown)
# -------------------------------
@router.get("/linear-users")
async def get_linear_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get all active Linear users from the connected workspace.
    Used for dropdown selection in team member mapping interface.

    Returns:
        List of Linear users with id, name, and email
    """
    try:
        integration = db.query(LinearIntegration).filter(
            LinearIntegration.user_id == current_user.id
        ).first()

        if not integration or integration.workspace_id == "pending":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Linear integration not found. Please connect Linear first."
            )

        access_token = await _get_valid_token(integration, db)

        # Fetch all users with pagination
        all_users = []
        cursor = None
        max_pages = 20

        for _ in range(max_pages):
            result = await linear_integration_oauth.get_users(
                access_token,
                first=100,
                after=cursor,
            )

            nodes = result.get("nodes", [])
            all_users.extend(nodes)

            page_info = result.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break
            cursor = page_info.get("endCursor")

        # Filter to valid users with id and name
        valid_users = [
            {
                "id": u.get("id"),
                "name": u.get("name"),
                "email": u.get("email"),
                "active": u.get("active", True)
            }
            for u in all_users
            if u.get("id") and u.get("name")
        ]

        logger.info("[Linear] Retrieved %d valid users for dropdown", len(valid_users))

        return {
            "success": True,
            "users": valid_users
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Linear] Failed to get Linear users: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve Linear users: {str(e)}"
        )


# -------------------------------
# Auto-map
# -------------------------------
@router.post("/auto-map")
async def auto_map_linear_users(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Auto-map team members to Linear users using email + name matching.

    Request body:
    {
        "team_emails": ["email1@company.com", ...],
        "analysis_id": 123,  // optional
        "source_platform": "rootly"  // optional
    }

    Returns:
        Mapping statistics including success rate and per-user results
    """
    from ...services.linear_mapping_service import LinearMappingService

    try:
        # Parse request body
        body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
        team_emails = body.get("team_emails", [])
        analysis_id = body.get("analysis_id")
        source_platform = body.get("source_platform", "rootly")

        if not team_emails:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="team_emails list is required"
            )

        logger.info("[Linear] Auto-mapping Linear users for %d team emails", len(team_emails))

        # Get Linear integration
        integration = db.query(LinearIntegration).filter(
            LinearIntegration.user_id == current_user.id
        ).first()

        if not integration or integration.workspace_id == "pending":
            raise HTTPException(
                status_code=404,
                detail="Linear integration not found. Please connect your Linear account first.",
            )

        access_token = await _get_valid_token(integration, db)

        # Fetch all Linear users for matching
        all_users = []
        cursor = None
        max_pages = 20

        for _ in range(max_pages):
            result = await linear_integration_oauth.get_users(
                access_token,
                first=100,
                after=cursor,
            )

            nodes = result.get("nodes", [])
            all_users.extend(nodes)

            page_info = result.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break
            cursor = page_info.get("endCursor")

        # Filter to active users
        linear_users = [
            {
                "id": u.get("id"),
                "name": u.get("name"),
                "email": u.get("email"),
                "active": u.get("active", True)
            }
            for u in all_users
            if u.get("id") and u.get("name") and u.get("active", True)
        ]

        logger.info("[Linear] Fetched %d Linear users for matching", len(linear_users))

        # Convert team_emails to team_members format
        team_members = [{"email": email, "name": None} for email in team_emails]

        # Record mappings using LinearMappingService
        mapping_service = LinearMappingService(db)
        mapping_stats = await mapping_service.auto_map_users(
            team_members=team_members,
            linear_users=linear_users,
            user_id=current_user.id,
            source_platform=source_platform
        )

        logger.info(
            "[Linear] Auto-mapping complete: %d mapped, %d not found",
            mapping_stats.get("mapped", 0),
            mapping_stats.get("not_found", 0)
        )

        return {
            "success": True,
            "message": f"Auto-mapped {mapping_stats.get('mapped', 0)} Linear users to team emails",
            "stats": mapping_stats,
            "linear_user_count": len(linear_users),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Linear] Auto-mapping failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Linear auto-mapping failed: {str(e)}"
        )


# -------------------------------
# Remove mapping
# -------------------------------
@router.delete("/mapping/{email}")
async def remove_linear_mapping(
    email: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove Linear mapping for team member email."""
    from ...models import UserMapping

    try:
        logger.info("[Linear] Removing mapping for email: %s", email)

        # Find and delete UserMapping record
        mapping = db.query(UserMapping).filter(
            UserMapping.user_id == current_user.id,
            UserMapping.source_identifier == email,
            UserMapping.target_platform == "linear"
        ).first()

        if mapping:
            db.delete(mapping)

        # Clear Linear fields from UserCorrelation
        if current_user.organization_id:
            corr = db.query(UserCorrelation).filter(
                UserCorrelation.organization_id == current_user.organization_id,
                UserCorrelation.email == email,
            ).first()

            if corr:
                corr.linear_user_id = None
                corr.linear_email = None

        db.commit()

        return {
            "success": True,
            "message": f"Removed Linear mapping for {email}"
        }

    except Exception as e:
        logger.error("[Linear] Remove mapping failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove Linear mapping: {str(e)}"
        )


# -------------------------------
# Get unmapped users
# -------------------------------
@router.get("/unmapped-users")
async def get_unmapped_linear_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get Linear users not yet mapped to any team member.
    Returns users available for dropdown selection.
    """
    from ...models import UserMapping

    try:
        integration = db.query(LinearIntegration).filter(
            LinearIntegration.user_id == current_user.id
        ).first()

        if not integration or integration.workspace_id == "pending":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Linear integration not found."
            )

        access_token = await _get_valid_token(integration, db)

        # Fetch all Linear users
        all_users = []
        cursor = None
        max_pages = 20

        for _ in range(max_pages):
            result = await linear_integration_oauth.get_users(
                access_token,
                first=100,
                after=cursor,
            )

            nodes = result.get("nodes", [])
            all_users.extend(nodes)

            page_info = result.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break
            cursor = page_info.get("endCursor")

        # Get all mapped Linear user IDs
        mapped_ids = set()
        mappings = db.query(UserMapping).filter(
            UserMapping.user_id == current_user.id,
            UserMapping.target_platform == "linear"
        ).all()

        for m in mappings:
            if m.target_identifier:
                mapped_ids.add(m.target_identifier)

        # Filter to unmapped users only
        unmapped_users = [
            {
                "id": u.get("id"),
                "name": u.get("name"),
                "email": u.get("email"),
                "active": u.get("active", True)
            }
            for u in all_users
            if u.get("id") and u.get("name") and u.get("id") not in mapped_ids and u.get("active", True)
        ]

        logger.info("[Linear] Found %d unmapped users out of %d total", len(unmapped_users), len(all_users))

        return {
            "success": True,
            "users": unmapped_users,
            "total_linear_users": len(all_users),
            "mapped_count": len(mapped_ids),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Linear] Failed to get unmapped users: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve unmapped Linear users: {str(e)}"
        )
