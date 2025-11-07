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
                        timeout=30.0  # Increased from 10s to match other API calls
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
                        timeout=30.0  # Increased from 10s to match other API calls
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
                    
                    logger.info(f"Fetching users page {page} (page_size: {page_size})")
                    
                    response = await client.get(
                        f"{self.base_url}/v1/users?{params_encoded}",
                        headers=self.headers,
                        timeout=30.0
                    )
                    
                    if response.status_code != 200:
                        logger.error(f"Rootly API request failed: {response.status_code} {response.text}")
                        logger.error(f"Request URL: {self.base_url}/v1/users")
                        logger.error(f"Request headers: Content-Type: {self.headers.get('Content-Type', 'N/A')}")
                        raise Exception(f"API request failed: {response.status_code} {response.text}")
                    
                    data = response.json()
                    
                    # Safety check for data
                    if data is None:
                        logger.error("Users API response json() returned None")
                        break
                    
                    users = data.get("data", [])
                    
                    if not users:
                        logger.info(f"No more users found on page {page}")
                        break
                    
                    all_users.extend(users)
                    logger.info(f"Fetched {len(users)} users from page {page}, total: {len(all_users)}")
                    
                    # Check if we have more pages
                    meta = data.get("meta", {})
                    total_pages = meta.get("total_pages", 1)
                    logger.info(f"Page {page} of {total_pages}")
                    
                    if page >= total_pages:
                        logger.info(f"Reached last page ({page}/{total_pages})")
                        break
                    
                    page += 1
                
                logger.info(f"Fetched {len(all_users)} users from Rootly")
                return all_users[:limit]
                
        except Exception as e:
            logger.error(f"Error fetching users: {e}")
            raise
    
    async def get_on_call_shifts(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """
        Get on-call shifts for a specific time period.
        Returns list of shifts with user information for the exact analysis timeframe.
        
        This handles historical schedules - if your analysis period is 30 days ago,
        it will fetch who was on-call during that historical period.
        """
        try:
            # Format dates for API (Rootly expects ISO format)
            start_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            end_str = end_date.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            
            params = {
                'filter[starts_at][gte]': start_str,
                'filter[ends_at][lte]': end_str,
                'include': 'user',  # Include user data in response
                'page[size]': 100   # Get up to 100 shifts per request
            }
            
            all_shifts = []
            page = 1
            
            async with httpx.AsyncClient() as client:
                while True:
                    params['page[number]'] = page
                    
                    response = await client.get(
                        f"{self.base_url}/v1/shifts",
                        headers=self.headers,
                        params=params,
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        shifts = data.get('data', [])
                        
                        if not shifts:
                            break
                            
                        all_shifts.extend(shifts)
                        
                        # Check if there are more pages
                        links = data.get('links', {})
                        if not links.get('next'):
                            break
                            
                        page += 1
                    else:
                        logger.error(f"Failed to fetch on-call shifts: {response.status_code} - {response.text}")
                        break
                
                logger.info(f"Retrieved {len(all_shifts)} on-call shifts for period {start_str} to {end_str}")
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
            logger.info(f"🗓️ ROOTLY ON_CALL: No shifts provided for user extraction")
            return set()
            
        # Step 1: Extract unique user IDs from shifts
        user_ids = set()
        for shift in shifts:
            try:
                if not shift or not isinstance(shift, dict):
                    logger.warning(f"🗓️ ROOTLY ON_CALL: Invalid shift data: {type(shift)}")
                    continue
                    
                relationships = shift.get('relationships', {})
                if not relationships:
                    logger.debug(f"🗓️ ROOTLY ON_CALL: No relationships in shift")
                    continue
                    
                user_data = relationships.get('user', {}).get('data', {})
                
                if user_data and user_data.get('type') == 'users':
                    user_id = user_data.get('id')
                    if user_id:
                        user_ids.add(user_id)
                        
            except Exception as e:
                logger.warning(f"🗓️ ROOTLY ON_CALL: Error extracting user ID from shift: {e}")
                logger.warning(f"🗓️ ROOTLY ON_CALL: Problematic shift data: {shift}")
                continue
        
        logger.info(f"Found {len(user_ids)} unique user IDs from {len(shifts)} shifts")
        
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
                                f"{self.base_url}/users/{user_id}",
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
        
        logger.info(f"Successfully extracted {len(on_call_user_emails)} on-call user emails")
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
        
        logger.info(f"🔍 INCIDENT FETCH START: Fetching incidents for {days_back} days (from {start_date.date()} to {end_date.date()})")
        logger.info(f"🔍 INCIDENT PARAMETERS: limit={limit}, initial_page_size={page_size}")
        
        try:
            async with httpx.AsyncClient() as client:
                # First test basic access to incidents endpoint
                test_start = datetime.now()
                logger.info(f"🔍 INCIDENT TEST: Testing basic endpoint access for {days_back}-day analysis")
                test_response = await client.get(
                    f"{self.base_url}/v1/incidents",
                    headers=self.headers,
                    params={"page[size]": 1},
                    timeout=30.0
                )
                test_duration = (datetime.now() - test_start).total_seconds()
                api_calls_made += 1
                
                logger.info(f"🔍 INCIDENT TEST: Basic test completed in {test_duration:.2f}s - Status: {test_response.status_code}")
                if test_response.status_code == 404:
                    logger.error("🔍 INCIDENT TEST: FAILED - Permissions check failed")
                    raise Exception("Cannot access incidents endpoint. Please verify your Rootly API token has 'incidents:read' permission.")
                elif test_response.status_code != 200:
                    logger.error(f"🔍 INCIDENT TEST: FAILED - Status {test_response.status_code}: {test_response.text}")
                    raise Exception(f"Basic incidents endpoint failed: {test_response.status_code}")
                else:
                    logger.info("🔍 INCIDENT TEST: PASSED - Endpoint accessible")
                
                pagination_start = datetime.now()
                consecutive_failures = 0
                max_consecutive_failures = 3
                total_pagination_timeout = 600  # 10 minutes max for all pagination
                
                while len(all_incidents) < limit and consecutive_failures < max_consecutive_failures:
                    page_start_time = datetime.now()
                    
                    # Use adaptive page size based on time range to optimize performance
                    if days_back >= 90:
                        # Maximum page size for very long ranges
                        actual_page_size = min(page_size, 100)
                        logger.info(f"🔍 INCIDENT OPTIMIZATION: Using maximum page size ({actual_page_size}) for {days_back}-day analysis")
                    elif days_back >= 30:
                        # Larger pages for longer ranges to reduce total API calls
                        actual_page_size = min(page_size, 50)
                        logger.info(f"🔍 INCIDENT OPTIMIZATION: Using larger page size ({actual_page_size}) for {days_back}-day analysis")
                    else:
                        # Conservative page size for shorter ranges
                        actual_page_size = min(page_size, 20)
                        logger.info(f"🔍 INCIDENT OPTIMIZATION: Using standard page size ({actual_page_size}) for {days_back}-day analysis")
                    params = {
                        "page[number]": page,
                        "page[size]": actual_page_size,
                        "filter[created_at][gte]": start_date.isoformat(),
                        "filter[created_at][lte]": end_date.isoformat(),
                        "include": "severity,user,started_by,resolved_by",
                        "fields[incidents]": "created_at,started_at,acknowledged_at,resolved_at,mitigated_at,severity,user,title,status"
                    }
                    
                    # URL encode the parameters manually since httpx doesn't encode brackets properly
                    params_encoded = urlencode(params)
                    
                    logger.info(f"🔍 INCIDENT PAGE {page}: Requesting {actual_page_size} incidents for {days_back}-day analysis")
                    
                    try:
                        # Check if we've exceeded total pagination timeout
                        pagination_elapsed = (datetime.now() - pagination_start).total_seconds()
                        if pagination_elapsed > total_pagination_timeout:
                            logger.error(f"🔍 PAGINATION TIMEOUT: Exceeded {total_pagination_timeout}s limit after {len(all_incidents)} incidents")
                            break
                        
                        response = await client.get(
                            f"{self.base_url}/v1/incidents?{params_encoded}",
                            headers=self.headers,
                            timeout=15.0  # Reduce timeout to 15 seconds for faster failure
                        )
                        api_calls_made += 1
                        page_request_duration = (datetime.now() - page_start_time).total_seconds()
                        logger.info(f"🔍 INCIDENT PAGE {page}: Request completed in {page_request_duration:.2f}s - Status: {response.status_code}")
                    except Exception as request_error:
                        consecutive_failures += 1
                        page_request_duration = (datetime.now() - page_start_time).total_seconds()
                        logger.error(f"🔍 INCIDENT PAGE {page}: REQUEST FAILED after {page_request_duration:.2f}s: {request_error} (failure {consecutive_failures}/{max_consecutive_failures})")
                        logger.error(f"🔍 INCIDENT PAGE {page}: Exception type: {type(request_error).__name__}")
                        
                        # If we have some incidents already, continue with partial data
                        if consecutive_failures >= max_consecutive_failures:
                            if all_incidents:
                                logger.warning(f"🔍 INCIDENT FETCH: Stopping after {consecutive_failures} consecutive failures. Returning {len(all_incidents)} incidents collected so far.")
                                break
                            else:
                                # No incidents collected, re-raise the error
                                raise request_error
                        else:
                            # Wait before retrying
                            await asyncio.sleep(2 ** consecutive_failures)  # Exponential backoff
                            continue
                    
                    if response.status_code != 200:
                        consecutive_failures += 1
                        error_detail = response.text
                        logger.error(f"🔍 INCIDENT PAGE {page}: API ERROR - {response.status_code}: {error_detail} (failure {consecutive_failures}/{max_consecutive_failures})")
                        
                        # Handle specific error cases
                        if response.status_code == 404 and "not found or unauthorized" in error_detail.lower():
                            raise Exception(f"Rootly API access denied. Please ensure your API token has 'incidents:read' permission and access to incident data. Error: {response.status_code} {error_detail}")
                        elif response.status_code in [429, 502, 503, 504]:  # Rate limit or server errors
                            if consecutive_failures >= max_consecutive_failures:
                                if all_incidents:
                                    logger.warning(f"🔍 INCIDENT FETCH: API errors after {consecutive_failures} attempts. Returning {len(all_incidents)} incidents collected so far.")
                                    break
                                else:
                                    raise Exception(f"API repeatedly failing: {response.status_code} {error_detail}")
                            else:
                                # Wait before retrying
                                await asyncio.sleep(5 * consecutive_failures)  # Linear backoff for server errors
                                continue
                        else:
                            raise Exception(f"API request failed: {response.status_code} {error_detail}")
                    else:
                        # Reset failure counter on success
                        consecutive_failures = 0
                    
                    data = response.json()
                    
                    # Safety check for data
                    if data is None:
                        logger.error(f"🔍 INCIDENT PAGE {page}: API response returned None")
                        break
                    
                    incidents = data.get("data", [])
                    
                    if not incidents:
                        logger.info(f"🔍 INCIDENT PAGE {page}: No more incidents found - stopping pagination")
                        break
                    
                    all_incidents.extend(incidents)
                    page_duration = (datetime.now() - page_start_time).total_seconds()
                    logger.info(f"🔍 INCIDENT PAGE {page}: Retrieved {len(incidents)} incidents in {page_duration:.2f}s (total: {len(all_incidents)})")
                    
                    # Check if we have more pages
                    meta = data.get("meta", {})
                    total_pages = meta.get("total_pages", 1)
                    logger.info(f"🔍 INCIDENT PAGE {page}: Page {page} of {total_pages}")
                    
                    if page >= total_pages:
                        logger.info(f"🔍 INCIDENT PAGINATION: Reached final page ({page}/{total_pages})")
                        break
                    
                    page += 1
                
                # Calculate final metrics
                total_fetch_duration = (datetime.now() - fetch_start_time).total_seconds()
                pagination_duration = (datetime.now() - pagination_start).total_seconds()
                avg_incidents_per_page = len(all_incidents) / (page - 1) if page > 1 else len(all_incidents)
                avg_time_per_page = pagination_duration / (page - 1) if page > 1 else pagination_duration
                incidents_per_second = len(all_incidents) / total_fetch_duration if total_fetch_duration > 0 else 0
                
                logger.info(f"🔍 INCIDENT FETCH COMPLETE: {days_back}-day analysis fetched {len(all_incidents)} incidents")
                logger.info(f"🔍 INCIDENT METRICS: Total time: {total_fetch_duration:.2f}s, API calls: {api_calls_made}, Pages: {page-1}")
                logger.info(f"🔍 INCIDENT PERFORMANCE: {incidents_per_second:.1f} incidents/sec, {avg_incidents_per_page:.1f} incidents/page, {avg_time_per_page:.2f}s/page")
                
                # Log performance concerns for longer analyses
                if days_back >= 30 and total_fetch_duration > 300:  # 5 minutes
                    logger.warning(f"🔍 PERFORMANCE WARNING: {days_back}-day incident fetch took {total_fetch_duration:.2f}s (>5min) - may impact analysis timeout")
                elif days_back >= 30 and total_fetch_duration > 600:  # 10 minutes
                    logger.error(f"🔍 PERFORMANCE CRITICAL: {days_back}-day incident fetch took {total_fetch_duration:.2f}s (>10min) - likely to cause timeout")
                
                return all_incidents[:limit]
                
        except Exception as e:
            total_fetch_duration = (datetime.now() - fetch_start_time).total_seconds()
            logger.error(f"🔍 INCIDENT FETCH FAILED: {days_back}-day analysis failed after {total_fetch_duration:.2f}s and {api_calls_made} API calls: {e}")
            raise
    
    async def get_user_incident_roles(self, user_id: str, incident_ids: List[str]) -> List[Dict[str, Any]]:
        """Get user roles for specific incidents."""
        # This would require additional API calls to incident role endpoints
        # For now, return empty list - this can be expanded based on Rootly API capabilities
        return []
    
    async def collect_analysis_data(self, days_back: int = 30) -> Dict[str, Any]:
        """Collect all data needed for burnout analysis."""
        start_time = datetime.now()
        logger.info(f"🔍 PERFORMANCE ANALYSIS: Starting Rootly data collection for last {days_back} days...")
        logger.info(f"🔍 TIME RANGE ANALYSIS: {days_back}-day analysis started at {start_time.isoformat()}")
        
        try:
            # Test connection first
            connection_start = datetime.now()
            logger.info(f"🔍 CONNECTION TEST: Starting connection test for {days_back}-day analysis")
            connection_test = await self.test_connection()
            connection_duration = (datetime.now() - connection_start).total_seconds()
            logger.info(f"🔍 CONNECTION TEST: Completed in {connection_duration:.2f}s - Status: {connection_test['status']}")
            
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
                7: 1500,   # 7-day: up to 1500 incidents (reduced from 2000)
                14: 2000,  # 14-day: up to 2000 incidents (reduced from 3000)  
                30: 3000,  # 30-day: up to 3000 incidents (reduced from 5000)
                60: 4000,  # 60-day: up to 4000 incidents (reduced from 7000)
                90: 5000,  # 90-day: up to 5000 incidents (reduced from 10000)
                180: 7500  # 180-day: up to 7500 incidents (reduced from 15000)
            }
            
            # Find appropriate limit for the time range
            incident_limit = 5000  # Conservative default fallback
            for range_days in sorted(incident_limits_by_range.keys()):
                if days_back <= range_days:
                    incident_limit = incident_limits_by_range[range_days]
                    break
            
            logger.info(f"🔍 DATA VOLUME CONTROL: Using incident limit of {incident_limit} for {days_back}-day analysis")
            logger.info(f"🔍 INCIDENT FETCH: Starting incident collection for {days_back}-day analysis (limit: {incident_limit})")
            incidents_task = self.get_incidents(days_back=days_back, limit=incident_limit)
            
            # Collect users (required)
            users = await users_task
            users_duration = (datetime.now() - users_start).total_seconds()
            logger.info(f"🔍 USER FETCH: Completed in {users_duration:.2f}s - Retrieved {len(users)} users")
            
            # Try to collect incidents but don't fail if permission denied
            incidents = []
            try:
                incidents = await incidents_task
                incidents_duration = (datetime.now() - incidents_start).total_seconds()
                logger.info(f"🔍 INCIDENT FETCH: Completed in {incidents_duration:.2f}s - Retrieved {len(incidents)} incidents")
                
                # Log incident collection performance metrics
                incidents_per_second = len(incidents) / incidents_duration if incidents_duration > 0 else 0
                logger.info(f"🔍 INCIDENT PERFORMANCE: {incidents_per_second:.1f} incidents/second for {days_back}-day analysis")
                
                # Calculate incidents per day ratio
                incidents_per_day = len(incidents) / days_back if days_back > 0 else 0
                logger.info(f"🔍 INCIDENT DENSITY: {incidents_per_day:.1f} incidents/day for {days_back}-day analysis")
                
            except Exception as e:
                incidents_duration = (datetime.now() - incidents_start).total_seconds()
                logger.error(f"🔍 INCIDENT FETCH: FAILED after {incidents_duration:.2f}s for {days_back}-day analysis: {e}")
                logger.warning(f"Could not fetch incidents: {e}. Proceeding with user data only.")
            
            # Validate data
            if not users:
                raise Exception("No users found - check API permissions")
            
            # Calculate total collection time
            total_duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"🔍 TOTAL PERFORMANCE: {days_back}-day analysis data collection completed in {total_duration:.2f}s")
            
            # Log performance comparison baseline
            if days_back == 7:
                logger.info(f"🔍 BASELINE: 7-day analysis completed - this is the baseline for comparison")
            elif days_back == 30:
                logger.info(f"🔍 COMPARISON: 30-day analysis completed - compare performance to 7-day baseline")
            
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
                    "performance_metrics": {
                        "total_collection_time_seconds": total_duration,
                        "users_collection_time_seconds": users_duration,
                        "incidents_collection_time_seconds": incidents_duration if 'incidents_duration' in locals() else 0,
                        "incidents_per_second": incidents_per_second if 'incidents_per_second' in locals() else 0,
                        "incidents_per_day": incidents_per_day if 'incidents_per_day' in locals() else 0
                    }
                }
            }
            
            logger.info(f"🔍 FINAL RESULT: {days_back}-day analysis data collection completed: {len(users)} users, {len(incidents)} incidents")
            return processed_data
            
        except Exception as e:
            total_duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"🔍 DATA COLLECTION FAILED: {days_back}-day analysis failed after {total_duration:.2f}s: {e}")
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