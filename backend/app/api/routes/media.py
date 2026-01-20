"""
Media API routes.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

from ...core.database import get_db
from ...models import MediaItem, ServiceConnection, ServiceType, MediaType, ImportStats
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


@router.get("/import-stats")
async def get_import_stats(
    days: int = Query(default=30, ge=1, le=365),
    service_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get import statistics for the last N days, optionally filtered by service."""
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    # Build query
    query = select(ImportStats).where(ImportStats.created_at >= cutoff_date)
    if service_id:
        query = query.where(ImportStats.service_connection_id == service_id)
    
    query = query.order_by(ImportStats.created_at.desc())
    
    result = await db.execute(query)
    stats = result.scalars().all()
    
    # Get service info
    services_result = await db.execute(select(ServiceConnection))
    services = {s.id: s for s in services_result.scalars().all()}
    
    # Format response
    imports = []
    for stat in stats:
        service = services.get(stat.service_connection_id)
        imports.append({
            "id": stat.id,
            "service_id": stat.service_connection_id,
            "service_name": service.name if service else "Unknown",
            "service_type": service.service_type.value if service else None,
            "items_added": stat.items_added,
            "items_updated": stat.items_updated,
            "movies_added": stat.movies_added,
            "series_added": stat.series_added,
            "episodes_added": stat.episodes_added,
            "sync_duration_seconds": stat.sync_duration_seconds,
            "error_message": stat.error_message,
            "created_at": stat.created_at.isoformat() if stat.created_at else None
        })
    
    # Calculate aggregated stats
    total_added = sum(s.items_added for s in stats)
    total_updated = sum(s.items_updated for s in stats)
    total_movies = sum(s.movies_added for s in stats)
    total_series = sum(s.series_added for s in stats)
    total_episodes = sum(s.episodes_added for s in stats)
    
    # Per-service aggregation
    service_totals = {}
    for stat in stats:
        if stat.service_connection_id not in service_totals:
            service = services.get(stat.service_connection_id)
            service_totals[stat.service_connection_id] = {
                "service_id": stat.service_connection_id,
                "service_name": service.name if service else "Unknown",
                "service_type": service.service_type.value if service else None,
                "total_added": 0,
                "total_updated": 0,
                "movies_added": 0,
                "series_added": 0,
                "episodes_added": 0,
                "sync_count": 0
            }
        
        service_totals[stat.service_connection_id]["total_added"] += stat.items_added
        service_totals[stat.service_connection_id]["total_updated"] += stat.items_updated
        service_totals[stat.service_connection_id]["movies_added"] += stat.movies_added
        service_totals[stat.service_connection_id]["series_added"] += stat.series_added
        service_totals[stat.service_connection_id]["episodes_added"] += stat.episodes_added
        service_totals[stat.service_connection_id]["sync_count"] += 1
    
    return {
        "period_days": days,
        "total_syncs": len(stats),
        "total_added": total_added,
        "total_updated": total_updated,
        "movies_added": total_movies,
        "series_added": total_series,
        "episodes_added": total_episodes,
        "by_service": list(service_totals.values()),
        "recent_imports": imports[:50]  # Limit to 50 most recent
    }
