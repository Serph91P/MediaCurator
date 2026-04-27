"""Shared result types for service client operations."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(slots=True)
class DeleteResult:
    """Outcome of a delete request to an external service (Sonarr/Radarr/Emby).

    Service clients return this instead of raising, so the caller can make a
    decision (e.g. keep the local record, mark it as ``delete_failed``,
    surface the error to the user) without losing structured information.

    Attributes:
        success:        True if the remote service confirmed the delete.
        http_status:    HTTP status code returned by the remote service, if any.
        message:        Human-readable detail (error body, success message).
        deleted_files:  Whether the underlying files were requested to be deleted.
        details:        Optional structured payload from the remote response.
    """

    success: bool
    http_status: Optional[int] = None
    message: str = ""
    deleted_files: bool = False
    details: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def ok(cls, *, http_status: int = 200, deleted_files: bool = False,
           message: str = "deleted") -> "DeleteResult":
        return cls(
            success=True,
            http_status=http_status,
            message=message,
            deleted_files=deleted_files,
        )

    @classmethod
    def failure(cls, *, message: str, http_status: Optional[int] = None,
                deleted_files: bool = False) -> "DeleteResult":
        return cls(
            success=False,
            http_status=http_status,
            message=message,
            deleted_files=deleted_files,
        )
