# Planned Features - MediaCurator

This document describes the planned statistics and analytics features for MediaCurator. These features will provide deep insights into media consumption patterns and enable smarter cleanup decisions.

---

## Table of Contents

1. [Library Detail View](#library-detail-view)
2. [Users Page](#users-page)
3. [User Detail View](#user-detail-view)
4. [Global Activity Log](#global-activity-log)
5. [Statistics Dashboard](#statistics-dashboard)
6. [Advanced Analytics](#advanced-analytics)
7. [Smart Cleanup Rules](#smart-cleanup-rules)

---

## Library Detail View

Click on any library to see detailed statistics and content.

### Overview Tab
- **Time-based Stats**: Play counts and duration for Last 24 Hours, Last 7 Days, Last 30 Days, and All Time
- **Genre Distribution**: Radar charts showing which genres are watched most (by duration and by play count)
- **Recently Added**: Carousel/grid of recently added content with poster images
- **Last Watched**: Recently watched content in this library with user attribution

### Media Tab
- **Content Browser**: Grid view of all media items with poster images ✅ Grid View with Poster Proxy (Session 10)
- **File Size Display**: Show file size on each item (e.g., "16.24 GB") ✅
- **Sorting Options**: Sort by title, date added, size, play count ✅
- **Filtering**: Filter by genre, year, rating, watched status

### Activity Tab
- **Library Activity Log**: All playback sessions for this library
- **Columns**: User, IP Address, Title, Client, Transcode status, Device, Date, Total Playback
- **Filtering**: Filter by type (movie/episode), search by title
- **Pagination**: Handle large activity logs efficiently

---

## Users Page

Overview of all Emby/Jellyfin users synced to MediaCurator.

### User List
| Column | Description |
|--------|-------------|
| User | Username with avatar |
| Tracked | Whether user is being tracked (checkmark) |
| Last Watched | Title of the last watched content |
| Last Client | Client app and device used (e.g., "Emby for iOS - iPhone") |
| Plays | Total play count across all time |
| Watch Time | Total watch duration (e.g., "9 Hours 33 Minutes") |
| Last Seen | When the user was last active (e.g., "8 Days 20 Hour 58 Minutes ago") |

### Features
- **Search**: Search users by name
- **Pagination**: Handle many users
- **Click to Detail**: Click on any user to see their detail view

---

## User Detail View

Detailed statistics and activity for a single user.

### Overview Tab
- **User Stats Box**: Play counts and watch time for Last 24 Hours, Last 7 Days, Last 30 Days, All Time
- **Last Watched**: Grid of recently watched content by this user
- **Favorite Genres**: What genres this user prefers (derived from watch history) ✅ BarChart (Session 9)

### Activity Tab
- **Item Activity**: Complete playback history for this user
- **Columns**: IP Address, Title, Client, Transcode, Device, Date, Total Playback
- **Library Filter**: Filter activity by library ✅
- **Type Filter**: Filter by movie/series ✅ (Session 10)
- **Search**: Search within activity ✅ (Session 10)

### Timeline Tab ✅ Implemented (Session 10)
- **Visual Timeline**: Chronological view of user's watch activity ✅ Calendar Heatmap (90 days)
- **Library Filter**: Show only specific libraries ✅
- **Date Range**: Filter by date range
- **Session Grouping**: Group consecutive plays into sessions ✅ 30-min gap detection

---

## Global Activity Log

Server-wide activity feed showing all playback across all users.

### Activity Table
| Column | Description |
|--------|-------------|
| User | Which user is watching |
| IP Address | Client IP address |
| Title | Movie title or "Series : S01E05 - Episode Title" |
| Client | App name (e.g., "Emby for Samsung", "Emby Web") |
| Transcode | Direct Stream, Transcode (Video), Transcode (Audio), or both |
| Device | Device name (e.g., "Samsung Smart TV", "Firefox", "iPhone") |
| Date | Timestamp of playback start |
| Total Playback | Duration of the playback session |

### Filters
- **Libraries**: Filter by specific library
- **Type**: All, Movies, Series, Music, etc.
- **Items per page**: 10, 25, 50, 100
- **Search**: Search by title, user, or device

### Expand Row ✅ Implemented (Session 6)
- Click to expand a row for more details:
  - ~~Full file path~~
  - ~~Bitrate information~~
  - ~~Resolution~~
  - ~~Audio/video codecs~~
  - ~~Subtitle information~~
  - IP Address, Device, Play Method (color-coded), Progress Bar
  - Implemented on: Activity, UserDetail, LibraryDetail, Preview (season breakdown)

---

## Statistics Dashboard

Visual charts and graphs for understanding viewing patterns.

### Daily Play Count Chart
- **Stacked Area Chart**: Shows daily play counts over configurable time range
- **Per-Library Breakdown**: Different color for each library
- **Toggle**: Switch between Count (plays) and Duration (watch time)
- **Time Range**: Last 7, 14, 20, 30, 60, 90 days

### Play Count By Day of Week
- **Bar Chart**: Which days of the week are most active
- **Per-Library Breakdown**: Stacked by library
- **Shows**: Sunday through Saturday activity patterns

### Play Count By Hour
- **Bar Chart**: Which hours of the day are most active
- **24-Hour View**: 00:00 to 23:00
- **Per-Library Breakdown**: See what's watched when
- **Peak Identification**: Easily spot prime-time hours

### Genre Distribution ✅ Implemented (Session 9)
- **Radar/Spider Chart**: Visual representation of genre preferences ✅ RadarChart on Activity page
- **Two Views**: By Duration (total watch time) and By Play Count ✅ Radar (plays) + Bar (watch time hours)
- **Library-Specific**: Can be global or per-library ✅ Filterable by library_id and user_id

---

## Advanced Analytics

Deeper insights derived from watch data.

### User Activity Timeline ✅ Implemented (Session 10)
**Purpose**: Visualize when each user watches content over time.

- Calendar heatmap showing activity intensity ✅ 90-day GitHub-style heatmap
- Hour-by-day grid showing viewing patterns
- Identify each user's "watch schedule" ✅ Session grouping with 30-min gap

### Watch Patterns / Heatmap ✅ Implemented (Session 9)
**Purpose**: Understand peak viewing times across all users.

- 7x24 grid (days x hours) with color intensity ✅ CSS Grid on Activity page
- Identify server load patterns ✅
- Plan maintenance windows during low-activity periods ✅
- See if weekends differ from weekdays ✅

### Concurrent Streams Analysis
**Purpose**: Track how many simultaneous streams occur.

- Historical peak concurrent users
- Time of day with most concurrent streams
- Useful for:
  - Server capacity planning
  - Transcode load understanding
  - License/limit management

### Watch Duration Stats
**Purpose**: Understand typical viewing sessions.

- Average session length (overall and per library)
- Distribution chart of session lengths
- Compare movies vs. series session lengths
- Identify "quick check" vs. "full watch" patterns

### Completion Rate Analytics
**Purpose**: Track how often content is finished.

- Percentage of movies watched to completion (>90%)
- Series episode completion rates
- Identify content that users abandon early
- Useful for cleanup decisions: "Content rarely finished"

### Binge-Watch Detection
**Purpose**: Identify when users watch multiple episodes consecutively.

- Detect 3+ episodes of same series in one session
- Track which series trigger binge behavior
- User-specific binge patterns
- Useful for:
  - Understanding engagement
  - Cleanup rules: "Series being binged should not be deleted"

### Shared vs. Solo Content
**Purpose**: Identify content watched by multiple users vs. single users.

- **Shared Content**: Watched by 2+ unique users
- **Solo Content**: Only watched by 1 user
- **Unwatched**: Not watched by anyone
- Useful for cleanup:
  - Keep shared content longer
  - Solo content can be cleaned up sooner
  - Unwatched content is priority for cleanup

---

## Smart Cleanup Rules

New rule conditions enabled by user tracking.

### Cleanup Rules per User
**Condition**: "Delete only if NO user has watched in X days"

Instead of relying on global "last watched" from Emby, check each user's watch history individually.

**Use Cases**:
- Family server: Keep content if any family member watched recently
- Multi-user: Don't delete shared favorites
- Fair cleanup: Account for all users, not just the last one

**Example Rule**:
```
Delete movie if:
  - No user has watched in 90 days
  - AND file size > 10 GB
  - AND rating < 7.0
```

### User-Specific Exclusions
**Condition**: "Never delete if User X has it as favorite"

**Use Cases**:
- Protect content for specific users (e.g., kids' content)
- VIP users whose favorites are always kept
- Admin override for important content

### Currently Watching Detection (Enhanced)
**Condition**: "Never delete if any user is currently in the middle of watching"

**Improvements**:
- Track per-user watch progress
- Detect active binge sessions
- Protect entire series if someone is actively watching

---

## Implementation Priority

### Phase 1 - Foundation ✅
- [x] MediaServerUser model
- [x] UserWatchHistory model
- [x] Basic user stats on Dashboard
- [x] Library stats API
- [x] PlaybackActivity model

### Phase 2 - Views & Navigation ✅
- [x] Library Detail View (Overview, Media, Activity tabs)
- [x] Users Page (list with stats)
- [x] User Detail View (Overview, Activity, Timeline tabs)
- [x] Global Activity Log
- [x] Activity stats API (plays by day/hour/week)
- [x] Active sessions tracking
- [x] Library filter on Activity page
- [x] Library filter on User Detail activity tab
- [x] Items-per-page selector on Activity page
- [x] ResponsiveTable on all pages (History, Users, Activity, UserDetail, Staging, Jobs, LibraryDetail, Preview)
- [x] Expand-Row on Activity, UserDetail, LibraryDetail (IP, Device, Play Method, Progress)
- [x] ConfirmDialog accessibility (aria-modal, focus trap, escape key)
- [x] User Timeline Tab (calendar heatmap + session grouping) (Session 10)
- [x] Image Proxy endpoint (poster images from Emby/Jellyfin) (Session 10)
- [x] LibraryDetail Grid View with poster images (Session 10)
- [x] UserDetail Activity type filter + search (Session 10)

### Phase 3 - Statistics & Charts ✅ Complete (Session 4+9)
- [x] Daily Play Count Chart (Activity page + Dashboard)
- [x] Play Count by Day of Week Chart (Activity page + Dashboard)
- [x] Play Count by Hour Chart (Activity page + Dashboard)
- [x] Genre Distribution Charts – Backend `/activity/genre-stats` + RadarChart (Activity) + BarChart (Dashboard, LibraryDetail, UserDetail) (Session 9)
- [x] Watch Patterns Heatmap – Backend `/activity/watch-heatmap` + CSS Grid 7×24 (Activity) (Session 9)

### Phase 4 - Advanced Analytics
- [ ] Concurrent Streams Analysis
- [ ] Completion Rate Analytics
- [ ] Binge-Watch Detection
- [ ] Shared vs. Solo Content Analysis

### Phase 5 - Smart Cleanup Integration
- [ ] Cleanup Rules per User condition
- [ ] User-Specific Exclusions
- [ ] Enhanced Currently Watching detection
- [ ] Analytics-based cleanup suggestions

### Security Hardening ✅ Complete (Session 7+8)
- [x] httpOnly Cookie Auth (JWT aus localStorage entfernt, ADR-001)
- [x] CSRF Double-Submit Cookie Protection
- [x] Security Headers Middleware (CSP, X-Frame-Options, X-Content-Type-Options)
- [x] Structured Security Event Logging
- [x] SSRF-safe URL Validation (outbound requests)
- [x] Account Lockout Mechanism
- [x] Refresh Token Rotation
- [x] WebSocket Authentication (short-lived token)
- [x] CORS Lockdown (wildcard warning in production)
- [x] Admin-Only Routes (Rules, Jobs, Staging, Services, Notifications, System)
- [x] Input Sanitization (escape_like for SQL queries)
- [x] Outbound URL Validation (Services, Notifications, Setup)
- [x] Staging Path Validation
- [x] Request Body Size Limit
- [x] WebSocket Connection Limits per IP
- [x] Sensitive Config Masking (API keys, secrets)
- [x] Password Complexity Enforcement
- [x] Secret Key Enforcement
- [x] Audit Log Data Retention Job
- [x] Refresh Token Cleanup Job
- [x] Trusted Proxy Configuration
- [x] CI/CD: Tests + Security Scanning Workflows
- [x] Pytest Setup with Smoke Tests
- [x] Dependabot Configuration
- [x] datetime.utcnow() → timezone-aware datetime.now(timezone.utc)

---

## Data Requirements

To enable these features, the following data needs to be tracked:

### From Emby/Jellyfin Sync
- User list with IDs and names
- Per-user watch history (what, when, how long)
- Playback sessions (client, device, IP, transcode info)
- Current playback position (for in-progress detection)

### Derived/Calculated
- Total watch time per user
- Total watch time per library
- Genre preferences per user
- Session detection (grouping consecutive plays)
- Concurrent stream peaks

### Storage Considerations
- ~~Activity logs can grow large - implement retention policies~~ ✅ Implemented (Session 7: Audit Log Data Retention Job)
- Consider aggregating old data (daily summaries instead of individual events)
- Provide cleanup options for activity history

---

---

## Implementation History

| Phase | Feature | Session | Status |
|-------|---------|---------|--------|
| 1 | All Foundation models & APIs | Session 1 | ✅ |
| 2 | Library Detail, Users, Activity pages | Session 1-2 | ✅ |
| 2 | WebSocket Real-Time System | Session 2 | ✅ |
| 2 | Setup Wizard | Session 2 | ✅ |
| 2 | Bug fixes (Light-mode, API paths, etc.) | Session 3 | ✅ |
| 2 | ResponsiveTable migrations | Session 4 | ✅ |
| 3 | recharts charts on Activity page | Session 4 | ✅ |
| 2 | Library filter on Activity & UserDetail | Session 5 | ✅ |
| 2 | Items-per-page on Activity | Session 5 | ✅ |
| 2 | LibraryDetail ResponsiveTable migration | Session 5 | ✅ |
| 3 | Dashboard recharts charts | Session 5 | ✅ |
| 4 | Code-splitting with React.lazy | Session 4 | ✅ |
| 2 | Preview.tsx ResponsiveTable migration | Session 6 | ✅ |
| 2 | Expand-Row (Activity, UserDetail, LibraryDetail) | Session 6 | ✅ |
| 2 | ConfirmDialog accessibility (focus trap, aria-modal) | Session 6 | ✅ |
| - | BUG-011: position_ticks int32→BigInteger | Session 6 | ✅ |
| - | BUG-012: Radarr folder→file path (movie stats) | Session 6 | ✅ |
| - | BUG-013: User Last Seen/Watched/Client fallback | Session 6 | ✅ |
| Sec | CORS Lockdown, Secret Key Enforcement, API Key Masking | Session 7 | ✅ |
| Sec | Security Headers Middleware (CSP, X-Frame-Options) | Session 7 | ✅ |
| Sec | Account Lockout + Refresh Token Rotation | Session 7 | ✅ |
| Sec | WebSocket Auth Token + Frontend Auth Rotation | Session 7 | ✅ |
| Sec | Trusted Proxy Config + Rate Limit Improvements | Session 7 | ✅ |
| Sec | Staging Path Validation + Rule Import Size Limit | Session 7 | ✅ |
| Sec | Audit Log Data Retention Job | Session 7 | ✅ |
| Sec | datetime.utcnow() → timezone-aware | Session 7 | ✅ |
| Sec | httpOnly Cookie Auth Migration (ADR-001) | Session 8 | ✅ |
| Sec | CSRF Double-Submit Cookie Middleware | Session 8 | ✅ |
| Sec | Security Event Logging (structured JSON) | Session 8 | ✅ |
| Sec | SSRF-safe URL Validation | Session 8 | ✅ |
| Sec | SQL Injection Protection (escape_like) | Session 8 | ✅ |
| Sec | Content-Security-Policy Header | Session 8 | ✅ |
| Sec | WebSocket Connection Limits per IP | Session 8 | ✅ |
| Sec | Admin-Only Routes (all sensitive endpoints) | Session 8 | ✅ |
| Sec | Outbound URL Validation (SSRF) on all endpoints | Session 8 | ✅ |
| Sec | Body Size Limit + Rate Limiting on all Routes | Session 8 | ✅ |
| Sec | Refresh Token Cleanup Job | Session 8 | ✅ |
| Sec | Password Complexity + Input Validation | Session 8 | ✅ |
| CI | GitHub Actions: tests.yml + security-scan.yml | Session 8 | ✅ |
| CI | Pytest Setup + Smoke Test | Session 8 | ✅ |
| CI | Dependabot Configuration | Session 8 | ✅ |
| 3 | Genre Distribution API (`/activity/genre-stats`) | Session 9 | ✅ |
| 4 | Watch Patterns Heatmap API (`/activity/watch-heatmap`) | Session 9 | ✅ |
| 3 | Genre RadarChart on Activity page | Session 9 | ✅ |
| 4 | Watch Heatmap (7×24 CSS Grid) on Activity page | Session 9 | ✅ |
| 3 | Genre Charts on LibraryDetail (Radar + Bar) | Session 9 | ✅ |
| 2 | Favorite Genres BarChart on UserDetail | Session 9 | ✅ |
| 3 | Genre Distribution BarChart on Dashboard | Session 9 | ✅ |
| 2 | User Timeline API (`/users/{id}/timeline`) | Session 10 | ✅ |
| 2 | Image Proxy API (`/media/{id}/image`) | Session 10 | ✅ |
| 2 | User Timeline Tab (Calendar Heatmap + Sessions) | Session 10 | ✅ |
| 2 | LibraryDetail Grid View with Poster Images | Session 10 | ✅ |
| 2 | UserDetail Activity Type Filter + Search | Session 10 | ✅ |

---

*This document will be updated as features are implemented and new ideas emerge.*
