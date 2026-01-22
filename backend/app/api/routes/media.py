"""
Media API routes.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from ...core.database import get_db
from ...models import MediaItem, ServiceConnection, ServiceType, MediaType, ImportStats, CleanupLog
from ...schemas import CleanupLogResponse
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
    
    # Per-service breakdown (only include services that can have media items)
    services_result = await db.execute(
        select(ServiceConnection).where(
            ServiceConnection.service_type.in_([ServiceType.SONARR, ServiceType.RADARR])
        )
    )
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


@router.get("/watch-stats")
async def get_watch_stats(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get watch statistics (most watched items, recently watched, etc.)."""
    
    # Most watched items
    from sqlalchemy.orm import joinedload
    most_watched_result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
        .where(MediaItem.watch_count > 0)
        .order_by(MediaItem.watch_count.desc())
        .limit(limit)
    )
    most_watched = most_watched_result.scalars().all()

    # Recently watched items
    recently_watched_result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
        .where(MediaItem.last_watched_at.isnot(None))
        .order_by(MediaItem.last_watched_at.desc())
        .limit(limit)
    )
    recently_watched = recently_watched_result.scalars().all()

    # Currently watching (in progress)
    currently_watching_result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
        .where(
            and_(
                MediaItem.is_currently_watching == True,
                MediaItem.progress_percent > 0,
                MediaItem.progress_percent < 100
            )
        )
        .order_by(MediaItem.last_progress_update.desc())
        .limit(limit)
    )
    currently_watching = currently_watching_result.scalars().all()
    
    # Watch statistics aggregation
    total_watches_result = await db.execute(
        select(func.sum(MediaItem.watch_count))
    )
    total_watches = total_watches_result.scalar() or 0
    
    watched_items_result = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.is_watched == True)
    )
    watched_items = watched_items_result.scalar() or 0
    
    # Most watched by type
    movies_watched_result = await db.execute(
        select(func.sum(MediaItem.watch_count))
        .where(MediaItem.media_type == MediaType.MOVIE)
    )
    movies_watches = movies_watched_result.scalar() or 0
    
    episodes_watched_result = await db.execute(
        select(func.sum(MediaItem.watch_count))
        .where(MediaItem.media_type == MediaType.EPISODE)
    )
    episodes_watches = episodes_watched_result.scalar() or 0
    
    # Get service info for enrichment
    services_result = await db.execute(select(ServiceConnection))
    services = {s.id: s for s in services_result.scalars().all()}
    
    def format_media_item(item: MediaItem) -> dict:
        service = services.get(item.service_connection_id)
        return {
            "id": item.id,
            "title": item.title,
            "media_type": item.media_type.value,
            "year": item.year,
            "watch_count": item.watch_count,
            "is_watched": item.is_watched,
            "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
            "progress_percent": item.progress_percent,
            "is_favorited": item.is_favorited,
            "rating": item.rating,
            "service_name": service.name if service else None,
            "genres": item.genres if item.genres else []
        }
    
    return {
        "summary": {
            "total_watches": int(total_watches),
            "watched_items": watched_items,
            "movies_watches": int(movies_watches),
            "episodes_watches": int(episodes_watches)
        },
        "most_watched": [format_media_item(item) for item in most_watched],
        "recently_watched": [format_media_item(item) for item in recently_watched],
        "currently_watching": [format_media_item(item) for item in currently_watching]
    }


@router.get("/audit-log", response_model=Dict[str, Any])
async def get_audit_log(
    action: Optional[str] = Query(None, description="Filter by action type (delete, notify, etc.)"),
    status: Optional[str] = Query(None, description="Filter by status (success, failed, skipped)"),
    start_date: Optional[datetime] = Query(None, description="Start date for filtering"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering"),
    limit: int = Query(50, le=500, description="Number of records to return"),
    offset: int = Query(0, ge=0, description="Number of records to skip"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get cleanup audit log with filtering and pagination.
    
    Returns a paginated list of cleanup actions with full details including:
    - Action type and status
    - Associated media item and rule
    - Timestamps and error messages
    - Media snapshots at time of action
    """
    
    # Build query with filters
    conditions = []
    
    if action:
        conditions.append(CleanupLog.action == action)
    
    if status:
        conditions.append(CleanupLog.status == status)
    
    if start_date:
        conditions.append(CleanupLog.created_at >= start_date)
    
    if end_date:
        conditions.append(CleanupLog.created_at <= end_date)
    
    # Get total count
    count_query = select(func.count(CleanupLog.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    
    result = await db.execute(count_query)
    total = result.scalar() or 0
    
    # Get paginated logs
    logs_query = select(CleanupLog).order_by(desc(CleanupLog.created_at))
    
    if conditions:
        logs_query = logs_query.where(and_(*conditions))
    
    logs_query = logs_query.limit(limit).offset(offset)
    result = await db.execute(logs_query)
    logs = result.scalars().all()
    
    # Format logs with additional context
    formatted_logs = []
    for log in logs:
        log_dict = {
            "id": log.id,
            "media_item_id": log.media_item_id,
            "rule_id": log.rule_id,
            "action": log.action,
            "status": log.status,
            "details": log.details,
            "error_message": log.error_message,
            "media_title": log.media_title,
            "media_path": log.media_path,
            "media_size_bytes": log.media_size_bytes,
            "created_at": log.created_at.isoformat() if log.created_at else None
        }
        formatted_logs.append(log_dict)
    
    # Get summary statistics
    stats_query = select(
        func.count(CleanupLog.id).label("total_actions"),
        func.count(func.distinct(CleanupLog.action)).label("unique_actions"),
        func.sum(CleanupLog.media_size_bytes).label("total_size_freed")
    )
    
    if conditions:
        stats_query = stats_query.where(and_(*conditions))
    
    result = await db.execute(stats_query)
    stats = result.first()
    
    # Get action breakdown
    action_breakdown_query = select(
        CleanupLog.action,
        CleanupLog.status,
        func.count(CleanupLog.id).label("count")
    ).group_by(CleanupLog.action, CleanupLog.status)
    
    if conditions:
        action_breakdown_query = action_breakdown_query.where(and_(*conditions))
    
    result = await db.execute(action_breakdown_query)
    action_breakdown = [
        {"action": row.action, "status": row.status, "count": row.count}
        for row in result.all()
    ]
    
    return {
        "logs": formatted_logs,
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total
        },
        "summary": {
            "total_actions": stats.total_actions if stats else 0,
            "unique_actions": stats.unique_actions if stats else 0,
            "total_size_freed_bytes": float(stats.total_size_freed) if stats and stats.total_size_freed else 0
        },
        "action_breakdown": action_breakdown
    }

