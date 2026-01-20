"""
Notification service for sending alerts via various channels.
"""
from typing import Dict, Any, List, Optional
from enum import Enum
import httpx
from loguru import logger
import json


class NotificationType(str, Enum):
    WEBHOOK = "webhook"
    DISCORD = "discord"
    SLACK = "slack"
    APPRISE = "apprise"


class NotificationService:
    """Service for sending notifications."""
    
    def __init__(self, timeout: int = 30):
        self.timeout = timeout
    
    async def send(
        self,
        notification_type: NotificationType,
        config: Dict[str, Any],
        title: str,
        message: str,
        **kwargs
    ) -> bool:
        """Send a notification."""
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
            return False
    
    async def _send_discord(
        self,
        config: Dict[str, Any],
        title: str,
        message: str,
        color: int = 0x5865F2,  # Discord blurple
        **kwargs
    ) -> bool:
        """Send Discord webhook notification."""
        webhook_url = config.get("webhook_url")
        if not webhook_url:
            logger.error("Discord webhook URL not configured")
            return False
        
        # Build embed
        embed = {
            "title": title,
            "description": message,
            "color": color,
            "footer": {"text": "MediaCleaner"}
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
        webhook_url = config.get("webhook_url")
        if not webhook_url:
            logger.error("Slack webhook URL not configured")
            return False
        
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
        url = config.get("url")
        if not url:
            logger.error("Webhook URL not configured")
            return False
        
        method = config.get("method", "POST").upper()
        headers = config.get("headers", {})
        
        payload = {
            "title": title,
            "message": message,
            "source": "MediaCleaner",
            **kwargs
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
