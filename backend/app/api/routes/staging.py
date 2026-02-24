"""
API routes for staging system (soft-delete).
"""
import os
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone

from ...api.deps import get_current_user, get_db
from ...core.config import get_settings
from ...core.rate_limit import limiter, RateLimits
from ...models import MediaItem, User, SystemSettings
from ...services.staging import StagingService
from ...services.emby import EmbyService
from pydantic import BaseModel, Field


router = APIRouter()


def _validate_staging_path(path: str) -> str:
    """Validate staging path is absolute and within allowed directories."""
    settings = get_settings()
    allowed_roots = [
        os.path.realpath(settings.data_path),
        os.path.realpath(settings.media_path),
    ]

    resolved = os.path.realpath(path)

    if not os.path.isabs(resolved):
        raise HTTPException(status_code=400, detail="Staging path must be absolute")

    if not any(resolved == root or resolved.startswith(root + os.sep) for root in allowed_roots):
        raise HTTPException(
            status_code=400,
            detail="Staging path must be within the configured data or media directories"
        )

    return resolved


# Schemas
class StagedItemResponse(BaseModel):
    id: int
    title: str
    media_type: str
    staged_at: datetime
    permanent_delete_at: Optional[datetime]
    original_path: str
    staged_path: str
    size_bytes: Optional[int]
    series_id: Optional[int] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    
    class Config:
        from_attributes = True


class StagingStatsResponse(BaseModel):
    total_staged: int
    total_size_bytes: int
    expiring_soon: int  # Expiring in next 7 days
    expired: int  # Already past grace period


class StagingSettingsResponse(BaseModel):
    enabled: bool
    staging_path: str
    grace_period_days: int
    library_name: str
    auto_restore_on_watch: bool


class LibraryStagingSettingsResponse(BaseModel):
    library_id: int
    library_name: str
    staging_enabled: Optional[bool] = None  # None = use global
    staging_path: Optional[str] = None
    staging_grace_period_days: Optional[int] = None
    staging_auto_restore: Optional[bool] = None
    staging_library_name: Optional[str] = None  # Custom Emby library name
    uses_custom_settings: bool
    effective_enabled: bool  # Calculated: library setting or global fallback
    effective_path: str
    effective_grace_period_days: int
    effective_auto_restore: bool
    effective_library_name: str  # The library name that will be used in Emby


class LibraryStagingSettingsUpdate(BaseModel):
    staging_enabled: Optional[bool] = None
    staging_path: Optional[str] = None
    staging_grace_period_days: Optional[int] = Field(None, ge=1, le=365)
    staging_auto_restore: Optional[bool] = None
    staging_library_name: Optional[str] = None


class StagingSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    staging_path: Optional[str] = None
    grace_period_days: Optional[int] = Field(None, ge=1, le=365)
    library_name: Optional[str] = None
    auto_restore_on_watch: Optional[bool] = None


class StageMediaRequest(BaseModel):
    media_ids: List[int]


class ActionResponse(BaseModel):
    success: bool
    message: str
    details: Optional[dict] = None


@router.get("/staged", response_model=List[StagedItemResponse])
@limiter.limit(RateLimits.API_READ)
async def get_staged_items(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all currently staged items."""
    result = await db.execute(
        select(MediaItem)
        .where(MediaItem.is_staged == True)
        .order_by(MediaItem.permanent_delete_at.asc())
    )
    items = result.scalars().all()
    return items


@router.get("/stats", response_model=StagingStatsResponse)
@limiter.limit(RateLimits.API_READ)
async def get_staging_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get staging statistics."""
    from datetime import timedelta
    
    now = datetime.now(timezone.utc)
    soon_threshold = now + timedelta(days=7)
    
    # Total staged
    total_result = await db.execute(
        select(func.count(MediaItem.id))
        .where(MediaItem.is_staged == True)
    )
    total_staged = total_result.scalar() or 0
    
    # Total size
    size_result = await db.execute(
        select(func.sum(MediaItem.size_bytes))
        .where(MediaItem.is_staged == True)
    )
    total_size = size_result.scalar() or 0
    
    # Expiring soon
    soon_result = await db.execute(
        select(func.count(MediaItem.id))
        .where(
            MediaItem.is_staged == True,
            MediaItem.permanent_delete_at <= soon_threshold,
            MediaItem.permanent_delete_at > now
        )
    )
    expiring_soon = soon_result.scalar() or 0
    
    # Already expired
    expired_result = await db.execute(
        select(func.count(MediaItem.id))
        .where(
            MediaItem.is_staged == True,
            MediaItem.permanent_delete_at <= now
        )
    )
    expired = expired_result.scalar() or 0
    
    return StagingStatsResponse(
        total_staged=total_staged,
        total_size_bytes=total_size,
        expiring_soon=expiring_soon,
        expired=expired
    )


@router.post("/stage", response_model=ActionResponse)
@limiter.limit(RateLimits.API_WRITE)
async def stage_media_items(
    request: Request,
    stage_request: StageMediaRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move media items to staging."""
    staging_service = StagingService(db)
    emby_service = EmbyService(db)
    
    success_count = 0
    failed_count = 0
    errors = []
    
    for media_id in stage_request.media_ids:
        result = await db.execute(
            select(MediaItem).where(MediaItem.id == media_id)
        )
        media_item = result.scalar_one_or_none()
        
        if not media_item:
            failed_count += 1
            errors.append(f"Media item {media_id} not found")
            continue
        
        result = await staging_service.move_to_staging(media_item, emby_service)
        if result['success']:
            success_count += 1
        else:
            failed_count += 1
            errors.append(f"{media_item.title}: {result.get('error')}")
    
    return ActionResponse(
        success=failed_count == 0,
        message=f"Staged {success_count} items, {failed_count} failed",
        details={"success": success_count, "failed": failed_count, "errors": errors}
    )


@router.post("/{media_id}/stage", response_model=ActionResponse)
@limiter.limit(RateLimits.API_WRITE)
async def stage_single_item(
    request: Request,
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move a single media item to staging."""
    result = await db.execute(
        select(MediaItem).where(MediaItem.id == media_id)
    )
    media_item = result.scalar_one_or_none()
    
    if not media_item:
        raise HTTPException(status_code=404, detail="Media item not found")
    
    staging_service = StagingService(db)
    emby_service = EmbyService(db)
    
    result = await staging_service.move_to_staging(media_item, emby_service)
    
    if result['success']:
        return ActionResponse(
            success=True,
            message=f"Staged {media_item.title}",
            details=result
        )
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))


