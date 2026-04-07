"""
Weekly email digest service for auto-refresh analyses.
"""
import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import and_, func
from sqlalchemy.exc import IntegrityError

from ..core.config import settings
from ..models import Analysis, SessionLocal, User, UserCorrelation, WeeklyDigestLog
from ..models.survey_schedule import SurveySchedule

logger = logging.getLogger(__name__)


# Tracks scheduler start time for FORCE_SEND countdown logging
_scheduler_start_time: Optional[datetime] = None
_DIGEST_INTERVAL_MINUTES = 10


def _ensure_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            data = json.loads(value)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def _get_user_timezone(db, user_id: int) -> str:
    # 1. Try user_correlations.timezone by user_id (populated from integration sync)
    correlation = db.query(UserCorrelation).filter(
        UserCorrelation.user_id == user_id,
        UserCorrelation.timezone.isnot(None),
    ).order_by(
        UserCorrelation.last_synced_at.desc().nullslast(),
        UserCorrelation.id.desc()
    ).first()
    tz_name = correlation.timezone if correlation else None

    # 2. Fallback: match user_correlations by email (handles accounts not yet linked by user_id)
    if not tz_name:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.email:
            correlation = db.query(UserCorrelation).filter(
                UserCorrelation.email == user.email,
                UserCorrelation.timezone.isnot(None),
            ).order_by(
                UserCorrelation.last_synced_at.desc().nullslast(),
                UserCorrelation.id.desc()
            ).first()
            tz_name = correlation.timezone if correlation else None

    # 3. Fallback: survey_schedules.timezone for the user's organization
    if not tz_name:
        user = user if 'user' in dir() else db.query(User).filter(User.id == user_id).first()
        if user and user.organization_id:
            schedule = db.query(SurveySchedule).filter(
                SurveySchedule.organization_id == user.organization_id,
                SurveySchedule.timezone.isnot(None),
            ).first()
            tz_name = schedule.timezone if schedule else None

    # 4. Final fallback: UTC
    if not tz_name:
        return "UTC"

    try:
        pytz.timezone(tz_name)
        return tz_name
    except Exception:
        return "UTC"


def _get_week_start_date(local_dt: datetime) -> datetime.date:
    days_since_monday = local_dt.weekday()
    monday = (local_dt - timedelta(days=days_since_monday)).date()
    return monday


def _format_relative_time(then_dt: datetime, now_dt: datetime) -> str:
    delta = now_dt - then_dt
    seconds = max(0, int(delta.total_seconds()))

    if seconds < 60:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = hours // 24
    if days < 7:
        return f"{days} day{'s' if days != 1 else ''} ago"
    weeks = days // 7
    return f"{weeks} week{'s' if weeks != 1 else ''} ago"


def _get_week_start_date_key(date_obj: datetime) -> str:
    day_of_week = date_obj.weekday()
    monday = date_obj - timedelta(days=day_of_week)
    return monday.date().isoformat()


