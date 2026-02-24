"""
Scheduler for periodic tasks (cleanup, sync).
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlalchemy import select
from typing import Optional, Dict, Any

from .core.config import get_settings
from .core.database import async_session_maker
from .core.websocket import ws_manager
from .models import ServiceConnection, CleanupRule, SystemSettings, JobExecutionLog
from .services.cleanup_engine import CleanupEngine
from .services.sync import sync_service_media
from datetime import datetime, timezone
from functools import partial

settings = get_settings()
scheduler = AsyncIOScheduler()


def _make_progress_callback(job_id: str, job_name: str):
    """Create a progress callback that broadcasts via WebSocket."""
    async def callback(
        step: str,
        progress_pct: Optional[float] = None,
        current: Optional[int] = None,
        total: Optional[int] = None,
        details: Optional[Dict] = None
    ):
        await ws_manager.send_job_progress(
            job_id=job_id,
            job_name=job_name,
            step=step,
            progress_percent=progress_pct,
            current=current,
            total=total,
            details=details
        )
    return callback


async def run_service_sync_job(service_id: int):
    """Sync media from a specific service."""
    start_time = datetime.now(timezone.utc)
    execution_log = None
    
    async with async_session_maker() as db:
        try:
            # Get the service
            result = await db.execute(
                select(ServiceConnection).where(ServiceConnection.id == service_id)
            )
            service = result.scalar_one_or_none()
            
            if not service:
                logger.warning(f"Service {service_id} not found for sync")
                return
            
            if not service.is_enabled:
                logger.info(f"Skipping sync for disabled service: {service.name}")
                return
            
            job_id = f"sync_service_{service_id}"
            job_name = f"Sync: {service.name}"
            
            logger.info(f"Running sync job for {service.name}")
            
            # Create execution log
            execution_log = JobExecutionLog(
                job_id=job_id,
                job_name=job_name,
                status="running",
                started_at=start_time
            )
            db.add(execution_log)
            await db.commit()
            
            try:
                # Create progress callback for WebSocket
                progress_cb = _make_progress_callback(job_id, job_name)
                
                # Notify WebSocket clients that job started
                await ws_manager.send_job_started(job_id, job_name)
                
                sync_result = await sync_service_media(db, service, progress_callback=progress_cb)
                
                # Update execution log
                end_time = datetime.now(timezone.utc)
                execution_log.status = "success"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.details = {
                    "service_name": service.name,
                    "service_type": service.service_type.value if hasattr(service.service_type, 'value') else str(service.service_type),
                    "synced_items": sync_result.get('synced', 0),
                    "libraries": sync_result.get('libraries', 0),
                    "result": sync_result
                }
                await db.commit()
                logger.info(f"Sync completed for {service.name}: {sync_result}")
                
                # Notify WebSocket clients that job completed
                await ws_manager.send_job_completed(
                    job_id, job_name, "success",
                    duration=execution_log.duration_seconds,
                    details=sync_result
                )
                
            except Exception as e:
                error_msg = f"Sync failed for {service.name}: {e}"
                logger.error(error_msg)
                
                end_time = datetime.now(timezone.utc)
                execution_log.status = "error"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.error_message = str(e)
                await db.commit()
                
                # Notify WebSocket clients that job failed
                await ws_manager.send_job_completed(
                    job_id, job_name, "error",
                    duration=execution_log.duration_seconds,
                    error=str(e)
                )
                    
        except Exception as e:
            error_msg = f"Sync job failed for service {service_id}: {e}"
            logger.error(error_msg)
            
            if execution_log:
                end_time = datetime.now(timezone.utc)
                execution_log.status = "error"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.error_message = str(e)
                await db.commit()


async def run_sync_job():
    """Sync media from all enabled services."""
    logger.info("Running scheduled sync job")
    
    start_time = datetime.now(timezone.utc)
    execution_log = None
    
    async with async_session_maker() as db:
        try:
            # Create execution log
            execution_log = JobExecutionLog(
                job_id="sync_job",
                job_name="Media Sync",
                status="running",
                started_at=start_time
            )
            db.add(execution_log)
            await db.commit()
            
            result = await db.execute(
                select(ServiceConnection).where(ServiceConnection.is_enabled == True)
            )
            services = result.scalars().all()
            
            synced_count = 0
            errors = []
            
            # Notify WebSocket clients that job started
            await ws_manager.send_job_started("sync_job", "Media Sync")
            
            for svc_idx, service in enumerate(services):
                try:
                    svc_job_id = f"sync_job_sub_{service.id}"
                    svc_job_name = f"Media Sync: {service.name}"
                    progress_cb = _make_progress_callback(svc_job_id, svc_job_name)
                    
                    await ws_manager.send_job_progress(
                        "sync_job", "Media Sync",
                        step=f"Syncing service {svc_idx+1}/{len(services)}: {service.name}",
                        progress_percent=(svc_idx / max(len(services), 1)) * 100,
                        current=svc_idx,
                        total=len(services)
                    )
                    
                    sync_result = await sync_service_media(db, service, progress_callback=progress_cb)
                    synced_count += sync_result.get('synced', 0)
                    logger.info(f"Sync completed for {service.name}: {sync_result}")
                except Exception as e:
                    error_msg = f"Sync failed for {service.name}: {e}"
                    logger.error(error_msg)
                    errors.append(error_msg)
            
            # Update execution log
            end_time = datetime.now(timezone.utc)
            execution_log.status = "success" if not errors else "error"
            execution_log.completed_at = end_time
            execution_log.duration_seconds = (end_time - start_time).total_seconds()
            execution_log.details = {
                "services_synced": len(services),
                "total_items": synced_count,
                "errors": errors
            }
            if errors:
                execution_log.error_message = "; ".join(errors)
            
            await db.commit()
            
            # Notify WebSocket clients that job completed
            await ws_manager.send_job_completed(
                "sync_job", "Media Sync",
                status="success" if not errors else "error",
                duration=execution_log.duration_seconds,
                details={"services_synced": len(services), "errors": errors}
            )
                    
        except Exception as e:
            error_msg = f"Sync job failed: {e}"
            logger.error(error_msg)
            
            # Update execution log with error
            if execution_log:
                end_time = datetime.now(timezone.utc)
                execution_log.status = "error"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.error_message = str(e)
                await db.commit()
                
                await ws_manager.send_job_completed(
                    "sync_job", "Media Sync", "error",
                    duration=execution_log.duration_seconds,
                    error=str(e)
                )


async def run_cleanup_job():
    """Run cleanup evaluation and scheduled deletions."""
    logger.info("Running scheduled cleanup job")
    
    start_time = datetime.now(timezone.utc)
    execution_log = None
    
    async with async_session_maker() as db:
        try:
            # Create execution log
            execution_log = JobExecutionLog(
                job_id="cleanup_job",
                job_name="Cleanup Check",
                status="running",
                started_at=start_time
            )
            db.add(execution_log)
            await db.commit()
            
            await ws_manager.send_job_started("cleanup_job", "Cleanup Check")
            
            engine = CleanupEngine(db)
            
            # First, evaluate rules and flag items
            result = await db.execute(
                select(CleanupRule).where(CleanupRule.is_enabled == True)
            )
            rules = result.scalars().all()
            
            # Skip if no enabled rules
            if not rules:
                end_time = datetime.now(timezone.utc)
                execution_log.status = "skipped"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.details = {
                    "rules_evaluated": 0,
                    "items_flagged": 0,
                    "message": "No enabled cleanup rules"
                }
                await db.commit()
                logger.info("Cleanup job skipped - no enabled rules")
                return
            
            from .models import MediaItem
            items_result = await db.execute(select(MediaItem))
            all_items = items_result.scalars().all()
            
            total_flagged = 0
            
            for rule in rules:
                # Get disk space info for the rule's library path
                disk_info = None
                if rule.library and rule.library.path:
                    disk_info = await engine.get_disk_space(rule.library.path)
                else:
                    disk_info = await engine.get_disk_space(settings.media_path)
                
                # Evaluate rule
                matched_items = await engine.evaluate_rule(rule, all_items, disk_info)
                
                if matched_items:
                    # Flag items
                    flagged = await engine.flag_items(matched_items, rule)
                    if flagged > 0:
                        total_flagged += flagged
                        logger.info(f"Rule '{rule.name}' flagged {flagged} items")
            
            # Then, execute scheduled cleanups
            cleanup_result = await engine.run_scheduled_cleanups()
            logger.info(f"Cleanup completed: {cleanup_result}")
            
            # Update execution log
            end_time = datetime.now(timezone.utc)
            execution_log.status = "success"
            execution_log.completed_at = end_time
            execution_log.duration_seconds = (end_time - start_time).total_seconds()
            execution_log.details = {
                "rules_evaluated": len(rules),
                "items_flagged": total_flagged,
                "cleanup_result": cleanup_result
            }
            await db.commit()
            
            await ws_manager.send_job_completed(
                "cleanup_job", "Cleanup Check", "success",
                duration=execution_log.duration_seconds,
                details={"rules_evaluated": len(rules), "items_flagged": total_flagged}
            )
            
        except Exception as e:
            error_msg = f"Cleanup job failed: {e}"
            logger.error(error_msg)
            
            # Update execution log with error
            if execution_log:
                end_time = datetime.now(timezone.utc)
                execution_log.status = "error"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.error_message = str(e)
                await db.commit()
                
                await ws_manager.send_job_completed(
                    "cleanup_job", "Cleanup Check", "error",
                    duration=execution_log.duration_seconds,
                    error=str(e)
                )


async def run_staging_cleanup_job():
    """Process expired staged items for permanent deletion."""
    logger.info("Running staging cleanup job")
    
    start_time = datetime.now(timezone.utc)
    execution_log = None
    
    async with async_session_maker() as db:
        try:
            # Create execution log
            execution_log = JobExecutionLog(
                job_id="staging_cleanup_job",
                job_name="Staging Cleanup",
                status="running",
                started_at=start_time
            )
            db.add(execution_log)
            await db.commit()
            
            await ws_manager.send_job_started("staging_cleanup_job", "Staging Cleanup")
            
            from .services.staging import StagingService
            from .services.emby import EmbyService
            
            staging_service = StagingService(db)
            emby_service = EmbyService(db)
            
            # Process expired items
            result = await staging_service.process_expired_staged_items(emby_service)
            
            # Update execution log
            end_time = datetime.now(timezone.utc)
            execution_log.status = "success" if result.get('success') else "error"
            execution_log.completed_at = end_time
            execution_log.duration_seconds = (end_time - start_time).total_seconds()
            execution_log.details = {
                "processed": result.get('processed', 0),
                "deleted": result.get('deleted', 0),
                "failed": result.get('failed', 0)
            }
            await db.commit()
            
            logger.info(f"Staging cleanup completed: {result}")
            
            await ws_manager.send_job_completed(
                "staging_cleanup_job", "Staging Cleanup",
                status="success" if result.get('success') else "error",
                duration=execution_log.duration_seconds,
                details=result
            )
            
        except Exception as e:
            error_msg = f"Staging cleanup job failed: {e}"
            logger.error(error_msg)
            
            # Update execution log with error
            if execution_log:
                end_time = datetime.now(timezone.utc)
                execution_log.status = "error"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.error_message = str(e)
                await db.commit()
                
                await ws_manager.send_job_completed(
                    "staging_cleanup_job", "Staging Cleanup", "error",
                    duration=execution_log.duration_seconds if execution_log else 0,
                    error=str(e)
                )


async def run_auto_restore_job():
    """Check staged items and auto-restore if watched."""
    logger.info("Running auto-restore job")
    
    start_time = datetime.now(timezone.utc)
    execution_log = None
    
    async with async_session_maker() as db:
        try:
            # Create execution log
            execution_log = JobExecutionLog(
                job_id="auto_restore_job",
                job_name="Auto-Restore Watched",
                status="running",
                started_at=start_time
            )
            db.add(execution_log)
            await db.commit()
            
            await ws_manager.send_job_started("auto_restore_job", "Auto-Restore Watched")
            
            from .services.staging import StagingService
            from .services.emby import EmbyService
            
            staging_service = StagingService(db)
            emby_service = EmbyService(db)
            
            # Check and restore watched items
            result = await staging_service.check_and_restore_watched(emby_service)
            
            # Update execution log
            end_time = datetime.now(timezone.utc)
            # If staging is not enabled, mark as skipped (not error)
            if not result.get('success') and 'not enabled' in result.get('error', '').lower():
                execution_log.status = "skipped"
            else:
                execution_log.status = "success" if result.get('success') else "error"
            execution_log.completed_at = end_time
            execution_log.duration_seconds = (end_time - start_time).total_seconds()
            execution_log.details = {
                "restored": result.get('restored', 0),
                "message": result.get('error') if not result.get('success') else None
            }
            await db.commit()
            
            logger.info(f"Auto-restore completed: {result}")
            
            await ws_manager.send_job_completed(
                "auto_restore_job", "Auto-Restore Watched",
                status=execution_log.status,
                duration=execution_log.duration_seconds,
                details=result
            )
            
        except Exception as e:
            error_msg = f"Auto-restore job failed: {e}"
            logger.error(error_msg)
            
            # Update execution log with error
            if execution_log:
                end_time = datetime.now(timezone.utc)
                execution_log.status = "error"
                execution_log.completed_at = end_time
                execution_log.duration_seconds = (end_time - start_time).total_seconds()
                execution_log.error_message = str(e)
                await db.commit()
                
                await ws_manager.send_job_completed(
                    "auto_restore_job", "Auto-Restore Watched", "error",
                    duration=execution_log.duration_seconds if execution_log else 0,
                    error=str(e)
                )


async def run_audit_retention_job():
    """Delete audit log entries older than the configured retention period."""
    from datetime import timedelta
    from sqlalchemy import delete
    from .models import AuditLog

    retention_days = settings.audit_retention_days
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    async with async_session_maker() as db:
        try:
            result = await db.execute(
                delete(AuditLog).where(AuditLog.created_at < cutoff)
            )
            deleted = result.rowcount
            await db.commit()
            if deleted:
                logger.info(f"Audit retention: purged {deleted} entries older than {retention_days} days")
        except Exception as e:
            logger.error(f"Audit retention job failed: {e}")


def start_scheduler():
    """Start the scheduler with configured jobs."""
    # Sync job - default every 6 hours (syncs all services)
    scheduler.add_job(
        run_sync_job,
        IntervalTrigger(hours=6),
        id="sync_job",
        name="Media Sync (All)",
        replace_existing=True
    )
    
    # Cleanup job - default every hour
    scheduler.add_job(
        run_cleanup_job,
        IntervalTrigger(minutes=settings.cleanup_check_interval_minutes),
        id="cleanup_job",
        name="Cleanup Check",
        replace_existing=True
    )
    
    # Staging cleanup job - run daily at 3 AM to check for expired items
    scheduler.add_job(
        run_staging_cleanup_job,
        IntervalTrigger(hours=24),
        id="staging_cleanup_job",
        name="Staging Cleanup",
        replace_existing=True
    )
    
    # Auto-restore job - check every 30 minutes for watched items
    scheduler.add_job(
        run_auto_restore_job,
        IntervalTrigger(minutes=30),
        id="auto_restore_job",
        name="Auto-Restore Watched",
        replace_existing=True
    )

    # Audit log retention - run daily
    scheduler.add_job(
        run_audit_retention_job,
        IntervalTrigger(hours=24),
        id="audit_retention_job",
        name="Audit Log Retention",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Scheduler started with all jobs (sync, cleanup, staging cleanup, auto-restore)")
    
    # Schedule dynamic service sync jobs registration
    import asyncio
    asyncio.create_task(register_service_sync_jobs())


async def register_service_sync_jobs():
    """Register individual sync jobs for each enabled service."""
    try:
        async with async_session_maker() as db:
            result = await db.execute(
                select(ServiceConnection).where(ServiceConnection.is_enabled == True)
            )
            services = result.scalars().all()
            
            for service in services:
                job_id = f"sync_service_{service.id}"
                # Check if job already exists
                if scheduler.get_job(job_id):
                    continue
                    
                scheduler.add_job(
                    partial(run_service_sync_job, service.id),
                    IntervalTrigger(hours=6),
                    id=job_id,
                    name=f"Sync: {service.name}",
                    replace_existing=True
                )
                logger.info(f"Registered sync job for service: {service.name}")
                
    except Exception as e:
        logger.error(f"Failed to register service sync jobs: {e}")


async def update_service_sync_jobs():
    """Update service sync jobs when services change."""
    async with async_session_maker() as db:
        result = await db.execute(select(ServiceConnection))
        services = result.scalars().all()
        
        existing_service_ids = set()
        
        for service in services:
            job_id = f"sync_service_{service.id}"
            existing_service_ids.add(job_id)
            
            if service.is_enabled:
                # Add or update job
                if not scheduler.get_job(job_id):
                    scheduler.add_job(
                        partial(run_service_sync_job, service.id),
                        IntervalTrigger(hours=6),
                        id=job_id,
                        name=f"Sync: {service.name}",
                        replace_existing=True
                    )
                    logger.info(f"Added sync job for service: {service.name}")
            else:
                # Remove job for disabled service
                if scheduler.get_job(job_id):
                    scheduler.remove_job(job_id)
                    logger.info(f"Removed sync job for disabled service: {service.name}")
        
        # Remove jobs for deleted services
        for job in scheduler.get_jobs():
            if job.id.startswith("sync_service_") and job.id not in existing_service_ids:
                scheduler.remove_job(job.id)
                logger.info(f"Removed sync job for deleted service: {job.id}")
    
    scheduler.start()
    logger.info("Scheduler started with all jobs (sync, cleanup, staging cleanup, auto-restore)")


async def load_saved_job_intervals():
    """Load and apply saved job intervals from database."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(SystemSettings).where(SystemSettings.key == "job_intervals")
        )
        setting = result.scalar_one_or_none()
        
        if setting and setting.value:
            job_intervals = setting.value
            for job_id, interval_minutes in job_intervals.items():
                try:
                    reschedule_job(job_id, interval_minutes)
                    logger.info(f"Restored saved interval for {job_id}: {interval_minutes} minutes")
                except Exception as e:
                    logger.warning(f"Failed to restore interval for {job_id}: {e}")


def stop_scheduler():
    """Stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def reschedule_job(job_id: str, interval_minutes: int):
    """Reschedule a job with a new interval."""
    job = scheduler.get_job(job_id)
    if not job:
        logger.warning(f"Job {job_id} not found for rescheduling")
        return
    
    if interval_minutes >= 60:
        hours = interval_minutes // 60
        remaining_minutes = interval_minutes % 60
        trigger = IntervalTrigger(hours=hours, minutes=remaining_minutes)
        logger.info(f"Rescheduling job {job_id} to run every {hours}h {remaining_minutes}m")
    else:
        trigger = IntervalTrigger(minutes=interval_minutes)
        logger.info(f"Rescheduling job {job_id} to run every {interval_minutes} minutes")
    
    scheduler.reschedule_job(job_id, trigger=trigger)


def get_scheduler_status():
    """Get scheduler status and job info."""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": str(job.next_run_time) if job.next_run_time else None
        })
    
    return {
        "running": scheduler.running,
        "jobs": jobs
    }
