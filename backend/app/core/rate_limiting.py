"""
Rate limiting configuration and middleware for API security.
"""
import redis
from typing import Optional
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import os
import logging

logger = logging.getLogger(__name__)

# Rate limiting configuration
RATE_LIMITS = {
    # Authentication endpoints - strict limits
    "auth_login": "10/minute",           # OAuth login attempts
    "auth_exchange": "5/minute",         # Token exchange attempts
    "auth_refresh": "20/minute",         # Token refresh attempts
    
    # Analysis endpoints - moderate limits
    "analysis_create": "3/minute",       # Create new analysis
    "analysis_get": "100/minute",        # View analysis results
    "analysis_list": "50/minute",        # List analyses
    
    # Integration endpoints - strict for setup, loose for usage
    "integration_create": "5/minute",    # Add new integrations
    "integration_update": "10/minute",   # Update integration settings
    "integration_test": "10/minute",     # Test integration connection
    "integration_get": "200/minute",     # View integrations
    
    # Mapping endpoints - moderate limits
    "mapping_create": "20/minute",       # Create user mappings
    "mapping_update": "30/minute",       # Update mappings
    "mapping_delete": "15/minute",       # Delete mappings
    "mapping_validate": "5/minute",      # Validate GitHub mappings
    
    # General API endpoints
    "api_general": "1000/minute",        # General API calls
    "api_heavy": "100/minute",           # Heavy operations
}

def get_redis_client() -> Optional[redis.Redis]:
    """Get Redis client for rate limiting storage."""
    try:
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            return redis.from_url(redis_url)
        
        # Fallback to localhost Redis
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_DB", "1"))  # Use DB 1 for rate limiting
        
        client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            decode_responses=True,
            socket_timeout=5.0,
            socket_connect_timeout=5.0
        )
        
        # Test connection
        client.ping()
        logger.info(f"✅ Connected to Redis for rate limiting: {redis_host}:{redis_port}")
        return client
        
    except Exception as e:
        logger.warning(f"⚠️  Redis not available for rate limiting, using in-memory: {e}")
        return None

def get_rate_limit_key(request: Request) -> str:
    """
    Generate rate limit key based on user context.
    Priority: authenticated user > IP address
    """
    try:
        # Try to get authenticated user ID from JWT token
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            # We'll enhance this to extract user ID from JWT if needed
            # For now, using IP address as fallback is secure
            pass
            
        # Check if user info is available in request state
        if hasattr(request.state, "user_id"):
            return f"user:{request.state.user_id}"
            
    except Exception:
        pass
    
    # Defensive fallback to IP address with type checking
    try:
        # Ensure request is the correct type before calling get_remote_address
        if hasattr(request, 'client') and hasattr(request.client, 'host'):
            return request.client.host
        else:
            return get_remote_address(request)
    except Exception as e:
        logger.warning(f"Failed to get remote address for rate limiting: {e}")
        # Ultimate fallback
        return "unknown"

# Initialize rate limiter
redis_client = get_redis_client()

if redis_client:
    # Use Redis for distributed rate limiting (production)
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = os.getenv("REDIS_PORT", "6379")
    limiter = Limiter(
        key_func=get_rate_limit_key,
        storage_uri=f"redis://{redis_host}:{redis_port}/1"
    )
    logger.info(f"✅ Rate limiting using Redis storage: {redis_host}:{redis_port}")
else:
    # Use in-memory storage (development/fallback)
    limiter = Limiter(key_func=get_rate_limit_key)
    logger.info("⚠️  Rate limiting using in-memory storage")

def custom_rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Custom rate limit exceeded response with security headers.
    """
    logger.warning(f"🚨 Rate limit exceeded for {get_rate_limit_key(request)} on {request.url.path}")
    
    response = JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "detail": f"Rate limit exceeded: {exc.detail}",
            "retry_after": exc.retry_after if hasattr(exc, 'retry_after') else 60
        }
    )
    
    # Add security headers
    response.headers["Retry-After"] = str(exc.retry_after if hasattr(exc, 'retry_after') else 60)
    response.headers["X-RateLimit-Limit"] = str(getattr(exc, 'limit', 'unknown'))
    response.headers["X-RateLimit-Remaining"] = "0"
    
    return response

# Rate limiting decorators for different endpoint types
def auth_rate_limit(endpoint_type: str = "auth_login"):
    """Rate limiter for authentication endpoints."""
    return limiter.limit(RATE_LIMITS.get(endpoint_type, "10/minute"))

def analysis_rate_limit(endpoint_type: str = "analysis_get"):
    """Rate limiter for analysis endpoints.""" 
    return limiter.limit(RATE_LIMITS.get(endpoint_type, "100/minute"))

def integration_rate_limit(endpoint_type: str = "integration_get"):
    """Rate limiter for integration endpoints."""
    return limiter.limit(RATE_LIMITS.get(endpoint_type, "200/minute"))

def mapping_rate_limit(endpoint_type: str = "mapping_create"):
    """Rate limiter for mapping endpoints."""
    return limiter.limit(RATE_LIMITS.get(endpoint_type, "20/minute"))

def general_rate_limit(endpoint_type: str = "api_general"):
    """Rate limiter for general API endpoints."""
    return limiter.limit(RATE_LIMITS.get(endpoint_type, "1000/minute"))

def heavy_rate_limit(endpoint_type: str = "api_heavy"):
    """Rate limiter for heavy/expensive operations."""
    return limiter.limit(RATE_LIMITS.get(endpoint_type, "100/minute"))

# Rate limiting bypass for testing/development
def bypass_rate_limiting() -> bool:
    """Check if rate limiting should be bypassed."""
    return os.getenv("BYPASS_RATE_LIMITING", "false").lower() == "true"

def conditional_rate_limit(rate_limit_func):
    """Decorator that conditionally applies rate limiting."""
    def decorator(func):
        if bypass_rate_limiting():
            logger.info("⚠️  Rate limiting bypassed for development")
            return func
        return rate_limit_func(func)
    return decorator