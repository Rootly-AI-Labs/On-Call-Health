"""
AI Usage Collector — fetches daily token consumption from OpenAI and Anthropic.

OpenAI:  GET /v1/organization/usage/completions  (grouped by day, up to 90 days)
         GET /v1/organization/members             (to resolve user_id -> email)
Anthropic: GET /v1/organizations/usage_report/messages (workspace-level, by day)
"""
import logging
import httpx
from datetime import date, timedelta
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Data shape returned to callers
# --------------------------------------------------------------------------- #
# {
#   "2025-03-01": {"input_tokens": 12000, "output_tokens": 4000, "total_tokens": 16000, "requests": 45},
#   ...
# }
DailyUsage = dict  # date str -> {input_tokens, output_tokens, total_tokens, requests}


def _empty_day() -> dict:
    return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "requests": 0}


def _merge(a: DailyUsage, b: DailyUsage) -> DailyUsage:
    """Merge two DailyUsage dicts by summing values for shared keys."""
    result = dict(a)
    for day, vals in b.items():
        if day in result:
            result[day] = {
                "input_tokens": result[day]["input_tokens"] + vals["input_tokens"],
                "output_tokens": result[day]["output_tokens"] + vals["output_tokens"],
                "total_tokens": result[day]["total_tokens"] + vals["total_tokens"],
                "requests": result[day]["requests"] + vals["requests"],
            }
        else:
            result[day] = vals
    return result


# --------------------------------------------------------------------------- #
#  OpenAI
# --------------------------------------------------------------------------- #

async def fetch_openai_usage(
    api_key: str,
    org_id: Optional[str],
    days: int = 30,
) -> DailyUsage:
    """
    Fetch daily token usage from OpenAI Admin API.
    Requires an Admin-level key (org:read scope).
    """
    end = date.today()
    start = end - timedelta(days=days - 1)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if org_id and org_id.strip():
        headers["OpenAI-Organization"] = org_id.strip()

    params = {
        "start_time": _date_to_unix(start),
        "end_time": _date_to_unix(end + timedelta(days=1)),
        "bucket_width": "1d",
        "limit": min(days, 31),
    }

    _MAX_RESPONSE_BYTES = 5 * 1024 * 1024  # 5 MB guard
    usage: DailyUsage = {}
    url = "https://api.openai.com/v1/organization/usage/completions"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            while url:
                for attempt in range(2):
                    resp = await client.get(url, headers=headers, params=params)
                    if resp.status_code != 503 or attempt == 1:
                        break
                    logger.warning("[AI_USAGE] OpenAI 503 — retrying once")
                if resp.status_code != 200:
                    logger.warning(f"[AI_USAGE] OpenAI returned {resp.status_code}: {resp.text[:200]}")
                    break
                if len(resp.content) > _MAX_RESPONSE_BYTES:
                    logger.warning("[AI_USAGE] OpenAI response too large — skipping page")
                    break
                data = resp.json()
                for bucket in data.get("data", []):
                    day_str = _unix_to_date(bucket["start_time"])
                    for result in bucket.get("results", []):
                        if day_str not in usage:
                            usage[day_str] = _empty_day()
                        usage[day_str]["input_tokens"] += result.get("input_tokens", 0) or 0
                        usage[day_str]["output_tokens"] += result.get("output_tokens", 0) or 0
                        usage[day_str]["total_tokens"] += (result.get("input_tokens", 0) or 0) + (result.get("output_tokens", 0) or 0)
                        usage[day_str]["requests"] += result.get("num_model_requests", 0) or 0

                next_page = data.get("next_page")
                url = f"https://api.openai.com/v1/organization/usage/completions?cursor={next_page}" if next_page else None
                params = {}  # params only needed on first request
    except Exception as e:
        logger.error(f"[AI_USAGE] OpenAI fetch error: {e}")

    return usage


async def fetch_openai_members(api_key: str) -> Dict[str, str]:
    """Return {openai_user_id -> email} for all members of the OpenAI org.
    Uses GET /v1/organization/users (Admin API).
    """
    result: Dict[str, str] = {}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            after = None
            for _ in range(20):
                params: dict = {"limit": 100}
                if after:
                    params["after"] = after
                resp = await client.get(
                    "https://api.openai.com/v1/organization/users",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params=params,
                )
                if resp.status_code != 200:
                    logger.warning(f"[AI_USAGE] OpenAI members API {resp.status_code}: {resp.text[:200]}")
                    break
                data = resp.json()
                for member in data.get("data", []):
                    # /v1/organization/users returns flat objects: {id, email, name, role, ...}
                    uid = member.get("id", "")
                    email = (member.get("email") or "").lower().strip()
                    if uid and email:
                        result[uid] = email
                if not data.get("has_more"):
                    break
                last = data.get("data", [])
                after = last[-1]["id"] if last else None
    except Exception as e:
        logger.error(f"[AI_USAGE] OpenAI members fetch error: {e}")
    return result


