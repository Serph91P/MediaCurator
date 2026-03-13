"""
Scheduled jobs API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from ...core.database import get_db
from ...core.rate_limit import limiter, RateLimits
from ...models import JobExecutionLog, SystemSettings, ServiceConnection
from ...scheduler import scheduler, reschedule_job, run_service_sync_job
from ..deps import get_current_user, get_current_active_admin

router = APIRouter(prefix="/jobs", tags=["Jobs"])


class JobIntervalUpdate(BaseModel):
    interval_minutes: Optional[int] = None
    interval_hours: Optional[int] = None


@router.get("/")
@limiter.limit(RateLimits.API_READ)
async def list_jobs(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get list of scheduled jobs with their status."""
    jobs = []
    
    # Get running jobs from database
    result = await db.execute(
        select(JobExecutionLog)
        .where(JobExecutionLog.status == "running")
        .order_by(desc(JobExecutionLog.started_at))
    )
    running_logs = result.scalars().all()
    running_job_ids = {log.job_id for log in running_logs}
    
    # Get all services for potential sync jobs
    services_result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.is_enabled == True)
    )
    services = services_result.scalars().all()
    service_map = {s.id: s for s in services}
    
    for job in scheduler.get_jobs():
        # Extract interval from trigger
        interval_str = str(job.trigger)
        interval_minutes = None
        interval_hours = None
        
        # Parse interval from trigger string like "interval[0:06:00]"
        if "interval" in interval_str:
            import re
            match = re.search(r'\[(\d+):(\d+):(\d+)\]', interval_str)
            if match:
                hours, minutes, seconds = int(match.group(1)), int(match.group(2)), int(match.group(3))
                total_minutes = hours * 60 + minutes + seconds // 60
                if total_minutes >= 60:
                    interval_hours = total_minutes // 60
                else:
                    interval_minutes = total_minutes
        
        # Check if this job is currently running
        is_running = job.id in running_job_ids
        running_since = None
        if is_running:
            running_log = next((l for l in running_logs if l.job_id == job.id), None)
            if running_log:
                running_since = running_log.started_at.isoformat() if running_log.started_at else None
        
        # Determine service info for service sync jobs
        service_id = None
        service_type = None
        if job.id.startswith("sync_service_"):
            try:
                service_id = int(job.id.replace("sync_service_", ""))
                if service_id in service_map:
                    service = service_map[service_id]
                    service_type = service.service_type.value if hasattr(service.service_type, 'value') else str(service.service_type)
            except (ValueError, KeyError):
                pass
        
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger": str(job.trigger),
            "interval_minutes": interval_minutes,
            "interval_hours": interval_hours,
            "is_running": is_running,
            "running_since": running_since,
            "service_id": service_id,
            "service_type": service_type,
        })
    
    # Also check for running service syncs that may not have scheduler jobs yet
    for log in running_logs:
        if log.job_id.startswith("sync_service_") and not any(j["id"] == log.job_id for j in jobs):
            try:
                service_id = int(log.job_id.replace("sync_service_", ""))
                if service_id in service_map:
                    service = service_map[service_id]
                    jobs.append({
                        "id": log.job_id,
                        "name": log.job_name,
                        "next_run_time": None,
                        "trigger": "manual",
                        "interval_minutes": None,
                        "interval_hours": None,
                        "is_running": True,
                        "running_since": log.started_at.isoformat() if log.started_at else None,
                        "service_id": service_id,
                        "service_type": service.service_type.value if hasattr(service.service_type, 'value') else str(service.service_type),
                    })
            except (ValueError, KeyError):
                pass
    
    return {
        "running": scheduler.running,
        "jobs": jobs
    }


