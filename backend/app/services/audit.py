"""
Audit logging service for tracking admin actions.
"""
from typing import Optional, Any, Dict, List
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_, func
from fastapi import Request
from loguru import logger

from ..models import AuditLog, AuditActionType, User


class AuditService:
    """Service for logging and querying audit events."""
    
    @staticmethod
    def get_client_ip(request: Request) -> str:
        """Extract client IP address, only trusting forwarded headers from trusted proxies."""
        from ..core.config import get_settings
        settings = get_settings()
        trusted_proxies = settings.trusted_proxy_list
        direct_ip = request.client.host if request.client else "unknown"

        if trusted_proxies and direct_ip in trusted_proxies:
            forwarded_for = request.headers.get("x-forwarded-for")
            if forwarded_for:
                return forwarded_for.split(",")[0].strip()
            real_ip = request.headers.get("x-real-ip")
            if real_ip:
                return real_ip.strip()

        return direct_ip
    
    @staticmethod
    def get_user_agent(request: Request) -> str:
        """Extract user agent from request."""
        user_agent = request.headers.get("user-agent", "Unknown")
        return user_agent[:255] if len(user_agent) > 255 else user_agent
    
    @classmethod
    async def log(
        cls,
        db: AsyncSession,
        action: AuditActionType,
        request: Optional[Request] = None,
        user: Optional[User] = None,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[int] = None,
        resource_name: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        """
        Log an audit event.
        
        Args:
            db: Database session
            action: The type of action performed
            request: FastAPI request object (for IP/user agent extraction)
            user: User object who performed the action
            user_id: User ID (if user object not available)
            username: Username (if user object not available)
            resource_type: Type of resource affected (e.g., "rule", "service")
            resource_id: ID of the affected resource
            resource_name: Human-readable name of the resource
            details: Additional action-specific details
            ip_address: Override IP address (useful for failed logins)
        """
        # Extract user info
        if user:
            user_id = user.id
            username = user.username
        
        # Extract request context
        req_ip = ip_address
        req_user_agent = None
        if request:
            req_ip = req_ip or cls.get_client_ip(request)
            req_user_agent = cls.get_user_agent(request)
        
        audit_log = AuditLog(
            user_id=user_id,
            username=username,
            action=action.value,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=resource_name,
            details=details,
            ip_address=req_ip,
            user_agent=req_user_agent,
        )
        
        db.add(audit_log)
        await db.commit()
        await db.refresh(audit_log)
        
        logger.debug(
            f"Audit: {action.value} by {username or 'anonymous'} "
            f"on {resource_type or 'system'}:{resource_id or '-'} "
            f"from {req_ip or 'unknown'}"
        )
        
        return audit_log
    
    @classmethod
    async def get_logs(
        cls,
        db: AsyncSession,
        user_id: Optional[int] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[List[AuditLog], int]:
        """
        Query audit logs with filters.
        
        Returns:
            Tuple of (logs, total_count)
        """
        conditions = []
        
        if user_id is not None:
            conditions.append(AuditLog.user_id == user_id)
        if action:
            conditions.append(AuditLog.action == action)
        if resource_type:
            conditions.append(AuditLog.resource_type == resource_type)
        if start_date:
            conditions.append(AuditLog.created_at >= start_date)
        if end_date:
            conditions.append(AuditLog.created_at <= end_date)
        
        # Count query
        count_query = select(func.count(AuditLog.id))
        if conditions:
            count_query = count_query.where(and_(*conditions))
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0
        
        # Data query
        query = select(AuditLog).order_by(desc(AuditLog.created_at))
        if conditions:
            query = query.where(and_(*conditions))
        query = query.offset(offset).limit(limit)
        
        result = await db.execute(query)
        logs = result.scalars().all()
        
        return list(logs), total
    
    @classmethod
    async def get_recent_activity(
        cls,
        db: AsyncSession,
        hours: int = 24,
        limit: int = 50,
    ) -> List[AuditLog]:
        """Get recent audit activity."""
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        result = await db.execute(
            select(AuditLog)
            .where(AuditLog.created_at >= since)
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
        )
        
        return list(result.scalars().all())
    
    @classmethod
    async def get_user_activity(
        cls,
        db: AsyncSession,
        user_id: int,
        limit: int = 50,
    ) -> List[AuditLog]:
        """Get activity for a specific user."""
        result = await db.execute(
            select(AuditLog)
            .where(AuditLog.user_id == user_id)
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
        )
        
        return list(result.scalars().all())
    
    @classmethod
    async def cleanup_old_logs(
        cls,
        db: AsyncSession,
        days: int = 90,
    ) -> int:
        """
        Delete audit logs older than specified days.
        
        Returns:
            Number of deleted records
        """
        from sqlalchemy import delete
        
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        
        result = await db.execute(
            delete(AuditLog).where(AuditLog.created_at < cutoff)
        )
        await db.commit()
        
        deleted = result.rowcount
        if deleted > 0:
            logger.info(f"Cleaned up {deleted} audit log entries older than {days} days")
        
        return deleted


# Convenience function for quick logging
async def audit_log(
    db: AsyncSession,
    action: AuditActionType,
    request: Optional[Request] = None,
    user: Optional[User] = None,
    **kwargs
) -> AuditLog:
    """Convenience function for logging audit events."""
    return await AuditService.log(
        db=db,
        action=action,
        request=request,
        user=user,
        **kwargs
    )
