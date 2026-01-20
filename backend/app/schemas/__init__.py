"""
Pydantic schemas for API request/response validation.
"""
from pydantic import BaseModel, Field, HttpUrl, EmailStr, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ==================== Enums ====================

class ServiceType(str, Enum):
    SONARR = "sonarr"
    RADARR = "radarr"
    EMBY = "emby"
    JELLYFIN = "jellyfin"
    JELLYSTAT = "jellystat"


class MediaType(str, Enum):
    MOVIE = "movie"
    SERIES = "series"
    EPISODE = "episode"
    SEASON = "season"


class RuleActionType(str, Enum):
    DELETE = "delete"
    NOTIFY_ONLY = "notify_only"
    MOVE_TO_TRASH = "move_to_trash"
    UNMONITOR = "unmonitor"


class NotificationType(str, Enum):
    WEBHOOK = "webhook"
    DISCORD = "discord"
    SLACK = "slack"
    EMAIL = "email"
    APPRISE = "apprise"


class SeriesDeleteMode(str, Enum):
    """How to handle series deletion when an episode is watched.
    
    EPISODE: Only the watched episode is kept (most aggressive)
    SEASON: Entire season is kept if any episode was watched
    SERIES: Entire series is kept if any episode was watched (most conservative)
    """
    EPISODE = "episode"
    SEASON = "season"
    SERIES = "series"


# ==================== Auth Schemas ====================

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: Optional[int] = None
    username: Optional[str] = None


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[EmailStr] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Service Connection Schemas ====================

class ServiceConnectionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    service_type: ServiceType
    url: str = Field(..., min_length=1, max_length=500)
    api_key: str = Field(..., min_length=1, max_length=255)
    is_enabled: bool = True
    verify_ssl: bool = True
    timeout: int = Field(default=30, ge=5, le=300)

    @field_validator('url')
    @classmethod
    def validate_url(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('URL must start with http:// or https://')
        return v.rstrip('/')


class ServiceConnectionCreate(ServiceConnectionBase):
    pass


class ServiceConnectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    api_key: Optional[str] = Field(None, min_length=1, max_length=255)
    is_enabled: Optional[bool] = None
    verify_ssl: Optional[bool] = None
    timeout: Optional[int] = Field(None, ge=5, le=300)


class ServiceConnectionResponse(ServiceConnectionBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_sync: Optional[datetime] = None

    class Config:
        from_attributes = True


class ServiceConnectionTest(BaseModel):
    success: bool
    message: str
    version: Optional[str] = None


# ==================== Library Schemas ====================

class LibraryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    media_type: MediaType
    path: Optional[str] = None
    external_id: str = Field(..., min_length=1, max_length=100)
    service_connection_id: int
    is_enabled: bool = True


class LibraryCreate(LibraryBase):
    pass


class LibraryUpdate(BaseModel):
    is_enabled: Optional[bool] = None  # Only allow toggling enabled state


class LibraryResponse(LibraryBase):
    id: int
    last_synced_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LibrarySyncResponse(BaseModel):
    synced: int
    removed: int
    message: str


# ==================== Cleanup Rule Schemas ====================

class RuleConditions(BaseModel):
    """Flexible conditions for cleanup rules."""
    disk_space_threshold_percent: Optional[int] = Field(None, ge=0, le=100)
    not_watched_days: Optional[int] = Field(None, ge=0)
    min_age_days: Optional[int] = Field(None, ge=0)
    exclude_favorited: bool = True
    exclude_watched_within_days: Optional[int] = Field(None, ge=0)  # Exclude items watched within last X days
    series_delete_mode: SeriesDeleteMode = SeriesDeleteMode.EPISODE
    min_episodes_watched_percent: Optional[int] = Field(None, ge=0, le=100)
    exclude_genres: List[str] = []
    exclude_tags: List[str] = []
    include_tags: List[str] = []
    rating_below: Optional[float] = Field(None, ge=0, le=10)
    max_items_per_run: Optional[int] = Field(None, ge=1)
    # Additional options
    add_import_exclusion: bool = True  # Add to import exclusion list when deleting
    watched_progress_below: Optional[int] = Field(None, ge=0, le=100)  # Only delete if progress below X%
    exclude_recently_added_days: Optional[int] = Field(None, ge=0)  # Exclude recently added items


class CleanupRuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    is_enabled: bool = True
    priority: int = Field(default=0, ge=0, le=100)
    media_types: List[MediaType] = Field(..., min_length=1)  # Can target multiple types (movies + series + episodes)
    library_id: Optional[int] = None
    conditions: RuleConditions
    action: RuleActionType = RuleActionType.DELETE
    grace_period_days: int = Field(default=7, ge=0, le=365)


class CleanupRuleCreate(CleanupRuleBase):
    pass


class CleanupRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_enabled: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=0, le=100)
    media_types: Optional[List[MediaType]] = Field(None, min_length=1)
    library_id: Optional[int] = None
    conditions: Optional[RuleConditions] = None
    action: Optional[RuleActionType] = None
    grace_period_days: Optional[int] = Field(None, ge=0, le=365)


class CleanupRuleResponse(CleanupRuleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Notification Channel Schemas ====================

class WebhookConfig(BaseModel):
    url: str
    method: str = "POST"
    headers: Dict[str, str] = {}


class DiscordConfig(BaseModel):
    webhook_url: str


class AppriseConfig(BaseModel):
    urls: List[str]


class NotificationChannelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    notification_type: NotificationType
    is_enabled: bool = True
    config: Dict[str, Any]
    notify_on_flagged: bool = True
    notify_on_deleted: bool = True
    notify_on_error: bool = True


class NotificationChannelCreate(NotificationChannelBase):
    pass


class NotificationChannelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    notification_type: Optional[NotificationType] = None
    is_enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None
    notify_on_flagged: Optional[bool] = None
    notify_on_deleted: Optional[bool] = None
    notify_on_error: Optional[bool] = None


class NotificationChannelResponse(NotificationChannelBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Media Item Schemas ====================

class MediaItemResponse(BaseModel):
    id: int
    external_id: str
    service_connection_id: int
    title: str
    media_type: MediaType
    year: Optional[int] = None
    path: Optional[str] = None
    size_bytes: float = 0
    
    # Series specific
    series_id: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    
    # Watch status
    is_watched: bool = False
    last_watched_at: Optional[datetime] = None
    watch_count: int = 0
    progress_percent: float = 0
    
    # Metadata
    added_at: Optional[datetime] = None
    genres: List[str] = []
    tags: List[str] = []
    is_favorited: bool = False
    rating: Optional[float] = None
    
    # Cleanup status
    flagged_for_cleanup: bool = False
    flagged_at: Optional[datetime] = None
    scheduled_cleanup_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MediaItemFilter(BaseModel):
    media_type: Optional[MediaType] = None
    library_id: Optional[int] = None
    service_connection_id: Optional[int] = None
    is_watched: Optional[bool] = None
    flagged_for_cleanup: Optional[bool] = None
    search: Optional[str] = None


# ==================== Cleanup Log Schemas ====================

class CleanupLogResponse(BaseModel):
    id: int
    media_item_id: Optional[int] = None
    rule_id: Optional[int] = None
    action: str
    status: str
    details: Dict[str, Any] = {}
    error_message: Optional[str] = None
    media_title: Optional[str] = None
    media_path: Optional[str] = None
    media_size_bytes: float = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== System & Stats Schemas ====================

class DiskSpaceInfo(BaseModel):
    path: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    used_percent: float


class SystemStats(BaseModel):
    total_media_items: int
    total_movies: int
    total_series: int
    total_episodes: int
    flagged_items: int
    deleted_last_30_days: int
    space_freed_bytes: float
    disk_space: List[DiskSpaceInfo]


class HealthCheck(BaseModel):
    status: str
    version: str
    database: str
    scheduler: str


class SystemSettingResponse(BaseModel):
    key: str
    value: Any
    description: Optional[str] = None


class SystemSettingUpdate(BaseModel):
    value: Any
