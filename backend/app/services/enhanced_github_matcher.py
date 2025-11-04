"""
Enhanced GitHub username matching algorithm with multiple strategies.
"""
import re
import logging
import asyncio
from typing import Optional, Dict, List, Set, Tuple
from difflib import SequenceMatcher
import aiohttp
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Global cache to persist across matcher instances
_GLOBAL_ORG_CACHE = {}
_GLOBAL_MEMBER_PROFILES_CACHE = {}

class EnhancedGitHubMatcher:
    """
    Enhanced matcher that uses multiple strategies to correlate emails to GitHub usernames.
    Strategies include:
    1. Direct email match from GitHub API
    2. Username pattern matching (firstname.lastname, firstlast, etc.)
    3. Fuzzy name matching
    4. Domain-specific patterns
    5. Commit history mining
    6. Organization member search
    """
    
    def __init__(self, github_token: str, organizations: List[str] = None):
        self.github_token = github_token
        self.organizations = organizations or []
        self.headers = {
            'Authorization': f'token {github_token}',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Rootly-Burnout-Detector'
        }
        
        # Use global cache to persist across instances
        self._user_cache = {}
        self._email_cache = {}
        self._org_members_cache = _GLOBAL_ORG_CACHE
        
    async def match_email_to_github(self, email: str, full_name: Optional[str] = None) -> Optional[str]:
        """
        Main entry point - tries all strategies to find a GitHub username.
        
        Args:
            email: Email address to match
            full_name: Optional full name to help with matching
            
        Returns:
            GitHub username if found, None otherwise
        """
        # Validate email input
        if not email or not isinstance(email, str):
            logger.warning(f"Invalid email provided: {email}")
            return None
            
        email_lower = email.lower()
        
        # Check cache first
        if email_lower in self._email_cache:
            return self._email_cache[email_lower]

        # DEPRECATED: This method should not be used anymore
        # Instead use match_name_to_github() which is optimized
        logger.warning(f"⚠️  match_email_to_github() is deprecated. Use match_name_to_github() instead for {email}")
        return None
    
    async def discover_accessible_organizations(self) -> List[str]:
        """
        Discover GitHub organizations that the token has access to.
        
        Returns:
            List of organization names the token can access
        """
        try:
            async with aiohttp.ClientSession() as session:
                # Get organizations the authenticated user belongs to
                orgs_url = "https://api.github.com/user/orgs"
                async with session.get(orgs_url, headers=self.headers) as resp:
                    if resp.status == 200:
                        orgs_data = await resp.json()
                        org_names = [org['login'] for org in orgs_data]
                        return org_names
                    else:
                        logger.warning(f"Failed to fetch user organizations: {resp.status}")
                        
                # If user orgs fails, try to get organizations the token can access via user
                user_url = "https://api.github.com/user"
                async with session.get(user_url, headers=self.headers) as resp:
                    if resp.status == 200:
                        user_data = await resp.json()
                        username = user_data.get('login')
                        if username:
                            # Get organizations for this user
                            user_orgs_url = f"https://api.github.com/users/{username}/orgs"
                            async with session.get(user_orgs_url, headers=self.headers) as resp:
                                if resp.status == 200:
                                    orgs_data = await resp.json()
                                    org_names = [org['login'] for org in orgs_data]
                                    return org_names
                                    
        except Exception as e:
            logger.error(f"Error discovering organizations: {e}")
            
        logger.warning("Could not discover organizations from token")
        return []
    
    async def match_name_to_github(self, full_name: str, fallback_email: Optional[str] = None) -> Optional[str]:
        """
        Match a full name to GitHub username by first fetching org members then matching.
        
        Args:
            full_name: Full name to match (e.g., "Spencer Cheng")
            fallback_email: Optional email for additional context
            
        Returns:
            GitHub username if found, None otherwise
        """
        if not full_name or not isinstance(full_name, str):
            logger.warning(f"Invalid name provided: {full_name}")
            return None
            
        full_name_clean = full_name.strip()
        logger.info(f"🔍 Starting name-based matching for: '{full_name_clean}'")
        
        # OPTIMIZED APPROACH: Get all org members first, then match against them
        try:
            # Add timeout to prevent connection issues
            timeout = aiohttp.ClientTimeout(total=30, connect=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                # Get all organization members (with retry logic)
                all_members = await self._get_all_org_members_with_profiles(session)
                
                if not all_members:
                    logger.warning(f"No organization members found to match against for '{full_name_clean}'. Orgs: {self.organizations}")
                    logger.warning(f"Org cache status: {[(org, len(members) if members else 0) for org, members in self._org_members_cache.items()]}")
                    return None
                
                
                # Try different matching strategies against the known member list
                result = await self._match_name_against_members(full_name_clean, all_members, fallback_email)
                
                if result:
                    return result
                    
        except Exception as e:
            logger.error(f"Error in optimized name matching: {e}")
        
        logger.warning(f"❌ No GitHub match found for name: '{full_name_clean}'")
        return None
    
    async def _get_all_org_members_with_profiles(self, session) -> List[Dict]:
        """Get all organization members with their profile information."""
        all_members = []

        try:
            if not self.organizations:
                logger.warning("No organizations configured for member fetching")
                return all_members

            for org in self.organizations:
                try:

                    # Get org members list
                    if org not in self._org_members_cache:
                        members = await self._get_org_members(org, session)
                        self._org_members_cache[org] = members

                    # Check if we have cached profiles already (persist across sync runs)
                    cache_key = f"{org}_profiles"
                    if cache_key in _GLOBAL_MEMBER_PROFILES_CACHE:
                        cached_profiles = _GLOBAL_MEMBER_PROFILES_CACHE[cache_key]
                        all_members.extend(cached_profiles)
                        continue

                    # Batch fetch profiles concurrently (much faster than sequential)
                    org_profiles = []
                    usernames = list(self._org_members_cache[org])

                    # Process in batches of 10 to avoid overwhelming the API
                    batch_size = 10
                    for i in range(0, len(usernames), batch_size):
                        batch = usernames[i:i + batch_size]

                        # Fetch all profiles in this batch concurrently
                        tasks = [self._get_github_user_profile(username, session) for username in batch]
                        profiles = await asyncio.gather(*tasks, return_exceptions=True)

                        # Process results
                        for username, profile in zip(batch, profiles):
                            if isinstance(profile, Exception):
                                logger.debug(f"Error fetching profile for {username}: {profile}")
                                continue

                            if profile:
                                profile_name = profile.get('name', '') or ''
                                org_profiles.append({
                                    'username': username,
                                    'name': profile_name.lower() if profile_name else '',
                                    'organization': org
                                })

                        # Small delay between batches to respect rate limits
                        if i + batch_size < len(usernames):
                            await asyncio.sleep(0.5)

                    # Cache profiles globally for this org
                    _GLOBAL_MEMBER_PROFILES_CACHE[cache_key] = org_profiles
                    all_members.extend(org_profiles)


                except Exception as org_error:
                    logger.error(f"Error fetching members for org {org}: {org_error}")
                    continue  # Skip this org and continue with others

        except Exception as e:
            logger.error(f"Critical error in member fetching: {e}")

        return all_members
    
    async def _match_name_against_members(self, full_name: str, members: List[Dict], fallback_email: Optional[str] = None) -> Optional[str]:
        """Match a name against the list of organization members."""
        full_name_lower = full_name.lower()
        
        # Extract name parts for matching
        name_parts = self._extract_name_parts_from_full_name(full_name)
        first_name = name_parts.get('first', '').lower()
        last_name = name_parts.get('last', '').lower()
        
        candidates = []
        
        # Strategy 1: High similarity name matching (instead of exact)
        for member in members:
            if not member['name']:
                continue
                
            # Calculate similarity between names
            similarity = self._calculate_name_similarity(full_name_lower, member['name'], first_name, last_name)
            
            # Very high similarity (95%+) - likely the same person
            if similarity > 0.95:
                return member['username']
            
            # Good similarity for candidate list
            elif similarity > 0.6:
                candidates.append((member['username'], similarity, member['name']))
        
        # Strategy 2: Username pattern matching (based on name parts)
        if first_name and last_name:
            # Try common username patterns based on name
            patterns = [
                f"{first_name}{last_name}",           # spencercheng
                f"{first_name}.{last_name}",          # spencer.cheng
                f"{first_name}-{last_name}",          # spencer-cheng  
                f"{first_name}_{last_name}",          # spencer_cheng
                f"{first_name[0]}{last_name}",        # scheng
                f"{first_name}{last_name[0]}",        # spencerc
                f"{first_name}h{last_name}",          # spencerhcheng (for Spencer -> spencerhcheng)
            ]
            
            for pattern in patterns:
                for member in members:
                    if member['username'].lower() == pattern:
                        return member['username']
        
        # Strategy 3: Return best candidate if we have good matches
        if candidates:
            # Sort by similarity score
            candidates.sort(key=lambda x: x[1], reverse=True)
            
            # Check if we have a clear winner (significantly better than others)
            best_match = candidates[0]
            best_score = best_match[1]
            
            # If the best match is significantly better than the second best, return it
            if len(candidates) == 1 or best_score - candidates[1][1] > 0.1:
                if best_score > 0.7:  # Only return if good enough score
                    return best_match[0]
            
            # If we have multiple similar candidates, log them for debugging
            for username, score, name in candidates[:3]:  # Show top 3
                logger.info(f"   - {username}: '{name}' (score: {score:.2f})")
                
            # Return the best one if it's above threshold
            if best_score > 0.8:  # Higher threshold for ambiguous cases
                return best_match[0]
            
        return None
    
    def _extract_name_parts_from_full_name(self, full_name: str) -> Dict[str, str]:
        """Extract name components from full name."""
        # Clean the name (allow word characters, spaces, hyphens, and dots)
        clean_name = re.sub(r'[^\w\s\-\.]', '', full_name.strip())
        parts = clean_name.split()
        
        if len(parts) == 0:
            return {}
        elif len(parts) == 1:
            return {
                'first': parts[0].lower(),
                'last': '',
                'full_parts': parts
            }
        else:
            return {
                'first': parts[0].lower(),
                'last': parts[-1].lower(),
                'middle': ' '.join(parts[1:-1]).lower() if len(parts) > 2 else '',
                'full_parts': parts
            }
    
    async def _try_name_username_patterns(self, name_parts: Dict[str, str], full_name: str, fallback_email: Optional[str] = None) -> Optional[str]:
        """Try common username patterns based on the full name."""
        if not name_parts or not name_parts.get('first'):
            return None
            
        firstname = name_parts.get('first', '')
        lastname = name_parts.get('last', '')
        
        patterns = []
        
        if firstname and lastname:
            patterns.extend([
                f"{firstname}{lastname}",           # spencercheng
                f"{firstname}.{lastname}",          # spencer.cheng
                f"{firstname}-{lastname}",          # spencer-cheng  
                f"{firstname}_{lastname}",          # spencer_cheng
                f"{firstname[0]}{lastname}",        # scheng
                f"{firstname}{lastname[0]}",        # spencerc
                f"{lastname}{firstname}",           # chengspencer
                f"{firstname[0]}.{lastname}",       # s.cheng
                f"{firstname}.{lastname[0]}",       # spencer.c
            ])
        
        if firstname:
            patterns.extend([
                firstname,                          # spencer
                f"{firstname}dev",                  # spencerdev
                f"{firstname}code",                 # spencercode
                f"{firstname}123",                  # spencer123
                f"{firstname}-dev",                 # spencer-dev
            ])
        
        # Remove duplicates and empty strings
        patterns = list(filter(None, list(dict.fromkeys(patterns))))
        
        # Check each pattern - limit for performance
        for pattern in patterns[:8]:  # Limit to 8 API calls max
            if await self._check_github_user_exists(pattern):
                # Verify user is in our organizations
                if await self._verify_user_in_organizations(pattern):
                    # Optional: Additional verification using name similarity
                    if await self._verify_username_matches_name(pattern, full_name):
                        return pattern
                
        return None
    
    async def _fuzzy_name_match_in_orgs(self, name_parts: Dict[str, str], full_name: str, fallback_email: Optional[str] = None) -> Optional[str]:
        """Search organization members using fuzzy name matching."""
        if not self.organizations or not name_parts.get('first'):
            return None
            
        try:
            async with aiohttp.ClientSession() as session:
                all_members = set()
                
                # Get all organization members
                for org in self.organizations:
                    if org not in self._org_members_cache:
                        members = await self._get_org_members(org, session)
                        self._org_members_cache[org] = members
                    all_members.update(self._org_members_cache[org])
                
                if not all_members:
                    return None
                
                # Get actual GitHub profiles to compare names
                firstname = name_parts.get('first', '').lower()
                lastname = name_parts.get('last', '').lower()
                candidates = []
                
                for username in all_members:
                    # Get user profile to check name
                    user_profile = await self._get_github_user_profile(username, session)
                    if not user_profile:
                        continue
                        
                    github_name = user_profile.get('name', '').lower()
                    if not github_name:
                        continue
                    
                    # Calculate name similarity
                    similarity_score = self._calculate_name_similarity(
                        full_name.lower(), 
                        github_name,
                        firstname,
                        lastname
                    )
                    
                    if similarity_score > 0.6:  # 60% similarity threshold
                        candidates.append((username, similarity_score, github_name))
                
                # Sort by similarity and return best match
                if candidates:
                    candidates.sort(key=lambda x: x[1], reverse=True)
                    best_match = candidates[0]
                    return best_match[0]
                        
        except Exception as e:
            logger.error(f"Error in fuzzy name match: {e}")
            
        return None
    
    async def _search_github_by_name(self, name_parts: Dict[str, str], full_name: str, fallback_email: Optional[str] = None) -> Optional[str]:
        """Search GitHub users by name using the search API."""
        try:
            async with aiohttp.ClientSession() as session:
                # Search for users by name
                search_query = full_name.replace(' ', '+')
                search_url = f"https://api.github.com/search/users?q={search_query}+in:fullname"
                
                async with session.get(search_url, headers=self.headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get('total_count', 0) > 0:
                            # Check each result
                            for item in data['items'][:5]:  # Check top 5 results
                                username = item['login']
                                
                                # Verify user is in our organizations
                                if await self._verify_user_in_organizations(username):
                                    # Get full profile for name verification
                                    user_profile = await self._get_github_user_profile(username, session)
                                    if user_profile and user_profile.get('name'):
                                        github_name = user_profile['name'].lower()
                                        if self._calculate_name_similarity(full_name.lower(), github_name, 
                                                                         name_parts.get('first', '').lower(),
                                                                         name_parts.get('last', '').lower()) > 0.7:
                                            return username
                
        except Exception as e:
            logger.error(f"Error in GitHub name search: {e}")
        
        return None
    
    async def _get_github_user_profile(self, username: str, session) -> Optional[Dict]:
        """Get GitHub user profile information."""
        try:
            url = f"https://api.github.com/users/{username}"
            async with session.get(url, headers=self.headers) as resp:
                if resp.status == 200:
                    return await resp.json()
        except Exception as e:
            logger.debug(f"Error getting profile for {username}: {e}")
        return None
    
    def _calculate_name_similarity(self, full_name1: str, full_name2: str, firstname: str = "", lastname: str = "") -> float:
        """Calculate similarity between two full names with multiple strategies."""
        if not full_name1 or not full_name2:
            return 0.0
            
        # Normalize names for comparison
        name1_clean = full_name1.lower().strip()
        name2_clean = full_name2.lower().strip()
        
        # Strategy 1: Direct string similarity
        direct_sim = SequenceMatcher(None, name1_clean, name2_clean).ratio()
        
        # Strategy 2: Component-based matching
        component_score = 0.0
        if firstname and lastname:
            # Check if both first and last names are present
            has_firstname = firstname in name2_clean
            has_lastname = lastname in name2_clean
            
            if has_firstname and has_lastname:
                component_score = 1.0  # Both names found
            elif has_firstname or has_lastname:
                component_score = 0.6  # One name found
        
        # Strategy 3: Word-based similarity (handles reordering)
        words1 = set(name1_clean.split())
        words2 = set(name2_clean.split())
        if words1 and words2:
            word_intersection = len(words1.intersection(words2))
            word_union = len(words1.union(words2))
            word_similarity = word_intersection / word_union if word_union > 0 else 0
        else:
            word_similarity = 0
        
        # Strategy 4: Initial matching (handles abbreviated names like "Spencer C.")
        initial_score = 0.0
        if firstname and len(name2_clean.split()) >= 2:
            name2_parts = name2_clean.split()
            if (firstname == name2_parts[0] and 
                lastname and len(name2_parts[1]) == 1 and 
                lastname.startswith(name2_parts[1])):
                initial_score = 0.8  # "Spencer Cheng" matches "spencer c"
        
        # Combine scores with weights
        final_score = (
            direct_sim * 0.3 +           # Direct string similarity
            component_score * 0.4 +      # Component presence  
            word_similarity * 0.2 +      # Word-based similarity
            initial_score * 0.1          # Initial matching bonus
        )
        
        return min(final_score, 1.0)  # Cap at 1.0
    
    async def _verify_username_matches_name(self, username: str, full_name: str) -> bool:
        """Verify that a username reasonably matches the given full name."""
        try:
            async with aiohttp.ClientSession() as session:
                user_profile = await self._get_github_user_profile(username, session)
                if user_profile and user_profile.get('name'):
                    github_name = user_profile['name'].lower()
                    similarity = self._calculate_name_similarity(full_name.lower(), github_name)
                    return similarity > 0.5  # 50% similarity threshold for verification
        except Exception as e:
            logger.debug(f"Error verifying name match for {username}: {e}")
        
        return True  # Default to True if we can't verify (don't be too strict)
    
    # OLD METHODS REMOVED - These are no longer used with the optimized approach
    
    async def _search_by_email_api(self, email: str) -> Optional[str]:
        """Search GitHub users by email using the search API."""
        try:
            async with aiohttp.ClientSession() as session:
                # Search users by email
                search_url = f"https://api.github.com/search/users?q={email}+in:email"
                async with session.get(search_url, headers=self.headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get('total_count', 0) > 0:
                            username = data['items'][0]['login']
                            # Skip email verification since GitHub emails are usually private
                            # Just verify org membership
                            if await self._verify_user_in_organizations(username):
                                return username
                
                # Try commits search
                search_url = f"https://api.github.com/search/commits?q=author-email:{email}"
                headers_with_preview = self.headers.copy()
                headers_with_preview['Accept'] = 'application/vnd.github.cloak-preview+json'
                
                async with session.get(search_url, headers=headers_with_preview) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get('total_count', 0) > 0:
                            # Get the author from the first commit
                            commit = data['items'][0]
                            if commit.get('author'):
                                username = commit['author']['login']
                                # CRITICAL: Verify user is actually in our organizations
                                if await self._verify_user_in_organizations(username):
                                    return username
                                
        except Exception as e:
            logger.error(f"Error in email API search: {e}")
        
        return None
    
    async def _try_exact_username_patterns(self, email_parts: Dict[str, str], full_name: Optional[str] = None) -> Optional[str]:
        """Try common username patterns based on email/name."""
        patterns = []
        
        firstname = email_parts.get('firstname', '')
        lastname = email_parts.get('lastname', '')
        
        if firstname and lastname:
            patterns.extend([
                f"{firstname}{lastname}",           # johnsmith
                f"{firstname}.{lastname}",          # john.smith
                f"{firstname}-{lastname}",          # john-smith
                f"{firstname}_{lastname}",          # john_smith
                f"{lastname}{firstname}",           # smithjohn
                f"{firstname[0]}{lastname}",        # jsmith
                f"{firstname}{lastname[0]}",        # johns
                f"{lastname}.{firstname}",          # smith.john
            ])
        
        if firstname:
            patterns.extend([
                firstname,                          # john
                f"{firstname}dev",                  # johndev
                f"{firstname}code",                 # johncode
                f"{firstname}123",                  # john123
            ])
        
        # Add full email local part
        patterns.append(email_parts.get('full', ''))
        
        # Try patterns from full name if provided
        if full_name:
            name_parts = full_name.lower().split()
            if len(name_parts) >= 2:
                patterns.extend([
                    ''.join(name_parts),            # fullname
                    '.'.join(name_parts),           # first.last
                    '-'.join(name_parts),           # first-last
                ])
        
        # Remove duplicates and empty strings
        patterns = list(filter(None, list(dict.fromkeys(patterns))))
        
        # Check each pattern - LIMIT to first 5 patterns for performance
        for pattern in patterns[:5]:  # Limit to 5 API calls max
            if await self._check_github_user_exists(pattern):
                # CRITICAL: Verify user is actually in our organizations
                if await self._verify_user_in_organizations(pattern):
                    return pattern
                
        return None
    
    async def _search_org_members(self, email: str, email_parts: Dict[str, str]) -> Optional[str]:
        """Search organization members for matches."""
        if not self.organizations:
            return None
            
        try:
            async with aiohttp.ClientSession() as session:
                all_members = set()
                
                # Get all organization members
                for org in self.organizations:
                    if org not in self._org_members_cache:
                        members = await self._get_org_members(org, session)
                        self._org_members_cache[org] = members
                    all_members.update(self._org_members_cache[org])
                
                # Skip email verification since GitHub emails are usually private
                # Instead, focus on name and username pattern matching
                
                # Try fuzzy matching on usernames
                firstname = email_parts.get('firstname', '').lower()
                lastname = email_parts.get('lastname', '').lower()
                
                best_match = None
                best_score = 0
                
                for username in all_members:
                    username_lower = username.lower()
                    
                    # Direct substring match
                    if firstname and firstname in username_lower:
                        score = len(firstname) / len(username_lower)
                        if lastname and lastname in username_lower:
                            score += len(lastname) / len(username_lower)
                        
                        if score > best_score:
                            best_score = score
                            best_match = username
                
                # Return if we have a good match (>50% similarity)
                if best_score > 0.5:
                    # Skip email verification, just return the best match
                    return best_match
                        
        except Exception as e:
            logger.error(f"Error in org member search: {e}")
            
        return None
    
    async def _search_commit_history(self, email: str, email_parts: Dict[str, str]) -> Optional[str]:
        """Search recent commits across organizations for email matches."""
        if not self.organizations:
            return None
            
        try:
            async with aiohttp.ClientSession() as session:
                for org in self.organizations:
                    # Get recent repos with activity
                    repos_url = f"https://api.github.com/orgs/{org}/repos?sort=pushed&per_page=10"
                    async with session.get(repos_url, headers=self.headers) as resp:
                        if resp.status != 200:
                            continue
                            
                        repos = await resp.json()
                        
                        for repo in repos[:5]:  # Check top 5 most active repos
                            # Search commits by email
                            commits_url = f"https://api.github.com/repos/{repo['full_name']}/commits"
                            
                            async with session.get(commits_url, headers=self.headers) as resp:
                                if resp.status != 200:
                                    continue
                                    
                                commits = await resp.json()
                                
                                for commit in commits:
                                    commit_email = commit.get('commit', {}).get('author', {}).get('email', '')
                                    if commit_email.lower() == email.lower():
                                        if commit.get('author'):
                                            username = commit['author']['login']
                                            # Verify user is in our organizations
                                            if await self._verify_user_in_organizations(username):
                                                return username
                                            
        except Exception as e:
            logger.error(f"Error in commit history search: {e}")
            
        return None
    
    async def _fuzzy_name_match(self, email_parts: Dict[str, str], full_name: Optional[str] = None) -> Optional[str]:
        """Use fuzzy matching to find similar usernames."""
        if not self.organizations:
            return None
            
        candidates = []
        firstname = email_parts.get('firstname', '').lower()
        lastname = email_parts.get('lastname', '').lower()
        
        if not firstname:
            return None
            
        try:
            async with aiohttp.ClientSession() as session:
                # Collect all members
                all_members = set()
                for org in self.organizations:
                    if org in self._org_members_cache:
                        all_members.update(self._org_members_cache[org])
                    else:
                        members = await self._get_org_members(org, session)
                        all_members.update(members)
                
                # Score each member
                for username in all_members:
                    username_lower = username.lower()
                    
                    # Calculate similarity scores
                    firstname_score = SequenceMatcher(None, firstname, username_lower).ratio()
                    
                    total_score = firstname_score
                    if lastname:
                        lastname_score = SequenceMatcher(None, lastname, username_lower).ratio()
                        total_score = (firstname_score + lastname_score) / 2
                    
                    if total_score > 0.7:  # 70% similarity threshold
                        candidates.append((username, total_score))
                
                # Sort by score and check top candidates
                candidates.sort(key=lambda x: x[1], reverse=True)
                
                for username, score in candidates[:3]:
                    # Verify with additional checks
                    if await self._check_user_commits_for_email(username, email_parts['email']):
                        # CRITICAL: Verify user is actually in our organizations
                        if await self._verify_user_in_organizations(username):
                            return username
                        
        except Exception as e:
            logger.error(f"Error in fuzzy name match: {e}")
            
        return None
    
    async def _verify_user_in_organizations(self, username: str) -> bool:
        """Verify that a user is a member of at least one of our specified organizations."""
        if not self.organizations:
            return True  # No org restrictions configured
            
        try:
            async with aiohttp.ClientSession() as session:
                for org in self.organizations:
                    # Get org members (use cache if available)
                    if org not in self._org_members_cache:
                        members = await self._get_org_members(org, session)
                        self._org_members_cache[org] = members
                    
                    if username in self._org_members_cache[org]:
                        return True
                        
                logger.warning(f"❌ User {username} is NOT a member of any specified organizations: {self.organizations}")
                return False
                
        except Exception as e:
            logger.error(f"Error verifying org membership for {username}: {e}")
            return False
    
    async def _check_github_user_exists(self, username: str) -> bool:
        """Check if a GitHub username exists."""
        if username in self._user_cache:
            return self._user_cache[username]
            
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.github.com/users/{username}"
                async with session.get(url, headers=self.headers) as resp:
                    exists = resp.status == 200
                    self._user_cache[username] = exists
                    return exists
        except Exception as e:
            logger.error(f"Error checking user {username}: {e}")
            return False
    
    async def _verify_user_email(self, username: str, email: str) -> bool:
        """Verify if a GitHub user has a specific email."""
        try:
            async with aiohttp.ClientSession() as session:
                # Check public profile
                url = f"https://api.github.com/users/{username}"
                async with session.get(url, headers=self.headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get('email', '').lower() == email.lower():
                            return True
                
                # Check recent commits
                return await self._check_user_commits_for_email(username, email)
                
        except Exception as e:
            logger.error(f"Error verifying email for {username}: {e}")
            return False
    
    async def _check_user_commits_for_email(self, username: str, email: str) -> bool:
        """Check if a user has commits with a specific email."""
        try:
            async with aiohttp.ClientSession() as session:
                # Get user's recent events
                events_url = f"https://api.github.com/users/{username}/events?per_page=10"
                async with session.get(events_url, headers=self.headers) as resp:
                    if resp.status != 200:
                        return False
                        
                    events = await resp.json()
                    
                    # Find repos with push events
                    repos = set()
                    for event in events:
                        if event.get('type') == 'PushEvent' and event.get('repo'):
                            repos.add(event['repo']['name'])
                    
                    # Check commits in recent repos
                    for repo in list(repos)[:2]:  # Check top 2 repos
                        commits_url = f"https://api.github.com/repos/{repo}/commits?author={username}&per_page=5"
                        async with session.get(commits_url, headers=self.headers) as resp:
                            if resp.status == 200:
                                commits = await resp.json()
                                for commit in commits:
                                    commit_email = commit.get('commit', {}).get('author', {}).get('email', '')
                                    if commit_email.lower() == email.lower():
                                        return True
                                        
        except Exception as e:
            logger.debug(f"Error checking commits for {username}: {e}")
            
        return False
    
    async def _get_org_members(self, org: str, session) -> Set[str]:
        """Get all members of an organization."""
        members = set()
        try:
            page = 1
            while True:
                url = f"https://api.github.com/orgs/{org}/members?per_page=100&page={page}"
                async with session.get(url, headers=self.headers) as resp:
                    if resp.status != 200:
                        break
                        
                    data = await resp.json()
                    if not data:
                        break
                        
                    members.update(member['login'] for member in data)
                    
                    # Check if there are more pages
                    if len(data) < 100:
                        break
                    page += 1
                    
        except Exception as e:
            logger.error(f"Error getting members for {org}: {e}")
            
        return members