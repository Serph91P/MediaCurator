"""
Main FastAPI application.
"""
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from loguru import logger
import sys

from .core.config import get_settings
from .core.database import init_db, close_db
from .core.rate_limit import setup_rate_limiting, limiter, RateLimits
from .api.routes import auth, services, rules, libraries, notifications, system, jobs, media, staging, audit

settings = get_settings()

# Path to static files (frontend build)
STATIC_DIR = Path(__file__).parent.parent / "static"

# Configure logging
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="DEBUG" if settings.debug else "INFO"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup - get dynamic version
    from .services.version import version_service
    version_info = version_service.get_version_info()
    display_version = version_info.get("version", settings.app_version)
    logger.info(f"Starting {settings.app_name} {display_version}")
    await init_db()
    logger.info("Database initialized")
    
    # Run migrations
    from .core.database import async_session_maker
    from .core.migrations import migrate_database
    async with async_session_maker() as db:
        await migrate_database(db)
    logger.info("Database migrations completed")
    
    # Start scheduler
    from .scheduler import start_scheduler, stop_scheduler
    start_scheduler()
    logger.info("Scheduler started")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    stop_scheduler()
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Media library cleanup and management tool",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup rate limiting
setup_rate_limiting(app)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(services.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(libraries.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(staging.router, prefix="/api/staging", tags=["staging"])


@app.get("/api/health")
@limiter.limit(RateLimits.HEALTH_CHECK)
async def health(request: Request):
    """Simple health check endpoint for Docker healthcheck."""
    return {"status": "healthy"}


@app.get("/api/health/detailed")
@limiter.limit(RateLimits.HEALTH_CHECK)
async def health_detailed(request: Request):
    """Detailed health check with component status."""
    from .core.database import async_session_maker
    from sqlalchemy import text
    import time
    
    health_status = {
        "status": "healthy",
        "timestamp": time.time(),
        "version": settings.app_version,
        "components": {}
    }
    
    # Check database
    try:
        async with async_session_maker() as db:
            await db.execute(text("SELECT 1"))
        health_status["components"]["database"] = {"status": "healthy"}
    except Exception as e:
        health_status["components"]["database"] = {"status": "unhealthy", "error": str(e)}
        health_status["status"] = "degraded"
    
    # Check scheduler
    try:
        from .scheduler import scheduler
        if scheduler.running:
            health_status["components"]["scheduler"] = {"status": "healthy", "jobs": len(scheduler.get_jobs())}
        else:
            health_status["components"]["scheduler"] = {"status": "stopped"}
            health_status["status"] = "degraded"
    except Exception as e:
        health_status["components"]["scheduler"] = {"status": "unknown", "error": str(e)}
    
    return health_status


# Mount static files for frontend assets (JS, CSS, etc.)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{full_path:path}")
async def serve_frontend(request: Request, full_path: str):
    """Serve frontend for all non-API routes (SPA routing)."""
    # Don't serve frontend for API routes
    if full_path.startswith("api/"):
        return {"error": "Not found"}, 404
    
    # Try to serve the requested file
    if STATIC_DIR.exists():
        # Check if requesting a specific file
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # For SPA routing, always serve index.html
        index_path = STATIC_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
    
    # Fallback: return API info
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/api/docs",
        "note": "Frontend not found. Make sure static files are built and copied."
    }
