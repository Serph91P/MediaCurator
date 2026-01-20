"""
System API routes (health, stats, settings).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from pydantic import BaseModel
import os
from datetime import datetime, timedelta

from ...core.database import get_db
from ...core.config import get_settings
from ...models import MediaItem, CleanupLog, SystemSettings, MediaType
from ...schemas import SystemStats, HealthCheck, DiskSpaceInfo, SystemSettingResponse, SystemSettingUpdate
from ...services.version import version_service
from ..deps import get_current_user, get_optional_user

router = APIRouter(prefix="/system", tags=["System"])
settings = get_settings()


class VersionInfo(BaseModel):
    """Version information response."""
    version: str
    base_version: str
    branch: str
    commit: str
    commit_full: str
    commit_date: str | None
    is_dirty: bool
    remote_url: str | None


class UpdateInfo(BaseModel):
    """Update check response."""
    update_available: bool
    latest_commit: str | None
    commits_behind: int
    error: str | None
    current_version: str
    current_commit: str


@router.get("/version", response_model=VersionInfo)
async def get_version_info():
    """Get detailed version information (no auth required)."""
    return version_service.get_version_info()


@router.get("/check-updates", response_model=UpdateInfo)
async def check_for_updates():
    """Check if updates are available on GitHub (no auth required)."""
    git_info = version_service.get_git_info()
    update_info = await version_service.check_for_updates()
    
    return UpdateInfo(
        update_available=update_info.get("update_available", False),
        latest_commit=update_info.get("latest_commit"),
        commits_behind=update_info.get("commits_behind", 0),
        error=update_info.get("error"),
        current_version=git_info.get("full_version", "unknown"),
        current_commit=git_info.get("commit_short", "unknown")
    )


@router.get("/health", response_model=HealthCheck)
async def health_check(
    db: AsyncSession = Depends(get_db)
):
    """Health check endpoint (no auth required)."""
    # Check database
    try:
        await db.execute(select(func.count(MediaItem.id)))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"
    
    # Get version from version service
    version_info = version_service.get_git_info()
    
    return HealthCheck(
        status="healthy" if db_status == "healthy" else "degraded",
        version=version_info.get("full_version", settings.app_version),
        database=db_status,
        scheduler="running"  # Would need actual scheduler check
    )


@router.get("/stats", response_model=SystemStats)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get system statistics."""
    # Media counts
    total_result = await db.execute(select(func.count(MediaItem.id)))
    total = total_result.scalar() or 0
    
    movies_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.MOVIE)
    )
    movies = movies_result.scalar() or 0
    
    series_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.SERIES)
    )
    series = series_result.scalar() or 0
    
    episodes_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.EPISODE)
    )
    episodes = episodes_result.scalar() or 0
    
    flagged_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.flagged_for_cleanup == True)
    )
    flagged = flagged_result.scalar() or 0
    
    # Deletion stats (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    deleted_result = await db.execute(
        select(func.count(CleanupLog.id)).where(
            CleanupLog.action == "delete",
            CleanupLog.status == "success",
            CleanupLog.created_at >= thirty_days_ago
        )
    )
    deleted_count = deleted_result.scalar() or 0
    
    space_freed_result = await db.execute(
        select(func.sum(CleanupLog.media_size_bytes)).where(
            CleanupLog.action == "delete",
            CleanupLog.status == "success",
            CleanupLog.created_at >= thirty_days_ago
        )
    )
    space_freed = space_freed_result.scalar() or 0
    
    # Disk space - only show media path
    disk_info = []
    if os.path.exists(settings.media_path):
        try:
            stat = os.statvfs(settings.media_path)
            total_bytes = stat.f_blocks * stat.f_frsize
            free_bytes = stat.f_bavail * stat.f_frsize
            used_bytes = total_bytes - free_bytes
            disk_info.append(DiskSpaceInfo(
                path=settings.media_path,
                total_bytes=total_bytes,
                used_bytes=used_bytes,
                free_bytes=free_bytes,
                used_percent=(used_bytes / total_bytes) * 100 if total_bytes > 0 else 0
            ))
        except Exception:
            pass
    
    return SystemStats(
        total_media_items=total,
        total_movies=movies,
        total_series=series,
        total_episodes=episodes,
        flagged_items=flagged,
        deleted_last_30_days=deleted_count,
        space_freed_bytes=space_freed,
        disk_space=disk_info
    )


@router.get("/settings", response_model=List[SystemSettingResponse])
async def get_system_settings(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get all system settings."""
    result = await db.execute(select(SystemSettings))
    settings_list = result.scalars().all()
    
    # Return defaults if no settings exist
    if not settings_list:
        return [
            {"key": "cleanup_enabled", "value": True, "description": "Enable automatic cleanup"},
            {"key": "cleanup_interval_hours", "value": 24, "description": "Hours between cleanup runs"},
            {"key": "sync_interval_hours", "value": 6, "description": "Hours between media sync runs"},
            {"key": "dry_run_mode", "value": False, "description": "Only simulate cleanups without deleting"},
        ]
    
    return settings_list


@router.put("/settings/{key}", response_model=SystemSettingResponse)
async def update_system_setting(
    key: str,
    setting_data: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update a system setting."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.value = setting_data.value
    else:
        setting = SystemSettings(key=key, value=setting_data.value)
        db.add(setting)
    
    await db.commit()
    await db.refresh(setting)
    return setting


@router.post("/cleanup/run")
async def trigger_cleanup_run(
    dry_run: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Manually trigger a cleanup run."""
    from ...services.cleanup_engine import CleanupEngine
    
    engine = CleanupEngine(db)
    
    if dry_run:
        # Just evaluate rules without executing
        result = await engine.preview_cleanup()
        return result
    
    result = await engine.run_scheduled_cleanups()
    return result


@router.get("/cleanup/preview")
async def preview_cleanup(
    rule_id: int = None,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Preview what would be cleaned up without actually doing it.
    Shows detailed reasoning for each item.
    """
    from ...services.cleanup_engine import CleanupEngine
    
    engine = CleanupEngine(db)
    result = await engine.preview_cleanup(rule_id=rule_id)
    return result


@router.post("/sync/run")
async def trigger_sync_run(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Manually trigger a sync run for all services."""
    from ...models import ServiceConnection
    from ...services.sync import sync_service_media
    
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.is_enabled == True)
    )
    services = result.scalars().all()
    
    results = []
    for service in services:
        sync_result = await sync_service_media(db, service)
        results.append({
            "service": service.name,
            **sync_result
        })
    
    return {"results": results}
