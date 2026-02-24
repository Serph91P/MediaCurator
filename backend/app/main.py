"""
Main FastAPI application.
"""
from pathlib import Path
from typing import Optional
from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .core.security_headers import SecurityHeadersMiddleware
from .core.csrf import CSRFMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import sys

from .core.config import get_settings
from .core.database import init_db, close_db
from .core.rate_limit import setup_rate_limiting, limiter, RateLimits
from .core.websocket import ws_manager
from .core.security import decode_token
from .api.routes import auth, services, rules, libraries, notifications, system, jobs, media, staging, audit, activity, users, setup
from .api.deps import get_current_user, get_optional_user

settings = get_settings()

# Disable OpenAPI docs in production
_docs_url = "/api/docs" if settings.debug else None
_redoc_url = "/api/redoc" if settings.debug else None
_openapi_url = "/api/openapi.json" if settings.debug else None

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
    from .scheduler import start_scheduler, stop_scheduler, load_saved_job_intervals
    start_scheduler()
    logger.info("Scheduler started")
    
    # Load saved job intervals from database
    await load_saved_job_intervals()
    
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
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url
)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# CSRF double-submit cookie middleware
app.add_middleware(CSRFMiddleware)

# Global request body size limit (10 MB)
MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024

@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)

# CORS middleware — use configurable origins from settings
# Disable credentials when wildcard is used in production
_allow_credentials = not (settings.cors_origin_list == ["*"] and not settings.debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Refresh-Token", "X-CSRF-Token"],
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
app.include_router(activity.router, prefix="/api/activity", tags=["activity"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(setup.router, prefix="/api")


@app.get("/api/health")
@limiter.limit(RateLimits.HEALTH_CHECK)
async def health(request: Request):
    """Simple health check endpoint for Docker healthcheck."""
    return {"status": "healthy"}


@app.get("/api/health/detailed")
@limiter.limit(RateLimits.HEALTH_CHECK)
async def health_detailed(request: Request, current_user = Depends(get_optional_user)):
    """Detailed health check with component status. Requires auth for full details."""
    from .core.database import async_session_maker
    from sqlalchemy import text
    import time
    
    # Unauthenticated: return minimal status only
    if current_user is None:
        return {"status": "healthy"}

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
        logger.error(f"Health check database error: {e}")
        health_status["components"]["database"] = {"status": "unhealthy"}
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
        logger.error(f"Health check scheduler error: {e}")
        health_status["components"]["scheduler"] = {"status": "unknown"}
    
    return health_status


@app.websocket("/api/ws/jobs")
async def websocket_jobs(websocket: WebSocket):
    """WebSocket endpoint for real-time job status updates (requires auth token)."""
    # Authenticate via query parameter
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    token_data = decode_token(token, verify_type="access")
    if not token_data or not token_data.user_id:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    connected = await ws_manager.connect(websocket)
    if not connected:
        return
    try:
        _msg_count = 0
        _last_reset = __import__('time').monotonic()
        while True:
            data = await websocket.receive_text()
            # Simple message rate limit: max 10 messages/second
            now = __import__('time').monotonic()
            if now - _last_reset >= 1.0:
                _msg_count = 0
                _last_reset = now
            _msg_count += 1
            if _msg_count > 10:
                await websocket.close(code=4008, reason="Message rate limit exceeded")
                break
            if data == "ping":
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception:
        await ws_manager.disconnect(websocket)


# Mount static files for frontend assets (JS, CSS, etc.)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{full_path:path}")
async def serve_frontend(request: Request, full_path: str):
    """Serve frontend for all non-API routes (SPA routing)."""
    # Don't serve frontend for API routes
    if full_path.startswith("api/"):
        return JSONResponse({"error": "Not found"}, status_code=404)
    
    if STATIC_DIR.exists():
        # Validate path against directory traversal
        file_path = (STATIC_DIR / full_path).resolve()
        static_root = STATIC_DIR.resolve()

        if file_path.is_file() and str(file_path).startswith(str(static_root)):
            return FileResponse(file_path)
        
        # For SPA routing, always serve index.html
        index_path = STATIC_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
    
    # Fallback: return API info
    return JSONResponse({
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/api/docs",
        "note": "Frontend not found. Make sure static files are built and copied."
    })
