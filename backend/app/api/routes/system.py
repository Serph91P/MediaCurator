"""
System API routes (health, stats, settings).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import os
from datetime import datetime, timedelta, timezone

from ...core.database import get_db
from ...core.config import get_settings
from ...models import MediaItem, CleanupLog, SystemSettings, MediaType, User
from ...schemas import SystemStats, HealthCheck, DiskSpaceInfo, SystemSettingResponse, SystemSettingUpdate, SystemSettingsResponse, SystemSettingsUpdate
from ...services.version import version_service
from ..deps import get_current_user, get_optional_user, get_current_active_admin

router = APIRouter(prefix="/system", tags=["System"])
settings = get_settings()

# Allowlisted system setting keys that can be modified via PUT /settings/{key}
ALLOWED_SETTING_KEYS = {
    "cleanup_enabled",
    "cleanup_schedule",
    "sync_schedule",
    "dry_run_mode",
    "default_grace_period_days",
    "max_deletions_per_run",
}


class VersionInfo(BaseModel):
    """Version information response."""
    version: str
    base_version: str
    branch: str
    commit: str
    commit_full: Optional[str] = None
    commit_date: str | None
    is_dirty: Optional[bool] = None
    remote_url: Optional[str] = None


class UpdateInfo(BaseModel):
    """Update check response."""
    update_available: bool
    latest_version: str | None
    latest_commit: str | None
    commits_behind: int
    error: str | None
    current_version: str
    current_commit: str


@router.get("/version", response_model=VersionInfo)
async def get_version_info(current_user = Depends(get_current_user)):
    """Get detailed version information (requires auth)."""
    info = version_service.get_version_info()
    # Remove sensitive fields
    info.pop("remote_url", None)
    info.pop("is_dirty", None)
    return info


@router.get("/check-updates", response_model=UpdateInfo)
async def check_for_updates(current_user = Depends(get_current_user)):
    """Check if updates are available on GitHub (requires auth)."""
    git_info = version_service.get_git_info()
    update_info = await version_service.check_for_updates()
    
    return UpdateInfo(
        update_available=update_info.get("update_available", False),
        latest_version=update_info.get("latest_version"),
        latest_commit=update_info.get("latest_commit"),
        commits_behind=update_info.get("commits_behind", 0),
        error=update_info.get("error"),
        current_version=git_info.get("full_version", "unknown"),
        current_commit=git_info.get("commit_short", "unknown")
    )


@router.get("/health", response_model=HealthCheck)
async def health_check(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """Health check endpoint. Returns minimal info without auth, full details with auth."""
    if not current_user:
        return HealthCheck(
            status="healthy",
            version="",
            database="",
            scheduler=""
        )

    # Full details only for authenticated users
    try:
        await db.execute(select(func.count(MediaItem.id)))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"
    
    version_info = version_service.get_git_info()
    
    return HealthCheck(
        status="healthy" if db_status == "healthy" else "degraded",
        version=version_info.get("display_version", version_info.get("full_version", settings.app_version)),
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
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
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


# Helper function to get or create a setting
async def _get_setting_value(db: AsyncSession, key: str, default: Any) -> Any:
    """Get a setting value from the database or return default."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value
    return default


async def _set_setting_value(db: AsyncSession, key: str, value: Any, description: str = None):
    """Set a setting value in the database."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.value = value
    else:
        setting = SystemSettings(key=key, value=value, description=description)
        db.add(setting)


@router.get("/settings", response_model=SystemSettingsResponse)
async def get_system_settings(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_admin)
):
    """Get all system settings as a single object."""
    return SystemSettingsResponse(
        id=1,
        cleanup_enabled=await _get_setting_value(db, "cleanup_enabled", True),
        cleanup_schedule=await _get_setting_value(db, "cleanup_schedule", "0 3 * * *"),
        sync_schedule=await _get_setting_value(db, "sync_schedule", "0 * * * *"),
        dry_run_mode=await _get_setting_value(db, "dry_run_mode", True),
        default_grace_period_days=await _get_setting_value(db, "default_grace_period_days", 7),
        max_deletions_per_run=await _get_setting_value(db, "max_deletions_per_run", 10),
    )


@router.put("/settings", response_model=SystemSettingsResponse)
async def update_system_settings(
    settings_data: SystemSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_admin)
):
    """Update multiple system settings at once."""
    # Update only provided fields
    if settings_data.cleanup_enabled is not None:
        await _set_setting_value(db, "cleanup_enabled", settings_data.cleanup_enabled, "Enable automatic cleanup")
    if settings_data.cleanup_schedule is not None:
        await _set_setting_value(db, "cleanup_schedule", settings_data.cleanup_schedule, "Cron schedule for cleanup")
    if settings_data.sync_schedule is not None:
        await _set_setting_value(db, "sync_schedule", settings_data.sync_schedule, "Cron schedule for sync")
    if settings_data.dry_run_mode is not None:
        await _set_setting_value(db, "dry_run_mode", settings_data.dry_run_mode, "Only simulate cleanups without deleting")
    if settings_data.default_grace_period_days is not None:
        await _set_setting_value(db, "default_grace_period_days", settings_data.default_grace_period_days, "Default grace period in days")
    if settings_data.max_deletions_per_run is not None:
        await _set_setting_value(db, "max_deletions_per_run", settings_data.max_deletions_per_run, "Maximum deletions per cleanup run")
    
    await db.commit()
    
    # Return updated settings
    return SystemSettingsResponse(
        id=1,
        cleanup_enabled=await _get_setting_value(db, "cleanup_enabled", True),
        cleanup_schedule=await _get_setting_value(db, "cleanup_schedule", "0 3 * * *"),
        sync_schedule=await _get_setting_value(db, "sync_schedule", "0 * * * *"),
        dry_run_mode=await _get_setting_value(db, "dry_run_mode", True),
        default_grace_period_days=await _get_setting_value(db, "default_grace_period_days", 7),
        max_deletions_per_run=await _get_setting_value(db, "max_deletions_per_run", 10),
    )


@router.put("/settings/{key}", response_model=SystemSettingResponse)
async def update_system_setting(
    key: str,
    setting_data: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_admin)
):
    """Update a single system setting by key."""
    if key not in ALLOWED_SETTING_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown setting key: '{key}'. Allowed keys: {', '.join(sorted(ALLOWED_SETTING_KEYS))}"
        )
    await _set_setting_value(db, key, setting_data.value)
    await db.commit()
    
    return SystemSettingResponse(
        key=key,
        value=await _get_setting_value(db, key, setting_data.value)
    )


@router.post("/cleanup/run")
async def trigger_cleanup_run(
    dry_run: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_admin)
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
    current_user = Depends(get_current_active_admin)
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
    current_user = Depends(get_current_active_admin)
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
