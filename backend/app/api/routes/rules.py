"""
Cleanup rules API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel

from ...core.database import get_db
from ...models import CleanupRule, SeriesEvaluationMode, SeriesDeleteTarget
from ...schemas import CleanupRuleCreate, CleanupRuleUpdate, CleanupRuleResponse
from ..deps import get_current_user

router = APIRouter(prefix="/rules", tags=["Cleanup Rules"])


class SeriesOptionsResponse(BaseModel):
    """Available options for series cleanup rules."""
    evaluation_modes: List[dict]
    delete_targets: List[dict]


@router.get("/series-options", response_model=SeriesOptionsResponse)
async def get_series_options(current_user = Depends(get_current_user)):
    """Get available series evaluation and delete options."""
    return SeriesOptionsResponse(
        evaluation_modes=[
            {
                "value": SeriesEvaluationMode.WHOLE_SERIES,
                "label": "Whole Series",
                "description": "Evaluate the entire series as one unit"
            },
            {
                "value": SeriesEvaluationMode.SEASON,
                "label": "Season",
                "description": "Evaluate each season independently"
            },
            {
                "value": SeriesEvaluationMode.EPISODE,
                "label": "Episode",
                "description": "Evaluate each episode independently"
            }
        ],
        delete_targets=[
            {
                "value": SeriesDeleteTarget.WHOLE_SERIES,
                "label": "Whole Series",
                "description": "Delete entire series"
            },
            {
                "value": SeriesDeleteTarget.MATCHED_SEASON,
                "label": "Matched Season Only",
                "description": "Delete only the season that matched the rule"
            },
            {
                "value": SeriesDeleteTarget.MATCHED_EPISODE,
                "label": "Matched Episode Only",
                "description": "Delete only the episode that matched"
            },
            {
                "value": SeriesDeleteTarget.PREVIOUS_SEASONS,
                "label": "Previous Seasons",
                "description": "Delete all seasons before the currently watched one (keep current and future)"
            },
            {
                "value": SeriesDeleteTarget.FOLLOWING_SEASONS,
                "label": "Following Seasons",
                "description": "Delete all seasons after the currently watched one (keep current and previous)"
            },
            {
                "value": SeriesDeleteTarget.PREVIOUS_EPISODES,
                "label": "Previous Episodes in Season",
                "description": "Delete all episodes before current in the same season"
            },
            {
                "value": SeriesDeleteTarget.FOLLOWING_EPISODES,
                "label": "Following Episodes in Season",
                "description": "Delete all episodes after current in the same season"
            },
            {
                "value": SeriesDeleteTarget.UNWATCHED_EPISODES_IN_SEASON,
                "label": "Unwatched Episodes in Season",
                "description": "Delete all unwatched episodes in the matched season"
            },
            {
                "value": SeriesDeleteTarget.UNWATCHED_SEASONS,
                "label": "All Unwatched Seasons",
                "description": "Delete all seasons that are completely unwatched"
            }
        ]
    )


@router.get("/", response_model=List[CleanupRuleResponse])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all cleanup rules."""
    result = await db.execute(
        select(CleanupRule).order_by(CleanupRule.priority.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=CleanupRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    rule_data: CleanupRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Create a new cleanup rule."""
    rule = CleanupRule(
        name=rule_data.name,
        description=rule_data.description,
        is_enabled=rule_data.is_enabled,
        priority=rule_data.priority,
        media_types=rule_data.media_types,  # Now a list
        library_id=rule_data.library_id,
        conditions=rule_data.conditions.model_dump(),
        action=rule_data.action,
        grace_period_days=rule_data.grace_period_days
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/{rule_id}", response_model=CleanupRuleResponse)
async def get_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a specific cleanup rule."""
    result = await db.execute(
        select(CleanupRule).where(CleanupRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )
    return rule


@router.put("/{rule_id}", response_model=CleanupRuleResponse)
async def update_rule(
    rule_id: int,
    rule_data: CleanupRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update a cleanup rule."""
    result = await db.execute(
        select(CleanupRule).where(CleanupRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )
    
    update_data = rule_data.model_dump(exclude_unset=True)
    
    # Handle conditions specially
    if "conditions" in update_data and update_data["conditions"]:
        update_data["conditions"] = update_data["conditions"].model_dump() if hasattr(update_data["conditions"], 'model_dump') else update_data["conditions"]
    
    for key, value in update_data.items():
        setattr(rule, key, value)
    
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Delete a cleanup rule."""
    result = await db.execute(
        select(CleanupRule).where(CleanupRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )
    
    await db.delete(rule)
    await db.commit()
    return {"message": "Rule deleted"}


@router.post("/{rule_id}/toggle")
async def toggle_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Toggle a rule's enabled status."""
    result = await db.execute(
        select(CleanupRule).where(CleanupRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )
    
    rule.is_enabled = not rule.is_enabled
    await db.commit()
    
    return {"is_enabled": rule.is_enabled}


@router.get("/templates/default")
async def get_rule_templates(
    current_user = Depends(get_current_user)
):
    """Get predefined rule templates."""
    return [
        {
            "name": "Delete Unwatched Movies (180 days)",
            "description": "Delete movies not watched in 180 days when disk is 90% full",
            "media_types": ["movie"],
            "conditions": {
                "disk_space_threshold_percent": 90,
                "not_watched_days": 180,
                "min_age_days": 30,
                "exclude_favorited": True,
                "exclude_watched_within_days": 30
            },
            "action": "delete",
            "grace_period_days": 7
        },
        {
            "name": "Delete Unwatched Episodes (90 days)",
            "description": "Delete episodes not watched in 90 days",
            "media_types": ["episode"],
            "conditions": {
                "disk_space_threshold_percent": 85,
                "not_watched_days": 90,
                "min_age_days": 14,
                "exclude_favorited": True,
                "exclude_watched_within_days": 14,
                "series_delete_mode": "episode"
            },
            "action": "delete",
            "grace_period_days": 3
        },
        {
            "name": "Unmonitor Low-Rated Movies",
            "description": "Unmonitor movies with rating below 5.0",
            "media_types": ["movie"],
            "conditions": {
                "rating_below": 5.0,
                "min_age_days": 60,
                "exclude_favorited": True
            },
            "action": "unmonitor",
            "grace_period_days": 0
        },
        {
            "name": "Notify Only - Old Content",
            "description": "Notify about content not watched in 365 days (no auto-delete)",
            "media_types": ["movie"],
            "conditions": {
                "not_watched_days": 365,
                "exclude_favorited": True
            },
            "action": "notify_only",
            "grace_period_days": 0
        },
        {
            "name": "Universal Cleanup (All Media Types)",
            "description": "Delete all unwatched content (movies, series, episodes) after 180 days",
            "media_types": ["movie", "series", "episode"],
            "conditions": {
                "disk_space_threshold_percent": 90,
                "not_watched_days": 180,
                "min_age_days": 30,
                "exclude_favorited": True,
                "exclude_watched_within_days": 30,
                "series_delete_mode": "season"
            },
            "action": "delete",
            "grace_period_days": 7
        }
    ]
