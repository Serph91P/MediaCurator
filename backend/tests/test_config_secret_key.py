"""Tests for SECRET_KEY persistence and DB-config validation.

These guard against the historical bug where the SECRET_KEY was regenerated
on every container restart, invalidating all JWT sessions and causing the
setup wizard to reappear unexpectedly.
"""
from __future__ import annotations

import importlib
import os
from pathlib import Path

import pytest


@pytest.fixture
def isolated_config(tmp_path, monkeypatch):
    """Reload ``app.core.config`` with a temp secret key file and no env key."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    key_file = tmp_path / ".secret_key"
    monkeypatch.setenv("SECRET_KEY_FILE", str(key_file))

    import app.core.config as cfg
    importlib.reload(cfg)
    cfg.get_settings.cache_clear()
    try:
        yield cfg, key_file
    finally:
        cfg.get_settings.cache_clear()
        importlib.reload(cfg)


def test_secret_key_env_takes_precedence(tmp_path, monkeypatch):
    """An explicit SECRET_KEY env var must override the file fallback."""
    monkeypatch.setenv("SECRET_KEY", "x" * 48)
    key_file = tmp_path / ".secret_key"
    monkeypatch.setenv("SECRET_KEY_FILE", str(key_file))

    import app.core.config as cfg
    importlib.reload(cfg)
    cfg.get_settings.cache_clear()
    try:
        s = cfg.Settings()
        assert s.secret_key == "x" * 48
        # Env key must NOT be persisted to disk.
        assert not key_file.exists()
    finally:
        cfg.get_settings.cache_clear()
        importlib.reload(cfg)


def test_secret_key_persists_across_restarts(isolated_config):
    """Without env var, key is generated, persisted, and reused."""
    cfg, key_file = isolated_config

    s1 = cfg.Settings()
    assert key_file.is_file(), "Generated key must be persisted to disk"
    persisted = key_file.read_text(encoding="utf-8").strip()
    assert s1.secret_key == persisted
    assert len(s1.secret_key) >= 32

    # Simulate a container restart: clear cache, re-instantiate.
    cfg.get_settings.cache_clear()
    s2 = cfg.Settings()
    assert s2.secret_key == s1.secret_key, (
        "Secret key must be stable across restarts to keep JWT sessions valid"
    )


def test_secret_key_file_permissions_restricted(isolated_config):
    """Generated key file must not be world-readable."""
    cfg, key_file = isolated_config
    cfg.Settings()
    if os.name == "posix":
        mode = key_file.stat().st_mode & 0o777
        assert mode & 0o077 == 0, f"key file mode {oct(mode)} is too permissive"


def test_postgres_partial_config_raises(monkeypatch):
    """Partially configured POSTGRES_* must raise instead of silently using SQLite."""
    monkeypatch.setenv("SECRET_KEY", "y" * 48)
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_USER", "user")
    # Intentionally omit POSTGRES_PASSWORD and POSTGRES_DB.
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)
    monkeypatch.delenv("POSTGRES_DB", raising=False)

    import app.core.config as cfg
    importlib.reload(cfg)
    cfg.get_settings.cache_clear()
    try:
        s = cfg.Settings()
        with pytest.raises(ValueError, match="PostgreSQL is partially configured"):
            _ = s.effective_database_url
    finally:
        cfg.get_settings.cache_clear()
        importlib.reload(cfg)


def test_postgres_full_config_returns_postgres_url(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "z" * 48)
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_USER", "user")
    monkeypatch.setenv("POSTGRES_PASSWORD", "pw")
    monkeypatch.setenv("POSTGRES_DB", "mydb")

    import app.core.config as cfg
    importlib.reload(cfg)
    cfg.get_settings.cache_clear()
    try:
        s = cfg.Settings()
        url = s.effective_database_url
        assert url.startswith("postgresql+asyncpg://user:pw@db:5432/mydb")
    finally:
        cfg.get_settings.cache_clear()
        importlib.reload(cfg)


def test_no_postgres_config_uses_sqlite_default(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a" * 48)
    for var in ("POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"):
        monkeypatch.delenv(var, raising=False)

    import app.core.config as cfg
    importlib.reload(cfg)
    cfg.get_settings.cache_clear()
    try:
        s = cfg.Settings()
        assert s.effective_database_url.startswith("sqlite")
    finally:
        cfg.get_settings.cache_clear()
        importlib.reload(cfg)
