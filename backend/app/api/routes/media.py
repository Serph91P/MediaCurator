"""
Media items API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from typing import List, Optional

from ...core.database import get_db
from ...models import MediaItem, MediaType, CleanupLog
from ...schemas import MediaItemResponse, MediaItemFilter, CleanupLogResponse
from ..deps import get_current_user

router = APIRouter(prefix="/media", tags=["Media Items"])


@router.get("/", response_model=List[MediaItemResponse])
async def list_media(
    media_type: Optional[MediaType] = None,
    library_id: Optional[int] = None,
    service_connection_id: Optional[int] = None,
    is_watched: Optional[bool] = None,
    flagged_for_cleanup: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List media items with filtering and pagination."""
    query = select(MediaItem)
    
    # Apply filters
    conditions = []
    
    if media_type:
        conditions.append(MediaItem.media_type == media_type)
    
    if service_connection_id:
        conditions.append(MediaItem.service_connection_id == service_connection_id)
    
    if is_watched is not None:
        conditions.append(MediaItem.is_watched == is_watched)
    
    if flagged_for_cleanup is not None:
        conditions.append(MediaItem.flagged_for_cleanup == flagged_for_cleanup)
    
    if search:
        conditions.append(MediaItem.title.ilike(f"%{search}%"))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Add pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def get_media_stats(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get media statistics."""
    # Total counts
    total_result = await db.execute(select(func.count(MediaItem.id)))
    total = total_result.scalar()
    
    movies_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.MOVIE)
    )
    movies = movies_result.scalar()
    
    series_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.SERIES)
    )
    series = series_result.scalar()
    
    episodes_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.EPISODE)
    )
    episodes = episodes_result.scalar()
    
    flagged_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.flagged_for_cleanup == True)
    )
    flagged = flagged_result.scalar()
    
    # Size stats
    total_size_result = await db.execute(select(func.sum(MediaItem.size_bytes)))
    total_size = total_size_result.scalar() or 0
    
    flagged_size_result = await db.execute(
        select(func.sum(MediaItem.size_bytes)).where(MediaItem.flagged_for_cleanup == True)
    )
    flagged_size = flagged_size_result.scalar() or 0
    
    return {
        "total_items": total,
        "movies": movies,
        "series": series,
        "episodes": episodes,
        "flagged_items": flagged,
        "total_size_bytes": total_size,
        "flagged_size_bytes": flagged_size
    }


@router.get("/flagged", response_model=List[MediaItemResponse])
async def list_flagged_media(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List media items flagged for cleanup."""
    result = await db.execute(
        select(MediaItem)
        .where(MediaItem.flagged_for_cleanup == True)
        .order_by(MediaItem.scheduled_cleanup_at)
    )
    return result.scalars().all()


@router.get("/{item_id}", response_model=MediaItemResponse)
async def get_media_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a specific media item."""
    result = await db.execute(
        select(MediaItem).where(MediaItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media item not found"
        )
    return item


@router.post("/{item_id}/unflag")
async def unflag_media_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Remove cleanup flag from a media item."""
    result = await db.execute(
        select(MediaItem).where(MediaItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media item not found"
        )
    
    item.flagged_for_cleanup = False
    item.flagged_at = None
    item.scheduled_cleanup_at = None
    item.flagged_by_rule_id = None
    
    await db.commit()
    return {"message": "Item unflagged"}


@router.post("/{item_id}/protect")
async def protect_media_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Mark a media item as favorited (protected from cleanup)."""
    result = await db.execute(
        select(MediaItem).where(MediaItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media item not found"
        )
    
    item.is_favorited = True
    item.flagged_for_cleanup = False
    item.flagged_at = None
    item.scheduled_cleanup_at = None
    
    await db.commit()
    return {"message": "Item protected"}


@router.get("/logs/history", response_model=List[CleanupLogResponse])
async def get_cleanup_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get cleanup action history."""
    result = await db.execute(
        select(CleanupLog)
        .order_by(CleanupLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return result.scalars().all()
