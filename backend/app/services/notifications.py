"""
Notification service for sending alerts via various channels.
Supports customizable templates, webhook retry with exponential backoff,
and multiple notification channels per event type.
"""
from typing import Dict, Any, List, Optional
from enum import Enum
import httpx
from loguru import logger
import json
import asyncio
import re
from datetime import datetime


class NotificationType(str, Enum):
    WEBHOOK = "webhook"
    DISCORD = "discord"
    SLACK = "slack"
    EMAIL = "email"
    APPRISE = "apprise"


class NotificationEventType(str, Enum):
    """Event types that can trigger notifications."""
    MEDIA_FLAGGED = "media_flagged"
    MEDIA_DELETED = "media_deleted"
    MEDIA_STAGED = "media_staged"
    MEDIA_RESTORED = "media_restored"
    CLEANUP_STARTED = "cleanup_started"
    CLEANUP_COMPLETED = "cleanup_completed"
    SYNC_COMPLETED = "sync_completed"
    ERROR = "error"
    TEST = "test"


# Default message templates
DEFAULT_TEMPLATES = {
    NotificationEventType.MEDIA_FLAGGED: {
        "title": "Media Flagged for Cleanup",
        "message": "**{{count}}** items flagged for cleanup\n**Total size:** {{size}}\n{{#rule_name}}**Rule:** {{rule_name}}{{/rule_name}}"
    },
    NotificationEventType.MEDIA_DELETED: {
        "title": "Media Deleted",
        "message": "**{{count}}** items deleted\n**Space freed:** {{size}}\n{{#rule_name}}**Rule:** {{rule_name}}{{/rule_name}}"
    },
    NotificationEventType.MEDIA_STAGED: {
        "title": "Media Staged",
        "message": "**{{count}}** items moved to staging\n**Total size:** {{size}}"
    },
    NotificationEventType.MEDIA_RESTORED: {
        "title": "Media Restored",
        "message": "**{{count}}** items restored from staging"
    },
    NotificationEventType.CLEANUP_STARTED: {
        "title": "Cleanup Started",
        "message": "Cleanup job started at {{timestamp}}"
    },
    NotificationEventType.CLEANUP_COMPLETED: {
        "title": "Cleanup Completed",
        "message": "Cleanup completed\n**Items processed:** {{count}}\n**Space freed:** {{size}}"
    },
    NotificationEventType.SYNC_COMPLETED: {
        "title": "Sync Completed",
        "message": "Library sync completed for **{{library_name}}**\n**Items synced:** {{count}}"
    },
    NotificationEventType.ERROR: {
        "title": "Error Occurred",
        "message": "An error occurred: {{message}}"
    },
    NotificationEventType.TEST: {
        "title": "Test Notification",
        "message": "This is a test notification from MediaCurator"
    }
}


class TemplateRenderer:
    """Simple template renderer supporting Mustache-like syntax."""
    
    @staticmethod
    def render(template: str, context: Dict[str, Any]) -> str:
        """
        Render a template with the given context.
        
        Supports:
        - {{variable}} - Simple variable substitution
        - {{#variable}}content{{/variable}} - Conditional blocks (if variable is truthy)
        - {{^variable}}content{{/variable}} - Inverted blocks (if variable is falsy)
        """
        if not template:
            return ""
        
        result = template
        
        # Handle conditional blocks: {{#variable}}content{{/variable}}
        pattern = r'\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}'
        while re.search(pattern, result, re.DOTALL):
            match = re.search(pattern, result, re.DOTALL)
            if match:
                var_name = match.group(1)
                content = match.group(2)
                value = context.get(var_name)
                if value:
                    # Render the content if value is truthy
                    rendered_content = TemplateRenderer.render(content, context)
                    result = result[:match.start()] + rendered_content + result[match.end():]
                else:
                    result = result[:match.start()] + result[match.end():]
        
        # Handle inverted blocks: {{^variable}}content{{/variable}}
        inv_pattern = r'\{\{\^(\w+)\}\}(.*?)\{\{/\1\}\}'
        while re.search(inv_pattern, result, re.DOTALL):
            match = re.search(inv_pattern, result, re.DOTALL)
            if match:
                var_name = match.group(1)
                content = match.group(2)
                value = context.get(var_name)
                if not value:
                    rendered_content = TemplateRenderer.render(content, context)
                    result = result[:match.start()] + rendered_content + result[match.end():]
                else:
                    result = result[:match.start()] + result[match.end():]
        
        # Handle simple variable substitution: {{variable}}
        for key, value in context.items():
            placeholder = "{{" + key + "}}"
            if placeholder in result:
                result = result.replace(placeholder, str(value) if value is not None else "")
        
        # Remove any unmatched placeholders
        result = re.sub(r'\{\{\w+\}\}', '', result)
        
        return result.strip()


