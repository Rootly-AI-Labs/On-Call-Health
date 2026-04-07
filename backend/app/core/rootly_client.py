"""
Rootly API client for direct HTTP integration.

Timeout and retry settings based on API benchmark (2026-01-20):
- incidents endpoints: avg 10-15s, p95 15-21s, max 21s
- users/schedules: avg <1s, p95 <2s

Recommended settings:
- Default timeout: 30s (covers most endpoints)
- Incidents timeout: 32s (1.5x P99 latency)
- Retries: 3 with exponential backoff [2s, 4s, 8s]
"""
import asyncio
import httpx
import logging
import pytz
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional, Callable, Set
from urllib.parse import urlencode

from .config import settings
from .api_cache import get_cached_api_response, set_cached_api_response

logger = logging.getLogger(__name__)

# Cache TTL for Rootly data (1 hour - users rarely change)
ROOTLY_CACHE_TTL_SECONDS = 3600

# Timeout settings based on API benchmark
DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
INCIDENTS_TIMEOUT = httpx.Timeout(32.0, connect=10.0)  # Incidents are slow (p95=21s)

# Retry settings
MAX_RETRIES = 3
RETRY_DELAYS = [2, 4, 8]  # Exponential backoff delays in seconds

# Retryable exceptions for network errors
RETRYABLE_EXCEPTIONS = (
    httpx.ConnectError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    ConnectionResetError,
    ConnectionError,
    OSError,
)


_TOP_ALERT_METRICS = ["total", "noise", "night_time", "after_hours", "no_incident", "escalated", "retrigger"]

def _build_top_alerts(per_alert_title: dict, per_alert_title_days: dict) -> list:
    """Return the union of top 50 alerts per each breakdown metric.

    This ensures the leaderboard always has the correct top offenders for every
    filter (Night-Time, After-Hours, etc.), not just the globally most-fired alerts.
    """
    all_alerts = [
        {"title": t, **counts, "days_fired": len(per_alert_title_days.get(t, set()))}
        for t, counts in per_alert_title.items()
    ]
    top_titles: set = set()
    for metric in _TOP_ALERT_METRICS:
        for a in sorted(all_alerts, key=lambda x: x.get(metric) or 0, reverse=True)[:50]:
            top_titles.add(a["title"])
    return sorted(
        [a for a in all_alerts if a["title"] in top_titles],
        key=lambda x: x["total"],
        reverse=True,
    )


