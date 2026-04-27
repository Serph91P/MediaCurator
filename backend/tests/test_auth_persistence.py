"""End-to-end auth persistence test: JWT must survive a config reload.

This is the regression test for the bug where the SECRET_KEY was regenerated
on every container restart, invalidating all JWT tokens and causing the
setup wizard to reappear after a restart.
"""
from __future__ import annotations

import importlib

import pytest


@pytest.fixture
def fresh_app_modules(tmp_path, monkeypatch):
    """Force a clean reimport of config + security with a temp key file."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SECRET_KEY_FILE", str(tmp_path / ".secret_key"))

    import app.core.config as cfg
    importlib.reload(cfg)
    cfg.get_settings.cache_clear()
    import app.core.security as sec
    importlib.reload(sec)
    yield cfg, sec
    cfg.get_settings.cache_clear()
    importlib.reload(cfg)
    importlib.reload(sec)


def test_jwt_survives_settings_reload(fresh_app_modules):
    """A token issued before a 'restart' must still decode after reload."""
    cfg, sec = fresh_app_modules

    token = sec.create_access_token({"sub": "42", "username": "alice"})
    decoded_before = sec.decode_token(token)
    assert decoded_before is not None
    assert decoded_before.user_id == 42
    assert decoded_before.username == "alice"

    # Simulate a container restart: re-read settings + security module.
    cfg.get_settings.cache_clear()
    importlib.reload(cfg)
    importlib.reload(sec)

    decoded_after = sec.decode_token(token)
    assert decoded_after is not None, (
        "Token must remain valid after restart \u2014 otherwise users get "
        "logged out and the setup wizard reappears."
    )
    assert (
        decoded_after.username == decoded_before.username
        and decoded_after.user_id == decoded_before.user_id
    )


def test_jwt_invalid_when_secret_key_actually_changes(tmp_path, monkeypatch):
    """Sanity check: if SECRET_KEY changes, old tokens must be rejected."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SECRET_KEY_FILE", str(tmp_path / "k1"))

    import app.core.config as cfg
    importlib.reload(cfg)
    cfg.get_settings.cache_clear()
    import app.core.security as sec
    importlib.reload(sec)
    token = sec.create_access_token({"sub": "7", "username": "bob"})

    # Switch to a different key file (simulates losing the persisted key).
    monkeypatch.setenv("SECRET_KEY_FILE", str(tmp_path / "k2"))
    cfg.get_settings.cache_clear()
    importlib.reload(cfg)
    importlib.reload(sec)

    assert sec.decode_token(token) is None, (
        "Tokens signed with a different key must be rejected"
    )

    # Cleanup so other tests get a clean module state.
    cfg.get_settings.cache_clear()
    importlib.reload(cfg)
    importlib.reload(sec)
