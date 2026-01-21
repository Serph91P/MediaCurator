"""
API routes for staging system (soft-delete).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime

from ...api.deps import get_current_user, get_db
from ...models import MediaItem, User, SystemSettings
from ...services.staging import StagingService
from ...services.emby import EmbyService
from pydantic import BaseModel, Field


router = APIRouter()


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
async def get_staged_items(
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
async def get_staging_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get staging statistics."""
    from datetime import timedelta
    
    now = datetime.utcnow()
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
async def stage_media_items(
    request: StageMediaRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move media items to staging."""
    staging_service = StagingService(db)
    emby_service = EmbyService(db)
    
    success_count = 0
    failed_count = 0
    errors = []
    
    for media_id in request.media_ids:
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
async def stage_single_item(
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
async def restore_single_item(
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
async def permanent_delete_item(
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
async def get_staging_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get staging system settings."""
    staging_service = StagingService(db)
    settings = await staging_service.get_settings()
    
    return StagingSettingsResponse(
        enabled=settings['enabled'],
        staging_path=settings['staging_path'],
        grace_period_days=settings['grace_period_days'],
        library_name=settings['library_name'],
        auto_restore_on_watch=settings['auto_restore_on_watch']
    )


@router.put("/settings", response_model=StagingSettingsResponse)
async def update_staging_settings(
    update: StagingSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update staging system settings."""
    updates = update.model_dump(exclude_unset=True)
    
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
    settings = await staging_service.get_settings()
    
    return StagingSettingsResponse(
        enabled=settings['enabled'],
        staging_path=settings['staging_path'],
        grace_period_days=settings['grace_period_days'],
        library_name=settings['library_name'],
        auto_restore_on_watch=settings['auto_restore_on_watch']
    )