class RootlyAPIClient:
    """Direct HTTP client for Rootly API."""

    def __init__(self, api_token: str, team_name: str = None):
        self.api_token = api_token
        self.team_name = team_name
        self.base_url = settings.ROOTLY_API_BASE_URL
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json"
        }

    async def _request_with_retry(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        max_retries: int = MAX_RETRIES,
        **kwargs
    ) -> httpx.Response:
        """
        Make an HTTP request with retry logic for transient network errors.

        Uses exponential backoff with delays defined in RETRY_DELAYS.

        Args:
            client: The httpx AsyncClient to use
            method: HTTP method (GET, POST, etc.)
            url: The URL to request
            max_retries: Maximum number of retry attempts (default: MAX_RETRIES)
            **kwargs: Additional arguments to pass to the request

        Returns:
            httpx.Response object

        Raises:
            The last exception if all retries fail
        """
        last_exception = None

        for attempt in range(max_retries + 1):
            try:
                if method.upper() == "GET":
                    response = await client.get(url, **kwargs)
                elif method.upper() == "POST":
                    response = await client.post(url, **kwargs)
                else:
                    response = await client.request(method, url, **kwargs)
                return response

            except RETRYABLE_EXCEPTIONS as e:
                last_exception = e
                if attempt < max_retries:
                    # Use predefined exponential backoff delays
                    delay = RETRY_DELAYS[attempt] if attempt < len(RETRY_DELAYS) else RETRY_DELAYS[-1]
                    logger.warning(
                        f"Rootly API request failed (attempt {attempt + 1}/{max_retries + 1}): "
                        f"{type(e).__name__}: {e}. Retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Rootly API request failed after {max_retries + 1} attempts: "
                        f"{type(e).__name__}: {e}"
                    )
                    raise
            except Exception as e:
                # Non-retryable exception, raise immediately
                logger.error(f"Rootly API request failed with non-retryable error: {type(e).__name__}: {e}")
                raise

        # This should not be reached, but just in case
        if last_exception:
            raise last_exception

    async def check_permissions(self, team_name: str = None) -> Dict[str, Any]:
        """Check permissions for specific API endpoints.

        For team-scoped keys, if the global incidents endpoint returns 404,
        incidents access is denied immediately — Rootly team keys have no IR role
        and cannot access incident data under any filter.
        """
        permissions = {
            "users": {"access": False, "error": None},
            "incidents": {"access": False, "error": None}
        }

        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                # Test users endpoint
                try:
                    response = await client.get(
                        f"{self.base_url}/v1/users",
                        headers=self.headers,
                        params={"page[size]": 1}
                    )

                    if response.status_code == 200:
                        permissions["users"]["access"] = True
                        logger.info(f" Rootly users permission check: SUCCESS")
                    elif response.status_code == 401:
                        permissions["users"]["error"] = "Unauthorized - check API token"
                        logger.warning(f"Rootly users permission check: 401 Unauthorized")
                    elif response.status_code == 403:
                        permissions["users"]["error"] = "Token needs 'users:read' permission"
                        logger.warning(f"Rootly users permission check: 403 Forbidden")
                    elif response.status_code == 404:
                        permissions["users"]["error"] = "API token doesn't have access to user data"
                        logger.warning(f"Rootly users permission check: 404 Not Found")
                    else:
                        permissions["users"]["error"] = f"HTTP {response.status_code}"
                        logger.warning(f"Rootly users permission check: HTTP {response.status_code}")

                except Exception as e:
                    permissions["users"]["error"] = f"Connection error: {str(e)}"
                    logger.error(f"Rootly users permission check: Exception - {str(e)}")

                # Test incidents endpoint
                try:
                    response = await client.get(
                        f"{self.base_url}/v1/incidents",
                        headers=self.headers,
                        params={"page[size]": 1},
                        timeout=30.0
                    )

                    if response.status_code == 200:
                        permissions["incidents"]["access"] = True
                    elif response.status_code == 401:
                        permissions["incidents"]["error"] = "Unauthorized - check API token"
                    elif response.status_code == 403:
                        permissions["incidents"]["error"] = "Token needs 'incidents:read' permission"
                    elif response.status_code == 404 and team_name:
                        # Team-scoped keys always return 404 on /v1/incidents — Rootly product limitation.
                        # Team keys have no IR role and cannot access incident data under any filter.
                        permissions["incidents"]["error"] = (
                            "Team API keys do not have access to incident data. "
                            "Please use a Global API key (created by an org admin) to analyze incidents."
                        )
                        logger.warning(f"Rootly incidents: 404 for team key '{team_name}' — team keys cannot access incidents")
                    elif response.status_code == 404:
                        permissions["incidents"]["error"] = "API token doesn't have access to incident data"
                    else:
                        permissions["incidents"]["error"] = f"HTTP {response.status_code}"

                except Exception as e:
                    permissions["incidents"]["error"] = f"Connection error: {str(e)}"

        except Exception as e:
            logger.error(f"Error checking permissions: {e}")
            permissions["users"]["error"] = f"General error: {str(e)}"
            permissions["incidents"]["error"] = f"General error: {str(e)}"

        return permissions

    async def test_connection(self) -> Dict[str, Any]:
        """Test API connection and return basic account info with permissions.

        Key type detection uses the incidents endpoint (not full_name_with_team):
        - GET /v1/incidents returns 200  → global key
        - GET /v1/incidents returns 404  → team-scoped key (can't see all incidents)
        """
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                # Make four API calls in parallel for faster response
                me_task = client.get(
                    f"{self.base_url}/v1/users/me",
                    headers=self.headers
                )
                users_task = client.get(
                    f"{self.base_url}/v1/users?page[size]=1",
                    headers=self.headers
                )
                incidents_task = client.get(
                    f"{self.base_url}/v1/incidents",
                    headers=self.headers,
                    params={"page[size]": 1},
                )
                teams_task = client.get(
                    f"{self.base_url}/v1/teams",
                    headers=self.headers,
                    params={"page[size]": 5}
                )

                # Wait for all four calls to complete in parallel
                me_response, users_response, incidents_response, teams_response = await asyncio.gather(
                    me_task, users_task, incidents_task, teams_task
                )

                # Check /v1/users/me response for errors
                if me_response.status_code != 200:
                    if me_response.status_code == 401:
                        return {
                            "status": "error",
                            "message": "Invalid API token",
                            "error_code": "UNAUTHORIZED"
                        }
                    elif me_response.status_code == 404:
                        return {
                            "status": "error",
                            "message": "API endpoint not found - check your Rootly configuration",
                            "error_code": "NOT_FOUND"
                        }
                    else:
                        return {
                            "status": "error",
                            "message": f"API request failed with status {me_response.status_code}",
                            "error_code": "API_ERROR"
                        }

                me_data = me_response.json()
                if me_data is None:
                    logger.error("API response json() returned None")
                    return {
                        "status": "error",
                        "message": "Invalid JSON response from API",
                        "error_code": "INVALID_RESPONSE"
                    }

                # --- Key type detection ---
                # Global keys: /v1/incidents returns 200
                # Team-scoped keys: /v1/incidents returns 404 (they can't list all incidents)
                key_type = "global"
                team_name = None

                if incidents_response.status_code == 404:
                    key_type = "team"
                    # Get owning team name from /v1/teams (team keys only see their own team)
                    if teams_response.status_code == 200:
                        teams_list = teams_response.json().get("data", [])
                        if teams_list:
                            team_name = teams_list[0].get("attributes", {}).get("name")
                            logger.info(f" Team-scoped key detected via 404. Owning team: '{team_name}'")
                        else:
                            logger.info(f" Team-scoped key: /v1/teams returned empty list")
                    else:
                        logger.info(f" Team-scoped key: /v1/teams status={teams_response.status_code}")
                else:
                    logger.info(f" Global key detected (incidents endpoint: {incidents_response.status_code})")

                # --- Extract organization name from /v1/users/me ---
                organization_name = None
                if "data" in me_data and isinstance(me_data["data"], dict):
                    user = me_data["data"]
                    if "attributes" in user:
                        attrs = user["attributes"]
                        full_name_with_team = attrs.get("full_name_with_team")
                        logger.info(
                            f" Rootly API returned user attributes: "
                            f"full_name_with_team='{full_name_with_team}', "
                            f"organization_name='{attrs.get('organization_name')}', "
                            f"company='{attrs.get('company')}'"
                        )

                        if key_type == "team" and team_name:
                            # For team keys, use the team name as the display name
                            organization_name = team_name
                        else:
                            # For global keys, extract org name from full_name_with_team brackets
                            # (format: "[Org Name] User Full Name") or fall back to other fields
                            if full_name_with_team and full_name_with_team.startswith("[") and "]" in full_name_with_team:
                                organization_name = full_name_with_team.split("]")[0][1:]
                                logger.info(f" Extracted org name from full_name_with_team: '{organization_name}'")
                            elif "organization_name" in attrs:
                                organization_name = attrs["organization_name"]
                                logger.info(f" Using organization_name attribute: '{organization_name}'")
                            elif "company" in attrs:
                                organization_name = attrs["company"]
                                logger.info(f" Using company attribute: '{organization_name}'")

                # Extract total user count from /v1/users response
                total_users = 0
                if users_response.status_code == 200:
                    users_data = users_response.json()
                    if users_data and "meta" in users_data:
                        total_users = users_data["meta"].get("total_count", 0)
                        logger.debug(f"Rootly users API: {total_users} total users")

                # Build account info
                account_info = {
                    "api_version": "v1",
                    "total_users": total_users,
                    "key_type": key_type,
                    "team_name": team_name,
                }

                if organization_name:
                    account_info["organization_name"] = organization_name

                # Check permissions — pass team_name so team-scoped 404 is handled correctly
                permissions = await self.check_permissions(team_name=team_name)
                account_info["permissions"] = permissions

                return {
                    "status": "success",
                    "message": "Connected successfully",
                    "account_info": account_info
                }

        except httpx.ConnectError:
            return {
                "status": "error",
                "message": "Unable to connect to Rootly API - check your internet connection",
                "error_code": "CONNECTION_ERROR"
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Unexpected error: {str(e)}",
                "error_code": "UNKNOWN_ERROR"
            }
    
    async def get_teams(self) -> List[Dict[str, Any]]:
        """Fetch all teams from Rootly API (global keys only)."""
        all_teams = []
        page = 1
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                while True:
                    response = await client.get(
                        f"{self.base_url}/v1/teams",
                        headers=self.headers,
                        params={"page[size]": 100, "page[number]": page}
                    )
                    if response.status_code != 200:
                        break
                    data = response.json()
                    for team in data.get("data", []):
                        all_teams.append({
                            "id": team.get("id"),
                            "name": team.get("attributes", {}).get("name"),
                            "slug": team.get("attributes", {}).get("slug"),
                            "member_count": len(team.get("attributes", {}).get("user_ids") or []),
                        })
                    meta = data.get("meta", {})
                    if page >= meta.get("total_pages", 1):
                        break
                    page += 1
        except Exception as e:
            logger.error(f"Error fetching teams: {e}")
        return all_teams

    async def get_team_user_ids(self, team_name: str) -> List[str]:
        """Fetch Rootly user IDs that belong to a specific team.

        Uses GET /v1/teams?filter[name]=<team_name> and returns the user_ids
        list from the matching team's attributes.

        Returns:
            List of Rootly user ID strings (e.g. ["154534", "154535"]).
            Empty list if the team is not found or request fails.
        """
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                response = await client.get(
                    f"{self.base_url}/v1/teams",
                    headers=self.headers,
                    params={"filter[name]": team_name, "page[size]": 10}
                )
                if response.status_code != 200:
                    logger.warning(f"Could not fetch team '{team_name}': HTTP {response.status_code}")
                    return []
                data = response.json()
                for team in data.get("data", []):
                    name = team.get("attributes", {}).get("name", "")
                    if name.lower() == team_name.lower():
                        user_ids = team.get("attributes", {}).get("user_ids") or []
                        logger.info(f"Team '{team_name}' has {len(user_ids)} members: {user_ids}")
                        return [str(uid) for uid in user_ids]
                logger.warning(f"Team '{team_name}' not found in teams response")
        except Exception as e:
            logger.error(f"Error fetching team user IDs for '{team_name}': {e}")
        return []

    async def get_team_id(self, team_name: str) -> Optional[str]:
        """Fetch Rootly team ID by team name.

        Uses GET /v1/teams?filter[name]=<team_name> and returns the team's id.

        Returns:
            Team ID as a string, or None if not found / request fails.
        """
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                response = await client.get(
                    f"{self.base_url}/v1/teams",
                    headers=self.headers,
                    params={"filter[name]": team_name, "page[size]": 10}
                )
                if response.status_code != 200:
                    logger.warning(f"Could not fetch team ID for '{team_name}': HTTP {response.status_code}")
                    return None
                data = response.json()
                for team in data.get("data", []):
                    name = team.get("attributes", {}).get("name", "")
                    if name.lower() == team_name.lower():
                        team_id = team.get("id")
                        if team_id:
                            logger.info(f"Team '{team_name}' resolved to ID {team_id}")
                            return str(team_id)
                logger.warning(f"Team '{team_name}' not found in teams response when resolving ID")
        except Exception as e:
            logger.error(f"Error fetching team ID for '{team_name}': {e}")
        return None

    async def get_alerts_count(
        self,
        start_date: datetime,
        end_date: datetime,
        team_id: Optional[str] = None,
        page_size: int = 100,
        max_pages: int = 200,
        user_ids: Optional[Set[str]] = None,
        user_emails: Optional[Set[str]] = None,
        include: Optional[str] = None,
        user_timezones_by_id: Optional[Dict[str, str]] = None,
        user_timezones_by_email: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Fetch alert counts within a date range.

        If team_id is provided, counts only alerts that include that team_id
        in attributes.group_ids (client-side filter).
        If user_ids or user_emails are provided, also compute per-user alert counts
        based on responders/notified_users and relationships.
        """
        base_params = {
            "filter[created_at][gte]": start_date.isoformat(),
            "filter[created_at][lte]": end_date.isoformat(),
        }
        if include:
            base_params["include"] = include

        user_ids_set = {str(uid) for uid in (user_ids or set()) if uid}
        user_emails_set = {str(email).lower() for email in (user_emails or set()) if email}
        user_tz_by_id = {str(k): v for k, v in (user_timezones_by_id or {}).items() if k}
        user_tz_by_email = {str(k).lower(): v for k, v in (user_timezones_by_email or {}).items() if k}
        wants_user_counts = bool(user_ids_set or user_emails_set)

        related_id_sets: Dict[str, Set[str]] = {}
        included_id_sets: Dict[str, Set[str]] = {}
        noise_counts: Dict[str, int] = {"noise": 0, "not_noise": 0, "unknown": 0}
        source_counts: Dict[str, int] = {}
        derived_source_counts: Dict[str, int] = {}
        alerts_with_incidents_count = 0
        after_hours_count = 0
        night_time_count = 0
        urgency_counts: Dict[str, int] = {}
        per_alert_title: Dict[str, Dict[str, int]] = {}  # alert summary → {total, noise, night_time, after_hours, no_incident, escalated, retriggered, days_fired}
        per_alert_title_days: Dict[str, Set[str]] = {}  # alert summary → set of distinct days fired (for days_fired count)
        daily_alert_breakdown: Dict[str, Dict[str, int]] = {}  # "YYYY-MM-DD" → {total, incidents, after_hours, night_time, escalated, retrigger}

        def _parse_dt(value: Optional[str]) -> Optional[datetime]:
            if not value:
                return None
            try:
                v = value
                if v.endswith("Z"):
                    v = v[:-1] + "+00:00"
                return datetime.fromisoformat(v)
            except Exception:
                return None

        def _is_after_hours(dt_value: datetime, tz_name: Optional[str]) -> bool:
            try:
                tz = pytz.timezone(tz_name or "UTC")
                dt_local = dt_value.astimezone(tz)
            except Exception:
                dt_local = dt_value.astimezone(timezone.utc)
            # Weekend counts as after-hours
            if dt_local.weekday() >= 5:
                return True
            return dt_local.hour < settings.BUSINESS_HOURS_START or dt_local.hour >= settings.BUSINESS_HOURS_END

        def _is_night_time(dt_value: datetime, tz_name: Optional[str]) -> bool:
            try:
                tz = pytz.timezone(tz_name or "UTC")
                dt_local = dt_value.astimezone(tz)
            except Exception:
                dt_local = dt_value.astimezone(timezone.utc)
            # Night: LATE_NIGHT_START (22) to LATE_NIGHT_END (6) wraps midnight
            h = dt_local.hour
            return h >= settings.LATE_NIGHT_START or h < settings.LATE_NIGHT_END

        generic_sources = {"generic_webhook", "workflow", "web", "manual", "slack", "rootly", "unknown"}
        vendor_patterns = {
            "chronosphere": ["chronosphere"],
            "datadog": ["datadog"],
            "prometheus": ["prometheus"],
            "alertmanager": ["alertmanager"],
            "grafana": ["grafana"],
            "pagerduty": ["pagerduty", "pager duty"],
            "opsgenie": ["opsgenie"],
            "victorops": ["victorops", "victor ops"],
            "newrelic": ["newrelic", "new relic"],
            "sentry": ["sentry"],
            "bugsnag": ["bugsnag"],
            "splunk": ["splunk"],
            "sumologic": ["sumologic", "sumo logic"],
            "cloudwatch": ["cloudwatch", "aws cloudwatch"],
            "stackdriver": ["stackdriver", "google cloud monitoring"],
            "elastic": ["elasticsearch", "elastic", "kibana"],
            "honeycomb": ["honeycomb"],
            "signalfx": ["signalfx", "signal fx"],
            "dynatrace": ["dynatrace"],
            "appdynamics": ["appdynamics", "app dynamics"],
            "zabbix": ["zabbix"],
            "nagios": ["nagios"],
            "pingdom": ["pingdom"]
        }

        vendor_domains = {
            "datadog": ["datadoghq.com", "datadog.com"],
            "grafana": ["grafana.com", "/grafana/"],
            "cloudwatch": ["console.aws.amazon.com/cloudwatch", "amazonaws.com"],
            "newrelic": ["newrelic.com", "one.newrelic.com"],
            "sentry": ["sentry.io"],
            "pagerduty": ["pagerduty.com"],
            "opsgenie": ["opsgenie.com", "atlassian.com"],
            "prometheus": ["prometheus.io"],
            "splunk": ["splunk.com"],
            "dynatrace": ["dynatrace.com", "live.dynatrace.com"],
            "honeycomb": ["honeycomb.io"],
            "pingdom": ["pingdom.com"],
        }

        def _map_vendor(value: str) -> Optional[str]:
            lower_value = value.lower()
            for vendor, patterns in vendor_patterns.items():
                for pattern in patterns:
                    if pattern in lower_value:
                        return vendor
            return None

        def _iter_strings(payload: Any, limit: int = 200):
            stack = [payload]
            seen = 0
            while stack and seen < limit:
                current = stack.pop()
                if isinstance(current, dict):
                    for item in current.values():
                        stack.append(item)
                elif isinstance(current, list):
                    for item in current:
                        stack.append(item)
                elif isinstance(current, str):
                    value = current.strip()
                    if value:
                        yield value
                        seen += 1

        def _derive_origin(attrs: Dict[str, Any]) -> str:
            source_value = (attrs.get("source") or "").strip().lower()
            if source_value and source_value not in generic_sources:
                return source_value

            # Step 1: Check external_url domain
            external_url = attrs.get("external_url") or ""
            if external_url:
                for vendor, domains in vendor_domains.items():
                    if any(d in external_url for d in domains):
                        return vendor

            # Step 2: Check alert_field_values for source/tool field
            field_values = attrs.get("alert_field_values") or []
            if isinstance(field_values, list):
                for fv in field_values:
                    if isinstance(fv, dict):
                        name = str(fv.get("name") or fv.get("slug") or "").lower()
                        val = str(fv.get("value") or "").lower()
                        if name in ("source", "tool", "integration", "origin", "provider"):
                            mapped = _map_vendor(val)
                            return mapped or val

            # Step 3: Check labels keys for vendor-specific patterns
            labels = attrs.get("labels") or []
            if isinstance(labels, list):
                label_keys = {str(l.get("key", "")).lower() for l in labels if isinstance(l, dict)}
                label_vals = {str(l.get("value", "")).lower() for l in labels if isinstance(l, dict)}
                if "alertname" in label_keys or "job" in label_keys or "severity" in label_keys:
                    return "prometheus"
                for v in label_vals:
                    mapped = _map_vendor(v)
                    if mapped:
                        return mapped

            # Step 4: Check summary/description bracket prefixes and vendor name scan
            for text_field in ("summary", "description"):
                text = (attrs.get(text_field) or "").strip()
                if text:
                    if text.startswith("["):
                        bracket_end = text.find("]")
                        if bracket_end > 0:
                            prefix = text[1:bracket_end]
                            mapped = _map_vendor(prefix)
                            if mapped:
                                return mapped
                    mapped = _map_vendor(text[:200])
                    if mapped:
                        return mapped

            data = attrs.get("data")
            if isinstance(data, dict):
                # Step 5: Check named keys in data
                for key in ("source", "integration", "provider", "vendor", "tool", "origin", "service"):
                    val = data.get(key)
                    if isinstance(val, str) and val.strip():
                        mapped = _map_vendor(val)
                        return mapped or val.strip().lower()

                # Step 6: Check payload shape patterns
                if any(k in data for k in ("AlarmName", "AlarmArn", "AWSAccountId", "Trigger", "NewStateReason")):
                    return "cloudwatch"

                if any(k in data for k in ("ruleName", "ruleUrl", "orgId", "dashboardId", "panelId")):
                    return "grafana"

                if any(k in data for k in ("event_type", "alert_type", "alert_metric", "last_updated", "scopes")):
                    return "datadog"

                if any(k in data for k in ("nrqlQuery", "nrqlConditionName", "policyName", "incidentId")):
                    return "newrelic"

                if any(k in data for k in ("project", "culprit", "event", "sentry_dsn")):
                    return "sentry"

                if any(k in data for k in ("action", "alert", "integrationName", "integrationId")):
                    if isinstance(data.get("alert"), dict):
                        return "opsgenie"

                # Step 7: Check Alertmanager keys
                if any(key in data for key in ("commonLabels", "groupLabels", "receiver", "alerts", "groupKey", "externalURL")):
                    return "alertmanager"

                # Step 8: Deep string iteration (fallback)
                for value in _iter_strings(data):
                    mapped = _map_vendor(value)
                    if mapped:
                        return mapped

            # Step 9: Check deduplication_key / external_id for vendor prefixes
            for key_field in ("deduplication_key", "external_id"):
                key_val = attrs.get(key_field) or ""
                if key_val:
                    mapped = _map_vendor(str(key_val))
                    if mapped:
                        return mapped

            return source_value or "unknown"

        # Fast path: total count only (no team filter, no user counts, no include metrics)
        if not team_id and not wants_user_counts:
            try:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                    response = await client.get(
                        f"{self.base_url}/v1/alerts",
                        headers=self.headers,
                        params={**base_params, "page[size]": 1, "page[number]": 1}
                    )
                    if response.status_code != 200:
                        return {"error": f"HTTP {response.status_code}"}
                    data = response.json()
                    meta = data.get("meta", {}) or {}
                    total = meta.get("total_count")
                    if total is None:
                        total = len(data.get("data", []))
                    return {
                        "total_count": total,
                        "filtered_count": None,
                        "pages_scanned": 1,
                        "total_pages": meta.get("total_pages"),
                        "per_user_id_counts": {},
                        "per_user_email_counts": {},
                        "per_user_notified_by_id": {},
                        "per_user_notified_by_email": {},
                        "per_user_responded_by_id": {},
                        "per_user_responded_by_email": {},
                        "per_user_alerts_with_incidents_by_id": {},
                        "per_user_alerts_with_incidents_by_email": {},
                        "per_user_source_by_id": {},
                        "per_user_source_by_email": {},
                        "per_user_derived_source_by_id": {},
                        "per_user_derived_source_by_email": {},
                        "related_counts": {},
                        "included_counts": {},
                        "noise_counts": {"noise": 0, "not_noise": 0, "unknown": 0},
                        "source_counts": {},
                        "derived_source_counts": {},
                        "per_user_noise_by_id": {},
                        "per_user_noise_by_email": {},
                        "after_hours_count": 0,
                        "per_user_after_hours_by_id": {},
                        "per_user_after_hours_by_email": {},
                        "night_time_count": 0,
                        "per_user_night_time_by_id": {},
                        "per_user_night_time_by_email": {},
                        "urgency_counts": {},
                        "per_user_urgency_by_id": {},
                        "per_user_urgency_by_email": {},
                        "alerts_with_incidents_count": 0,
                        "avg_mtta_seconds": None,
                        "mtta_count": 0,
                        "avg_mttr_seconds": None,
                        "mttr_count": 0,
                        "escalated_count": 0,
                        "retrigger_count": 0,
                        "per_user_acked_by_id": {},
                        "per_user_acked_by_email": {},
                        "per_user_resolved_by_id": {},
                        "per_user_resolved_by_email": {},
                        "per_user_escalated_by_id": {},
                        "per_user_escalated_by_email": {},
                        "per_user_retriggered_by_id": {},
                        "per_user_retriggered_by_email": {},
                        "per_user_mtta_avg_by_id": {},
                        "per_user_mtta_avg_by_email": {},
                        "per_user_mttr_avg_by_id": {},
                        "per_user_mttr_avg_by_email": {},
                    }
            except Exception as e:
                return {"error": str(e)}

        # Paginate and filter by group_ids if team_id is provided
        filtered_count = 0
        total_count = None
        total_pages = None
        truncated = False
        page = 1
        per_user_id_counts: Dict[str, int] = {}
        per_user_email_counts: Dict[str, int] = {}
        per_user_notified_by_id: Dict[str, int] = {}
        per_user_notified_by_email: Dict[str, int] = {}
        per_user_responded_by_id: Dict[str, int] = {}
        per_user_responded_by_email: Dict[str, int] = {}
        per_user_alerts_with_incidents_by_id: Dict[str, int] = {}
        per_user_alerts_with_incidents_by_email: Dict[str, int] = {}
        per_user_source_by_id: Dict[str, Dict[str, int]] = {}
        per_user_source_by_email: Dict[str, Dict[str, int]] = {}
        per_user_derived_source_by_id: Dict[str, Dict[str, int]] = {}
        per_user_derived_source_by_email: Dict[str, Dict[str, int]] = {}
        per_user_noise_by_id: Dict[str, Dict[str, int]] = {}
        per_user_noise_by_email: Dict[str, Dict[str, int]] = {}
        per_user_after_hours_by_id: Dict[str, int] = {}
        per_user_after_hours_by_email: Dict[str, int] = {}
        per_user_night_time_by_id: Dict[str, int] = {}
        per_user_night_time_by_email: Dict[str, int] = {}
        per_user_daily_by_id: Dict[str, Dict[str, Dict[str, int]]] = {}
        per_user_daily_by_email: Dict[str, Dict[str, Dict[str, int]]] = {}
        per_user_alert_title_by_id: Dict[str, Dict[str, Dict[str, int]]] = {}
        per_user_alert_title_by_email: Dict[str, Dict[str, Dict[str, int]]] = {}
        per_user_urgency_by_id: Dict[str, Dict[str, int]] = {}
        per_user_urgency_by_email: Dict[str, Dict[str, int]] = {}
        per_user_related_by_id: Dict[str, Dict[str, Set[str]]] = {}
        per_user_related_by_email: Dict[str, Dict[str, Set[str]]] = {}

        # New: event-derived metrics
        mtta_sum: float = 0.0
        mtta_count: int = 0
        escalated_count: int = 0
        retrigger_count: int = 0
        per_user_acked_by_id: Dict[str, int] = {}
        per_user_acked_by_email: Dict[str, int] = {}
        per_user_resolved_by_id: Dict[str, int] = {}
        per_user_resolved_by_email: Dict[str, int] = {}
        per_user_escalated_by_id: Dict[str, int] = {}
        per_user_escalated_by_email: Dict[str, int] = {}
        per_user_retriggered_by_id: Dict[str, int] = {}
        per_user_retriggered_by_email: Dict[str, int] = {}
        per_user_mtta_sum_by_id: Dict[str, float] = {}
        per_user_mtta_count_by_id: Dict[str, int] = {}
        per_user_mtta_sum_by_email: Dict[str, float] = {}
        per_user_mtta_count_by_email: Dict[str, int] = {}
        mttr_sum: float = 0.0
        mttr_count: int = 0
        per_user_mttr_sum_by_id: Dict[str, float] = {}
        per_user_mttr_count_by_id: Dict[str, int] = {}
        per_user_mttr_sum_by_email: Dict[str, float] = {}
        per_user_mttr_count_by_email: Dict[str, int] = {}

        def add_related(collector: Dict[str, Set[str]], rel_name: str, rel_id: Optional[str]):
            if not rel_name or not rel_id:
                return
            bucket = collector.setdefault(rel_name, set())
            bucket.add(str(rel_id))

        def merge_related(target: Dict[str, Dict[str, Set[str]]], key: str, rel_name: str, rel_ids: Set[str]):
            if not rel_ids:
                return
            user_bucket = target.setdefault(key, {})
            rel_bucket = user_bucket.setdefault(rel_name, set())
            rel_bucket.update(rel_ids)

        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                while True:
                    response = await client.get(
                        f"{self.base_url}/v1/alerts",
                        headers=self.headers,
                        params={**base_params, "page[size]": page_size, "page[number]": page}
                    )
                    if response.status_code != 200:
                        return {
                            "error": f"HTTP {response.status_code}",
                            "total_count": total_count,
                            "filtered_count": filtered_count,
                            "pages_scanned": page - 1,
                            "total_pages": total_pages,
                            "truncated": True,
                            "per_user_id_counts": per_user_id_counts,
                            "per_user_email_counts": per_user_email_counts,
                            "per_user_notified_by_id": per_user_notified_by_id,
                            "per_user_notified_by_email": per_user_notified_by_email,
                            "per_user_responded_by_id": per_user_responded_by_id,
                            "per_user_responded_by_email": per_user_responded_by_email,
                            "per_user_alerts_with_incidents_by_id": per_user_alerts_with_incidents_by_id,
                            "per_user_alerts_with_incidents_by_email": per_user_alerts_with_incidents_by_email,
                            "per_user_source_by_id": per_user_source_by_id,
                            "per_user_source_by_email": per_user_source_by_email,
                            "per_user_derived_source_by_id": per_user_derived_source_by_id,
                            "per_user_derived_source_by_email": per_user_derived_source_by_email,
                            "related_counts": {k: len(v) for k, v in related_id_sets.items()},
                            "included_counts": {k: len(v) for k, v in included_id_sets.items()},
                            "per_user_related_by_id": {k: {rk: len(rv) for rk, rv in v.items()} for k, v in per_user_related_by_id.items()},
                            "per_user_related_by_email": {k: {rk: len(rv) for rk, rv in v.items()} for k, v in per_user_related_by_email.items()},
                            "noise_counts": noise_counts,
                            "source_counts": source_counts,
                            "derived_source_counts": derived_source_counts,
                            "per_user_noise_by_id": per_user_noise_by_id,
                            "per_user_noise_by_email": per_user_noise_by_email,
                            "after_hours_count": after_hours_count,
                            "per_user_after_hours_by_id": per_user_after_hours_by_id,
                            "per_user_after_hours_by_email": per_user_after_hours_by_email,
                            "night_time_count": night_time_count,
                            "per_user_night_time_by_id": per_user_night_time_by_id,
                            "per_user_night_time_by_email": per_user_night_time_by_email,
                            "per_user_daily_by_id": per_user_daily_by_id,
                            "per_user_daily_by_email": per_user_daily_by_email,
                            "urgency_counts": urgency_counts,
                            "per_user_urgency_by_id": per_user_urgency_by_id,
                            "per_user_urgency_by_email": per_user_urgency_by_email,
                            "alerts_with_incidents_count": alerts_with_incidents_count,
                            "daily_alert_breakdown": daily_alert_breakdown,
                        }

                    data = response.json()
                    meta = data.get("meta", {}) or {}
                    if total_count is None:
                        total_count = meta.get("total_count")
                        total_pages = meta.get("total_pages") or 1

                    included = data.get("included") or []
                    event_lookup: Dict[str, Dict] = {}
                    for item in included:
                        if not isinstance(item, dict):
                            continue
                        item_type = item.get("type")
                        item_id = item.get("id")
                        if item_type and item_id:
                            add_related(included_id_sets, item_type, item_id)
                        if item_type == "alert_events" and item_id:
                            event_lookup[item_id] = item.get("attributes", {}) or {}

                    for alert in data.get("data", []):
                        attrs = alert.get("attributes", {}) or {}
                        alert_dt = _parse_dt(attrs.get("created_at") or attrs.get("started_at") or attrs.get("updated_at"))
                        group_ids = attrs.get("group_ids") or []
                        if not group_ids:
                            groups = attrs.get("groups") or []
                            group_ids = [g.get("id") for g in groups if isinstance(g, dict) and g.get("id")]

                        in_scope = True
                        if team_id:
                            in_scope = team_id in group_ids

                        if in_scope:
                            filtered_count += 1
                            # Per-day breakdown — track total for every in-scope alert
                            if alert_dt:
                                _day_key = alert_dt.strftime("%Y-%m-%d")
                                if _day_key not in daily_alert_breakdown:
                                    daily_alert_breakdown[_day_key] = {"total": 0, "incidents": 0, "after_hours": 0, "night_time": 0, "escalated": 0, "retrigger": 0}
                                daily_alert_breakdown[_day_key]["total"] += 1
                                if _is_after_hours(alert_dt, None):
                                    daily_alert_breakdown[_day_key]["after_hours"] += 1
                                if _is_night_time(alert_dt, None):
                                    daily_alert_breakdown[_day_key]["night_time"] += 1
                            else:
                                _day_key = None
                            noise_value = attrs.get("noise")
                            if noise_value == "noise":
                                noise_counts["noise"] += 1
                            elif noise_value == "not_noise":
                                noise_counts["not_noise"] += 1
                            else:
                                noise_counts["unknown"] += 1
                            source_value = attrs.get("source") or "unknown"
                            source_counts[source_value] = source_counts.get(source_value, 0) + 1
                            derived_source = _derive_origin(attrs)
                            derived_source_counts[derived_source] = derived_source_counts.get(derived_source, 0) + 1
                            alert_after_hours_any = False
                            alert_night_time_any = False

                            urgency_key = "unknown"
                            urgency_obj = attrs.get("alert_urgency")
                            if isinstance(urgency_obj, dict):
                                urgency_key = urgency_obj.get("urgency") or urgency_obj.get("name") or urgency_obj.get("id") or "unknown"
                            elif isinstance(urgency_obj, str):
                                urgency_key = urgency_obj
                            elif attrs.get("alert_urgency_id"):
                                urgency_key = str(attrs.get("alert_urgency_id"))
                            urgency_counts[urgency_key] = urgency_counts.get(urgency_key, 0) + 1

                            has_incident = False
                            incident_ids = attrs.get("incident_ids")
                            if isinstance(incident_ids, list) and len(incident_ids) > 0:
                                has_incident = True
                            incidents_attr = attrs.get("incidents")
                            if isinstance(incidents_attr, list) and len(incidents_attr) > 0:
                                has_incident = True
                            rel_incidents = (alert.get("relationships", {}) or {}).get("incidents", {})
                            rel_data = rel_incidents.get("data") if isinstance(rel_incidents, dict) else None
                            if isinstance(rel_data, list) and len(rel_data) > 0:
                                has_incident = True
                            if isinstance(rel_data, dict) and rel_data.get("id"):
                                has_incident = True
                            if has_incident:
                                alerts_with_incidents_count += 1
                                if _day_key:
                                    daily_alert_breakdown[_day_key]["incidents"] += 1

                            # --- Event-derived metrics (MTTA, escalation, retrigger, ack/resolve) ---
                            rel_events_data = (alert.get("relationships", {}) or {}).get("events", {})
                            event_rel_items = rel_events_data.get("data") if isinstance(rel_events_data, dict) else None
                            alert_event_list: list = []
                            if isinstance(event_rel_items, list):
                                for ev_ref in event_rel_items:
                                    if isinstance(ev_ref, dict) and ev_ref.get("id") in event_lookup:
                                        alert_event_list.append(event_lookup[ev_ref["id"]])
                            alert_event_list.sort(key=lambda e: e.get("created_at") or "")

                            # MTTA: alert start → first acknowledged event
                            alert_started_at = _parse_dt(attrs.get("started_at") or attrs.get("created_at"))
                            mtta_seconds = None
                            first_ack_event = next((e for e in alert_event_list if e.get("action") == "acknowledged"), None)
                            if first_ack_event and alert_started_at:
                                ack_dt = _parse_dt(first_ack_event.get("created_at"))
                                if ack_dt and ack_dt > alert_started_at:
                                    mtta_seconds = (ack_dt - alert_started_at).total_seconds()
                                    mtta_sum += mtta_seconds
                                    mtta_count += 1

                            # MTTR: alert start → ended_at (resolved)
                            mttr_seconds = None
                            ended_at_dt = _parse_dt(attrs.get("ended_at"))
                            if ended_at_dt and alert_started_at and ended_at_dt > alert_started_at:
                                mttr_seconds = (ended_at_dt - alert_started_at).total_seconds()
                                mttr_sum += mttr_seconds
                                mttr_count += 1

                            # Escalation: any event with escalation_level position >= 2
                            is_escalated = False
                            for ev in alert_event_list:
                                el = ev.get("escalation_level")
                                if isinstance(el, dict):
                                    try:
                                        if int(el.get("position", 1)) >= 2:
                                            is_escalated = True
                                            break
                                    except (ValueError, TypeError):
                                        pass
                                elif isinstance(el, int) and el >= 2:
                                    is_escalated = True
                                    break
                            if is_escalated:
                                escalated_count += 1
                                if _day_key:
                                    daily_alert_breakdown[_day_key]["escalated"] += 1

                            # Retrigger: any event with action == "retriggered"
                            is_retriggered = any(e.get("action") == "retriggered" for e in alert_event_list)
                            if is_retriggered:
                                retrigger_count += 1
                                if _day_key:
                                    daily_alert_breakdown[_day_key]["retrigger"] += 1

                            # Per-alert-title aggregation
                            alert_title = (attrs.get("summary") or attrs.get("description") or "Unknown Alert").strip()
                            if len(alert_title) > 120:
                                alert_title = alert_title[:120] + "…"
                            if alert_title not in per_alert_title:
                                per_alert_title[alert_title] = {"total": 0, "noise": 0, "night_time": 0, "after_hours": 0, "no_incident": 0, "escalated": 0, "retriggered": 0, "days_fired": 0}
                                per_alert_title_days[alert_title] = set()
                            per_alert_title[alert_title]["total"] += 1
                            if noise_value == "noise":
                                per_alert_title[alert_title]["noise"] += 1
                            if not has_incident:
                                per_alert_title[alert_title]["no_incident"] += 1
                            if is_escalated:
                                per_alert_title[alert_title]["escalated"] += 1
                            if is_retriggered:
                                per_alert_title[alert_title]["retriggered"] += 1
                            if _day_key:
                                per_alert_title_days[alert_title].add(_day_key)

                            # Who acknowledged and who resolved (from event user fields)
                            def _extract_user_ids_emails(ev: dict):
                                uids: Set[str] = set()
                                uemails: Set[str] = set()
                                u = ev.get("user")
                                uid = ev.get("user_id")
                                if isinstance(u, dict):
                                    if u.get("id"):
                                        uids.add(str(u["id"]))
                                    if u.get("email"):
                                        uemails.add(str(u["email"]).lower())
                                if uid:
                                    uids.add(str(uid))
                                return uids, uemails

                            acker_ids: Set[str] = set()
                            acker_emails: Set[str] = set()
                            if first_ack_event:
                                acker_ids, acker_emails = _extract_user_ids_emails(first_ack_event)

                            resolver_ids: Set[str] = set()
                            resolver_emails: Set[str] = set()
                            for ev in alert_event_list:
                                if ev.get("action") == "resolved":
                                    rids, remails = _extract_user_ids_emails(ev)
                                    resolver_ids |= rids
                                    resolver_emails |= remails

                        # Build related IDs for this alert from relationships + groups
                        alert_related: Dict[str, Set[str]] = {}
                        if group_ids:
                            alert_related["groups"] = set(str(gid) for gid in group_ids if gid)

                        relationships = alert.get("relationships", {}) or {}
                        for rel_name, rel_obj in relationships.items():
                            if not isinstance(rel_obj, dict):
                                continue
                            rel_data = rel_obj.get("data")
                            rel_ids: Set[str] = set()
                            if isinstance(rel_data, list):
                                for rel_item in rel_data:
                                    if isinstance(rel_item, dict) and rel_item.get("id"):
                                        rel_ids.add(str(rel_item.get("id")))
                            elif isinstance(rel_data, dict):
                                if rel_data.get("id"):
                                    rel_ids.add(str(rel_data.get("id")))
                            if rel_ids:
                                alert_related[rel_name] = rel_ids

                        if in_scope:
                            for rel_name, rel_ids in alert_related.items():
                                for rel_id in rel_ids:
                                    add_related(related_id_sets, rel_name, rel_id)

                        if wants_user_counts and in_scope:
                            alert_user_ids: Set[str] = set()
                            alert_user_emails: Set[str] = set()

                            responders = attrs.get("responders") or []
                            notified_users = attrs.get("notified_users") or []

                            responded_user_ids: Set[str] = set()
                            responded_user_emails: Set[str] = set()
                            notified_user_ids: Set[str] = set()
                            notified_user_emails: Set[str] = set()

                            for item in responders:
                                if isinstance(item, dict):
                                    if item.get("id"):
                                        responded_user_ids.add(str(item.get("id")))
                                    if item.get("user_id"):
                                        responded_user_ids.add(str(item.get("user_id")))
                                    if item.get("email"):
                                        responded_user_emails.add(str(item.get("email")).lower())
                                elif isinstance(item, str):
                                    if "@" in item:
                                        responded_user_emails.add(item.lower())
                                    else:
                                        responded_user_ids.add(item)

                            for item in notified_users:
                                if isinstance(item, dict):
                                    if item.get("id"):
                                        notified_user_ids.add(str(item.get("id")))
                                    if item.get("user_id"):
                                        notified_user_ids.add(str(item.get("user_id")))
                                    if item.get("email"):
                                        notified_user_emails.add(str(item.get("email")).lower())
                                elif isinstance(item, str):
                                    if "@" in item:
                                        notified_user_emails.add(item.lower())
                                    else:
                                        notified_user_ids.add(item)

                            for rel_name in ("responders", "notified_users"):
                                rel = relationships.get(rel_name, {}) or {}
                                rel_data = rel.get("data") or []
                                if isinstance(rel_data, list):
                                    for rel_item in rel_data:
                                        if isinstance(rel_item, dict) and rel_item.get("id"):
                                            if rel_name == "responders":
                                                responded_user_ids.add(str(rel_item.get("id")))
                                            else:
                                                notified_user_ids.add(str(rel_item.get("id")))

                            alert_user_ids = responded_user_ids | notified_user_ids
                            alert_user_emails = responded_user_emails | notified_user_emails

                            matched_ids = {uid for uid in alert_user_ids if uid in user_ids_set}
                            matched_emails = {email for email in alert_user_emails if email in user_emails_set}
                            matched_responded_ids = {uid for uid in responded_user_ids if uid in user_ids_set}
                            matched_responded_emails = {email for email in responded_user_emails if email in user_emails_set}
                            matched_notified_ids = {uid for uid in notified_user_ids if uid in user_ids_set}
                            matched_notified_emails = {email for email in notified_user_emails if email in user_emails_set}

                            for uid in matched_ids:
                                per_user_id_counts[uid] = per_user_id_counts.get(uid, 0) + 1
                                for rel_name, rel_ids in alert_related.items():
                                    merge_related(per_user_related_by_id, uid, rel_name, rel_ids)
                                user_noise = per_user_noise_by_id.setdefault(uid, {"noise": 0, "not_noise": 0, "unknown": 0})
                                if noise_value == "noise":
                                    user_noise["noise"] += 1
                                elif noise_value == "not_noise":
                                    user_noise["not_noise"] += 1
                                else:
                                    user_noise["unknown"] += 1
                                if alert_dt is not None:
                                    tz_name = user_tz_by_id.get(uid)
                                    if _is_after_hours(alert_dt, tz_name):
                                        per_user_after_hours_by_id[uid] = per_user_after_hours_by_id.get(uid, 0) + 1
                                        alert_after_hours_any = True
                                    if _is_night_time(alert_dt, tz_name):
                                        per_user_night_time_by_id[uid] = per_user_night_time_by_id.get(uid, 0) + 1
                                        alert_night_time_any = True
                                per_user_urgency = per_user_urgency_by_id.setdefault(uid, {})
                                per_user_urgency[urgency_key] = per_user_urgency.get(urgency_key, 0) + 1
                                if has_incident:
                                    per_user_alerts_with_incidents_by_id[uid] = per_user_alerts_with_incidents_by_id.get(uid, 0) + 1
                                per_user_source = per_user_source_by_id.setdefault(uid, {})
                                per_user_source[source_value] = per_user_source.get(source_value, 0) + 1
                                per_user_derived_source = per_user_derived_source_by_id.setdefault(uid, {})
                                per_user_derived_source[derived_source] = per_user_derived_source.get(derived_source, 0) + 1
                                if _day_key:
                                    user_day = per_user_daily_by_id.setdefault(uid, {}).setdefault(_day_key, {"total": 0, "incidents": 0, "after_hours": 0, "night_time": 0, "escalated": 0, "retrigger": 0})
                                    user_day["total"] += 1
                                    if has_incident: user_day["incidents"] += 1
                                    if alert_dt and _is_after_hours(alert_dt, user_tz_by_id.get(uid)): user_day["after_hours"] += 1
                                    if alert_dt and _is_night_time(alert_dt, user_tz_by_id.get(uid)): user_day["night_time"] += 1
                                    if is_escalated: user_day["escalated"] += 1
                                    if is_retriggered: user_day["retrigger"] += 1
                                user_title = per_user_alert_title_by_id.setdefault(uid, {}).setdefault(alert_title, {"total": 0, "noise": 0, "night_time": 0, "after_hours": 0, "no_incident": 0, "escalated": 0, "retriggered": 0})
                                user_title["total"] += 1
                                if noise_value == "noise": user_title["noise"] += 1
                                if alert_dt and _is_night_time(alert_dt, user_tz_by_id.get(uid)): user_title["night_time"] += 1
                                if alert_dt and _is_after_hours(alert_dt, user_tz_by_id.get(uid)): user_title["after_hours"] += 1
                                if not has_incident: user_title["no_incident"] += 1
                                if is_escalated: user_title["escalated"] += 1
                                if is_retriggered: user_title["retriggered"] += 1

                            for email in matched_emails:
                                per_user_email_counts[email] = per_user_email_counts.get(email, 0) + 1
                                for rel_name, rel_ids in alert_related.items():
                                    merge_related(per_user_related_by_email, email, rel_name, rel_ids)
                                user_noise = per_user_noise_by_email.setdefault(email, {"noise": 0, "not_noise": 0, "unknown": 0})
                                if noise_value == "noise":
                                    user_noise["noise"] += 1
                                elif noise_value == "not_noise":
                                    user_noise["not_noise"] += 1
                                else:
                                    user_noise["unknown"] += 1
                                if alert_dt is not None:
                                    tz_name = user_tz_by_email.get(email)
                                    if _is_after_hours(alert_dt, tz_name):
                                        per_user_after_hours_by_email[email] = per_user_after_hours_by_email.get(email, 0) + 1
                                        alert_after_hours_any = True
                                    if _is_night_time(alert_dt, tz_name):
                                        per_user_night_time_by_email[email] = per_user_night_time_by_email.get(email, 0) + 1
                                        alert_night_time_any = True
                                per_user_urgency = per_user_urgency_by_email.setdefault(email, {})
                                per_user_urgency[urgency_key] = per_user_urgency.get(urgency_key, 0) + 1
                                if has_incident:
                                    per_user_alerts_with_incidents_by_email[email] = per_user_alerts_with_incidents_by_email.get(email, 0) + 1
                                per_user_source = per_user_source_by_email.setdefault(email, {})
                                per_user_source[source_value] = per_user_source.get(source_value, 0) + 1
                                per_user_derived_source = per_user_derived_source_by_email.setdefault(email, {})
                                per_user_derived_source[derived_source] = per_user_derived_source.get(derived_source, 0) + 1
                                if _day_key:
                                    user_day = per_user_daily_by_email.setdefault(email, {}).setdefault(_day_key, {"total": 0, "incidents": 0, "after_hours": 0, "night_time": 0, "escalated": 0, "retrigger": 0})
                                    user_day["total"] += 1
                                    if has_incident: user_day["incidents"] += 1
                                    if alert_dt and _is_after_hours(alert_dt, user_tz_by_email.get(email)): user_day["after_hours"] += 1
                                    if alert_dt and _is_night_time(alert_dt, user_tz_by_email.get(email)): user_day["night_time"] += 1
                                    if is_escalated: user_day["escalated"] += 1
                                    if is_retriggered: user_day["retrigger"] += 1
                                user_title = per_user_alert_title_by_email.setdefault(email, {}).setdefault(alert_title, {"total": 0, "noise": 0, "night_time": 0, "after_hours": 0, "no_incident": 0, "escalated": 0, "retriggered": 0})
                                user_title["total"] += 1
                                if noise_value == "noise": user_title["noise"] += 1
                                if alert_dt and _is_night_time(alert_dt, user_tz_by_email.get(email)): user_title["night_time"] += 1
                                if alert_dt and _is_after_hours(alert_dt, user_tz_by_email.get(email)): user_title["after_hours"] += 1
                                if not has_incident: user_title["no_incident"] += 1
                                if is_escalated: user_title["escalated"] += 1
                                if is_retriggered: user_title["retriggered"] += 1

                            for uid in matched_responded_ids:
                                per_user_responded_by_id[uid] = per_user_responded_by_id.get(uid, 0) + 1

                            for email in matched_responded_emails:
                                per_user_responded_by_email[email] = per_user_responded_by_email.get(email, 0) + 1

                            for uid in matched_notified_ids:
                                per_user_notified_by_id[uid] = per_user_notified_by_id.get(uid, 0) + 1

                            for email in matched_notified_emails:
                                per_user_notified_by_email[email] = per_user_notified_by_email.get(email, 0) + 1

                            # Per-user event-derived metrics (uses alert_event_list etc. from in_scope block above)
                            for uid in acker_ids:
                                if uid in user_ids_set:
                                    per_user_acked_by_id[uid] = per_user_acked_by_id.get(uid, 0) + 1
                                    if mtta_seconds is not None:
                                        per_user_mtta_sum_by_id[uid] = per_user_mtta_sum_by_id.get(uid, 0.0) + mtta_seconds
                                        per_user_mtta_count_by_id[uid] = per_user_mtta_count_by_id.get(uid, 0) + 1
                            for email in acker_emails:
                                if email in user_emails_set:
                                    per_user_acked_by_email[email] = per_user_acked_by_email.get(email, 0) + 1
                                    if mtta_seconds is not None:
                                        per_user_mtta_sum_by_email[email] = per_user_mtta_sum_by_email.get(email, 0.0) + mtta_seconds
                                        per_user_mtta_count_by_email[email] = per_user_mtta_count_by_email.get(email, 0) + 1
                            for uid in resolver_ids:
                                if uid in user_ids_set:
                                    per_user_resolved_by_id[uid] = per_user_resolved_by_id.get(uid, 0) + 1
                                    if mttr_seconds is not None:
                                        per_user_mttr_sum_by_id[uid] = per_user_mttr_sum_by_id.get(uid, 0.0) + mttr_seconds
                                        per_user_mttr_count_by_id[uid] = per_user_mttr_count_by_id.get(uid, 0) + 1
                            for email in resolver_emails:
                                if email in user_emails_set:
                                    per_user_resolved_by_email[email] = per_user_resolved_by_email.get(email, 0) + 1
                                    if mttr_seconds is not None:
                                        per_user_mttr_sum_by_email[email] = per_user_mttr_sum_by_email.get(email, 0.0) + mttr_seconds
                                        per_user_mttr_count_by_email[email] = per_user_mttr_count_by_email.get(email, 0) + 1
                            for uid in matched_ids:
                                if is_escalated:
                                    per_user_escalated_by_id[uid] = per_user_escalated_by_id.get(uid, 0) + 1
                                if is_retriggered:
                                    per_user_retriggered_by_id[uid] = per_user_retriggered_by_id.get(uid, 0) + 1
                            for email in matched_emails:
                                if is_escalated:
                                    per_user_escalated_by_email[email] = per_user_escalated_by_email.get(email, 0) + 1
                                if is_retriggered:
                                    per_user_retriggered_by_email[email] = per_user_retriggered_by_email.get(email, 0) + 1

                            if alert_after_hours_any:
                                after_hours_count += 1
                                per_alert_title[alert_title]["after_hours"] += 1
                            if alert_night_time_any:
                                night_time_count += 1
                                per_alert_title[alert_title]["night_time"] += 1

                        # Team-level after-hours/night-time counters: computed for all
                        # in-scope alerts regardless of whether user filtering is active.
                        # When wants_user_counts is True these are also tracked per-user
                        # above; here we ensure the team totals are never silently zeroed.
                        elif in_scope and alert_dt is not None:
                            if _is_after_hours(alert_dt, None):
                                after_hours_count += 1
                                per_alert_title[alert_title]["after_hours"] += 1
                            if _is_night_time(alert_dt, None):
                                night_time_count += 1
                                per_alert_title[alert_title]["night_time"] += 1

                    if total_pages is None:
                        if not data.get("data"):
                            break
                    else:
                        if page >= total_pages:
                            break

                    if max_pages and page >= max_pages:
                        truncated = True
                        break

                    page += 1
        except Exception as e:
            return {
                "error": str(e),
                "total_count": total_count,
                "filtered_count": filtered_count,
                "pages_scanned": page - 1,
                "total_pages": total_pages,
                "truncated": True,
                "per_user_id_counts": per_user_id_counts,
                "per_user_email_counts": per_user_email_counts,
                "per_user_notified_by_id": per_user_notified_by_id,
                "per_user_notified_by_email": per_user_notified_by_email,
                "per_user_responded_by_id": per_user_responded_by_id,
                "per_user_responded_by_email": per_user_responded_by_email,
                "per_user_alerts_with_incidents_by_id": per_user_alerts_with_incidents_by_id,
                "per_user_alerts_with_incidents_by_email": per_user_alerts_with_incidents_by_email,
                "per_user_source_by_id": per_user_source_by_id,
                "per_user_source_by_email": per_user_source_by_email,
                "per_user_derived_source_by_id": per_user_derived_source_by_id,
                "per_user_derived_source_by_email": per_user_derived_source_by_email,
                "related_counts": {k: len(v) for k, v in related_id_sets.items()},
                "included_counts": {k: len(v) for k, v in included_id_sets.items()},
                "per_user_related_by_id": {k: {rk: len(rv) for rk, rv in v.items()} for k, v in per_user_related_by_id.items()},
                "per_user_related_by_email": {k: {rk: len(rv) for rk, rv in v.items()} for k, v in per_user_related_by_email.items()},
                "noise_counts": noise_counts,
                "source_counts": source_counts,
                "derived_source_counts": derived_source_counts,
                "per_user_noise_by_id": per_user_noise_by_id,
                "per_user_noise_by_email": per_user_noise_by_email,
                "after_hours_count": after_hours_count,
                "per_user_after_hours_by_id": per_user_after_hours_by_id,
                "per_user_after_hours_by_email": per_user_after_hours_by_email,
                "night_time_count": night_time_count,
                "per_user_night_time_by_id": per_user_night_time_by_id,
                "per_user_night_time_by_email": per_user_night_time_by_email,
                "per_user_daily_by_id": per_user_daily_by_id,
                "per_user_daily_by_email": per_user_daily_by_email,
                "urgency_counts": urgency_counts,
                "per_user_urgency_by_id": per_user_urgency_by_id,
                "per_user_urgency_by_email": per_user_urgency_by_email,
                "alerts_with_incidents_count": alerts_with_incidents_count,
                "avg_mtta_seconds": mtta_sum / mtta_count if mtta_count > 0 else None,
                "mtta_count": mtta_count,
                "avg_mttr_seconds": mttr_sum / mttr_count if mttr_count > 0 else None,
                "mttr_count": mttr_count,
                "escalated_count": escalated_count,
                "retrigger_count": retrigger_count,
                "per_user_acked_by_id": per_user_acked_by_id,
                "per_user_acked_by_email": per_user_acked_by_email,
                "per_user_resolved_by_id": per_user_resolved_by_id,
                "per_user_resolved_by_email": per_user_resolved_by_email,
                "per_user_escalated_by_id": per_user_escalated_by_id,
                "per_user_escalated_by_email": per_user_escalated_by_email,
                "per_user_retriggered_by_id": per_user_retriggered_by_id,
                "per_user_retriggered_by_email": per_user_retriggered_by_email,
                "per_user_mtta_avg_by_id": {k: per_user_mtta_sum_by_id[k] / per_user_mtta_count_by_id[k] for k in per_user_mtta_sum_by_id if per_user_mtta_count_by_id.get(k, 0) > 0},
                "per_user_mtta_avg_by_email": {k: per_user_mtta_sum_by_email[k] / per_user_mtta_count_by_email[k] for k in per_user_mtta_sum_by_email if per_user_mtta_count_by_email.get(k, 0) > 0},
                "per_user_mttr_avg_by_id": {k: per_user_mttr_sum_by_id[k] / per_user_mttr_count_by_id[k] for k in per_user_mttr_sum_by_id if per_user_mttr_count_by_id.get(k, 0) > 0},
                "per_user_mttr_avg_by_email": {k: per_user_mttr_sum_by_email[k] / per_user_mttr_count_by_email[k] for k in per_user_mttr_sum_by_email if per_user_mttr_count_by_email.get(k, 0) > 0},
                "top_alerts": _build_top_alerts(per_alert_title, per_alert_title_days),
                "daily_alert_breakdown": daily_alert_breakdown,
                "per_user_alert_title_by_id": {
                    uid: sorted([{"title": t, **c} for t, c in titles.items()], key=lambda x: x["total"], reverse=True)[:50]
                    for uid, titles in per_user_alert_title_by_id.items()
                },
                "per_user_alert_title_by_email": {
                    email: sorted([{"title": t, **c} for t, c in titles.items()], key=lambda x: x["total"], reverse=True)[:50]
                    for email, titles in per_user_alert_title_by_email.items()
                },
            }

        return {
            "total_count": total_count,
            "filtered_count": filtered_count,
            "pages_scanned": page,
            "total_pages": total_pages,
            "truncated": truncated,
            "per_user_id_counts": per_user_id_counts,
            "per_user_email_counts": per_user_email_counts,
            "per_user_notified_by_id": per_user_notified_by_id,
            "per_user_notified_by_email": per_user_notified_by_email,
            "per_user_responded_by_id": per_user_responded_by_id,
            "per_user_responded_by_email": per_user_responded_by_email,
            "per_user_alerts_with_incidents_by_id": per_user_alerts_with_incidents_by_id,
            "per_user_alerts_with_incidents_by_email": per_user_alerts_with_incidents_by_email,
            "per_user_source_by_id": per_user_source_by_id,
            "per_user_source_by_email": per_user_source_by_email,
            "per_user_derived_source_by_id": per_user_derived_source_by_id,
            "per_user_derived_source_by_email": per_user_derived_source_by_email,
            "related_counts": {k: len(v) for k, v in related_id_sets.items()},
            "included_counts": {k: len(v) for k, v in included_id_sets.items()},
            "per_user_related_by_id": {k: {rk: len(rv) for rk, rv in v.items()} for k, v in per_user_related_by_id.items()},
            "per_user_related_by_email": {k: {rk: len(rv) for rk, rv in v.items()} for k, v in per_user_related_by_email.items()},
            "noise_counts": noise_counts,
            "source_counts": source_counts,
            "derived_source_counts": derived_source_counts,
            "per_user_noise_by_id": per_user_noise_by_id,
            "per_user_noise_by_email": per_user_noise_by_email,
            "after_hours_count": after_hours_count,
            "per_user_after_hours_by_id": per_user_after_hours_by_id,
            "per_user_after_hours_by_email": per_user_after_hours_by_email,
            "night_time_count": night_time_count,
            "per_user_night_time_by_id": per_user_night_time_by_id,
            "per_user_night_time_by_email": per_user_night_time_by_email,
            "per_user_daily_by_id": per_user_daily_by_id,
            "per_user_daily_by_email": per_user_daily_by_email,
            "urgency_counts": urgency_counts,
            "per_user_urgency_by_id": per_user_urgency_by_id,
            "per_user_urgency_by_email": per_user_urgency_by_email,
            "alerts_with_incidents_count": alerts_with_incidents_count,
            "avg_mtta_seconds": mtta_sum / mtta_count if mtta_count > 0 else None,
            "mtta_count": mtta_count,
            "avg_mttr_seconds": mttr_sum / mttr_count if mttr_count > 0 else None,
            "mttr_count": mttr_count,
            "escalated_count": escalated_count,
            "retrigger_count": retrigger_count,
            "per_user_acked_by_id": per_user_acked_by_id,
            "per_user_acked_by_email": per_user_acked_by_email,
            "per_user_resolved_by_id": per_user_resolved_by_id,
            "per_user_resolved_by_email": per_user_resolved_by_email,
            "per_user_escalated_by_id": per_user_escalated_by_id,
            "per_user_escalated_by_email": per_user_escalated_by_email,
            "per_user_retriggered_by_id": per_user_retriggered_by_id,
            "per_user_retriggered_by_email": per_user_retriggered_by_email,
            "per_user_mtta_avg_by_id": {k: per_user_mtta_sum_by_id[k] / per_user_mtta_count_by_id[k] for k in per_user_mtta_sum_by_id if per_user_mtta_count_by_id.get(k, 0) > 0},
            "per_user_mtta_avg_by_email": {k: per_user_mtta_sum_by_email[k] / per_user_mtta_count_by_email[k] for k in per_user_mtta_sum_by_email if per_user_mtta_count_by_email.get(k, 0) > 0},
            "per_user_mttr_avg_by_id": {k: per_user_mttr_sum_by_id[k] / per_user_mttr_count_by_id[k] for k in per_user_mttr_sum_by_id if per_user_mttr_count_by_id.get(k, 0) > 0},
            "per_user_mttr_avg_by_email": {k: per_user_mttr_sum_by_email[k] / per_user_mttr_count_by_email[k] for k in per_user_mttr_sum_by_email if per_user_mttr_count_by_email.get(k, 0) > 0},
            "top_alerts": _build_top_alerts(per_alert_title, per_alert_title_days),
            "daily_alert_breakdown": daily_alert_breakdown,
            "per_user_alert_title_by_id": {
                uid: sorted([{"title": t, **c} for t, c in titles.items()], key=lambda x: x["total"], reverse=True)[:50]
                for uid, titles in per_user_alert_title_by_id.items()
            },
            "per_user_alert_title_by_email": {
                email: sorted([{"title": t, **c} for t, c in titles.items()], key=lambda x: x["total"], reverse=True)[:50]
                for email, titles in per_user_alert_title_by_email.items()
            },
        }

    async def get_team_member_emails(self, team_name: str) -> set:
        """Return the set of lowercase emails for all members of a team.

        Combines get_team_user_ids() with the cached get_users() response so
        we only hit the /v1/teams endpoint (no extra /v1/users call if users
        are already cached).
        """
        team_user_ids = await self.get_team_user_ids(team_name)
        if not team_user_ids:
            return set()

        team_ids_set = set(team_user_ids)
        all_users = await self.get_users(limit=10000)  # served from cache when warm

        emails = set()
        for user in all_users:
            if str(user.get("id", "")) in team_ids_set:
                email = user.get("attributes", {}).get("email", "")
                if email:
                    emails.add(email.lower())

        logger.info(f"Team '{team_name}': resolved {len(emails)} member emails from {len(team_user_ids)} user IDs")
        return emails

    async def get_users(self, limit: int = 100, include_role: bool = False, force_refresh: bool = False):
        """Fetch users from Rootly API with Redis caching.

        Args:
            limit: Maximum number of users to fetch
            include_role: If True, includes role relationship to identify incident responders
            force_refresh: If True, bypass cache and fetch fresh data

        Returns:
            If include_role is True: Tuple of (users, included_data)
            Otherwise: List of users
        """
        cache_params = {"limit": limit, "include_role": include_role}

        # Check cache first (unless force_refresh)
        # Note: We cache the full response including included data when include_role is True
        if not force_refresh:
            cached = get_cached_api_response("rootly", "users", self.api_token, cache_params)
            if cached is not None:
                if include_role:
                    logger.info(f"ROOTLY GET_USERS: Using cached data ({len(cached.get('users', []))} users with roles)")
                    return cached.get("users", []), cached.get("included", [])
                else:
                    logger.info(f"ROOTLY GET_USERS: Using cached data ({len(cached)} users)")
                    return cached

        all_users = []
        all_included = []
        page = 1
        page_size = min(limit, 100)  # Rootly API typically limits to 100 per page

        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                while len(all_users) < limit:
                    # URL encode the parameters manually since httpx doesn't encode brackets properly
                    params = {
                        "page[number]": page,
                        "page[size]": page_size
                    }

                    # Add include parameter if requested
                    if include_role:
                        params["include"] = "role"

                    params_encoded = urlencode(params)

                    response = await client.get(
                        f"{self.base_url}/v1/users?{params_encoded}",
                        headers=self.headers
                    )

                    if response.status_code != 200:
                        logger.error(f"Rootly API request failed: {response.status_code}")
                        raise Exception(f"API request failed: {response.status_code}")

                    data = response.json()

                    # Safety check for data
                    if data is None:
                        logger.error("Users API response returned None")
                        break

                    users = data.get("data", [])

                    if not users:
                        break

                    all_users.extend(users)

                    # Collect included data if present (for role details)
                    if include_role:
                        included = data.get("included", [])
                        all_included.extend(included)

                    # Check if we have more pages
                    meta = data.get("meta", {})
                    total_pages = meta.get("total_pages", 1)

                    if page >= total_pages:
                        break

                    page += 1

                final_users = all_users[:limit]

                # Cache the results
                if include_role:
                    cache_data = {"users": final_users, "included": all_included}
                    set_cached_api_response("rootly", "users", self.api_token, cache_data, ROOTLY_CACHE_TTL_SECONDS, cache_params)
                    logger.info(f"ROOTLY GET_USERS: Fetched {len(final_users)} users with roles")
                    return final_users, all_included
                else:
                    set_cached_api_response("rootly", "users", self.api_token, final_users, ROOTLY_CACHE_TTL_SECONDS, cache_params)
                    logger.info(f"ROOTLY GET_USERS: Fetched {len(final_users)} users")
                    return final_users

        except Exception as e:
            logger.error(f"Error fetching users: {e}")
            raise

    async def get_on_call_shifts(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """
        Get on-call shifts for a specific time period from Rootly.

        Rootly API structure:
        1. First get all schedules via /v1/schedules
        2. For each schedule, get shifts via /v1/schedules/{id}/shifts with date filters

        Uses parallel fetching with asyncio.gather() for performance.
        """
        try:
            # Format dates for API (Rootly expects ISO format)
            start_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            end_str = end_date.strftime('%Y-%m-%dT%H:%M:%S.%fZ')

            all_shifts = []

            async with httpx.AsyncClient(timeout=30.0) as client:
                # Step 1: Get all schedules (with retry)
                schedules_response = await self._request_with_retry(
                    client,
                    "GET",
                    f"{self.base_url}/v1/schedules",
                    headers=self.headers,
                    params={"page[size]": 100},
                    timeout=30.0
                )

                if schedules_response.status_code != 200:
                    logger.error(f"Failed to fetch on-call schedules: {schedules_response.status_code}")
                    return []

                schedules_data = schedules_response.json()
                schedules = schedules_data.get('data', [])
                logger.info(f"Fetching shifts for {len(schedules)} schedules in parallel...")

                # Step 2: Fetch shifts for ALL schedules in parallel
                async def fetch_schedule_shifts(schedule):
                    schedule_id = schedule.get('id')
                    schedule_name = schedule.get('attributes', {}).get('name', 'Unknown')
                    try:
                        shifts_response = await self._request_with_retry(
                            client,
                            "GET",
                            f"{self.base_url}/v1/schedules/{schedule_id}/shifts",
                            headers=self.headers,
                            params={
                                'filter[starts_at][lt]': end_str,
                                'filter[ends_at][gt]': start_str,
                                'include': 'user',
                                'page[size]': 100
                            },
                            timeout=30.0
                        )

                        if shifts_response.status_code == 200:
                            shifts_data = shifts_response.json()
                            return shifts_data.get('data', [])
                        else:
                            logger.warning(f"Failed to fetch shifts for schedule {schedule_name}: {shifts_response.status_code}")
                            return []

                    except RETRYABLE_EXCEPTIONS as e:
                        logger.error(f"Failed to fetch shifts for schedule {schedule_name} after retries: {e}")
                        return []

                # Run all schedule fetches in parallel
                results = await asyncio.gather(*[fetch_schedule_shifts(s) for s in schedules], return_exceptions=True)

                # Collect results, handling any exceptions
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        schedule_name = schedules[i].get('attributes', {}).get('name', 'Unknown')
                        logger.error(f"Exception fetching shifts for schedule {schedule_name}: {result}")
                    elif result:
                        all_shifts.extend(result)

                logger.info(f"Found {len(all_shifts)} shifts across {len(schedules)} schedules")
                return all_shifts

        except Exception as e:
            logger.error(f"Error fetching on-call shifts: {e}")
            return []
    
    async def extract_on_call_users_from_shifts(self, shifts: List[Dict[str, Any]]) -> set:
        """
        Extract unique user emails from shifts data.
        Returns set of user emails who were on-call during the period.
        """
        if not shifts or shifts is None:
            return set()

        # Step 1: Extract unique user IDs from shifts
        user_ids = set()
        for shift in shifts:
            try:
                if not shift or not isinstance(shift, dict):
                    continue

                relationships = shift.get('relationships', {})
                if not relationships:
                    continue

                user_data = relationships.get('user', {}).get('data', {})

                if user_data and user_data.get('type') == 'users':
                    user_id = user_data.get('id')
                    if user_id:
                        user_ids.add(user_id)

            except Exception as e:
                logger.warning(f"Error extracting user from shift: {e}")
                continue
        
        # Step 2: Fetch user details to get emails (in parallel)
        on_call_user_emails = set()

        if user_ids:
            try:
                logger.info(f"Fetching {len(user_ids)} user details in parallel...")

                async with httpx.AsyncClient(timeout=15.0) as client:
                    async def fetch_user_email(user_id):
                        try:
                            response = await client.get(
                                f"{self.base_url}/v1/users/{user_id}",
                                headers=self.headers
                            )

                            if response.status_code == 200:
                                user_data = response.json()
                                if 'data' in user_data:
                                    attributes = user_data['data'].get('attributes', {})
                                    email = attributes.get('email')
                                    if email:
                                        return email.lower().strip()
                            return None

                        except Exception as e:
                            logger.warning(f"Error fetching user {user_id}: {e}")
                            return None

                    # Fetch all users in parallel
                    results = await asyncio.gather(*[fetch_user_email(uid) for uid in user_ids], return_exceptions=True)

                    # Collect valid emails
                    for result in results:
                        if isinstance(result, str):
                            on_call_user_emails.add(result)
                        elif isinstance(result, Exception):
                            logger.warning(f"Exception fetching user: {result}")

                logger.info(f"Found {len(on_call_user_emails)} on-call user emails")

            except Exception as e:
                logger.error(f"Error fetching on-call user details: {e}")

        return on_call_user_emails

    def filter_incident_responders(self, users: List[Dict[str, Any]], included_data: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Filter users to only those who are incident responders (have IR role).

        Filters OUT observers and users without IR access.
        Includes: admin, owner, user, and custom roles.

        Args:
            users: List of user objects from Rootly API (must include role relationship)
            included_data: Optional included section from API response with full role details

        Returns:
            Filtered list of users who are incident responders
        """
        # Build a map of role_id -> role details from included data
        role_map = {}
        if included_data:
            for item in included_data:
                if item.get('type') == 'roles':
                    role_id = item.get('id')
                    slug = item.get('attributes', {}).get('slug')
                    name = item.get('attributes', {}).get('name')
                    role_map[role_id] = {
                        'slug': slug,
                        'name': name
                    }

        incident_responders = []

        for user in users:
            try:
                email = user.get('attributes', {}).get('email', 'unknown')

                # Check if user has role relationship (IR role)
                relationships = user.get('relationships', {})
                role = relationships.get('role', {})
                role_data = role.get('data')

                # No role = not an incident responder
                if not role_data:
                    logger.debug(f"User {email} has no IR role")
                    continue

                role_id = role_data.get('id')

                # If we have role details, check the slug
                if role_id and role_id in role_map:
                    slug = role_map[role_id]['slug']
                    role_name = role_map[role_id]['name']

                    # Exclude observers and no_access (they're not incident responders)
                    if slug in ['observer', 'no_access']:
                        logger.debug(f"User {email} has {role_name} role (not incident responder)")
                        continue

                    # Include admin, owner, user, and custom roles
                    incident_responders.append(user)
                    logger.debug(f"User {email} is incident responder (role: {role_name})")
                else:
                    # If we don't have role details, include them (fail-safe)
                    incident_responders.append(user)
                    logger.debug(f"User {email} has IR role (no role details available)")

            except Exception as e:
                logger.warning(f"Error checking IR role for user: {e}")
                continue

        logger.info(f" Filtered {len(users)} users → {len(incident_responders)} incident responders (excluded observers/no_access)")
        return incident_responders

    async def get_incidents(self, days_back: int = 30, limit: int = 1000, team_name: str = None) -> List[Dict[str, Any]]:
        """Fetch incidents from Rootly API.

        Uses INCIDENTS_TIMEOUT (32s) based on benchmark showing incidents
        endpoints have avg 10-15s latency with p95 up to 21s.

        Args:
            team_name: If set, filter incidents to this team only (for team-scoped keys).
        """
        fetch_start_time = datetime.now()
        all_incidents = []
        page = 1
        page_size = min(100, limit)  # Rootly API page size limit
        api_calls_made = 0

        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)

        try:
            async with httpx.AsyncClient(timeout=INCIDENTS_TIMEOUT) as client:
                # Test basic access to incidents endpoint
                test_params = {"page[size]": 1}
                if team_name:
                    test_params["filter[team_names]"] = team_name
                test_response = await client.get(
                    f"{self.base_url}/v1/incidents",
                    headers=self.headers,
                    params=test_params
                )
                api_calls_made += 1

                if test_response.status_code == 404:
                    logger.error("Cannot access incidents endpoint - check API token permissions")
                    raise Exception("Cannot access incidents endpoint. Please verify your Rootly API token has 'incidents:read' permission.")
                elif test_response.status_code != 200:
                    logger.error(f"Incidents endpoint failed: {test_response.status_code}")
                    raise Exception(f"Basic incidents endpoint failed: {test_response.status_code}")
                
                pagination_start = datetime.now()
                consecutive_failures = 0
                max_consecutive_failures = 3
                total_pagination_timeout = 600  # 10 minutes max for all pagination
                
                while len(all_incidents) < limit and consecutive_failures < max_consecutive_failures:
                    page_start_time = datetime.now()

                    # Use adaptive page size based on time range
                    if days_back >= 90:
                        actual_page_size = min(page_size, 100)
                    elif days_back >= 30:
                        actual_page_size = min(page_size, 50)
                    else:
                        actual_page_size = min(page_size, 20)

                    params = {
                        "page[number]": page,
                        "page[size]": actual_page_size,
                        "filter[created_at][gte]": start_date.isoformat(),
                        "filter[created_at][lte]": end_date.isoformat(),
                        "include": "severity,user,started_by,resolved_by,mitigated_by",
                        "fields[incidents]": "created_at,started_at,acknowledged_at,resolved_at,mitigated_at,mitigated_by,started_by,resolved_by,severity,user,title,status"
                    }
                    if team_name:
                        params["filter[team_names]"] = team_name

                    params_encoded = urlencode(params)

                    try:
                        # Check if we've exceeded total pagination timeout
                        pagination_elapsed = (datetime.now() - pagination_start).total_seconds()
                        if pagination_elapsed > total_pagination_timeout:
                            logger.error(f"🕐 PAGINATION TIMEOUT: Exceeded {total_pagination_timeout}s limit after {len(all_incidents)} incidents")
                            logger.error(f"🕐 PAGINATION TIMEOUT: Started at {pagination_start}, elapsed {pagination_elapsed:.2f}s")
                            break

                        response = await client.get(
                            f"{self.base_url}/v1/incidents?{params_encoded}",
                            headers=self.headers
                        )
                        api_calls_made += 1
                    except (asyncio.TimeoutError, httpx.TimeoutException):
                        # Explicit timeout exception handling
                        logger.error(f"🕐 API REQUEST TIMEOUT: Rootly incidents request timed out")
                        logger.error(f"🕐 API REQUEST TIMEOUT: Page {page}, collected {len(all_incidents)} incidents so far")
                        consecutive_failures += 1

                        if consecutive_failures >= max_consecutive_failures:
                            if all_incidents:
                                logger.warning(f"Stopping after {consecutive_failures} timeout failures. Returning {len(all_incidents)} incidents.")
                                break
                            else:
                                raise
                        else:
                            # Use predefined retry delays
                            delay = RETRY_DELAYS[consecutive_failures - 1] if consecutive_failures <= len(RETRY_DELAYS) else RETRY_DELAYS[-1]
                            await asyncio.sleep(delay)
                            continue
                    except Exception as request_error:
                        consecutive_failures += 1
                        logger.error(f"Incident request failed: {request_error} (failure {consecutive_failures}/{max_consecutive_failures})")

                        # If we have some incidents already, continue with partial data
                        if consecutive_failures >= max_consecutive_failures:
                            if all_incidents:
                                logger.warning(f"Stopping after {consecutive_failures} consecutive failures. Returning {len(all_incidents)} incidents.")
                                break
                            else:
                                raise request_error
                        else:
                            # Use predefined retry delays
                            delay = RETRY_DELAYS[consecutive_failures - 1] if consecutive_failures <= len(RETRY_DELAYS) else RETRY_DELAYS[-1]
                            await asyncio.sleep(delay)
                            continue

                    if response.status_code != 200:
                        consecutive_failures += 1
                        error_detail = response.text
                        logger.error(f"API error: {response.status_code} (failure {consecutive_failures}/{max_consecutive_failures})")

                        # Handle specific error cases
                        if response.status_code == 404 and "not found or unauthorized" in error_detail.lower():
                            raise Exception(f"Rootly API access denied. Check API token has 'incidents:read' permission.")
                        elif response.status_code in [429, 502, 503, 504]:
                            if consecutive_failures >= max_consecutive_failures:
                                if all_incidents:
                                    logger.warning(f"API errors after {consecutive_failures} attempts. Returning {len(all_incidents)} incidents.")
                                    break
                                else:
                                    raise Exception(f"API repeatedly failing: {response.status_code}")
                            else:
                                # Use longer delays for server errors/rate limits
                                delay = RETRY_DELAYS[consecutive_failures - 1] * 2 if consecutive_failures <= len(RETRY_DELAYS) else RETRY_DELAYS[-1] * 2
                                await asyncio.sleep(delay)
                                continue
                        else:
                            raise Exception(f"API request failed: {response.status_code}")
                    else:
                        consecutive_failures = 0

                    data = response.json()

                    if data is None:
                        logger.error("API response returned None")
                        break

                    incidents = data.get("data", [])

                    if not incidents:
                        break

                    # DEBUG: Log first incident to see severity structure
                    if len(all_incidents) == 0 and len(incidents) > 0:
                        first_incident = incidents[0]
                        severity_data = first_incident.get("attributes", {}).get("severity")
                        logger.info(f"🔍 FIRST INCIDENT SEVERITY CHECK:")
                        logger.info(f"  - Incident ID: {first_incident.get('id')}")
                        logger.info(f"  - Severity type: {type(severity_data)}")
                        logger.info(f"  - Severity value: {severity_data}")
                        if isinstance(severity_data, dict):
                            logger.info(f"  - Has 'data' key: {'data' in severity_data}")

                    all_incidents.extend(incidents)

                    # Check if we have more pages
                    meta = data.get("meta", {})
                    total_pages = meta.get("total_pages", 1)

                    if page >= total_pages:
                        break

                    page += 1

                total_fetch_duration = (datetime.now() - fetch_start_time).total_seconds()

                if days_back >= 30 and total_fetch_duration > 600:
                    logger.warning(f"Incident fetch took {total_fetch_duration:.2f}s - may cause timeout")

                return all_incidents[:limit]

        except Exception as e:
            logger.error(f"Incident fetch failed: {e}")
            raise
    
    async def get_user_incident_roles(self, user_id: str, incident_ids: List[str]) -> List[Dict[str, Any]]:
        """Get user roles for specific incidents."""
        # This would require additional API calls to incident role endpoints
        # For now, return empty list - this can be expanded based on Rootly API capabilities
        return []
    
    async def collect_analysis_data(self, days_back: int = 30, team_name: str = None) -> Dict[str, Any]:
        """Collect all data needed for burnout analysis."""
        start_time = datetime.now()

        try:
            # Test connection first
            connection_test = await self.test_connection()

            if connection_test["status"] != "success":
                raise Exception(f"Connection test failed: {connection_test['message']}")

            # Use conservative incident limits to prevent timeout on longer analyses
            incident_limits_by_range = {
                7: 1500,
                14: 2000,
                30: 3000,
                60: 4000,
                90: 5000,
                180: 7500
            }

            incident_limit = 5000
            for range_days in sorted(incident_limits_by_range.keys()):
                if days_back <= range_days:
                    incident_limit = incident_limits_by_range[range_days]
                    break

            # When team_name is set, fetch team membership and incidents in parallel
            # alongside all users so we can filter users down to team members only.
            if team_name:
                users_task = self.get_users(limit=10000)
                incidents_task = self.get_incidents(days_back=days_back, limit=incident_limit, team_name=team_name)
                team_user_ids_task = self.get_team_user_ids(team_name)

                users_raw, team_user_ids_result, incidents_result = await asyncio.gather(
                    users_task,
                    team_user_ids_task,
                    incidents_task,
                    return_exceptions=True
                )

                users = users_raw if not isinstance(users_raw, Exception) else []
                team_user_ids = team_user_ids_result if not isinstance(team_user_ids_result, Exception) else []
                incidents = incidents_result if not isinstance(incidents_result, Exception) else []
                if isinstance(incidents_result, Exception):
                    logger.warning(f"Could not fetch incidents: {incidents_result}. Proceeding with user data only.")

                # Filter users to team members only
                if team_user_ids:
                    team_user_ids_set = set(team_user_ids)
                    users_before = len(users)
                    users = [u for u in users if str(u.get("id")) in team_user_ids_set]
                    logger.info(
                        f"Team scope '{team_name}': filtered users from {users_before} → {len(users)} "
                        f"({len(team_user_ids)} member IDs in team)"
                    )
                else:
                    logger.warning(
                        f"Team scope '{team_name}': could not fetch member IDs, using all {len(users)} org users"
                    )
            else:
                # No team scope — fetch all users and all incidents normally
                users_task = self.get_users(limit=10000)
                incidents_task = self.get_incidents(days_back=days_back, limit=incident_limit, team_name=None)

                users = await users_task

                incidents = []
                try:
                    incidents = await incidents_task
                except Exception as e:
                    logger.warning(f"Could not fetch incidents: {e}. Proceeding with user data only.")

            # Validate data
            if not users:
                raise Exception("No users found - check API permissions")
            
            # Calculate severity breakdown using shared utility
            from app.utils.incident_utils import calculate_severity_breakdown
            severity_counts = calculate_severity_breakdown(incidents)
            
            # Process and return data
            processed_data = {
                "users": users,
                "incidents": incidents,
                "collection_metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "days_analyzed": days_back,
                    "total_users": len(users),
                    "total_incidents": len(incidents),
                    "severity_breakdown": severity_counts,
                    "date_range": {
                        "start": (datetime.now() - timedelta(days=days_back)).isoformat(),
                        "end": datetime.now().isoformat()
                    },
                }
            }

            return processed_data

        except Exception as e:
            logger.error(f"Data collection failed: {e}")
            # Calculate duration even on failure
            total_duration = (datetime.now() - start_time).total_seconds()
            # Return minimal data structure instead of failing completely
            return {
                "users": [],
                "incidents": [],
                "collection_metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "days_analyzed": days_back,
                    "total_users": 0,
                    "total_incidents": 0,
                    "severity_breakdown": {
                        "sev0_count": 0,
                        "sev1_count": 0,
                        "sev2_count": 0,
                        "sev3_count": 0,
                        "sev4_count": 0
                    },
                    "error": str(e),
                    "date_range": {
                        "start": (datetime.now() - timedelta(days=days_back)).isoformat(),
                        "end": datetime.now().isoformat()
                    },
                    "performance_metrics": {
                        "total_collection_time_seconds": total_duration,
                        "failed": True
                    }
                }
            }