async def fetch_openai_usage_per_user(
    api_key: str,
    org_id: Optional[str],
    days: int = 30,
    user_id_to_email: Optional[Dict[str, str]] = None,
) -> Dict[str, DailyUsage]:
    """
    Fetch daily token usage from OpenAI grouped by user_id.
    Returns {email -> DailyUsage}.
    If user_id_to_email is not provided, fetches it automatically.
    """
    if user_id_to_email is None:
        user_id_to_email = await fetch_openai_members(api_key)

    if not user_id_to_email:
        return {}

    end = date.today()
    start = end - timedelta(days=days - 1)

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if org_id and org_id.strip():
        headers["OpenAI-Organization"] = org_id.strip()

    params = {
        "start_time": _date_to_unix(start),
        "end_time": _date_to_unix(end + timedelta(days=1)),
        "bucket_width": "1d",
        "limit": min(days, 31),
        "group_by": "user_id",
    }

    _MAX_RESPONSE_BYTES = 5 * 1024 * 1024
    per_user: Dict[str, DailyUsage] = {}  # email -> {date -> entry}
    url = "https://api.openai.com/v1/organization/usage/completions"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            while url:
                for attempt in range(2):
                    resp = await client.get(url, headers=headers, params=params)
                    if resp.status_code != 503 or attempt == 1:
                        break
                    logger.warning("[AI_USAGE] OpenAI per-user 503 — retrying once")
                if resp.status_code != 200:
                    logger.warning(f"[AI_USAGE] OpenAI per-user returned {resp.status_code}: {resp.text[:200]}")
                    break
                if len(resp.content) > _MAX_RESPONSE_BYTES:
                    logger.warning("[AI_USAGE] OpenAI per-user response too large — skipping")
                    break
                data = resp.json()
                for bucket in data.get("data", []):
                    day_str = _unix_to_date(bucket["start_time"])
                    for result in bucket.get("results", []):
                        uid = result.get("user_id") or ""
                        email = user_id_to_email.get(uid, "")
                        if not email:
                            continue
                        if email not in per_user:
                            per_user[email] = {}
                        if day_str not in per_user[email]:
                            per_user[email][day_str] = _empty_day()
                        per_user[email][day_str]["input_tokens"] += result.get("input_tokens", 0) or 0
                        per_user[email][day_str]["output_tokens"] += result.get("output_tokens", 0) or 0
                        per_user[email][day_str]["total_tokens"] += (result.get("input_tokens", 0) or 0) + (result.get("output_tokens", 0) or 0)
                        per_user[email][day_str]["requests"] += result.get("num_model_requests", 0) or 0

                next_page = data.get("next_page")
                url = f"https://api.openai.com/v1/organization/usage/completions?cursor={next_page}" if next_page else None
                params = {}
    except Exception as e:
        logger.error(f"[AI_USAGE] OpenAI per-user fetch error: {e}")

    return per_user


# --------------------------------------------------------------------------- #
#  Anthropic
# --------------------------------------------------------------------------- #

