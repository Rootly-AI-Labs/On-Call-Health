"""
GitHub API Manager - Enterprise-grade rate limiting and resilience.

Implements circuit breaker pattern, exponential backoff, and rate limiting
to ensure reliable GitHub API interactions at scale.
"""
import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable
from enum import Enum
import aiohttp

logger = logging.getLogger(__name__)


class GitHubPermissionError(Exception):
    """Raised when GitHub API returns 403 Forbidden due to insufficient permissions.

    This is a non-retryable error - retrying will not help since the permission
    issue won't change during the request retry window.
    """
    pass


class CircuitBreakerState(Enum):
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, blocking requests
    HALF_OPEN = "half_open"  # Attempting recovery


class GitHubAPIManager:
    """
    Enterprise-grade GitHub API management with resilience patterns.
    
    Features:
    - Rate limiting (5000 requests/hour GitHub limit)
    - Circuit breaker pattern for failure recovery
    - Exponential backoff with jitter
    - Request queuing and throttling
    - Comprehensive metrics and monitoring
    """
    
    def __init__(self):
        # Rate limiting configuration
        self.rate_limit_max = 5000  # GitHub API limit per hour
        self.rate_limit_window = 3600  # 1 hour in seconds
        self.request_history = []  # Track request timestamps
        
        # Circuit breaker configuration
        self.circuit_state = CircuitBreakerState.CLOSED
        self.failure_threshold = 5  # Open circuit after 5 consecutive failures
        self.recovery_timeout = 60  # Try to recover after 60 seconds
        self.failure_count = 0
        self.last_failure_time = None
        self.half_open_requests = 0
        self.half_open_max_requests = 3  # Allow 3 test requests in half-open state
        
        # Metrics tracking
        self.metrics = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "rate_limited_requests": 0,
            "circuit_breaker_blocks": 0,
            "average_response_time": 0.0,
            "last_reset": datetime.utcnow()
        }
        
        logger.info("🛡️ GitHubAPIManager initialized with enterprise resilience patterns")
    
    async def safe_api_call(
        self, 
        func: Callable, 
        *args, 
        max_retries: int = 3,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        Execute API call with full resilience stack.
        
        Args:
            func: Async function to call
            max_retries: Maximum retry attempts
            *args, **kwargs: Arguments for the function
            
        Returns:
            API response or None if all attempts failed
        """
        request_start = time.time()
        self.metrics["total_requests"] += 1
        
        # Check circuit breaker state
        if not self._check_circuit_breaker():
            self.metrics["circuit_breaker_blocks"] += 1
            logger.warning("🚫 Circuit breaker OPEN - blocking API request")
            return None
        
        # Check rate limits
        if not await self._check_rate_limit():
            self.metrics["rate_limited_requests"] += 1
            logger.warning("⏳ Rate limit exceeded - throttling request")
            return None
        
        # Execute with exponential backoff retry
        for attempt in range(max_retries + 1):
            try:
                if attempt > 0:
                    delay = self._calculate_backoff_delay(attempt)
                    logger.info(f"🔄 Retry attempt {attempt}/{max_retries} after {delay:.2f}s delay")
                    await asyncio.sleep(delay)

                # Execute the API call
                result = await func(*args, **kwargs)

                # Success: update metrics and circuit breaker
                duration = time.time() - request_start
                self._record_success(duration)

                return result

            except GitHubPermissionError as e:
                # Non-retryable permission error: fail fast without retry
                # Note: Don't record as failure for circuit breaker - 403 is expected for private repos
                logger.warning(f"⚠️ GitHub permission error (non-retryable): {e}")
                return None

            except aiohttp.ClientError as e:
                logger.warning(f"API call attempt {attempt + 1} failed: {e}")
                if attempt == max_retries:
                    # Final failure: update circuit breaker
                    self._record_failure()
                    return None

            except Exception as e:
                logger.error(f"Unexpected error in API call: {e}")
                self._record_failure()
                return None

        return None
    
    def _check_circuit_breaker(self) -> bool:
        """Check if circuit breaker allows the request."""
        current_time = time.time()
        
        if self.circuit_state == CircuitBreakerState.CLOSED:
            return True
            
        elif self.circuit_state == CircuitBreakerState.OPEN:
            # Check if we should transition to half-open
            if (self.last_failure_time and 
                current_time - self.last_failure_time >= self.recovery_timeout):
                logger.info("🔄 Circuit breaker transitioning to HALF_OPEN")
                self.circuit_state = CircuitBreakerState.HALF_OPEN
                self.half_open_requests = 0
                return True
            return False
            
        elif self.circuit_state == CircuitBreakerState.HALF_OPEN:
            # Allow limited requests to test recovery
            if self.half_open_requests < self.half_open_max_requests:
                self.half_open_requests += 1
                return True
            return False
        
        return False
    
    async def _check_rate_limit(self) -> bool:
        """Check if we're within GitHub API rate limits."""
        current_time = time.time()
        
        # Clean old requests outside the window
        cutoff_time = current_time - self.rate_limit_window
        self.request_history = [t for t in self.request_history if t > cutoff_time]
        
        # Check if we're under the limit
        if len(self.request_history) >= self.rate_limit_max:
            # Rate limited: calculate wait time
            oldest_request = min(self.request_history)
            wait_time = oldest_request + self.rate_limit_window - current_time
            
            if wait_time > 60:  # Don't wait more than 1 minute
                logger.warning(f"Rate limit exceeded, would need to wait {wait_time:.0f}s - skipping request")
                return False
            else:
                logger.info(f"Rate limit reached, waiting {wait_time:.1f}s")
                await asyncio.sleep(wait_time)
        
        # Record this request
        self.request_history.append(current_time)
        return True
    
    def _calculate_backoff_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay with jitter."""
        base_delay = min(300, (2 ** attempt))  # Cap at 5 minutes
        jitter = base_delay * 0.1 * (0.5 - abs(hash(str(time.time())) % 100) / 100)
        return base_delay + jitter
    
    def _record_success(self, duration: float):
        """Record successful API call."""
        self.metrics["successful_requests"] += 1
        
        # Update average response time
        total_successful = self.metrics["successful_requests"]
        current_avg = self.metrics["average_response_time"]
        self.metrics["average_response_time"] = (
            (current_avg * (total_successful - 1) + duration) / total_successful
        )
        
        # Reset circuit breaker on success
        if self.circuit_state == CircuitBreakerState.HALF_OPEN:
            logger.info("✅ Circuit breaker transitioning to CLOSED - service recovered")
            self.circuit_state = CircuitBreakerState.CLOSED
            self.failure_count = 0
            self.half_open_requests = 0
        elif self.circuit_state == CircuitBreakerState.CLOSED:
            self.failure_count = 0  # Reset failure count on success
    
    def _record_failure(self):
        """Record failed API call and update circuit breaker."""
        self.metrics["failed_requests"] += 1
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        # Check if we should open the circuit breaker
        if (self.circuit_state == CircuitBreakerState.CLOSED and 
            self.failure_count >= self.failure_threshold):
            logger.warning(f"🚨 Circuit breaker opening after {self.failure_count} failures")
            self.circuit_state = CircuitBreakerState.OPEN
            
        elif self.circuit_state == CircuitBreakerState.HALF_OPEN:
            logger.warning("💥 Circuit breaker returning to OPEN - recovery failed")
            self.circuit_state = CircuitBreakerState.OPEN
            self.half_open_requests = 0
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get current health and performance metrics."""
        current_time = time.time()
        cutoff_time = current_time - self.rate_limit_window
        recent_requests = len([t for t in self.request_history if t > cutoff_time])
        
        return {
            "circuit_breaker_state": self.circuit_state.value,
            "rate_limit_usage": {
                "requests_this_hour": recent_requests,
                "limit": self.rate_limit_max,
                "usage_percentage": (recent_requests / self.rate_limit_max) * 100,
                "requests_remaining": self.rate_limit_max - recent_requests
            },
            "performance_metrics": {
                "total_requests": self.metrics["total_requests"],
                "success_rate": (
                    (self.metrics["successful_requests"] / self.metrics["total_requests"]) * 100 
                    if self.metrics["total_requests"] > 0 else 0
                ),
                "average_response_time": self.metrics["average_response_time"],
                "rate_limited_requests": self.metrics["rate_limited_requests"],
                "circuit_breaker_blocks": self.metrics["circuit_breaker_blocks"]
            },
            "failure_metrics": {
                "consecutive_failures": self.failure_count,
                "time_since_last_failure": (
                    current_time - self.last_failure_time 
                    if self.last_failure_time else None
                )
            }
        }
    
    def reset_circuit_breaker(self):
        """Manually reset circuit breaker (for admin use)."""
        logger.info("🔧 Manually resetting circuit breaker")
        self.circuit_state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.half_open_requests = 0
        self.last_failure_time = None
    
    def reset_metrics(self):
        """Reset performance metrics."""
        logger.info("📊 Resetting API manager metrics")
        self.metrics = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "rate_limited_requests": 0,
            "circuit_breaker_blocks": 0,
            "average_response_time": 0.0,
            "last_reset": datetime.utcnow()
        }
    
    async def fetch_user_info(self, username: str, token: str) -> Optional[Dict[str, Any]]:
        """Fetch GitHub user information."""
        async def api_call():
            async with aiohttp.ClientSession() as session:
                headers = {
                    'Authorization': f'token {token}',
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Rootly-Burnout-Detector'
                }
                
                url = f'https://api.github.com/users/{username}'
                logger.info(f"🔍 Validating GitHub user: {username}")
                
                async with session.get(url, headers=headers) as response:
                    if response.status == 200:
                        user_data = await response.json()
                        logger.info(f"✅ Found GitHub user: {user_data.get('login')} ({user_data.get('name', 'No name')})")
                        return user_data
                    elif response.status == 404:
                        logger.warning(f"❌ GitHub user not found: {username}")
                        return {"error": "User not found", "status": 404}
                    else:
                        logger.error(f"❌ GitHub API error for {username}: {response.status}")
                        return {"error": f"API error: {response.status}", "status": response.status}
        
        try:
            result = await self.safe_api_call(api_call)
            return result
        except Exception as e:
            logger.error(f"Error fetching user info for {username}: {e}")
            return {"error": str(e)}


# Global instance for the application
github_api_manager = GitHubAPIManager()