"""
Rootly API client for direct HTTP integration.
"""
import asyncio
import httpx
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from urllib.parse import urlencode

from .config import settings

logger = logging.getLogger(__name__)

class RootlyAPIClient:
    """Direct HTTP client for Rootly API."""
    
    def __init__(self, api_token: str):
        self.api_token = api_token
        self.base_url = settings.ROOTLY_API_BASE_URL
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json"
        }
    
    async def check_permissions(self) -> Dict[str, Any]:
        """Check permissions for specific API endpoints."""
        permissions = {
            "users": {"access": False, "error": None},
            "incidents": {"access": False, "error": None}
        }
        
        try:
            async with httpx.AsyncClient() as client:
                # Test users endpoint
                try:
                    response = await client.get(
                        f"{self.base_url}/v1/users",
                        headers=self.headers,
                        params={"page[size]": 1},
                        timeout=10.0
                    )
                    
                    if response.status_code == 200:
                        permissions["users"]["access"] = True
                    elif response.status_code == 401:
                        permissions["users"]["error"] = "Unauthorized - check API token"
                    elif response.status_code == 403:
                        permissions["users"]["error"] = "Token needs 'users:read' permission"
                    elif response.status_code == 404:
                        permissions["users"]["error"] = "API token doesn't have access to user data"
                    else:
                        permissions["users"]["error"] = f"HTTP {response.status_code}"
                        
                except Exception as e:
                    permissions["users"]["error"] = f"Connection error: {str(e)}"
                
                # Test incidents endpoint
                try:
                    response = await client.get(
                        f"{self.base_url}/v1/incidents",
                        headers=self.headers,
                        params={"page[size]": 1},
                        timeout=10.0
                    )
                    
                    if response.status_code == 200:
                        permissions["incidents"]["access"] = True
                    elif response.status_code == 401:
                        permissions["incidents"]["error"] = "Unauthorized - check API token"
                    elif response.status_code == 403:
                        permissions["incidents"]["error"] = "Token needs 'incidents:read' permission"
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
        """Test API connection and return basic account info with permissions."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v1/users",
                    headers=self.headers,
                    params={"page[size]": 1},
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Safety check for data
                    if data is None:
                        logger.error("API response json() returned None")
                        return {
                            "status": "error",
                            "message": "Invalid JSON response from API",
                            "error_code": "INVALID_RESPONSE"
                        }
                    
                    # Log summary instead of full response to reduce noise
                    logger.debug(f"Rootly users API: Retrieved {len(data.get('data', []))} users from {data.get('meta', {}).get('total_count', 'unknown')} total")
                    
                    # Extract any organization/account info from the response
                    organization_name = None
                    account_info = {
                        "total_users": data.get("meta", {}).get("total_count", 0),
                        "api_version": "v1"
                    }
                    
                    # Check if there's organization info in meta or data
                    if "meta" in data:
                        meta = data["meta"]
                        if "organization" in meta:
                            organization_name = meta.get("organization", {}).get("name")
                        elif "account" in meta:
                            organization_name = meta.get("account", {}).get("name")
                    
                    # Check first user data for organization info
                    if "data" in data and data["data"] and len(data["data"]) > 0:
                        first_user = data["data"][0]
                        if "attributes" in first_user:
                            attrs = first_user["attributes"]
                            # Extract organization name from full_name_with_team: "[Team Name] User Name"
                            if "full_name_with_team" in attrs:
                                full_name_with_team = attrs["full_name_with_team"]
                                if full_name_with_team and full_name_with_team.startswith("[") and "]" in full_name_with_team:
                                    organization_name = full_name_with_team.split("]")[0][1:]  # Extract text between [ ]
                            # Fallback to other fields
                            elif "organization_name" in attrs:
                                organization_name = attrs["organization_name"]
                            elif "company" in attrs:
                                organization_name = attrs["company"]
                    
                    # Only include organization name if available
                    if organization_name:
                        account_info["organization_name"] = organization_name
                    
                    # Check permissions for required endpoints
                    permissions = await self.check_permissions()
                    account_info["permissions"] = permissions
                    
                    return {
                        "status": "success",
                        "message": "Connected successfully",
                        "account_info": account_info
                    }
                elif response.status_code == 401:
                    return {
                        "status": "error",
                        "message": "Invalid API token",
                        "error_code": "UNAUTHORIZED"
                    }
                elif response.status_code == 404:
                    return {
                        "status": "error", 
                        "message": "API endpoint not found - check your Rootly configuration",
                        "error_code": "NOT_FOUND"
                    }
                else:
                    return {
                        "status": "error",
                        "message": f"API request failed with status {response.status_code}",
                        "error_code": "API_ERROR"
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
    
    async def get_users(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch users from Rootly API."""
        all_users = []
        page = 1
        page_size = min(limit, 100)  # Rootly API typically limits to 100 per page
        
        try:
            async with httpx.AsyncClient() as client:
                while len(all_users) < limit:
                    # URL encode the parameters manually since httpx doesn't encode brackets properly
                    params_encoded = urlencode({
                        "page[number]": page,
                        "page[size]": page_size
                    })

                    response = await client.get(
                        f"{self.base_url}/v1/users?{params_encoded}",
                        headers=self.headers,
                        timeout=30.0
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

                    # Check if we have more pages
                    meta = data.get("meta", {})
                    total_pages = meta.get("total_pages", 1)

                    if page >= total_pages:
                        break

                    page += 1

                return all_users[:limit]
                
        except Exception as e:
            logger.error(f"Error fetching users: {e}")
            raise
    
    async def get_on_call_shifts(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """
        Get on-call shifts for a specific time period from Rootly.

        Rootly API structure:
        1. First get all schedules via /v1/schedules
        2. For each schedule, get shifts via /v1/schedules/{id}/shifts with date filters
        """
        try:
            # Format dates for API (Rootly expects ISO format)
            start_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            end_str = end_date.strftime('%Y-%m-%dT%H:%M:%S.%fZ')

            all_shifts = []

            async with httpx.AsyncClient() as client:
                # Step 1: Get all schedules
                schedules_response = await client.get(
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
                logger.info(f"📅 Found {len(schedules)} on-call schedules")

                # Step 2: For each schedule, get shifts in the time range
                for schedule in schedules:
                    schedule_id = schedule.get('id')
                    schedule_name = schedule.get('attributes', {}).get('name', 'Unknown')
                    logger.info(f"📅 Checking schedule '{schedule_name}' (id: {schedule_id}) for shifts between {start_str} and {end_str}")

                    shifts_response = await client.get(
                        f"{self.base_url}/v1/schedules/{schedule_id}/shifts",
                        headers=self.headers,
                        params={
                            'filter[starts_at][gte]': start_str,
                            'filter[ends_at][lte]': end_str,
                            'include': 'user',
                            'page[size]': 100
                        },
                        timeout=30.0
                    )

                    if shifts_response.status_code == 200:
                        shifts_data = shifts_response.json()
                        shifts = shifts_data.get('data', [])
                        logger.info(f"✅ Schedule '{schedule_name}': Found {len(shifts)} shifts")
                        if len(shifts) > 0:
                            # Log first shift for debugging
                            logger.info(f"📝 Sample shift data: {shifts[0]}")
                        all_shifts.extend(shifts)
                    else:
                        logger.warning(f"❌ Failed to fetch shifts for schedule {schedule_name}: {shifts_response.status_code}")

                logger.info(f"📊 Total shifts found across all schedules: {len(all_shifts)}")
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
        
        # Step 2: Fetch user details to get emails
        on_call_user_emails = set()
        
        if user_ids:
            try:
                # Fetch all users (we already have this data from get_users)
                # Instead of making new API calls, we'll match against existing user data
                # For now, let's make targeted calls for the on-call user IDs
                
                async with httpx.AsyncClient() as client:
                    for user_id in user_ids:
                        try:
                            response = await client.get(
                                f"{self.base_url}/v1/users/{user_id}",
                                headers=self.headers,
                                timeout=10.0
                            )

                            if response.status_code == 200:
                                user_data = response.json()
                                if 'data' in user_data:
                                    attributes = user_data['data'].get('attributes', {})
                                    email = attributes.get('email')
                                    if email:
                                        on_call_user_emails.add(email.lower().strip())

                        except Exception as e:
                            logger.warning(f"Error fetching user {user_id}: {e}")
                            continue
                            
            except Exception as e:
                logger.error(f"Error fetching on-call user details: {e}")
        
        return on_call_user_emails
    
    async def get_incidents(self, days_back: int = 30, limit: int = 1000) -> List[Dict[str, Any]]:
        """Fetch incidents from Rootly API."""
        fetch_start_time = datetime.now()
        all_incidents = []
        page = 1
        page_size = min(100, limit)  # Rootly API page size limit
        api_calls_made = 0
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)

        try:
            async with httpx.AsyncClient() as client:
                # Test basic access to incidents endpoint
                test_response = await client.get(
                    f"{self.base_url}/v1/incidents",
                    headers=self.headers,
                    params={"page[size]": 1},
                    timeout=30.0
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
                        "include": "severity,user,started_by,resolved_by",
                        "fields[incidents]": "created_at,started_at,acknowledged_at,resolved_at,mitigated_at,severity,user,title,status"
                    }

                    params_encoded = urlencode(params)

                    try:
                        # Check if we've exceeded total pagination timeout
                        pagination_elapsed = (datetime.now() - pagination_start).total_seconds()
                        if pagination_elapsed > total_pagination_timeout:
                            logger.error(f"Pagination timeout exceeded after {len(all_incidents)} incidents")
                            break

                        response = await client.get(
                            f"{self.base_url}/v1/incidents?{params_encoded}",
                            headers=self.headers,
                            timeout=15.0
                        )
                        api_calls_made += 1
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
                            # Wait before retrying
                            await asyncio.sleep(2 ** consecutive_failures)  # Exponential backoff
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
                                await asyncio.sleep(5 * consecutive_failures)
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
    
    async def collect_analysis_data(self, days_back: int = 30) -> Dict[str, Any]:
        """Collect all data needed for burnout analysis."""
        start_time = datetime.now()

        try:
            # Test connection first
            connection_test = await self.test_connection()

            if connection_test["status"] != "success":
                raise Exception(f"Connection test failed: {connection_test['message']}")

            # Log expected data volume based on time range
            expected_incident_multiplier = days_back / 7  # Relative to 7-day baseline
            logger.info(f"🔍 DATA VOLUME ESTIMATE: {days_back}-day analysis expected to fetch ~{expected_incident_multiplier:.1f}x more incidents than 7-day analysis")

            # Collect users and incidents in parallel (no limits for complete data collection)
            users_start = datetime.now()
            incidents_start = datetime.now()

            logger.info(f"🔍 USER FETCH: Starting user collection for {days_back}-day analysis (limit: 10000)")
            users_task = self.get_users(limit=10000)  # Get all users (increased from 1000)

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

            incidents_task = self.get_incidents(days_back=days_back, limit=incident_limit)

            # Collect users (required)
            users = await users_task

            # Try to collect incidents but don't fail if permission denied
            incidents = []
            try:
                incidents = await incidents_task
            except Exception as e:
                logger.warning(f"Could not fetch incidents: {e}. Proceeding with user data only.")

            # Validate data
            if not users:
                raise Exception("No users found - check API permissions")
            
            # Count incidents by severity
            severity_counts = {
                "sev0_count": 0,  # Critical/Emergency
                "sev1_count": 0,
                "sev2_count": 0,
                "sev3_count": 0,
                "sev4_count": 0
            }
            
            # Process incidents to count severities
            for incident in incidents:
                try:
                    # Extract severity from incident attributes
                    attrs = incident.get("attributes", {})
                    severity_info = attrs.get("severity", {})
                    severity_name = "sev4"  # Default
                    
                    if isinstance(severity_info, dict) and "data" in severity_info:
                        severity_data = severity_info.get("data", {})
                        if isinstance(severity_data, dict) and "attributes" in severity_data:
                            severity_attrs = severity_data["attributes"]
                            # Look for severity name or level
                            severity_name = severity_attrs.get("name", "sev4").lower()
                            if not severity_name.startswith("sev"):
                                # Map common severity names to sev levels
                                severity_map = {
                                    "critical": "sev1",
                                    "high": "sev2", 
                                    "medium": "sev3",
                                    "low": "sev4"
                                }
                                severity_name = severity_map.get(severity_name.lower(), "sev4")
                    
                    # Increment the appropriate counter
                    if severity_name == "sev0" or severity_name == "emergency":
                        severity_counts["sev0_count"] += 1
                    elif severity_name == "sev1":
                        severity_counts["sev1_count"] += 1
                    elif severity_name == "sev2":
                        severity_counts["sev2_count"] += 1
                    elif severity_name == "sev3":
                        severity_counts["sev3_count"] += 1
                    else:
                        severity_counts["sev4_count"] += 1
                        
                except Exception as e:
                    logger.debug(f"Error counting severity for incident: {e}")
                    # Default to sev4 on error
                    severity_counts["sev4_count"] += 1
            
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