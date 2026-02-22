# MediaCurator - Development Status & Handoff Document

> **Zweck**: Dieses Dokument dient als fortlaufender Stand für die Weiterentwicklung. Es kann in jedem neuen Chat/auf jedem Rechner als Kontext übergeben werden, damit der Assistent sofort weiß, wo es weitergeht.

**Letzte Aktualisierung**: 22. Februar 2026 (Session 6)
**Branch**: `feature/phase2-enhancements-and-docs` (von `develop`)
**Letzter Commit**: `ea6e64c` (Session 6)
**Version**: `vdev.0.0.147`
**Repo**: `https://github.com/Serph91P/MediaCurator.git`

---

## Inhaltsverzeichnis

1. [Projekt-Übersicht](#projekt-übersicht)
2. [Tech-Stack](#tech-stack)
3. [Architektur-Überblick](#architektur-überblick)
4. [Implementierungsstatus nach Phasen](#implementierungsstatus-nach-phasen)
5. [Bekannte Bugs (priorisiert)](#bekannte-bugs-priorisiert)
6. [UX/UI-Probleme](#uxui-probleme)
7. [Code-Qualitätsprobleme](#code-qualitätsprobleme)
8. [Was gut funktioniert](#was-gut-funktioniert)
9. [Nächste Schritte (priorisiert)](#nächste-schritte-priorisiert)
10. [Dateistruktur-Referenz](#dateistruktur-referenz)
11. [Entwicklungsumgebung starten](#entwicklungsumgebung-starten)
12. [Änderungshistorie dieses Dokuments](#änderungshistorie-dieses-dokuments)

---

## Projekt-Übersicht

MediaCurator ist ein Self-Hosted Media Management Tool das mit Emby/Jellyfin (Media Server) und Sonarr/Radarr (Download Manager) zusammenarbeitet. Es bietet:

- **Automatische Cleanup-Regeln**: Ungesehene/alte/schlecht bewertete Medien erkennen und löschen
- **Staging-System**: Soft-Delete mit Grace Period – Dateien werden in eine Staging-Library verschoben, bevor sie permanent gelöscht werden
- **User-Tracking**: Watch-History pro User synced von Emby
- **Activity-Monitoring**: Aktive Sessions, Playback-History
- **Notifications**: Apprise-basiert (Discord, Slack, Webhook, etc.)
- **Dashboard**: Statistiken, Most Viewed/Popular, Library-Übersicht

---

## Tech-Stack

### Backend
| Komponente | Technologie | Version |
|-----------|------------|---------|
| Framework | FastAPI | aktuell |
| ORM | SQLAlchemy (async) | aktuell |
| DB | SQLite (default) / PostgreSQL | |
| Scheduler | APScheduler | |
| HTTP Client | httpx (async) | |
| Auth | JWT (access + refresh tokens) | |

### Frontend
| Komponente | Technologie | Version |
|-----------|------------|---------|
| Framework | React | 19.2 |
| Language | TypeScript | 5.3 |
| Bundler | Vite | 7.3 |
| Styling | Tailwind CSS | 4.x (CSS-first @theme) |
| Server State | TanStack React Query | 5.x |
| Client State | Zustand (persist) | 5 |
| Forms | react-hook-form | 7.49 |
| Charts | recharts | 3.7 (**in Benutzung**: Activity + Dashboard Charts) |
| HTTP | Axios (mit Interceptor-Refresh) | 1.6 |
| Toasts | react-hot-toast | 2.4 |

---

## Architektur-Überblick

### Backend-Struktur
```
backend/app/
├── main.py                    # FastAPI App, CORS, Router-Mounting, WebSocket Endpoint
├── scheduler.py               # APScheduler Jobs (Sync, Cleanup, Staging) + WebSocket-Broadcast
├── core/
│   ├── config.py              # Pydantic Settings
│   ├── database.py            # SQLAlchemy async engine/session
│   ├── migrations.py          # DB-Migrationen (Alembic-like, manuell)
│   ├── rate_limit.py          # Rate Limiting
│   ├── security.py            # JWT, Password Hashing
│   └── websocket.py           # ★ NEU: ConnectionManager für Real-Time Job-Broadcasting
├── models/database.py         # ALLE SQLAlchemy Models (656 Zeilen)
├── schemas/__init__.py        # ALLE Pydantic Schemas
├── services/
│   ├── base.py                # BaseServiceClient (abstrakt, httpx)
│   ├── emby.py                # EmbyClient + EmbyService (Caching, Sync)
│   ├── radarr.py              # RadarrClient (API v3)
│   ├── sonarr.py              # SonarrClient (API v3)
│   ├── sync.py                # Haupt-Sync-Logik (Emby→DB, Sonarr→DB, Radarr→DB)
│   ├── cleanup_engine.py      # Rule-Evaluation + Execution
│   ├── staging.py             # Soft-Delete-System
│   ├── notifications.py       # Multi-Channel mit Templates
│   ├── audit.py               # Audit-Logging
│   └── version.py             # Git/GitHub Version-Check
└── api/routes/
    ├── activity.py            # GET /activity/, /stats, /active
    ├── audit.py               # GET/DELETE /audit/logs, /recent, etc.
    ├── auth.py                # POST /auth/login, /register, /refresh, etc.
    ├── jobs.py                # GET/POST /jobs/, trigger, interval
    ├── libraries.py           # GET /libraries/, /stats, /{id}/details, /media, /activity
    ├── media.py               # GET /media/stats, /dashboard-stats, /watch-stats, /audit-log
    ├── notifications.py       # CRUD /notifications/, test, preview-template
    ├── rules.py               # CRUD /rules/, templates, export/import, bulk
    ├── services.py            # CRUD /services/, test, sync
    ├── staging.py             # GET/POST /staging/, restore, delete, settings
    ├── setup.py               # ★ NEU: GET /setup/status, POST /test-connection, /add-service, /complete, /skip
    ├── system.py              # GET /system/health, /stats, /settings, cleanup/preview
    └── users.py               # GET /users/, /{id}, /{id}/activity, PATCH hide
```

### Frontend-Struktur
```
frontend/src/
├── App.tsx                    # Routes (15 protected + Login/Register/Setup) + SetupGate
├── main.tsx                   # React Entry, QueryClient, Toaster
├── index.css                  # Tailwind @theme (dark-* + primary-* Palette)
├── components/
│   ├── Layout.tsx             # Sidebar, Header, Version-Check, Theme-Toggle, ★ Job-Badge
│   ├── ConfirmDialog.tsx      # Modal (danger/warning/info)
│   ├── ResponsiveTable.tsx    # Table → Cards auf Mobile
│   └── Skeleton.tsx           # Loading-Skeletons
├── hooks/
│   ├── useDebounce.ts         # Generischer Debounce-Hook
│   └── useJobWebSocket.ts     # ★ NEU: Globaler WebSocket-Hook (Auto-Reconnect, Toasts)
├── lib/
│   ├── api.ts                 # Axios mit Token-Refresh-Interceptor
│   └── utils.ts               # formatBytes, formatRelativeTime, formatDate, etc.
├── stores/
│   ├── auth.ts                # Zustand: Login/Logout/Sessions
│   ├── jobs.ts                # ★ NEU: Zustand: WebSocket Job-State (runningJobs, recentCompletions)
│   └── theme.ts               # Zustand: light/dark/system
├── types/index.ts             # TypeScript Interfaces
└── pages/
    ├── Dashboard.tsx           # Stats, Most Viewed/Popular, Libraries, Disk
    ├── Libraries.tsx           # Library-Grid mit Stats, Sync
    ├── LibraryDetail.tsx       # 3 Tabs: Overview, Media, Activity  ⚠️ BUGGY
    ├── Users.tsx               # User-Tabelle mit Stats
    ├── UserDetail.tsx          # 2 Tabs: Overview, Activity
    ├── Activity.tsx            # Active Sessions + Activity-Log
    ├── History.tsx             # Cleanup-Audit-Log
    ├── Jobs.tsx                # ★ REWRITE: Live-Progress-Bars, WebSocket-Status, Running-Panel
    ├── SetupWizard.tsx         # ★ NEU: Geführter 5-Step Setup-Wizard
    ├── Rules.tsx               # CRUD + Templates + Export/Import
    ├── Services.tsx            # Service-Connections CRUD
    ├── Settings.tsx            # System-Settings, Password, Cache
    ├── Staging.tsx             # Staged Items + Library-Settings
    ├── Notifications.tsx       # Channels CRUD + Template-Editor
    ├── Preview.tsx             # Cleanup Dry-Run Preview
    ├── Login.tsx               # Auth
    └── Register.tsx            # Erstbenutzer-Setup
```

### Datenbank-Models (Wichtigste)
| Model | Tabelle | Beschreibung |
|-------|---------|-------------|
| User | users | App-Benutzer (Admin-Login) |
| RefreshToken | refresh_tokens | JWT Refresh Tokens mit Device-Info |
| ServiceConnection | service_connections | Sonarr/Radarr/Emby/Jellyfin Verbindungen |
| Library | libraries | Synchronisierte Bibliotheken mit Staging-Config |
| MediaItem | media_items | Alle Medien (Filme, Serien, Episoden) mit Watch-Status |
| CleanupRule | cleanup_rules | Regelwerk mit JSON-Conditions |
| MediaServerUser | media_server_users | Emby/Jellyfin-Benutzer |
| UserWatchHistory | user_watch_history | Watch-History pro User pro Item |
| PlaybackActivity | playback_activities | Playback-Sessions mit Client/Device/Transcode |
| CleanupLog | cleanup_logs | Cleanup-Audit-Trail |
| NotificationChannel | notification_channels | Notification-Konfigurationen |
| JobExecutionLog | job_execution_logs | Scheduler-Job-History |
| ImportStats | import_stats | Sync-Statistiken |
| AuditLog | audit_logs | Admin-Action-Audit |
| SystemSettings | system_settings | Key-Value Settings |

---

## Implementierungsstatus nach Phasen

> Referenz: `PLANNED_FEATURES.md`

### Phase 1 – Foundation ✅ ERLEDIGT
- [x] MediaServerUser model
- [x] UserWatchHistory model
- [x] PlaybackActivity model
- [x] Basic user stats on Dashboard
- [x] Library stats API

### Phase 2 – Views & Navigation ✅ WEITGEHEND ERLEDIGT
| Feature | Backend | Frontend | Qualität | Anmerkungen |
|---------|---------|----------|----------|-------------|
| Library Detail – Overview Tab | ✅ API liefert 24h/7d/30d Stats | ✅ Dargestellt | ✅ | Kein Genre-Chart, keine Poster-Bilder |
| Library Detail – Media Tab | ✅ Sortierung, Suche, Pagination | ✅ ResponsiveTable | ✅ | Migriert auf ResponsiveTable (Session 5) |
| Library Detail – Activity Tab | ✅ Pagination | ✅ ResponsiveTable | ✅ | Migriert auf ResponsiveTable (Session 5) |
| Users Page | ✅ Pagination, Search | ✅ ResponsiveTable | ✅ | Gut implementiert |
| User Detail – Overview | ✅ Time-based Stats | ✅ | ⚠️ | Kein Favorite Genres |
| User Detail – Activity | ✅ Filters + Library-Filter | ✅ Tabelle + Library-Filter | ✅ | Library-Filter hinzugefügt (Session 5) |
| User Detail – Timeline Tab | ❌ Kein API | ❌ | ❌ | Nicht implementiert |
| Global Activity Log | ✅ Stats + Active Sessions | ✅ | ✅ | Library-Filter + Items-per-Page hinzugefügt (Session 5) |
| Activity Stats API | ✅ plays by day/hour/weekday | ✅ Charts | ✅ | recharts Charts auf Activity + Dashboard (Session 4+5) |
| Active Sessions | ✅ 30s Sync | ✅ 30s Refresh | ✅ | Gut implementiert |

### Phase 3 – Statistics & Charts ⚠️ TEILWEISE ERLEDIGT (Session 4)
| Feature | Backend-API | Frontend | Anmerkungen |
|---------|------------|----------|-------------|
| Daily Play Count Chart (Area) | ✅ `/activity/stats` liefert `plays_by_day` | ✅ Activity.tsx | recharts AreaChart mit Gradient |
| Play Count by Day of Week (Bar) | ✅ `/activity/stats` liefert `plays_by_day_of_week` | ✅ Activity.tsx | recharts BarChart |
| Play Count by Hour (Bar) | ✅ `/activity/stats` liefert `plays_by_hour` | ✅ Activity.tsx | recharts BarChart mit AM/PM Labels |
| Genre Distribution (Radar/Spider) | ❌ Kein API | ❌ | Backend müsste Genre-Aggregation liefern |

### ★ NEU: WebSocket Real-Time System ✅ ERLEDIGT (Session 2)
| Feature | Backend | Frontend | Qualität | Anmerkungen |
|---------|---------|----------|----------|-------------|
| ConnectionManager | ✅ `core/websocket.py` | — | ✅ | Broadcast, job_started/progress/completed Events |
| WebSocket Endpoint | ✅ `/api/ws/jobs` in main.py | — | ✅ | Ping/Pong Support |
| Progress Callbacks | ✅ sync.py (alle 3 Services) | — | ✅ | Sonarr: je 5 Serien, Radarr: je 10 Filme, Emby: 6 Phasen |
| Scheduler Integration | ✅ Alle 5 Job-Funktionen | — | ✅ | started/progress/completed Events |
| Global WebSocket Hook | — | ✅ `useJobWebSocket.ts` | ✅ | Auto-Reconnect (exp. Backoff), 30s Ping |
| Toast Notifications | — | ✅ In Layout.tsx (global) | ✅ | Started/Completed/Failed Toasts auf jeder Seite |
| Zustand Job Store | — | ✅ `stores/jobs.ts` | ✅ | runningJobs Map, wsStatus, recentCompletions |
| Jobs Page Rewrite | — | ✅ `Jobs.tsx` (~650 Zeilen) | ✅ | Live Progress-Bars, Running-Panel, ElapsedTime, WS-Indikator |
| Layout Job Badge | — | ✅ `Layout.tsx` | ✅ | Animierter blauer Badge mit laufenden Jobs Count |

### ★ NEU: Setup Wizard ✅ ERLEDIGT (Session 2)
| Feature | Backend | Frontend | Qualität | Anmerkungen |
|---------|---------|----------|----------|-------------|
| Setup Status API | ✅ `GET /setup/status` | — | ✅ | Prüft Services + SystemSettings, kein Auth nötig |
| Test Connection | ✅ `POST /setup/test-connection` | — | ✅ | Temporäre Verbindung testen ohne Speichern |
| Add Service | ✅ `POST /setup/add-service` | — | ✅ | Im Wizard-Kontext |
| Complete/Skip | ✅ `POST /setup/complete`, `/skip` | — | ✅ | Validierung: min. 1 Arr + 1 Media Server |
| Wizard UI | — | ✅ `SetupWizard.tsx` (~550 Zeilen) | ✅ | 5-Step: Welcome→Arr→MediaServer→Sync→Complete |
| Setup Gate | — | ✅ `App.tsx` SetupGate | ✅ | Redirect nach /setup wenn nicht abgeschlossen |
| Service Order | — | ✅ | ✅ | Erzwingt Sonarr/Radarr vor Emby/Jellyfin |
| Initial Sync | — | ✅ | ✅ | Sequentieller Sync aller Services mit Status-Anzeige |
| Skip Option | — | ✅ | ✅ | Setup überspringen möglich |

### Phase 4 – Advanced Analytics ❌ NICHT BEGONNEN
- [ ] User Activity Timeline / Calendar Heatmap
- [ ] Watch Patterns Heatmap (7x24 Grid)
- [ ] Concurrent Streams Analysis
- [ ] Watch Duration Stats
- [ ] Completion Rate Analytics
- [ ] Binge-Watch Detection
- [ ] Shared vs. Solo Content Analysis

### Phase 5 – Smart Cleanup Integration ❌ NICHT BEGONNEN
- [ ] Cleanup Rules per User ("Delete only if NO user watched in X days")
- [ ] User-Specific Exclusions ("Never delete if User X has favorite")
- [ ] Enhanced Currently Watching Detection
- [ ] Analytics-based Cleanup Suggestions

---

## Bekannte Bugs (priorisiert)

### 🔴 CRITICAL

#### BUG-011: PlaybackActivity – position_ticks/runtime_ticks Integer Overflow
- **Datei**: `backend/app/models/database.py`, `backend/app/services/sync.py`
- **Problem**: `position_ticks` und `runtime_ticks` waren `Integer` (int32, max ~2.1B), aber Emby liefert Tick-Werte >int32 (z.B. `70223183889`). PostgreSQL wirft `value out of int32 range`.
- **Auswirkung**: Emby-Sync bricht bei Active Sessions ab, `services.py` commit schlägt fehl (PendingRollbackError)
- **Fix**: Spalten auf `BigInteger` geändert, Migration für PostgreSQL hinzugefügt (ALTER COLUMN TYPE BIGINT), Fehlerbehandlung in `_sync_active_sessions` und `services.py` mit `db.rollback()` versehen
- **Status**: ✅ ERLEDIGT (Session 6)

#### BUG-001: LibraryDetail.tsx – Doppeltes `/api/` Prefix
- **Datei**: `frontend/src/pages/LibraryDetail.tsx`
- **Problem**: Die Seite benutzt Pfade wie `/api/libraries/${id}/details`, aber die Axios-BaseURL ist bereits `/api`. Das erzeugt Requests an `/api/api/libraries/...`.
- **Auswirkung**: **Seite ist wahrscheinlich komplett kaputt** (404 auf alle Requests)
- **Fix**: Alle Fetch-Calls auf relative Pfade ohne `/api/` Prefix umstellen, oder besser: auf React Query + `api.get()` migrieren (wie alle anderen Seiten)
- **Status**: ✅ ERLEDIGT (Session 3) – Komplett rewritten: API-Pfade korrigiert, auf 3× `useQuery` migriert, lokale Utils entfernt → importiert aus `lib/utils.ts`, Light/Dark-Mode Klassen

### 🟡 HIGH

#### BUG-002: Light-Mode kaputt auf Login/Register
- **Dateien**: `frontend/src/pages/Login.tsx`, `frontend/src/pages/Register.tsx`
- **Problem**: Hart-kodierte Dark-Klassen (`bg-dark-800`, `text-white`, `text-dark-200`) ohne `dark:` Prefix-Varianten
- **Auswirkung**: Im Light-Mode erscheint ein dunkler Kasten auf hellem Hintergrund. Text teilweise unsichtbar.
- **Fix**: Alle Farbklassen auf `bg-white dark:bg-dark-800`, `text-gray-900 dark:text-white`, etc. umstellen
- **Status**: ✅ ERLEDIGT (Session 3) – Alle Farbklassen mit `dark:` Varianten versehen

#### BUG-003: ConfirmDialog – Light-Mode kaputt
- **Datei**: `frontend/src/components/ConfirmDialog.tsx`
- **Problem**: Hart-kodiert `bg-dark-800`. Cancel-Button im Light-Mode unsichtbar.
- **Fix**: `dark:` Varianten hinzufügen
- **Status**: ✅ ERLEDIGT (Session 3)

#### BUG-004: Skeleton – Light-Mode kaputt
- **Datei**: `frontend/src/components/Skeleton.tsx`
- **Problem**: Hart-kodiert `bg-dark-700`, `bg-dark-800`. Ladeanimationen werden zu schwarzen Rechtecken.
- **Fix**: `bg-gray-200 dark:bg-dark-700` etc.
- **Status**: ✅ ERLEDIGT (Session 3)

### 🟢 MEDIUM

#### BUG-005: Toast-Notifications – Light-Mode
- **Datei**: `frontend/src/main.tsx`
- **Problem**: Toaster-Farben hart-kodiert auf dunkel (`#1e293b`)
- **Fix**: CSS-Variablen oder Theme-aware Konfiguration
- **Status**: ✅ ERLEDIGT (Session 3) – Hardcoded Hex durch Tailwind CSS `className` ersetzt

#### BUG-006: Sprachmix Deutsch/Englisch
- **Dateien**:
  - `frontend/src/components/Layout.tsx`: Update-Banner mit `"Update verfügbar!"`, `"Changelog ansehen"`, `"Aktuelle Version"`
  - `frontend/src/lib/utils.ts`: `formatDate`/`formatDateTime` benutzen `'de-DE'` Locale
- **Fix**: Alles auf Englisch (oder ein i18n-System), Locale konfigurierbar machen
- **Status**: ✅ ERLEDIGT (Session 3+4) – `utils.ts` Locale `de-DE` → `en-US` geändert (Session 3). Layout.tsx deutsche Strings → Englisch (Session 4).

#### BUG-007: LibraryDetail.tsx – Kein React Query
- **Datei**: `frontend/src/pages/LibraryDetail.tsx`
- **Problem**: Einzige Seite die manuell `useState` + `useEffect` benutzt statt React Query. Kein Caching, kein Retry, inkonsistent.
- **Fix**: Auf `useQuery`/`useMutation` migrieren wie alle anderen Seiten
- **Status**: ✅ ERLEDIGT (Session 3) – 3× `useQuery` mit `enabled` Flags, zusammen mit BUG-001 behoben

#### BUG-008: Auth-Store – fetchUser nie aufgerufen
- **Datei**: `frontend/src/stores/auth.ts`
- **Problem**: `isAuthenticated` initialisiert sich aus `!!getToken()`, aber `user` kommt nur aus persistiertem Store. `fetchUser` wird beim App-Start nie aufgerufen → evtl. veraltete User-Daten.
- **Fix**: `fetchUser()` bei App-Init aufrufen (z.B. in `App.tsx` oder `ProtectedRoute`)
- **Status**: ✅ ERLEDIGT (Session 3) – `useEffect` in `ProtectedRoute` ruft `fetchUser()` bei Mount auf

### 🔵 LOW

#### BUG-009: Code-Duplizierung – formatBytes
- **Dateien**: `LibraryDetail.tsx`, `Preview.tsx` haben eigene `formatBytes` statt `utils.ts` zu importieren
- **Fix**: Löschen und aus `lib/utils.ts` importieren
- **Status**: ✅ ERLEDIGT (Session 3) – Lokale Funktionen entfernt, importiert aus `lib/utils.ts`. `formatDuration` ebenfalls nach utils.ts verschoben.

#### BUG-010: Users.tsx – Eigener Debounce statt Hook
- **Datei**: `frontend/src/pages/Users.tsx`
- **Problem**: Manueller `setTimeout`-Debounce statt `useDebounce` Hook
- **Fix**: `useDebounce` aus `hooks/useDebounce.ts` verwenden
- **Status**: ✅ ERLEDIGT (Session 3)

---

## UX/UI-Probleme

### Mobile-Responsiveness – Tabellen laufen über
| Seite | Nutzt ResponsiveTable? | Status |
|-------|----------------------|--------|
| History.tsx | ✅ Ja | ✅ Gut |
| Users.tsx | ✅ Ja | ✅ Gut |
| LibraryDetail.tsx | ✅ ResponsiveTable | ✅ Migriert (Session 5) |
| UserDetail.tsx | ✅ ResponsiveTable | ✅ Migriert (Session 4) |
| Activity.tsx | ✅ ResponsiveTable | ✅ Migriert (Session 4) |
| Preview.tsx | ✅ ResponsiveTable | ✅ Migriert (Session 6, mit Expand-Row-Support) |
| Staging.tsx | ✅ ResponsiveTable | ✅ Migriert (Session 4) |
| Jobs.tsx | ✅ ResponsiveTable | ✅ Executions-Tabelle migriert (Session 4) |

### Fehlende UI-Features (geplant aber nicht implementiert)
- **Activity-Seite**: ~~IP-Adresse Spalte, Device-Spalte, Expand-Row, Library-Filter, Items-per-Page Selector~~ ✅ Alles implementiert (Session 4+5+6)
- **LibraryDetail**: Genre-Distribution Charts, Grid-View mit Poster-Bildern, ~~Expand-Row~~ ✅ (Session 6)
- **UserDetail**: Favorite Genres Sektion, Timeline-Tab, ~~Expand-Row~~ ✅ (Session 6)
- **Rules.tsx**: Modal ist sehr lang – kein Wizard/Accordion, keine Genre/Tag-Autocomplete
- **Settings.tsx**: Cron-Eingaben ohne Hilfe/Validierung
- **Dashboard**: ~~Keine Charts~~ recharts Charts implementiert (Session 5)

### Performance
- ~~**Kein Code-Splitting**~~: ✅ Alle Seiten (außer Login/Register) auf `React.lazy` + `Suspense` migriert (Session 4).
- **Jobs.tsx**: 5-Sekunden-Refetch auf 2 Queries = konstanter Netzwerk-Traffic
- **Staging.tsx**: Beide Queries auf 30s Refetch – könnte reduziert werden

### Accessibility
- ~~Kein `aria-label` auf Mobile-Hamburger-Button in Layout~~ ✅ War bereits vorhanden
- ~~ConfirmDialog hat keinen Focus-Trap / `aria-modal`~~ ✅ Behoben (Session 6) – `role="dialog"`, `aria-modal`, `aria-labelledby`, Focus-Trap, Escape-Key, Click-Outside
- ~~Farbkontrast im Light-Mode gebrochen~~ ✅ Behoben (Session 3)

---

## Code-Qualitätsprobleme

### Frontend-Inkonsistenzen
| Problem | Betroffene Dateien | Beschreibung | Status |
|---------|--------------------|-------------|--------|
| Fetch-Pattern | LibraryDetail.tsx | Einzige Seite ohne React Query | ✅ Behoben (Session 3) |
| Utility-Duplizierung | LibraryDetail.tsx, Preview.tsx, Activity.tsx, UserDetail.tsx | Eigene formatBytes/formatDuration/formatWatchTime statt utils.ts | ✅ Behoben (Session 3+4) |
| Debounce-Pattern | Users.tsx, Activity.tsx | Manuell statt useDebounce Hook | ✅ Behoben (Session 3+4) |
| API-Prefix | LibraryDetail.tsx | Doppeltes /api/ | ✅ Behoben (Session 3) |
| Theme-Klassen | Login, Register, ConfirmDialog, Skeleton | Fehlende dark: Varianten | ✅ Behoben (Session 3) |

### Backend – Keine bekannten kritischen Issues
Das Backend ist gut strukturiert mit:
- Sauberer Abstraktion (BaseServiceClient → Emby/Radarr/Sonarr)
- Vollständige API-Coverage für alle Features
- Rate Limiting auf allen Routes
- Audit-Logging
- Proper Error Handling
- Caching in EmbyClient (SimpleCache mit TTL)

---

## Was gut funktioniert

### Backend ✅
- **Sync-Engine**: Emby→DB Sync (Users, Watch History, Active Sessions, Libraries) robust implementiert
- **Cleanup-Engine**: Rule-Evaluation mit detailliertem Preview/Dry-Run, Grace Periods, Import Exclusions
- **Staging-System**: Soft-Delete mit Emby Staging-Library, Auto-Restore bei Watch, Per-Library Settings
- **Notifications**: Apprise-basiert mit Template-Engine (Mustache-like), Retry-Logik, Event-Type-Filtering
- **API-Design**: RESTful, gut paginiert, konsistente Error Responses

### Frontend ✅
- **Dashboard**: Gute Übersicht, Time-Range-Selector, Most Viewed/Popular/Active Users
- **Rules + Preview**: Templates, Export/Import, Bulk-Actions, Dry-Run mit detailliertem Reasoning
- **Staging UI**: Durchdachtes 2-Tab-Layout, Urgency-Farbcodierung, Global + Per-Library Settings
- **Notifications**: Multi-URL-Input, Template-Editor mit Variable-Suggestions, Live-Preview
- **Services & Jobs**: Übersichtlich, Test-Verbindung, manueller Sync-Trigger, editierbare Intervalle
- **Auth-Flow**: Setup-Required Check, Refresh-Token mit Queue für Concurrent Requests
- **ResponsiveTable-Komponente**: Gut gebaut (Table→Cards auf Mobile), jetzt auf allen Seiten eingesetzt inkl. Expand-Row-Support

---

## Nächste Schritte (priorisiert)

### ~~Priorität 1: Kritische Bugs fixen~~ ✅ ERLEDIGT (Session 3)
1. ~~**BUG-001**: LibraryDetail.tsx `/api/`-Prefix fixen + auf React Query migrieren + Utils importieren~~ ✅
2. ~~**BUG-002/003/004**: Light-Mode fixen (Login, Register, ConfirmDialog, Skeleton)~~ ✅

### ~~Priorität 2: UX-Verbesserungen~~ ✅ ERLEDIGT (Session 3+4)
3. ~~**BUG-006**: Sprachmix Deutsch→Englisch bereinigen~~ ✅ utils.ts Locale (Session 3) + Layout.tsx deutsche Strings (Session 4)
4. ~~**Mobile Tables**: ResponsiveTable in Activity, UserDetail, Staging, Jobs, Preview einsetzen~~ ✅ (Session 4+6). Alle Seiten migriert.
5. ~~**BUG-005**: Toast-Theming fixen~~ ✅

### ~~Priorität 3: Phase 3 – Charts implementieren~~ ⚠️ TEILWEISE ERLEDIGT (Session 4)
6. ~~**Daily Play Count Chart**: Area Chart mit recharts auf Activity-Seite~~ ✅
7. ~~**Plays by Day of Week**: Bar Chart auf Activity-Seite~~ ✅
8. ~~**Plays by Hour**: Bar Chart auf Activity-Seite~~ ✅
9. **Genre Distribution**: Backend-API für Genre-Aggregation nötig, dann Radar/Spider Chart – offen

### Priorität 4: Fehlende Phase 2 Features
10. ~~**Activity-Seite erweitern**: IP, Device Spalten, Library-Filter, Items-per-Page, Expand-Row~~ ✅ (Session 4+5+6).
11. ~~**UserDetail erweitern**: Library-Filter auf Activity, Expand-Row~~ ✅ (Session 5+6). Favorite Genres offen.
12. **LibraryDetail erweitern**: ~~ResponsiveTable, Expand-Row~~ ✅ (Session 5+6). Genre-Charts, Grid-View offen.
13. ~~**Dashboard Charts**: Daily Plays, Day-of-Week, Hour-of-Day recharts Charts~~ ✅ (Session 5).

### ~~Priorität 5: Code-Qualität~~ ✅ ERLEDIGT (Session 3+4)
13. ~~Code-Splitting mit React.lazy~~ ✅ (Session 4) – 13 Seiten lazy-loaded mit Suspense-Fallback
14. ~~BUG-008: fetchUser bei App-Init~~ ✅
15. ~~BUG-009/010: Code-Duplizierung/Debounce aufräumen~~ ✅

### Priorität 6: Phase 4+ (Zukunft)
16. Advanced Analytics (Heatmaps, Completion Rates, Binge Detection)
17. Smart Cleanup Rules (Per-User Conditions)

---

## Dateistruktur-Referenz

### Wichtige Konfigurationsdateien
| Datei | Beschreibung |
|-------|-------------|
| `docker-compose.dev.yml` | Dev-Umgebung (Hot-Reload) |
| `docker-compose.yml` | Production mit SQLite |
| `docker-compose.postgres.yml` | Production mit PostgreSQL |
| `backend/pyproject.toml` | Python Dependencies |
| `frontend/package.json` | Node Dependencies |
| `frontend/vite.config.ts` | Vite Config (Proxy → Backend) |
| `frontend/src/index.css` | Tailwind @theme Definition |

### API-Endpunkte (Kurzreferenz)
| Prefix | Router | Beschreibung |
|--------|--------|-------------|
| `/api/auth` | auth.py | Login, Register, Sessions |
| `/api/services` | services.py | Service CRUD, Test, Sync |
| `/api/libraries` | libraries.py | Libraries, Stats, Detail, Media |
| `/api/media` | media.py | Dashboard-Stats, Watch-Stats |
| `/api/rules` | rules.py | Rules CRUD, Templates, Export |
| `/api/activity` | activity.py | Activity Log, Stats, Active Sessions |
| `/api/users` | users.py | Media Server Users |
| `/api/notifications` | notifications.py | Channels CRUD, Templates |
| `/api/staging` | staging.py | Staging System |
| `/api/jobs` | jobs.py | Scheduler Jobs |
| `/api/setup` | setup.py | ★ NEU: Setup Wizard Status, Test, Add, Complete, Skip |
| `/api/system` | system.py | Health, Settings, Cleanup, Version |
| `/api/ws/jobs` | main.py | ★ NEU: WebSocket für Real-Time Job-Progress |
| `/api/audit` | audit.py | Audit Logs (Admin) |

---

## Entwicklungsumgebung starten

```bash
# Repository klonen
git clone https://github.com/Serph91P/MediaCleanup.git
cd MediaCleanup
git checkout develop

# Dev-Umgebung starten (Hot-Reload für Frontend + Backend)
docker compose -f docker-compose.dev.yml up --build

# Zugriff:
#   Frontend: http://localhost:5173
#   Backend API Docs: http://localhost:8080/docs
#   Erster Login erstellt Admin-Account
```

---

## Änderungshistorie dieses Dokuments

| Datum | Änderung |
|-------|----------|
| 22.02.2026 | Vollständige Neuaufsetzung: Kompletter Code-Review (Backend + Frontend), Bug-Katalog mit 10 Einträgen, UX-Analyse, Priorisierte Roadmap, Architektur-Dokumentation |
| 22.02.2026 (2) | **Session 2**: WebSocket Real-Time System (ConnectionManager, Progress-Callbacks für Sonarr/Radarr/Emby, Scheduler-Integration), Global Toast-Notifications via WebSocket, Jobs-Page komplett neu geschrieben (Live-Progress-Bars, Running-Panel, WS-Status-Indikator), Layout.tsx Job-Badge, Setup-Wizard (Backend: /setup/status, /test-connection, /add-service, /complete, /skip; Frontend: 5-Step geführter Wizard mit Welcome→Arr→MediaServer→Sync→Complete), App.tsx SetupGate Redirect-Logik |
| 22.02.2026 (3) | **Session 3 – Bugfixes**: Alle 10 Bugs (BUG-001 bis BUG-010) behoben. LibraryDetail.tsx komplett rewritten (API-Pfade, React Query, shared Utils, Light/Dark-Mode). Light-Mode gefixt in Login, Register, ConfirmDialog, Skeleton, Toaster. Locale `de-DE` → `en-US`. fetchUser() bei App-Init. Code-Duplizierung (formatBytes/formatDuration) aufgeräumt. useDebounce Hook in Users.tsx. Branch: `fix/bugfixes-and-ux-improvements`, Commit: `f90a5f5` (10 Dateien, 295 Insertions, 342 Deletions) |
| 22.02.2026 (4) | **Session 4 – UX & Charts**: Layout.tsx deutsche Strings → Englisch (BUG-006 abgeschlossen). ResponsiveTable Light-Mode-Fix (fehlende `dark:` Varianten). Activity.tsx: `useDebounce` statt setTimeout, shared Utils (`formatDurationLong`, `formatWatchTime`), ResponsiveTable-Migration, 3× recharts Charts (Daily Plays Area, Day-of-Week Bar, Hour-of-Day Bar). UserDetail.tsx: shared Utils + ResponsiveTable. Staging.tsx: ResponsiveTable. Jobs.tsx: Executions-Tabelle → ResponsiveTable. App.tsx: React.lazy Code-Splitting (13 Seiten). Branch: `feature/ux-improvements-and-charts` |
| 22.02.2026 (5) | **Session 5 – Phase 2 Enhancements & Docs**: LibraryDetail.tsx Media+Activity Tabs → ResponsiveTable. Activity.tsx: Library-Filter Dropdown + Items-per-Page Selector (10/25/50/100). UserDetail.tsx: Library-Filter auf Activity-Tab. Dashboard.tsx: 3× recharts Charts (Daily Plays Area, Day-of-Week Bar, Hour-of-Day Bar) mit Dashboard-eigenem statsDays-Selector. PLANNED_FEATURES.md: Phase 2/3 Status aktualisiert, Implementation History Tabelle. Branch: `feature/phase2-enhancements-and-docs` |
| 22.02.2026 (6) | **Session 6 – Bugfix & Expand-Rows**: BUG-011 behoben: PlaybackActivity `position_ticks`/`runtime_ticks` Integer→BigInteger (PostgreSQL int32 overflow bei Emby-Ticks >2.1B). DB-Migration hinzugefügt. Fehlerbehandlung in `_sync_active_sessions` und `services.py` mit `db.rollback()`. ResponsiveTable: Expand-Row-Support (`onRowClick`, `isExpanded`, `expandedContent`). Preview.tsx: Beide Tabellen (Series+Movies) auf ResponsiveTable migriert (letzte Seite). Expand-Rows auf Activity, UserDetail, LibraryDetail (IP, Device, Play Method, Progress-Bar). ConfirmDialog: `aria-modal`, Focus-Trap, Escape-Key, Click-Outside. Library Activity API: `ip_address`, `transcode_video`, `transcode_audio` hinzugefügt. Branch: `feature/phase2-enhancements-and-docs` |
| 30.12.2024 | Initiale Version: Session-Zusammenfassung (Rules Export, Sidebar, Theme Toggle, Staging UI) |