@router.post("/{media_id}/restore", response_model=ActionResponse)
@limiter.limit(RateLimits.API_WRITE)
async def restore_single_item(
    request: Request,
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Restore a staged media item to its original location."""
    result = await db.execute(
        select(MediaItem).where(MediaItem.id == media_id)
    )
    media_item = result.scalar_one_or_none()
    
    if not media_item:
        raise HTTPException(status_code=404, detail="Media item not found")
    
    if not media_item.is_staged:
        raise HTTPException(status_code=400, detail="Media item is not staged")
    
    staging_service = StagingService(db)
    emby_service = EmbyService(db)
    
    result = await staging_service.restore_from_staging(media_item, emby_service)
    
    if result['success']:
        return ActionResponse(
            success=True,
            message=f"Restored {media_item.title}",
            details=result
        )
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))


@router.delete("/{media_id}/permanent", response_model=ActionResponse)
@limiter.limit(RateLimits.CLEANUP_OPERATION)
async def permanent_delete_item(
    request: Request,
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Permanently delete a staged media item."""
    result = await db.execute(
        select(MediaItem).where(MediaItem.id == media_id)
    )
    media_item = result.scalar_one_or_none()
    
    if not media_item:
        raise HTTPException(status_code=404, detail="Media item not found")
    
    if not media_item.is_staged:
        raise HTTPException(status_code=400, detail="Media item is not staged")
    
    staging_service = StagingService(db)
    emby_service = EmbyService(db)
    
    result = await staging_service.permanent_delete(media_item, emby_service)
    
    if result['success']:
        return ActionResponse(
            success=True,
            message=f"Permanently deleted {media_item.title}"
        )
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))


@router.get("/settings", response_model=StagingSettingsResponse)
@limiter.limit(RateLimits.API_READ)
async def get_staging_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get global staging system settings."""
    staging_service = StagingService(db)
    settings = await staging_service.get_global_settings()
    
    return StagingSettingsResponse(
        enabled=settings['enabled'],
        staging_path=settings['staging_path'],
        grace_period_days=settings['grace_period_days'],
        library_name=settings['library_name'],
        auto_restore_on_watch=settings['auto_restore_on_watch']
    )


@router.put("/settings", response_model=StagingSettingsResponse)
@limiter.limit(RateLimits.API_WRITE)
async def update_staging_settings(
    request: Request,
    update: StagingSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update staging system settings."""
    updates = update.model_dump(exclude_unset=True)

    if 'staging_path' in updates and updates['staging_path'] is not None:
        updates['staging_path'] = _validate_staging_path(updates['staging_path'])
    
    # Map API field names to database keys
    key_mapping = {
        'enabled': 'staging_enabled',
        'staging_path': 'staging_path',
        'grace_period_days': 'staging_grace_period_days',
        'library_name': 'staging_library_name',
        'auto_restore_on_watch': 'staging_auto_restore'
    }
    
    for field_name, value in updates.items():
        setting_key = key_mapping.get(field_name)
        if not setting_key:
            continue
        
        result = await db.execute(
            select(SystemSettings).where(SystemSettings.key == setting_key)
        )
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.value = value
        else:
            setting = SystemSettings(key=setting_key, value=value)
            db.add(setting)
    
    await db.commit()
    
    # Return updated settings
    staging_service = StagingService(db)
    settings = await staging_service.get_global_settings()
    
    return StagingSettingsResponse(
        enabled=settings['enabled'],
        staging_path=settings['staging_path'],
        grace_period_days=settings['grace_period_days'],
        library_name=settings['library_name'],
        auto_restore_on_watch=settings['auto_restore_on_watch']
    )


