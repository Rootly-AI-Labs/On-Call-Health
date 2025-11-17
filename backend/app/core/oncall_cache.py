"""
On-call status caching using Redis.
Cache expires at end of day (UTC midnight) since on-call schedules typically follow daily patterns.
"""
import redis
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Set

logger = logging.getLogger(__name__)

def get_redis_client() -> Optional[redis.Redis]:
    """Get Redis client for caching."""
    try:
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            logger.warning("REDIS_URL not set, on-call caching disabled")
            return None

        client = redis.from_url(redis_url, decode_responses=True)
        client.ping()  # Test connection
        return client
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        return None

def get_cache_key(integration_id: str) -> str:
    """
    Generate cache key for on-call data.
    Includes today's date so cache automatically expires at midnight.
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return f"oncall:{integration_id}:{today}"

def get_seconds_until_midnight() -> int:
    """Calculate seconds until UTC midnight for cache TTL."""
    now = datetime.utcnow()
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((midnight - now).total_seconds())

def get_cached_oncall_emails(integration_id: str) -> Optional[Set[str]]:
    """
    Get cached on-call emails for an integration.
    Returns None if cache miss.
    """
    try:
        client = get_redis_client()
        if not client:
            return None

        cache_key = get_cache_key(integration_id)
        cached_data = client.get(cache_key)

        if cached_data:
            data = json.loads(cached_data)
            logger.info(f"✅ Cache hit for {cache_key}: {len(data['emails'])} on-call users")
            return set(data['emails'])

        logger.info(f"❌ Cache miss for {cache_key}")
        return None
    except Exception as e:
        logger.error(f"Error reading from cache: {e}")
        return None

def set_cached_oncall_emails(integration_id: str, emails: Set[str]) -> bool:
    """
    Cache on-call emails for an integration until end of day.
    Returns True if successful.
    """
    try:
        client = get_redis_client()
        if not client:
            return False

        cache_key = get_cache_key(integration_id)
        ttl = get_seconds_until_midnight()

        data = {
            'emails': list(emails),
            'cached_at': datetime.utcnow().isoformat(),
            'expires_at': (datetime.utcnow() + timedelta(seconds=ttl)).isoformat()
        }

        client.setex(cache_key, ttl, json.dumps(data))
        logger.info(f"✅ Cached {len(emails)} on-call users for {cache_key} (expires in {ttl}s / {ttl/3600:.1f}h)")
        return True
    except Exception as e:
        logger.error(f"Error writing to cache: {e}")
        return False

def clear_oncall_cache(integration_id: str) -> bool:
    """
    Clear cached on-call data for an integration.
    Used when user clicks refresh button.
    """
    try:
        client = get_redis_client()
        if not client:
            return False

        cache_key = get_cache_key(integration_id)
        client.delete(cache_key)
        logger.info(f"🗑️  Cleared cache for {cache_key}")
        return True
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return False

def get_cache_info(integration_id: str) -> Optional[dict]:
    """
    Get cache metadata (when it was cached, when it expires).
    Returns None if cache miss.
    """
    try:
        client = get_redis_client()
        if not client:
            return None

        cache_key = get_cache_key(integration_id)
        cached_data = client.get(cache_key)

        if cached_data:
            data = json.loads(cached_data)
            ttl = client.ttl(cache_key)
            return {
                'cached_at': data.get('cached_at'),
                'expires_at': data.get('expires_at'),
                'ttl_seconds': ttl,
                'user_count': len(data['emails'])
            }

        return None
    except Exception as e:
        logger.error(f"Error getting cache info: {e}")
        return None
