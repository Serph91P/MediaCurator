"""
Notification channels API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from ...core.database import get_db
from ...models import NotificationChannel
from ...schemas import (
    NotificationChannelCreate, NotificationChannelUpdate, 
    NotificationChannelResponse
)
from ...services.notifications import NotificationService
from ..deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notification Channels"])


@router.get("/", response_model=List[NotificationChannelResponse])
async def list_notification_channels(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all notification channels."""
    result = await db.execute(select(NotificationChannel))
    return result.scalars().all()


@router.post("/", response_model=NotificationChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_notification_channel(
    channel_data: NotificationChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Create a new notification channel."""
    channel = NotificationChannel(**channel_data.model_dump())
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return channel


@router.get("/{channel_id}", response_model=NotificationChannelResponse)
async def get_notification_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a specific notification channel."""
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.id == channel_id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found"
        )
    return channel


@router.put("/{channel_id}", response_model=NotificationChannelResponse)
async def update_notification_channel(
    channel_id: int,
    channel_data: NotificationChannelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update a notification channel."""
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.id == channel_id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found"
        )
    
    update_data = channel_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(channel, key, value)
    
    await db.commit()
    await db.refresh(channel)
    return channel


@router.delete("/{channel_id}")
async def delete_notification_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Delete a notification channel."""
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.id == channel_id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found"
        )
    
    await db.delete(channel)
    await db.commit()
    return {"message": "Notification channel deleted"}


@router.post("/{channel_id}/test")
async def test_notification_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Test a notification channel by sending a test message."""
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.id == channel_id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found"
        )
    
    notification_service = NotificationService()
    success = await notification_service.send(
        notification_type=channel.notification_type,
        config=channel.config,
        title="🧪 MediaCleaner Test",
        message="This is a test notification from MediaCleaner. If you see this, your notification channel is working correctly!"
    )
    
    if success:
        return {"success": True, "message": "Test notification sent successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send test notification"
        )
