"""
Audit log API routes.
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

from ...core.database import get_db
from ...core.rate_limit import limiter, RateLimits
from ...models import User, AuditActionType
from ...services.audit import AuditService
from ..deps import get_current_active_admin

router = APIRouter(prefix="/audit", tags=["Audit Logs"])


class AuditLogResponse(BaseModel):
    """Response model for audit log entries."""
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None
    resource_name: Optional[str] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated list of audit logs."""
    logs: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AuditActionTypesResponse(BaseModel):
    """Available audit action types."""
    actions: List[dict]


@router.get("/logs", response_model=AuditLogListResponse)
@limiter.limit(RateLimits.API_READ)
async def get_audit_logs(
    request: Request,
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    start_date: Optional[datetime] = Query(None, description="Filter from date"),
    end_date: Optional[datetime] = Query(None, description="Filter to date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get paginated audit logs with optional filters.
    
    Admin only endpoint.
    """
    offset = (page - 1) * page_size
    
    logs, total = await AuditService.get_logs(
        db=db,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        start_date=start_date,
        end_date=end_date,
        limit=page_size,
        offset=offset,
    )
    
    total_pages = (total + page_size - 1) // page_size
    
    return AuditLogListResponse(
        logs=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/recent", response_model=List[AuditLogResponse])
@limiter.limit(RateLimits.API_READ)
async def get_recent_activity(
    request: Request,
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    limit: int = Query(50, ge=1, le=100, description="Maximum entries"),
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get recent audit activity.
    
    Admin only endpoint.
    """
    logs = await AuditService.get_recent_activity(
        db=db,
        hours=hours,
        limit=limit,
    )
    
    return [AuditLogResponse.model_validate(log) for log in logs]


@router.get("/user/{user_id}", response_model=List[AuditLogResponse])
@limiter.limit(RateLimits.API_READ)
async def get_user_activity(
    request: Request,
    user_id: int,
    limit: int = Query(50, ge=1, le=100, description="Maximum entries"),
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get audit activity for a specific user.
    
    Admin only endpoint.
    """
    logs = await AuditService.get_user_activity(
        db=db,
        user_id=user_id,
        limit=limit,
    )
    
    return [AuditLogResponse.model_validate(log) for log in logs]


@router.get("/actions", response_model=AuditActionTypesResponse)
@limiter.limit(RateLimits.API_READ)
async def get_action_types(
    request: Request,
    current_user: User = Depends(get_current_active_admin),
):
    """
    Get available audit action types.
    
    Useful for building filter dropdowns in the UI.
    """
    actions = []
    for action in AuditActionType:
        # Create human-readable label
        label = action.value.replace("_", " ").title()
        actions.append({
            "value": action.value,
            "label": label,
        })
    
    return AuditActionTypesResponse(actions=actions)


@router.delete("/cleanup")
@limiter.limit(RateLimits.API_WRITE)
async def cleanup_old_logs(
    request: Request,
    days: int = Query(90, ge=7, le=365, description="Delete logs older than X days"),
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete old audit logs.
    
    Admin only endpoint.
    """
    from ...services.audit import audit_log, AuditService
    
    deleted = await AuditService.cleanup_old_logs(db=db, days=days)
    
    # Log this action too
    await audit_log(
        db=db,
        action=AuditActionType.SETTINGS_UPDATED,
        request=request,
        user=current_user,
        resource_type="audit_logs",
        details={"action": "cleanup", "days": days, "deleted_count": deleted}
    )
    
    return {"message": f"Deleted {deleted} audit log entries older than {days} days"}
