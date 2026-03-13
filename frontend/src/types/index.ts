// API Types

export interface User {
  id: number
  username: string
  email: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string
  last_login: string | null
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface Session {
  id: number
  device_info: string | null
  ip_address: string | null
  created_at: string
  expires_at: string
  is_current: boolean
}

export type ServiceType = 'sonarr' | 'radarr' | 'emby' | 'jellyfin'
export type MediaType = 'movie' | 'series' | 'episode' | 'season'
export type RuleActionType = 'delete' | 'delete_and_unmonitor' | 'notify_only' | 'move_to_trash' | 'unmonitor'
export type NotificationType = 'webhook' | 'discord' | 'slack' | 'email' | 'apprise'
export type NotificationEventType = 
  | 'media_flagged' 
  | 'media_deleted' 
  | 'media_staged' 
  | 'media_restored' 
  | 'cleanup_started' 
  | 'cleanup_completed' 
  | 'sync_completed' 
  | 'error' 
  | 'test'
export type SeriesDeleteMode = 'episode' | 'season' | 'series'
export type SeriesEvaluationMode = 'whole_series' | 'season' | 'episode'
export type SeriesDeleteTarget = 'whole_series' | 'matched_season' | 'matched_episode' | 'previous_seasons' | 'following_seasons' | 'previous_episodes' | 'following_episodes' | 'unwatched_episodes_in_season' | 'unwatched_seasons'

export interface ServiceConnection {
  id: number
  name: string
  service_type: ServiceType
  url: string
  api_key: string
  is_enabled: boolean
  verify_ssl: boolean
  timeout: number
  created_at: string
  updated_at: string | null
  last_sync: string | null
}

export interface ServiceConnectionCreate {
  name: string
  service_type: ServiceType
  url: string
  api_key: string
  is_enabled?: boolean
  verify_ssl?: boolean
  timeout?: number
}

export interface Library {
  id: number
  name: string
  description: string | null
  media_type: MediaType
  path: string | null
  external_id: string
  service_connection_id: number
  is_enabled: boolean
  last_synced_at: string | null
  created_at: string
}

export interface RuleConditions {
  disk_space_threshold_percent?: number | null
  not_watched_days?: number | null
  min_age_days?: number | null
  exclude_favorited: boolean
  exclude_watched_within_days?: number | null  // Exclude items watched within last X days
  series_delete_mode?: SeriesDeleteMode  // Legacy field
  series_evaluation_mode?: SeriesEvaluationMode  // How to evaluate series
  series_delete_target?: SeriesDeleteTarget  // What to delete when matched
  min_episodes_watched_percent?: number | null
  exclude_genres: string[]
  exclude_tags: string[]
  include_tags: string[]
  rating_below?: number | null
  max_items_per_run?: number | null
  add_import_exclusion?: boolean  // Add to Import-Exclusion-List
  watched_progress_below?: number | null  // Only delete if progress below X%
  exclude_recently_added_days?: number | null  // Exclude recently added items
  // Phase 5: Smart Cleanup - Per-user conditions
  no_user_watched_days?: number | null  // Delete only if NO user watched in X days
  exclude_if_user_favorited?: number[]  // Never delete if these user IDs have it as favorite
  exclude_active_sessions?: boolean  // Never delete if any user is currently watching
  min_unique_viewers?: number | null  // Only delete if fewer than X unique viewers
}

export interface CleanupRule {
  id: number
  name: string
  description: string | null
  is_enabled: boolean
  priority: number
  media_types: MediaType[]  // Can target multiple types
  library_id: number | null
  conditions: RuleConditions
  action: RuleActionType
  grace_period_days: number
  created_at: string
  updated_at: string | null
}

export interface CleanupRuleCreate {
  name: string
  description?: string | null
  is_enabled?: boolean
  priority?: number
  media_types: MediaType[]  // Can target multiple types (movies + series + episodes)
  library_id?: number | null
  conditions: RuleConditions
  action?: RuleActionType
  grace_period_days?: number
}

export interface MediaItem {
  id: number
  emby_id: string | null
  sonarr_id: number | null
  radarr_id: number | null
  library_id: number
  title: string
  media_type: MediaType
  year: number | null
  path: string | null
  size_bytes: number | null
  is_watched: boolean
  is_favorite: boolean
  last_watched: string | null
  play_count: number
  added_at: string | null
  genres: string[]
  tags: string[]
  marked_for_deletion: boolean
  deletion_date: string | null
}

export interface NotificationChannel {
  id: number
  name: string
  notification_type: NotificationType
  is_enabled: boolean
  webhook_url: string | null
  config: Record<string, unknown>
  notify_on_deleted: boolean
  notify_on_flagged: boolean
  notify_on_error: boolean
  // New template and retry fields
  event_types: NotificationEventType[] | null
  title_template: string | null
  message_template: string | null
  max_retries: number
  retry_backoff_base: number
  created_at: string
  updated_at: string | null
}

export interface NotificationChannelCreate {
  name: string
  notification_type: NotificationType
  is_enabled?: boolean
  webhook_url?: string | null
  config?: Record<string, unknown>
  notify_on_deleted?: boolean
  notify_on_flagged?: boolean
  notify_on_error?: boolean
  // New template and retry fields
  event_types?: NotificationEventType[] | null
  title_template?: string | null
  message_template?: string | null
  max_retries?: number
  retry_backoff_base?: number
}

export interface EventTypeInfo {
  value: NotificationEventType
  name: string
  default_title: string
  default_message: string
}

export interface TemplatePreviewRequest {
  title_template?: string | null
  message_template?: string | null
  event_type?: string
}

export interface TemplatePreviewResponse {
  rendered_title: string
  rendered_message: string
}

export interface CleanupLog {
  id: number
  media_item_id: number | null
  rule_id: number | null
  action: string
  status: string
  details: Record<string, unknown>
  error_message: string | null
  media_title: string | null
  media_path: string | null
  media_size_bytes: number
  created_at: string
}

export interface DiskSpaceInfo {
  path: string
  total_bytes: number
  used_bytes: number
  free_bytes: number
  used_percent: number
}

export interface SystemStats {
  total_media_items: number
  total_movies: number
  total_series: number
  total_episodes: number
  flagged_items: number
  deleted_last_30_days: number
  space_freed_bytes: number
  disk_space: DiskSpaceInfo[]
}

export interface HealthCheck {
  status: string
  version: string
  database: string
  scheduler: string
}

export interface MediaStats {
  total_items: number
  movies: number
  series: number
  episodes: number
  flagged_items: number
  total_size_bytes: number
  flagged_size_bytes: number
  service_breakdown: ServiceBreakdown[]
}

export interface ServiceBreakdown {
  service_id: number
  service_name: string
  service_type: ServiceType
  total_items: number
  movies: number
  series: number
  episodes: number
  last_sync: string | null
}

export interface RuleTemplate {
  name: string
  description: string
  media_types: MediaType[]  // Templates can also target multiple types
  conditions: Partial<RuleConditions>
  action: RuleActionType
  grace_period_days: number
}

export interface SystemSettings {
  id: number
  cleanup_enabled: boolean
  cleanup_schedule: string
  sync_schedule: string
  dry_run_mode: boolean
  default_grace_period_days: number
  max_deletions_per_run: number
}

export interface SystemSettingsUpdate {
  cleanup_enabled?: boolean
  cleanup_schedule?: string
  sync_schedule?: string
  dry_run_mode?: boolean
  default_grace_period_days?: number
  max_deletions_per_run?: number
}

export interface SeriesOption {
  value: string
  label: string
  description: string
}

export interface SeriesOptionsResponse {
  evaluation_modes: SeriesOption[]
  delete_targets: SeriesOption[]
}
