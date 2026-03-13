"""
Activity API routes - Global activity log and playback history.
"""
from collections import defaultdict
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
    User, PlaybackActivity, MediaServerUser, MediaItem, Library,
    UserWatchHistory
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


@router.get("/genre-stats")
@limiter.limit(RateLimits.API_READ)
async def get_genre_stats(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    library_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get genre distribution based on playback activity.

    Returns genre stats aggregated by play count and total watch duration.
    Optionally filtered by library and/or user.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Query playback activities with their media items to get genres
    query = (
        select(
            PlaybackActivity.duration_seconds,
            MediaItem.genres
        )
        .join(MediaItem, PlaybackActivity.media_item_id == MediaItem.id)
        .where(
            and_(
                PlaybackActivity.started_at >= since,
                MediaItem.genres.isnot(None)
            )
        )
    )

    if library_id is not None:
        query = query.where(PlaybackActivity.library_id == library_id)
    if user_id is not None:
        query = query.where(PlaybackActivity.user_id == user_id)

    result = await db.execute(query)
    rows = result.all()

    # Aggregate per genre
    genre_plays: dict[str, int] = defaultdict(int)
    genre_duration: dict[str, int] = defaultdict(int)

    for row in rows:
        genres = row.genres if isinstance(row.genres, list) else []
        duration = row.duration_seconds or 0
        for genre in genres:
            if isinstance(genre, str) and genre.strip():
                g = genre.strip()
                genre_plays[g] += 1
                genre_duration[g] += duration

    # Build sorted results (by play count descending)
    genres_by_plays = sorted(
        [{"genre": g, "plays": c, "duration_seconds": genre_duration[g]}
         for g, c in genre_plays.items()],
        key=lambda x: x["plays"],
        reverse=True
    )

    return {
        "period_days": days,
        "library_id": library_id,
        "user_id": user_id,
        "total_genres": len(genres_by_plays),
        "genres": genres_by_plays
    }


@router.get("/watch-heatmap")
@limiter.limit(RateLimits.API_READ)
async def get_watch_heatmap(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a 7×24 watch heatmap (day-of-week × hour-of-day).

    Returns a grid of play counts for each (day, hour) combination,
    useful for visualising peak viewing times.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            func.extract('dow', PlaybackActivity.started_at).label('dow'),
            func.extract('hour', PlaybackActivity.started_at).label('hour'),
            func.count(PlaybackActivity.id).label('plays')
        )
        .where(PlaybackActivity.started_at >= since)
        .group_by(
            func.extract('dow', PlaybackActivity.started_at),
            func.extract('hour', PlaybackActivity.started_at)
        )
    )
    rows = result.all()

    # Build 7×24 grid (initialise all cells to 0)
    heatmap: list[dict] = []
    grid: dict[tuple[int, int], int] = {}
    for row in rows:
        grid[(int(row.dow), int(row.hour))] = row.plays

    for dow in range(7):
        for hour in range(24):
            heatmap.append({
                "day_of_week": dow,
                "hour": hour,
                "plays": grid.get((dow, hour), 0)
            })

    return {
        "period_days": days,
        "heatmap": heatmap
    }


