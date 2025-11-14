"""
Unified Burnout Analyzer - Single analyzer with all features (AI, GitHub, Slack, daily trends).
Replacement for both SimpleBurnoutAnalyzer and BurnoutAnalyzerService.
"""
import json
import logging
import math
import os
import random
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict

from ..core.rootly_client import RootlyAPIClient
from ..core.pagerduty_client import PagerDutyAPIClient
from ..core.ocb_config import calculate_composite_ocb_score, calculate_personal_burnout, calculate_work_related_burnout, generate_ocb_score_reasoning
from .ai_burnout_analyzer import get_ai_burnout_analyzer
from .github_correlation_service import GitHubCorrelationService

import pytz
from collections import defaultdict

from datetime import datetime

# Import mock data loader for testing
MOCK_DATA_AVAILABLE = False
MockDataLoader = None

try:
    # Add tests directory to path for import
    import sys
    from pathlib import Path
    tests_path = Path(__file__).parent.parent.parent / "tests"
    if tests_path.exists() and str(tests_path) not in sys.path:
        sys.path.insert(0, str(tests_path))

    from mock_data.loader import MockDataLoader
    MOCK_DATA_AVAILABLE = True
except ImportError as e:
    pass  # Mock data not available, will log later if needed

logger = logging.getLogger(__name__)


# === BUSINESS HOURS CONSTANTS ===
# Standardized definitions for after-hours and late-night detection
BUSINESS_HOURS_START = 9   # 9 AM - standard knowledge worker start time
BUSINESS_HOURS_END = 17    # 5 PM - standard knowledge worker end time
LATE_NIGHT_START = 22      # 10 PM - when sleep preparation should begin
LATE_NIGHT_END = 6         # 6 AM - early morning threshold


