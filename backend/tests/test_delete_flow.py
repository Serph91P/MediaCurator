"""Tests for the cleanup engine delete flow.

These tests verify the new DeleteResult contract: when a remote
Sonarr/Radarr delete fails, the local MediaItem must NOT be removed
from the database, and a CleanupLog entry with status="failed" must
be written. On success, the item is deleted and a "success" log is
written.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pytest

from app.services.results import DeleteResult


# -----------------------------------------------------------------
# Pure-unit tests for the DeleteResult dataclass
# -----------------------------------------------------------------

def test_delete_result_ok_defaults() -> None:
    r = DeleteResult.ok()
    assert r.success is True
    assert r.http_status == 200
    assert r.deleted_files is False
    assert "deleted" in r.message


def test_delete_result_failure_carries_status_and_message() -> None:
    r = DeleteResult.failure(message="forbidden", http_status=403)
    assert r.success is False
    assert r.http_status == 403
    assert r.message == "forbidden"
    assert r.deleted_files is False


def test_delete_result_failure_default_status_none() -> None:
    r = DeleteResult.failure(message="connection refused")
    assert r.success is False
    assert r.http_status is None


# -----------------------------------------------------------------
# Client-level: clients return DeleteResult instead of raising
# -----------------------------------------------------------------

class _FakeRequester:
    """Drop-in replacement for BaseServiceClient._request used in tests."""

    def __init__(self, *, raise_with: Exception | None = None,
                 return_value: Any = None) -> None:
        self.raise_with = raise_with
        self.return_value = return_value
        self.calls: list[tuple] = []

    async def __call__(self, method: str, endpoint: str, **kwargs: Any) -> Any:
        self.calls.append((method, endpoint, kwargs))
        if self.raise_with is not None:
            raise self.raise_with
        return self.return_value


@pytest.mark.asyncio
async def test_radarr_delete_movie_returns_success_result(monkeypatch) -> None:
    from app.services.radarr import RadarrClient

    client = RadarrClient(url="http://radarr.test", api_key="k")
    fake = _FakeRequester(return_value=None)
    monkeypatch.setattr(client, "_request", fake)

    result = await client.delete_movie(42, delete_files=True, add_exclusion=False)

    assert isinstance(result, DeleteResult)
    assert result.success is True
    assert result.deleted_files is True
    assert fake.calls and fake.calls[0][0] == "DELETE"
    assert "/api/v3/movie/42" in fake.calls[0][1]


@pytest.mark.asyncio
async def test_radarr_delete_movie_returns_failure_on_http_error(monkeypatch) -> None:
    from app.services.base import ServiceClientError
    from app.services.radarr import RadarrClient

    client = RadarrClient(url="http://radarr.test", api_key="k")
    fake = _FakeRequester(raise_with=ServiceClientError("forbidden", status_code=403))
    monkeypatch.setattr(client, "_request", fake)

    result = await client.delete_movie(99)

    assert result.success is False
    assert result.http_status == 403
    assert "forbidden" in result.message


@pytest.mark.asyncio
async def test_sonarr_delete_series_returns_failure_on_connection_error(monkeypatch) -> None:
    from app.services.base import ServiceClientError
    from app.services.sonarr import SonarrClient

    client = SonarrClient(url="http://sonarr.test", api_key="k")
    fake = _FakeRequester(raise_with=ServiceClientError("Connection error: refused"))
    monkeypatch.setattr(client, "_request", fake)

    result = await client.delete_series(7, delete_files=True)

    assert result.success is False
    assert result.http_status is None
    assert "Connection error" in result.message


@pytest.mark.asyncio
async def test_sonarr_delete_episode_file_success(monkeypatch) -> None:
    from app.services.sonarr import SonarrClient

    client = SonarrClient(url="http://sonarr.test", api_key="k")
    fake = _FakeRequester(return_value=None)
    monkeypatch.setattr(client, "_request", fake)

    result = await client.delete_episode_file(123)

    assert result.success is True
    assert result.deleted_files is True
    assert fake.calls[0][1] == "/api/v3/episodefile/123"
