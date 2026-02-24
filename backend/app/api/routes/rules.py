"""
Cleanup rules API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel
import json

from ...core.database import get_db
from ...core.rate_limit import limiter, RateLimits
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
@limiter.limit(RateLimits.API_READ)
async def list_rules(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all cleanup rules."""
    result = await db.execute(
        select(CleanupRule).order_by(CleanupRule.priority.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=CleanupRuleResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(RateLimits.API_WRITE)
async def create_rule(
    request: Request,
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
@limiter.limit(RateLimits.API_READ)
async def get_rule(
    request: Request,
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
@limiter.limit(RateLimits.API_WRITE)
async def update_rule(
    request: Request,
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
@limiter.limit(RateLimits.API_WRITE)
async def delete_rule(
    request: Request,
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
@limiter.limit(RateLimits.API_WRITE)
async def toggle_rule(
    request: Request,
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


class BulkActionRequest(BaseModel):
    """Request for bulk operations on rules."""
    rule_ids: List[int]
    action: str  # "enable", "disable", "delete"


class BulkActionResult(BaseModel):
    """Result of bulk operation."""
    success_count: int
    failed_count: int
    failed_ids: List[int]


@router.post("/bulk-action", response_model=BulkActionResult)
@limiter.limit(RateLimits.BULK_OPERATION)
async def bulk_action(
    request_obj: Request,
    request: BulkActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Perform bulk operations on multiple rules."""
    if request.action not in ["enable", "disable", "delete"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action: {request.action}. Must be one of: enable, disable, delete"
        )
    
    success_count = 0
    failed_ids = []
    
    for rule_id in request.rule_ids:
        result = await db.execute(
            select(CleanupRule).where(CleanupRule.id == rule_id)
        )
        rule = result.scalar_one_or_none()
        
        if not rule:
            failed_ids.append(rule_id)
            continue
        
        try:
            if request.action == "enable":
                rule.is_enabled = True
            elif request.action == "disable":
                rule.is_enabled = False
            elif request.action == "delete":
                await db.delete(rule)
            success_count += 1
        except Exception:
            failed_ids.append(rule_id)
    
    await db.commit()
    
    return BulkActionResult(
        success_count=success_count,
        failed_count=len(failed_ids),
        failed_ids=failed_ids
    )


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


@router.get("/export/all")
@limiter.limit(RateLimits.API_READ)
async def export_rules(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Export all cleanup rules as JSON for backup or sharing."""
    result = await db.execute(
        select(CleanupRule).order_by(CleanupRule.priority.desc())
    )
    rules = result.scalars().all()
    
    export_data = {
        "version": "1.0",
        "rules": [
            {
                "name": rule.name,
                "description": rule.description,
                "is_enabled": rule.is_enabled,
                "priority": rule.priority,
                "media_types": rule.media_types,
                "library_id": rule.library_id,
                "conditions": rule.conditions,
                "action": rule.action,
                "grace_period_days": rule.grace_period_days
            }
            for rule in rules
        ]
    }
    
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": "attachment; filename=mediacurator-rules.json"
        }
    )


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[str]


@router.post("/import", response_model=ImportResult)
@limiter.limit(RateLimits.BULK_OPERATION)
async def import_rules(
    request: Request,
    file: UploadFile = File(...),
    replace_existing: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Import cleanup rules from JSON file."""
    if not file.filename.endswith('.json'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JSON files are supported"
        )
    
    # Enforce 1 MB file size limit
    MAX_IMPORT_SIZE = 1 * 1024 * 1024  # 1 MB
    content = await file.read()
    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum import size is {MAX_IMPORT_SIZE // 1024} KB."
        )

    try:
        data = json.loads(content.decode('utf-8'))
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON: {str(e)}"
        )
    
    if "rules" not in data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid format: 'rules' key not found"
        )
    
    imported = 0
    skipped = 0
    errors = []
    
    for idx, rule_data in enumerate(data["rules"]):
        try:
            # Check if rule with same name exists
            result = await db.execute(
                select(CleanupRule).where(CleanupRule.name == rule_data.get("name"))
            )
            existing = result.scalar_one_or_none()
            
            if existing and not replace_existing:
                skipped += 1
                continue
            
            if existing and replace_existing:
                # Update existing rule
                existing.description = rule_data.get("description")
                existing.is_enabled = rule_data.get("is_enabled", True)
                existing.priority = rule_data.get("priority", 0)
                existing.media_types = rule_data.get("media_types", ["movie"])
                existing.library_id = rule_data.get("library_id")
                existing.conditions = rule_data.get("conditions", {})
                existing.action = rule_data.get("action", "delete")
                existing.grace_period_days = rule_data.get("grace_period_days", 0)
            else:
                # Create new rule
                rule = CleanupRule(
                    name=rule_data.get("name", f"Imported Rule {idx + 1}"),
                    description=rule_data.get("description"),
                    is_enabled=rule_data.get("is_enabled", True),
                    priority=rule_data.get("priority", 0),
                    media_types=rule_data.get("media_types", ["movie"]),
                    library_id=rule_data.get("library_id"),
                    conditions=rule_data.get("conditions", {}),
                    action=rule_data.get("action", "delete"),
                    grace_period_days=rule_data.get("grace_period_days", 0)
                )
                db.add(rule)
            
            imported += 1
        except Exception as e:
            errors.append(f"Rule {idx + 1}: {str(e)}")
    
    await db.commit()
    
    return ImportResult(imported=imported, skipped=skipped, errors=errors)