class UnifiedBurnoutAnalyzer:
    """
    Unified burnout analyzer with all features:
    - Basic incident analysis (like SimpleBurnoutAnalyzer)
    - AI-powered insights (optional)
    - GitHub integration (optional) 
    - Slack integration (optional)
    - Daily trends generation
    """
    
    def __init__(
        self,
        api_token: str,
        platform: str = "rootly",
        enable_ai: bool = False,
        github_token: Optional[str] = None,
        slack_token: Optional[str] = None,
        organization_name: Optional[str] = None
    ):
        # Check for mock data mode from environment
        self.use_mock_data = os.getenv('USE_MOCK_DATA', 'false').lower() == 'true'
        self.mock_scenario = os.getenv('MOCK_SCENARIO', 'healthy_team')

        # Initialize mock data loader if available and enabled
        self.mock_loader = None
        if self.use_mock_data:
            if MOCK_DATA_AVAILABLE:
                self.mock_loader = MockDataLoader()
                logger.info(f"🎭 MOCK MODE ENABLED: Using scenario '{self.mock_scenario}'")
            else:
                logger.error("Mock data requested but MockDataLoader not available!")
                raise ImportError("Mock data loader not found. Cannot use USE_MOCK_DATA=true")

        # Use the appropriate client based on platform (unless mock mode)
        if not self.use_mock_data:
            if platform == "pagerduty":
                self.client = PagerDutyAPIClient(api_token)
            else:
                self.client = RootlyAPIClient(api_token)
        else:
            self.client = None  # No API client needed in mock mode
            logger.info("🎭 MOCK MODE: Skipping API client initialization")

        self.platform = platform

        # Feature flags for optional integrations
        self.enable_ai = enable_ai
        self.github_token = github_token
        self.slack_token = slack_token

        # Using Copenhagen Burnout Inventory (OCB) methodology
        logger.info("Unified analyzer using Copenhagen Burnout Inventory methodology")
        self.organization_name = organization_name

        # Determine which features are enabled
        if self.use_mock_data:
            # In mock mode, auto-enable GitHub and Slack since mock data includes them
            logger.info("🎭 MOCK MODE: Auto-enabling GitHub and Slack features for mock data")
            self.features = {
                'ai': enable_ai,
                'github': True,  # Always enable for mock data
                'slack': True,   # Always enable for mock data
                'mock': self.use_mock_data
            }
            # Set dummy tokens if not provided (mock data doesn't need real tokens)
            if not self.github_token:
                self.github_token = "mock"
            if not self.slack_token:
                self.slack_token = "mock"
        else:
            self.features = {
                'ai': enable_ai,
                'github': github_token is not None,
                'slack': slack_token is not None,
                'mock': self.use_mock_data
            }

        # Keeping track of user timezones
        self.user_tz_by_id = {}

        logger.info(f"UnifiedBurnoutAnalyzer initialized - Platform: {platform}, Features: {self.features}")
        
        # Burnout scoring thresholds
        self.thresholds = {
            "incidents_per_week": {
                "low": 3,
                "medium": 6,
                "high": 10
            },
            "after_hours_percentage": {
                "low": 0.1,    # 10%
                "medium": 0.25, # 25%
                "high": 0.4     # 40%
            },
            "weekend_percentage": {
                "low": 0.05,    # 5%
                "medium": 0.15, # 15%
                "high": 0.25    # 25%
            },
            "avg_response_time_minutes": {
                "low": 15,
                "medium": 30,
                "high": 60
            },
            "severity_weight": {
                "critical": 3.0,
                "high": 2.0,
                "medium": 1.5,
                "low": 1.0
            }
        }



    async def analyze_burnout(
        self, 
        time_range_days: int = 30,
        include_weekends: bool = True,
        user_id: Optional[int] = None,
        analysis_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Analyze burnout for the team based on incident data.
        
        Returns structured analysis results with:
        - Overall team health score
        - Individual member burnout scores
        - Burnout factors
        """
        analysis_start_time = datetime.now()

        # Check if using mock data (define at function scope)
        use_mock_data = os.getenv("USE_MOCK_DATA", "false").lower() == "true"

        logger.info(f"🔍 BURNOUT ANALYSIS START: Beginning {time_range_days}-day burnout analysis at {analysis_start_time.isoformat()}")

        # IMMEDIATE DEBUG - This should show up in Railway logs RIGHT AWAY
        print(f"🚨 RAILWAY DEBUG: Analysis starting at {analysis_start_time}")
        print(f"🚨 RAILWAY DEBUG: Platform = {self.platform}")
        print(f"🚨 RAILWAY DEBUG: NEW SCORING ALGORITHM ACTIVE")
        print(f"🚨 RAILWAY DEBUG: Features enabled = {self.features}")
        logger.error(f"🚨 RAILWAY FORCE LOG: NEW SCORING ALGORITHM DEPLOYED - {analysis_start_time}")
        logger.error(f"🚨 RAILWAY FORCE LOG: Features = {self.features}")

        try:
            # Fetch data from Rootly/PagerDuty OR load mock data
            data_fetch_start = datetime.now()

            if self.use_mock_data:
                # Load mock data instead of API call
                logger.info(f"🎭 MOCK MODE: Loading scenario '{self.mock_scenario}' instead of API call")
                data = self._load_mock_data()
            else:
                # Real API call
                logger.info(f"🔍 BURNOUT ANALYSIS: Step 1 - Fetching data for {time_range_days}-day analysis")
                data = await self._fetch_analysis_data(time_range_days)

            data_fetch_duration = (datetime.now() - data_fetch_start).total_seconds()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 1 completed in {data_fetch_duration:.2f}s - Data type: {type(data)}, is_none: {data is None}")
            
            # Check if data was successfully fetched (data should never be None due to fallbacks)
            if data is None:
                logger.error("🔍 BURNOUT ANALYSIS: CRITICAL ERROR - Data is None after _fetch_analysis_data")
                raise Exception("Failed to fetch data from Rootly API - no data returned")
            
            # Extract users and incidents (with additional safety checks)
            extraction_start = datetime.now()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 2 - Extracting users and incidents from {time_range_days}-day data")
            users = data.get("users", []) if data else []

            # create map with user time zones
            self.user_tz_by_id = self._build_user_tz_map(users)
            # print(self.user_tz_by_id)

            # optional: calculate 
            if self.user_tz_by_id:
                sample = list(self.user_tz_by_id.items())[:3]
                print(f"🕒 TZ MAP sample: {sample}")


            incidents = data.get("incidents", []) if data else []
            metadata = data.get("collection_metadata", {}) if data else {}
            
            # COMPREHENSIVE DATA VALIDATION AND ANALYSIS
            logger.info(f"🔍 UNIFIED ANALYZER: DATA VALIDATION for {self.platform.upper()}")
            logger.info(f"   - Platform: {self.platform}")
            logger.info(f"   - Raw data keys: {list(data.keys()) if data else 'None'}")
            logger.info(f"   - Users extracted: {len(users)}")
            logger.info(f"   - Incidents extracted: {len(incidents)}")
            logger.info(f"   - Metadata keys: {list(metadata.keys()) if metadata else 'None'}")
            
            # Validate user data structure
            if users:
                sample_user = users[0]
                logger.info(f"🔍 UNIFIED ANALYZER: Sample user structure:")
                logger.info(f"   - Keys: {list(sample_user.keys()) if isinstance(sample_user, dict) else 'Not a dict'}")
                logger.info(f"   - Sample: ID={sample_user.get('id')}, Name={sample_user.get('name')}, Email={sample_user.get('email')}")
            
            # Validate incident data structure and assignments
            if incidents:
                logger.info(f"🔍 UNIFIED ANALYZER: Incident assignment analysis:")
                incidents_with_assignments = 0
                sample_incident = incidents[0]
                
                logger.info(f"   - Sample incident structure:")
                logger.info(f"     - Keys: {list(sample_incident.keys()) if isinstance(sample_incident, dict) else 'Not a dict'}")
                logger.info(f"     - ID: {sample_incident.get('id')}")
                logger.info(f"     - Title: {sample_incident.get('title', 'No title')[:50]}")
                logger.info(f"     - Assigned_to: {sample_incident.get('assigned_to')}")
                
                # Count incidents with assignments across all incidents (use platform-specific logic)
                for i, incident in enumerate(incidents[:10]):  # Check first 10
                    user_id = None
                    user_name = None
                    
                    if self.platform == "pagerduty":
                        # PagerDuty format - Use enhanced assignment extraction results
                        assigned_to = incident.get("assigned_to", {})
                        if assigned_to and isinstance(assigned_to, dict):
                            user_id = assigned_to.get("id")
                            user_name = assigned_to.get("name")
                    else:  # Rootly
                        # Rootly format - same as team analysis logic
                        attrs = incident.get("attributes", {})
                        if attrs:
                            user_info = attrs.get("user", {})
                            if isinstance(user_info, dict) and "data" in user_info:
                                user_data = user_info.get("data", {})
                                user_id = user_data.get("id")
                                user_name = user_data.get("name") or user_data.get("full_name")
                    
                    if user_id:
                        incidents_with_assignments += 1
                        if i < 3:  # Log first 3 assignments
                            logger.info(f"     - Incident #{i+1} assigned to: {user_name} (ID: {user_id})")
                
                logger.info(f"   - Incidents with assignments: {incidents_with_assignments}/{min(len(incidents), 10)} (first 10 checked)")
                
                if incidents_with_assignments == 0:
                    logger.warning(f"🔍 UNIFIED ANALYZER: ❌ CRITICAL ISSUE - NO INCIDENTS HAVE ASSIGNMENTS!")
                    logger.warning(f"   - This will result in ALL users showing 0 incidents")
                    logger.warning(f"   - Root cause: Incident normalization or API data structure issue")
            
            # Cross-reference user IDs between users and incidents
            if users and incidents:
                user_ids_from_users = {str(user.get("id")) for user in users if user.get("id")}
                incident_user_ids = set()
                
                for incident in incidents:
                    user_id = None
                    
                    if self.platform == "pagerduty":
                        # PagerDuty format - Use enhanced assignment extraction results
                        assigned_to = incident.get("assigned_to", {})
                        if assigned_to and isinstance(assigned_to, dict):
                            user_id = assigned_to.get("id")
                    else:  # Rootly
                        # Rootly format - same as team analysis logic
                        attrs = incident.get("attributes", {})
                        if attrs:
                            user_info = attrs.get("user", {})
                            if isinstance(user_info, dict) and "data" in user_info:
                                user_data = user_info.get("data", {})
                                user_id = user_data.get("id")
                    
                    if user_id:
                        incident_user_ids.add(str(user_id))
                
                matching_user_ids = user_ids_from_users.intersection(incident_user_ids)
                
                logger.info(f"🔍 UNIFIED ANALYZER: User ID Cross-Reference:")
                logger.info(f"   - User IDs from users list: {len(user_ids_from_users)} ({list(user_ids_from_users)[:5]})")
                logger.info(f"   - User IDs from incident assignments: {len(incident_user_ids)} ({list(incident_user_ids)[:5]})")
                logger.info(f"   - Matching user IDs: {len(matching_user_ids)} ({list(matching_user_ids)[:5]})")
                
                if len(matching_user_ids) == 0:
                    logger.warning(f"🔍 UNIFIED ANALYZER: ❌ CRITICAL ISSUE - NO MATCHING USER IDs!")
                    logger.warning(f"   - Users and incidents have completely different ID spaces")
                    logger.warning(f"   - This will cause ALL users to show 0 incidents")
            
            # FAIL FAST: Never show fake data - fail the analysis when API permissions are missing
            if len(incidents) == 0 and len(users) > 0:
                expected_incidents = metadata.get("total_incidents", 0)
                if expected_incidents > 0:
                    logger.error(f"🚨 API PERMISSION ERROR: Expected {expected_incidents} incidents but got 0. API token lacks incidents:read permission.")
                    error_msg = (
                        f"API Permission Error: Cannot access incident data. "
                        f"Your {self.platform.title()} API token lacks 'incidents:read' permission. "
                        f"Expected {expected_incidents} incidents but received 0. "
                        f"Please update your API token with proper permissions."
                    )
                    return self._create_error_response(error_msg)
                elif len(users) > 0:
                    logger.warning(f"🔍 NO INCIDENTS: No incidents found in the last {time_range_days} days - this may be normal.")
                    # Continue with analysis - this might be a quiet period
            
            extraction_duration = (datetime.now() - extraction_start).total_seconds()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 2 completed in {extraction_duration:.3f}s - {len(users)} users, {len(incidents)} incidents")
            
            # Step 2.5: Filter to only on-call users (NEW FEATURE)
            oncall_filter_start = datetime.now()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 2.5 - Filtering to on-call users only for {time_range_days}-day period")

            # Skip on-call filtering when using mock data (no API client available)
            if self.use_mock_data:
                logger.info(f"🎭 MOCK MODE: Skipping on-call filtering (analyzing all mock users)")
                oncall_filter_duration = (datetime.now() - oncall_filter_start).total_seconds()
                logger.info(f"🔍 BURNOUT ANALYSIS: Step 2.5 completed in {oncall_filter_duration:.3f}s - Analyzing all {len(users)} users (mock mode)")
            else:
                try:
                    # Get on-call schedule data for the analysis period
                    start_date = datetime.now() - timedelta(days=time_range_days)
                    end_date = datetime.now()
                    logger.info(f"🗓️ ON_CALL_FILTERING: Attempting to fetch on-call shifts from {start_date.isoformat()} to {end_date.isoformat()}")
                    logger.info(f"🗓️ ON_CALL_FILTERING: Client type: {type(self.client).__name__}, Platform: {self.platform}")

                    on_call_shifts = await self.client.get_on_call_shifts(start_date, end_date)
                    logger.info(f"🗓️ ON_CALL_FILTERING: Retrieved {len(on_call_shifts)} on-call shifts")

                    on_call_user_emails = await self.client.extract_on_call_users_from_shifts(on_call_shifts)
                    logger.info(f"🗓️ ON_CALL_FILTERING: Extracted {len(on_call_user_emails)} unique on-call user emails")
                    logger.info(f"🗓️ ON_CALL_FILTERING: On-call emails: {list(on_call_user_emails)[:5]}{'...' if len(on_call_user_emails) > 5 else ''}")

                    logger.info(f"🗓️ ON_CALL_FILTERING: Found {len(on_call_user_emails)} users who were on-call during the {time_range_days}-day period")
                    logger.info(f"🗓️ ON_CALL_FILTERING: Total team members: {len(users)}, On-call members: {len(on_call_user_emails)}")

                    if on_call_user_emails:
                        # Filter users to only those who were on-call during the period
                        original_user_count = len(users)
                        filtered_users = []

                        # Debug: Log all user emails for comparison
                        all_user_emails = []
                        for user in users:
                            user_email = self._get_user_email_from_user(user)
                            all_user_emails.append(user_email)
                            if user_email and user_email.lower() in on_call_user_emails:
                                filtered_users.append(user)

                        logger.info(f"🗓️ ON_CALL_FILTERING: All user emails in team: {all_user_emails[:5]}{'...' if len(all_user_emails) > 5 else ''}")

                        users = filtered_users
                        logger.info(f"🗓️ ON_CALL_FILTERING: Filtered from {original_user_count} total users to {len(users)} on-call users")

                        if len(users) == 0:
                            logger.error(f"🗓️ ON_CALL_FILTERING: CRITICAL - No matching users found between team emails and on-call emails!")
                            logger.error(f"🗓️ ON_CALL_FILTERING: Team emails: {all_user_emails}")
                            logger.error(f"🗓️ ON_CALL_FILTERING: On-call emails: {list(on_call_user_emails)}")
                            logger.error(f"🗓️ ON_CALL_FILTERING: Falling back to all users to prevent empty analysis")
                            users = []  # Reset to original users list (will be handled below)
                        else:
                            # Log the on-call users for verification
                            oncall_names = [self._get_user_name_from_user(user) for user in users]
                            logger.info(f"🗓️ ON_CALL_FILTERING: On-call users being analyzed: {', '.join(oncall_names[:10])}{'...' if len(oncall_names) > 10 else ''}")
                    else:
                        logger.warning(f"🗓️ ON_CALL_FILTERING: No on-call shifts found for the period, analyzing all users as fallback")

                except Exception as e:
                    logger.error(f"🗓️ ON_CALL_FILTERING: Error fetching on-call data: {e}")
                    logger.error(f"🗓️ ON_CALL_FILTERING: Exception type: {type(e).__name__}")
                    logger.error(f"🗓️ ON_CALL_FILTERING: Exception details: {str(e)}")
                    import traceback
                    logger.error(f"🗓️ ON_CALL_FILTERING: Stack trace: {traceback.format_exc()}")
                    logger.warning(f"🗓️ ON_CALL_FILTERING: Falling back to analyzing all users (original behavior)")
            
            # If filtering failed or resulted in no users, use all users as fallback
            if len(users) == 0:
                logger.warning(f"🗓️ ON_CALL_FILTERING: Using all users as fallback due to empty filtered list")
                users = data.get("users", [])
            
            oncall_filter_duration = (datetime.now() - oncall_filter_start).total_seconds()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 2.5 completed in {oncall_filter_duration:.3f}s - Now analyzing {len(users)} on-call users")
            
            # Log potential issues based on data patterns
            if len(users) == 0:
                logger.error(f"🔍 BURNOUT ANALYSIS: CRITICAL - No users found for {time_range_days}-day analysis")
            elif len(incidents) == 0:
                logger.warning(f"🔍 BURNOUT ANALYSIS: WARNING - No incidents found for {time_range_days}-day analysis (users: {len(users)})")
            elif time_range_days >= 30 and len(incidents) < len(users):
                logger.warning(f"🔍 BURNOUT ANALYSIS: WARNING - {time_range_days}-day analysis has fewer incidents ({len(incidents)}) than users ({len(users)}) - possible data fetch issue")
            
            # Log detailed data breakdown for AI insights
            if incidents:
                incident_statuses = [i.get('status', 'unknown') for i in incidents]
                status_breakdown = {status: incident_statuses.count(status) for status in set(incident_statuses)}
                logger.info(f"AI Insights Data - Incident status breakdown: {status_breakdown}")
            
            # Collect GitHub/Slack data if enabled
            github_data = {}
            slack_data = {}

            # Load mock GitHub and Slack data if mock mode is enabled
            mock_scenario = os.getenv("MOCK_SCENARIO", "high_burnout")
            if use_mock_data and MOCK_DATA_AVAILABLE:
                logger.info("="*80)
                logger.info("🎭 LOADING MOCK GITHUB & SLACK DATA")
                logger.info(f"🎭 Scenario: {mock_scenario}")
                logger.info("="*80)
                try:
                    loader = MockDataLoader()
                    if self.features['github']:
                        github_data = loader.get_github_data(mock_scenario)
                        logger.info(f"🎭 GitHub mock data loaded: {len(github_data)} users")
                        logger.info(f"   - GitHub users: {list(github_data.keys())}")
                    if self.features['slack']:
                        slack_data = loader.get_slack_data(mock_scenario)
                        logger.info(f"🎭 Slack mock data loaded: {len(slack_data)} users")
                        logger.info(f"   - Slack users: {list(slack_data.keys())}")
                    logger.info("="*80)
                except Exception as mock_error:
                    logger.error(f"🎭 MOCK DATA ERROR: Failed to load GitHub/Slack: {mock_error}")
                    logger.error("="*80)
            elif (self.features['github'] or self.features['slack']) and not use_mock_data:
                from .enhanced_github_collector import collect_team_github_data_with_mapping
                from .enhanced_slack_collector import collect_team_slack_data_with_mapping
                
                # Get team member emails and names from JSONAPI format
                team_emails = []
                team_names = []
                email_to_name = {}  # Map emails to full names for better GitHub matching
                
                # COMPREHENSIVE EMAIL EXTRACTION WITH PLATFORM-SPECIFIC VALIDATION
                logger.info(f"🔍 EMAIL EXTRACTION: Processing {len(users)} users for {self.platform.upper()}")
                
                for i, user in enumerate(users):
                    if not isinstance(user, dict):
                        logger.warning(f"🔍 EMAIL EXTRACTION: User #{i+1} is not a dict: {type(user)}")
                        continue
                    
                    email = None
                    name = None
                    
                    # Log first few users for structure analysis
                    if i < 3:
                        logger.info(f"🔍 EMAIL EXTRACTION: User #{i+1} structure:")
                        logger.info(f"   - Keys: {list(user.keys())}")
                        logger.info(f"   - Has 'attributes': {'attributes' in user}")
                        logger.info(f"   - Direct email: {user.get('email')}")
                        logger.info(f"   - Direct name: {user.get('name')}")
                    
                    if "attributes" in user:
                        # JSONAPI format (Rootly style)
                        attrs = user["attributes"]
                        email = attrs.get("email")
                        name = attrs.get("full_name") or attrs.get("name")
                        if i < 3:
                            logger.info(f"   - JSONAPI format: email={email}, name={name}")
                    else:
                        # Direct format (PagerDuty normalized format)
                        email = user.get("email")
                        name = user.get("name") or user.get("full_name")
                        if i < 3:
                            logger.info(f"   - Direct format: email={email}, name={name}")
                    
                    if email:
                        team_emails.append(email)
                        if name:
                            email_to_name[email] = name
                    if name:
                        team_names.append(name)
                
                # COMPREHENSIVE EMAIL EXTRACTION ANALYSIS
                logger.info(f"🔍 EMAIL EXTRACTION: RESULTS for {self.platform.upper()}:")
                logger.info(f"   - Total users processed: {len(users)}")
                logger.info(f"   - Emails extracted: {len(team_emails)}")
                logger.info(f"   - Names extracted: {len(team_names)}")
                logger.info(f"   - Email-to-name mappings: {len(email_to_name)}")
                
                if team_emails:
                    logger.info(f"   - Sample emails: {team_emails[:5]}")
                else:
                    logger.warning(f"🔍 EMAIL EXTRACTION: ❌ NO EMAILS EXTRACTED!")
                    logger.warning(f"   - This will prevent GitHub and Slack data collection")
                    logger.warning(f"   - Root cause: User data structure mismatch for {self.platform}")
                
                if len(team_emails) < len(users) * 0.5:  # Less than 50% success rate
                    logger.warning(f"🔍 EMAIL EXTRACTION: ⚠️ LOW EXTRACTION RATE!")
                    logger.warning(f"   - Only {len(team_emails)}/{len(users)} users have emails ({len(team_emails)/len(users)*100:.1f}%)")
                    logger.warning(f"   - Check if {self.platform} data structure matches expectation")
                
                if self.features['github']:
                    logger.info(f"🔍 UNIFIED ANALYZER: Collecting GitHub data for {len(team_emails)} team members")
                    logger.info(f"Team emails: {team_emails[:5]}...")  # Log first 5 emails
                    try:
                        logger.info(f"GitHub config - token: {'present' if self.github_token else 'missing'}")
                        
                        github_data = await collect_team_github_data_with_mapping(
                            team_emails, time_range_days, self.github_token,
                            user_id=user_id, analysis_id=analysis_id, source_platform=self.platform,
                            email_to_name=email_to_name
                        )
                        logger.info(f"🔍 UNIFIED ANALYZER: Collected GitHub data for {len(github_data)} users")
                        logger.info(f"GitHub data keys: {list(github_data.keys())[:5]}")  # Log first 5 keys

                        # # Write raw GitHub data to file
                        # try:
                        #     with open('github_raw.txt', 'w', encoding='utf-8') as f:
                        #         f.write(json.dumps(github_data, indent=2, default=str))
                        #     logger.info(f"✅ Written raw GitHub data to github_raw.txt")
                        # except Exception as e:
                        #     logger.error(f"Failed to write GitHub raw data to file: {e}")
                    except Exception as e:
                        logger.error(f"GitHub data collection failed: {e}")
                else:
                    logger.info(f"🔍 UNIFIED ANALYZER: GitHub integration disabled - skipping")
                
                if self.features['slack']:
                    logger.info(f"Collecting Slack data for {len(team_names)} team members using names")
                    logger.info(f"Team names: {team_names[:5]}...")  # Log first 5 names
                    try:
                        logger.info(f"Slack config - token: {'present' if self.slack_token else 'missing'}")
                        
                        # Use names for Slack correlation instead of emails
                        slack_data = await collect_team_slack_data_with_mapping(
                            team_names, time_range_days, self.slack_token, use_names=True,
                            user_id=user_id, analysis_id=analysis_id, source_platform=self.platform
                        )
                        logger.info(f"Collected Slack data for {len(slack_data)} users")

                        # # Write raw Slack data to file
                        # try:
                        #     with open('slack_raw.txt', 'w', encoding='utf-8') as f:
                        #         f.write(json.dumps(slack_data, indent=2, default=str))
                        #     logger.info(f"✅ Written raw Slack data to slack_raw.txt")
                        # except Exception as e:
                        #     logger.error(f"Failed to write Slack raw data to file: {e}")
                    except Exception as e:
                        logger.error(f"Slack data collection failed: {e}")
            
            # Analyze team burnout
            try:
                team_analysis_start = datetime.now()
                logger.info(f"🔍 BURNOUT ANALYSIS: Step 3 - Analyzing team data for {time_range_days}-day analysis")
                logger.info(f"🔍 BURNOUT ANALYSIS: Team analysis inputs - {len(users)} users, {len(incidents)} incidents")
                team_analysis = self._analyze_team_data(
                    users, 
                    incidents, 
                    metadata,
                    include_weekends,
                    github_data,
                    slack_data
                )
                team_analysis_duration = (datetime.now() - team_analysis_start).total_seconds()
                logger.info(f"🔍 BURNOUT ANALYSIS: Step 3 completed in {team_analysis_duration:.2f}s")
                
                # Log team analysis results
                members_analyzed = len(team_analysis.get("members", [])) if team_analysis else 0
                logger.info(f"🔍 BURNOUT ANALYSIS: Team analysis generated results for {members_analyzed} members")
                
            except Exception as e:
                team_analysis_duration = (datetime.now() - team_analysis_start).total_seconds() if 'team_analysis_start' in locals() else 0
                logger.error(f"🔍 BURNOUT ANALYSIS: Step 3 FAILED after {team_analysis_duration:.2f}s: {e}")
                logger.error(f"🔍 BURNOUT ANALYSIS: Users data - type: {type(users)}, length: {len(users) if users else 'N/A'}")
                logger.error(f"🔍 BURNOUT ANALYSIS: Incidents data - type: {type(incidents)}, length: {len(incidents) if incidents else 'N/A'}")
                logger.error(f"🔍 BURNOUT ANALYSIS: Metadata type: {type(metadata)}")
                raise
            
            # Placeholder for team_health - will be calculated after GitHub correlation
            team_health = None
            
            # Create data sources structure
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 6 - Creating data source structure")
            data_sources = {
                "incident_data": True,
                "github_data": self.features['github'],
                "slack_data": self.features['slack']
            }
            
            # Create GitHub insights if enabled
            github_insights = None
            if self.features['github']:
                logger.info(f"🔍 UNIFIED ANALYZER: Calculating GitHub insights")
                github_insights = self._calculate_github_insights(github_data)
            
            # Create Slack insights if enabled  
            slack_insights = None
            if self.features['slack']:
                logger.info(f"🔍 UNIFIED ANALYZER: Calculating Slack insights")
                slack_insights = self._calculate_slack_insights(slack_data)

            # GITHUB CORRELATION: Match GitHub contributors to team members
            if self.features['github'] and github_insights:
                logger.info(f"🔗 GITHUB CORRELATION: Correlating GitHub data with team members")
                # Get current user ID (assuming it's passed in somehow - for now use 1 as default)
                current_user_id = getattr(self, 'current_user_id', 1)  # Default to user 1 (Spencer)
                correlation_service = GitHubCorrelationService(current_user_id=current_user_id)
                
                # Get original team members before correlation
                original_members = team_analysis["members"].copy()
                
                # Correlate GitHub data with team members
                correlated_members = correlation_service.correlate_github_data(
                    team_members=original_members,
                    github_insights=github_insights
                )
                
                # Update team_analysis with correlated data
                team_analysis["members"] = correlated_members
                
                # Get correlation statistics
                correlation_stats = correlation_service.get_correlation_stats(
                    team_members=correlated_members,
                    github_insights=github_insights
                )
                
                logger.info(f"🔗 GITHUB CORRELATION: Correlated {correlation_stats['team_members_with_github_data']}/{correlation_stats['total_team_members']} members ({correlation_stats['correlation_rate']:.1f}%)")
                logger.info(f"🔗 GITHUB CORRELATION: Total commits correlated: {correlation_stats['total_commits_correlated']}")
                
                # GITHUB BURNOUT ADJUSTMENT: Recalculate burnout scores using GitHub data
                logger.info(f"🔥 GITHUB BURNOUT: Recalculating scores with GitHub activity data")
                team_analysis["members"] = self._recalculate_burnout_with_github(team_analysis["members"], metadata)
            
            # Calculate overall team health AFTER GitHub burnout adjustment
            health_calc_start = datetime.now()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 4 - Calculating team health for {time_range_days}-day analysis")
            team_health = self._calculate_team_health(team_analysis["members"])
            health_calc_duration = (datetime.now() - health_calc_start).total_seconds()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 4 completed in {health_calc_duration:.3f}s - Health score: {team_health.get('overall_score', 'N/A')}")
            
            # If GitHub features are disabled, calculate team health here
            if not self.features['github'] or not github_insights:
                health_calc_start = datetime.now()
                logger.info(f"🔍 BURNOUT ANALYSIS: Step 4 - Calculating team health for {time_range_days}-day analysis")
                team_health = self._calculate_team_health(team_analysis["members"])
                health_calc_duration = (datetime.now() - health_calc_start).total_seconds()
                logger.info(f"🔍 BURNOUT ANALYSIS: Step 4 completed in {health_calc_duration:.3f}s - Health score: {team_health.get('overall_score', 'N/A')}")
            
            # Generate insights and recommendations
            insights_start = datetime.now()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 5 - Generating insights and recommendations")
            insights = self._generate_insights(team_analysis, team_health)
            insights_duration = (datetime.now() - insights_start).total_seconds()
            logger.info(f"🔍 BURNOUT ANALYSIS: Step 5 completed in {insights_duration:.3f}s - Generated {len(insights)} insights")

            # Calculate period summary for consistent UI display
            team_overall_score = team_health.get("overall_score", 0.0)  # This is already health scale 0-10
            period_average_score = team_overall_score * 10  # Convert to percentage scale 0-100
            
            logger.info(f"Period summary calculation: team_overall_score={team_overall_score}, period_average_score={period_average_score}")
            logger.info(f"Team health keys: {list(team_health.keys()) if team_health else 'None'}")
            
            # Generate daily trends from incident data
            daily_trends = self._generate_daily_trends(incidents, team_analysis["members"], metadata, team_health)
            
            # Get individual daily data with debug logging
            individual_daily_data = getattr(self, 'individual_daily_data', {})
            logger.info(f"🔍 INDIVIDUAL_DAILY_STORAGE: Storing individual_daily_data for {len(individual_daily_data)} users")
            if individual_daily_data:
                sample_user = list(individual_daily_data.keys())[0]
                sample_data = individual_daily_data[sample_user]
                days_with_data = sum(1 for day_data in sample_data.values() if day_data.get('has_data', False))
                logger.info(f"🔍 INDIVIDUAL_DAILY_STORAGE: Sample user {sample_user} has {days_with_data} days with incident data out of {len(sample_data)} total days")
                
                # Additional PagerDuty-specific logging
                if self.platform == "pagerduty":
                    users_with_data = sum(1 for user_data in individual_daily_data.values() 
                                        if any(day.get('has_data', False) for day in user_data.values()))
                    logger.info(f"🎯 PAGERDUTY DAILY HEALTH: {users_with_data}/{len(individual_daily_data)} users have daily incident data")
                    if users_with_data > 0:
                        logger.info(f"🎯 PAGERDUTY DAILY HEALTH: Individual daily health timeline should work for PagerDuty users!")
                    else:
                        logger.warning(f"🚨 PAGERDUTY DAILY HEALTH: No users have daily incident data - assignment extraction may have failed")
            else:
                logger.error(f"🚨 INDIVIDUAL_DAILY_STORAGE: individual_daily_data is EMPTY! This will cause 'No daily health data available' errors")

            # Store raw incident data for individual daily health reconstruction
            logger.info(f"🔍 RAW_INCIDENT_STORAGE: Storing {len(incidents)} raw incidents in analysis results")
            if incidents:
                sample_incident = incidents[0]
                logger.info(f"🔍 RAW_INCIDENT_SAMPLE: {sample_incident.get('id', 'no-id')} created at {sample_incident.get('created_at', 'no-timestamp')}")
            
            result = {
                "analysis_timestamp": datetime.now().isoformat(),
                "metadata": {
                    **{k: v for k, v in metadata.items() if not (k == "organization_name" and v is None)},
                    "organization_name": self.organization_name if self.organization_name else (metadata.get("organization_name") or "Organization"),
                    "include_weekends": include_weekends,
                    "include_github": self.features['github'],
                    "include_slack": self.features['slack'],
                    "enable_ai": self.features['ai']
                },
                "data_sources": data_sources,
                "team_health": team_health,
                "team_analysis": team_analysis,
                "insights": insights,
                "recommendations": self._generate_recommendations(team_health, team_analysis),
                "daily_trends": daily_trends,
                "individual_daily_data": individual_daily_data,
                "raw_incident_data": incidents,  # Store complete incident data for individual daily health reconstruction
                "period_summary": {
                    "average_score": round(period_average_score, 2),
                    "days_analyzed": time_range_days,
                    "total_days_with_data": len([d for d in daily_trends if d.get("incident_count", 0) > 0])
                }
            }
            
            # Add GitHub insights if enabled
            if github_insights:
                result["github_insights"] = github_insights
                
                # Log GitHub indicator details for transparency
                if github_insights.get("high_risk_member_count", 0) > 0:
                    # Count risk level distribution for members with GitHub indicators
                    github_members_by_risk = {"low": 0, "medium": 0, "high": 0}
                    github_members_details = []
                    
                    for member in result.get("team_analysis", {}).get("members", []):
                        github_activity = member.get("github_activity", {})
                        github_indicators = github_activity.get("burnout_indicators", {})
                        if any(github_indicators.values()):
                            risk_level = member.get("risk_level", "low")
                            github_members_by_risk[risk_level] += 1
                            github_members_details.append({
                                "email": member.get("user_email", "unknown"),
                                "risk_level": risk_level,
                                "indicators": [k for k, v in github_indicators.items() if v]
                            })
                    
                    # Add risk distribution to GitHub insights for frontend display
                    github_insights["risk_distribution"] = github_members_by_risk
                    github_insights["members_with_indicators"] = github_members_details
                    
                    logger.info(f"GitHub indicators found in {sum(github_members_by_risk.values())} members")
                    logger.info(f"Risk distribution: {github_members_by_risk}")
                
            # Add Slack insights if enabled  
            if slack_insights:
                result["slack_insights"] = slack_insights
            
            # Enhance with AI analysis if enabled
            ai_start = datetime.now()
            if self.features['ai']:
                logger.info(f"🔍 UNIFIED ANALYZER: Step 7 - AI enhancement for {time_range_days}-day analysis")
                available_integrations = []
                if self.features['github']:
                    available_integrations.append('github')
                if self.features['slack']:
                    available_integrations.append('slack')
                
                result = await self._enhance_with_ai_analysis(result, available_integrations)
                ai_duration = (datetime.now() - ai_start).total_seconds()
                logger.info(f"🔍 UNIFIED ANALYZER: Step 7 completed in {ai_duration:.2f}s - AI enhanced: {result.get('ai_enhanced', False)}")
            else:
                logger.info(f"🔍 UNIFIED ANALYZER: AI enhancement disabled - skipping")
                result["ai_enhanced"] = False
                ai_duration = 0
            
            # Calculate total analysis time and log completion
            total_analysis_duration = (datetime.now() - analysis_start_time).total_seconds()
            logger.info(f"🔍 BURNOUT ANALYSIS COMPLETE: {time_range_days}-day analysis finished in {total_analysis_duration:.2f}s")
            
            # Log performance breakdown
            logger.info(f"🔍 BURNOUT ANALYSIS BREAKDOWN:")
            logger.info(f"  - Data fetch: {data_fetch_duration:.2f}s")
            logger.info(f"  - Team analysis: {team_analysis_duration:.2f}s")
            logger.info(f"  - Health calculation: {health_calc_duration:.3f}s")
            logger.info(f"  - Insights generation: {insights_duration:.3f}s")
            logger.info(f"  - AI enhancement: {ai_duration:.2f}s")
            logger.info(f"  - Total: {total_analysis_duration:.2f}s")
            
            # Log performance warnings for longer analyses
            timeout_threshold = 900  # 15 minutes in seconds
            warning_threshold = timeout_threshold * 0.8  # 12 minutes
            
            if total_analysis_duration > timeout_threshold:
                logger.error(f"🔍 TIMEOUT EXCEEDED: {time_range_days}-day analysis took {total_analysis_duration:.2f}s (>{timeout_threshold}s)")
            elif total_analysis_duration > warning_threshold:
                logger.error(f"🔍 TIMEOUT WARNING: {time_range_days}-day analysis took {total_analysis_duration:.2f}s - approaching {timeout_threshold}s timeout")
            elif time_range_days >= 30 and total_analysis_duration > 600:  # 10 minutes
                logger.warning(f"🔍 PERFORMANCE CONCERN: {time_range_days}-day analysis took {total_analysis_duration:.2f}s (>10min)")
            elif time_range_days >= 30 and total_analysis_duration > 300:  # 5 minutes
                logger.info(f"🔍 PERFORMANCE NOTE: {time_range_days}-day analysis took {total_analysis_duration:.2f}s (>5min)")
            
            # Add timeout risk metadata to results
            result["timeout_metadata"] = {
                "analysis_duration_seconds": total_analysis_duration,
                "timeout_threshold_seconds": timeout_threshold,
                "approaching_timeout": total_analysis_duration > warning_threshold,
                "timeout_risk_level": (
                    "critical" if total_analysis_duration > timeout_threshold else
                    "high" if total_analysis_duration > warning_threshold else
                    "medium" if total_analysis_duration > 300 else
                    "low"
                )
            }
            
            # Log success metrics with null safety
            try:
                team_analysis_data = result.get("team_analysis") if result and isinstance(result, dict) else {}
                members = team_analysis_data.get("members") if team_analysis_data and isinstance(team_analysis_data, dict) else []
                members_count = len(members) if isinstance(members, list) else 0
                incidents_count = len(incidents) if isinstance(incidents, list) else 0
                logger.info(f"🔍 BURNOUT ANALYSIS SUCCESS: Analyzed {members_count} members using {incidents_count} incidents over {time_range_days} days")

                # Enhanced logging for mock data (use_mock_data is defined at function scope)
                if use_mock_data:
                    logger.info("="*80)
                    logger.info("🎭 FINAL MOCK DATA ANALYSIS RESULTS")
                    logger.info(f"🎭 Total members in result: {members_count}")
                    if members_count > 0:
                        logger.info(f"🎭 Member details:")
                        for member in members[:5]:  # Show first 5
                            name = member.get('name', 'Unknown')
                            score = member.get('burnout_score', 'N/A')
                            risk = member.get('risk_level', 'N/A')
                            has_github = 'github_insights' in member
                            has_slack = 'slack_insights' in member
                            logger.info(f"     - {name}: Score={score}, Risk={risk}, GitHub={has_github}, Slack={has_slack}")
                    else:
                        logger.error(f"🎭 ERROR: No members in final result!")
                    logger.info("="*80)
            except Exception as metrics_error:
                logger.warning(f"Error logging success metrics: {metrics_error}")
            
            # Debug: Log final result structure
                
            return result
            
        except Exception as e:
            total_analysis_duration = (datetime.now() - analysis_start_time).total_seconds() if 'analysis_start_time' in locals() else 0
            logger.error(f"🔍 BURNOUT ANALYSIS FAILED: {time_range_days}-day analysis failed after {total_analysis_duration:.2f}s: {e}")
            raise
    
    async def _fetch_analysis_data(self, days_back: int) -> Dict[str, Any]:
        """Fetch all required data from Rootly API."""
        fetch_start_time = datetime.now()
        logger.info(f"🔍 ANALYZER DATA FETCH: Starting data collection for {days_back}-day analysis")
        
        try:
            # Use the existing data collection method
            logger.info(f"🔍 ANALYZER DATA FETCH: Delegating to client.collect_analysis_data for {days_back} days")
            data = await self.client.collect_analysis_data(days_back=days_back)
            
            fetch_duration = (datetime.now() - fetch_start_time).total_seconds()
            logger.info(f"🔍 ANALYZER DATA FETCH: Client returned after {fetch_duration:.2f}s - Type: {type(data)}")
            
            # Ensure we always have a valid data structure
            if data is None:
                logger.warning(f"🔍 ANALYZER DATA FETCH: WARNING - collect_analysis_data returned None for {days_back}-day analysis")
                data = {
                    "users": [],
                    "incidents": [],
                    "collection_metadata": {
                        "timestamp": datetime.now().isoformat(),
                        "days_analyzed": days_back,
                        "total_users": 0,
                        "total_incidents": 0,
                        "error": "Data collection returned None",
                        "date_range": {
                            "start": (datetime.now() - timedelta(days=days_back)).isoformat(),
                            "end": datetime.now().isoformat()
                        }
                    }
                }
            
            # Additional safety check
            if not isinstance(data, dict):
                logger.error(f"🔍 ANALYZER DATA FETCH: ERROR - Data is not a dictionary! Type: {type(data)}")
                data = {
                    "users": [],
                    "incidents": [],
                    "collection_metadata": {
                        "timestamp": datetime.now().isoformat(),
                        "days_analyzed": days_back,
                        "total_users": 0,
                        "total_incidents": 0,
                        "error": f"Data collection returned invalid type: {type(data)}",
                        "date_range": {
                            "start": (datetime.now() - timedelta(days=days_back)).isoformat(),
                            "end": datetime.now().isoformat()
                        }
                    }
                }
            
            # Extract and log key metrics
            users_count = len(data.get('users', [])) if data else 0
            incidents_count = len(data.get('incidents', [])) if data else 0
            metadata = data.get('collection_metadata', {}) if data else {}
            performance_metrics = metadata.get('performance_metrics', {}) if metadata else {}
            
            logger.info(f"🔍 ANALYZER DATA RESULT: {days_back}-day analysis data fetched successfully")
            logger.info(f"🔍 ANALYZER DATA METRICS: {users_count} users, {incidents_count} incidents in {fetch_duration:.2f}s")

            # # Write raw Rootly/PagerDuty data to file
            # try:
            #     filename = f"{self.platform}_raw.txt"
            #     with open(filename, 'w', encoding='utf-8') as f:
            #         f.write(json.dumps(data, indent=2, default=str))
            #     logger.info(f"✅ Written raw {self.platform} data to {filename}")
            # except Exception as e:
            #     logger.error(f"Failed to write {self.platform} raw data to file: {e}")

            # Log performance details if available
            if performance_metrics:
                total_collection_time = performance_metrics.get('total_collection_time_seconds', 0)
                incidents_per_second = performance_metrics.get('incidents_per_second', 0)
                logger.info(f"🔍 ANALYZER PERFORMANCE: Client collection took {total_collection_time:.2f}s, {incidents_per_second:.1f} incidents/sec")
            
            # Log warnings for performance issues
            if days_back >= 30 and fetch_duration > 300:  # 5 minutes
                logger.warning(f"🔍 ANALYZER PERFORMANCE WARNING: {days_back}-day data fetch took {fetch_duration:.2f}s (>5min)")
            elif days_back >= 30 and incidents_count == 0 and users_count > 0:
                logger.warning(f"🔍 ANALYZER DATA WARNING: {days_back}-day analysis got users but no incidents - potential timeout or permission issue")
            
            return data
        except Exception as e:
            fetch_duration = (datetime.now() - fetch_start_time).total_seconds()
            logger.error(f"🔍 ANALYZER DATA FETCH: FAILED after {fetch_duration:.2f}s for {days_back}-day analysis")
            logger.error(f"🔍 ANALYZER ERROR: {str(e)}")
            logger.error(f"🔍 ANALYZER ERROR TYPE: {type(e).__name__}")
            logger.error(f"🔍 ANALYZER ERROR DETAILS: {repr(e)}")
            
            # Return fallback data instead of raising
            return {
                "users": [],
                "incidents": [],
                "collection_metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "days_analyzed": days_back,
                    "total_users": 0,
                    "total_incidents": 0,
                    "error": str(e),
                    "date_range": {
                        "start": (datetime.now() - timedelta(days=days_back)).isoformat(),
                        "end": datetime.now().isoformat()
                    },
                    "performance_metrics": {
                        "total_collection_time_seconds": fetch_duration,
                        "failed": True
                    }
                }
            }

    def _load_mock_data(self) -> Dict[str, Any]:
        """
        Load mock data from YAML scenario files instead of making API calls.
        Returns data in the same format as _fetch_analysis_data()
        """
        if not self.mock_loader:
            raise RuntimeError("Mock loader not initialized - cannot load mock data")

        logger.info(f"🎭 MOCK DATA: Loading scenario '{self.mock_scenario}'")

        try:
            # Load formatted data from MockDataLoader
            data = self.mock_loader.get_unified_data(
                scenario_name=self.mock_scenario,
                platform=self.platform
            )

            logger.info(f"🎭 MOCK DATA: Loaded {len(data.get('users', []))} users and {len(data.get('incidents', []))} incidents")
            logger.info(f"🎭 MOCK DATA: Scenario metadata: {data.get('collection_metadata', {})}")

            # Add total incidents count to metadata for consistency
            if 'collection_metadata' in data:
                data['collection_metadata']['total_incidents'] = len(data.get('incidents', []))
                data['collection_metadata']['days_analyzed'] = 30  # Mock data assumes 30-day period

            return data

        except Exception as e:
            logger.error(f"🎭 MOCK DATA ERROR: Failed to load scenario '{self.mock_scenario}': {e}")
            logger.error(f"🎭 MOCK DATA ERROR: Exception type: {type(e).__name__}")

            # Return empty data structure on error
            return {
                "users": [],
                "incidents": [],
                "collection_metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "days_analyzed": 30,
                    "total_users": 0,
                    "total_incidents": 0,
                    "error": f"Mock data loading failed: {str(e)}",
                    "source": "mock_data",
                    "scenario": self.mock_scenario
                }
            }

    # helper for building  timezone map
    def _build_user_tz_map(self, users):
        tz_by_id = {}
        if not users:
            return tz_by_id
        for user in users:
            uid = user.get("id")        
            if not uid:
                continue
            if self.platform == "pagerduty":
                tz = user.get("timezone") 
                # print(f"User: {user.get('name')} ({user.get('email')}) → TZ: {user.get('timezone')}")
            else:  
                attrs = user.get("attributes", {}) or {}
                # print(f"User: {user.get('name')} ({user.get('email')}) → TZ: {user.get('timezone')}")

                tz = attrs.get("time_zone") or attrs.get("timezone")
            tz_by_id[str(uid)] = tz
        return tz_by_id


    def _analyze_team_data(
        self, 
        users: List[Dict[str, Any]], 
        incidents: List[Dict[str, Any]],
        metadata: Dict[str, Any],
        include_weekends: bool,
        github_data: Dict[str, Dict] = None,
        slack_data: Dict[str, Dict] = None
    ) -> Dict[str, Any]:
        """Analyze burnout data for the entire team."""
        # Ensure all inputs are valid
        users = users or []
        incidents = incidents or []
        metadata = metadata or {}
        
        # Map users to their incidents
        user_incidents = self._map_user_incidents(users, incidents)
        
        # Analyze each team member
        member_analyses = []
        for user in users:
            # Add safety check for None user
            if user is None:
                continue
            user_id = str(user.get("id")) if user.get("id") is not None else "unknown"
            # Get GitHub/Slack data for this user - handle JSONAPI format
            if isinstance(user, dict) and "attributes" in user:
                user_email = user["attributes"].get("email")
                user_name = user["attributes"].get("full_name") or user["attributes"].get("name")
            else:
                user_email = user.get("email")
                user_name = user.get("full_name") or user.get("name")
            
            # GitHub uses email, Slack uses name
            user_github_data = github_data.get(user_email) if github_data and user_email else None
            user_slack_data = slack_data.get(user_name) if slack_data and user_name else None
            
            user_analysis = self._analyze_member_burnout(
                user,
                user_incidents.get(user_id, []),
                metadata,
                include_weekends,
                user_github_data,
                user_slack_data
            )
            member_analyses.append(user_analysis)
        
        # Sort by burnout score (highest first)
        member_analyses.sort(key=lambda x: x["burnout_score"], reverse=True)
        
        return {
            "members": member_analyses,
            "total_members": len(users),
            "total_incidents": len(incidents)
        }
    
    def _map_user_incidents(
        self, 
        users: List[Dict[str, Any]], 
        incidents: List[Dict[str, Any]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Map incidents to users based on involvement."""
        user_incidents = defaultdict(list)
        
        # Ensure inputs are valid
        incidents = incidents or []
        
        for incident in incidents:
            # Add safety check for None incident
            if incident is None:
                continue
            
            incident_users = set()
            
            if self.platform == "pagerduty":
                # PagerDuty normalized format - check multiple user involvement sources
                
                # 1. Assigned user (from assignments)
                assigned_to = incident.get("assigned_to")
                if assigned_to and assigned_to.get("id"):
                    incident_users.add(str(assigned_to["id"]))
                
                # 2. If no assigned user, check raw incident data for acknowledgments and assignments
                if not incident_users and "raw_data" in incident:
                    raw_incident = incident["raw_data"]
                    
                    # Check all assignments (not just first)
                    assignments = raw_incident.get("assignments", [])
                    for assignment in assignments:
                        assignee = assignment.get("assignee", {})
                        if assignee and assignee.get("id"):
                            incident_users.add(str(assignee["id"]))
                    
                    # Check acknowledgments (who acknowledged the incident)
                    acknowledgments = raw_incident.get("acknowledgments", [])
                    for ack in acknowledgments:
                        acknowledger = ack.get("acknowledger", {})
                        if acknowledger and acknowledger.get("id"):
                            incident_users.add(str(acknowledger["id"]))
                    
                    # Check escalation policy targets as fallback
                    escalation_policy = raw_incident.get("escalation_policy", {})
                    if escalation_policy and escalation_policy.get("escalation_rules"):
                        for rule in escalation_policy.get("escalation_rules", []):
                            for target in rule.get("targets", []):
                                if target.get("type") == "user" and target.get("id"):
                                    incident_users.add(str(target["id"]))
            else:
                # Rootly format
                attrs = incident.get("attributes", {}) if incident else {}
                
                # Extract all users involved in the incident with comprehensive null safety
                # Creator/Reporter
                user_data = attrs.get("user")
                if user_data and isinstance(user_data, dict):
                    data = user_data.get("data")
                    if data and isinstance(data, dict) and data.get("id"):
                        incident_users.add(str(data["id"]))
                
                # Started by (acknowledged)
                started_by_data = attrs.get("started_by")
                if started_by_data and isinstance(started_by_data, dict):
                    data = started_by_data.get("data")
                    if data and isinstance(data, dict) and data.get("id"):
                        incident_users.add(str(data["id"]))
                
                # Resolved by
                resolved_by_data = attrs.get("resolved_by")
                if resolved_by_data and isinstance(resolved_by_data, dict):
                    data = resolved_by_data.get("data")
                    if data and isinstance(data, dict) and data.get("id"):
                        incident_users.add(str(data["id"]))
            
            # Add incident to each involved user
            for user_id in incident_users:
                user_incidents[user_id].append(incident)
        
        return dict(user_incidents)
    
    def _analyze_member_burnout(
        self,
        user: Dict[str, Any],
        incidents: List[Dict[str, Any]],
        metadata: Dict[str, Any],
        include_weekends: bool,
        github_data: Dict[str, Any] = None,
        slack_data: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Analyze burnout for a single team member."""
        # Extract user info based on platform
        if self.platform == "pagerduty":
            # PagerDuty API structure
            user_id = user.get("id")
            user_name = user.get("name") or user.get("summary", "Unknown")
            user_email = user.get("email")
        else:
            # Rootly API structure
            user_attrs = user.get("attributes", {})
            user_id = user.get("id")
            user_name = user_attrs.get("full_name") or user_attrs.get("name", "Unknown")
            user_email = user_attrs.get("email")
        
        # If no incidents, return minimal analysis
        if not incidents:
            # Calculate zero-incident OCB metrics for consistency
            zero_ocb_metrics = {
                'incident_frequency': 0,
                'incident_severity': 0,
                'response_urgency': 0,
                'team_coordination': 0,
                'escalation_frequency': 0,
                'after_hours_work': 0,
                'meeting_load': 0,
                'oncall_burden': 0
            }
            
            # Calculate OCB dimensions for zero incidents
            personal_ocb = calculate_personal_burnout(zero_ocb_metrics)
            work_ocb = calculate_work_related_burnout(zero_ocb_metrics) 
            composite_ocb = calculate_composite_ocb_score(personal_ocb['score'], work_ocb['score'])
            
            # Generate reasoning for zero-incident OCB scores
            ocb_reasoning = generate_ocb_score_reasoning(
                personal_ocb, 
                work_ocb, 
                composite_ocb,
                zero_ocb_metrics
            )
            
            return {
                "user_id": user_id,
                "user_name": user_name,
                "user_email": user_email,
                "burnout_score": 0,
                "ocb_score": round(min(100, composite_ocb['composite_score']), 2),  # Cap display at 100 for UI
                "risk_level": "low",
                "incident_count": 0,
                "factors": {
                    "workload": 0,
                    "after_hours": 0,
                    "weekend_work": 0,
                    "incident_load": 0,
                    "response_time": 0
                },
                "burnout_dimensions": {
                    "personal_burnout": 0,
                    "work_related_burnout": 0,
                    "client_related_burnout": 0
                },
                "ocb_breakdown": {  # ✅ Add OCB breakdown for consistency
                    "personal": round(personal_ocb['score'], 2),
                    "work_related": round(work_ocb['score'], 2),
                    "interpretation": composite_ocb['interpretation']
                },
                "ocb_reasoning": ocb_reasoning,  # ✅ Add explanations
                "metrics": {
                    "incidents_per_week": 0,
                    "after_hours_percentage": 0,
                    "weekend_percentage": 0,
                    "avg_response_time_minutes": 0,
                    "severity_distribution": {}
                }
            }
        
        # Calculate base metrics from incidents
        days_analyzed = metadata.get("days_analyzed", 30) or 30
        user_tz = self.user_tz_by_id.get(str(user_id), "UTC")
        base_metrics = self._calculate_member_metrics(
            incidents,
            days_analyzed,
            include_weekends, 
            user_tz
        )

        # Enhance metrics with GitHub/Slack data if available
        metrics = self._enhance_metrics_with_github_data(base_metrics, github_data, user_tz)

        # Add Slack communication patterns
        if slack_data:
            metrics = self._enhance_metrics_with_slack_data(metrics, slack_data, user_tz)
        
        # Calculate burnout dimensions  
        dimensions = self._calculate_burnout_dimensions(metrics)
        
        # Calculate burnout factors for backward compatibility
        factors = self._calculate_burnout_factors(metrics)

        # Calculate confidence intervals and data quality
        confidence = self._calculate_confidence_intervals(metrics, incidents, github_data, slack_data, user_tz)
        
        # OCB DEBUG LOGGING - Removed to reduce Railway log noise
        
        # Calculate overall burnout score using three-factor methodology (equal weighting)
        burnout_score = (dimensions["personal_burnout"] * 0.333 + 
                        dimensions["work_related_burnout"] * 0.333 + 
                        dimensions["accomplishment_burnout"] * 0.334)
        
        # Ensure overall score is never negative
        burnout_score = max(0, burnout_score)
        
        # Debug logging removed to reduce noise
        
        # Determine risk level
        risk_level = self._determine_risk_level(burnout_score)
        
        # Calculate OCB (Copenhagen Burnout Inventory) score
        # Map existing metrics to OCB format with severity weighting
        severity_dist = metrics.get('severity_distribution', {})

        # Calculate research-based impact factors
        time_impacts = self._calculate_time_impact_multipliers(incidents, metrics, user_tz)
        recovery_data = self._calculate_recovery_deficit(incidents, user_tz)

        # Log research-based insights
        logger.info(f"🕐 TIME IMPACT: {user_name} - After-hours: {time_impacts['after_hours_incidents']}, "
                   f"Weekend: {time_impacts['weekend_incidents']}, Overnight: {time_impacts['overnight_incidents']}")
        logger.info(f"🔄 RECOVERY: {user_name} - Violations: {recovery_data['recovery_violations']}, "
                   f"Avg recovery: {recovery_data['avg_recovery_hours']:.1f}h, Score: {recovery_data['recovery_score']:.0f}/100")
        
        # Calculate severity-weighted incident burden 
        # Handle both Rootly (sev0-sev4) and PagerDuty (sev1-sev5) severity mappings
        if self.platform == "pagerduty":
            # PagerDuty: SEV1=critical, SEV2=high, SEV3=medium, SEV4=low, SEV5=info
            # Research-based: SEV1=life-defining events, executive involvement
            severity_weights = {'sev1': 15.0, 'sev2': 12.0, 'sev3': 6.0, 'sev4': 3.0, 'sev5': 1.5}
        else:
            # Rootly: SEV0=critical, SEV1=high, SEV2=medium, SEV3=low, SEV4=info  
            # Research-based: SEV0/SEV1=PTSD risk, press attention, executive involvement
            severity_weights = {'sev0': 15.0, 'sev1': 12.0, 'sev2': 6.0, 'sev3': 3.0, 'sev4': 1.5, 'unknown': 1.5}
        
        # Variables for tiered scaling calculations
        total_incidents = metrics.get('total_incidents', 0)
        
        # Get the highest severity incidents based on platform
        if self.platform == "pagerduty":
            # PagerDuty: sev1=critical, sev2=high
            critical_incidents = severity_dist.get('sev1', 0)
            high_incidents = severity_dist.get('sev2', 0)
        else:
            # Rootly: CRITICAL FIX - SEV1 incidents ARE critical in Rootly (not sev0)
            # Based on rootly_client.py mapping: "critical": "sev1"
            critical_incidents = severity_dist.get('sev1', 0) + severity_dist.get('sev0', 0)  # sev1 + any sev0
            high_incidents = severity_dist.get('sev2', 0)
        
        # ROOTLY'S PROVEN TIERED SCALING - Replace linear caps with progressive tiers!
        # This is the EXACT methodology that prevents clustering in successful Rootly analyses
        
        incidents_per_week = metrics.get('incidents_per_week', 0)
        total_incidents = metrics.get('total_incidents', 0) 
        avg_response_minutes = metrics.get('avg_response_time_minutes', 0)
        after_hours_pct = metrics.get('after_hours_percentage', 0)
        
        # Helper function for Rootly's tiered scaling approach (highly sensitive to extreme volumes)
        def apply_incident_tiers(ipw: float) -> float:
            """Apply aggressive tiered scaling for extreme incident volumes"""
            if ipw <= 0.5:
                return ipw * 4.0                   # 0-2.0 range (very low volume)
            elif ipw <= 1.5:
                return 2.0 + ((ipw - 0.5) / 1.0) * 3.0   # 2.0-5.0 range (low volume)
            elif ipw <= 3.5:
                return 5.0 + ((ipw - 1.5) / 2.0) * 3.0   # 5.0-8.0 range (medium volume)  
            elif ipw <= 7.0:
                return 8.0 + ((ipw - 3.5) / 3.5) * 1.5   # 8.0-9.5 range (high volume)
            else:
                # For extreme cases (11+ IPW), push to maximum
                return 9.5 + min(0.5, (ipw - 7.0) / 4.0)  # 9.5-10.0 range (critical volume)
        
        def apply_rootly_escalation_tiers(rate: float) -> float:
            """Apply tiered scaling to escalation rate (0-1 input)"""
            # Clamp rate to 0-1 range for safety
            rate = max(0.0, min(1.0, rate))
            
            if rate <= 0.1:
                return rate * 20                   # 0-2 range (very low escalation) 
            elif rate <= 0.3:
                return 2 + ((rate - 0.1) / 0.2) * 3  # 2-5 range (low escalation)
            elif rate <= 0.6:
                return 5 + ((rate - 0.3) / 0.3) * 2  # 5-7 range (medium escalation)
            else:
                return 7 + min(2, ((rate - 0.6) / 0.4) * 2)  # 7-9 range (high escalation)
        
        def apply_rootly_response_tiers(minutes: float) -> float:
            """Apply tiered scaling to response time"""  
            if minutes <= 15:
                return minutes / 15 * 2            # 0-2 range (fast response)
            elif minutes <= 60:
                return 2 + ((minutes - 15) / 45) * 5  # 2-7 range (medium response)
            else:
                return 7 + min(3, ((minutes - 60) / 60) * 3)  # 7-10 range (slow response)
        
        def apply_rootly_incident_tiers(incidents_per_week: float) -> float:
            """Apply tiered scaling to incident frequency (similar to apply_incident_tiers)"""
            if incidents_per_week <= 0.5:
                return incidents_per_week * 4.0                   # 0-2.0 range (very low volume)
            elif incidents_per_week <= 1.5:
                return 2.0 + ((incidents_per_week - 0.5) / 1.0) * 3.0   # 2.0-5.0 range (low volume)
            elif incidents_per_week <= 3.0:
                return 5.0 + ((incidents_per_week - 1.5) / 1.5) * 3.0   # 5.0-8.0 range (moderate volume)
            else:
                return 8.0 + min(2.0, ((incidents_per_week - 3.0) / 2.0) * 2.0)  # 8.0-10.0 range (high volume)
        
        # Calculate escalation rate for tiered scaling
        high_severity_count = critical_incidents + high_incidents  # CRITICAL FIX: Define the variable!
        escalation_rate = high_severity_count / max(total_incidents, 1) if total_incidents > 0 else 0
        
        # Calculate severity-weighted incidents per week for proper burnout assessment
        severity_weighted_total = 0.0
        for severity_level, count in severity_dist.items():
            weight = severity_weights.get(severity_level, 1.5)  # Default weight for unknown severities
            severity_weighted_total += count * weight
            
        # Convert to per-week basis (assuming 30-day analysis period)
        severity_weighted_per_week = severity_weighted_total / 4.3  # 30 days ≈ 4.3 weeks
        
        logger.info(f"🔍 SEVERITY_WEIGHTED: User has {severity_weighted_total:.1f} severity-weighted incidents total ({severity_weighted_per_week:.1f}/week)")
        
        # Apply Rootly's tiered scaling to all OCB metrics
        ocb_metrics = {
            # Personal burnout factors - using Rootly's tiered approach
            'work_hours_trend': apply_incident_tiers(incidents_per_week) * 10,      # Scale to 0-100
            'weekend_work': after_hours_pct * 2,                                           # NO CAP: Extreme after-hours can exceed 100%
            'after_hours_activity': after_hours_pct,                                       # Direct mapping
            'vacation_usage': (severity_weighted_per_week / 20) * 100,                     # NO CAP: Extreme SEV1s prevent recovery completely
            'sleep_quality_proxy': apply_rootly_incident_tiers(severity_weighted_per_week) * 8,  # NO CAP: SEV1s can destroy sleep
            
            # Work-related burnout factors - using Rootly's response time tiers  
            'sprint_completion': apply_rootly_response_tiers(avg_response_minutes) * 10,   # Tiered response pressure
            'code_review_speed': apply_rootly_response_tiers(avg_response_minutes) * 8,    # Slightly less weight
            'pr_frequency': apply_rootly_incident_tiers(incidents_per_week) * 8,           # Tiered workload frequency
            'deployment_frequency': critical_incidents * 8,                                # NO CAP: Extreme critical incidents can exceed 100%
            'meeting_load': apply_rootly_incident_tiers(incidents_per_week) * 6,           # Tiered coordination overhead
            'oncall_burden': apply_rootly_incident_tiers(severity_weighted_per_week) * 10  # FIXED: Use severity-weighted incidents for proper SEV1 impact
        }
        
        # 🐛 DEBUG: Log OCB metrics for troubleshooting zero scores
        logger.info(f"🐛 OCB METRICS DEBUG for {user_name}:")
        logger.info(f"   - Incidents: {len(incidents)}")
        logger.info(f"   - incidents_per_week: {incidents_per_week}")
        logger.info(f"   - critical_incidents: {critical_incidents}, high_incidents: {high_incidents}")
        logger.info(f"   - severity_dist: {severity_dist}")
        logger.info(f"   - OCB metrics: {ocb_metrics}")
        
        # Check if all OCB metrics are 0
        non_zero_metrics = {k: v for k, v in ocb_metrics.items() if v > 0}
        if not non_zero_metrics:
            logger.warning(f"⚠️ ALL OCB metrics are 0 for {user_name} with {len(incidents)} incidents!")

        # Calculate OCB dimensions
        personal_ocb = calculate_personal_burnout(ocb_metrics)
        work_ocb = calculate_work_related_burnout(ocb_metrics)
        composite_ocb = calculate_composite_ocb_score(personal_ocb['score'], work_ocb['score'])
        
        # Prepare enhanced metrics with research insights for OCB reasoning
        enhanced_metrics = metrics.copy()
        enhanced_metrics['time_impact_analysis'] = time_impacts
        enhanced_metrics['recovery_analysis'] = recovery_data
        enhanced_metrics['trauma_analysis'] = {
            "critical_incidents": severity_dist.get('sev0', 0) + severity_dist.get('sev1', 0),
            "compound_trauma_detected": (severity_dist.get('sev0', 0) + severity_dist.get('sev1', 0)) >= 5,
            "compound_factor": self._calculate_compound_trauma_factor(severity_dist.get('sev0', 0) + severity_dist.get('sev1', 0))
        }

        # Generate reasoning for the OCB scores
        ocb_reasoning = generate_ocb_score_reasoning(
            personal_ocb,
            work_ocb,
            composite_ocb,
            enhanced_metrics  # Pass enhanced metrics with research insights
        )
        
        result = {
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "burnout_score": round(burnout_score, 2),
            "ocb_score": round(min(100, composite_ocb['composite_score']), 2),  # Cap display at 100 for UI
            "risk_level": risk_level,
            "incident_count": len(incidents),
            "factors": factors,
            "burnout_dimensions": dimensions,
            "ocb_breakdown": {  # Add OCB breakdown for comparison
                "personal": round(personal_ocb['score'], 2),
                "work_related": round(work_ocb['score'], 2),
                "interpretation": composite_ocb['interpretation']
            },
            "ocb_reasoning": ocb_reasoning,  # Add explanations for the score
            "metrics": metrics,
            "confidence": confidence,  # Add confidence intervals and data quality
            # Research-based insights
            "time_impact_analysis": {
                "after_hours_incidents": time_impacts['after_hours_incidents'],
                "weekend_incidents": time_impacts['weekend_incidents'],
                "overnight_incidents": time_impacts['overnight_incidents'],
                "after_hours_multiplier": time_impacts['after_hours_multiplier'],
                "weekend_multiplier": time_impacts['weekend_multiplier'],
                "overnight_multiplier": time_impacts['overnight_multiplier']
            },
            "recovery_analysis": {
                "recovery_violations": recovery_data['recovery_violations'],
                "avg_recovery_hours": round(recovery_data['avg_recovery_hours'], 1),
                "min_recovery_hours": round(recovery_data['min_recovery_hours'], 1) if recovery_data['min_recovery_hours'] != float('inf') else 0,
                "recovery_score": round(recovery_data['recovery_score'], 0)
            },
            "trauma_analysis": {
                "critical_incidents": severity_dist.get('sev0', 0) + severity_dist.get('sev1', 0),
                "compound_trauma_detected": (severity_dist.get('sev0', 0) + severity_dist.get('sev1', 0)) >= 5,
                "compound_factor": self._calculate_compound_trauma_factor(severity_dist.get('sev0', 0) + severity_dist.get('sev1', 0))
            }
        }
        
        # Add GitHub activity if available
        if github_data and github_data.get("activity_data"):
            result["github_activity"] = github_data["activity_data"]
            
            # Check if GitHub activity indicates high risk
            github_indicators = github_data.get("activity_data", {}).get("burnout_indicators", {})
            has_github_risk_indicators = any([
                github_indicators.get("excessive_commits", False),
                github_indicators.get("late_night_activity", False),
                github_indicators.get("weekend_work", False),
                github_indicators.get("large_prs", False)
            ])
            
            # Log GitHub risk assessment for validation
            if has_github_risk_indicators:
                logger.info(f"Member {user_email} has GitHub risk indicators: {[k for k, v in github_indicators.items() if v]}")
                # Upgrade risk level if GitHub activity shows risk but incidents don't
                if result["risk_level"] == "low" and has_github_risk_indicators:
                    result["risk_level"] = "medium"
                    result["risk_level_reason"] = "Upgraded due to GitHub activity patterns"
                    logger.info(f"Upgraded {user_email} risk level from low to medium due to GitHub activity")
                elif result["risk_level"] == "medium" and has_github_risk_indicators:
                    result["risk_level"] = "high"
                    result["risk_level_reason"] = "Upgraded due to combined incident and GitHub patterns"
                    logger.info(f"Upgraded {user_email} risk level from medium to high due to GitHub activity")
        else:
            # Add placeholder GitHub activity
            result["github_activity"] = {
                "commits_count": 0,
                "pull_requests_count": 0,
                "reviews_count": 0,
                "after_hours_commits": 0,
                "weekend_commits": 0,
                "avg_pr_size": 0,
                "burnout_indicators": {
                    "excessive_commits": False,
                    "late_night_activity": False,
                    "weekend_work": False,
                    "large_prs": False
                }
            }
        
        # Add Slack activity if available
        if slack_data and slack_data.get("activity_data"):
            result["slack_activity"] = slack_data["activity_data"]
        else:
            # Add placeholder Slack activity
            result["slack_activity"] = {
                "messages_sent": 0,
                "channels_active": 0,
                "after_hours_messages": 0,
                "weekend_messages": 0,
                "avg_response_time_minutes": 0,
                "sentiment_score": 0.0,
                "burnout_indicators": {
                    "excessive_messaging": False,
                    "poor_sentiment": False,
                    "late_responses": False,
                    "after_hours_activity": False
                }
            }
        
        return result



    def _get_user_tz(self, user_id: Any, default: str = "UTC") -> str:
        """Return a user's timezone string from the cached id->tz map."""
        if user_id is None:
            return default
        return self.user_tz_by_id.get(str(user_id), default) or default

    def _parse_iso_utc(self, ts: Optional[str]) -> Optional[datetime]:
        """Parse ISO8601 (possibly ending with 'Z') into an aware UTC datetime."""
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return None



    def _to_local(self, dt, user_tz: str):
        """convert dt to the user's timezone"""
        try:
            tz = pytz.timezone(user_tz or "UTC")
        except Exception:
            tz = pytz.UTC
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        return dt.astimezone(tz)


    def _calculate_member_metrics(
        self,
        incidents: List[Dict[str, Any]],
        days_analyzed: int,
        include_weekends: bool,
        user_tz: str = "UTC",
    ) -> Dict[str, Any]:
        """Calculate detailed metrics for a team member."""
        # Initialize counters
        after_hours_count = 0
        weekend_count = 0
        response_times = []
        severity_counts = defaultdict(int)
        status_counts = defaultdict(int)
        
        for incident in incidents:
            # Handle both Rootly (with attributes) and PagerDuty (normalized) formats
            if self.platform == "pagerduty":
                # print("USING PAGERDUTY")
                # PagerDuty normalized format
                created_at = incident.get("created_at")
                acknowledged_at = incident.get("acknowledged_at")
                severity = incident.get("severity", "unknown")
                status = incident.get("status", "unknown")
            else:
                # Rootly format
                # print("USING ROOTLY")
                attrs = incident.get("attributes", {})
                created_at = attrs.get("created_at")
                # Try multiple timestamp fields for response time calculation
                acknowledged_at = attrs.get("acknowledged_at") or attrs.get("started_at") or attrs.get("mitigated_at")
                
                # Severity with null safety
                severity = "unknown"
                severity_data = attrs.get("severity")
                if severity_data and isinstance(severity_data, dict):
                    data = severity_data.get("data")
                    if data and isinstance(data, dict):
                        attributes = data.get("attributes")
                        if attributes and isinstance(attributes, dict):
                            name = attributes.get("name")
                            if name and isinstance(name, str):
                                severity = name.lower()
                
                # Status with null safety
                status = attrs.get("status", "unknown")
            
            # Count status
            status_counts[status] += 1
            
            # Check timing
            if created_at:
                dt = self._parse_iso_utc(created_at)
                dt_local = self._to_local(dt, user_tz)
                # print("LOCAL pagerduty/rootly Weekday at: ", dt_local.weekday())

                # # Uncomment to test and validate:
                # print("PAGE DUTY or ROOTLY Regular: ", dt)
                # print("PAGER DUTY or ROOTLY Local Timezone: ", user_tz, " now is: ", dt_local)

                if dt_local:
                    # After hours: before 9 AM or after 6 PM
                    if dt_local.hour < 9 or dt_local.hour >= 18:
                        after_hours_count += 1
                    
                    # Weekend: Saturday (5) or Sunday (6)
                    if dt_local.weekday() >= 5:
                        weekend_count += 1


            # Response time (time to acknowledge)
            if created_at and acknowledged_at:
                response_time = self._calculate_response_time(created_at, acknowledged_at, user_tz)
                if response_time is not None:
                    response_times.append(response_time)
            
            # Count severity
            severity_counts[severity] += 1
        
        # Calculate averages and percentages with comprehensive None safety
        # Ensure all values are not None before calculations
        safe_after_hours = after_hours_count if after_hours_count is not None else 0
        safe_weekend = weekend_count if weekend_count is not None else 0
        safe_incidents_len = len(incidents) if incidents is not None else 0
        safe_days = days_analyzed if days_analyzed is not None and days_analyzed > 0 else 1
        
        incidents_per_week = (safe_incidents_len / safe_days) * 7 if safe_days > 0 else 0
        after_hours_percentage = safe_after_hours / safe_incidents_len if safe_incidents_len > 0 else 0
        weekend_percentage = safe_weekend / safe_incidents_len if safe_incidents_len > 0 else 0
        avg_response_time = sum(response_times) / len(response_times) if response_times and len(response_times) > 0 else 0
        
        # Ensure all numeric values are not None before rounding
        safe_incidents_per_week = incidents_per_week if incidents_per_week is not None else 0
        safe_after_hours_percentage = after_hours_percentage if after_hours_percentage is not None else 0
        safe_weekend_percentage = weekend_percentage if weekend_percentage is not None else 0
        safe_avg_response_time = avg_response_time if avg_response_time is not None else 0
        
        # Add enhanced GitHub/Slack metrics if available
        enhanced_metrics = {
            "incidents_per_week": round(safe_incidents_per_week, 2),
            "after_hours_percentage": round(safe_after_hours_percentage, 3),
            "weekend_percentage": round(safe_weekend_percentage, 3),
            "avg_response_time_minutes": round(safe_avg_response_time, 1),
            "severity_distribution": dict(severity_counts),
            "status_distribution": dict(status_counts)
        }

        # Add severity-weighted incident calculation for better load assessment
        if safe_incidents_len > 0:
            severity_weights = {"critical": 4, "high": 3, "medium": 2, "low": 1, "unknown": 1.5}
            total_weighted_severity = 0
            for incident in incidents:
                severity = incident.get("severity", "unknown").lower()
                weight = severity_weights.get(severity, 1.5)
                total_weighted_severity += weight

            severity_weighted_per_week = (total_weighted_severity / safe_days) * 7 if safe_days > 0 else 0
            enhanced_metrics["severity_weighted_incidents_per_week"] = round(severity_weighted_per_week, 2)

        return enhanced_metrics

    def _enhance_metrics_with_github_data(self, base_metrics: Dict[str, Any], github_data: Dict[str, Any], user_tz: str = "UTC") -> Dict[str, Any]:
        """Add sophisticated GitHub analysis patterns to base incident metrics."""
        if not github_data:
            return base_metrics

        enhanced = base_metrics.copy()

        # Extract GitHub activity patterns
        commits = github_data.get("commits", [])
        pull_requests = github_data.get("pull_requests", [])
        reviews = github_data.get("code_reviews", [])

        if commits:
            # 1. Commit Temporal Patterns (beyond simple after-hours)
            commit_hours = []
            commit_weekdays = []
            daily_commit_counts = {}

            from datetime import datetime

            for commit in commits:
                dt_utc = self._parse_iso_utc(commit.get("timestamp"))
                if not dt_utc:
                    continue
                dt_local = self._to_local(dt_utc, user_tz)
                commit_hours.append(dt_local.hour)
                print("LOCAL Github weekday at: ", dt_local.weekday())
                commit_weekdays.append(dt_local.weekday())

                date_key = dt_local.date()
                daily_commit_counts[date_key] = daily_commit_counts.get(date_key, 0) + 1


            # Context switching intensity (high variation = more stress)
            if daily_commit_counts:
                daily_counts = list(daily_commit_counts.values())
                avg_daily_commits = sum(daily_counts) / len(daily_counts)
                commit_variance = sum((x - avg_daily_commits) ** 2 for x in daily_counts) / len(daily_counts)
                enhanced["context_switching_intensity"] = min(1.0, commit_variance / (avg_daily_commits + 1))

            # Work-life boundary erosion (commits spread across more hours = worse)
            if commit_hours:
                unique_hours = len(set(commit_hours))
                enhanced["work_hours_spread"] = unique_hours / 24.0  # 0-1 scale

                # Late night coding pattern (using standard constants: 10PM - 6AM)
                late_night_commits = sum(1 for h in commit_hours if h >= LATE_NIGHT_START or h <= LATE_NIGHT_END)
                enhanced["late_night_coding_ratio"] = late_night_commits / len(commits) if commits else 0

        # 2. Pull Request Patterns (cognitive load and social engagement)
        if pull_requests:
            pr_sizes = []
            pr_review_times = []

            for pr in pull_requests:
                # PR size indicates cognitive complexity
                additions = pr.get("additions", 0)
                deletions = pr.get("deletions", 0)
                pr_size = additions + deletions
                if pr_size > 0:
                    pr_sizes.append(pr_size)

                created = self._parse_iso_utc(pr.get("created_at"))
                merged  = self._parse_iso_utc(pr.get("merged_at"))
                if created and merged:
                    pr_review_times.append((merged - created).total_seconds() / 3600.0)

            if pr_sizes:
                avg_pr_size = sum(pr_sizes) / len(pr_sizes)
                enhanced["avg_pr_complexity"] = min(1.0, avg_pr_size / 1000)  # Normalize large PRs

                # Large PR ratio (>500 lines = potentially rushed/overwhelming)
                large_prs = sum(1 for size in pr_sizes if size > 500)
                enhanced["large_pr_ratio"] = large_prs / len(pr_sizes) if pr_sizes else 0

            if pr_review_times:
                avg_review_time = sum(pr_review_times) / len(pr_review_times)
                enhanced["avg_pr_review_hours"] = avg_review_time

                # Rush PRs (merged within 2 hours = high pressure)
                rush_prs = sum(1 for t in pr_review_times if t < 2)
                enhanced["rush_pr_ratio"] = rush_prs / len(pr_review_times) if pr_review_times else 0

        # 3. Code Review Social Health
        if reviews:
            # Review participation decline over time
            review_dates = []

            for review in reviews:
                dt_utc = self._parse_iso_utc(review.get("submitted_at"))
                if not dt_utc:
                    continue
                review_dates.append(self._to_local(dt_utc, user_tz))

            if len(review_dates) >= 4:  # Need minimum data for trend
                # Sort and calculate trend (positive = increasing, negative = declining)
                review_dates.sort()
                days = [(d - review_dates[0]).days for d in review_dates]
                counts = list(range(len(review_dates)))  # Cumulative review count

                # Simple linear regression slope
                n = len(days)
                sum_xy = sum(d * c for d, c in zip(days, counts))
                sum_x = sum(days)
                sum_y = sum(counts)
                sum_x2 = sum(d * d for d in days)

                if n * sum_x2 - sum_x * sum_x != 0:
                    slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
                    enhanced["review_engagement_trend"] = slope  # Positive = improving, negative = declining

        # 4. Overall GitHub Burnout Indicators
        github_burnout_score = 0

        # High context switching
        if enhanced.get("context_switching_intensity", 0) > 0.7:
            github_burnout_score += 15

        # Eroded work boundaries
        if enhanced.get("work_hours_spread", 0) > 0.6:
            github_burnout_score += 20

        # Late night coding
        if enhanced.get("late_night_coding_ratio", 0) > 0.2:
            github_burnout_score += 25

        # Large, complex PRs
        if enhanced.get("large_pr_ratio", 0) > 0.3:
            github_burnout_score += 15

        # Rush PRs (time pressure)
        if enhanced.get("rush_pr_ratio", 0) > 0.4:
            github_burnout_score += 15

        # Declining social engagement
        if enhanced.get("review_engagement_trend", 0) < -0.1:
            github_burnout_score += 10

        enhanced["github_burnout_indicators"] = min(100, github_burnout_score)

        return enhanced

    def _enhance_metrics_with_slack_data(self, base_metrics: Dict[str, Any], slack_data: Dict[str, Any], user_tz: str = "UTC") -> Dict[str, Any]:
        """Add Slack communication health metrics to detect burnout through social patterns."""
        if not slack_data:
            return base_metrics

        enhanced = base_metrics.copy()

        # Extract Slack activity patterns
        messages = slack_data.get("messages", [])
        channels = slack_data.get("channels_active", 0)
        response_times = slack_data.get("response_times", [])

        print("seeing slack mesages")

        if messages:

            message_hours = []
            message_weekdays = []
            daily_message_counts = {}

            for message in messages:
                dt_utc = self._parse_iso_utc(message.get("timestamp"))
                if not dt_utc:
                    continue
                dt_local = self._to_local(dt_utc, user_tz)
                # Uncomment below to verify slack
                # print("SLACK TIME UTC: ", dt_utc)
                # print("AFTER TIME AFTER TZ ADJUSTMENT: ", dt_local)
                message_hours.append(dt_local.hour)

                message_weekdays.append(dt_local.weekday())

                date_key = dt_local.date()
                daily_message_counts[date_key] = daily_message_counts.get(date_key, 0) + 1
            
            # After-hours communication burden (using standard constants)
            if message_hours:
                after_hours_msgs = sum(1 for h in message_hours if h < BUSINESS_HOURS_START or h >= BUSINESS_HOURS_END)
                enhanced["slack_after_hours_ratio"] = after_hours_msgs / len(messages)

                # Late night communication stress (using standard constants)
                late_night_msgs = sum(1 for h in message_hours if h >= LATE_NIGHT_START or h <= LATE_NIGHT_END)
                enhanced["slack_late_night_ratio"] = late_night_msgs / len(messages)

            # Weekend communication encroachment
            if message_weekdays:
                weekend_msgs = sum(1 for day in message_weekdays if day >= 5)  # Sat=5, Sun=6
                enhanced["slack_weekend_ratio"] = weekend_msgs / len(messages)

        # 2. Social Engagement and Isolation Indicators
        total_messages = len(messages)
        enhanced["slack_daily_msg_volume"] = total_messages / 30 if total_messages > 0 else 0  # Avg per day

        # Communication channel diversity (social health indicator)
        enhanced["slack_channel_diversity"] = min(1.0, channels / 10.0) if channels > 0 else 0

        # 3. Response Pressure Indicators
        if response_times:
            avg_response_mins = sum(response_times) / len(response_times) / 60  # Convert to minutes
            enhanced["slack_avg_response_minutes"] = avg_response_mins

            # Immediate response pressure (responses within 5 minutes)
            immediate_responses = sum(1 for t in response_times if t <= 300)  # 5 minutes in seconds
            enhanced["slack_immediate_response_ratio"] = immediate_responses / len(response_times)

            # High pressure responses (within 1 minute)
            urgent_responses = sum(1 for t in response_times if t <= 60)
            enhanced["slack_urgent_response_ratio"] = urgent_responses / len(response_times)

        # 4. Communication Burnout Indicators
        slack_burnout_score = 0

        # After-hours communication burden
        after_hours_ratio = enhanced.get("slack_after_hours_ratio", 0)
        if after_hours_ratio > 0.3:  # >30% after hours
            slack_burnout_score += 20

        # Late night communication stress
        late_night_ratio = enhanced.get("slack_late_night_ratio", 0)
        if late_night_ratio > 0.1:  # >10% late night
            slack_burnout_score += 25

        # Weekend work encroachment
        weekend_ratio = enhanced.get("slack_weekend_ratio", 0)
        if weekend_ratio > 0.15:  # >15% weekend
            slack_burnout_score += 20

        # High response pressure
        immediate_ratio = enhanced.get("slack_immediate_response_ratio", 0)
        if immediate_ratio > 0.4:  # >40% immediate responses
            slack_burnout_score += 15

        # Communication overload
        daily_volume = enhanced.get("slack_daily_msg_volume", 0)
        if daily_volume > 50:  # >50 messages per day
            slack_burnout_score += 10

        # Low social engagement (isolation indicator)
        channel_diversity = enhanced.get("slack_channel_diversity", 0)
        if channel_diversity < 0.2:  # <20% diversity
            slack_burnout_score += 15

        enhanced["slack_burnout_indicators"] = min(100, slack_burnout_score)

        # 5. Sentiment Analysis (if available)
        sentiment_scores = slack_data.get("sentiment_scores", [])
        if sentiment_scores:
            avg_sentiment = sum(sentiment_scores) / len(sentiment_scores)
            enhanced["slack_avg_sentiment"] = avg_sentiment

            # Negative sentiment trend (burnout indicator)
            if avg_sentiment < -0.2:  # Negative sentiment
                enhanced["slack_burnout_indicators"] = min(100, enhanced.get("slack_burnout_indicators", 0) + 15)

        return enhanced

    def _calculate_confidence_intervals(self, metrics: Dict[str, Any], incidents: List[Dict], github_data: Dict = None, slack_data: Dict = None, user_tz: str = "UTC") -> Dict[str, Any]:
        """Calculate confidence intervals and data quality indicators for burnout metrics."""
        confidence = {}

        # 1. Data Sample Size Assessment
        incident_count = len(incidents) if incidents else 0
        github_commits = len(github_data.get("commits", [])) if github_data else 0
        slack_messages = len(slack_data.get("messages", [])) if slack_data else 0

        # 2. Temporal Coverage Assessment
        days_with_activity = 0
        if incidents:
            from datetime import datetime
            incident_dates = set()
            for incident in incidents:
                try:
                    # rootly and pagerduty functionality
                    created_at = (incident.get("created_at") or (incident.get("attributes", {}) or {}).get("created_at"))
                    if created_at:
                        dt_utc = self._parse_iso_utc(created_at)
                        dt_local = self._to_local(dt_utc, user_tz)

                        # #uncomment for testing
                        # print("CONFIDENCE INTERVAL IN UTC: ", dt_utc)
                        # print("CONFIDENCE INTERVAL IN LOCAL TIME: ", dt_local)
                        incident_dates.add(dt_local.date())
                except:
                    continue
            days_with_activity = len(incident_dates)

        # 3. Data Quality Scores (0-100 scale)

        # Incident data quality
        incident_quality = 0
        if incident_count >= 10:  # High confidence threshold
            incident_quality = min(100, incident_count * 5)  # Scale up to 100
        elif incident_count >= 3:  # Moderate confidence
            incident_quality = min(70, incident_count * 15)
        else:  # Low confidence
            incident_quality = incident_count * 20

        # GitHub data quality
        github_quality = 0
        if github_commits >= 20:  # High confidence
            github_quality = min(100, github_commits * 3)
        elif github_commits >= 5:  # Moderate confidence
            github_quality = min(70, github_commits * 10)
        else:  # Low confidence
            github_quality = github_commits * 15

        # Slack data quality
        slack_quality = 0
        if slack_messages >= 50:  # High confidence
            slack_quality = min(100, slack_messages * 1.5)
        elif slack_messages >= 10:  # Moderate confidence
            slack_quality = min(70, slack_messages * 5)
        else:  # Low confidence
            slack_quality = slack_messages * 8

        # 4. Temporal Consistency (days with activity vs analysis period)
        expected_days = 30  # Default analysis period
        temporal_coverage = min(100, (days_with_activity / expected_days) * 100) if expected_days > 0 else 0

        # 5. Overall Confidence Score
        data_sources_available = sum([1 for q in [incident_quality, github_quality, slack_quality] if q > 0])

        if data_sources_available == 0:
            overall_confidence = 0
        elif data_sources_available == 1:
            overall_confidence = max(incident_quality, github_quality, slack_quality) * 0.6  # Single source penalty
        elif data_sources_available == 2:
            overall_confidence = (max(incident_quality, github_quality, slack_quality) * 0.7 +
                                min(incident_quality, github_quality, slack_quality) * 0.3)
        else:  # All 3 sources
            weights = [0.5, 0.3, 0.2] if incident_quality >= github_quality >= slack_quality else [0.4, 0.35, 0.25]
            qualities = sorted([incident_quality, github_quality, slack_quality], reverse=True)
            overall_confidence = sum(q * w for q, w in zip(qualities, weights))

        # Apply temporal coverage adjustment
        overall_confidence *= (temporal_coverage / 100) * 0.8 + 0.2  # Min 20% confidence

        # 6. Confidence Categories
        if overall_confidence >= 80:
            confidence_level = "HIGH"
            reliability_note = "High confidence - sufficient data across multiple sources"
        elif overall_confidence >= 60:
            confidence_level = "MODERATE"
            reliability_note = "Moderate confidence - good data coverage"
        elif overall_confidence >= 40:
            confidence_level = "LOW"
            reliability_note = "Low confidence - limited data available"
        else:
            confidence_level = "VERY_LOW"
            reliability_note = "Very low confidence - insufficient data for reliable assessment"

        confidence = {
            "overall_confidence": round(overall_confidence, 1),
            "confidence_level": confidence_level,
            "reliability_note": reliability_note,
            "data_quality": {
                "incident_quality": round(incident_quality, 1),
                "github_quality": round(github_quality, 1),
                "slack_quality": round(slack_quality, 1),
                "temporal_coverage": round(temporal_coverage, 1)
            },
            "sample_sizes": {
                "incidents": incident_count,
                "github_commits": github_commits,
                "slack_messages": slack_messages,
                "days_with_activity": days_with_activity
            },
            "confidence_intervals": {
                # Burnout score confidence intervals based on data quality
                "burnout_score_margin": (50 - overall_confidence/2),
                "calculation_note": "Lower bound: max(0, score - margin), Upper bound: min(100, score + margin)"
            }
        }

        return confidence

    def _calculate_burnout_dimensions(self, metrics: Dict[str, Any]) -> Dict[str, float]:
        """Calculate burnout dimensions (0-10 scale each)."""
        # Currently only implementing incident-based calculations (70% weight)
        # GitHub (15%) and Slack (15%) components to be added later
        
        # Personal Burnout (33.3% of final score)
        personal_burnout = self._calculate_personal_burnout_ocb(metrics)
        
        # Work-Related Burnout (33.3% of final score)  
        work_related_burnout = self._calculate_work_burnout_ocb(metrics)
        
        # Accomplishment Burnout (33.4% of final score)
        accomplishment_burnout = self._calculate_accomplishment_burnout_ocb(metrics)
        
        # Ensure all dimension values are numeric before rounding
        safe_personal_burnout = personal_burnout if personal_burnout is not None else 0.0
        safe_work_related_burnout = work_related_burnout if work_related_burnout is not None else 0.0
        safe_accomplishment_burnout = accomplishment_burnout if accomplishment_burnout is not None else 0.0
        
        return {
            "personal_burnout": round(safe_personal_burnout, 2),
            "work_related_burnout": round(safe_work_related_burnout, 2),
            "accomplishment_burnout": round(safe_accomplishment_burnout, 2)
        }
    
    def _calculate_personal_burnout_ocb(self, metrics: Dict[str, Any]) -> float:
        """Calculate Personal Burnout from incident data using OCB methodology (0-10 scale)."""
        # NEW: Much more aggressive incident frequency scaling based on research
        ipw = metrics.get("incidents_per_week", 0)
        ipw = float(ipw) if ipw is not None else 0.0
        
        # Research-based scaling: 2+ IPW = high stress, 11+ IPW = critical level
        if ipw <= 1:
            incident_frequency_score = ipw * 2.0  # 0-2 range (low)
        elif ipw <= 3:
            incident_frequency_score = 2 + ((ipw - 1) / 2) * 3  # 2-5 range (moderate) 
        elif ipw <= 7:
            incident_frequency_score = 5 + ((ipw - 3) / 4) * 3  # 5-8 range (high)
        else:  # 7+ IPW = critical burnout risk
            incident_frequency_score = 8 + min(2.0, (ipw - 7) / 4)  # 8-10 range (critical)
            
        logger.info(f"Personal burnout OCB: {ipw} IPW → frequency_score={incident_frequency_score}")
        
        # After hours score
        ahp = metrics.get("after_hours_percentage", 0)
        ahp = float(ahp) if ahp is not None else 0.0
        after_hours_score = min(10, ahp * 20)
        
        # Resolution time score (using response time as proxy)
        art = metrics.get("avg_response_time_minutes", 0)
        art = float(art) if art is not None else 0.0
        resolution_time_score = min(10, (art / 60) * 10) if art > 0 else 0  # Normalize to hours
        
        # Use actual data only - NO PLACEHOLDERS
        # Weighted average focusing on real incident data
        total_weight = 0.7 + 0.3  # frequency + after_hours + resolution_time
        weighted_score = (incident_frequency_score * 0.7 + after_hours_score * 0.3)
        
        return weighted_score
    
    def _calculate_work_burnout_ocb(self, metrics: Dict[str, Any]) -> float:
        """Calculate Work-Related Burnout from incident data using OCB methodology (0-10 scale)."""
        # Use the NEW research-based severity weights
        severity_dist = metrics.get("severity_distribution", {}) or {}
        
        # Apply research-based severity weights (SEV0=15.0, SEV1=12.0, etc.)
        if self.platform == "pagerduty":
            severity_weights = {'sev1': 15.0, 'sev2': 12.0, 'sev3': 6.0, 'sev4': 3.0, 'sev5': 1.5}
        else:
            severity_weights = {'sev0': 15.0, 'sev1': 12.0, 'sev2': 6.0, 'sev3': 3.0, 'sev4': 1.5, 'unknown': 1.5}
        
        # Calculate weighted severity impact using NEW weights with compound trauma
        total_severity_impact = 0.0
        total_incidents = 0
        critical_incidents_count = 0

        for severity, count in severity_dist.items():
            if count > 0:
                weight = severity_weights.get(severity.lower(), 1.5)

                # Track critical incidents for compound trauma calculation
                if severity.lower() in ['sev0', 'sev1'] and weight >= 12.0:
                    critical_incidents_count += count

                # Apply compound trauma factor for critical incidents
                if severity.lower() in ['sev0', 'sev1'] and count >= 5:
                    compound_factor = self._calculate_compound_trauma_factor(count)
                    weight *= compound_factor
                    logger.info(f"🔥 COMPOUND TRAUMA: {severity} incidents: {count}, compound factor: {compound_factor:.2f}")

                total_severity_impact += count * weight
                total_incidents += count
        
        # Scale to 0-10 range - high-volume severe incident cases should hit near max
        # Example: 46 SEV1 incidents × 12.0 weight = 552 severity impact points
        # Scale: 100+ points should be near maximum (8-10)
        if total_severity_impact >= 200:  # Very high severity load
            escalation_score = 9.0 + min(1.0, (total_severity_impact - 200) / 300)
        elif total_severity_impact >= 100:  # High severity load  
            escalation_score = 7.0 + ((total_severity_impact - 100) / 100) * 2
        elif total_severity_impact >= 50:   # Moderate severity load
            escalation_score = 4.0 + ((total_severity_impact - 50) / 50) * 3
        else:  # Low severity load
            escalation_score = min(4.0, total_severity_impact / 12.5)
            
        logger.info(f"Work burnout OCB: {total_incidents} incidents, "
                        f"severity_impact={total_severity_impact}, escalation_score={escalation_score}")
        
        # Remove the old logic below and use the new severity-weighted calculation
        # high_severity_count = severity_dist.get("high", 0) + severity_dist.get("critical", 0)
        # total_incidents = sum(severity_dist.values()) if severity_dist else 1
        # escalation_rate = high_severity_count / max(total_incidents, 1)
        # escalation_score = min(10, escalation_rate * 10)
        
        # Use only REAL data - calculate based on actual incident patterns
        # Response time variability (higher = more stress)
        art = metrics.get("avg_response_time_minutes", 0)
        art = float(art) if art is not None else 0.0
        response_stress = min(10, art / 30) if art > 0 else 0  # Scale based on 30min target
        
        # Incident volume stress 
        incidents_per_week = metrics.get("incidents_per_week", 0)
        incidents_per_week = float(incidents_per_week) if incidents_per_week is not None else 0.0
        volume_stress = min(10, incidents_per_week * 1.5)  # More incidents = more work stress
        
        # Use real metrics only
        return (escalation_score * 0.4 + response_stress * 0.3 + volume_stress * 0.3)
    
    def _calculate_accomplishment_burnout_ocb(self, metrics: Dict[str, Any]) -> float:
        """Calculate Accomplishment Burnout from incident data using OCB methodology (0-10 scale)."""
        # Use REAL data only - calculate based on actual performance
        # Resolution effectiveness based on incident data
        total_incidents = metrics.get("total_incidents", 0) 
        incidents_per_week = metrics.get("incidents_per_week", 0)
        incidents_per_week = float(incidents_per_week) if incidents_per_week is not None else 0.0
        
        # Higher incident load = lower sense of accomplishment
        workload_impact = min(10, incidents_per_week * 2)  # Inverse relationship
        
        # Severity handling capability (higher complexity handled = better accomplishment)
        severity_dist = metrics.get("severity_distribution", {}) or {}
        high_severity_count = severity_dist.get("high", 0) + severity_dist.get("critical", 0)
        total_incidents = sum(severity_dist.values()) if severity_dist else 1
        high_severity_rate = high_severity_count / max(total_incidents, 1)
        complexity_handling = high_severity_rate * 10  # Higher complexity handled = higher accomplishment
        
        # Response time as performance indicator
        art = metrics.get("avg_response_time_minutes", 0)
        art = float(art) if art is not None else 0.0
        response_performance = max(0, 10 - (art / 30)) if art > 0 else 5  # Better response = higher accomplishment
        
        # Real accomplishment calculation (lower = better sense of accomplishment)
        return (workload_impact * 0.5 + complexity_handling * 0.3 + (10 - response_performance) * 0.2)
    
    def _calculate_on_call_burden(self, user_email: str, shifts: List[Dict[str, Any]], 
                                total_team_size: int) -> float:
        """
        Calculate on-call burden score based on research findings.
        Returns base stress score (15-25 points) for being on-call during analysis period.
        """
        if not shifts or not user_email:
            return 0.0
            
        # Check if this user was actually on-call during the analysis period
        user_shifts = [shift for shift in shifts if 
                      shift.get('user', {}).get('email', '').lower() == user_email.lower()]
        
        if not user_shifts:
            return 0.0  # User wasn't on-call during this period
            
        from backend.app.core.burnout_config import BurnoutConfig
        config = BurnoutConfig()
        
        # Calculate shift frequency to determine base stress level
        total_shift_hours = 0
        for shift in user_shifts:
            start_time = shift.get('start_time')
            end_time = shift.get('end_time')
            if start_time and end_time:
                try:
                    from datetime import datetime
                    start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                    end = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
                    hours = (end - start).total_seconds() / 3600
                    total_shift_hours += hours
                except:
                    # Fallback: assume 8-hour shift
                    total_shift_hours += 8
                    
        # Estimate rotation frequency based on total hours
        days_in_period = 30  # Analysis period
        hours_per_week = (total_shift_hours / days_in_period) * 7
        
        if hours_per_week >= 40:  # Weekly rotation or more
            base_stress = config.ON_CALL_BURDEN['base_stress']['weekly_rotation']
        elif hours_per_week >= 20:  # Bi-weekly rotation  
            base_stress = config.ON_CALL_BURDEN['base_stress']['bi_weekly_rotation']
        else:  # Monthly rotation
            base_stress = config.ON_CALL_BURDEN['base_stress']['monthly_rotation']
            
        # Apply team size modifier (smaller teams = higher individual burden)
        if total_team_size < 5:
            team_modifier = config.ON_CALL_BURDEN['team_size_modifiers']['understaffed']
        elif total_team_size < 8:
            team_modifier = config.ON_CALL_BURDEN['team_size_modifiers']['minimal']
        else:
            team_modifier = config.ON_CALL_BURDEN['team_size_modifiers']['adequate']
            
        final_score = base_stress * team_modifier
        
        logger.info(f"On-call burden for {user_email}: {len(user_shifts)} shifts, "
                        f"{total_shift_hours:.1f}h total, base={base_stress}, "
                        f"team_modifier={team_modifier}, final={final_score}")
        
        return final_score

    def _calculate_burnout_factors(self, metrics: Dict[str, Any]) -> Dict[str, float]:
        """Calculate individual burnout factors for UI display."""
        # Calculate factors that properly reflect incident load
        incidents_per_week = metrics.get("incidents_per_week", 0)
        if incidents_per_week is None:
            incidents_per_week = 0
        incidents_per_week = float(incidents_per_week) if incidents_per_week is not None else 0.0
        
        # Workload factor based on incident frequency (more direct)
        # Scale: 0-2 incidents/week = 0-3, 2-5 = 3-7, 5-8 = 7-10, 8+ = 10
        if incidents_per_week <= 2:
            workload = incidents_per_week * 1.5
        elif incidents_per_week <= 5:
            workload = 3 + ((incidents_per_week - 2) / 3) * 4 if incidents_per_week >= 2 else 3
        elif incidents_per_week <= 8:
            workload = 7 + ((incidents_per_week - 5) / 3) * 3 if incidents_per_week >= 5 else 7
        else:
            workload = 10
        
        # After hours factor - ensure numeric value
        after_hours_pct = metrics.get("after_hours_percentage", 0)
        after_hours_pct = float(after_hours_pct) if after_hours_pct is not None else 0.0
        after_hours = min(10, after_hours_pct * 20)
        
        # Weekend work factor - ensure numeric value
        weekend_pct = metrics.get("weekend_percentage", 0)
        weekend_pct = float(weekend_pct) if weekend_pct is not None else 0.0
        weekend_work = min(10, weekend_pct * 25)
        
        # REMOVED incident_load factor - was duplicate of workload factor
        # Both were calculated from incidents_per_week, causing double-counting
        
        # Response time factor - based on actual response times (backward compatibility)
        response_time_mins = metrics.get("avg_response_time_minutes", 0)
        response_time_mins = float(response_time_mins) if response_time_mins is not None else 0.0
        response_time = min(10, response_time_mins / 6) if response_time_mins and response_time_mins >= 0 else 0.0

        # Incident load factor - severity-weighted total burden
        # Uses actual severity weights: Critical=4, High=3, Medium=2, Low=1
        severity_weighted_per_week = metrics.get("severity_weighted_incidents_per_week", 0)
        if severity_weighted_per_week > 0:
            # Scale based on severity-weighted load
            incident_load = min(10, severity_weighted_per_week * 0.6)
        else:
            # Fallback: use frequency with higher scaling for missing severity data
            incident_load = min(10, incidents_per_week * 1.8) if incidents_per_week > 0 else 0.0

        factors = {
            "workload": workload,
            "after_hours": after_hours,
            "weekend_work": weekend_work,
            "response_time": response_time,
            "incident_load": incident_load
        }
        
        return {k: round(v, 2) for k, v in factors.items()}

    def _calculate_compound_trauma_factor(self, critical_incident_count: int) -> float:
        """
        Calculate compound trauma factor based on research showing exponential psychological impact.

        Research basis: Multiple critical incidents create compound trauma, not just additive impact.
        - 5-10 critical incidents: 10% compound effect
        - 10+ critical incidents: 15% compound effect per additional incident (capped at 2.0x)

        Args:
            critical_incident_count: Number of SEV0/SEV1 incidents

        Returns:
            Compound factor (1.0-2.0)
        """
        if critical_incident_count < 5:
            return 1.0  # No compound effect for low counts
        elif critical_incident_count <= 10:
            # Moderate compound effect: 10% increase
            return 1.0 + (critical_incident_count - 5) * 0.02  # 10% over 5 incidents
        else:
            # High compound effect: 15% per additional incident, capped at 2.0x
            base_compound = 1.1  # 10% for first 10 incidents
            additional_compound = (critical_incident_count - 10) * 0.15
            return min(2.0, base_compound + additional_compound)

    def _calculate_time_impact_multipliers(self, incidents: List[Dict], metrics: Dict, user_tz: str) -> Dict[str, float]:
        """
        Calculate time-based impact multipliers based on research.

        Research shows timing dramatically affects psychological impact:
        - After-hours: 40% higher impact
        - Weekend: 60% higher impact
        - Overnight: 80% higher impact

        Returns:
            Dict with multiplier factors and counts
        """
        time_impacts = {
            'after_hours_multiplier': 1.4,
            'weekend_multiplier': 1.6,
            'overnight_multiplier': 1.8,
            'after_hours_incidents': 0,
            'weekend_incidents': 0,
            'overnight_incidents': 0
        }

        for incident in incidents:
            incident_time = self._parse_incident_time(incident, user_tz)
            if not incident_time:
                continue

            hour = incident_time.hour
            weekday = incident_time.weekday()

            # After hours: before 9 AM or 6 PM and later (using standard constants)
            if hour < BUSINESS_HOURS_START or hour >= BUSINESS_HOURS_END:
                time_impacts['after_hours_incidents'] += 1

            # Weekend: Saturday (5) or Sunday (6)
            if weekday >= 5:
                time_impacts['weekend_incidents'] += 1

            # Overnight: 10 PM to 6 AM (using standard constants for late night)
            if hour >= LATE_NIGHT_START or hour <= LATE_NIGHT_END:
                time_impacts['overnight_incidents'] += 1

        return time_impacts

    def _calculate_recovery_deficit(self, incidents: List[Dict], user_tz: str) -> Dict[str, Any]:
        """
        Calculate recovery time deficit based on research.

        Research: Recovery periods <48 hours prevent psychological restoration.

        Returns:
            Dict with recovery analysis
        """
        recovery_data = {
            'recovery_violations': 0,
            'avg_recovery_hours': 0,
            'min_recovery_hours': float('inf'),
            'recovery_score': 0  # 0-100, higher = better recovery
        }

        incident_times = []
        for incident in incidents:
            incident_time = self._parse_incident_time(incident, user_tz)
            if incident_time:
                incident_times.append(incident_time)

        if len(incident_times) < 2:
            recovery_data['recovery_score'] = 100  # Perfect recovery with few incidents
            return recovery_data

        # Sort by time
        incident_times.sort()

        recovery_periods = []
        for i in range(1, len(incident_times)):
            time_diff = incident_times[i] - incident_times[i-1]
            hours_between = time_diff.total_seconds() / 3600
            recovery_periods.append(hours_between)

            if hours_between < 48:  # Less than 48 hours recovery
                recovery_data['recovery_violations'] += 1

            if hours_between < recovery_data['min_recovery_hours']:
                recovery_data['min_recovery_hours'] = hours_between

        if recovery_periods:
            recovery_data['avg_recovery_hours'] = sum(recovery_periods) / len(recovery_periods)

            # Recovery score: higher is better
            # Perfect score (100) for avg 168+ hours (1 week)
            # Zero score for avg <24 hours
            avg_hours = recovery_data['avg_recovery_hours']
            recovery_data['recovery_score'] = min(100, max(0, (avg_hours - 24) / (168 - 24) * 100))

        return recovery_data

    def _parse_incident_time(self, incident: Dict, user_tz: str) -> datetime:
        """Parse incident timestamp from platform-specific format."""
        try:
            if self.platform == "pagerduty":
                # PagerDuty format: "2024-09-25T14:30:00Z"
                time_str = incident.get("created_at")
            else:
                # Rootly format
                attrs = incident.get("attributes", {})
                time_str = attrs.get("created_at")
            tz_utc =  self._parse_iso_utc(time_str)
            if not tz_utc:
                return None
            tz_local =  self._to_local(tz_utc, user_tz)

            # # For testing purposes, uncomment to view
            # print("UTC TIMEZONE:", tz_utc)
            # print("LOCAL TIMEZONE:", tz_local, " for the time zone: ", user_tz)
            return tz_local
        except Exception as e:
            logger.warning(f"Failed to parse incident time: {e}")
        return None

    def _calculate_burnout_score(self, factors: Dict[str, float]) -> float:
        """Calculate overall burnout score using three-factor methodology."""
        # First get the metrics to calculate proper dimensions
        # For now, we'll use the factors to approximate dimensions
        
        # Emotional Exhaustion - workload and time pressure
        emotional_exhaustion = (factors.get("workload", 0) * 0.5 +
                              factors.get("after_hours", 0) * 0.3 +
                              factors.get("incident_load", 0) * 0.2)

        # Depersonalization/Cynicism - stress response and withdrawal
        depersonalization = (factors.get("response_time", 0) * 0.5 +
                           factors.get("weekend_work", 0) * 0.5)

        # Personal Accomplishment (inverted) - effectiveness under pressure
        personal_accomplishment = 10 - (factors.get("response_time", 0) * 0.4 +
                                       factors.get("incident_load", 0) * 0.6)
        personal_accomplishment = max(0, personal_accomplishment)
        
        # Calculate final score using equal weights
        # Ensure personal accomplishment is properly bounded to prevent negative scores
        pa_score = min(10, max(0, personal_accomplishment))
        burnout_score = (emotional_exhaustion * 0.4 + 
                        depersonalization * 0.3 + 
                        (10 - pa_score) * 0.3)
        
        # Ensure overall score is never negative
        return max(0, burnout_score)
    
    def _determine_risk_level(self, burnout_score: float) -> str:
        """Determine risk level based on burnout score using standardized thresholds."""
        from ..core.burnout_config import determine_risk_level
        return determine_risk_level(burnout_score)
    
    def _calculate_team_health(self, member_analyses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate overall team health metrics."""
        logger.info(f"🏥 TEAM_HEALTH: Calculating health for {len(member_analyses)} team members")
        
        # Log member details for debugging
        if member_analyses:
            member_names = []
            for member in member_analyses[:10]:  # Log first 10 members
                if member and isinstance(member, dict):
                    name = member.get("name", "Unknown")
                    email = member.get("email", "no-email")
                    member_names.append(f"{name} ({email})")
            logger.info(f"🏥 TEAM_HEALTH: Members being analyzed: {', '.join(member_names)}{'...' if len(member_analyses) > 10 else ''}")
        
        if not member_analyses:
            logger.warning(f"🏥 TEAM_HEALTH: No member analyses provided, returning neutral baseline")
            return {
                "overall_score": 6.5,  # Neutral baseline if no data (not perfect health)
                "risk_distribution": {"low": 0, "medium": 0, "high": 0},
                "average_burnout_score": 0,
                "health_status": "fair",
                "members_at_risk": 0
            }
        
        # Calculate averages and distributions with null safety
        members_with_incidents = [m for m in member_analyses if m and isinstance(m, dict) and m.get("incident_count", 0) > 0]
        
        # CRITICAL FIX: Only include members with incidents OR who were on-call in team score calculation
        # This prevents dilution from inactive team members
        eligible_members = members_with_incidents  # Only those with actual incident activity
        logger.info(f"🏥 TEAM_HEALTH: Filtering to {len(eligible_members)} members with incidents (from {len(member_analyses)} total)")
        
        # Calculate average burnout for ELIGIBLE members only - prioritize OCB scores when available  
        ocb_scores = [m.get("ocb_score") for m in eligible_members if m and isinstance(m, dict) and m.get("ocb_score") is not None]
        
        if ocb_scores and len(ocb_scores) > 0:
            # Use OCB scores (0-100 scale where higher = more burnout)
            avg_burnout = sum(ocb_scores) / len(ocb_scores)
            using_ocb = True
            logger.info(f"Team health calculation using OCB scores: avg={avg_burnout:.1f}, count={len(ocb_scores)}")
        else:
            # Fallback to legacy burnout scores (0-10 scale where higher = more burnout)
            legacy_scores = [m.get("burnout_score", 0) for m in eligible_members if m and isinstance(m, dict) and m.get("burnout_score") is not None]
            avg_burnout = sum(legacy_scores) / len(legacy_scores) if legacy_scores and len(legacy_scores) > 0 else 0
            using_ocb = False
            logger.info(f"Team health calculation using legacy scores: avg={avg_burnout:.1f}, count={len(legacy_scores)}")
        
        # Count risk levels (updated for 4-tier system) - ONLY include eligible members with incidents
        risk_dist = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        for member in eligible_members:
            if member and isinstance(member, dict):
                risk_level = member.get("risk_level", "low")
                if risk_level in risk_dist:
                    risk_dist[risk_level] += 1
                else:
                    risk_dist["low"] += 1
        
        # Calculate overall health score using appropriate scale
        if using_ocb:
            # OCB scoring (0-100 where higher = more burnout)
            # Store raw OCB score as overall_score for frontend consumption
            overall_score = avg_burnout
            logger.info(f"Using raw OCB score as overall_score: {overall_score}")
        else:
            # Legacy scoring - convert 0-10 burnout to 0-10 health scale (inverse)
            overall_score = 10 - avg_burnout
            overall_score = max(0, overall_score)
            logger.info(f"Using legacy health calculation: burnout={avg_burnout} -> health={overall_score}")
        
        # Determine health status based on scoring method
        if using_ocb:
            # OCB scoring (0-100 where higher = more burnout)
            if overall_score < 25:
                health_status = "excellent"  # Low/minimal burnout
            elif overall_score < 50:
                health_status = "good"       # Mild burnout symptoms  
            elif overall_score < 75:
                health_status = "fair"       # Moderate burnout risk
            else:
                health_status = "poor"       # High/severe burnout risk
            logger.info(f"OCB health status: score={overall_score} -> {health_status}")
        else:
            # Legacy scoring (0-10 health scale where higher = better health)
            if overall_score >= 9:  # 90%+
                health_status = "excellent"
            elif overall_score >= 8:  # 80-89%
                health_status = "good"
            elif overall_score >= 7:  # 70-79%
                health_status = "fair"
            elif overall_score >= 6:  # 60-69%
                health_status = "poor"
            else:  # <60%
                health_status = "critical"
            logger.info(f"Legacy health status: score={overall_score} -> {health_status}")
        
        return {
            "overall_score": round(overall_score, 2),
            "scoring_method": "OCB" if using_ocb else "Legacy",
            "risk_distribution": risk_dist,
            "average_burnout_score": round(avg_burnout, 2),
            "health_status": health_status,
            "members_at_risk": risk_dist["high"] + risk_dist["critical"]
        }
    
    def _generate_insights(
        self, 
        team_analysis: Dict[str, Any], 
        team_health: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generate insights from the analysis."""
        insights = []
        members = team_analysis.get("members", []) if team_analysis else []
        
        # Team-level insights with null safety
        members_at_risk = team_health.get("members_at_risk", 0) if team_health else 0
        if members_at_risk > 0:
            insights.append({
                "type": "warning",
                "category": "team",
                "message": f"{members_at_risk} team members are at high burnout risk",
                "priority": "high"
            })
        
        # Find common patterns
        if members:
            # High after-hours work
            high_after_hours = [m for m in members if m["metrics"]["after_hours_percentage"] > 0.3]
            if len(high_after_hours) >= len(members) * 0.3:
                insights.append({
                    "type": "pattern",
                    "category": "after_hours",
                    "message": f"{len(high_after_hours)} team members have >30% after-hours incidents",
                    "priority": "high"
                })
            
            # Weekend work patterns
            high_weekend = [m for m in members if m["metrics"]["weekend_percentage"] > 0.2]
            if len(high_weekend) >= len(members) * 0.25:
                insights.append({
                    "type": "pattern",
                    "category": "weekend_work",
                    "message": f"{len(high_weekend)} team members regularly handle weekend incidents",
                    "priority": "medium"
                })
            
            # Response time issues
            slow_response = [m for m in members if m["metrics"]["avg_response_time_minutes"] > 45]
            if slow_response:
                insights.append({
                    "type": "metric",
                    "category": "response_time",
                    "message": f"{len(slow_response)} team members have average response times >45 minutes",
                    "priority": "medium"
                })
        
        return insights
    
    def _generate_recommendations(
        self, 
        team_health: Dict[str, Any], 
        team_analysis: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generate actionable recommendations based on burnout research methodology."""
        recommendations = []
        members = team_analysis.get("members", []) if team_analysis else []
        
        # Team health recommendations with null safety
        health_status = team_health.get("health_status", "unknown") if team_health else "unknown"
        members_at_risk = team_health.get("members_at_risk", 0) if team_health else 0
        
        if health_status in ["poor", "fair"]:
            recommendations.append({
                "type": "organizational",
                "priority": "high",
                "message": "Consider implementing or reviewing on-call rotation schedules to distribute load more evenly"
            })
        
        if members_at_risk > 0:
            recommendations.append({
                "type": "interpersonal", 
                "priority": "high",
                "message": f"Schedule 1-on-1s with the {members_at_risk} team members at high risk"
            })
        
        # Pattern-based recommendations
        if members:
            # After-hours pattern with comprehensive null safety
            after_hours_values = []
            try:
                for m in members:
                    if m and isinstance(m, dict):
                        try:
                            metrics = m.get("metrics")
                            if metrics and isinstance(metrics, dict):
                                after_hours = metrics.get("after_hours_percentage", 0)
                                if isinstance(after_hours, (int, float)):
                                    after_hours_values.append(after_hours)
                        except Exception as e:
                            logger.debug(f"Error extracting after_hours_percentage: {e}")
                            continue
            except Exception as e:
                logger.warning(f"Error processing after_hours patterns: {e}")
                after_hours_values = []
            avg_after_hours = sum(after_hours_values) / len(after_hours_values) if after_hours_values and len(after_hours_values) > 0 else 0
            if avg_after_hours > 0.25:
                recommendations.append({
                    "type": "emotional_exhaustion",
                    "priority": "high",
                    "message": "Implement follow-the-sun support or adjust business hours coverage"
                })
            
            # Weekend pattern with comprehensive null safety
            weekend_values = []
            try:
                for m in members:
                    if m and isinstance(m, dict):
                        try:
                            metrics = m.get("metrics")
                            if metrics and isinstance(metrics, dict):
                                weekend_pct = metrics.get("weekend_percentage", 0)
                                if isinstance(weekend_pct, (int, float)):
                                    weekend_values.append(weekend_pct)
                        except Exception as e:
                            logger.debug(f"Error extracting weekend_percentage: {e}")
                            continue
            except Exception as e:
                logger.warning(f"Error processing weekend patterns: {e}")
                weekend_values = []
            avg_weekend = sum(weekend_values) / len(weekend_values) if weekend_values and len(weekend_values) > 0 else 0
            if avg_weekend > 0.15:
                recommendations.append({
                    "type": "emotional_exhaustion", 
                    "priority": "medium",
                    "message": "Review weekend on-call compensation and rotation frequency"
                })
            
            # Workload distribution
            workload_variance = self._calculate_workload_variance(members)
            if workload_variance > 0.5:
                recommendations.append({
                    "type": "depersonalization",
                    "priority": "medium", 
                    "message": "Incident load is unevenly distributed - consider load balancing strategies"
                })
            
            # Response time with comprehensive null safety
            response_values = []
            try:
                for m in members:
                    if m and isinstance(m, dict):
                        try:
                            metrics = m.get("metrics")
                            if metrics and isinstance(metrics, dict):
                                response_time = metrics.get("avg_response_time_minutes", 0)
                                if isinstance(response_time, (int, float)) and response_time > 0:
                                    response_values.append(response_time)
                        except Exception as e:
                            logger.debug(f"Error extracting avg_response_time_minutes: {e}")
                            continue
            except Exception as e:
                logger.warning(f"Error processing response time patterns: {e}")
                response_values = []
            avg_response = sum(response_values) / len(response_values) if response_values and len(response_values) > 0 else 0
            if avg_response > 30:
                recommendations.append({
                    "type": "personal_accomplishment",
                    "priority": "medium",
                    "message": "Review alerting and escalation procedures to improve response times"
                })
        
        # Include research-based recommendations
        if health_status in ["excellent", "good"]:
            recommendations.append({
                "type": "personal_accomplishment",
                "priority": "low", 
                "message": "Continue current practices and monitor for changes in team health metrics"
            })
        
        # Add specific dimension-based recommendations
        if members:
            high_burnout_members = [m for m in members if m.get("burnout_score", 0) >= 7.0]
            if high_burnout_members:
                recommendations.append({
                    "type": "emotional_exhaustion",
                    "priority": "high",
                    "message": "Provide stress management training and consider workload redistribution for high-burnout individuals"
                })
                
        # Add organizational support recommendations
        if members and len(members) > 0 and members_at_risk > len(members) * 0.3:  # If more than 30% are at risk
            recommendations.append({
                "type": "organizational",
                "priority": "high", 
                "message": "Consider organizational changes: flexible schedules, mental health resources, and burnout prevention programs"
            })
        
        return recommendations
    
    
    def _calculate_response_time(self, created_at: str, started_at: str, user_tz: str) -> Optional[float]:
        """Calculate response time in minutes."""
        created = self._to_local(self._parse_iso_utc(created_at), user_tz)
        started = self._to_local(self._parse_iso_utc(started_at), user_tz)

        if created and started:
            return (started - created).total_seconds() / 60
        return None
    
    def _calculate_workload_variance(self, members: List[Dict[str, Any]]) -> float:
        """Calculate variance in workload distribution."""
        if not members:
            return 0
        
        incident_counts = [m.get("incident_count", 0) for m in members if m and isinstance(m, dict)]
        if not incident_counts:
            return 0
        
        mean = sum(incident_counts) / len(incident_counts) if incident_counts and len(incident_counts) > 0 else 0
        variance = sum((x - mean) ** 2 for x in incident_counts) / len(incident_counts) if incident_counts and len(incident_counts) > 0 else 0
        
        # Normalize by mean to get coefficient of variation
        return variance / mean if mean and mean > 0 and variance is not None and mean is not None else 0
    
    def _calculate_github_insights(self, github_data: Dict[str, Dict]) -> Dict[str, Any]:
        """Calculate aggregated GitHub insights from team data."""
        if not github_data:
            return {
                "total_users_analyzed": 0,
                "avg_commits_per_week": 0,
                "avg_prs_per_week": 0,
                "after_hours_activity_rate": 0,
                "weekend_activity_rate": 0,
                "top_contributors": [],
                "burnout_indicators": {
                    "excessive_commits": 0,
                    "after_hours_coding": 0,
                    "weekend_work": 0,
                    "large_prs": 0
                }
            }
        
        users_with_data = len(github_data)
        all_metrics = [data.get("metrics", {}) for data in github_data.values()]
        
        # Calculate averages
        total_commits_per_week = sum(m.get("commits_per_week", 0) for m in all_metrics)
        total_prs_per_week = sum(m.get("prs_per_week", 0) for m in all_metrics)
        
        avg_commits_per_week = total_commits_per_week / users_with_data if users_with_data and users_with_data > 0 else 0
        avg_prs_per_week = total_prs_per_week / users_with_data if users_with_data and users_with_data > 0 else 0
        
        # Calculate after-hours and weekend rates
        after_hours_rates = [m.get("after_hours_commit_percentage", 0) for m in all_metrics]
        weekend_rates = [m.get("weekend_commit_percentage", 0) for m in all_metrics]
        
        avg_after_hours_rate = sum(after_hours_rates) / len(after_hours_rates) if after_hours_rates and len(after_hours_rates) > 0 else 0
        avg_weekend_rate = sum(weekend_rates) / len(weekend_rates) if weekend_rates and len(weekend_rates) > 0 else 0
        
        # Count burnout indicators
        burnout_counts = {
            "excessive_commits": 0,
            "after_hours_coding": 0,
            "weekend_work": 0,
            "large_prs": 0
        }
        
        # Track high-risk members for validation
        high_risk_github_members = []
        
        for email, data in github_data.items():
            indicators = data.get("burnout_indicators", {})
            has_high_risk_indicator = False
            
            for key in burnout_counts:
                if indicators.get(key, False):
                    burnout_counts[key] += 1
                    has_high_risk_indicator = True
                    logger.info(f"GitHub high-risk indicator '{key}' detected for {email}")
            
            # Track members with any high-risk GitHub indicator
            if has_high_risk_indicator:
                high_risk_github_members.append({
                    "email": email,
                    "username": data.get("username", ""),
                    "indicators": {k: v for k, v in indicators.items() if v}
                })
        
        # Log total high-risk GitHub members for validation
        logger.info(f"GitHub high-risk members count: {len(high_risk_github_members)}")
        logger.info(f"GitHub burnout indicator counts: {burnout_counts}")
        
        # Top contributors (top 5 by commits)
        contributors = []
        for email, data in github_data.items():
            metrics = data.get("metrics", {})
            contributors.append({
                "email": email,
                "username": data.get("username", ""),
                "commits_per_week": metrics.get("commits_per_week", 0),
                "total_commits": metrics.get("total_commits", 0)
            })
        
        top_contributors = sorted(contributors, key=lambda x: x["total_commits"], reverse=True)[:5]
        
        # Calculate totals for the team
        total_commits = sum(m.get("total_commits", 0) for m in all_metrics)
        total_prs = sum(m.get("total_pull_requests", 0) for m in all_metrics)
        total_reviews = sum(m.get("total_reviews", 0) for m in all_metrics)
        
        return {
            "total_users_analyzed": users_with_data,
            "total_commits": total_commits,
            "total_pull_requests": total_prs,
            "total_reviews": total_reviews,
            "avg_commits_per_week": round(avg_commits_per_week, 2),
            "avg_prs_per_week": round(avg_prs_per_week, 2),
            "after_hours_activity_rate": round(avg_after_hours_rate, 3),
            "after_hours_activity_percentage": round(avg_after_hours_rate * 100, 1),  # Frontend expects percentage
            "weekend_activity_rate": round(avg_weekend_rate, 3),
            "weekend_activity_percentage": round(avg_weekend_rate * 100, 1),  # Frontend expects percentage
            "weekend_commit_percentage": round(avg_weekend_rate * 100, 1),  # Alternative field name for frontend
            "top_contributors": top_contributors,
            "burnout_indicators": {
                "excessive_commits": burnout_counts.get("excessive_commits", 0),
                "after_hours_coding": burnout_counts.get("after_hours_coding", 0),
                "weekend_work": burnout_counts.get("weekend_work", 0),
                "large_prs": burnout_counts.get("large_prs", 0),
                # Frontend specific field names
                "excessive_late_night_commits": burnout_counts.get("after_hours_coding", 0),
                "weekend_workers": burnout_counts.get("weekend_work", 0),
                "large_pr_pattern": burnout_counts.get("large_prs", 0)
            },
            # Add high-risk member details for validation
            "high_risk_members": high_risk_github_members,
            "high_risk_member_count": len(high_risk_github_members)
        }
    
    def _calculate_slack_insights(self, slack_data: Dict[str, Dict]) -> Dict[str, Any]:
        """Calculate aggregated Slack insights from team data."""
        if not slack_data:
            return {
                "total_users_analyzed": 0,
                "avg_messages_per_day": 0,
                "avg_response_time_minutes": 0,
                "after_hours_messaging_rate": 0,
                "weekend_messaging_rate": 0,
                "avg_sentiment_score": 0,
                "channels_analyzed": 0,
                "burnout_indicators": {
                    "excessive_messaging": 0,
                    "poor_sentiment": 0,
                    "late_responses": 0,
                    "after_hours_activity": 0
                }
            }
        
        users_with_data = len(slack_data)
        all_metrics = [data.get("metrics", {}) for data in slack_data.values()]
        
        # Calculate averages
        total_messages_per_day = sum(m.get("messages_per_day", 0) for m in all_metrics)
        total_response_times = [m.get("avg_response_time_minutes", 0) for m in all_metrics if m.get("avg_response_time_minutes", 0) > 0]
        
        avg_messages_per_day = total_messages_per_day / users_with_data if users_with_data and users_with_data > 0 else 0
        avg_response_time = sum(total_response_times) / len(total_response_times) if total_response_times and len(total_response_times) > 0 else 0
        
        # Calculate after-hours and weekend rates
        after_hours_rates = [m.get("after_hours_percentage", 0) for m in all_metrics]
        weekend_rates = [m.get("weekend_percentage", 0) for m in all_metrics]
        sentiment_scores = [m.get("avg_sentiment", 0) for m in all_metrics]
        
        avg_after_hours_rate = sum(after_hours_rates) / len(after_hours_rates) if after_hours_rates and len(after_hours_rates) > 0 else 0
        avg_weekend_rate = sum(weekend_rates) / len(weekend_rates) if weekend_rates and len(weekend_rates) > 0 else 0
        avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores and len(sentiment_scores) > 0 else 0
        
        # Count unique channels
        all_channels = set()
        for data in slack_data.values():
            metrics = data.get("metrics", {})
            channel_count = metrics.get("channel_diversity", 0)
            # This is an approximation since we don't have actual channel IDs
            all_channels.add(f"user_{data.get('user_id', '')}_channels_{channel_count}")
        
        # Count burnout indicators
        burnout_counts = {
            "excessive_messaging": 0,
            "poor_sentiment": 0,
            "late_responses": 0,
            "after_hours_activity": 0
        }
        
        for data in slack_data.values():
            indicators = data.get("burnout_indicators", {})
            for key in burnout_counts:
                if indicators.get(key, False):
                    burnout_counts[key] += 1
        
        # Calculate totals for the team
        total_messages = sum(m.get("total_messages", 0) for m in all_metrics)
        total_channels = sum(m.get("channel_diversity", 0) for m in all_metrics)
        
        return {
            "total_users_analyzed": users_with_data,
            "total_messages": total_messages,
            "active_channels": total_channels,
            "avg_messages_per_day": round(avg_messages_per_day, 1),
            "avg_response_time_minutes": round(avg_response_time, 1),
            "after_hours_messaging_rate": round(avg_after_hours_rate, 3),
            "after_hours_activity_percentage": round(avg_after_hours_rate * 100, 1),  # Frontend expects percentage
            "weekend_messaging_rate": round(avg_weekend_rate, 3),
            "avg_sentiment_score": round(avg_sentiment, 3),
            "channels_analyzed": len(all_channels),
            "sentiment_analysis": {
                "overall_sentiment": "positive" if avg_sentiment > 0.1 else "neutral" if avg_sentiment > -0.1 else "negative",
                "sentiment_score": round(avg_sentiment, 3),
                "positive_ratio": round(sum(m.get("positive_sentiment_ratio", 0) for m in all_metrics) / users_with_data, 3) if users_with_data and users_with_data > 0 else 0,
                "negative_ratio": round(sum(m.get("negative_sentiment_ratio", 0) for m in all_metrics) / users_with_data, 3) if users_with_data and users_with_data > 0 else 0
            },
            "burnout_indicators": {
                "excessive_messaging": burnout_counts.get("excessive_messaging", 0),
                "poor_sentiment": burnout_counts.get("poor_sentiment", 0),
                "late_responses": burnout_counts.get("late_responses", 0),
                "after_hours_activity": burnout_counts.get("after_hours_activity", 0)
            }
        }
    
    async def _enhance_with_ai_analysis(
        self, 
        analysis_result: Dict[str, Any], 
        available_integrations: List[str]
    ) -> Dict[str, Any]:
        """
        Enhance traditional analysis with AI-powered insights.
        
        Args:
            analysis_result: Result from traditional burnout analysis
            available_integrations: List of available data integrations
            
        Returns:
            Enhanced analysis with AI insights
        """
        try:
            # Get user's LLM token preference from context
            from .ai_burnout_analyzer import get_user_context
            from ..api.endpoints.llm import decrypt_token
            import os

            current_user = get_user_context()
            user_llm_token = None
            user_llm_provider = None

            # Check user's active token preference
            if current_user and hasattr(current_user, 'active_llm_token_source'):
                active_source = getattr(current_user, 'active_llm_token_source', 'system')

                # If user prefers custom token and has one stored, use it
                if active_source == 'custom' and current_user.has_llm_token():
                    try:
                        user_llm_token = decrypt_token(current_user.llm_token)
                        user_llm_provider = current_user.llm_provider
                        logger.info(f"Using user's custom {user_llm_provider} token for AI analysis")
                        ai_analyzer = get_ai_burnout_analyzer(api_key=user_llm_token, provider=user_llm_provider)
                    except Exception as e:
                        logger.warning(f"Failed to use custom token, falling back to system: {e}")
                        ai_analyzer = get_ai_burnout_analyzer()
                else:
                    # User prefers system token or no custom token available
                    logger.info(f"Using system token for AI analysis (user preference: {active_source})")
                    ai_analyzer = get_ai_burnout_analyzer()
            else:
                # No user context or preference, use system token
                logger.info("No user context, using system token for AI analysis")
                ai_analyzer = get_ai_burnout_analyzer()
            
            # Enhance each member analysis with null safety
            enhanced_members = []
            try:
                team_analysis = analysis_result.get("team_analysis") if analysis_result and isinstance(analysis_result, dict) else {}
                original_members = team_analysis.get("members") if team_analysis and isinstance(team_analysis, dict) else []
                if not isinstance(original_members, list):
                    original_members = []
                    logger.warning("original_members is not a list, using empty list")

                # DEBUG: Log member extraction
                logger.info(f"🔍 AI ENHANCEMENT DEBUG: analysis_result keys: {list(analysis_result.keys()) if analysis_result else 'None'}")
                logger.info(f"🔍 AI ENHANCEMENT DEBUG: team_analysis keys: {list(team_analysis.keys()) if team_analysis else 'None'}")
                logger.info(f"🔍 AI ENHANCEMENT DEBUG: original_members count: {len(original_members)}")
                if len(original_members) > 0:
                    logger.info(f"🔍 AI ENHANCEMENT DEBUG: First member keys: {list(original_members[0].keys())}")
            except Exception as e:
                logger.warning(f"Error extracting original_members: {e}")
                original_members = []

            for member in original_members:
                # Prepare member data for AI analysis
                member_data = {
                    "user_id": member.get("user_id"),
                    "user_name": member.get("user_name"), 
                    "incidents": self._format_incidents_for_ai(member),
                    "github_activity": member.get("github_activity"),
                    "slack_activity": member.get("slack_activity")
                }
                
                # Get AI enhancement
                enhanced_member = ai_analyzer.enhance_member_analysis(
                    member_data,
                    member,  # Traditional analysis
                    available_integrations
                )
                
                enhanced_members.append(enhanced_member)
            
            # Update members list
            if "team_analysis" not in analysis_result:
                analysis_result["team_analysis"] = {}
            analysis_result["team_analysis"]["members"] = enhanced_members
            
            # Generate team-level AI insights
            team_insights = ai_analyzer.generate_team_insights(
                enhanced_members,
                available_integrations
            )
            
            if team_insights.get("available"):
                analysis_result["ai_team_insights"] = team_insights
            
            # Add AI metadata
            analysis_result["ai_enhanced"] = True
            analysis_result["ai_enhancement_timestamp"] = datetime.utcnow().isoformat()
            
            logger.info(f"Successfully enhanced analysis with AI insights for {len(enhanced_members)} members")
            
        except Exception as e:
            logger.error(f"Failed to enhance analysis with AI: {e}")
            # Add error info but don't fail the main analysis
            analysis_result["ai_enhanced"] = False
            analysis_result["ai_error"] = str(e)
        
        return analysis_result
    
    def _format_incidents_for_ai(self, member_analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Format incident data for AI analysis.
        
        Args:
            member_analysis: Member analysis containing incident metrics
            
        Returns:
            List of incident dictionaries formatted for AI
        """
        # Since we don't store raw incident data in member analysis,
        # we'll create approximated incident data based on the metrics
        incidents = []
        
        # Extract basic metrics
        incident_count = member_analysis.get("incident_count", 0)
        factors = member_analysis.get("factors", {})
        metrics = member_analysis.get("metrics", {})
        
        # Create approximated incident entries based on patterns
        # This is a simplified approach - in a full implementation,
        # we'd want to store the raw incident data
        
        # Remove artificial incident generation to prevent flat-line health trends
        # The synthetic incidents were creating identical daily patterns causing
        # health scores to be consistently 7.8 (78%) instead of realistic variation
        
        # Return empty incidents list - AI analysis will work with metrics only
        logger.info(f"📊 DATA_INTEGRITY: Returning {incident_count} incident metrics without synthetic generation")
        
        return incidents

    def _generate_daily_trends(self, incidents: List[Dict[str, Any]], team_analysis: List[Dict[str, Any]], metadata: Dict[str, Any], team_health: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Generate daily trend data from incidents and team analysis - includes individual user daily tracking."""
        try:
            days_analyzed = metadata.get("days_analyzed", 30) or 30 if isinstance(metadata, dict) else 30
            
            # Initialize daily data structures - team level and individual level
            daily_data = {}
            individual_daily_data = {}  # New: track per-user daily data
            
            # PRE-INITIALIZE individual_daily_data with all team members
            # Also create user ID to email mapping for incident processing
            user_id_to_email = {}
            for user in team_analysis:
                if user.get('user_email') and user.get('user_id'):
                    user_key = user['user_email'].lower()
                    individual_daily_data[user_key] = {}
                    # Create ID to email mapping for incident processing
                    user_id_to_email[str(user['user_id'])] = user['user_email']
            
            logger.info(f"Created user ID mapping for {len(user_id_to_email)} users from {self.platform} team analysis")
            if len(user_id_to_email) <= 3:  # Show sample mappings for small teams
                logger.info(f"Sample mappings: {dict(list(user_id_to_email.items())[:3])}")
            
            # Pre-create all date entries for each user
            for user in team_analysis:
                if user.get('user_email'):
                    user_key = user['user_email'].lower()
                    # TODO: verify if correct - possibly add testcases
                    tzname = self._get_user_tz(user.get('user_id'), "UTC")
                    today_local = self._to_local(datetime.now(), tzname)
                    for day_offset in range(days_analyzed):
                        d = today_local - timedelta(days=days_analyzed - day_offset - 1)
                        date_str = d.date().isoformat()
                        individual_daily_data[user_key][date_str] = {
                            "date": date_str,
                            "incident_count": 0,
                            "severity_weighted_count": 0.0,
                            "after_hours_count": 0,
                            "weekend_count": 0,
                            "response_times": [],
                            "has_data": False,
                            "incidents": [],
                            "high_severity_count": 0,
                            # Enhanced severity breakdown
                            "severity_breakdown": {
                                "sev0": 0,     # Critical/Emergency (15.0 weight)
                                "sev1": 0,     # High/Critical (12.0 weight) 
                                "sev2": 0,     # Medium/High (6.0 weight)
                                "sev3": 0,     # Low/Medium (3.0 weight)
                                "low": 0       # Low (1.5 weight)
                            },
                            # Daily summary for tooltips
                            "daily_summary": {
                                "total_incidents": 0,
                                "highest_severity": None,
                                "after_hours_incidents": 0,
                                "weekend_work": False,
                                "peak_hour": None,
                                "incident_titles": []
                            }
                        }
            
            # Process incidents to populate daily data - only for days with incidents
            if incidents and isinstance(incidents, list):
                for incident in incidents:
                    try:
                        if not incident or not isinstance(incident, dict):
                            continue
                            
                        # Extract incident date - handle both Rootly and PagerDuty formats
                        created_at = None
                        if self.platform == "pagerduty":
                            created_at = incident.get("created_at")
                        else:  # Rootly
                            attrs = incident.get("attributes", {})
                            if attrs and isinstance(attrs, dict):
                                created_at = attrs.get("created_at")
                        
                        if not created_at:
                            continue
                            
                        # Parse date
                        try:
                            # TODO:double-check, possibly adjust timezone
                            incident_date_utc = self._parse_iso_utc(created_at)
                            tzname = self._get_user_tz(user.get('user_id'), "UTC")
                            incident_date = self._to_local(incident_date_utc, tzname)
                            if not incident_date:
                                continue

                            date_str = incident_date.strftime("%Y-%m-%d")

                            # Initialize day data if this is the first incident for this day
                            if date_str not in daily_data:
                                daily_data[date_str] = {
                                    "date": date_str,
                                    "incident_count": 0,
                                    "severity_weighted_count": 0.0,
                                    "after_hours_count": 0,
                                    "users_involved": set(),
                                    "high_severity_count": 0
                                }
                            
                            daily_data[date_str]["incident_count"] += 1
                            
                            # Add severity weight - handle both platforms (research-based psychological impact)
                            severity_weight = 1.5  # Updated baseline for low severity
                            if self.platform == "pagerduty":
                                urgency = incident.get("urgency", "low")
                                if urgency == "high":
                                    severity_weight = 12.0  # Life-defining events, executive involvement
                                    daily_data[date_str]["high_severity_count"] += 1
                            else:  # Rootly
                                attrs = incident.get("attributes", {})
                                severity_info = attrs.get("severity", {}) if attrs else {}
                                if isinstance(severity_info, dict) and "data" in severity_info:
                                    severity_data = severity_info.get("data", {})
                                    if isinstance(severity_data, dict) and "attributes" in severity_data:
                                        severity_attrs = severity_data["attributes"]
                                        severity_name = severity_attrs.get("name", "medium").lower()
                                        if "sev0" in severity_name:
                                            severity_weight = 15.0  # Life-defining events, PTSD risk, press attention
                                            daily_data[date_str]["high_severity_count"] += 1
                                        elif "critical" in severity_name or "sev1" in severity_name:
                                            severity_weight = 12.0  # Critical business impact, executive involvement
                                            daily_data[date_str]["high_severity_count"] += 1
                                        elif "high" in severity_name or "sev2" in severity_name:
                                            severity_weight = 6.0   # Significant user impact, team-wide response
                                            daily_data[date_str]["high_severity_count"] += 1
                                        elif "medium" in severity_name or "sev3" in severity_name:
                                            severity_weight = 3.0   # Moderate impact, standard response
                            
                            daily_data[date_str]["severity_weighted_count"] += severity_weight

                            # Check if after hours (using standard constants)
                            incident_hour = incident_date.hour
                            if incident_hour < BUSINESS_HOURS_START or incident_hour >= BUSINESS_HOURS_END:
                                daily_data[date_str]["after_hours_count"] += 1
                            
                            # Track users involved - handle both platforms
                            user_id = None
                            user_email = None
                            
                            if self.platform == "pagerduty":
                                # PagerDuty format - Use enhanced assignment extraction results
                                assigned_to = incident.get("assigned_to", {})
                                if assigned_to and isinstance(assigned_to, dict):
                                    user_id = assigned_to.get("id")
                                    user_email = assigned_to.get("email")
                                    
                                    # DEBUG: Log PagerDuty user mapping for first few incidents
                                    if user_id and len(daily_data) <= 3:
                                        assignment_method = assigned_to.get("assignment_method", "unknown")
                                        confidence = assigned_to.get("confidence", "unknown")
                                        if user_email:
                                            logger.info(f"✅ PagerDuty ENHANCED user mapped: {user_email} (ID: {user_id}) via {assignment_method} [{confidence}]")
                                        else:
                                            logger.warning(f"❌ PagerDuty ENHANCED user ID {user_id} has no email - method: {assignment_method}")
                                    
                                    if user_id:
                                        daily_data[date_str]["users_involved"].add(user_id)
                            else:  # Rootly
                                # Rootly format - Extract user ID and map to email
                                attrs = incident.get("attributes", {})
                                if attrs:
                                    user_info = attrs.get("user", {})
                                    if isinstance(user_info, dict) and "data" in user_info:
                                        user_data = user_info.get("data", {})
                                        user_id = user_data.get("id")
                                        # Use ID-to-email mapping instead of direct email extraction
                                        user_email = user_id_to_email.get(str(user_id)) if user_id else None
                                        if user_id:
                                            daily_data[date_str]["users_involved"].add(user_id)
                                            
                                        # DEBUG: Log user extraction for first few incidents
                                        if len(daily_data) <= 3:
                                            logger.debug(f"Processing incident for user {user_email} (ID: {user_id})")
                            
                            # Track individual user daily data - now updating pre-initialized structure
                            if user_email:
                                user_key = user_email.lower()
                                
                                # User should already exist in our pre-initialized structure
                                if user_key in individual_daily_data and date_str in individual_daily_data[user_key]:
                                    # Update the existing entry (already initialized with defaults)
                                    user_day_data = individual_daily_data[user_key][date_str]
                                    user_day_data["incident_count"] += 1
                                    user_day_data["severity_weighted_count"] += severity_weight
                                    user_day_data["has_data"] = True  # Mark as having real data
                                    
                                    # DEBUG: Log individual daily data updates for PagerDuty
                                    if self.platform == "pagerduty" and user_day_data["incident_count"] <= 2:
                                        logger.info(f"📊 PagerDuty daily update: {user_email} on {date_str} - incidents: {user_day_data['incident_count']}")
                                    
                                    # Enhanced daily summary data collection
                                    daily_summary = user_day_data["daily_summary"]
                                    daily_summary["total_incidents"] = user_day_data["incident_count"]

                                    # Track after-hours and weekend work (using standard constants)
                                    if incident_hour < BUSINESS_HOURS_START or incident_hour >= BUSINESS_HOURS_END:
                                        user_day_data["after_hours_count"] += 1
                                        daily_summary["after_hours_incidents"] = user_day_data["after_hours_count"]
                                    
                                    # Store weekend incidents
                                    if incident_date.weekday() >= 5:  # Saturday=5, Sunday=6
                                        user_day_data["weekend_count"] += 1
                                        daily_summary["weekend_work"] = True
                                    
                                    # Track incident titles and metadata
                                    incident_title = self._extract_incident_title(incident)
                                    if incident_title:
                                        if len(daily_summary["incident_titles"]) < 5:  # Limit to 5 titles
                                            daily_summary["incident_titles"].append(incident_title)
                                    
                                    # Track peak hour (most frequent incident hour)
                                    hour_key = f"{incident_hour:02d}:00"
                                    if "incident_hours" not in daily_summary:
                                        daily_summary["incident_hours"] = {}
                                    daily_summary["incident_hours"][hour_key] = daily_summary["incident_hours"].get(hour_key, 0) + 1
                                    
                                    # Update peak hour
                                    if daily_summary["incident_hours"]:
                                        peak_hour = max(daily_summary["incident_hours"], key=daily_summary["incident_hours"].get)
                                        daily_summary["peak_hour"] = peak_hour
                                    
                                    # Track highest severity
                                    current_severity = self._get_severity_level(incident)
                                    if not daily_summary["highest_severity"] or self._compare_severity(current_severity, daily_summary["highest_severity"]) > 0:
                                        daily_summary["highest_severity"] = current_severity
                                    
                                    # Track response time if available
                                    response_time = self._extract_response_time(incident)
                                    if response_time and response_time > 0:
                                        if "response_times" not in daily_summary:
                                            daily_summary["response_times"] = []
                                        daily_summary["response_times"].append(response_time)
                                        
                                        # Calculate average response time
                                        avg_response = sum(daily_summary["response_times"]) / len(daily_summary["response_times"])
                                        daily_summary["avg_response_time_minutes"] = avg_response
                                else:
                                    # Fallback: user not in our initialized structure
                                    # Create the missing user structure on-the-fly as emergency fallback
                                    if user_key not in individual_daily_data:
                                        individual_daily_data[user_key] = {}
                                    if date_str not in individual_daily_data[user_key]:
                                        individual_daily_data[user_key][date_str] = {
                                            "date": date_str,
                                            "incident_count": 0,
                                            "severity_weighted_count": 0.0,
                                            "after_hours_count": 0,
                                            "weekend_count": 0,
                                            "response_times": [],
                                            "has_data": False,
                                            "incidents": [],
                                            "high_severity_count": 0,
                                            # Enhanced severity breakdown
                                            "severity_breakdown": {
                                                "sev0": 0, "sev1": 0, "sev2": 0, "sev3": 0, "low": 0
                                            },
                                            # Daily summary for tooltips
                                            "daily_summary": {
                                                "total_incidents": 0,
                                                "highest_severity": None,
                                                "after_hours_incidents": 0,
                                                "weekend_work": False,
                                                "peak_hour": None,
                                                "incident_titles": []
                                            }
                                        }
                                    # Now process the incident
                                    user_day_data = individual_daily_data[user_key][date_str]
                                    user_day_data["incident_count"] += 1
                                    user_day_data["severity_weighted_count"] += severity_weight
                                    user_day_data["has_data"] = True
                                
                                # Determine severity level for breakdown (use consistent helper method)
                                severity_level = self._get_severity_level(incident)
                                
                                # Update severity breakdown
                                user_day_data["severity_breakdown"][severity_level] += 1
                                
                                # Add enhanced daily summary data collection to fallback path
                                if user_key in individual_daily_data and date_str in individual_daily_data[user_key]:
                                    daily_summary = user_day_data["daily_summary"]
                                    daily_summary["total_incidents"] = user_day_data["incident_count"]

                                    # Track after-hours and weekend work (using standard constants)
                                    if incident_hour < BUSINESS_HOURS_START or incident_hour >= BUSINESS_HOURS_END:
                                        daily_summary["after_hours_incidents"] = user_day_data["after_hours_count"]
                                    
                                    # Store weekend incidents
                                    if incident_date.weekday() >= 5:  # Saturday=5, Sunday=6
                                        daily_summary["weekend_work"] = True
                                    
                                    # Track incident titles and metadata
                                    incident_title = self._extract_incident_title(incident)
                                    if incident_title:
                                        if len(daily_summary["incident_titles"]) < 5:  # Limit to 5 titles
                                            daily_summary["incident_titles"].append(incident_title)
                                    
                                    # Track peak hour (most frequent incident hour)
                                    hour_key = f"{incident_hour:02d}:00"
                                    if "incident_hours" not in daily_summary:
                                        daily_summary["incident_hours"] = {}
                                    daily_summary["incident_hours"][hour_key] = daily_summary["incident_hours"].get(hour_key, 0) + 1
                                    
                                    # Update peak hour
                                    if daily_summary["incident_hours"]:
                                        peak_hour = max(daily_summary["incident_hours"], key=daily_summary["incident_hours"].get)
                                        daily_summary["peak_hour"] = peak_hour
                                    
                                    # Track highest severity
                                    if not daily_summary["highest_severity"] or self._compare_severity(severity_level, daily_summary["highest_severity"]) > 0:
                                        daily_summary["highest_severity"] = severity_level
                                    
                                    # Track response time if available
                                    response_time = self._extract_response_time(incident)
                                    if response_time and response_time > 0:
                                        if "response_times" not in daily_summary:
                                            daily_summary["response_times"] = []
                                        daily_summary["response_times"].append(response_time)
                                        # Calculate average response time
                                        avg_response = sum(daily_summary["response_times"]) / len(daily_summary["response_times"])
                                        daily_summary["avg_response_time_minutes"] = avg_response
                                
                                
                                # Store incident details for individual analysis
                                user_day_data["incidents"].append({
                                    "id": incident.get("id", "unknown"),
                                    "title": incident_title,
                                    "severity": severity_weight,
                                    "severity_level": severity_level,
                                    "after_hours": incident_hour < BUSINESS_HOURS_START or incident_hour >= BUSINESS_HOURS_END,
                                    "hour": incident_hour,
                                    "created_at": created_at
                                })
                                        
                        except Exception as date_error:
                            logger.debug(f"Error parsing incident date: {date_error}")
                            continue
                            
                    except Exception as inc_error:
                        logger.debug(f"Error processing incident for daily trends: {inc_error}")
                        continue
            
            # Ensure daily_data has entries for ALL days in analysis period, not just incident days
            for day_offset in range(days_analyzed):
                date_obj = datetime.now() - timedelta(days=days_analyzed - day_offset - 1)
                date_str = date_obj.strftime('%Y-%m-%d')
                
                # Initialize empty days (no incidents)
                if date_str not in daily_data:
                    daily_data[date_str] = {
                        "date": date_str,
                        "incident_count": 0,
                        "severity_weighted_count": 0.0,
                        "after_hours_count": 0,
                        "users_involved": set(),
                        "high_severity_count": 0
                    }
            
            # Convert to list and calculate daily scores
            daily_trends = []
            for date_str in sorted(daily_data.keys()):
                day_data = daily_data[date_str]
                
                # Convert set to count
                users_involved_count = len(day_data["users_involved"])
                
                # Calculate daily health score (SimpleBurnoutAnalyzer approach)
                incident_count = day_data.get("incident_count", 0)
                severity_weighted = day_data.get("severity_weighted_count", 0.0)
                after_hours_count = day_data.get("after_hours_count", 0)
                high_severity_count = day_data.get("high_severity_count", 0)
                
                # Ensure all variables are numeric and not None
                incident_count = incident_count if incident_count is not None else 0
                severity_weighted = severity_weighted if severity_weighted is not None else 0.0
                after_hours_count = after_hours_count if after_hours_count is not None else 0
                high_severity_count = high_severity_count if high_severity_count is not None else 0
                
                # Advanced scoring algorithm from SimpleBurnoutAnalyzer
                # Start with baseline of 8.7 for operational activity days
                daily_score = 8.7
                total_team_size = len(team_analysis) if team_analysis else 1
                
                # Calculate proportional rates based on team size (normalized to team size)
                daily_incident_rate = incident_count / max(total_team_size, 1) if total_team_size and total_team_size > 0 else 0
                daily_severity_rate = severity_weighted / max(total_team_size, 1) if total_team_size and total_team_size > 0 else 0
                
                # Apply targeted penalties with team-size normalization
                # Base incident load penalty (proportional to team size)
                daily_score -= min(daily_incident_rate * 0.8, 2.0)
                
                # Severity penalty (more aggressive for high severity)
                daily_score -= min(daily_severity_rate * 1.2, 3.0)
                
                # After-hours penalty (operational stress)
                if after_hours_count > 0:
                    after_hours_penalty = min(after_hours_count * 0.5, 1.5)
                    daily_score -= after_hours_penalty
                
                # High-severity incident penalty (critical operational impact)
                if high_severity_count > 0:
                    critical_penalty = min(high_severity_count * 0.8, 2.0)
                    daily_score -= critical_penalty
                
                # Concentration penalty - if too few people handling too many incidents
                if users_involved_count > 0 and total_team_size and total_team_size > 0 and users_involved_count < total_team_size * 0.3:
                    concentration_ratio = incident_count / users_involved_count if users_involved_count > 0 else 0
                    if concentration_ratio > 2:
                        concentration_penalty = min((concentration_ratio - 2) * 0.3, 1.0)
                        daily_score -= concentration_penalty
                
                # Floor at 2.0 (20% health) even on worst days
                daily_score = max(daily_score, 2.0)
                
                # Calculate members at risk for this specific day
                total_members = len(team_analysis) if team_analysis else users_involved_count
                
                # Calculate day-specific members at risk based on who was involved in incidents on this day
                members_at_risk = 0
                
                if day_data["users_involved"]:
                    # Count how many of the users involved in today's incidents are high risk
                    for user_email in day_data["users_involved"]:
                        # Find this user in the team analysis
                        for member in (team_analysis or []):
                            if member.get("user_email") == user_email or member.get("user_name") == user_email:
                                if member.get("risk_level") in ["high", "critical"]:
                                    members_at_risk += 1
                                break
                
                # If we couldn't match users, fallback to load-based estimation
                if members_at_risk == 0 and users_involved_count > 0:
                    # Risk assessment based on daily load per person
                    avg_incidents_per_person = incident_count / users_involved_count if users_involved_count > 0 else 0
                    if avg_incidents_per_person > 3:
                        members_at_risk = max(1, int(users_involved_count * 0.8))
                    elif avg_incidents_per_person > 2:
                        members_at_risk = max(1, int(users_involved_count * 0.5))
                    elif after_hours_count > 0:
                        members_at_risk = max(1, int(users_involved_count * 0.3))
                
                # Determine health status
                health_status = self._determine_health_status_from_score(daily_score)
                
                # 🔍 DEBUG: Log daily score calculation details
                logger.info(f"📊 DAILY_SCORE_DEBUG for {date_str}: baseline=8.7, incidents={incident_count}, severity_weighted={severity_weighted:.1f}, after_hours={after_hours_count}, high_severity={high_severity_count}, users_involved={users_involved_count}, final_score={daily_score:.2f}")
                
                daily_trends.append({
                    "date": date_str,
                    "overall_score": round(daily_score, 2),  # Keep as 0-10 scale (SimpleBurnoutAnalyzer approach)
                    "incident_count": incident_count,
                    "severity_weighted_count": round(severity_weighted, 1),
                    "after_hours_count": after_hours_count,
                    "high_severity_count": high_severity_count,
                    "users_involved": users_involved_count,  # Match SimpleBurnoutAnalyzer field name
                    "members_at_risk": members_at_risk,
                    "total_members": total_members,
                    "health_status": health_status,
                    "health_percentage": round(daily_score * 10, 1),  # Convert to percentage for display
                    # 🔍 DEBUG: Add penalty breakdown for debugging
                    "debug_penalties": {
                        "baseline": 8.7,
                        "incident_penalty": min(daily_incident_rate * 0.8, 2.0) if 'daily_incident_rate' in locals() else 0,
                        "severity_penalty": min(daily_severity_rate * 1.2, 3.0) if 'daily_severity_rate' in locals() else 0,
                        "final_score": daily_score
                    }
                })
            
            # AFTER main processing: Fill out individual daily data for ALL users and ALL days
            all_users = set()
            for user in team_analysis:
                if user.get('user_email'):  # team_analysis uses user_email, not email
                    all_users.add(user['user_email'].lower())
            
            # Initialize complete individual daily data structure
            complete_individual_data = {}
            for user_email in all_users:
                complete_individual_data[user_email] = {}
                for day_offset in range(days_analyzed):
                    date_obj = datetime.now() - timedelta(days=days_analyzed - day_offset - 1)
                    date_str = date_obj.strftime('%Y-%m-%d')
                    
                    # Start with no-data default
                    complete_individual_data[user_email][date_str] = {
                        "date": date_str,
                        "incident_count": 0,
                        "severity_weighted_count": 0.0,
                        "after_hours_count": 0,
                        "weekend_count": 0,
                        "response_times": [],
                        "has_data": False,
                        "incidents": [],
                        "high_severity_count": 0
                    }
                    
                    # If user has data for this day, copy it over and mark as has_data
                    if user_email in individual_daily_data and date_str in individual_daily_data[user_email]:
                        original_data = individual_daily_data[user_email][date_str]
                        complete_individual_data[user_email][date_str].update(original_data)
                        complete_individual_data[user_email][date_str]["has_data"] = True
                        
                        # Calculate individual burnout score for this user on this day (CONSISTENT with OCB)
                        burnout_score = self._calculate_individual_daily_health_score(
                            original_data, 
                            date_obj, 
                            user_email,
                            team_analysis
                        )
                        complete_individual_data[user_email][date_str]["health_score"] = burnout_score
                        
                    else:
                        # No incidents = calculate health score based on baseline (no hardcoded values)
                        # Create empty daily data for calculation
                        empty_daily_data = {
                            "incident_count": 0,
                            "severity_weighted_count": 0.0,
                            "after_hours_count": 0,
                            "weekend_count": 0,
                            "high_severity_count": 0,
                            "has_data": False
                        }
                        health_score = self._calculate_individual_daily_health_score(
                            empty_daily_data,
                            date_obj,
                            user_email,
                            team_analysis
                        )
                        complete_individual_data[user_email][date_str]["health_score"] = health_score
            
            # Calculate team average health scores for each day and add to individual data
            for day_offset in range(days_analyzed):
                date_obj = datetime.now() - timedelta(days=days_analyzed - day_offset - 1)
                date_str = date_obj.strftime('%Y-%m-%d')
                
                # Calculate team average OCB burnout score for this day
                daily_ocb_scores = []
                for user_email in complete_individual_data:
                    if date_str in complete_individual_data[user_email]:
                        user_ocb_score = complete_individual_data[user_email][date_str].get("health_score")
                        if user_ocb_score is not None:
                            daily_ocb_scores.append(user_ocb_score)
                
                # Calculate team average from actual data (no hardcoded fallback)
                if daily_ocb_scores:
                    team_avg_ocb = int(sum(daily_ocb_scores) / len(daily_ocb_scores))
                else:
                    # If no data, calculate from team incident load
                    team_avg_incidents = sum(m.get("incident_count", 0) for m in team_analysis) / len(team_analysis) if team_analysis else 0
                    team_health_baseline = max(70, int(100 - (team_avg_incidents * 2)))
                    team_avg_ocb = 100 - team_health_baseline  # Convert health to OCB burnout score
                
                # Add team average to each user's data for this day
                for user_email in complete_individual_data:
                    if date_str in complete_individual_data[user_email]:
                        complete_individual_data[user_email][date_str]["team_health"] = team_avg_ocb
                        
                        # Add formatted day name for frontend display
                        complete_individual_data[user_email][date_str]["day_name"] = date_obj.strftime("%a, %b %d")
            
            # Store the complete individual daily data
            self.individual_daily_data = complete_individual_data
            
            # Return only days with actual incident data - no fake data generation
            logger.info(f"Generated {len(daily_trends)} daily trend data points with actual incident data for {days_analyzed}-day analysis")
            logger.info(f"Individual daily data collected for {len(complete_individual_data)} users with complete {days_analyzed}-day coverage")
            
            # Store the complete individual daily data
            self.individual_daily_data = complete_individual_data
            
            return daily_trends
            
        except Exception as e:
            logger.error(f"Error in _generate_daily_trends: {e}")
            # Ensure individual_daily_data is set even in error cases
            if not hasattr(self, 'individual_daily_data'):
                self.individual_daily_data = {}
                logger.warning(f"🚨 Setting empty individual_daily_data due to error in _generate_daily_trends")
            return []
    
    def _calculate_individual_daily_health_score(
        self, 
        daily_data: Dict[str, Any], 
        date_obj: datetime, 
        user_email: str,
        team_analysis: List[Dict[str, Any]]
    ) -> int:
        """
        Calculate individual daily OCB burnout score (0-100 scale, higher = worse burnout).
        
        Aligned with main OCB Risk Level Scale:
        - 0-24: Healthy (green)
        - 25-49: Fair (yellow) 
        - 50-74: Poor (orange)
        - 75-100: Critical (red)
        
        Based on Copenhagen Burnout Inventory methodology. NO hardcoded values.
        """
        
        try:
            # Calculate baseline health from team incident load (no hardcoded values)
            team_avg_incidents = sum(m.get("incident_count", 0) for m in team_analysis) / len(team_analysis) if team_analysis else 0
            # Higher team incident load = lower baseline health for everyone
            base_health = max(70, 100 - (team_avg_incidents * 2))  # Dynamic baseline
            
            # Extract metrics from daily data
            incident_count = daily_data.get("incident_count", 0)
            severity_weighted = daily_data.get("severity_weighted_count", 0.0)
            after_hours_count = daily_data.get("after_hours_count", 0)
            weekend_count = daily_data.get("weekend_count", 0)
            high_severity_count = daily_data.get("high_severity_count", 0)
            
            # 1. INCIDENT LOAD HEALTH PENALTIES (Primary Impact)
            # Research: Each incident reduces health by 8-15 points depending on context
            incident_penalty = 0
            if incident_count > 0:
                # Base health penalty per incident
                incident_penalty = incident_count * 8
                
                # Escalating penalties for high volume days (cognitive overload)
                if incident_count >= 5:
                    incident_penalty += (incident_count - 4) * 5  # Extra penalty for overload
                elif incident_count >= 3:
                    incident_penalty += (incident_count - 2) * 3  # Moderate escalation
            
            # 2. SEVERITY-WEIGHTED HEALTH PENALTIES (Psychological Impact)
            # Convert severity weight directly to health penalty (platform-agnostic)
            severity_penalty = 0
            if severity_weighted > 0:
                # Scale severity weight to health penalty: multiply by 1.5 for impact
                # This automatically handles platform differences:
                # PagerDuty SEV1 (15.0) → 22.5 penalty, SEV2 (12.0) → 18 penalty
                # Rootly SEV0 (15.0) → 22.5 penalty, SEV1 (12.0) → 18 penalty  
                severity_penalty = min(25, severity_weighted * 1.5)  # Cap at 25 for extreme cases
            
            # 3. WORK-LIFE BALANCE HEALTH PENALTIES
            after_hours_penalty = after_hours_count * 8  # 8 point penalty per after-hours incident
            weekend_penalty = weekend_count * 12         # 12 point penalty per weekend incident (higher impact)
            
            # 4. CRITICAL INCIDENT MULTIPLIER
            # High severity incidents have compounding health effects
            critical_multiplier = 1.0
            if high_severity_count > 0:
                critical_multiplier = 1.0 + (high_severity_count * 0.15)  # 15% more impact per critical incident
            
            # 5. CONTEXTUAL FACTORS
            
            # Day of week adjustment (Mondays and Fridays are more stressful)
            day_penalty = 0
            weekday = date_obj.weekday()  # 0=Monday, 6=Sunday
            if weekday == 0:  # Monday
                day_penalty = 3 if incident_count > 0 else 0
            elif weekday == 4:  # Friday
                day_penalty = 2 if incident_count > 0 else 0
            elif weekday >= 5:  # Weekend
                day_penalty = 5 if incident_count > 0 else 0
            
            # Personal workload vs team average (if available)
            personal_load_penalty = 0
            try:
                # Find this user's overall incident load
                user_member = None
                for member in team_analysis:
                    if member.get("user_email", "").lower() == user_email.lower():
                        user_member = member
                        break
                
                if user_member:
                    user_total_incidents = user_member.get("incident_count", 0)
                    team_avg_incidents = sum(m.get("incident_count", 0) for m in team_analysis) / len(team_analysis) if team_analysis else 0
                    
                    # If user is handling significantly more than average, add health penalty
                    if team_avg_incidents > 0 and user_total_incidents > team_avg_incidents * 1.5:
                        personal_load_penalty = 5  # High-load team member gets extra penalty on incident days
                        
            except Exception as load_calc_error:
                logger.warning(f"Could not calculate personal load penalty for {user_email}: {load_calc_error}")
            
            # CALCULATE FINAL HEALTH SCORE (no inversion needed)
            total_penalties = (
                (incident_penalty + severity_penalty + after_hours_penalty + weekend_penalty) * critical_multiplier +
                day_penalty + personal_load_penalty
            )
            
            final_health_score = base_health - total_penalties
            
            # Apply bounds (0-100 range, higher = better health)
            final_health_score = max(0, min(100, int(final_health_score)))
            
            # Convert health score to OCB burnout score for alignment with main chart
            # Health: 100 = excellent, 0 = poor → OCB: 0 = healthy, 100 = critical
            ocb_burnout_score = 100 - final_health_score
            
            return ocb_burnout_score
            
        except Exception as e:
            logger.error(f"Error calculating individual daily health score for {user_email}: {e}")
            # OCB FALLBACK: Calculate from incident count (no hardcoded values)
            incident_count = daily_data.get("incident_count", 0)
            fallback_health = max(20, 90 - (incident_count * 15))  # Dynamic health fallback
            fallback_ocb = 100 - fallback_health  # Convert to OCB burnout score
            return fallback_ocb
    
    def _determine_health_status_from_score(self, score: float) -> str:
        """Determine health status from burnout score (SimpleBurnoutAnalyzer approach)."""
        if score >= 8.5:
            return "excellent"
        elif score >= 7.0:
            return "good"  
        elif score >= 5.0:
            return "fair"
        elif score >= 3.0:
            return "poor"
        else:
            return "critical"
    
    def _recalculate_burnout_with_github(self, members: List[Dict[str, Any]], metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Recalculate burnout scores incorporating GitHub activity data.
        This handles users with 0 incidents but significant GitHub activity.
        """
        try:
            updated_members = []
            github_adjustments_made = 0
            
            for member in members:
                if not isinstance(member, dict):
                    updated_members.append(member)
                    continue
                
                # Get current burnout info
                current_score = member.get("burnout_score", 0)
                incident_count = member.get("incident_count", 0)
                github_activity = member.get("github_activity", {})
                
                # Extract GitHub metrics (even if no activity to properly set score_source)
                commits_count = github_activity.get("commits_count", 0) if github_activity else 0
                commits_per_week = github_activity.get("commits_per_week", 0) if github_activity else 0
                after_hours_commits = github_activity.get("after_hours_commits", 0) if github_activity else 0
                weekend_commits = github_activity.get("weekend_commits", 0) if github_activity else 0
                
                # Ensure None values are converted to 0 to prevent NoneType errors
                commits_count = commits_count if commits_count is not None else 0
                commits_per_week = commits_per_week if commits_per_week is not None else 0
                after_hours_commits = after_hours_commits if after_hours_commits is not None else 0
                weekend_commits = weekend_commits if weekend_commits is not None else 0
                has_github_username = github_activity.get("username") if github_activity else None
                
                # Calculate GitHub-based burnout score (even if 0 to determine score_source properly)
                github_burnout_score = 0.0
                if has_github_username and (commits_count > 0 or commits_per_week > 0):
                    github_burnout_score = self._calculate_github_burnout_score(
                        commits_count, commits_per_week, after_hours_commits, weekend_commits
                    )
                
                # Determine final burnout score based on available data
                final_score = current_score  # Default to current score
                score_source = "incident_based"  # Default score source
                
                if incident_count == 0 and github_burnout_score > 0:
                    # User has no incidents but GitHub activity - use GitHub score
                    final_score = github_burnout_score
                    score_source = "github_based"
                    github_adjustments_made += 1
                elif incident_count > 0 and github_burnout_score > 0:
                    # User has both incidents and GitHub activity - combine scores
                    # Weight: 70% incident-based, 30% GitHub-based for users with incidents
                    final_score = (current_score * 0.7) + (github_burnout_score * 0.3)
                    score_source = "hybrid"
                    github_adjustments_made += 1
                elif incident_count == 0 and github_burnout_score == 0:
                    # User has no incidents and no GitHub activity
                    score_source = "incident_based"  # Keep as incident_based since that's the baseline
                
                # Update member with new score
                updated_member = member.copy()
                updated_member["burnout_score"] = round(final_score, 2)
                updated_member["risk_level"] = self._determine_risk_level(final_score)
                
                # Add GitHub burnout breakdown for transparency
                updated_member["github_burnout_breakdown"] = {
                    "github_score": round(github_burnout_score, 2),
                    "original_score": round(current_score, 2),
                    "final_score": round(final_score, 2),
                    "score_source": score_source,
                    "github_indicators": {
                        "high_commit_volume": commits_per_week > 25,
                        "excessive_commits": commits_per_week > 50,
                        "after_hours_work": (after_hours_commits / max(commits_count, 1)) > 0.15 if commits_count and commits_count > 0 and after_hours_commits is not None else False,
                        "weekend_work": (weekend_commits / max(commits_count, 1)) > 0.10 if commits_count and commits_count > 0 and weekend_commits is not None else False
                    }
                }
                
                updated_members.append(updated_member)
            
            logger.info(f"🔥 GITHUB BURNOUT: Adjusted scores for {github_adjustments_made}/{len(members)} members using GitHub activity")
            
            return updated_members
            
        except Exception as e:
            logger.error(f"Error in _recalculate_burnout_with_github: {e}")
            return members
    
    def _calculate_github_burnout_score(
        self, 
        commits_count: Optional[int], 
        commits_per_week: Optional[float], 
        after_hours_commits: Optional[int], 
        weekend_commits: Optional[int]
    ) -> float:
        """
        Calculate burnout score based on GitHub activity patterns.
        Based on burnout research but simplified for GitHub data.
        """
        try:
            # Convert None values to 0 for safe calculations
            commits_count = commits_count if commits_count is not None else 0
            commits_per_week = commits_per_week if commits_per_week is not None else 0.0
            after_hours_commits = after_hours_commits if after_hours_commits is not None else 0
            weekend_commits = weekend_commits if weekend_commits is not None else 0
            
            if commits_count == 0 and commits_per_week == 0:
                return 0.0
            
            # Emotional Exhaustion Score (0-10, higher = more exhausted)
            exhaustion_score = 0.0
            
            # High commit volume indicates potential overwork (more aggressive scoring)
            if commits_per_week >= 100:  # Extreme - unsustainable pace
                exhaustion_score += 9.0
            elif commits_per_week >= 80:  # Very extreme
                exhaustion_score += 8.0
            elif commits_per_week >= 60:  # High extreme
                exhaustion_score += 6.5
            elif commits_per_week >= 50:  # Very high
                exhaustion_score += 5.0
            elif commits_per_week >= 25:  # Moderately high
                exhaustion_score += 3.0
            elif commits_per_week >= 15:  # Above average
                exhaustion_score += 1.5
            
            # After-hours work patterns
            if commits_count and commits_count > 0 and after_hours_commits is not None:
                after_hours_ratio = (after_hours_commits or 0) / commits_count
                if after_hours_ratio > 0.30:  # >30% after hours
                    exhaustion_score += 3.0
                elif after_hours_ratio > 0.15:  # >15% after hours
                    exhaustion_score += 1.5
                elif after_hours_ratio > 0.05:  # >5% after hours
                    exhaustion_score += 0.5
                
                # Weekend work patterns
                if weekend_commits is not None:
                    weekend_ratio = (weekend_commits or 0) / commits_count
                    if weekend_ratio > 0.25:  # >25% on weekends
                        exhaustion_score += 2.0
                    elif weekend_ratio > 0.10:  # >10% on weekends
                        exhaustion_score += 1.0
            
            # Cap exhaustion score at 10
            exhaustion_score = min(10.0, exhaustion_score)
            
            # Depersonalization Score (0-10, based on work patterns)
            # High volume with poor work-life balance suggests cynicism
            depersonalization_score = 0.0
            if commits_per_week >= 100:  # Extreme activity often leads to cynicism
                depersonalization_score = 8.0
            elif commits_per_week >= 80:  # Very extreme activity
                depersonalization_score = 6.0
            elif commits_per_week >= 60:
                depersonalization_score = 5.0
            elif commits_per_week >= 40:
                depersonalization_score = 2.5
            elif commits_per_week > 30 and (after_hours_commits + weekend_commits) > (commits_count * 0.2):
                depersonalization_score = 3.0
            elif commits_per_week > 20:
                depersonalization_score = 1.0
            
            # Personal Accomplishment Score (0-10, higher = better accomplishment)
            # Assume reasonable accomplishment for active developers
            accomplishment_score = 7.0  # Default good accomplishment for active devs
            
            # Reduce if showing signs of overwork (quality may suffer)
            if commits_per_week > 50:
                accomplishment_score = 5.0  # May indicate rushed work
            elif commits_per_week > 30:
                accomplishment_score = 6.0
            
            # Calculate final burnout score using equal weighting
            # Personal Burnout (33.3%), Work-Related Burnout (33.3%), Client-Related Burnout (33.4%)
            # Slightly increased exhaustion weight for GitHub-based scoring
            burnout_score = (
                exhaustion_score * 0.45 +
                depersonalization_score * 0.35 +
                (10 - accomplishment_score) * 0.20
            )
            
            # Ensure score is between 0 and 10
            burnout_score = max(0.0, min(10.0, burnout_score))
            
            return burnout_score
            
        except (TypeError, ZeroDivisionError, ValueError) as e:
            logger.error(f"Error calculating GitHub burnout score (math error): {e}")
            logger.error(f"Values: commits_count={commits_count}, commits_per_week={commits_per_week}, after_hours_commits={after_hours_commits}, weekend_commits={weekend_commits}")
            return 0.0
        except Exception as e:
            logger.error(f"Unexpected error calculating GitHub burnout score: {e}")
            return 0.0

    def calculate_individual_daily_health(self, user_email: str, date: str, member_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Calculate individual daily health score for a specific user on a specific date.
        Returns detailed health data including score, factors, and incident details.
        """
        try:
            user_key = user_email.lower()
            
            # Check if we have individual daily data for this user
            if not hasattr(self, 'individual_daily_data') or user_key not in self.individual_daily_data:
                return {
                    "date": date,
                    "health_score": None,
                    "incident_count": 0,
                    "team_health": None,
                    "factors": {},
                    "error": "No individual daily data available for this user"
                }
            
            user_daily_data = self.individual_daily_data[user_key]
            
            if date not in user_daily_data:
                return {
                    "date": date,
                    "health_score": None,
                    "incident_count": 0,
                    "team_health": None,
                    "factors": {},
                    "error": "No data available for this date"
                }
            
            day_data = user_daily_data[date]
            
            # Calculate individual health score based on daily incident load
            base_score = 8.5  # Start with healthy baseline
            
            incident_count = day_data.get("incident_count", 0)
            severity_weighted = day_data.get("severity_weighted_count", 0.0)
            after_hours_count = day_data.get("after_hours_count", 0)
            high_severity_count = day_data.get("high_severity_count", 0)
            
            # Individual scoring penalties
            # Incident volume penalty (more aggressive for individuals)
            if incident_count > 0:
                incident_penalty = min(incident_count * 1.0, 3.0)  # Up to 3 points for high incident days
                base_score -= incident_penalty
            
            # Severity penalty (critical incidents impact individual more heavily)
            if severity_weighted > incident_count:  # Above-average severity
                severity_penalty = min((severity_weighted - incident_count) * 0.8, 2.0)
                base_score -= severity_penalty
            
            # After-hours penalty (work-life balance impact)
            if after_hours_count > 0:
                after_hours_penalty = min(after_hours_count * 0.7, 1.5)
                base_score -= after_hours_penalty
            
            # High severity penalty (stress impact)
            if high_severity_count > 0:
                high_sev_penalty = min(high_severity_count * 1.0, 2.0)
                base_score -= high_sev_penalty
            
            # Floor at 1.0 (10% health) for very bad days
            daily_health_score = max(base_score, 1.0)
            
            # Calculate contributing factors
            factors = {}
            
            if member_data:
                # Use member-wide factors as context
                member_factors = member_data.get("factors", {})
                factors = {
                    "workload": min((incident_count or 0) / 5.0 * 10, 10),  # Scale incidents to 0-10
                    "after_hours": ((after_hours_count or 0) / max((incident_count or 1), 1)) * 10 if (incident_count or 0) > 0 else 0,
                    "response_time": member_factors.get("response_time", 0) or 0,
                    "weekend_work": member_factors.get("weekend_work", 0) or 0,
                    "severity_pressure": ((high_severity_count or 0) / max((incident_count or 1), 1)) * 10 if (incident_count or 0) > 0 else 0
                }
            else:
                # Calculate basic factors from daily data only
                factors = {
                    "workload": min((incident_count or 0) / 3.0 * 10, 10),
                    "after_hours": ((after_hours_count or 0) / max((incident_count or 1), 1)) * 10 if (incident_count or 0) > 0 else 0,
                    "response_time": 5.0,  # Default moderate
                    "weekend_work": 0,     # Can't determine from daily data
                    "severity_pressure": ((high_severity_count or 0) / max((incident_count or 1), 1)) * 10 if (incident_count or 0) > 0 else 0
                }
            
            return {
                "date": date,
                "health_score": round(daily_health_score * 10),  # Convert to 0-100 scale
                "incident_count": incident_count,
                "team_health": None,  # Will be filled by API endpoint
                "factors": factors,
                "incidents": day_data.get("incidents", []),  # Include incident details
                "severity_weighted_count": round(severity_weighted or 0.0, 1),
                "after_hours_count": after_hours_count or 0,
                "high_severity_count": high_severity_count or 0
            }
            
        except Exception as e:
            logger.error(f"Error calculating individual daily health for {user_email} on {date}: {e}")
            return {
                "date": date,
                "health_score": None,
                "incident_count": 0,
                "team_health": None,
                "factors": {},
                "error": f"Calculation error: {str(e)}"
            }
    
    def _get_user_email_from_user(self, user: Dict) -> str:
        """Extract user email from user data, handling different formats."""
        if isinstance(user, dict):
            # Handle JSONAPI format
            if "attributes" in user:
                attrs = user["attributes"]
                return attrs.get("email", "").strip().lower() if attrs.get("email") else ""
            # Handle direct format
            elif "email" in user:
                return user["email"].strip().lower() if user["email"] else ""
        return ""
    
    def _get_user_name_from_user(self, user: Dict) -> str:
        """Extract user name from user data, handling different formats."""
        if isinstance(user, dict):
            # Handle JSONAPI format
            if "attributes" in user:
                attrs = user["attributes"]
                return attrs.get("name", attrs.get("full_name", "Unknown User"))
            # Handle direct format
            elif "name" in user:
                return user["name"]
            elif "full_name" in user:
                return user["full_name"]
        return "Unknown User"
    
    def _create_error_response(self, error_message: str) -> Dict[str, Any]:
        """Create a standardized error response for failed analysis."""
        return {
            "status": "error",
            "error_message": error_message,
            "team_analysis": {"members": []},
            "team_health": {
                "overall_score": None,
                "health_status": "error",
                "members_at_risk": 0,
                "risk_distribution": {"low": 0, "medium": 0, "high": 0},
                "error": error_message
            },
            "daily_trends": [],
            "metadata": {
                "error": True,
                "error_message": error_message,
                "timestamp": datetime.now().isoformat()
            }
        }
    
    def _extract_incident_title(self, incident: Dict[str, Any]) -> str:
        """Extract incident title from platform-specific incident data."""
        try:
            if self.platform == "pagerduty":
                # PagerDuty format
                return incident.get("title", incident.get("summary", "Untitled incident"))
            else:
                # Rootly format
                attrs = incident.get("attributes", {})
                return attrs.get("title", attrs.get("summary", "Untitled incident"))
        except Exception:
            return "Untitled incident"
    
    def _get_severity_level(self, incident: Dict[str, Any]) -> str:
        """Extract severity level from platform-specific incident data."""
        try:
            # First, check if severity was already mapped by the platform client
            if "severity" in incident:
                return incident["severity"]

            if self.platform == "pagerduty":
                # PagerDuty format - fallback if severity not pre-mapped
                urgency = incident.get("urgency", "low")
                priority = incident.get("priority", {})
                if isinstance(priority, dict):
                    priority_name = priority.get("summary", "").lower()
                    if "p1" in priority_name or urgency == "high":
                        return "sev1"
                    elif "p2" in priority_name:
                        return "sev2"
                    elif "p3" in priority_name:
                        return "sev3"
                    elif "p4" in priority_name:
                        return "sev4"
                    elif "p5" in priority_name:
                        return "low"  # Matches the daily trends structure
                    else:
                        return "sev4"
                return "sev3"  # default
            else:
                # Rootly format
                attrs = incident.get("attributes", {})
                severity_info = attrs.get("severity", {})
                if isinstance(severity_info, dict) and "data" in severity_info:
                    severity_data = severity_info["data"]
                    if isinstance(severity_data, dict) and "attributes" in severity_data:
                        severity_name = severity_data["attributes"].get("name", "medium").lower()
                        if "sev0" in severity_name or "critical" in severity_name:
                            return "sev0"
                        elif "sev1" in severity_name or "high" in severity_name:
                            return "sev1"
                        elif "sev2" in severity_name or "medium" in severity_name:
                            return "sev2"
                        elif "sev3" in severity_name or "low" in severity_name:
                            return "sev3"
                        else:
                            return "sev4"
                return "sev3"  # default
        except Exception:
            return "unknown"
    
    def _compare_severity(self, sev1: str, sev2: str) -> int:
        """Compare two severity levels. Returns: 1 if sev1 > sev2, -1 if sev1 < sev2, 0 if equal."""
        severity_order = ["sev0", "sev1", "sev2", "sev3", "sev4", "sev5", "low", "unknown"]
        try:
            idx1 = severity_order.index(sev1) if sev1 in severity_order else len(severity_order)
            idx2 = severity_order.index(sev2) if sev2 in severity_order else len(severity_order)
            
            if idx1 < idx2:
                return 1  # sev1 is more severe (lower index = higher severity)
            elif idx1 > idx2:
                return -1  # sev1 is less severe
            else:
                return 0  # equal severity
        except Exception:
            return 0

    
    #TODO
    def _extract_response_time(self, incident: Dict[str, Any]) -> float:
        """Extract response time in minutes from platform-specific incident data."""
        try:
            if self.platform == "pagerduty":
                # PagerDuty format
                created_at = incident.get("created_at")
                acknowledged_at = incident.get("acknowledged_at")
                if created_at and acknowledged_at:
                    created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    acknowledged = datetime.fromisoformat(acknowledged_at.replace('Z', '+00:00'))
                    delta = acknowledged - created
                    return delta.total_seconds() / 60.0  # Convert to minutes
            else:
                # Rootly format
                attrs = incident.get("attributes", {})
                created_at = attrs.get("created_at")
                acknowledged_at = attrs.get("acknowledged_at") or attrs.get("started_at")
                if created_at and acknowledged_at:
                    created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    acknowledged = datetime.fromisoformat(acknowledged_at.replace('Z', '+00:00'))
                    delta = acknowledged - created
                    return delta.total_seconds() / 60.0  # Convert to minutes
            
            return None
        except Exception:
            return None