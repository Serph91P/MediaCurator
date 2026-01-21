"""
Notification channels API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel

from ...core.database import get_db
from ...core.rate_limit import limiter, RateLimits
from ...models import NotificationChannel
from ...models.database import NotificationEventType
from ...schemas import (
    NotificationChannelCreate, NotificationChannelUpdate, 
    NotificationChannelResponse
)
from ...services.notifications import (
    NotificationService, NotificationEventType as ServiceEventType,
    DEFAULT_TEMPLATES, TemplateRenderer, create_notification_context
)
from ..deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notification Channels"])


class EventTypesResponse(BaseModel):
    """Response model for available event types."""
    event_types: List[dict]


class TemplatePreviewRequest(BaseModel):
    """Request model for template preview."""
    title_template: Optional[str] = None
    message_template: Optional[str] = None
    event_type: str = "test"


class TemplatePreviewResponse(BaseModel):
    """Response model for template preview."""
    rendered_title: str
    rendered_message: str


@router.get("/event-types", response_model=EventTypesResponse)
@limiter.limit(RateLimits.API_READ)
async def list_event_types(
    request: Request,
    current_user = Depends(get_current_user)
):
    """List all available notification event types with their default templates."""
    event_types = []
    for event_type in ServiceEventType:
        default_template = DEFAULT_TEMPLATES.get(event_type, {})
        event_types.append({
            "value": event_type.value,
            "name": event_type.name,
            "default_title": default_template.get("title", ""),
            "default_message": default_template.get("message", "")
        })
    return {"event_types": event_types}


@router.post("/preview-template", response_model=TemplatePreviewResponse)
@limiter.limit(RateLimits.API_READ)
async def preview_template(
    request: Request,
    template_request: TemplatePreviewRequest,
    current_user = Depends(get_current_user)
):
    """Preview rendered notification templates with sample data."""
    # Sample context for preview
    sample_context = create_notification_context(
        items=[
            {"title": "Sample Movie (2024)", "size_bytes": 5_000_000_000, "year": 2024},
            {"title": "Another Movie (2023)", "size_bytes": 3_500_000_000, "year": 2023},
        ],
        rule_name="Unwatched for 90 days",
        library_name="Movies",
        service="Radarr"
    )
    
    # Get event type for defaults
    try:
        event_type = ServiceEventType(template_request.event_type)
    except ValueError:
        event_type = ServiceEventType.TEST
    
    default_template = DEFAULT_TEMPLATES.get(event_type, {})
    
    # Render templates
    title_template = template_request.title_template or default_template.get("title", "Notification")
    message_template = template_request.message_template or default_template.get("message", "")
    
    rendered_title = TemplateRenderer.render(title_template, sample_context)
    rendered_message = TemplateRenderer.render(message_template, sample_context)
    
    return {
        "rendered_title": rendered_title,
        "rendered_message": rendered_message
    }


@router.get("/", response_model=List[NotificationChannelResponse])
@limiter.limit(RateLimits.API_READ)
async def list_notification_channels(
    request: Request,
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all notification channels, optionally filtered by event type."""
    result = await db.execute(select(NotificationChannel))
    channels = result.scalars().all()
    
    # Filter by event type if specified
    if event_type:
        filtered_channels = []
        notification_service = NotificationService()
        for channel in channels:
            try:
                service_event_type = ServiceEventType(event_type)
                if notification_service._should_notify(channel, service_event_type):
                    filtered_channels.append(channel)
            except ValueError:
                pass  # Invalid event type, skip filtering
        return filtered_channels
    
    return channels


@router.post("/", response_model=NotificationChannelResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(RateLimits.API_WRITE)
async def create_notification_channel(
    request: Request,
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
@limiter.limit(RateLimits.API_READ)
async def get_notification_channel(
    request: Request,
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
@limiter.limit(RateLimits.API_WRITE)
async def update_notification_channel(
    request: Request,
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
@limiter.limit(RateLimits.API_WRITE)
async def delete_notification_channel(
    request: Request,
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
@limiter.limit(RateLimits.TEST_OPERATION)
async def test_notification_channel(
    request: Request,
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Test a notification channel by sending a test message with retry logic."""
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
    
    # Create test context
    test_context = create_notification_context(
        items=[{"title": "Test Media (2024)", "size_bytes": 1_500_000_000, "year": 2024}],
        rule_name="Test Rule",
        library_name="Test Library"
    )
    
    # Send with templates and retry
    results = await notification_service.send_to_channels(
        channels=[channel],
        event_type=ServiceEventType.TEST,
        context=test_context
    )
    
    success = results.get(channel.name, False)
    
    if success:
        return {"success": True, "message": "Test notification sent successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send test notification after retries"
        )
