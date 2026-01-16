"""
Scheduler for periodic tasks (cleanup, sync).
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlalchemy import select

from .core.config import get_settings
from .core.database import async_session_maker
from .models import ServiceConnection, CleanupRule, SystemSettings
from .services.cleanup_engine import CleanupEngine
from .services.sync import sync_service_media

settings = get_settings()
scheduler = AsyncIOScheduler()


async def run_sync_job():
    """Sync media from all enabled services."""
    logger.info("Running scheduled sync job")
    
    async with async_session_maker() as db:
        try:
            result = await db.execute(
                select(ServiceConnection).where(ServiceConnection.is_enabled == True)
            )
            services = result.scalars().all()
            
            for service in services:
                try:
                    sync_result = await sync_service_media(db, service)
                    logger.info(f"Sync completed for {service.name}: {sync_result}")
                except Exception as e:
                    logger.error(f"Sync failed for {service.name}: {e}")
                    
        except Exception as e:
            logger.error(f"Sync job failed: {e}")


async def run_cleanup_job():
    """Run cleanup evaluation and scheduled deletions."""
    logger.info("Running scheduled cleanup job")
    
    async with async_session_maker() as db:
        try:
            engine = CleanupEngine(db)
            
            # First, evaluate rules and flag items
            result = await db.execute(
                select(CleanupRule).where(CleanupRule.is_enabled == True)
            )
            rules = result.scalars().all()
            
            from .models import MediaItem
            items_result = await db.execute(select(MediaItem))
            all_items = items_result.scalars().all()
            
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
                        logger.info(f"Rule '{rule.name}' flagged {flagged} items")
            
            # Then, execute scheduled cleanups
            cleanup_result = await engine.run_scheduled_cleanups()
            logger.info(f"Cleanup completed: {cleanup_result}")
            
        except Exception as e:
            logger.error(f"Cleanup job failed: {e}")


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
    
    scheduler.start()
    logger.info("Scheduler started with sync and cleanup jobs")


def stop_scheduler():
    """Stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


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