async def fetch_anthropic_usage(
    api_key: str,
    workspace_id: Optional[str],
    days: int = 30,
) -> DailyUsage:
    """
    Fetch daily token usage from Anthropic Admin API.
    Requires an Admin API key (sk-ant-admin-...).

    API docs: GET /v1/organizations/usage_report/messages
    - Uses starting_at / ending_at (RFC 3339 timestamps)
    - bucket_width=1d (max 31 days per request — paginate for longer ranges)
    - workspace_ids as query param array (not a header)
    - Response: data[].{ starting_at, ending_at, results[].{ uncached_input_tokens, cache_read_input_tokens, output_tokens, ... } }
    """
    from datetime import datetime, timezone

    end = date.today()
    start = end - timedelta(days=days - 1)

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    usage: DailyUsage = {}

    # Anthropic allows max 31 days per request for bucket_width=1d.
    # Chunk into ≤31-day windows and paginate within each window.
    MAX_DAYS_PER_CHUNK = 31
    chunk_start = start

    try:
        _MAX_RESPONSE_BYTES = 5 * 1024 * 1024  # 5 MB guard
        async with httpx.AsyncClient(timeout=30) as client:
            while chunk_start <= end:
                chunk_end = min(chunk_start + timedelta(days=MAX_DAYS_PER_CHUNK - 1), end)

                params: dict = {
                    "starting_at": datetime(chunk_start.year, chunk_start.month, chunk_start.day, tzinfo=timezone.utc).isoformat(),
                    "ending_at": datetime(chunk_end.year, chunk_end.month, chunk_end.day, 23, 59, 59, tzinfo=timezone.utc).isoformat(),
                    "bucket_width": "1d",
                    "limit": MAX_DAYS_PER_CHUNK,
                }
                if workspace_id and workspace_id.strip():
                    params["workspace_ids[]"] = workspace_id.strip()

                # Paginate within this chunk
                while True:
                    for attempt in range(2):
                        resp = await client.get(
                            "https://api.anthropic.com/v1/organizations/usage_report/messages",
                            headers=headers,
                            params=params,
                        )
                        if resp.status_code != 503 or attempt == 1:
                            break
                        logger.warning("[AI_USAGE] Anthropic 503 — retrying once")
                    if resp.status_code != 200:
                        logger.warning(f"[AI_USAGE] Anthropic returned {resp.status_code}: {resp.text[:300]}")
                        break
                    if len(resp.content) > _MAX_RESPONSE_BYTES:
                        logger.warning("[AI_USAGE] Anthropic response too large — skipping page")
                        break

                    data = resp.json()
                    for bucket in data.get("data", []):
                        # starting_at is an RFC 3339 string e.g. "2025-03-01T00:00:00Z"
                        day_str = (bucket.get("starting_at") or "")[:10]
                        if not day_str:
                            continue
                        if day_str not in usage:
                            usage[day_str] = _empty_day()
                        for result in bucket.get("results", []):
                            # input = uncached + cache_read (both billed as input)
                            uncached = result.get("uncached_input_tokens", 0) or 0
                            cache_read = result.get("cache_read_input_tokens", 0) or 0
                            cache_creation = result.get("cache_creation") or {}
                            cache_write = (
                                (cache_creation.get("ephemeral_5m_input_tokens", 0) or 0)
                                + (cache_creation.get("ephemeral_1h_input_tokens", 0) or 0)
                            )
                            input_tokens = uncached + cache_read + cache_write
                            output_tokens = result.get("output_tokens", 0) or 0
                            usage[day_str]["input_tokens"] += input_tokens
                            usage[day_str]["output_tokens"] += output_tokens
                            usage[day_str]["total_tokens"] += input_tokens + output_tokens
                            # Each result entry in the bucket represents at least 1 request
                            usage[day_str]["requests"] += 1

                    if data.get("has_more") and data.get("next_page"):
                        params = {"page": data["next_page"]}
                    else:
                        break

                chunk_start = chunk_end + timedelta(days=1)

    except Exception as e:
        logger.error(f"[AI_USAGE] Anthropic fetch error: {e}")

    return usage


# --------------------------------------------------------------------------- #
#  Combined collector
# --------------------------------------------------------------------------- #

async def collect_ai_usage(
    openai_api_key: Optional[str] = None,
    openai_org_id: Optional[str] = None,
    anthropic_api_key: Optional[str] = None,
    anthropic_workspace_id: Optional[str] = None,
    days: int = 30,
) -> dict:
    """
    Fetch usage from each provider separately.
    Always fetches at least 30 days (or 90 if days > 30) then trims to the
    requested date range.
    Returns {"openai": DailyUsage, "anthropic": DailyUsage}.
    """
    fetch_days = 90 if days > 30 else 30
    cutoff = (date.today() - timedelta(days=days - 1)).isoformat()

    openai_data: DailyUsage = {}
    anthropic_data: DailyUsage = {}
    openai_per_user: Dict[str, DailyUsage] = {}
    members_map: Dict[str, str] = {}

    if openai_api_key:
        # Fetch member list once to reuse for both team-total and per-user calls
        members_map = await fetch_openai_members(openai_api_key)

        raw = await fetch_openai_usage(openai_api_key, openai_org_id, fetch_days)
        openai_data = {k: v for k, v in raw.items() if k >= cutoff}
        logger.info(f"[AI_USAGE] OpenAI: {len(raw)} days fetched, {len(openai_data)} after trim to {days}d")

        raw_per_user = await fetch_openai_usage_per_user(openai_api_key, openai_org_id, fetch_days, members_map)
        openai_per_user = {
            email: {k: v for k, v in daily.items() if k >= cutoff}
            for email, daily in raw_per_user.items()
        }
        logger.info(f"[AI_USAGE] OpenAI per-user: {len(openai_per_user)} users with data")

    if anthropic_api_key:
        raw = await fetch_anthropic_usage(anthropic_api_key, anthropic_workspace_id, fetch_days)
        anthropic_data = {k: v for k, v in raw.items() if k >= cutoff}
        logger.info(f"[AI_USAGE] Anthropic: {len(raw)} days fetched, {len(anthropic_data)} after trim to {days}d")

    return {
        "openai": openai_data,
        "anthropic": anthropic_data,
        "openai_per_user": openai_per_user,
        "openai_members_map": members_map,  # {openai_user_id -> openai_email}
    }


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

def _date_to_unix(d: date) -> int:
    from datetime import datetime, timezone
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


def _unix_to_date(ts: int) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