@router.get("/concurrent-streams")
@limiter.limit(RateLimits.API_READ)
async def get_concurrent_streams(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Analyse historical concurrent stream peaks.

    Returns daily peak concurrent streams and an overall peak,
    plus hourly average concurrency for capacity planning.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Fetch all sessions in the period with start and end times
    result = await db.execute(
        select(
            PlaybackActivity.started_at,
            PlaybackActivity.ended_at,
            PlaybackActivity.duration_seconds,
        )
        .where(and_(
            PlaybackActivity.started_at >= since,
            PlaybackActivity.started_at.isnot(None),
        ))
        .order_by(PlaybackActivity.started_at)
    )
    sessions = result.all()

    if not sessions:
        return {
            "period_days": days,
            "overall_peak": 0,
            "overall_peak_time": None,
            "daily_peaks": [],
            "hourly_avg_concurrent": [{"hour": h, "avg_concurrent": 0.0} for h in range(24)],
        }

    # Build events list: +1 at start, -1 at end
    events: list[tuple[datetime, int]] = []
    for s in sessions:
        start = s.started_at
        end = s.ended_at or (start + timedelta(seconds=s.duration_seconds or 0))
        events.append((start, 1))
        events.append((end, -1))

    events.sort(key=lambda e: (e[0], e[1]))  # process starts before ends at same time

    # Sweep to find peaks
    current = 0
    overall_peak = 0
    overall_peak_time = None
    daily_peaks: dict[str, tuple[int, datetime]] = {}  # date_str -> (peak, time)
    hourly_totals: dict[int, list[int]] = {h: [] for h in range(24)}

    for ts, delta in events:
        current += delta
        day_str = ts.strftime("%Y-%m-%d")
        hour = ts.hour

        if current > overall_peak:
            overall_peak = current
            overall_peak_time = ts

        if day_str not in daily_peaks or current > daily_peaks[day_str][0]:
            daily_peaks[day_str] = (current, ts)

    # Hourly average: sample at each event
    # Simpler approach: count overlapping sessions per hour bucket
    for s in sessions:
        start = s.started_at
        end = s.ended_at or (start + timedelta(seconds=s.duration_seconds or 0))
        # Each hour this session spans gets +1
        t = start.replace(minute=0, second=0, microsecond=0)
        while t < end:
            hourly_totals[t.hour].append(1)
            t += timedelta(hours=1)

    # Average across days observed
    total_days = max(1, (datetime.now(timezone.utc) - since).days)
    hourly_avg = [
        {
            "hour": h,
            "avg_concurrent": round(len(hourly_totals[h]) / total_days, 2)
        }
        for h in range(24)
    ]

    daily_list = sorted(
        [
            {"date": d, "peak_concurrent": v[0], "peak_time": v[1].isoformat()}
            for d, v in daily_peaks.items()
        ],
        key=lambda x: x["date"],
        reverse=True,
    )[:30]  # last 30 days only

    return {
        "period_days": days,
        "overall_peak": overall_peak,
        "overall_peak_time": overall_peak_time.isoformat() if overall_peak_time else None,
        "daily_peaks": daily_list,
        "hourly_avg_concurrent": hourly_avg,
    }


@router.get("/duration-stats")
@limiter.limit(RateLimits.API_READ)
async def get_duration_stats(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    library_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Watch duration statistics: average session length, distribution,
    movies vs series comparison.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(
            PlaybackActivity.duration_seconds,
            PlaybackActivity.played_percentage,
            MediaItem.media_type,
        )
        .join(MediaItem, PlaybackActivity.media_item_id == MediaItem.id, isouter=True)
        .where(and_(
            PlaybackActivity.started_at >= since,
            PlaybackActivity.duration_seconds > 0,
        ))
    )
    if library_id is not None:
        query = query.where(PlaybackActivity.library_id == library_id)

    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return {
            "period_days": days,
            "total_sessions": 0,
            "avg_duration_seconds": 0,
            "median_duration_seconds": 0,
            "total_watch_time_seconds": 0,
            "by_type": {},
            "distribution": [],
        }

    durations = [r.duration_seconds for r in rows]
    durations.sort()

    # Group by media type
    type_stats: dict[str, dict] = {}
    for row in rows:
        mt = str(row.media_type) if row.media_type else "unknown"
        # Strip enum prefix if present (e.g. "MediaType.movie" -> "movie")
        if "." in mt:
            mt = mt.split(".")[-1]
        if mt not in type_stats:
            type_stats[mt] = {"count": 0, "total_seconds": 0, "durations": []}
        type_stats[mt]["count"] += 1
        type_stats[mt]["total_seconds"] += row.duration_seconds
        type_stats[mt]["durations"].append(row.duration_seconds)

    by_type = {}
    for mt, stats in type_stats.items():
        d = sorted(stats["durations"])
        by_type[mt] = {
            "count": stats["count"],
            "avg_duration_seconds": round(stats["total_seconds"] / stats["count"]),
            "median_duration_seconds": d[len(d) // 2],
            "total_watch_time_seconds": stats["total_seconds"],
        }

    # Duration distribution buckets (in minutes)
    buckets = [
        (0, 5, "< 5 min"),
        (5, 15, "5-15 min"),
        (15, 30, "15-30 min"),
        (30, 60, "30-60 min"),
        (60, 90, "1-1.5 hrs"),
        (90, 120, "1.5-2 hrs"),
        (120, 180, "2-3 hrs"),
        (180, 999999, "3+ hrs"),
    ]
    distribution = []
    for low, high, label in buckets:
        count = sum(1 for d in durations if low * 60 <= d < high * 60)
        distribution.append({"label": label, "count": count})

    return {
        "period_days": days,
        "total_sessions": len(durations),
        "avg_duration_seconds": round(sum(durations) / len(durations)),
        "median_duration_seconds": durations[len(durations) // 2],
        "total_watch_time_seconds": sum(durations),
        "by_type": by_type,
        "distribution": distribution,
    }


@router.get("/completion-rates")
@limiter.limit(RateLimits.API_READ)
async def get_completion_rates(
    request: Request,
    days: int = Query(90, ge=1, le=365),
    library_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Content completion rate analytics.

    Shows what percentage of content is watched to completion (>90%),
    partially watched, or abandoned early.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(
            PlaybackActivity.played_percentage,
            PlaybackActivity.duration_seconds,
            MediaItem.media_type,
            MediaItem.title,
            MediaItem.id.label("media_id"),
        )
        .join(MediaItem, PlaybackActivity.media_item_id == MediaItem.id)
        .where(and_(
            PlaybackActivity.started_at >= since,
            PlaybackActivity.duration_seconds > 60,  # skip very short sessions
        ))
    )
    if library_id is not None:
        query = query.where(PlaybackActivity.library_id == library_id)

    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return {
            "period_days": days,
            "total_plays": 0,
            "overall": {"completed": 0, "partial": 0, "abandoned": 0},
            "by_type": {},
            "most_abandoned": [],
        }

    # Categorize
    completed = 0  # >90%
    partial = 0    # 25-90%
    abandoned = 0  # <25%

    type_completion: dict[str, dict[str, int]] = {}
    abandon_count: dict[int, dict] = {}  # media_id -> {title, type, abandoned, total}

    for row in rows:
        pct = row.played_percentage or 0
        mt = str(row.media_type) if row.media_type else "unknown"
        if "." in mt:
            mt = mt.split(".")[-1]

        if mt not in type_completion:
            type_completion[mt] = {"completed": 0, "partial": 0, "abandoned": 0, "total": 0}
        type_completion[mt]["total"] += 1

        if pct >= 90:
            completed += 1
            type_completion[mt]["completed"] += 1
        elif pct >= 25:
            partial += 1
            type_completion[mt]["partial"] += 1
        else:
            abandoned += 1
            type_completion[mt]["abandoned"] += 1

        # Track abandoned content
        if pct < 25 and row.media_id:
            if row.media_id not in abandon_count:
                abandon_count[row.media_id] = {
                    "media_id": row.media_id,
                    "title": row.title,
                    "media_type": mt,
                    "abandoned_count": 0,
                    "total_plays": 0,
                }
            abandon_count[row.media_id]["abandoned_count"] += 1
            abandon_count[row.media_id]["total_plays"] += 1

    total = len(rows)
    overall = {
        "completed": completed,
        "completed_pct": round(completed / total * 100, 1),
        "partial": partial,
        "partial_pct": round(partial / total * 100, 1),
        "abandoned": abandoned,
        "abandoned_pct": round(abandoned / total * 100, 1),
    }

    by_type = {}
    for mt, stats in type_completion.items():
        t = stats["total"]
        by_type[mt] = {
            "total": t,
            "completed": stats["completed"],
            "completed_pct": round(stats["completed"] / t * 100, 1) if t > 0 else 0,
            "partial": stats["partial"],
            "partial_pct": round(stats["partial"] / t * 100, 1) if t > 0 else 0,
            "abandoned": stats["abandoned"],
            "abandoned_pct": round(stats["abandoned"] / t * 100, 1) if t > 0 else 0,
        }

    # Top 10 most abandoned
    most_abandoned = sorted(
        abandon_count.values(),
        key=lambda x: x["abandoned_count"],
        reverse=True,
    )[:10]

    return {
        "period_days": days,
        "total_plays": total,
        "overall": overall,
        "by_type": by_type,
        "most_abandoned": most_abandoned,
    }


@router.get("/binge-stats")
@limiter.limit(RateLimits.API_READ)
async def get_binge_stats(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    min_episodes: int = Query(3, ge=2, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Binge-watch detection: find sessions where users watched 3+ episodes
    of the same series consecutively.

    Returns binge sessions, top binged series, and per-user binge stats.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Get episode watches grouped by user, ordered by time
    result = await db.execute(
        select(
            PlaybackActivity.user_id,
            PlaybackActivity.started_at,
            PlaybackActivity.ended_at,
            PlaybackActivity.duration_seconds,
            PlaybackActivity.media_title,
            MediaItem.title.label("item_title"),
            MediaItem.media_type,
            MediaItem.parent_id,
            MediaItem.series_id,
            MediaServerUser.name.label("user_name"),
        )
        .join(MediaItem, PlaybackActivity.media_item_id == MediaItem.id)
        .join(MediaServerUser, PlaybackActivity.user_id == MediaServerUser.id)
        .where(and_(
            PlaybackActivity.started_at >= since,
            MediaItem.media_type == "episode",
        ))
        .order_by(PlaybackActivity.user_id, PlaybackActivity.started_at)
    )
    rows = result.all()

    SESSION_GAP = timedelta(hours=4)  # max gap between episodes in a binge

    # Group by user and detect binge sessions
    binge_sessions: list[dict] = []
    series_binge_count: dict[str, int] = defaultdict(int)
    user_binge_count: dict[str, dict] = {}  # user_name -> {binges, episodes}

    current_user_id = None
    current_series = None
    streak: list = []

    def flush_streak():
        nonlocal streak
        if len(streak) >= min_episodes:
            series_name = streak[0].series_id or streak[0].media_title.split(" - ")[0] if streak[0].media_title else "Unknown"
            user_name = streak[0].user_name
            binge_sessions.append({
                "user_name": user_name,
                "series": series_name,
                "episode_count": len(streak),
                "started_at": streak[0].started_at.isoformat() if streak[0].started_at else None,
                "ended_at": (streak[-1].ended_at or streak[-1].started_at).isoformat() if streak[-1].started_at else None,
                "total_duration_seconds": sum(s.duration_seconds or 0 for s in streak),
            })
            series_binge_count[series_name] += 1
            if user_name not in user_binge_count:
                user_binge_count[user_name] = {"binges": 0, "total_episodes": 0}
            user_binge_count[user_name]["binges"] += 1
            user_binge_count[user_name]["total_episodes"] += len(streak)
        streak = []

    for row in rows:
        series_key = row.series_id or row.parent_id

        if row.user_id != current_user_id or series_key != current_series:
            flush_streak()
            current_user_id = row.user_id
            current_series = series_key
            streak = [row]
        else:
            # Check gap from last episode
            last_end = streak[-1].ended_at or (
                streak[-1].started_at + timedelta(seconds=streak[-1].duration_seconds or 0)
            ) if streak[-1].started_at else None

            if last_end and row.started_at and (row.started_at - last_end) <= SESSION_GAP:
                streak.append(row)
            else:
                flush_streak()
                streak = [row]

    flush_streak()  # Don't forget last streak

    # Sort binge sessions by episode count (most impressive first)
    binge_sessions.sort(key=lambda x: x["episode_count"], reverse=True)

    # Top binged series
    top_series = sorted(
        [{"series": s, "binge_count": c} for s, c in series_binge_count.items()],
        key=lambda x: x["binge_count"],
        reverse=True,
    )[:10]

    # Top bingers (users)
    top_users = sorted(
        [{"user_name": u, **stats} for u, stats in user_binge_count.items()],
        key=lambda x: x["binges"],
        reverse=True,
    )[:10]

    return {
        "period_days": days,
        "min_episodes": min_episodes,
        "total_binge_sessions": len(binge_sessions),
        "recent_binges": binge_sessions[:20],
        "top_binged_series": top_series,
        "top_bingers": top_users,
    }
