"""
Service connections API routes (Sonarr, Radarr, Emby, etc.).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from ...core.database import get_db
from ...models import ServiceConnection, ServiceType
from ...schemas import (
    ServiceConnectionCreate, ServiceConnectionUpdate, 
    ServiceConnectionResponse, ServiceConnectionTest
)
from ...services import SonarrClient, RadarrClient, EmbyClient
from ..deps import get_current_user

router = APIRouter(prefix="/services", tags=["Service Connections"])


async def get_service_client(connection: ServiceConnection):
    """Get the appropriate client for a service connection."""
    if connection.service_type == ServiceType.SONARR:
        return SonarrClient(
            url=connection.url,
            api_key=connection.api_key,
            verify_ssl=connection.verify_ssl,
            timeout=connection.timeout
        )
    elif connection.service_type == ServiceType.RADARR:
        return RadarrClient(
            url=connection.url,
            api_key=connection.api_key,
            verify_ssl=connection.verify_ssl,
            timeout=connection.timeout
        )
    elif connection.service_type in [ServiceType.EMBY, ServiceType.JELLYFIN]:
        return EmbyClient(
            url=connection.url,
            api_key=connection.api_key,
            verify_ssl=connection.verify_ssl,
            timeout=connection.timeout
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported service type: {connection.service_type}"
        )


@router.get("/", response_model=List[ServiceConnectionResponse])
async def list_services(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all service connections."""
    result = await db.execute(select(ServiceConnection))
    return result.scalars().all()


@router.post("/", response_model=ServiceConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_service(
    service_data: ServiceConnectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Create a new service connection."""
    service = ServiceConnection(**service_data.model_dump())
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return service


@router.get("/{service_id}", response_model=ServiceConnectionResponse)
async def get_service(
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a specific service connection."""
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service connection not found"
        )
    return service


@router.put("/{service_id}", response_model=ServiceConnectionResponse)
async def update_service(
    service_id: int,
    service_data: ServiceConnectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update a service connection."""
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service connection not found"
        )
    
    update_data = service_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(service, key, value)
    
    await db.commit()
    await db.refresh(service)
    return service


@router.delete("/{service_id}")
async def delete_service(
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Delete a service connection."""
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service connection not found"
        )
    
    await db.delete(service)
    await db.commit()
    return {"message": "Service connection deleted"}


@router.post("/{service_id}/test", response_model=ServiceConnectionTest)
async def test_service(
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Test a service connection."""
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service connection not found"
        )
    
    client = await get_service_client(service)
    try:
        test_result = await client.test_connection()
        
        # Update last sync time on success
        if test_result.get("success"):
            service.last_sync = datetime.utcnow()
            await db.commit()
        
        return ServiceConnectionTest(**test_result)
    finally:
        await client.close()


@router.post("/test", response_model=ServiceConnectionTest)
async def test_new_service(
    service_data: ServiceConnectionCreate,
    current_user = Depends(get_current_user)
):
    """Test a service connection without saving it."""
    # Create a temporary connection object
    temp_service = ServiceConnection(**service_data.model_dump())
    
    client = await get_service_client(temp_service)
    try:
        test_result = await client.test_connection()
        return ServiceConnectionTest(**test_result)
    finally:
        await client.close()


@router.post("/{service_id}/sync")
async def sync_service(
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Sync media items from a service."""
    from ...services.sync import sync_service_media
    
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service connection not found"
        )
    
    sync_result = await sync_service_media(db, service)
    return sync_result