@router.get("/libraries", response_model=List[LibraryStagingSettingsResponse])
@limiter.limit(RateLimits.API_READ)
async def get_library_staging_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get staging settings for all libraries."""
    from ...models import Library
    
    staging_service = StagingService(db)
    
    result = await db.execute(select(Library).where(Library.is_enabled == True))
    libraries = result.scalars().all()
    
    library_settings = []
    for lib in libraries:
        effective_settings = await staging_service.get_settings(lib)
        uses_custom = (
            lib.staging_enabled is not None or 
            lib.staging_path is not None or
            lib.staging_grace_period_days is not None or
            lib.staging_auto_restore is not None or
            lib.staging_library_name is not None
        )
        
        library_settings.append(LibraryStagingSettingsResponse(
            library_id=lib.id,
            library_name=lib.name,
            staging_enabled=lib.staging_enabled,
            staging_path=lib.staging_path,
            staging_grace_period_days=lib.staging_grace_period_days,
            staging_auto_restore=lib.staging_auto_restore,
            staging_library_name=lib.staging_library_name,
            uses_custom_settings=uses_custom,
            effective_enabled=effective_settings['enabled'],
            effective_path=effective_settings['staging_path'],
            effective_grace_period_days=effective_settings['grace_period_days'],
            effective_auto_restore=effective_settings['auto_restore_on_watch'],
            effective_library_name=effective_settings['library_name']
        ))
    
    return library_settings


@router.get("/libraries/{library_id}", response_model=LibraryStagingSettingsResponse)
@limiter.limit(RateLimits.API_READ)
async def get_library_staging_setting(
    request: Request,
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get staging settings for a specific library."""
    from ...models import Library
    
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    staging_service = StagingService(db)
    effective_settings = await staging_service.get_settings(library)
    uses_custom = (
        library.staging_enabled is not None or 
        library.staging_path is not None or
        library.staging_grace_period_days is not None or
        library.staging_auto_restore is not None or
        library.staging_library_name is not None
    )
    
    return LibraryStagingSettingsResponse(
        library_id=library.id,
        library_name=library.name,
        staging_enabled=library.staging_enabled,
        staging_path=library.staging_path,
        staging_grace_period_days=library.staging_grace_period_days,
        staging_auto_restore=library.staging_auto_restore,
        staging_library_name=library.staging_library_name,
        uses_custom_settings=uses_custom,
        effective_enabled=effective_settings['enabled'],
        effective_path=effective_settings['staging_path'],
        effective_grace_period_days=effective_settings['grace_period_days'],
        effective_auto_restore=effective_settings['auto_restore_on_watch'],
        effective_library_name=effective_settings['library_name']
    )


@router.put("/libraries/{library_id}", response_model=LibraryStagingSettingsResponse)
@limiter.limit(RateLimits.API_WRITE)
async def update_library_staging_settings(
    request: Request,
    library_id: int,
    update: LibraryStagingSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update staging settings for a specific library."""
    from ...models import Library
    
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    # Update library staging settings
    updates = update.model_dump(exclude_unset=True)

    if 'staging_path' in updates and updates['staging_path'] is not None:
        updates['staging_path'] = _validate_staging_path(updates['staging_path'])

    for key, value in updates.items():
        setattr(library, key, value)
    
    await db.commit()
    await db.refresh(library)
    
    staging_service = StagingService(db)
    effective_settings = await staging_service.get_settings(library)
    uses_custom = (
        library.staging_enabled is not None or 
        library.staging_path is not None or
        library.staging_grace_period_days is not None or
        library.staging_auto_restore is not None or
        library.staging_library_name is not None
    )
    
    return LibraryStagingSettingsResponse(
        library_id=library.id,
        library_name=library.name,
        staging_enabled=library.staging_enabled,
        staging_path=library.staging_path,
        staging_grace_period_days=library.staging_grace_period_days,
        staging_auto_restore=library.staging_auto_restore,
        staging_library_name=library.staging_library_name,
        uses_custom_settings=uses_custom,
        effective_enabled=effective_settings['enabled'],
        effective_path=effective_settings['staging_path'],
        effective_grace_period_days=effective_settings['grace_period_days'],
        effective_auto_restore=effective_settings['auto_restore_on_watch'],
        effective_library_name=effective_settings['library_name']
    )


@router.delete("/libraries/{library_id}/settings")
@limiter.limit(RateLimits.API_WRITE)
async def reset_library_staging_settings(
    request: Request,
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reset library staging settings to use global defaults."""
    from ...models import Library
    
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    # Reset all staging settings to NULL (use global)
    library.staging_enabled = None
    library.staging_path = None
    library.staging_grace_period_days = None
    library.staging_auto_restore = None
    library.staging_library_name = None
    
    await db.commit()
    
    return {"success": True, "message": f"Staging settings for {library.name} reset to global defaults"}
