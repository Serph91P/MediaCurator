"""
Media API routes.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Dict, Any

from ...core.database import get_db
from ...models import MediaItem, ServiceConnection, ServiceType, MediaType
from ..deps import get_current_user

router = APIRouter(prefix="/media", tags=["Media"])


@router.get("/stats")
async def get_media_stats(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get detailed media statistics including per-service breakdown."""
    
    # Overall counts
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
    
    # Total size
    size_result = await db.execute(
        select(func.sum(MediaItem.size_bytes))
    )
    total_size = size_result.scalar() or 0
    
    flagged_size_result = await db.execute(
        select(func.sum(MediaItem.size_bytes)).where(MediaItem.flagged_for_cleanup == True)
    )
    flagged_size = flagged_size_result.scalar() or 0
    
    # Per-service breakdown
    services_result = await db.execute(select(ServiceConnection))
    services = services_result.scalars().all()
    
    service_stats = []
    for service in services:
        # Count by media type per service
        service_total = await db.execute(
            select(func.count(MediaItem.id)).where(
                MediaItem.service_connection_id == service.id
            )
        )
        service_count = service_total.scalar() or 0
        
        service_movies = await db.execute(
            select(func.count(MediaItem.id)).where(
                MediaItem.service_connection_id == service.id,
                MediaItem.media_type == MediaType.MOVIE
            )
        )
        movies_count = service_movies.scalar() or 0
        
        service_series = await db.execute(
            select(func.count(MediaItem.id)).where(
                MediaItem.service_connection_id == service.id,
                MediaItem.media_type == MediaType.SERIES
            )
        )
        series_count = service_series.scalar() or 0
        
        service_episodes = await db.execute(
            select(func.count(MediaItem.id)).where(
                MediaItem.service_connection_id == service.id,
                MediaItem.media_type == MediaType.EPISODE
            )
        )
        episodes_count = service_episodes.scalar() or 0
        
        service_stats.append({
            "service_id": service.id,
            "service_name": service.name,
            "service_type": service.service_type.value,
            "total_items": service_count,
            "movies": movies_count,
            "series": series_count,
            "episodes": episodes_count,
            "last_sync": service.last_sync.isoformat() if service.last_sync else None
        })
    
    return {
        "total_items": total,
        "movies": movies,
        "series": series,
        "episodes": episodes,
        "flagged_items": flagged,
        "total_size_bytes": total_size,
        "flagged_size_bytes": flagged_size,
        "service_breakdown": service_stats
    }