class NotificationService:
    """Service for sending notifications with retry support."""
    
    def __init__(self, timeout: int = 30):
        self.timeout = timeout
    
    async def send_with_retry(
        self,
        notification_type: NotificationType,
        config: Dict[str, Any],
        title: str,
        message: str,
        max_retries: int = 3,
        retry_backoff_base: int = 2,
        **kwargs
    ) -> bool:
        """
        Send a notification with exponential backoff retry.
        
        Args:
            notification_type: Type of notification channel
            config: Channel configuration
            title: Notification title
            message: Notification message
            max_retries: Maximum number of retry attempts (default: 3)
            retry_backoff_base: Base for exponential backoff in seconds (default: 2)
            **kwargs: Additional arguments for the notification
            
        Returns:
            True if notification was sent successfully, False otherwise
        """
        last_exception = None
        
        for attempt in range(max_retries + 1):
            try:
                success = await self._send_single(
                    notification_type, config, title, message, **kwargs
                )
                if success:
                    return True
                    
            except httpx.HTTPStatusError as e:
                last_exception = e
                # Don't retry on 4xx client errors (except 429 rate limit)
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    logger.error(f"Client error {e.response.status_code}, not retrying: {e}")
                    return False
                    
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_exception = e
                
            except Exception as e:
                last_exception = e
                logger.error(f"Unexpected error sending notification: {e}")
            
            # Calculate backoff delay: base^attempt (e.g., 2^0=1s, 2^1=2s, 2^2=4s)
            if attempt < max_retries:
                delay = retry_backoff_base ** attempt
                logger.warning(
                    f"Notification failed (attempt {attempt + 1}/{max_retries + 1}), "
                    f"retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
        
        logger.error(
            f"Failed to send notification after {max_retries + 1} attempts: {last_exception}"
        )
        return False
    
    async def send(
        self,
        notification_type: NotificationType,
        config: Dict[str, Any],
        title: str,
        message: str,
        **kwargs
    ) -> bool:
        """Send a notification (without retry)."""
        return await self._send_single(notification_type, config, title, message, **kwargs)
    
    async def _send_single(
        self,
        notification_type: NotificationType,
        config: Dict[str, Any],
        title: str,
        message: str,
        **kwargs
    ) -> bool:
        """Send a single notification attempt."""
        try:
            if notification_type == NotificationType.DISCORD:
                return await self._send_discord(config, title, message, **kwargs)
            elif notification_type == NotificationType.SLACK:
                return await self._send_slack(config, title, message, **kwargs)
            elif notification_type == NotificationType.WEBHOOK:
                return await self._send_webhook(config, title, message, **kwargs)
            elif notification_type == NotificationType.APPRISE:
                return await self._send_apprise(config, title, message, **kwargs)
            else:
                logger.warning(f"Unknown notification type: {notification_type}")
                return False
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
            raise  # Re-raise for retry logic
    
    async def send_to_channels(
        self,
        channels: List[Any],  # List of NotificationChannel models
        event_type: NotificationEventType,
        context: Dict[str, Any],
        title: Optional[str] = None,
        message: Optional[str] = None,
    ) -> Dict[str, bool]:
        """
        Send notifications to multiple channels for a specific event type.
        
        Args:
            channels: List of NotificationChannel model instances
            event_type: The type of event triggering the notification
            context: Variables for template rendering
            title: Override title (if not using templates)
            message: Override message (if not using templates)
            
        Returns:
            Dict mapping channel names to success status
        """
        results = {}
        
        for channel in channels:
            if not channel.is_enabled:
                continue
            
            # Check if channel should receive this event type
            if not self._should_notify(channel, event_type):
                continue
            
            # Prepare context with defaults
            full_context = {
                "event_type": event_type.value,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                **context
            }
            
            # Get title and message from templates or defaults
            rendered_title = self._get_rendered_title(
                channel, event_type, full_context, title
            )
            rendered_message = self._get_rendered_message(
                channel, event_type, full_context, message
            )
            
            # Send with retry
            success = await self.send_with_retry(
                notification_type=NotificationType(channel.notification_type.value),
                config=channel.config,
                title=rendered_title,
                message=rendered_message,
                max_retries=channel.max_retries or 3,
                retry_backoff_base=channel.retry_backoff_base or 2,
                event_type=event_type.value,
                **context
            )
            
            results[channel.name] = success
        
        return results
    
    def _should_notify(self, channel: Any, event_type: NotificationEventType) -> bool:
        """Check if a channel should receive notifications for an event type."""
        # Use new event_types field if set
        if channel.event_types:
            return event_type.value in channel.event_types
        
        # Fall back to legacy fields
        legacy_mapping = {
            NotificationEventType.MEDIA_FLAGGED: channel.notify_on_flagged,
            NotificationEventType.MEDIA_DELETED: channel.notify_on_deleted,
            NotificationEventType.MEDIA_STAGED: channel.notify_on_flagged,
            NotificationEventType.MEDIA_RESTORED: channel.notify_on_flagged,
            NotificationEventType.CLEANUP_STARTED: channel.notify_on_flagged,
            NotificationEventType.CLEANUP_COMPLETED: channel.notify_on_deleted,
            NotificationEventType.SYNC_COMPLETED: channel.notify_on_flagged,
            NotificationEventType.ERROR: channel.notify_on_error,
            NotificationEventType.TEST: True,  # Always allow test notifications
        }
        
        return legacy_mapping.get(event_type, False)
    
    def _get_rendered_title(
        self,
        channel: Any,
        event_type: NotificationEventType,
        context: Dict[str, Any],
        override: Optional[str] = None
    ) -> str:
        """Get rendered title from template or default."""
        if override:
            return TemplateRenderer.render(override, context)
        
        if channel.title_template:
            return TemplateRenderer.render(channel.title_template, context)
        
        default = DEFAULT_TEMPLATES.get(event_type, {}).get("title", "MediaCurator Notification")
        return TemplateRenderer.render(default, context)
    
    def _get_rendered_message(
        self,
        channel: Any,
        event_type: NotificationEventType,
        context: Dict[str, Any],
        override: Optional[str] = None
    ) -> str:
        """Get rendered message from template or default."""
        if override:
            return TemplateRenderer.render(override, context)
        
        if channel.message_template:
            return TemplateRenderer.render(channel.message_template, context)
        
        default = DEFAULT_TEMPLATES.get(event_type, {}).get("message", "")
        return TemplateRenderer.render(default, context)
    
    async def _send_discord(
        self,
        config: Dict[str, Any],
        title: str,
        message: str,
        color: int = 0x5865F2,  # Discord blurple
        **kwargs
    ) -> bool:
        """Send Discord webhook notification."""
        from ..core.url_validation import validate_outbound_url

        webhook_url = config.get("webhook_url")
        if not webhook_url:
            logger.error("Discord webhook URL not configured")
            return False
        validate_outbound_url(webhook_url)
        
        # Build embed
        embed = {
            "title": title,
            "description": message,
            "color": color,
            "footer": {"text": "MediaCurator"},
            "timestamp": datetime.now().isoformat()
        }
        
        # Add fields if provided
        if "fields" in kwargs:
            embed["fields"] = kwargs["fields"]
        
        payload = {
            "embeds": [embed]
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
            logger.info(f"Discord notification sent: {title}")
            return True
    
    async def _send_slack(
        self,
        config: Dict[str, Any],
        title: str,
        message: str,
        **kwargs
    ) -> bool:
        """Send Slack webhook notification."""
        from ..core.url_validation import validate_outbound_url

        webhook_url = config.get("webhook_url")
        if not webhook_url:
            logger.error("Slack webhook URL not configured")
            return False
        validate_outbound_url(webhook_url)
        
        payload = {
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": title}
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": message}
                }
            ]
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
            logger.info(f"Slack notification sent: {title}")
            return True
    
    async def _send_webhook(
        self,
        config: Dict[str, Any],
        title: str,
        message: str,
        **kwargs
    ) -> bool:
        """Send generic webhook notification."""
        from ..core.url_validation import validate_outbound_url

        url = config.get("url")
        if not url:
            logger.error("Webhook URL not configured")
            return False
        validate_outbound_url(url)
        
        method = config.get("method", "POST").upper()
        headers = config.get("headers", {})
        
        payload = {
            "title": title,
            "message": message,
            "source": "MediaCurator",
            "timestamp": datetime.now().isoformat(),
            **{k: v for k, v in kwargs.items() if k not in ["fields"]}
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            if method == "POST":
                response = await client.post(url, json=payload, headers=headers)
            elif method == "PUT":
                response = await client.put(url, json=payload, headers=headers)
            else:
                logger.error(f"Unsupported webhook method: {method}")
                return False
            
            response.raise_for_status()
            logger.info(f"Webhook notification sent: {title}")
            return True
    
    async def _send_apprise(
        self,
        config: Dict[str, Any],
        title: str,
        message: str,
        **kwargs
    ) -> bool:
        """Send notification via Apprise."""
        try:
            import apprise
            
            urls = config.get("urls", [])
            if not urls:
                logger.error("No Apprise URLs configured")
                return False
            
            apobj = apprise.Apprise()
            for url in urls:
                apobj.add(url)
            
            result = await apobj.async_notify(
                body=message,
                title=title
            )
            
            if result:
                logger.info(f"Apprise notification sent: {title}")
            return result
            
        except ImportError:
            logger.error("Apprise library not installed")
            return False


# Notification colors for different events
class NotificationColors:
    INFO = 0x5865F2     # Blue
    SUCCESS = 0x57F287  # Green
    WARNING = 0xFEE75C  # Yellow
    ERROR = 0xED4245    # Red
    DELETION = 0xE67E22  # Orange


def format_size(size_bytes: float) -> str:
    """Format bytes to human readable string."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


def create_cleanup_notification_message(
    items: List[Dict[str, Any]],
    action: str,
    rule_name: Optional[str] = None
) -> tuple[str, str]:
    """Create notification message for cleanup action."""
    total_size = sum(item.get("size_bytes", 0) for item in items)
    item_count = len(items)
    
    title = f"MediaCurator: {action.title()}"
    
    lines = [
        f"**{item_count}** items {'deleted' if action == 'delete' else 'flagged for cleanup'}",
        f"**Space {'freed' if action == 'delete' else 'to be freed'}:** {format_size(total_size)}",
    ]
    
    if rule_name:
        lines.append(f"**Rule:** {rule_name}")
    
    # Add item list (limited)
    if items:
        lines.append("\n**Items:**")
        for item in items[:10]:
            lines.append(f"• {item.get('title', 'Unknown')}")
        if len(items) > 10:
            lines.append(f"• ... and {len(items) - 10} more")
    
    return title, "\n".join(lines)


def create_notification_context(
    items: Optional[List[Dict[str, Any]]] = None,
    rule_name: Optional[str] = None,
    library_name: Optional[str] = None,
    service: Optional[str] = None,
    error_message: Optional[str] = None,
    **extra
) -> Dict[str, Any]:
    """
    Create a context dictionary for template rendering.
    
    Args:
        items: List of media items involved
        rule_name: Name of the cleanup rule
        library_name: Name of the library
        service: Service name (Radarr/Sonarr)
        error_message: Error message if applicable
        **extra: Additional context variables
        
    Returns:
        Context dictionary for template rendering
    """
    context = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        **extra
    }
    
    if items:
        context["count"] = len(items)
        total_size = sum(item.get("size_bytes", 0) for item in items)
        context["size"] = format_size(total_size)
        context["items"] = items
        
        # Add first item details for single-item notifications
        if len(items) == 1:
            item = items[0]
            context["media_title"] = item.get("title", "Unknown")
            context["media_year"] = item.get("year", "")
    
    if rule_name:
        context["rule_name"] = rule_name
    
    if library_name:
        context["library_name"] = library_name
    
    if service:
        context["service"] = service
    
    if error_message:
        context["message"] = error_message
        context["error"] = error_message
    
    return context