@router.get("/{job_id}/history")
@limiter.limit(RateLimits.API_READ)
async def get_job_history(
    request: Request,
    job_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get execution history for a specific job."""
    result = await db.execute(
        select(JobExecutionLog)
        .where(JobExecutionLog.job_id == job_id)
        .order_by(desc(JobExecutionLog.started_at))
        .limit(limit)
    )
    executions = result.scalars().all()
    
    return [{
        "id": log.id,
        "job_id": log.job_id,
        "job_name": log.job_name,
        "status": log.status,
        "started_at": log.started_at.isoformat() if log.started_at else None,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "duration_seconds": log.duration_seconds,
        "error_message": log.error_message,
        "details": log.details
    } for log in executions]


@router.post("/sync/service/{service_id}")
@limiter.limit(RateLimits.CLEANUP_OPERATION)
async def trigger_service_sync(
    request: Request,
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_admin)
):
    """Manually trigger a sync for a specific service (admin only)."""
    import asyncio
    
    # Check if service exists and is enabled
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == service_id)
    )
    service = result.scalar_one_or_none()
    
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id {service_id} not found"
        )
    
    if not service.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service '{service.name}' is disabled"
        )
    
    # Check if already running
    job_id = f"sync_service_{service_id}"
    running_result = await db.execute(
        select(JobExecutionLog)
        .where(JobExecutionLog.job_id == job_id)
        .where(JobExecutionLog.status == "running")
    )
    if running_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Sync for service '{service.name}' is already running"
        )
    
    # Start the sync in background
    asyncio.create_task(run_service_sync_job(service_id))
    
    return {
        "message": f"Sync triggered for service '{service.name}'",
        "service_id": service_id,
        "service_name": service.name
    }


@router.get("/history/recent")
@limiter.limit(RateLimits.API_READ)
async def get_recent_executions(
    request: Request,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get recent job executions across all jobs."""
    result = await db.execute(
        select(JobExecutionLog)
        .order_by(desc(JobExecutionLog.started_at))
        .limit(limit)
    )
    executions = result.scalars().all()
    
    return [{
        "id": log.id,
        "job_id": log.job_id,
        "job_name": log.job_name,
        "status": log.status,
        "started_at": log.started_at.isoformat() if log.started_at else None,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "duration_seconds": log.duration_seconds,
        "error_message": log.error_message,
        "details": log.details
    } for log in executions]


@router.post("/{job_id}/trigger")
@limiter.limit(RateLimits.CLEANUP_OPERATION)
async def trigger_job(
    request: Request,
    job_id: str,
    current_user = Depends(get_current_active_admin)
):
    """Manually trigger a job execution (admin only)."""
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found"
        )
    
    # Trigger the job
    job.modify(next_run_time=datetime.now())
    
    return {
        "message": f"Job '{job_id}' triggered successfully",
        "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None
    }


@router.put("/{job_id}/interval")
@limiter.limit(RateLimits.API_WRITE)
async def update_job_interval(
    request: Request,
    job_id: str,
    update: JobIntervalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_admin)
):
    """Update the interval for a job (admin only)."""
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found"
        )
    
    # Calculate new interval
    if update.interval_hours is not None:
        interval_minutes = update.interval_hours * 60
    elif update.interval_minutes is not None:
        interval_minutes = update.interval_minutes
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must specify either interval_minutes or interval_hours"
        )
    
    if interval_minutes < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interval must be at least 1 minute"
        )
    
    # Save to system settings for persistence (key-value based)
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "job_intervals")
    )
    settings_row = result.scalar_one_or_none()
    
    if settings_row:
        job_intervals = settings_row.value or {}
        job_intervals[job_id] = interval_minutes
        settings_row.value = job_intervals
    else:
        settings_row = SystemSettings(
            key="job_intervals",
            value={job_id: interval_minutes},
            description="Custom job intervals in minutes"
        )
        db.add(settings_row)
    await db.commit()
    
    # Reschedule the job with the new interval
    reschedule_job(job_id, interval_minutes)
    
    return {
        "message": f"Job '{job_id}' interval updated to {interval_minutes} minutes",
        "interval_minutes": interval_minutes
    }
