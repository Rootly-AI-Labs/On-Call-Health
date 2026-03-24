"""Tests for Slack request signature verification."""

import hashlib
import hmac
import time

from app.api.endpoints.slack import (
    SLACK_SIGNATURE_VERSION,
    SLACK_REQUEST_TTL_SECONDS,
    is_valid_slack_request_signature,
)


def build_signature(secret: str, timestamp: str, body: bytes) -> str:
    basestring = f"{SLACK_SIGNATURE_VERSION}:{timestamp}:{body.decode('utf-8')}"
    return (
        f"{SLACK_SIGNATURE_VERSION}="
        f"{hmac.new(secret.encode(), basestring.encode(), hashlib.sha256).hexdigest()}"
    )


def test_valid_slack_signature_is_accepted():
    secret = "signing-secret"
    timestamp = str(int(time.time()))
    body = b"token=deprecated&team_id=T123&command=%2Foncall-health"
    signature = build_signature(secret, timestamp, body)

    assert is_valid_slack_request_signature(secret, timestamp, signature, body)


def test_invalid_slack_signature_is_rejected():
    secret = "signing-secret"
    timestamp = str(int(time.time()))
    body = b"payload=%7B%22type%22%3A%22view_submission%22%7D"

    assert not is_valid_slack_request_signature(
        secret,
        timestamp,
        "v0=not-a-real-signature",
        body,
    )


def test_stale_slack_signature_is_rejected():
    secret = "signing-secret"
    current_time = int(time.time())
    timestamp = str(current_time - SLACK_REQUEST_TTL_SECONDS - 1)
    body = b"payload=%7B%22type%22%3A%22block_actions%22%7D"
    signature = build_signature(secret, timestamp, body)

    assert not is_valid_slack_request_signature(
        secret,
        timestamp,
        signature,
        body,
        now=current_time,
    )


def test_signature_rejects_missing_inputs():
    assert not is_valid_slack_request_signature("", "123", "v0=sig", b"body")
    assert not is_valid_slack_request_signature("secret", "", "v0=sig", b"body")
    assert not is_valid_slack_request_signature("secret", "123", "", b"body")


def test_signature_rejects_non_numeric_timestamp():
    assert not is_valid_slack_request_signature(
        "secret",
        "not-a-timestamp",
        "v0=sig",
        b"body",
    )


def test_signature_accepts_timestamp_at_ttl_boundary():
    secret = "signing-secret"
    current_time = int(time.time())
    timestamp = str(current_time - SLACK_REQUEST_TTL_SECONDS)
    body = b"payload=%7B%22type%22%3A%22block_actions%22%7D"
    signature = build_signature(secret, timestamp, body)

    assert is_valid_slack_request_signature(
        secret,
        timestamp,
        signature,
        body,
        now=current_time,
    )


def test_signature_rejects_invalid_utf8_body():
    assert not is_valid_slack_request_signature(
        "secret",
        str(int(time.time())),
        "v0=sig",
        b"\xff\xfe\xfd",
    )
