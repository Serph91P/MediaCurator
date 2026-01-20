"""
Scheduled jobs API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
from datetime import datetime

from ...core.database import get_db
from ...models import JobExecutionLog
from ...scheduler import scheduler
from ..deps import get_current_user

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("/")
async def list_jobs(
    current_user = Depends(get_current_user)
):
    """Get list of scheduled jobs with their status."""
    jobs = []
    
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger": str(job.trigger),
        })
    
    return {
        "running": scheduler.running,
        "jobs": jobs
    }


@router.get("/{job_id}/history")
async def get_job_history(
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


@router.get("/history/recent")
async def get_recent_executions(
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
async def trigger_job(
    job_id: str,
    current_user = Depends(get_current_user)
):
    """Manually trigger a job execution."""
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
