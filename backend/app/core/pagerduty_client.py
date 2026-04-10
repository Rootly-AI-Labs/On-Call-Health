"""
PagerDuty API client for fetching incident and user data.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import aiohttp
import pytz

from .api_cache import get_cached_api_response, set_cached_api_response

logger = logging.getLogger(__name__)

# Cache TTL for PagerDuty data (1 hour - users/services rarely change)
PAGERDUTY_CACHE_TTL_SECONDS = 3600

class PagerDutyAPIClient:
    """Client for interacting with PagerDuty API."""
    
    def __init__(self, api_token: str):
        self.api_token = api_token
        self.base_url = "https://api.pagerduty.com"
        self.headers = {
            "Authorization": f"Token token={api_token}",
            "Accept": "application/vnd.pagerduty+json;version=2",
            "Content-Type": "application/json"
        }
        
        # 🎯 RAILWAY DEBUG: Token identification for debugging
        token_suffix = api_token[-4:] if len(api_token) > 4 else "***"
        logger.info(f"PAGERDUTY CLIENT: Initialized with token ending in {token_suffix}")
        logger.info(f"PAGERDUTY CLIENT: Enhanced normalization version ACTIVE - Build 875bd95")
        import time
        logger.info(f"PAGERDUTY CLIENT: On-call methods deployed - Build {int(time.time())}")
        
    async def test_connection(self) -> Dict[str, Any]:
        """Test the PagerDuty API connection and get account info."""
        try:
            # Test connection by fetching users (works with both user and account tokens)
            timeout = aiohttp.ClientTimeout(total=30)  # 30 second timeout
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(
                    f"{self.base_url}/users",
                    headers=self.headers,
                    params={"limit": 1}
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        # Map HTTP status codes to error codes
                        if response.status == 401:
                            error_code = "UNAUTHORIZED"
                        elif response.status == 403:
                            error_code = "FORBIDDEN"
                        elif response.status == 404:
                            error_code = "NOT_FOUND"
                        elif response.status >= 500:
                            error_code = "API_ERROR"
                        else:
                            error_code = "API_ERROR"
                        return {
                            "valid": False,
                            "error": f"HTTP {response.status}: {error_text}",
                            "error_code": error_code
                        }
                    
                    users_data = await response.json()
                    
                # Try to get current user info if it's a user token
                current_user = "Account Token"
                try:
                    async with session.get(
                        f"{self.base_url}/users/me",
                        headers=self.headers
                    ) as me_response:
                        if me_response.status == 200:
                            user_data = await me_response.json()
                            current_user = user_data.get("user", {}).get("name", "Unknown User")
                except:
                    # Account token - can't get current user
                    pass
                
                # Get organization info from first user's HTML URL if available
                org_name = "PagerDuty Account"
                users = users_data.get("users", [])
                if users:
                    html_url = users[0].get("html_url", "")
                    if html_url and "pagerduty.com" in html_url:
                        try:
                            # Extract subdomain from URL like https://orgname.pagerduty.com/...
                            subdomain = html_url.split("//")[1].split(".")[0]
                            if subdomain and subdomain != "www":
                                org_name = subdomain.title()
                        except (IndexError, AttributeError):
                            # Fallback to default name if URL parsing fails
                            pass
                
                # Get user and service counts
                services = await self.get_services(limit=1)
                
                # Count total users and services
                total_users = await self._get_total_count("users")
                total_services = await self._get_total_count("services")
                
                return {
                    "valid": True,
                    "account_info": {
                        "organization_name": org_name,
                        "total_users": total_users,
                        "total_services": total_services,
                        "current_user": current_user
                    }
                }
                
        except Exception as e:
            # Log with more specific error categorization
            error_msg = str(e)
            if "ssl" in error_msg.lower() or "cannot connect to host" in error_msg.lower():
                logger.warning(f"PagerDuty connection failed (network/SSL): {error_msg[:100]}...")
                return {
                    "valid": False,
                    "error": "Network connectivity issue - check internet connection",
                    "error_code": "CONNECTION_ERROR"
                }
            elif "timeout" in error_msg.lower():
                logger.warning(f"PagerDuty connection timed out: {error_msg[:100]}...")
                return {
                    "valid": False,
                    "error": "Connection timeout - PagerDuty may be temporarily unavailable",
                    "error_code": "CONNECTION_ERROR"
                }
            else:
                logger.error(f"PagerDuty connection test failed: {error_msg}")
                return {
                    "valid": False,
                    "error": error_msg,
                    "error_code": "UNKNOWN_ERROR"
                }
    
    async def _get_total_count(self, resource: str) -> int:
        """Get total count of a resource (users, services, etc)."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/{resource}",
                    headers=self.headers,
                    params={"limit": 100}  # Get more records to count if total is null
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        total = data.get("total")
                        if total is not None:
                            return total
                        else:
                            # If total is null, count the actual records
                            # This is a fallback for accounts where total isn't provided
                            records = data.get(resource, [])
                            count = len(records)
                            # If there are more records, we need to estimate
                            if data.get("more", False):
                                # Simple estimation: if we got 100 records and there are more,
                                # assume there are at least 100+ records
                                return count + 50  # Conservative estimate
                            return count
            return 0
        except:
            return 0
    
    async def get_users(self, limit: int = 100, offset: int = 0, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Fetch users from PagerDuty with Redis caching.

        Args:
            limit: Maximum number of users to fetch
            offset: Pagination offset
            force_refresh: If True, bypass cache and fetch fresh data
        """
        cache_params = {"limit": limit, "offset": offset}

        # Check cache first (unless force_refresh)
        if not force_refresh:
            cached = get_cached_api_response("pagerduty", "users", self.api_token, cache_params)
            if cached is not None:
                logger.info(f"PD GET_USERS: Using cached data ({len(cached)} users)")
                return cached

        try:
            # Set 30 second timeout to prevent hanging on slow API responses
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                all_users = []
                request_count = 0
                current_offset = offset

                while True:
                    request_count += 1

                    async with session.get(
                        f"{self.base_url}/users",
                        headers=self.headers,
                        params={
                            "limit": min(limit, 100),
                            "offset": current_offset
                            # Removed include[]=contact_methods,teams - causes 40s+ response time
                            # Only need basic user data (id, email, name) for sync
                        }
                    ) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            logger.error(f"PD GET_USERS: API ERROR - HTTP {response.status}: {error_text}")
                            break

                        data = await response.json()
                        users = data.get("users", [])
                        all_users.extend(users)

                        # Check if we have more pages
                        if not data.get("more", False) or len(all_users) >= limit:
                            break

                        current_offset += len(users)

                final_users = all_users[:limit]
                user_emails = sum(1 for u in final_users if u.get("email"))

                logger.info(f"PD GET_USERS: Fetched {len(final_users)} users in {request_count} requests ({user_emails} with emails)")

                # Cache the results
                set_cached_api_response("pagerduty", "users", self.api_token, final_users, PAGERDUTY_CACHE_TTL_SECONDS, cache_params)

                return final_users

        except Exception as e:
            logger.error(f"PD GET_USERS: ERROR - {e}")
            return []
    
    async def get_teams(self, limit: int = 200, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Fetch all PagerDuty teams for the account.

        Returns a list of team objects, each containing at minimum:
          - id   (e.g. "PRSR43D")
          - name (human-readable team name)
          - summary

        Results are cached using the standard Redis cache layer.
        """
        cache_params = {"limit": limit}

        if not force_refresh:
            cached = get_cached_api_response("pagerduty", "teams", self.api_token, cache_params)
            if cached is not None:
                logger.info(f"PD GET_TEAMS: Using cached data ({len(cached)} teams)")
                return cached

        all_teams: List[Dict[str, Any]] = []
        offset = 0
        try:
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                while True:
                    async with session.get(
                        f"{self.base_url}/teams",
                        headers=self.headers,
                        params={"limit": min(100, limit), "offset": offset},
                    ) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            logger.error(f"PD GET_TEAMS: HTTP {response.status}: {error_text[:200]}")
                            break
                        data = await response.json()
                        teams = data.get("teams", [])
                        all_teams.extend(teams)
                        if not data.get("more", False) or len(all_teams) >= limit:
                            break
                        offset += len(teams)

            logger.info(f"PD GET_TEAMS: Fetched {len(all_teams)} teams")
            set_cached_api_response(
                "pagerduty", "teams", self.api_token, all_teams,
                PAGERDUTY_CACHE_TTL_SECONDS, cache_params
            )
        except Exception as e:
            logger.error(f"PD GET_TEAMS: Error fetching teams: {e}")

        return all_teams

    async def get_analytics_incidents(
        self,
        since: datetime,
        until: Optional[datetime] = None,
        limit: int = 1000,
        time_zone: str = "Etc/UTC",
        team_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch incidents from the PagerDuty Analytics API (/analytics/raw/incidents).

        Uses cursor-based pagination and returns richer per-incident data than the
        REST /incidents endpoint, including:
          - assigned_user_ids / acknowledged_user_ids / joined_user_ids  (accurate attribution)
          - seconds_to_first_ack, seconds_to_resolve
          - auto_resolved, escalation_count
          - off_hour_interruptions, sleep_hour_interruptions, business_hour_interruptions
          - total_interruptions, engaged_seconds

        Args:
            since:     Start of the analysis window (timezone-aware datetime).
            until:     End of the analysis window (defaults to now).
            limit:     Maximum total incidents to return (default 1000).
            time_zone: Timezone for the analytics query (e.g. "America/New_York").
            team_ids:  Optional list of PagerDuty team IDs to scope the query.
                       When provided, only incidents belonging to those teams are
                       returned.  Without this filter the API returns incidents from
                       the entire PagerDuty account, which is usually not what we want.

        Replaces the legacy GET /incidents call so that per-user burnout analysis is
        driven by pre-computed analytics fields rather than heuristic assignment extraction.
        """
        if until is None:
            until = datetime.now(pytz.UTC)

        since_str = since.astimezone(pytz.UTC).strftime("%Y-%m-%dT%H:%M:%S")
        until_str = until.astimezone(pytz.UTC).strftime("%Y-%m-%dT%H:%M:%S")
        days_back = (datetime.now(pytz.UTC) - since).days

        team_ids_str = ", ".join(team_ids) if team_ids else "ALL (no team filter)"
        logger.info(
            f"PD ANALYTICS: Starting fetch for {days_back} days "
            f"({since_str} → {until_str}, limit={limit}, teams={team_ids_str})"
        )

        url = f"{self.base_url}/analytics/raw/incidents"
        # Analytics API requires application/json Accept and Content-Type headers
        analytics_headers = {
            "Authorization": f"Token token={self.api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        all_incidents: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        page = 0

        try:
            timeout = aiohttp.ClientTimeout(total=60)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                while len(all_incidents) < limit:
                    page += 1
                    filters: Dict[str, Any] = {
                        "created_at_start": since_str,
                        "created_at_end": until_str,
                    }
                    if team_ids:
                        filters["team_ids"] = team_ids

                    payload: Dict[str, Any] = {
                        "filters": filters,
                        "limit": min(1000, limit - len(all_incidents)),
                        "order": "desc",
                        "order_by": "created_at",
                        "time_zone": time_zone,
                    }
                    if cursor:
                        payload["cursor"] = cursor

                    async with session.post(
                        url, headers=analytics_headers, json=payload
                    ) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            logger.error(
                                f"PD ANALYTICS: HTTP {response.status} on page {page}: "
                                f"{error_text[:300]}"
                            )
                            break

                        data = await response.json()
                        incidents = data.get("data", [])
                        all_incidents.extend(incidents)

                        # Cursor-based pagination
                        cursor = (
                            data.get("next_cursor")
                            or data.get("cursor_after")
                            or (data.get("response_metadata") or {}).get("cursors", {}).get("next")
                        )
                        if not cursor or not incidents:
                            break  # last page

                logger.info(
                    f"PD ANALYTICS: Collected {len(all_incidents)} incidents in {page} page(s)"
                )
                return all_incidents

        except asyncio.TimeoutError:
            logger.error(
                f"PD ANALYTICS: Timeout after {page} page(s), "
                f"{len(all_incidents)} incidents collected"
            )
            return all_incidents
        except Exception as e:
            logger.error(f"PD ANALYTICS: Failed to fetch incidents: {e}")
            return all_incidents

    async def get_incidents(
        self,
        since: datetime,
        until: Optional[datetime] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """Fetch incidents from PagerDuty within a date range."""
        days_back = (datetime.now(pytz.UTC) - since).days
        logger.info(f"PD GET_INCIDENTS: Starting fetch for {days_back} days (limit={limit})")

        try:
            if until is None:
                until = datetime.now(pytz.UTC)

            # Convert to ISO format with timezone
            since_str = since.astimezone(pytz.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
            until_str = until.astimezone(pytz.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
            
            async with aiohttp.ClientSession() as session:
                all_incidents = []
                offset = 0
                max_requests = 150  # Circuit breaker - max 150 requests (15000 incidents at 100 per page)
                request_count = 0
                
                while len(all_incidents) < limit and request_count < max_requests:
                    # Add timeout to prevent hanging
                    timeout = aiohttp.ClientTimeout(total=30)  # 30 second timeout per request
                    async with session.get(
                        f"{self.base_url}/incidents",
                        headers=self.headers,
                        timeout=timeout,
                        params={
                            "since": since_str,
                            "until": until_str,
                            "limit": min(100, limit - len(all_incidents)),
                            "offset": offset,
                            "include[]": ["users", "services", "teams", "escalation_policies", "priorities"],
                            "statuses[]": ["triggered", "acknowledged", "resolved"]
                        }
                    ) as response:
                        request_count += 1
                        
                        if response.status != 200:
                            error_text = await response.text()
                            token_suffix = self.api_token[-4:] if len(self.api_token) > 4 else "***"
                            logger.error(f"PD GET_INCIDENTS: API ERROR - HTTP {response.status}")
                            logger.error(f"PD GET_INCIDENTS: Token ending in {token_suffix}")
                            logger.error(f"PD GET_INCIDENTS: URL: {self.base_url}/incidents")
                            logger.error(f"PD GET_INCIDENTS: Headers: {dict(self.headers)}")
                            logger.error(f"PD GET_INCIDENTS: Params: since={since_str}, until={until_str}")
                            logger.error(f"PD GET_INCIDENTS: Response: {error_text}")
                            break
                            
                        data = await response.json()
                        incidents = data.get("incidents", [])
                        all_incidents.extend(incidents)
                        
                        # Check if we have more pages
                        if not data.get("more", False) or len(incidents) == 0:
                            break

                        offset += len(incidents)

                if request_count >= max_requests:
                    logger.warning(f"PD GET_INCIDENTS: Hit circuit breaker limit ({max_requests} requests)")

                # Calculate assignment stats for final summary
                incidents_with_assignments = sum(1 for inc in all_incidents if inc.get("assignments"))
                unique_assigned_user_ids = {
                    assignee["id"]
                    for inc in all_incidents
                    for assignment in inc.get("assignments", [])
                    if (assignee := assignment.get("assignee", {})).get("id")
                }

                logger.info(f"PD GET_INCIDENTS: Collected {len(all_incidents)} incidents in {request_count} requests ({incidents_with_assignments} assigned to {len(unique_assigned_user_ids)} users)")

                if not all_incidents:
                    logger.warning(f"PD GET_INCIDENTS: No incidents found in date range ({since_str} to {until_str})")
                
                return all_incidents
                
        except asyncio.TimeoutError:
            incidents_collected = len(all_incidents) if 'all_incidents' in locals() else 0
            logger.error(f"🕐 PAGERDUTY TIMEOUT: Incident fetch exceeded timeout")
            logger.error(f"🕐 PAGERDUTY TIMEOUT: Collected {incidents_collected} incidents before timeout")
            logger.error(f"🕐 PAGERDUTY TIMEOUT: Date range: {since_str} to {until_str}")
            logger.error(f"🕐 PAGERDUTY TIMEOUT: Requests made: {request_count if 'request_count' in locals() else 'unknown'}")
            return all_incidents if 'all_incidents' in locals() else []
        except Exception as e:
            logger.error(f"Error fetching PagerDuty incidents: {e}")
            return all_incidents if 'all_incidents' in locals() else []
    
    async def check_permissions(self) -> Dict[str, Any]:
        """
        Check API token permissions for PagerDuty endpoints.
        Checks all 4 endpoints in parallel using asyncio.gather().
        """
        permissions = {
            "users": {"access": False, "error": None},
            "incidents": {"access": False, "error": None},
            "services": {"access": False, "error": None},
            "oncalls": {"access": False, "error": None},
            "analytics": {"access": False, "error": None},
        }

        timeout = aiohttp.ClientTimeout(total=30)

        async def _check_endpoint(session, name, url, params):
            """Check a single endpoint and return (name, access, error)."""
            try:
                async with session.get(url, headers=self.headers, params=params) as response:
                    if response.status == 200:
                        return (name, True, None)
                    elif response.status == 401:
                        return (name, False, "Unauthorized - check API token")
                    elif response.status == 403:
                        return (name, False, f"Token needs '{name}:read' permission")
                    else:
                        return (name, False, f"HTTP {response.status}")
            except Exception as e:
                return (name, False, f"Connection error: {str(e)}")

        async def _check_analytics_endpoint(session):
            """Check analytics API access via a minimal POST probe."""
            try:
                now = datetime.now(pytz.UTC)
                payload = {
                    "filters": {
                        "created_at_start": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S"),
                        "created_at_end": now.strftime("%Y-%m-%dT%H:%M:%S"),
                    },
                    "limit": 1,
                }
                analytics_headers = {
                    "Authorization": f"Token token={self.api_token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                }
                async with session.post(
                    f"{self.base_url}/analytics/raw/incidents",
                    headers=analytics_headers,
                    json=payload,
                ) as response:
                    if response.status == 200:
                        return ("analytics", True, None)
                    elif response.status == 402:
                        return ("analytics", False, "Requires Analytics add-on (plan upgrade needed)")
                    elif response.status == 403:
                        return ("analytics", False, "Token lacks analytics permission")
                    elif response.status == 401:
                        return ("analytics", False, "Unauthorized - check API token")
                    else:
                        return ("analytics", False, f"HTTP {response.status}")
            except Exception as e:
                return ("analytics", False, f"Connection error: {str(e)}")

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                results = await asyncio.gather(
                    _check_endpoint(session, "users", f"{self.base_url}/users", {"limit": 1}),
                    _check_endpoint(session, "incidents", f"{self.base_url}/incidents", {"limit": 1, "total": "true"}),
                    _check_endpoint(session, "services", f"{self.base_url}/services", {"limit": 1}),
                    _check_endpoint(session, "oncalls", f"{self.base_url}/oncalls", {"limit": 1}),
                    _check_analytics_endpoint(session),
                )
                for name, access, error in results:
                    permissions[name]["access"] = access
                    permissions[name]["error"] = error
        except Exception as e:
            # If session creation fails, mark all as connection errors
            error_msg = f"Connection error: {str(e)}"
            for endpoint in permissions:
                permissions[endpoint]["error"] = error_msg

        # Log permission check results
        logger.info("🔑 PAGERDUTY PERMISSIONS CHECK:")
        for endpoint, perm in permissions.items():
            status = "✅ GRANTED" if perm["access"] else f"❌ {perm['error']}"
            logger.info(f"   - {endpoint.upper()}: {status}")

        return permissions
    
    async def get_services(self, limit: int = 100, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Fetch services from PagerDuty with Redis caching.

        Args:
            limit: Maximum number of services to fetch
            force_refresh: If True, bypass cache and fetch fresh data
        """
        cache_params = {"limit": limit}

        # Check cache first (unless force_refresh)
        if not force_refresh:
            cached = get_cached_api_response("pagerduty", "services", self.api_token, cache_params)
            if cached is not None:
                logger.info(f"PD GET_SERVICES: Using cached data ({len(cached)} services)")
                return cached

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/services",
                    headers=self.headers,
                    params={"limit": limit}
                ) as response:
                    if response.status != 200:
                        logger.error(f"Failed to fetch services: HTTP {response.status}")
                        return []

                    data = await response.json()
                    services = data.get("services", [])

                    # Cache the results
                    set_cached_api_response("pagerduty", "services", self.api_token, services, PAGERDUTY_CACHE_TTL_SECONDS, cache_params)

                    return services

        except Exception as e:
            logger.error(f"Error fetching PagerDuty services: {e}")
            return []
    
    async def get_on_call_shifts(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """
        Get on-call shifts for a specific time period from PagerDuty.
        Returns list of shifts with user information for the exact analysis timeframe.
        """
        try:
            # Format dates for API (PagerDuty expects ISO format with timezone)
            start_str = start_date.astimezone(pytz.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')
            end_str = end_date.astimezone(pytz.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')
            
            all_shifts = []
            
            async with aiohttp.ClientSession() as session:
                # Use PagerDuty oncalls API directly - much more efficient
                # This gets all on-call shifts for the time period across all schedules
                logger.info(f"Fetching all on-call shifts for period {start_str} to {end_str}")
                
                oncalls_response = await session.get(
                    f"{self.base_url}/oncalls",
                    headers=self.headers,
                    params={
                        "since": start_str,
                        "until": end_str,
                        "include[]": "users",
                        "limit": 100
                    }
                )
                
                if oncalls_response.status != 200:
                    logger.error(f"Failed to fetch oncalls: {oncalls_response.status} - {await oncalls_response.text()}")
                    return []
                
                try:
                    oncalls_data = await oncalls_response.json()
                    if oncalls_data is None:
                        logger.warning("PagerDuty oncalls response is None")
                        return []
                    
                    oncalls = oncalls_data.get("oncalls", [])
                    if oncalls is None:
                        logger.warning("PagerDuty oncalls data is None")
                        return []
                        
                except Exception as json_error:
                    logger.error(f"Failed to parse PagerDuty oncalls JSON response: {json_error}")
                    return []
                
                logger.info(f"Found {len(oncalls)} on-call shifts from PagerDuty")
                
                # Convert PagerDuty oncalls to our shift format
                for oncall in oncalls:
                    try:
                        if oncall is None:
                            logger.warning("Skipping None oncall entry")
                            continue
                            
                        # Safely extract data with null checks
                        user_data = oncall.get("user") if oncall else {}
                        if user_data is None:
                            user_data = {}
                            
                        schedule_data = oncall.get("schedule") if oncall else {}
                        if schedule_data is None:
                            schedule_data = {}
                        
                        shift = {
                            "id": f"pd_{oncall.get('start', '')}_{user_data.get('id', '')}",
                            "schedule_id": schedule_data.get("id", ""),
                            "schedule_name": schedule_data.get("summary", ""),
                            "start_time": oncall.get("start"),
                            "end_time": oncall.get("end"),
                            "user": user_data,
                            "source": "pagerduty"
                        }
                        all_shifts.append(shift)
                        
                    except Exception as shift_error:
                        logger.warning(f"Error processing oncall shift: {shift_error}, skipping shift")
                        continue
                
                logger.info(f"Retrieved {len(all_shifts)} on-call shifts for period {start_str} to {end_str}")
                return all_shifts
                
        except Exception as e:
            logger.error(f"Error fetching on-call shifts: {e}")
            return []
    
    async def extract_on_call_users_from_shifts(self, shifts: List[Dict[str, Any]]) -> set:
        """
        Extract unique user emails from PagerDuty shifts data.
        Returns set of user emails who were on-call during the period.
        """
        if not shifts or shifts is None:
            logger.info("🗓️ PAGERDUTY ON_CALL: No shifts provided for user extraction")
            return set()
        
        on_call_user_emails = set()
        
        for shift in shifts:
            try:
                if shift is None:
                    logger.warning("Skipping None shift in user extraction")
                    continue
                    
                user = shift.get("user") if shift else {}
                if user is None:
                    user = {}
                    
                email = user.get("email")
                
                if email and isinstance(email, str):
                    on_call_user_emails.add(email.lower().strip())
                    
            except Exception as e:
                logger.warning(f"Error extracting user email from shift: {e}")
                continue
        
        logger.info(f"Successfully extracted {len(on_call_user_emails)} on-call user emails from PagerDuty")
        return on_call_user_emails

    async def collect_analysis_data(self, days_back: int = 30) -> Dict[str, Any]:
        """🚀 ENHANCED: Collect all data needed for burnout analysis with enhanced normalization."""
        # 🎯 CRITICAL FIX: This method was using old normalization - now using enhanced version
        logger.info(f"🚀 ENHANCED PD COLLECT_ANALYSIS_DATA: Starting {days_back}-day collection")
        
        # Delegate to the enhanced data collection method 
        collector = PagerDutyDataCollector(self.api_token)
        enhanced_data = await collector.collect_all_data(days_back)
        
        logger.info(f"🚀 ENHANCED PD COLLECT_ANALYSIS_DATA: Enhanced collection completed")
        return enhanced_data


class PagerDutyDataCollector:
    """Collects and processes data from PagerDuty for burnout analysis."""
    
    def __init__(self, api_token: str):
        self.client = PagerDutyAPIClient(api_token)
        
    async def collect_all_data(self, days_back: int = 30) -> Dict[str, Any]:
        """Collect all necessary data for burnout analysis."""
        # 🎯 RAILWAY DEBUG: Collection start
        token_suffix = self.client.api_token[-4:] if len(self.client.api_token) > 4 else "***"
        logger.info(f"PAGERDUTY COLLECTION: Starting {days_back}-day collection with token ending in {token_suffix}")
        
        # Calculate date range
        until = datetime.now(pytz.UTC)
        since = until - timedelta(days=days_back)
        
        logger.info(f"PAGERDUTY COLLECTION: Date range {since.isoformat()} to {until.isoformat()}")
        
        # Fetch users AND teams in parallel first; teams are needed to scope the analytics query
        users_task = self.client.get_users(limit=1000)
        teams_task = self.client.get_teams(limit=200)

        logger.info(f"PAGERDUTY COLLECTION: Starting parallel API calls (users + teams)...")
        users, teams = await asyncio.gather(users_task, teams_task)

        team_ids = [t["id"] for t in teams if t.get("id")]
        logger.info(
            f"PAGERDUTY COLLECTION: Collected {len(users)} users and "
            f"{len(teams)} teams (IDs: {team_ids})"
        )

        # Now fetch analytics incidents scoped to the account's teams
        analytics_incidents = await self.client.get_analytics_incidents(
            since=since,
            until=until,
            team_ids=team_ids if team_ids else None,
        )

        logger.info(
            f"PAGERDUTY COLLECTION: Collected {len(analytics_incidents)} analytics incidents"
        )

        if users:
            has_email = bool(users[0].get('email'))
            logger.info(f"PAGERDUTY COLLECTION: Sample user structure - Keys: {list(users[0].keys())}, Has email: {has_email}")

        if analytics_incidents:
            sample = analytics_incidents[0]
            has_assigned = bool(sample.get("assigned_user_ids"))
            logger.info(
                f"PAGERDUTY COLLECTION: Sample analytics incident - "
                f"Keys: {list(sample.keys())[:10]}, Has assigned_user_ids: {has_assigned}"
            )

        # Normalize analytics incidents using user lookup maps for email resolution
        logger.info(f"🚀 PAGERDUTY COLLECTION: Starting analytics normalization process...")
        normalized_data = self._normalize_analytics_incidents(analytics_incidents, users)
        
        # 🎯 RAILWAY DEBUG: Post-normalization validation
        normalized_incidents = normalized_data.get("incidents", [])
        if normalized_incidents:
            sample_normalized = normalized_incidents[0]
            assigned_to = sample_normalized.get("assigned_to")
            has_assignment = bool(assigned_to)
            has_email = bool(assigned_to.get('email')) if assigned_to else False
            assignment_method = assigned_to.get('assignment_method', 'unknown') if assigned_to else 'none'
            logger.info(f"🚀 PAGERDUTY COLLECTION: Sample normalized incident - Has assignment: {has_assignment}, Has email: {has_email}, Method: {assignment_method}")
        
        incidents_with_emails = len([i for i in normalized_incidents if i.get("assigned_to") and i.get("assigned_to", {}).get("email")])
        logger.info(f"🚀 PAGERDUTY COLLECTION: {incidents_with_emails}/{len(normalized_incidents)} incidents have emails")

        # Calculate severity breakdown using shared utility
        from app.utils.incident_utils import calculate_severity_breakdown
        severity_counts = calculate_severity_breakdown(normalized_incidents)

        # Add enhanced collection metadata
        metadata = normalized_data.get("metadata", {})
        normalized_data["collection_metadata"] = {
            "timestamp": datetime.now().isoformat(),
            "days_analyzed": days_back,
            "date_range": {
                "start": since.isoformat(),
                "end": until.isoformat()
            },
            "data_source": "pagerduty_analytics_api",
            "total_incidents": len(analytics_incidents),
            "total_users": len(users),
            "incidents_with_valid_emails": incidents_with_emails,
            "severity_breakdown": severity_counts
        }
        
        logger.info(f"PAGERDUTY COLLECTION: COMPLETE - Returning enhanced data")
        return normalized_data
    
    def _normalize_analytics_incidents(
        self,
        analytics_incidents: List[Dict[str, Any]],
        users: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Normalize PagerDuty Analytics API incidents into the standard format.

        Analytics incidents carry pre-computed attribution fields
        (assigned_user_ids, acknowledged_user_ids, joined_user_ids) which are more
        accurate than heuristic extraction from the REST /incidents endpoint.

        Also preserves rich per-incident metrics:
          seconds_to_first_ack, auto_resolved, escalation_count,
          off_hour_interruptions, sleep_hour_interruptions, business_hour_interruptions
        """
        # Build user lookup maps from the /users response
        user_id_to_email: Dict[str, str] = {}
        user_id_to_name: Dict[str, str] = {}
        for user in users:
            uid = user.get("id")
            if uid:
                user_id_to_email[str(uid)] = user.get("email", "")
                user_id_to_name[str(uid)] = user.get("name") or user.get("summary", "Unknown")

        normalized_users = [
            {
                "id": u.get("id"),
                "name": u.get("name") or u.get("summary", "Unknown"),
                "email": u.get("email", ""),
                "timezone": u.get("time_zone", "UTC"),
                "role": u.get("role", "user"),
                "source": "pagerduty",
                "job_title": u.get("job_title", ""),
                "teams": [t.get("summary", "") for t in u.get("teams", [])],
                "contact_methods_count": len(u.get("contact_methods", [])),
            }
            for u in users
        ]

        normalized_incidents = []
        incidents_with_emails = 0

        for incident in analytics_incidents:
            if not incident or not isinstance(incident, dict):
                continue

            assigned_ids = [str(i) for i in (incident.get("assigned_user_ids") or [])]
            ack_ids      = [str(i) for i in (incident.get("acknowledged_user_ids") or [])]
            joined_ids   = [str(i) for i in (incident.get("joined_user_ids") or [])]

            # All users involved — used downstream for multi-user attribution
            all_user_ids = list(dict.fromkeys(assigned_ids + ack_ids + joined_ids))

            # Primary assignee: first assigned user wins, fall back to first acknowledger
            primary_id = assigned_ids[0] if assigned_ids else (ack_ids[0] if ack_ids else None)
            assigned_to = None
            if primary_id:
                email = user_id_to_email.get(primary_id, "")
                assigned_to = {
                    "id": primary_id,
                    "name": user_id_to_name.get(primary_id, ""),
                    "email": email,
                    "assignment_method": "analytics_assigned",
                    "confidence": "high",
                }
                if email:
                    incidents_with_emails += 1

            urgency = incident.get("incident_urgency") or incident.get("urgency", "low")

            normalized_incidents.append({
                "id": incident.get("id"),
                "title": incident.get("title", ""),
                "description": incident.get("description", ""),
                "status": incident.get("status", "resolved"),
                "severity": urgency,
                "urgency": urgency,
                "created_at": incident.get("created_at"),
                "updated_at": incident.get("resolved_at"),
                "resolved_at": incident.get("resolved_at"),
                "assigned_to": assigned_to,
                # All users involved — used by incident-to-user mapping for multi-user attribution
                "analytics_user_ids": all_user_ids,
                # Pre-computed interruption and response metrics from Analytics API
                "analytics_data": {
                    "seconds_to_first_ack":        incident.get("seconds_to_first_ack"),
                    "seconds_to_resolve":           incident.get("seconds_to_resolve"),
                    "auto_resolved":                bool(incident.get("auto_resolved")),
                    "escalation_count":             incident.get("escalation_count", 0) or 0,
                    "off_hour_interruptions":       incident.get("off_hour_interruptions", 0) or 0,
                    "sleep_hour_interruptions":     incident.get("sleep_hour_interruptions", 0) or 0,
                    "business_hour_interruptions":  incident.get("business_hour_interruptions", 0) or 0,
                    "total_interruptions":          incident.get("total_interruptions", 0) or 0,
                    "engaged_seconds":              incident.get("engaged_seconds", 0) or 0,
                },
                "service": incident.get("service_name", ""),
                "incident_number": incident.get("incident_number"),
                "teams": [incident.get("team_name")] if incident.get("team_name") else [],
                "priority_name": incident.get("priority_name", ""),
                "escalation_policy": incident.get("escalation_policy_name", ""),
                "source": "pagerduty_analytics",
                "raw_data": incident,
            })

        total = len(analytics_incidents)
        email_pct = (incidents_with_emails / total * 100) if total > 0 else 0.0
        logger.info(
            f"🚀 PD ANALYTICS NORMALIZE: {total} incidents normalized, "
            f"{incidents_with_emails} ({email_pct:.1f}%) with email attribution"
        )

        return {
            "users": normalized_users,
            "incidents": normalized_incidents,
            "total_incidents": total,
            "total_users": len(users),
            "metadata": {
                "source": "pagerduty_analytics",
                "enhancement_applied": True,
                "enhancement_timestamp": datetime.now(timezone.utc).isoformat(),
                "email_success_rate": f"{incidents_with_emails}/{total} ({email_pct:.1f}%)",
            },
        }

    def _normalize_with_enhanced_assignment_extraction(
        self,
        incidents: List[Dict[str, Any]],
        users: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        🚀 ENHANCED PagerDuty data normalization with comprehensive assignment extraction.
        
        IMPROVEMENTS:
        - User ID to email lookup mapping (fixes email: None issue)
        - Multi-source assignment extraction (assignments + acknowledgments + status changes)
        - Priority-based assignment selection
        - Comprehensive validation and logging
        - Performance optimization with caching
        """
        
        logger.info(f"🚀 PD NORMALIZE ENHANCED: Starting comprehensive normalization")
        logger.info(f"   - Input: {len(users)} users, {len(incidents)} incidents")
        
        # 🎯 STEP 1: Create optimized user lookup maps
        user_id_to_email = {}
        user_id_to_name = {}
        user_id_to_full_data = {}
        
        logger.info(f"🚀 PD NORMALIZE: Building user lookup maps...")
        for user in users:
            user_id = user.get("id")
            if user_id:
                user_id_to_email[user_id] = user.get("email", "")
                user_id_to_name[user_id] = user.get("name") or user.get("summary", "Unknown")
                user_id_to_full_data[user_id] = user
        
        users_with_emails = len([e for e in user_id_to_email.values() if e])
        email_coverage_pct = (users_with_emails / len(user_id_to_email) * 100) if user_id_to_email else 0
        logger.info(f"🚀 PD NORMALIZE: Lookup maps created:")
        logger.info(f"   - Users with emails: {users_with_emails}/{len(user_id_to_email)} ({email_coverage_pct:.1f}%)")
        logger.info(f"   - Email mapping coverage: {users_with_emails} users have email addresses")
        
        # 🎯 STEP 2: Normalize users with enhanced data
        normalized_users = []
        for user in users:
            normalized_user = {
                "id": user.get("id"),
                "name": user.get("name") or user.get("summary", "Unknown"),
                "email": user.get("email", ""),
                "timezone": user.get("time_zone", "UTC"),
                "role": user.get("role", "user"),
                "source": "pagerduty",
                # Enhanced fields
                "job_title": user.get("job_title", ""),
                "teams": [team.get("summary", "") for team in user.get("teams", [])],
                "contact_methods_count": len(user.get("contact_methods", []))
            }
            normalized_users.append(normalized_user)
        
        # 🎯 STEP 3: Enhanced incident normalization with multi-source assignment extraction
        logger.info(f"🚀 PD NORMALIZE: Starting ENHANCED incident processing...")
        
        normalized_incidents = []
        assignment_stats = {
            "from_assignments": 0,
            "from_acknowledgments": 0, 
            "from_responders": 0,
            "from_status_changes": 0,
            "no_assignment": 0,
            "assignment_methods": []
        }
        
        incidents_with_emails = 0
        
        for i, incident in enumerate(incidents):
            # 🚀 ENHANCED ASSIGNMENT EXTRACTION with priority system
            assigned_user_info = self._extract_incident_assignment_enhanced(
                incident, user_id_to_email, user_id_to_name
            )

            if assigned_user_info:
                method = assigned_user_info.get("assignment_method", "unknown")
                assignment_stats[f"from_{method}"] = assignment_stats.get(f"from_{method}", 0) + 1
                assignment_stats["assignment_methods"].append(method)

                if assigned_user_info.get("email"):
                    incidents_with_emails += 1
            else:
                assignment_stats["no_assignment"] += 1

            # Extract urgency (PagerDuty's incident classification)
            urgency = incident.get("urgency", "low")
            logger.info(f"PD incident {incident.get('incident_number')}: urgency={urgency}")

            # Create normalized incident
            normalized_incident = {
                "id": incident.get("id"),
                "title": incident.get("title", ""),
                "description": incident.get("description", ""),
                "status": incident.get("status", "open"),
                "severity": urgency,  # Store urgency (high/low) - PagerDuty's incident classification
                "created_at": incident.get("created_at"),
                "updated_at": incident.get("last_status_change_at") or incident.get("updated_at"),
                "resolved_at": incident.get("resolved_at") if incident.get("status") == "resolved" else None,
                "assigned_to": assigned_user_info,
                "service": incident.get("service", {}).get("summary", ""),
                "urgency": urgency,
                "source": "pagerduty",
                "raw_data": incident,  # Keep for debugging
                # Enhanced fields
                "incident_number": incident.get("incident_number"),
                "escalation_policy": incident.get("escalation_policy", {}).get("summary", ""),
                "teams": [team.get("summary", "") for team in incident.get("teams", [])],
                "priority_name": incident.get("priority", {}).get("summary", "") if incident.get("priority") else ""
            }

            normalized_incidents.append(normalized_incident)

            # Log progress for first few incidents with structure info (no PII)
            if i < 2:
                has_assignment = bool(assigned_user_info)
                has_email = bool(assigned_user_info.get("email")) if assigned_user_info else False
                logger.info(f"🚀 PD INCIDENT #{i}: '{normalized_incident['title'][:50]}' - Assigned: {has_assignment}, Has email: {has_email}")
                logger.info(f"   Available fields: {list(incident.keys())}")
                logger.info(f"   Priority: {incident.get('priority')}")
                logger.info(f"   Urgency: {incident.get('urgency')}")
                logger.info(f"   Custom fields present: {bool(incident.get('custom_fields'))}")
                logger.info(f"   Body structure: {list(incident.get('body', {}).keys()) if incident.get('body') else 'None'}")
        
        # 🎯 STEP 4: Calculate success statistics
        total_incidents = len(incidents)
        assigned_incidents = total_incidents - assignment_stats["no_assignment"]

        # Calculate percentages safely (avoid division by zero)
        assignment_pct = (assigned_incidents/total_incidents*100) if total_incidents > 0 else 0.0
        email_pct = (incidents_with_emails/total_incidents*100) if total_incidents > 0 else 0.0

        logger.info(f"🚀 PD NORMALIZE: ASSIGNMENT EXTRACTION RESULTS:")
        logger.info(f"   - Total incidents processed: {total_incidents}")
        logger.info(f"   - Incidents with assignments: {assigned_incidents} ({assignment_pct:.1f}%)")
        logger.info(f"   - Incidents with valid emails: {incidents_with_emails} ({email_pct:.1f}%)")
        logger.info(f"   - Assignment sources:")
        for method, count in assignment_stats.items():
            if method.startswith("from_") and count > 0:
                logger.info(f"     • {method.replace('from_', '').title()}: {count}")

        # 🎯 STEP 5: Build final normalized data structure
        normalized_data = {
            "users": normalized_users,
            "incidents": normalized_incidents,
            "total_incidents": total_incidents,
            "total_users": len(users),
            "metadata": {
                "source": "pagerduty",
                "enhancement_applied": True,
                "enhancement_timestamp": datetime.now(timezone.utc).isoformat(),
                "assignment_extraction_stats": assignment_stats,
                "email_success_rate": f"{incidents_with_emails}/{total_incidents} ({email_pct:.1f}%)"
            }
        }
        
        logger.info(f"🚀 PD NORMALIZE ENHANCED: COMPLETE!")
        logger.info(f"   - SUCCESS: {incidents_with_emails}/{total_incidents} incidents have user emails")
        
        return normalized_data
    
    def _extract_incident_assignment_enhanced(
        self, 
        incident: Dict[str, Any], 
        user_id_to_email: Dict[str, str],
        user_id_to_name: Dict[str, str]
    ) -> Optional[Dict[str, Any]]:
        """
        🚀 ENHANCED assignment extraction with multi-source priority system.
        
        Priority order:
        1. Direct assignments (highest confidence)
        2. Acknowledgments (user actively engaged) 
        3. Incident responders (user involved in response)
        4. Status changes (user interacted with incident)
        """
        
        # Priority 1: Direct assignments
        assignments = incident.get("assignments", [])
        if assignments:
            assignee = assignments[0].get("assignee", {})  # Take first assignment
            user_id = assignee.get("id")
            if user_id:
                return {
                    "id": user_id,
                    "name": user_id_to_name.get(user_id, assignee.get("summary", "Unknown")),
                    "email": user_id_to_email.get(user_id, ""),
                    "assignment_method": "assignments",
                    "confidence": "high"
                }
        
        # Priority 2: Acknowledgments
        acknowledgments = incident.get("acknowledgements", []) or incident.get("acknowledgments", [])
        if acknowledgments:
            acknowledger = acknowledgments[0].get("acknowledger", {})  # Take first acknowledgment
            user_id = acknowledger.get("id")
            if user_id and acknowledger.get("type") == "user_reference":
                return {
                    "id": user_id,
                    "name": user_id_to_name.get(user_id, acknowledger.get("summary", "Unknown")),
                    "email": user_id_to_email.get(user_id, ""),
                    "assignment_method": "acknowledgments",
                    "confidence": "medium"
                }
        
        # Priority 3: Incident responders
        responders = incident.get("incidents_responders", [])
        if responders:
            for responder in responders:
                user_ref = responder.get("user")
                if user_ref and user_ref.get("type") == "user_reference":
                    user_id = user_ref.get("id")
                    if user_id:
                        return {
                            "id": user_id,
                            "name": user_id_to_name.get(user_id, user_ref.get("summary", "Unknown")),
                            "email": user_id_to_email.get(user_id, ""),
                            "assignment_method": "responders",
                            "confidence": "medium"
                        }
        
        # Priority 4: Last status change (fallback)
        status_changer = incident.get("last_status_change_by", {})
        if status_changer and status_changer.get("type") == "user_reference":
            user_id = status_changer.get("id")
            if user_id:
                return {
                    "id": user_id,
                    "name": user_id_to_name.get(user_id, status_changer.get("summary", "Unknown")),
                    "email": user_id_to_email.get(user_id, ""),
                    "assignment_method": "status_changes",
                    "confidence": "low"
                }
        
        return None  # No assignment found
    
    def _extract_priority(self, priority: Optional[Dict[str, Any]], urgency: str) -> str:
        """
        Extract priority level from PagerDuty incident.
        Returns P1-P5 based on priority field, or based on urgency if no priority set.

        Note: PagerDuty incidents have 'priority' (P1-P5) which is business urgency,
        NOT severity (technical impact). These are different concepts and should not be conflated.
        """
        if priority and isinstance(priority, dict):
            priority_name = priority.get("summary", "").lower()
            if not priority_name:
                priority_name = priority.get("name", "").lower()

            # Extract P1-P5 from priority name
            if "p1" in priority_name or "critical" in priority_name:
                return "P1"
            elif "p2" in priority_name or "high" in priority_name:
                return "P2"
            elif "p3" in priority_name or "medium" in priority_name:
                return "P3"
            elif "p4" in priority_name or "low" in priority_name:
                return "P4"
            elif "p5" in priority_name or "info" in priority_name:
                return "P5"

        # Fallback to urgency-based priority if no explicit priority set
        if urgency and urgency.lower() == "high":
            return "P1"  # High urgency = P1
        else:
            return "P4"  # Low/unknown urgency = P4