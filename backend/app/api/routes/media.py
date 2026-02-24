"""
Media API routes.
"""
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
import httpx
from loguru import logger

from ...core.database import get_db
from ...core.rate_limit import limiter, RateLimits
from ...models import MediaItem, ServiceConnection, ServiceType, MediaType, ImportStats, CleanupLog, MediaServerUser, UserWatchHistory, Library
from ...schemas import CleanupLogResponse
from ..deps import get_current_user

router = APIRouter(prefix="/media", tags=["Media"])


@router.get("/stats")
@limiter.limit(RateLimits.API_READ)
async def get_media_stats(
    request: Request,
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
@limiter.limit(RateLimits.API_READ)
async def get_import_stats(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    service_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get import statistics for the last N days, optionally filtered by service."""
    
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
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
@limiter.limit(RateLimits.API_READ)
async def get_watch_stats(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    days: int = Query(default=30, ge=1, le=365, description="Filter by last N days"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get watch statistics (most watched items, recently watched, etc.)."""
    
    # Calculate date filter
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Most watched items - prioritize items with actual watch counts
    from sqlalchemy.orm import joinedload
    from sqlalchemy import case
    
    # First try to get items with actual watch counts > 0
    most_watched_result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
        .where(MediaItem.watch_count > 0)
        .order_by(MediaItem.watch_count.desc(), MediaItem.last_watched_at.desc().nullslast())
        .limit(limit)
    )
    most_watched = most_watched_result.scalars().all()
    
    # If no items with watch_count, fall back to items marked as watched (any)
    if not most_watched:
        most_watched_result = await db.execute(
            select(MediaItem)
            .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
            .where(MediaItem.is_watched == True)
            .order_by(MediaItem.last_watched_at.desc().nullslast())
            .limit(limit)
        )
        most_watched = most_watched_result.scalars().all()

    # Recently watched items - show items that are watched, prioritize those with last_watched_at
    recently_watched_result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
        .where(MediaItem.is_watched == True)
        .order_by(MediaItem.last_watched_at.desc().nullslast())
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


@router.get("/dashboard-stats")
@limiter.limit(RateLimits.API_READ)
async def get_dashboard_stats(
    request: Request,
    days: int = Query(default=30, ge=1, le=365, description="Filter watch stats by last N days"),
    limit: int = Query(default=5, ge=1, le=20, description="Number of items per category"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get comprehensive dashboard statistics.
    Includes: most viewed movies/series, library overview, watch trends.
    """
    
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Get service info for enrichment
    services_result = await db.execute(select(ServiceConnection))
    services = {s.id: s for s in services_result.scalars().all()}
    
    def format_item(item: MediaItem) -> dict:
        service = services.get(item.service_connection_id)
        return {
            "id": item.id,
            "title": item.title,
            "media_type": item.media_type.value,
            "year": item.year,
            "watch_count": item.watch_count or 0,
            "is_favorited": item.is_favorited,
            "rating": item.rating,
            "service_name": service.name if service else None,
            "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
            "library_id": item.library_id
        }
    
    # === MOST VIEWED MOVIES (by plays) ===
    most_viewed_movies_result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection))
        .where(
            and_(
                MediaItem.media_type == MediaType.MOVIE,
                MediaItem.watch_count > 0
            )
        )
        .order_by(MediaItem.watch_count.desc())
        .limit(limit)
    )
    most_viewed_movies = [format_item(m) for m in most_viewed_movies_result.scalars().all()]
    
    # === MOST VIEWED SERIES (aggregate episode plays per series) ===
    # Get series with most total episode plays using series_id (external ID)
    series_plays_result = await db.execute(
        select(
            MediaItem.series_id,
            func.sum(MediaItem.watch_count).label('total_plays')
        )
        .where(
            and_(
                MediaItem.media_type == MediaType.EPISODE,
                MediaItem.series_id.isnot(None),
                MediaItem.watch_count > 0
            )
        )
        .group_by(MediaItem.series_id)
        .order_by(func.sum(MediaItem.watch_count).desc())
        .limit(limit)
    )
    series_plays = series_plays_result.all()
    
    # Get the actual series info using external_id
    most_viewed_series = []
    for row in series_plays:
        if row.series_id:
            series_result = await db.execute(
                select(MediaItem)
                .options(joinedload(MediaItem.service_connection))
                .where(
                    and_(
                        MediaItem.external_id == row.series_id,
                        MediaItem.media_type == MediaType.SERIES
                    )
                )
            )
            series = series_result.scalar_one_or_none()
            if series:
                item_data = format_item(series)
                item_data['watch_count'] = int(row.total_plays)
                most_viewed_series.append(item_data)
    
    # Fallback: if no episode aggregation, show series with watch_count
    if not most_viewed_series:
        series_direct_result = await db.execute(
            select(MediaItem)
            .options(joinedload(MediaItem.service_connection))
            .where(
                and_(
                    MediaItem.media_type == MediaType.SERIES,
                    MediaItem.watch_count > 0
                )
            )
            .order_by(MediaItem.watch_count.desc())
            .limit(limit)
        )
        most_viewed_series = [format_item(s) for s in series_direct_result.scalars().all()]
    
    # === RECENTLY ADDED (last 30 days) ===
    recently_added_result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection))
        .where(
            and_(
                MediaItem.added_at >= cutoff_date,
                MediaItem.media_type.in_([MediaType.MOVIE, MediaType.SERIES])
            )
        )
        .order_by(MediaItem.added_at.desc())
        .limit(10)
    )
    recently_added = [format_item(m) for m in recently_added_result.scalars().all()]
    
    # === LIBRARY OVERVIEW ===
    # Movie libraries
    from ...models import Library as LibraryModel
    
    movie_libs_result = await db.execute(
        select(
            LibraryModel.id,
            LibraryModel.name,
            func.count(MediaItem.id).label('item_count')
        )
        .outerjoin(MediaItem, and_(
            MediaItem.library_id == LibraryModel.id,
            MediaItem.media_type == MediaType.MOVIE
        ))
        .where(LibraryModel.media_type == MediaType.MOVIE)
        .group_by(LibraryModel.id, LibraryModel.name)
        .order_by(func.count(MediaItem.id).desc())
    )
    movie_libraries = [
        {"id": row.id, "name": row.name, "count": row.item_count, "type": "movie"}
        for row in movie_libs_result.all()
    ]
    
    # TV libraries with series/season/episode counts
    tv_libs_result = await db.execute(
        select(LibraryModel)
        .where(LibraryModel.media_type.in_([MediaType.SERIES, MediaType.EPISODE]))
    )
    tv_libraries_raw = tv_libs_result.scalars().all()
    
    tv_libraries = []
    for lib in tv_libraries_raw:
        # Count series
        series_count = await db.execute(
            select(func.count(MediaItem.id))
            .where(and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.SERIES))
        )
        # Count seasons
        season_count = await db.execute(
            select(func.count(MediaItem.id))
            .where(and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.SEASON))
        )
        # Count episodes
        episode_count = await db.execute(
            select(func.count(MediaItem.id))
            .where(and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.EPISODE))
        )
        
        tv_libraries.append({
            "id": lib.id,
            "name": lib.name,
            "series": series_count.scalar() or 0,
            "seasons": season_count.scalar() or 0,
            "episodes": episode_count.scalar() or 0,
            "type": "tv"
        })
    
    # === GLOBAL STATS ===
    # Total movies
    total_movies = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.MOVIE)
    )
    
    # Total series
    total_series = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.SERIES)
    )
    
    # Total episodes
    total_episodes = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.media_type == MediaType.EPISODE)
    )
    
    # Total plays
    total_plays = await db.execute(select(func.sum(MediaItem.watch_count)))
    
    # Total watched items
    total_watched = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.is_watched == True)
    )
    
    # Total favorited
    total_favorited = await db.execute(
        select(func.count(MediaItem.id)).where(MediaItem.is_favorited == True)
    )
    
    # Movie plays
    movie_plays = await db.execute(
        select(func.sum(MediaItem.watch_count)).where(MediaItem.media_type == MediaType.MOVIE)
    )
    
    # Episode plays
    episode_plays = await db.execute(
        select(func.sum(MediaItem.watch_count)).where(MediaItem.media_type == MediaType.EPISODE)
    )
    
    # === MOST POPULAR MOVIES (by unique users) ===
    popular_movies_result = await db.execute(
        select(
            MediaItem.id,
            MediaItem.title,
            MediaItem.year,
            MediaItem.is_favorited,
            MediaItem.rating,
            func.count(func.distinct(UserWatchHistory.user_id)).label('user_count')
        )
        .join(UserWatchHistory, UserWatchHistory.media_item_id == MediaItem.id)
        .where(
            and_(
                MediaItem.media_type == MediaType.MOVIE,
                UserWatchHistory.is_played == True
            )
        )
        .group_by(MediaItem.id, MediaItem.title, MediaItem.year, MediaItem.is_favorited, MediaItem.rating)
        .order_by(func.count(func.distinct(UserWatchHistory.user_id)).desc())
        .limit(limit)
    )
    most_popular_movies = [
        {
            "id": row.id,
            "title": row.title,
            "year": row.year,
            "is_favorited": row.is_favorited,
            "rating": row.rating,
            "user_count": row.user_count,
            "media_type": "movie"
        }
        for row in popular_movies_result.all()
    ]
    
    # === MOST POPULAR SERIES (by unique users) ===
    # Get series where users have watched episodes
    popular_series_result = await db.execute(
        select(
            MediaItem.series_id,
            func.count(func.distinct(UserWatchHistory.user_id)).label('user_count')
        )
        .join(UserWatchHistory, UserWatchHistory.media_item_id == MediaItem.id)
        .where(
            and_(
                MediaItem.media_type == MediaType.EPISODE,
                MediaItem.series_id.isnot(None),
                UserWatchHistory.is_played == True
            )
        )
        .group_by(MediaItem.series_id)
        .order_by(func.count(func.distinct(UserWatchHistory.user_id)).desc())
        .limit(limit)
    )
    popular_series_raw = popular_series_result.all()
    
    most_popular_series = []
    for row in popular_series_raw:
        if row.series_id:
            # Find the series by series_id (external_id)
            series_result = await db.execute(
                select(MediaItem)
                .where(
                    and_(
                        MediaItem.external_id == row.series_id,
                        MediaItem.media_type == MediaType.SERIES
                    )
                )
            )
            series = series_result.scalar_one_or_none()
            if series:
                most_popular_series.append({
                    "id": series.id,
                    "title": series.title,
                    "year": series.year,
                    "is_favorited": series.is_favorited,
                    "rating": series.rating,
                    "user_count": row.user_count,
                    "media_type": "series"
                })
    
    # === MOST ACTIVE USERS ===
    active_users_result = await db.execute(
        select(
            MediaServerUser.id,
            MediaServerUser.name,
            MediaServerUser.total_plays,
            MediaServerUser.last_activity_at,
            MediaServerUser.is_admin
        )
        .where(MediaServerUser.is_hidden == False)
        .order_by(MediaServerUser.total_plays.desc())
        .limit(limit)
    )
    most_active_users = [
        {
            "id": row.id,
            "name": row.name,
            "total_plays": row.total_plays or 0,
            "last_activity_at": row.last_activity_at.isoformat() if row.last_activity_at else None,
            "is_admin": row.is_admin
        }
        for row in active_users_result.all()
    ]
    
    # Total users count
    total_users = await db.execute(
        select(func.count(MediaServerUser.id)).where(MediaServerUser.is_hidden == False)
    )
    
    return {
        "period_days": days,
        "global_stats": {
            "total_movies": total_movies.scalar() or 0,
            "total_series": total_series.scalar() or 0,
            "total_episodes": total_episodes.scalar() or 0,
            "total_plays": int(total_plays.scalar() or 0),
            "total_watched": total_watched.scalar() or 0,
            "total_favorited": total_favorited.scalar() or 0,
            "movie_plays": int(movie_plays.scalar() or 0),
            "episode_plays": int(episode_plays.scalar() or 0),
            "total_users": total_users.scalar() or 0
        },
        "most_viewed_movies": most_viewed_movies,
        "most_viewed_series": most_viewed_series,
        "most_popular_movies": most_popular_movies,
        "most_popular_series": most_popular_series,
        "most_active_users": most_active_users,
        "recently_added": recently_added,
        "library_overview": {
            "movie_libraries": movie_libraries,
            "tv_libraries": tv_libraries
        }
    }


@router.get("/audit-log", response_model=Dict[str, Any])
@limiter.limit(RateLimits.API_READ)
async def get_audit_log(
    request: Request,
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


@router.get("/content-reach")
@limiter.limit(RateLimits.API_READ)
async def get_content_reach(
    request: Request,
    library_id: Optional[int] = None,
    media_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Shared vs. Solo vs. Unwatched content analysis.

    - Shared: watched by 2+ unique users
    - Solo: watched by exactly 1 user
    - Unwatched: not watched by anyone
    """
    # Build base media query (movies and series only, not episodes/seasons)
    media_query = select(MediaItem.id, MediaItem.title, MediaItem.media_type, MediaItem.size_bytes)
    filters = [MediaItem.media_type.in_(["movie", "series"])]
    if library_id is not None:
        filters.append(MediaItem.library_id == library_id)
    if media_type:
        filters.append(MediaItem.media_type == media_type)
    media_query = media_query.where(and_(*filters))

    media_result = await db.execute(media_query)
    media_items = media_result.all()

    if not media_items:
        return {
            "total_items": 0,
            "shared": {"count": 0, "pct": 0, "size_bytes": 0},
            "solo": {"count": 0, "pct": 0, "size_bytes": 0},
            "unwatched": {"count": 0, "pct": 0, "size_bytes": 0},
            "top_shared": [],
            "top_solo_large": [],
        }

    media_ids = [m.id for m in media_items]
    media_map = {m.id: m for m in media_items}

    # Count unique viewers per media item
    viewer_query = (
        select(
            UserWatchHistory.media_item_id,
            func.count(func.distinct(UserWatchHistory.user_id)).label("viewer_count"),
        )
        .where(and_(
            UserWatchHistory.media_item_id.in_(media_ids),
            UserWatchHistory.is_played == True,
        ))
        .group_by(UserWatchHistory.media_item_id)
    )
    viewer_result = await db.execute(viewer_query)
    viewer_counts = {row.media_item_id: row.viewer_count for row in viewer_result.all()}

    shared_items = []
    solo_items = []
    unwatched_items = []

    for m in media_items:
        vc = viewer_counts.get(m.id, 0)
        mt = str(m.media_type)
        if "." in mt:
            mt = mt.split(".")[-1]
        info = {"media_id": m.id, "title": m.title, "media_type": mt, "size_bytes": m.size_bytes or 0, "viewer_count": vc}
        if vc >= 2:
            shared_items.append(info)
        elif vc == 1:
            solo_items.append(info)
        else:
            unwatched_items.append(info)

    total = len(media_items)
    shared_size = sum(i["size_bytes"] for i in shared_items)
    solo_size = sum(i["size_bytes"] for i in solo_items)
    unwatched_size = sum(i["size_bytes"] for i in unwatched_items)

    # Top shared (most viewers)
    top_shared = sorted(shared_items, key=lambda x: x["viewer_count"], reverse=True)[:10]

    # Top solo items by size (cleanup candidates)
    top_solo_large = sorted(solo_items, key=lambda x: x["size_bytes"], reverse=True)[:10]

    return {
        "total_items": total,
        "shared": {
            "count": len(shared_items),
            "pct": round(len(shared_items) / total * 100, 1),
            "size_bytes": shared_size,
        },
        "solo": {
            "count": len(solo_items),
            "pct": round(len(solo_items) / total * 100, 1),
            "size_bytes": solo_size,
        },
        "unwatched": {
            "count": len(unwatched_items),
            "pct": round(len(unwatched_items) / total * 100, 1),
            "size_bytes": unwatched_size,
        },
        "top_shared": top_shared,
        "top_solo_large": top_solo_large,
    }


@router.get("/cleanup-suggestions")
@limiter.limit(RateLimits.API_READ)
async def get_cleanup_suggestions(
    request: Request,
    days: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get analytics-based cleanup suggestions.
    
    Analyzes watch patterns and content usage to suggest items for cleanup:
    - Unwatched content older than X days
    - Abandoned content (started but never finished by anyone)
    - Low-engagement content (watched by very few users)
    - Completed and stale content (fully watched, not rewatched)
    - Large files with low watch counts (storage hogs)
    """
    from ...models import PlaybackActivity
    
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    
    # Get all media items with sizes
    items_result = await db.execute(
        select(MediaItem).where(
            and_(
                MediaItem.media_type.in_([MediaType.MOVIE, MediaType.SERIES]),
                MediaItem.size_bytes > 0
            )
        )
    )
    all_items = items_result.scalars().all()
    
    if not all_items:
        return {"suggestions": [], "summary": {}}
    
    # Pre-fetch per-user data for all items
    # Get unique viewer counts per item
    viewer_counts_result = await db.execute(
        select(
            UserWatchHistory.media_item_id,
            func.count(func.distinct(UserWatchHistory.user_id)).label("viewers"),
            func.max(UserWatchHistory.last_played_at).label("last_played"),
            func.avg(UserWatchHistory.played_percentage).label("avg_progress")
        ).where(UserWatchHistory.is_played == True)
        .group_by(UserWatchHistory.media_item_id)
    )
    viewer_data = {
        row.media_item_id: {
            "viewers": row.viewers,
            "last_played": row.last_played,
            "avg_progress": float(row.avg_progress) if row.avg_progress else 0
        }
        for row in viewer_counts_result.all()
    }
    
    # Get abandoned items (started but avg progress < 25%)
    abandoned_result = await db.execute(
        select(
            UserWatchHistory.media_item_id,
            func.count(func.distinct(UserWatchHistory.user_id)).label("starters"),
            func.avg(UserWatchHistory.played_percentage).label("avg_pct")
        ).group_by(UserWatchHistory.media_item_id)
        .having(func.avg(UserWatchHistory.played_percentage) < 25)
    )
    abandoned_ids = {row.media_item_id for row in abandoned_result.all()}
    
    # Get active sessions (items currently being watched)
    active_result = await db.execute(
        select(PlaybackActivity.media_item_id).where(PlaybackActivity.is_active == True).distinct()
    )
    active_ids = {row[0] for row in active_result.all()}
    
    suggestions = []
    
    # Get total user count (for low-engagement calculation)
    total_users_result = await db.execute(select(func.count()).select_from(MediaServerUser))
    total_users = total_users_result.scalar() or 1
    
    for item in all_items:
        # Skip items currently being watched
        if item.id in active_ids:
            continue
        # Skip staged items
        if getattr(item, 'is_staged', False):
            continue
        # Skip already flagged items
        if getattr(item, 'flagged_for_cleanup', False):
            continue
        
        vdata = viewer_data.get(item.id)
        unique_viewers = vdata["viewers"] if vdata else 0
        last_played = vdata["last_played"] if vdata else None
        avg_progress = vdata["avg_progress"] if vdata else 0
        
        suggestion_reasons = []
        score = 0  # Higher score = stronger suggestion
        
        # Category 1: Unwatched content
        if not item.is_watched and not vdata:
            age_days = (now - item.added_at).days if item.added_at else 0
            if age_days > days:
                suggestion_reasons.append(f"Never watched, added {age_days} days ago")
                score += 30 + min(age_days // 30, 20)  # Up to +50
        
        # Category 2: Abandoned content
        if item.id in abandoned_ids and vdata:
            suggestion_reasons.append(f"Abandoned by viewers (avg progress: {avg_progress:.0f}%)")
            score += 25
        
        # Category 3: Low engagement (only 1 viewer on shared server)
        if total_users > 1 and unique_viewers <= 1 and item.added_at and (now - item.added_at).days > days:
            suggestion_reasons.append(f"Low engagement: only {unique_viewers} viewer(s) out of {total_users} users")
            score += 15
        
        # Category 4: Completed & stale (watched but not rewatched in X days)
        if vdata and avg_progress > 90 and last_played and last_played < cutoff:
            days_since = (now - last_played).days
            suggestion_reasons.append(f"Fully watched, not revisited in {days_since} days")
            score += 20 + min(days_since // 30, 10)
        
        # Category 5: Storage hogs (large files with low watch count)
        size_gb = (item.size_bytes or 0) / (1024**3)
        if size_gb > 5 and (item.watch_count or 0) <= 1:
            suggestion_reasons.append(f"Large file ({size_gb:.1f} GB) with only {item.watch_count or 0} total plays")
            score += 15 + int(size_gb)
        
        if suggestion_reasons:
            suggestions.append({
                "item_id": item.id,
                "title": item.title,
                "media_type": item.media_type.value if hasattr(item.media_type, 'value') else str(item.media_type),
                "size_bytes": item.size_bytes or 0,
                "added_at": item.added_at.isoformat() if item.added_at else None,
                "last_watched_at": last_played.isoformat() if last_played else None,
                "watch_count": item.watch_count or 0,
                "unique_viewers": unique_viewers,
                "avg_progress": round(avg_progress, 1),
                "score": score,
                "reasons": suggestion_reasons,
            })
    
    # Sort by score descending
    suggestions.sort(key=lambda x: x["score"], reverse=True)
    
    # Limit to top 50
    suggestions = suggestions[:50]
    
    # Build categories for summary
    cat_counts = {"unwatched": 0, "abandoned": 0, "low_engagement": 0, "stale": 0, "storage_hog": 0}
    total_reclaimable = 0
    for s in suggestions:
        total_reclaimable += s["size_bytes"]
        for reason in s["reasons"]:
            if "Never watched" in reason:
                cat_counts["unwatched"] += 1
            if "Abandoned" in reason:
                cat_counts["abandoned"] += 1
            if "Low engagement" in reason:
                cat_counts["low_engagement"] += 1
            if "not revisited" in reason:
                cat_counts["stale"] += 1
            if "Large file" in reason:
                cat_counts["storage_hog"] += 1
    
    return {
        "suggestions": suggestions,
        "summary": {
            "total_suggestions": len(suggestions),
            "total_reclaimable_bytes": total_reclaimable,
            "days_analyzed": days,
            "categories": cat_counts,
        }
    }


# Simple in-memory image cache (max 200 items, TTL 1 hour)
_image_cache: Dict[int, tuple[bytes, str, datetime]] = {}
_IMAGE_CACHE_MAX = 200
_IMAGE_CACHE_TTL = timedelta(hours=1)


@router.get("/{media_id}/image")
@limiter.limit(RateLimits.API_READ)
async def get_media_image(
    request: Request,
    media_id: int,
    max_height: int = Query(300, ge=50, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Proxy media poster image from the media server (Emby/Jellyfin).

    Fetches the Primary image for the given media item, caches it in memory,
    and streams it back to the client. This avoids exposing the media server
    API key to the frontend.
    """
    # Check cache
    now = datetime.now(timezone.utc)
    if media_id in _image_cache:
        img_bytes, content_type, cached_at = _image_cache[media_id]
        if now - cached_at < _IMAGE_CACHE_TTL:
            return Response(
                content=img_bytes,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=3600"}
            )
        else:
            del _image_cache[media_id]

    # Get media item with its service connection
    result = await db.execute(
        select(MediaItem)
        .options(joinedload(MediaItem.service_connection))
        .where(MediaItem.id == media_id)
    )
    media_item = result.scalar_one_or_none()

    if not media_item:
        raise HTTPException(status_code=404, detail="Media item not found")

    if not media_item.service_connection:
        raise HTTPException(status_code=404, detail="No service connection for this media item")

    sc = media_item.service_connection
    base_url = sc.url.rstrip("/")
    external_id = media_item.external_id

    # For series items, try parent (series) image if episode/season
    image_item_id = external_id
    if media_item.media_type in ("episode", "season") and media_item.series_id:
        # Get the series' external_id for a better poster
        series_result = await db.execute(
            select(MediaItem.external_id).where(MediaItem.id == media_item.series_id)
        )
        series_ext_id = series_result.scalar_one_or_none()
        if series_ext_id:
            image_item_id = series_ext_id

    # Construct image URL based on service type
    image_url = f"{base_url}/Items/{image_item_id}/Images/Primary"
    params = {"maxHeight": str(max_height)}

    # Set up headers for the media server
    if sc.service_type in (ServiceType.EMBY, ServiceType.JELLYFIN):
        headers = {"X-Emby-Token": sc.api_key}
    else:
        headers = {"X-Api-Key": sc.api_key}

    try:
        async with httpx.AsyncClient(verify=sc.verify_ssl, timeout=15) as client:
            resp = await client.get(image_url, params=params, headers=headers)
            if resp.status_code == 200:
                img_bytes = resp.content
                content_type = resp.headers.get("content-type", "image/jpeg")

                # Cache (evict oldest if full)
                if len(_image_cache) >= _IMAGE_CACHE_MAX:
                    oldest_key = min(_image_cache, key=lambda k: _image_cache[k][2])
                    del _image_cache[oldest_key]
                _image_cache[media_id] = (img_bytes, content_type, now)

                return Response(
                    content=img_bytes,
                    media_type=content_type,
                    headers={"Cache-Control": "public, max-age=3600"}
                )
            else:
                raise HTTPException(status_code=404, detail="Image not found on media server")
    except httpx.RequestError as e:
        logger.warning(f"Failed to fetch image for media {media_id}: {e}")
        raise HTTPException(status_code=502, detail="Could not reach media server")