def _aggregate_to_weekly(daily_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    dates = sorted(daily_data.keys())
    if not dates:
        return []

    weekly_buckets: Dict[str, List[float]] = {}
    for date_str in dates:
        try:
            date_obj = datetime.fromisoformat(date_str)
        except Exception:
            continue
        day_data = daily_data.get(date_str, {}) if isinstance(daily_data.get(date_str), dict) else {}
        day_score = day_data.get("health_score") or 0
        week_key = _get_week_start_date_key(date_obj)
        weekly_buckets.setdefault(week_key, []).append(day_score)

    weekly_data = []
    for week_start, scores in weekly_buckets.items():
        avg_score = sum(scores) / len(scores) if scores else 0
        weekly_data.append({"weekStart": week_start, "score": avg_score})

    return sorted(weekly_data, key=lambda x: x["weekStart"])


def _calculate_user_trend(
    user_email: str,
    individual_daily_data: Optional[Dict[str, Dict[str, Any]]]
) -> str:
    default_trend = "stable"
    if not individual_daily_data or not user_email:
        return default_trend

    user_data = individual_daily_data.get(user_email) or individual_daily_data.get(user_email.lower())
    if not user_data:
        return default_trend

    weekly_data = _aggregate_to_weekly(user_data)
    if len(weekly_data) < 2:
        return default_trend

    num_weeks_to_compare = min(2, len(weekly_data) // 2)
    if num_weeks_to_compare <= 0:
        return default_trend

    first_weeks_avg = sum(w["score"] for w in weekly_data[:num_weeks_to_compare]) / num_weeks_to_compare
    last_weeks_avg = sum(w["score"] for w in weekly_data[-num_weeks_to_compare:]) / num_weeks_to_compare

    both_low = first_weeks_avg < 10 and last_weeks_avg < 10
    abs_diff = last_weeks_avg - first_weeks_avg

    if both_low:
        if abs_diff <= -5:
            return "significantly_improving"
        if abs_diff <= -2:
            return "improving"
        if abs_diff >= 5:
            return "significantly_worsening"
        if abs_diff >= 2:
            return "worsening"
        return "stable"

    baseline = first_weeks_avg if first_weeks_avg != 0 else 1
    change = ((last_weeks_avg - first_weeks_avg) / baseline) * 100

    if change <= -30:
        return "significantly_improving"
    if change <= -15:
        return "improving"
    if change >= 30:
        return "significantly_worsening"
    if change >= 15:
        return "worsening"
    return "stable"


def _extract_members(results: Dict[str, Any]) -> List[Dict[str, Any]]:
    team_analysis = results.get("team_analysis", {})
    if isinstance(team_analysis, list):
        return team_analysis
    if isinstance(team_analysis, dict):
        return team_analysis.get("members", []) or []
    return []


def _build_member_lists(
    members: List[Dict[str, Any]],
    individual_daily_data: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    critical_trend = []
    worsening_trend = []

    for member in members:
        email = member.get("user_email") or ""
        if not email:
            continue
        trend = _calculate_user_trend(email, individual_daily_data)
        if trend == "significantly_worsening":
            critical_trend.append(member)
        elif trend == "worsening":
            worsening_trend.append(member)

    critical_trend.sort(key=lambda m: m.get("och_score") or 0, reverse=True)
    worsening_trend.sort(key=lambda m: m.get("och_score") or 0, reverse=True)
    return critical_trend, worsening_trend


def _format_member_item(member: Dict[str, Any]) -> str:
    name = member.get("user_name") or member.get("user_email") or "Unknown"
    email = member.get("user_email") or ""
    risk_level = member.get("risk_level") or "unknown"
    score = member.get("och_score")
    score_str = f"{round(score)}" if isinstance(score, (int, float)) else "n/a"
    return f"{name} ({email}) - Risk: {risk_level}, Score: {score_str}"


def _get_risk_summary(members: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(members)
    # Match dashboard logic: use och_score thresholds, only on-call members (incident_count > 0)
    oncall = [m for m in members if (m.get("incident_count") or 0) > 0]
    at_risk = sum(
        1 for m in oncall
        if isinstance(m.get("och_score"), (int, float)) and m["och_score"] >= 25
    )
    scores = [
        m["och_score"] for m in members
        if isinstance(m.get("och_score"), (int, float))
    ]
    avg_score = round(sum(scores) / len(scores)) if scores else None
    return {"total": total, "at_risk": at_risk, "avg_score": avg_score}


def _generate_unsubscribe_token(user_id: int) -> str:
    ts = int(time.time())
    payload = f"{user_id}:{ts}"
    secret = settings.JWT_SECRET_KEY.encode("utf-8")
    sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_unsubscribe_token(token: str) -> Optional[str]:
    if not token:
        return None

    # Basic length guard to reduce brute-force surface and input abuse.
    # Expected payload is small; allow some slack for future extensions.
    if len(token) < 20 or len(token) > 512:
        return None

    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.b64decode(padded.encode(), altchars=b"-_", validate=True)
        return raw.decode()
    except Exception:
        return None


def verify_unsubscribe_token(token: str) -> Optional[int]:
    try:
        raw = _decode_unsubscribe_token(token)
        if not raw:
            return None

        last_colon = raw.rfind(":")
        if last_colon == -1:
            return None
        payload = raw[:last_colon]
        sig_hex = raw[last_colon + 1:]
        if len(sig_hex) != 64:
            return None

        try:
            sig = bytes.fromhex(sig_hex)
        except ValueError:
            return None

        secret = settings.JWT_SECRET_KEY.encode("utf-8")
        expected = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        parts = payload.split(":")
        if len(parts) != 2:
            return None
        if not parts[0].isdigit() or not parts[1].isdigit():
            return None
        uid, ts = int(parts[0]), int(parts[1])
        if uid <= 0:
            return None
        now = int(time.time())
        # Reject tokens far in the future (clock skew guard).
        if ts > now + 300:
            return None
        if now - ts > 90 * 24 * 3600:  # 90-day expiry
            return None
        return uid
    except Exception:
        return None


def _get_next_digest_time(tz_name: str) -> str:
    """Returns the next Monday at 10am in the given timezone, as UTC ISO string."""
    tz = pytz.timezone(tz_name)
    now = datetime.now(tz)
    days_until_monday = (7 - now.weekday()) % 7
    if days_until_monday == 0 and now.hour >= 10:
        days_until_monday = 7
    next_monday = now + timedelta(days=days_until_monday)
    next_10am = next_monday.replace(hour=10, minute=0, second=0, microsecond=0)
    return next_10am.astimezone(timezone.utc).isoformat()


def _build_email_content(
    user: User,
    analysis: Analysis,
    results: Dict[str, Any],
    local_now: datetime,
    tz_name: str,
    unsubscribe_url: str = "",
) -> Dict[str, str]:
    members = _extract_members(results)
    individual_daily_data = results.get("individual_daily_data") or {}
    if not isinstance(individual_daily_data, dict):
        individual_daily_data = {}

    critical_trend, worsening_trend = _build_member_lists(members, individual_daily_data)
    risk = _get_risk_summary(members)

    # ─ Sort by worst trends first, then by risk level ─
    critical_emails = {m.get("user_email") for m in critical_trend}
    worsening_emails = {m.get("user_email") for m in worsening_trend}

    combined_trends = []
    for member in members:
        email = member.get("user_email")
        if email in critical_emails:
            member["trend_type"] = "significantly_worsening"
            member["trend_priority"] = 0
        elif email in worsening_emails:
            member["trend_type"] = "worsening"
            member["trend_priority"] = 1
        else:
            member["trend_type"] = "worsening"
            member["trend_priority"] = 2
        combined_trends.append(member)

    combined_trends = sorted(
        combined_trends,
        key=lambda m: (
            m.get("trend_priority", 999),
            -m.get("och_score", 0)
        )
    )[:6]  # Top 6 by worst trends first, then highest risk level

    completed_at = analysis.completed_at
    if completed_at and completed_at.tzinfo is None:
        completed_at = completed_at.replace(tzinfo=timezone.utc)

    local_completed = completed_at.astimezone(local_now.tzinfo) if completed_at else None
    last_updated_relative = _format_relative_time(local_completed, local_now) if local_completed else "unknown"
    last_updated_absolute = local_completed.strftime("%b %d, %Y %I:%M %p %Z") if local_completed else "unknown"

    integration_name = analysis.integration_name or analysis.platform or "your integration"
    time_range = analysis.time_range or 30
    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
    platform = (analysis.platform or "").lower()

    # Team risk level label based on avg OCH score (higher = more risk)
    avg = risk["avg_score"]
    if avg is None:
        team_risk_label = "N/A"
        team_risk_color = "#6b7280"
    elif avg >= 75:
        team_risk_label = "Critical"
        team_risk_color = "#ef4444"
    elif avg >= 50:
        team_risk_label = "High"
        team_risk_color = "#f97316"
    elif avg >= 25:
        team_risk_label = "Moderate"
        team_risk_color = "#f59e0b"
    else:
        team_risk_label = "Low"
        team_risk_color = "#22c55e"

    # Platform-specific promotions
    is_pagerduty = "pagerduty" in platform
    is_rootly = "rootly" in platform
    rootly_promo_text = (
        "\n\nPagerDuty charges extra for what Rootly includes.\n"
        "Slack bot integration, alert grouping, and automated workflows — all built in, no add-ons. Teams switch in minutes.\n"
        "Try Rootly for free or book a demo: https://rootly.com/demo"
        if is_pagerduty else
        "\n\nYou track the load. Now let Rootly AI SRE reduce it.\n"
        "Learn more: https://rootly.com/ai-sre"
        if is_rootly else ""
    )
    rootly_promo_html = (
        f"""
  <div style="margin-top: 24px; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 14px 16px;">
    <p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #5b21b6;">PagerDuty charges extra for what Rootly includes.</p>
    <p style="margin: 0 0 10px; font-size: 13px; color: #6b7280; line-height: 1.6;">
      Slack bot integration, alert grouping, and automated workflows &mdash; all built in, no add-ons. Teams switch in minutes.
    </p>
    <a href="https://rootly.com/demo" style="display: inline-block; font-size: 12px; font-weight: 600; color: #7c3aed; text-decoration: underline;">Try Rootly for free or book a demo &rarr;</a>
  </div>"""
        if is_pagerduty else
        f"""
  <div style="margin-top: 16px; margin-bottom: 16px; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 8px 12px;">
    <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
      You track the load. Now let <strong style="color: #5b21b6;">Rootly AI SRE</strong> reduce it.
      <a href="https://rootly.com/ai-sre" style="margin-left: 6px; font-size: 12px; font-weight: 600; color: #7c3aed; text-decoration: underline;">Learn more &rarr;</a>
    </p>
  </div>"""
        if is_rootly else ""
    )

    blocked = _ensure_dict(analysis.config).get("auto_refresh_blocked") if analysis.config else None
    blocked_note_text = ""
    blocked_note_html = ""
    if isinstance(blocked, dict):
        provider = blocked.get("provider", "primary integration")
        reason = blocked.get("message") or blocked.get("reason") or "Token expired or invalid."
        blocked_note_text = (
            f"\n\nNote: Auto-refresh is paused because your {provider} token is expired or invalid. "
            f"Reason: {reason}. Please reconnect in Integrations."
        )
        blocked_note_html = f"""
  <p style="margin: 16px 0 0; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; color: #92400e; font-size: 13px;">
    <strong>Auto-refresh paused:</strong> Your {provider} token is expired or invalid &mdash; {reason}
    Please reconnect in Integrations. This email uses the last successful auto-refresh.
  </p>"""

    def format_list_text(items: List[Dict[str, Any]]) -> str:
        if not items:
            return "  None"
        return "\n".join([f"  - {_format_member_item(item)}" for item in items[:3]])

    _risk_colors = {
        "critical": ("#fee2e2", "#b91c1c"),  # light red bg, dark red text
        "high":     ("#ffedd5", "#c2410c"),  # light orange bg, dark orange text
        "medium":   ("#fef9c3", "#92400e"),  # light yellow bg, dark amber text
        "low":      ("#dcfce7", "#15803d"),  # light green bg, dark green text
    }
    _bar_colors = {
        "critical": "#f87171",  # bright red (matches UI card)
        "high":     "#fb923c",  # bright orange
        "medium":   "#eab308",  # bright yellow (matches UI card)
        "low":      "#22c55e",  # bright green (matches UI card)
    }
    _trend_badges = {
        "significantly_worsening": ("&#8600;&#xFE0E;&#8600;&#xFE0E; Critical", "#fee2e2", "#ef4444"),
        "worsening":               ("&#8600;&#xFE0E; Worsening",               "#fff7ed", "#f97316"),
    }

    def _render_combined_trends_table(items: List[Dict[str, Any]], risk_colors: Dict, trend_badges: Dict) -> str:
        if not items:
            return '<tr><td colspan="3" style="padding: 12px 14px; color: #6b7280; text-align: center;">No trends</td></tr>'
        rows = []
        for item in items:
            name = item.get("user_name") or item.get("user_email") or "Unknown"
            risk_level_raw = (item.get("risk_level") or "unknown").lower()
            trend_type = item.get("trend_type", "worsening")

            risk_level_score = item.get("och_score") or 0
            trend_badge_text, _, _ = trend_badges.get(trend_type, ("↘ Worsening", "#fff7ed", "#f97316"))

            # Bright bar fill color matching the UI card
            bar_fill = _bar_colors.get(risk_level_raw, "#9ca3af")

            # Trend badge styling
            trend_bg = "#fee2e2" if trend_type == "significantly_worsening" else "#fef9c3"
            trend_color = "#dc2626" if trend_type == "significantly_worsening" else "#b45309"

            # Bar width percentage based on score (0-100)
            bar_width_percent = min(max(risk_level_score, 0), 100)

            rows.append(
                f'<tr style="border-bottom: 1px solid #f3f4f6;">'
                f'<td style="padding: 12px 14px; font-size: 14px; color: #111827;">{name}</td>'
                f'<td style="padding: 12px 14px; text-align: center; vertical-align: middle;">'
                f'<table style="display: inline-table; border-collapse: collapse; margin: 0 auto;">'
                f'<tr>'
                f'<td style="vertical-align: middle; padding: 0;">'
                f'<div style="width: 50px; height: 6px; border-radius: 3px; background: #e5e7eb; overflow: hidden;">'
                f'<div style="width: {bar_width_percent}%; height: 6px; background: {bar_fill}; border-radius: 3px;"></div>'
                f'</div>'
                f'</td>'
                f'<td style="vertical-align: middle; padding: 0 0 0 8px;">'
                f'<span style="font-size: 12px; color: #6b7280;">{int(risk_level_score)}</span>'
                f'</td>'
                f'</tr>'
                f'</table>'
                f'</td>'
                f'<td style="padding: 12px 14px; font-size: 13px; text-align: right;">'
                f'<span style="display: inline-block; padding: 2px 8px; border-radius: 99px;'
                f' background: {trend_bg}; color: {trend_color}; font-weight: 600; font-size: 11px; white-space: nowrap;">'
                f'{trend_badge_text}</span>'
                f'</td>'
                f'</tr>'
            )
        return "\n".join(rows)

    def format_list_html(items: List[Dict[str, Any]], trend: str) -> str:
        if not items:
            return '<li style="color: #6b7280;">None</li>'
        badge_text, badge_bg, badge_color = _trend_badges.get(
            trend, ("&#8600; Worsening", "#fff7ed", "#f97316")
        )
        rows = []
        for item in items[:3]:
            name = item.get("user_name") or item.get("user_email") or "Unknown"
            risk_level_raw = (item.get("risk_level") or "unknown").lower()
            risk_bg, risk_text_color = _risk_colors.get(risk_level_raw, ("#f3f4f6", "#6b7280"))
            rows.append(
                f'<li style="margin-bottom: 8px; list-style: none;">'
                f'<table style="width: 100%; background: #fafafa; border-radius: 6px;'
                f' border: 1px solid #f3f4f6; border-collapse: collapse;">'
                f'<tr>'
                f'<td style="padding: 8px 10px; font-size: 14px; width: 100%;">'
                f'<strong style="color: #111827;">{name}</strong>'
                f'</td>'
                f'<td style="padding: 8px 10px; text-align: right; white-space: nowrap;">'
                f'<span style="display: inline-block; padding: 3px 12px; border-radius: 99px;'
                f' background: {risk_bg}; color: {risk_text_color}; font-size: 12px; font-weight: 600;">'
                f'Risk Level: {risk_level_raw.capitalize()}</span>'
                f'</td>'
                f'</tr>'
                f'</table>'
                f'</li>'
            )
        return "\n".join(rows)

    week_of = local_now.strftime("%B %d, %Y")
    subject = f"Weekly Digest – {week_of}"

    # ── Plain-text body ──────────────────────────────────────────────────────
    text_lines = [
        f"Weekly Digest – {week_of}",
        "",
        f"Integration: {integration_name}",
        f"Last updated: {last_updated_relative}",
        "",
        "Team Overview",
        f"  Team Risk Level: {team_risk_label}",
        f"  At risk:         {risk['at_risk']}",
        f"  Critical trend:  {len(critical_trend)}",
        f"  Worsening trend: {len(worsening_trend)}",
    ]
    text_lines += [
        "",
        "Critical Trend",
        format_list_text(critical_trend),
        "",
        "Worsening Trend",
        format_list_text(worsening_trend),
        "",
        f"View full report: {dashboard_url}",
    ]
    if rootly_promo_text:
        text_lines.append(rootly_promo_text)
    if blocked_note_text:
        text_lines.append(blocked_note_text)
    if unsubscribe_url:
        text_lines += ["", "--", f"Unsubscribe from weekly digests: {unsubscribe_url}"]
    text_body = "\n".join(text_lines)

    # ── Metrics table HTML ───────────────────────────────────────────────────

    unsubscribe_html = (
        f'<p style="margin: 10px 0 0; font-size: 12px; color: #9ca3af;">'
        f''
        f'<a href="{unsubscribe_url}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe from weekly digests</a>'
        f'</p>'
        if unsubscribe_url else ""
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Digest</title>
  <style>
    @media only screen and (max-width: 480px) {{
      .stats-cell {{ display: block !important; width: 100% !important; box-sizing: border-box !important; border-left: none !important; border-top: 1px solid #e5e7eb !important; }}
      .stats-cell:first-child {{ border-top: none !important; }}
    }}
  </style>
</head>
<body style="margin: 0; padding: 20px; background-color: #ffffff;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#ffffff;line-height:1;">{integration_name} &mdash; Team Risk Level: {team_risk_label} &middot; {risk['at_risk']} Users at Risk &middot; {len(critical_trend)} Critical &middot; {len(worsening_trend)} Worsening&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <tr>
      <td style="vertical-align: top;">
        <div style="border-left: 4px solid #7c3aed; padding-left: 16px;">
          <h2 style="margin: 0 0 4px; font-size: 22px; color: #111827;">Weekly Digest</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">{integration_name} &middot; Last updated {last_updated_relative}</p>
        </div>
      </td>
      <td style="vertical-align: top; text-align: right;">
        <div style="margin-bottom: 5px;">
          <img src="{settings.FRONTEND_URL}/images/on-call-health-logo.svg" alt="" width="18" height="18" style="display: inline-block; vertical-align: middle; margin-right: 5px;">
          <span style="font-size: 15px; font-weight: 700; color: #111827; vertical-align: middle;">On-Call Health</span>
        </div>
        <div>
          <span style="font-size: 12px; color: #6b7280; vertical-align: middle; margin-right: 4px;">Powered by</span>
          <img src="{settings.FRONTEND_URL}/images/rootly-ai-logo.png" alt="Rootly AI" height="20" style="display: inline-block; vertical-align: middle;">
        </div>
      </td>
    </tr>
  </table>

{rootly_promo_html}

  <table style="width: 100%; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; border-collapse: collapse; margin-bottom: 24px;">
    <tr>
      <td class="stats-cell" style="padding: 16px; text-align: center;">
        <div style="font-size: 22px; font-weight: 700; color: {team_risk_color}; line-height: 1;">{team_risk_label}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Team Risk Level</div>
      </td>
      <td class="stats-cell" style="padding: 16px; text-align: center; border-left: 1px solid #e5e7eb;">
        <div style="font-size: 26px; font-weight: 700; color: #111827; line-height: 1;">{risk['at_risk']}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Users At Risk</div>
      </td>
      <td class="stats-cell" style="padding: 16px; text-align: center; border-left: 1px solid #e5e7eb;">
        <div style="font-size: 26px; font-weight: 700; color: #111827; line-height: 1;">{len(critical_trend)}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Critical Trend</div>
      </td>
      <td class="stats-cell" style="padding: 16px; text-align: center; border-left: 1px solid #e5e7eb;">
        <div style="font-size: 26px; font-weight: 700; color: #111827; line-height: 1;">{len(worsening_trend)}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Worsening Trend</div>
      </td>
    </tr>
  </table>

  <table style="width: 100%; background: white; border-collapse: collapse; margin-bottom: 24px;">
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 14px; font-size: 12px; font-weight: 700; color: #9ca3af;">MEMBER</td>
      <td style="padding: 12px 14px; font-size: 12px; font-weight: 700; color: #9ca3af; text-align: center;">RISK LEVEL</td>
      <td style="padding: 12px 14px; font-size: 12px; font-weight: 700; color: #9ca3af; text-align: right;">TREND</td>
    </tr>
    {_render_combined_trends_table(combined_trends, _risk_colors, _trend_badges)}
  </table>

  <a href="{dashboard_url}"
     style="display: inline-block; background: #7c3aed; color: white; text-decoration: none;
            padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">
    View Full Report &rarr;
  </a>

{blocked_note_html}
{unsubscribe_html}

</div>
</body>
</html>"""

    return {"subject": subject, "text": text_body, "html": html_body}


async def _send_resend_email(
    to_email: str,
    to_name: Optional[str],
    subject: str,
    text_body: str,
    html_body: str,
    unsubscribe_url: Optional[str] = None
) -> bool:
    if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
        missing = []
        if not settings.RESEND_API_KEY:
            missing.append("RESEND_API_KEY")
        if not settings.RESEND_FROM_EMAIL:
            missing.append("RESEND_FROM_EMAIL")
        logger.warning(f"Weekly digest disabled: missing env var(s): {', '.join(missing)}")
        return False

    from_name = settings.RESEND_FROM_NAME.strip() if settings.RESEND_FROM_NAME else ""
    from_email = settings.RESEND_FROM_EMAIL.strip()
    from_value = f"{from_name} <{from_email}>" if from_name else from_email

    payload = {
        "from": from_value,
        "to": [to_email],
        "subject": subject,
        "text": text_body,
        "html": html_body,
        **({"headers": {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }} if unsubscribe_url else {})
    }

    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
        if resp.status_code in (200, 201, 202):
            return True
        logger.error(f"Resend error {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        logger.error(f"Resend request failed: {e}")
        return False


async def send_unsubscribe_feedback(user_email: str, reason: str) -> None:
    """Fire-and-forget: email unsubscribe feedback to the configured address."""
    feedback_to = settings.UNSUBSCRIBE_FEEDBACK_EMAIL
    if not feedback_to:
        logger.info("[UNSUBSCRIBE_FEEDBACK] UNSUBSCRIBE_FEEDBACK_EMAIL not set — skipping feedback email")
        return
    if not reason.strip():
        logger.info(f"[UNSUBSCRIBE_FEEDBACK] {user_email} unsubscribed with no reason — skipping feedback email")
        return

    logger.info(f"[UNSUBSCRIBE_FEEDBACK] Sending feedback from {user_email} to {feedback_to}: {reason[:80]}")

    subject = f"Weekly digest unsubscribe feedback from {user_email}"
    text_body = f"User: {user_email}\n\nReason:\n{reason.strip()}"
    html_body = (
        f"<p><strong>User:</strong> {user_email}</p>"
        f"<p><strong>Reason:</strong></p>"
        f"<p style='white-space:pre-wrap;'>{reason.strip()}</p>"
    )

    sent = await _send_resend_email(
        to_email=feedback_to,
        to_name=None,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )
    if sent:
        logger.info(f"[UNSUBSCRIBE_FEEDBACK] Feedback email sent successfully to {feedback_to}")
    else:
        logger.warning(f"[UNSUBSCRIBE_FEEDBACK] Failed to send feedback email to {feedback_to}")


def _get_latest_auto_refresh_analysis(db, user: User) -> Optional[Analysis]:
    return db.query(Analysis).filter(
        Analysis.user_id == user.id,
        Analysis.is_auto_refresh == True,
        Analysis.status == "completed",
        Analysis.completed_at.isnot(None),
    ).order_by(Analysis.completed_at.desc()).first()


async def send_weekly_digest_test(db, user_id: int) -> Dict[str, Any]:
    """
    Send a test weekly digest email for the current user.
    Skips scheduler time checks and idempotency logging.
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.status == "active"
    ).first()

    if not user or not user.email:
        return {"sent": False, "message": "User not found or missing email"}

    analysis = _get_latest_auto_refresh_analysis(db, user)
    if not analysis:
        return {"sent": False, "message": "No completed auto-refresh analysis found"}

    config = _ensure_dict(analysis.config)
    if config.get("is_demo") is True:
        return {"sent": False, "message": "Demo analyses are excluded from weekly digests"}

    results = _ensure_dict(analysis.results)
    if not results:
        return {"sent": False, "message": "Analysis results are missing"}

    tz_name = _get_user_timezone(db, user.id)
    tz = pytz.timezone(tz_name)
    local_now = datetime.now(tz)

    unsubscribe_token = _generate_unsubscribe_token(user.id)
    unsubscribe_url = f"{settings.FRONTEND_URL}/unsubscribe?token={unsubscribe_token}"

    content = _build_email_content(
        user=user,
        analysis=analysis,
        results=results,
        local_now=local_now,
        tz_name=tz_name,
        unsubscribe_url=unsubscribe_url,
    )

    sent = await _send_resend_email(
        to_email=user.email,
        to_name=user.name,
        subject=content["subject"],
        text_body=content["text"],
        html_body=content["html"],
        unsubscribe_url=unsubscribe_url
    )

    if not sent:
        return {"sent": False, "message": "Failed to send email - check Resend settings"}

    return {
        "sent": True,
        "message": "Weekly digest test email sent",
        "analysis_id": analysis.id,
        "last_updated_at": analysis.completed_at.isoformat() if analysis.completed_at else None
    }


async def _log_digest_countdown() -> None:
    """Runs every 2 minutes when WEEKLY_DIGEST_FORCE_SEND=true to show time until next send."""
    if not settings.WEEKLY_DIGEST_FORCE_SEND or _scheduler_start_time is None:
        return
    elapsed = (datetime.now() - _scheduler_start_time).total_seconds() / 60
    next_tick = _DIGEST_INTERVAL_MINUTES - (elapsed % _DIGEST_INTERVAL_MINUTES)
    logger.info(
        f"⏳ [WEEKLY_DIGEST] Force-send mode active — "
        f"next digest check in ~{next_tick:.0f} min "
        f"(elapsed: {elapsed:.1f} min since scheduler start)"
    )


async def check_and_send_weekly_digests() -> None:
    if not settings.WEEKLY_DIGEST_ENABLED:
        logger.debug("Weekly digest scheduler disabled (WEEKLY_DIGEST_ENABLED=false)")
        return

    db = SessionLocal()
    try:
        # Latest completed auto-refresh analysis per user
        subquery = db.query(
            Analysis.user_id.label("user_id"),
            func.max(Analysis.completed_at).label("latest_completed")
        ).filter(
            Analysis.is_auto_refresh == True,
            Analysis.status == "completed",
            Analysis.completed_at.isnot(None)
        ).group_by(Analysis.user_id).subquery()

        analyses = db.query(Analysis).join(
            subquery,
            and_(
                Analysis.user_id == subquery.c.user_id,
                Analysis.completed_at == subquery.c.latest_completed
            )
        ).all()

        logger.info(f"📬 [WEEKLY_DIGEST] Found {len(analyses)} auto-refresh analyses to process")

        for analysis in analyses:
            try:
                user = db.query(User).filter(
                    User.id == analysis.user_id,
                    User.status == "active"
                ).first()

                if not user or not user.email:
                    logger.info(f"📬 [WEEKLY_DIGEST] SKIP analysis={analysis.id}: user not found or no email (user_id={analysis.user_id})")
                    continue

                logger.info(f"📬 [WEEKLY_DIGEST] Processing analysis={analysis.id} for user={user.email}")

                if not user.weekly_digest_enabled:
                    logger.info(f"📬 [WEEKLY_DIGEST] SKIP {user.email}: weekly_digest_enabled=False")
                    continue

                config = _ensure_dict(analysis.config)
                if config.get("is_demo") is True:
                    logger.info(f"📬 [WEEKLY_DIGEST] SKIP {user.email}: demo analysis")
                    continue

                tz_name = _get_user_timezone(db, user.id)
                tz = pytz.timezone(tz_name)
                local_now = datetime.now(tz)

                logger.info(f"📬 [WEEKLY_DIGEST] {user.email} timezone={tz_name} local_now={local_now.strftime('%A %H:%M')} (weekday={local_now.weekday()}, hour={local_now.hour})")
                if not settings.WEEKLY_DIGEST_FORCE_SEND:
                    if local_now.weekday() != 1 or local_now.hour != 10:
                        logger.info(f"📬 [WEEKLY_DIGEST] SKIP {user.email}: not Tuesday 10am local (weekday={local_now.weekday()}, hour={local_now.hour})")
                        continue

                week_start_date = _get_week_start_date(local_now)

                results = _ensure_dict(analysis.results)
                logger.info(f"📬 [WEEKLY_DIGEST] analysis={analysis.id} results type={type(analysis.results).__name__} keys={list(results.keys())[:5] if results else 'EMPTY'}")
                if not results:
                    logger.info(f"📬 [WEEKLY_DIGEST] SKIP {user.email}: analysis results are empty")
                    continue

                # Claim the send slot BEFORE sending — insert log row first.
                # If another instance already inserted (race condition), the unique
                # constraint fires here and we skip without sending a duplicate email.
                if not settings.WEEKLY_DIGEST_FORCE_SEND:
                    log_entry = WeeklyDigestLog(
                        user_id=user.id,
                        analysis_id=analysis.id,
                        week_start_date=week_start_date,
                        timezone=tz_name
                    )
                    db.add(log_entry)
                    try:
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                        logger.info(f"📬 [WEEKLY_DIGEST] SKIP {user.email}: already sent this week ({week_start_date}) — race condition caught before send")
                        continue

                unsubscribe_token = _generate_unsubscribe_token(user.id)
                unsubscribe_url = f"{settings.FRONTEND_URL}/unsubscribe?token={unsubscribe_token}"

                content = _build_email_content(
                    user=user,
                    analysis=analysis,
                    results=results,
                    local_now=local_now,
                    tz_name=tz_name,
                    unsubscribe_url=unsubscribe_url,
                )

                logger.info(f"📬 [WEEKLY_DIGEST] Sending digest to {user.email} (analysis={analysis.id})...")

                sent = await _send_resend_email(
                    to_email=user.email,
                    to_name=user.name,
                    subject=content["subject"],
                    text_body=content["text"],
                    html_body=content["html"],
                    unsubscribe_url=unsubscribe_url
                )

                if not sent:
                    logger.warning(f"📬 [WEEKLY_DIGEST] FAILED to send to {user.email} (analysis={analysis.id}) — will retry next cron tick")
                    continue

                logger.info(
                    f"📧 [WEEKLY_DIGEST] Digest sent to {user.email} "
                    f"(user_id={user.id}, subject={content['subject']})"
                )
                logger.info(f"Weekly digest sent to {user.email} for week starting {week_start_date}")

            except Exception as per_user_error:
                logger.error(
                    f"Weekly digest failed for analysis {analysis.id}: {per_user_error}",
                    exc_info=True
                )
                db.rollback()

    except Exception as e:
        logger.error(f"Weekly digest scheduler error: {e}", exc_info=True)
    finally:
        db.close()


class WeeklyDigestScheduler:
    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler()

    def start(self) -> None:
        global _scheduler_start_time
        if self.scheduler.running:
            return
        _scheduler_start_time = datetime.now()
        self.scheduler.add_job(
            check_and_send_weekly_digests,
            trigger=CronTrigger(minute="*/30"),  # fires every 30 min; sends when local hour == 11 (Monday)
            id="weekly_digest",
            replace_existing=True
        )
        if settings.WEEKLY_DIGEST_FORCE_SEND:
            self.scheduler.add_job(
                _log_digest_countdown,
                trigger=CronTrigger(minute="*/2"),
                id="weekly_digest_countdown",
                replace_existing=True
            )
            logger.info(
                "⚡ [WEEKLY_DIGEST] FORCE_SEND mode enabled — "
                "digest will send on next 10-min tick, countdown logged every 2 min"
            )
        self.scheduler.start()
        logger.info("Weekly digest scheduler started (fires */30; sends Tuesday 10am per user's local timezone)")


weekly_digest_scheduler = WeeklyDigestScheduler()
