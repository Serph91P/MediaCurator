"""
Users API routes - Media server users and their statistics.
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload
from typing import Optional
from datetime import datetime, timedelta, timezone

from ...core.database import get_db, escape_like
from ...core.rate_limit import limiter, RateLimits
from ...api.deps import get_current_user
from ...models import (
    User, MediaServerUser, UserWatchHistory, PlaybackActivity, MediaItem
)

router = APIRouter()


@router.get("/")
@limiter.limit(RateLimits.API_READ)
async def get_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    include_hidden: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get paginated list of media server users with statistics."""
    
    # Base query
    query = select(MediaServerUser).order_by(desc(MediaServerUser.last_activity_at))
    
    # Apply filters
    conditions = []
    
    if not include_hidden:
        conditions.append(MediaServerUser.is_hidden == False)
    
    if search:
        conditions.append(MediaServerUser.name.ilike(f"%{escape_like(search)}%"))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    # Get last watched for each user from UserWatchHistory (since PlaybackActivity may be empty)
    user_data = []
    for u in users:
        # Try to get last activity from PlaybackActivity first
        last_activity_result = await db.execute(
            select(PlaybackActivity)
            .where(PlaybackActivity.user_id == u.id)
            .order_by(desc(PlaybackActivity.started_at))
            .limit(1)
        )
        last_activity = last_activity_result.scalar_one_or_none()
        
        # If no PlaybackActivity, try UserWatchHistory
        last_watched_info = None
        last_client = None
        
        if last_activity:
            last_watched_info = {
                "title": last_activity.media_title,
                "client": last_activity.client_name,
                "device": last_activity.device_name
            }
            last_client = last_activity.client_name or last_activity.device_name
        else:
            # Fallback to UserWatchHistory
            last_history_result = await db.execute(
                select(UserWatchHistory)
                .options(joinedload(UserWatchHistory.media_item))
                .where(
                    and_(
                        UserWatchHistory.user_id == u.id,
                        UserWatchHistory.is_played == True
                    )
                )
                .order_by(desc(func.coalesce(UserWatchHistory.last_played_at, datetime.min)), desc(UserWatchHistory.play_count))
                .limit(1)
            )
            last_history = last_history_result.scalar_one_or_none()
            
            if last_history and last_history.media_item:
                last_watched_info = {
                    "title": last_history.media_item.title,
                    "client": None,
                    "device": None
                }
        
        user_data.append({
            "id": u.id,
            "external_id": u.external_id,
            "name": u.name,
            "is_admin": u.is_admin,
            "is_hidden": u.is_hidden,
            "total_plays": u.total_plays,
            "total_watch_time_seconds": u.total_watch_time_seconds,
            "last_activity_at": u.last_activity_at.isoformat() if u.last_activity_at else None,
            "last_watched": last_watched_info,
            "last_client": last_client
        })
    
    return {
        "items": user_data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/{user_id}")
@limiter.limit(RateLimits.API_READ)
async def get_user_detail(
    request: Request,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed information about a specific user."""
    
    result = await db.execute(
        select(MediaServerUser)
        .options(selectinload(MediaServerUser.service_connection))
        .where(MediaServerUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get time-based stats from PlaybackActivity
    now = datetime.now(timezone.utc)
    periods = {
        "last_24h": now - timedelta(hours=24),
        "last_7d": now - timedelta(days=7),
        "last_30d": now - timedelta(days=30)
    }
    
    stats = {}
    for period_name, since in periods.items():
        plays_result = await db.execute(
            select(
                func.count(PlaybackActivity.id),
                func.coalesce(func.sum(PlaybackActivity.duration_seconds), 0)
            )
            .where(
                and_(
                    PlaybackActivity.user_id == user_id,
                    PlaybackActivity.started_at >= since
                )
            )
        )
        row = plays_result.one()
        stats[period_name] = {
            "plays": row[0] or 0,
            "watch_seconds": int(row[1] or 0)
        }
    
    # Get recently watched from PlaybackActivity first
    recent_result = await db.execute(
        select(PlaybackActivity)
        .where(PlaybackActivity.user_id == user_id)
        .order_by(desc(PlaybackActivity.started_at))
        .limit(10)
    )
    recent_activities = recent_result.scalars().all()
    
    # If no PlaybackActivity, fallback to UserWatchHistory
    recently_watched = []
    if recent_activities:
        recently_watched = [
            {
                "id": a.id,
                "media_title": a.media_title,
                "client_name": a.client_name,
                "device_name": a.device_name,
                "started_at": a.started_at.isoformat() if a.started_at else None,
                "duration_seconds": a.duration_seconds,
                "played_percentage": a.played_percentage
            }
            for a in recent_activities
        ]
    else:
        # Fallback to UserWatchHistory
        history_result = await db.execute(
            select(UserWatchHistory)
            .options(joinedload(UserWatchHistory.media_item))
            .where(
                and_(
                    UserWatchHistory.user_id == user_id,
                    UserWatchHistory.last_played_at.isnot(None)
                )
            )
            .order_by(desc(UserWatchHistory.last_played_at))
            .limit(10)
        )
        history_items = history_result.scalars().all()
        recently_watched = [
            {
                "id": h.id,
                "media_title": h.media_item.title if h.media_item else "Unknown",
                "client_name": None,
                "device_name": None,
                "started_at": h.last_played_at.isoformat() if h.last_played_at else None,
                "duration_seconds": 0,
                "played_percentage": h.played_percentage or 0
            }
            for h in history_items
        ]
    
    return {
        "id": user.id,
        "external_id": user.external_id,
        "name": user.name,
        "is_admin": user.is_admin,
        "is_hidden": user.is_hidden,
        "service": user.service_connection.name if user.service_connection else None,
        "total_plays": user.total_plays,
        "total_watch_time_seconds": user.total_watch_time_seconds,
        "last_activity_at": user.last_activity_at.isoformat() if user.last_activity_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "stats": stats,
        "recently_watched": recently_watched
    }


@router.get("/{user_id}/activity")
async def get_user_activity(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    library_id: Optional[int] = None,
    media_type: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get paginated activity history for a specific user."""
    
    # Verify user exists
    user_result = await db.execute(
        select(MediaServerUser).where(MediaServerUser.id == user_id)
    )
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")
    
    # Base query
    query = (
        select(PlaybackActivity)
        .options(
            selectinload(PlaybackActivity.media_item),
            selectinload(PlaybackActivity.library)
        )
        .where(PlaybackActivity.user_id == user_id)
        .order_by(desc(PlaybackActivity.started_at))
    )
    
    # Apply filters
    conditions = [PlaybackActivity.user_id == user_id]
    
    if library_id:
        conditions.append(PlaybackActivity.library_id == library_id)
    
    if media_type:
        query = query.join(MediaItem, MediaItem.id == PlaybackActivity.media_item_id, isouter=True)
        conditions.append(MediaItem.media_type == media_type)
    
    if search:
        conditions.append(PlaybackActivity.media_title.ilike(f"%{search}%"))
    
    query = query.where(and_(*conditions))
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
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
                "played_percentage": a.played_percentage
            }
            for a in activities
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.patch("/{user_id}")
async def update_user(
    user_id: int,
    is_hidden: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user settings (e.g., hide from statistics)."""
    
    result = await db.execute(
        select(MediaServerUser).where(MediaServerUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if is_hidden is not None:
        user.is_hidden = is_hidden
    
    await db.commit()
    await db.refresh(user)
    
    return {
        "id": user.id,
        "name": user.name,
        "is_hidden": user.is_hidden,
        "message": "User updated successfully"
    }
