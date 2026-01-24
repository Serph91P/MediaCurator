"""
Scheduler for periodic tasks (cleanup, sync).
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlalchemy import select

from .core.config import get_settings
from .core.database import async_session_maker
from .models import ServiceConnection, CleanupRule, SystemSettings, JobExecutionLog
from .services.cleanup_engine import CleanupEngine
from .services.sync import sync_service_media
from datetime import datetime, timezone

settings = get_settings()
scheduler = AsyncIOScheduler()


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
            
            for service in services:
                try:
                    sync_result = await sync_service_media(db, service)
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


def start_scheduler():
    """Start the scheduler with configured jobs."""
    # Sync job - default every 6 hours
    scheduler.add_job(
        run_sync_job,
        IntervalTrigger(hours=6),
        id="sync_job",
        name="Media Sync",
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
