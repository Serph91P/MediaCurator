"""Tests for CSRF cookie lifetime semantics.

Regression guard: the CSRF cookie must outlive the short-lived access
token, otherwise the user is silently logged out mid-session because the
follow-up POST /api/auth/refresh also fails with 403 'CSRF token missing'.
"""
from __future__ import annotations

from fastapi import Response

from app.core import csrf as csrf_mod
from app.core.config import get_settings


def test_csrf_cookie_max_age_matches_refresh_token_lifetime() -> None:
    """The CSRF cookie must live as long as the session can be refreshed."""
    response = Response()
    csrf_mod.set_csrf_cookie(response, "deadbeef")

    settings = get_settings()
    expected_seconds = settings.refresh_token_expire_days * 24 * 60 * 60

    set_cookie_header = response.headers.get("set-cookie", "")
    assert "csrf_token=deadbeef" in set_cookie_header
    assert f"Max-Age={expected_seconds}" in set_cookie_header


def test_csrf_cookie_is_not_httponly() -> None:
    """JS must be able to read the CSRF cookie to mirror it back as a header."""
    response = Response()
    csrf_mod.set_csrf_cookie(response, "x")
    set_cookie_header = response.headers.get("set-cookie", "")
    assert "HttpOnly" not in set_cookie_header
