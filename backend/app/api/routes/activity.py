"""
Activity API routes - Global activity log and playback history.
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy import select, func, desc, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, timedelta, timezone

from ...core.database import get_db, escape_like
from ...core.rate_limit import limiter, RateLimits
from ...api.deps import get_current_user
from ...models import (
    User, PlaybackActivity, MediaServerUser, MediaItem, Library
)

router = APIRouter()


@router.get("/")
@limiter.limit(RateLimits.API_READ)
async def get_activities(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    library_id: Optional[int] = None,
    user_id: Optional[int] = None,
    media_type: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get paginated activity log with filtering options."""
    
    # Base query
    query = (
        select(PlaybackActivity)
        .options(
            selectinload(PlaybackActivity.user),
            selectinload(PlaybackActivity.media_item),
            selectinload(PlaybackActivity.library)
        )
        .order_by(desc(PlaybackActivity.started_at))
    )
    
    # Apply filters
    conditions = []
    
    if library_id:
        conditions.append(PlaybackActivity.library_id == library_id)
    
    if user_id:
        conditions.append(PlaybackActivity.user_id == user_id)
    
    if media_type:
        # Join with media_item to filter by type
        query = query.join(MediaItem, MediaItem.id == PlaybackActivity.media_item_id, isouter=True)
        conditions.append(MediaItem.media_type == media_type)
    
    if search:
        escaped = escape_like(search)
        conditions.append(
            or_(
                PlaybackActivity.media_title.ilike(f"%{escaped}%"),
                PlaybackActivity.client_name.ilike(f"%{escaped}%"),
                PlaybackActivity.device_name.ilike(f"%{escaped}%")
            )
        )
    
    if start_date:
        conditions.append(PlaybackActivity.started_at >= start_date)
    
    if end_date:
        conditions.append(PlaybackActivity.started_at <= end_date)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Count total
    count_query = select(func.count()).select_from(
        query.subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    activities = result.scalars().all()
    
    return {
        "items": [
            {
                "id": a.id,
                "user": {
                    "id": a.user.id,
                    "name": a.user.name,
                    "is_admin": a.user.is_admin
                } if a.user else None,
                "media_title": a.media_title,
                "media_item_id": a.media_item_id,
                "media_type": a.media_item.media_type if a.media_item else None,
                "library": {
                    "id": a.library.id,
                    "name": a.library.name
                } if a.library else None,
                "client_name": a.client_name,
                "device_name": a.device_name,
                "ip_address": a.ip_address,
                "play_method": a.play_method,
                "is_transcoding": a.is_transcoding,
                "transcode_video": a.transcode_video,
                "transcode_audio": a.transcode_audio,
                "started_at": a.started_at.isoformat() if a.started_at else None,
                "ended_at": a.ended_at.isoformat() if a.ended_at else None,
                "duration_seconds": a.duration_seconds,
                "played_percentage": a.played_percentage,
                "is_active": a.is_active
            }
            for a in activities
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/stats")
@limiter.limit(RateLimits.API_READ)
async def get_activity_stats(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get activity statistics for the specified time period."""
    
    since = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Total plays
    total_plays_result = await db.execute(
        select(func.count(PlaybackActivity.id))
        .where(PlaybackActivity.started_at >= since)
    )
    total_plays = total_plays_result.scalar() or 0
    
    # Total watch time
    total_time_result = await db.execute(
        select(func.sum(PlaybackActivity.duration_seconds))
        .where(PlaybackActivity.started_at >= since)
    )
    total_watch_seconds = total_time_result.scalar() or 0
    
    # Unique users
    unique_users_result = await db.execute(
        select(func.count(func.distinct(PlaybackActivity.user_id)))
        .where(PlaybackActivity.started_at >= since)
    )
    unique_users = unique_users_result.scalar() or 0
    
    # Active sessions (currently playing)
    active_sessions_result = await db.execute(
        select(func.count(PlaybackActivity.id))
        .where(PlaybackActivity.is_active == True)
    )
    active_sessions = active_sessions_result.scalar() or 0
    
    # Plays by day (for chart)
    plays_by_day_result = await db.execute(
        select(
            func.date(PlaybackActivity.started_at).label('date'),
            func.count(PlaybackActivity.id).label('plays'),
            func.sum(PlaybackActivity.duration_seconds).label('duration')
        )
        .where(PlaybackActivity.started_at >= since)
        .group_by(func.date(PlaybackActivity.started_at))
        .order_by(func.date(PlaybackActivity.started_at))
    )
    plays_by_day = [
        {
            "date": str(row.date),
            "plays": row.plays,
            "duration_seconds": row.duration or 0
        }
        for row in plays_by_day_result
    ]
    
    # Plays by hour (for chart)
    plays_by_hour_result = await db.execute(
        select(
            func.extract('hour', PlaybackActivity.started_at).label('hour'),
            func.count(PlaybackActivity.id).label('plays')
        )
        .where(PlaybackActivity.started_at >= since)
        .group_by(func.extract('hour', PlaybackActivity.started_at))
        .order_by(func.extract('hour', PlaybackActivity.started_at))
    )
    plays_by_hour = [
        {"hour": int(row.hour), "plays": row.plays}
        for row in plays_by_hour_result
    ]
    
    # Plays by day of week
    plays_by_dow_result = await db.execute(
        select(
            func.extract('dow', PlaybackActivity.started_at).label('dow'),
            func.count(PlaybackActivity.id).label('plays')
        )
        .where(PlaybackActivity.started_at >= since)
        .group_by(func.extract('dow', PlaybackActivity.started_at))
        .order_by(func.extract('dow', PlaybackActivity.started_at))
    )
    plays_by_dow = [
        {"day_of_week": int(row.dow), "plays": row.plays}
        for row in plays_by_dow_result
    ]
    
    return {
        "period_days": days,
        "total_plays": total_plays,
        "total_watch_seconds": total_watch_seconds,
        "unique_users": unique_users,
        "active_sessions": active_sessions,
        "plays_by_day": plays_by_day,
        "plays_by_hour": plays_by_hour,
        "plays_by_day_of_week": plays_by_dow
    }


@router.get("/active")
@limiter.limit(RateLimits.API_READ)
async def get_active_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get currently active playback sessions."""
    
    result = await db.execute(
        select(PlaybackActivity)
        .options(
            selectinload(PlaybackActivity.user),
            selectinload(PlaybackActivity.media_item),
            selectinload(PlaybackActivity.library)
        )
        .where(PlaybackActivity.is_active == True)
        .order_by(desc(PlaybackActivity.started_at))
    )
    sessions = result.scalars().all()
    
    return [
        {
            "id": s.id,
            "user": {
                "id": s.user.id,
                "name": s.user.name
            } if s.user else None,
            "media_title": s.media_title,
            "media_type": s.media_item.media_type if s.media_item else None,
            "library": s.library.name if s.library else None,
            "client_name": s.client_name,
            "device_name": s.device_name,
            "play_method": s.play_method,
            "is_transcoding": s.is_transcoding,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "played_percentage": s.played_percentage
        }
        for s in sessions
    ]
