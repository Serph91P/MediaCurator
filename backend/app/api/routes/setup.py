"""
Setup Wizard API routes.

Provides endpoints for the first-time setup wizard that guides users
through adding services in the correct order (Sonarr/Radarr first, then Emby).
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel

from ...core.database import get_db
from ...core.rate_limit import limiter, RateLimits
from ...models import ServiceConnection, ServiceType, SystemSettings, User
from ...schemas import ServiceConnectionCreate, ServiceConnectionResponse, ServiceConnectionTest
from ...services import SonarrClient, RadarrClient, EmbyClient
from ..deps import get_current_user

router = APIRouter(prefix="/setup", tags=["Setup Wizard"])


# ==================== Response Schemas ====================

class ServiceInfo(BaseModel):
    id: int
    name: str
    service_type: str
    is_enabled: bool

    class Config:
        from_attributes = True


class SetupStatusResponse(BaseModel):
    setup_complete: bool
    has_users: bool
    has_arr_service: bool
    has_media_server: bool
    services: List[ServiceInfo]
    current_step: str  # "welcome", "arr_services", "media_server", "sync", "complete"


class SetupTestRequest(BaseModel):
    service_type: str
    url: str
    api_key: str
    verify_ssl: bool = True
    timeout: int = 120


class SetupCompleteResponse(BaseModel):
    success: bool
    message: str


# ==================== Endpoints ====================

@router.get("/status", response_model=SetupStatusResponse)
@limiter.limit(RateLimits.API_READ)
async def get_setup_status(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Check setup wizard status. No auth required so the frontend
    can decide whether to redirect to the wizard before login.
    """
    # Check if users exist
    user_count = await db.scalar(select(func.count(User.id)))
    has_users = (user_count or 0) > 0

    # Check if setup was explicitly completed
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "setup_complete")
    )
    setup_setting = result.scalar_one_or_none()
    setup_marked_complete = setup_setting is not None and setup_setting.value is True

    # Check existing services
    svc_result = await db.execute(select(ServiceConnection))
    services = svc_result.scalars().all()

    has_arr = any(
        s.service_type in (ServiceType.SONARR, ServiceType.RADARR)
        for s in services
    )
    has_media_server = any(
        s.service_type in (ServiceType.EMBY, ServiceType.JELLYFIN)
        for s in services
    )

    # Determine current step
    if setup_marked_complete:
        current_step = "complete"
    elif not has_users:
        current_step = "welcome"
    elif not has_arr:
        current_step = "arr_services"
    elif not has_media_server:
        current_step = "media_server"
    else:
        current_step = "sync"

    service_infos = [
        ServiceInfo(
            id=s.id,
            name=s.name,
            service_type=s.service_type.value,
            is_enabled=s.is_enabled
        )
        for s in services
    ]

    return SetupStatusResponse(
        setup_complete=setup_marked_complete,
        has_users=has_users,
        has_arr_service=has_arr,
        has_media_server=has_media_server,
        services=service_infos,
        current_step=current_step,
    )


@router.post("/test-connection", response_model=ServiceConnectionTest)
@limiter.limit(RateLimits.TEST_OPERATION)
async def test_connection(
    request: Request,
    data: SetupTestRequest,
    current_user=Depends(get_current_user),
):
    """Test a service connection during setup without saving it."""
    temp = ServiceConnection(
        name="setup_test",
        service_type=ServiceType(data.service_type),
        url=data.url.rstrip("/"),
        api_key=data.api_key,
        verify_ssl=data.verify_ssl,
        timeout=data.timeout,
    )

    if temp.service_type == ServiceType.SONARR:
        client = SonarrClient(url=temp.url, api_key=temp.api_key,
                              verify_ssl=temp.verify_ssl, timeout=temp.timeout)
    elif temp.service_type == ServiceType.RADARR:
        client = RadarrClient(url=temp.url, api_key=temp.api_key,
                              verify_ssl=temp.verify_ssl, timeout=temp.timeout)
    elif temp.service_type in (ServiceType.EMBY, ServiceType.JELLYFIN):
        client = EmbyClient(url=temp.url, api_key=temp.api_key,
                            verify_ssl=temp.verify_ssl, timeout=temp.timeout)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown service type: {data.service_type}")

    try:
        result = await client.test_connection()
        return ServiceConnectionTest(**result)
    finally:
        await client.close()


@router.post("/add-service", response_model=ServiceConnectionResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(RateLimits.API_WRITE)
async def add_service(
    request: Request,
    service_data: ServiceConnectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Add a service during setup wizard (same as POST /services/ but scoped to wizard)."""
    service = ServiceConnection(**service_data.model_dump())
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return service


@router.post("/complete", response_model=SetupCompleteResponse)
@limiter.limit(RateLimits.API_WRITE)
async def complete_setup(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark the setup wizard as completed."""
    # Verify minimum requirements: at least one arr service and one media server
    svc_result = await db.execute(select(ServiceConnection))
    services = svc_result.scalars().all()

    has_arr = any(
        s.service_type in (ServiceType.SONARR, ServiceType.RADARR)
        for s in services
    )
    has_media_server = any(
        s.service_type in (ServiceType.EMBY, ServiceType.JELLYFIN)
        for s in services
    )

    if not has_arr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one Sonarr or Radarr service must be configured.",
        )
    if not has_media_server:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one Emby or Jellyfin media server must be configured.",
        )

    # Mark setup complete
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "setup_complete")
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = True
    else:
        db.add(SystemSettings(
            key="setup_complete",
            value=True,
            description="Whether the initial setup wizard has been completed"
        ))

    await db.commit()

    return SetupCompleteResponse(
        success=True,
        message="Setup wizard completed successfully. You can now configure cleanup rules."
    )


@router.post("/skip")
@limiter.limit(RateLimits.API_WRITE)
async def skip_setup(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Skip the setup wizard (mark as complete without validation)."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "setup_complete")
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = True
    else:
        db.add(SystemSettings(
            key="setup_complete",
            value=True,
            description="Whether the initial setup wizard has been completed"
        ))

    await db.commit()

    return {"success": True, "message": "Setup wizard skipped."}
