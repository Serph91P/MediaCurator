"""
Security event logging for audit, monitoring, and alerting.

Provides structured JSON logging for security-relevant events:
- Authentication (login success/failure, logout, token refresh)
- Authorization failures (permission denied)
- Rate limiting (threshold exceeded)
- CSRF violations
- Suspicious activity (brute force, token reuse, etc.)

Log entries are written via loguru with a dedicated "SECURITY" tag,
making it easy to filter and forward to a log aggregation system
(e.g. Loki, Elasticsearch, Datadog, CloudWatch).
"""
import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from loguru import logger


class SecurityEventType(str, Enum):
    AUTH_LOGIN_SUCCESS = "auth.login.success"
    AUTH_LOGIN_FAILURE = "auth.login.failure"
    AUTH_LOGOUT = "auth.logout"
    AUTH_LOGOUT_ALL = "auth.logout_all"
    AUTH_TOKEN_REFRESH = "auth.token.refresh"
    AUTH_TOKEN_REFRESH_FAILURE = "auth.token.refresh_failure"
    AUTH_REGISTER = "auth.register"
    AUTH_ACCOUNT_LOCKED = "auth.account.locked"

    AUTHZ_DENIED = "authz.denied"
    AUTHZ_ADMIN_REQUIRED = "authz.admin_required"
    AUTHZ_INVALID_TOKEN = "authz.invalid_token"
    AUTHZ_EXPIRED_TOKEN = "authz.expired_token"

    RATE_LIMIT_EXCEEDED = "rate_limit.exceeded"
    CSRF_VIOLATION = "csrf.violation"

    SUSPICIOUS_BRUTE_FORCE = "suspicious.brute_force"
    SUSPICIOUS_TOKEN_REUSE = "suspicious.token_reuse"
    SUSPICIOUS_PATH_TRAVERSAL = "suspicious.path_traversal"

    SYSTEM_SECRET_KEY_WEAK = "system.secret_key.weak"
    SYSTEM_CORS_WILDCARD = "system.cors.wildcard"


def log_security_event(
    event_type: SecurityEventType,
    *,
    client_ip: str = "unknown",
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    path: Optional[str] = None,
    method: Optional[str] = None,
    detail: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """
    Emit a structured security log entry.

    All security events are logged at WARNING or ERROR level
    to ensure they appear in standard log output and can be
    picked up by alerting systems.
    """
    entry = {
        "security_event": event_type.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "client_ip": client_ip,
    }

    if user_id is not None:
        entry["user_id"] = user_id
    if username:
        entry["username"] = username
    if path:
        entry["path"] = path
    if method:
        entry["method"] = method
    if detail:
        entry["detail"] = detail
    if extra:
        entry["extra"] = extra

    severity = _event_severity(event_type)
    message = f"[SECURITY] {event_type.value}: {detail or ''}"

    if severity == "error":
        logger.error(message + " | " + json.dumps(entry))
    else:
        logger.warning(message + " | " + json.dumps(entry))


def _event_severity(event_type: SecurityEventType) -> str:
    """Map event types to log severity levels."""
    error_events = {
        SecurityEventType.AUTH_ACCOUNT_LOCKED,
        SecurityEventType.CSRF_VIOLATION,
        SecurityEventType.SUSPICIOUS_BRUTE_FORCE,
        SecurityEventType.SUSPICIOUS_TOKEN_REUSE,
        SecurityEventType.SUSPICIOUS_PATH_TRAVERSAL,
        SecurityEventType.SYSTEM_SECRET_KEY_WEAK,
    }
    return "error" if event_type in error_events else "warning"
