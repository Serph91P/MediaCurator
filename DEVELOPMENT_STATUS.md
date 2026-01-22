# MediaMediaCurator - Development Status

**Last Updated**: Session vom 30.12.2024
**Branch**: `develop`
**Latest Commit**: `46e93f0` - "fix: timezone display, auto-restore job status, and staging settings UI"

## ✅ Completed in This Session

### 1. Feature Implementations
- **Rules Export/Import**: Backup and restore cleanup rules as JSON files
- **Bulk Operations for Rules**: Enable/disable/delete multiple rules at once
- **Collapsible Sidebar**: Toggle sidebar with localStorage persistence
- **Dark/Light Theme Toggle**: Three-state toggle (Light → Dark → System) with localStorage
- **Staging Settings UI**: Full configuration UI for soft-delete/staging system in Settings

### 2. Bug Fixes
- **Fixed Docker Startup Crash**: Removed invalid `library_id` index from migrations
- **Fixed Light Mode Styling**: Applied `dark:` variants across all pages and components
- **Fixed Timezone Display**: ISO dates now properly parsed with UTC timezone
- **Fixed Auto-Restore Job Status**: Now shows "skipped" instead of "error" when staging disabled

### 3. Technical Changes
- Added `@custom-variant dark (&:where(.dark, .dark *))` for manual theme toggle (Tailwind v4)
- Created `frontend/src/stores/theme.ts` with Zustand for theme state management
- Centralized `formatDateTime` utility in `frontend/src/lib/utils.ts`
- Updated all pages with proper light/dark mode classes

## 📋 Recent Commits
```
46e93f0 fix: timezone display, auto-restore job status, and staging settings UI
4cda2e4 fix: improve light/dark mode styling across all components
f07e70f feat: add dark/light theme toggle with system preference support
f167137 fix: remove invalid library_id index from migrations
fb567d6 feat: add collapsible sidebar with localStorage persistence
```

## 🔧 How to Continue Development

### 1. Clone/Pull the Latest Code
```bash
git clone https://github.com/Serph91P/MediaCleanup.git
# or if already cloned:
git pull origin develop
```

### 2. Start Development Environment
```bash
docker compose -f docker-compose.dev.yml up --build
```

### 3. Access the App
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080/docs

## ⚠️ Known Issues / Potential Improvements

### 1. Timezone Display (May Need Verification)
The frontend now appends `Z` to ISO strings without timezone indicators. This should fix the 1-hour offset. **Verify after next deployment.**

### 2. Auto-Restore Job
When staging is disabled, the job now shows "skipped" status instead of "error". The logic is:
- `staging.py`: Returns `{"success": False, "error": "Auto-restore is not enabled"}`
- `scheduler.py`: Checks if error message contains "not enabled" → marks as "skipped"

### 3. Theme Toggle
The theme system uses Tailwind v4's `@custom-variant` feature for manual toggle. The toggle cycles: Light → Dark → System.

## 📁 Key Files Modified

| File | Changes |
|------|---------|
| `backend/app/scheduler.py` | Added "skipped" status for disabled staging |
| `frontend/src/lib/utils.ts` | Added centralized `formatDateTime` with timezone fix |
| `frontend/src/stores/theme.ts` | NEW: Theme store with Zustand |
| `frontend/src/pages/Settings.tsx` | Added Staging System configuration UI |
| `frontend/src/pages/Jobs.tsx` | Added "skipped" badge, imported formatDateTime |
| `frontend/src/components/Layout.tsx` | Theme toggle button, fixed sidebar collapse |

## 🚀 Next Steps (Optional)

1. **Test the Staging UI**: Verify the staging settings form saves correctly
2. **Test Timezone Fix**: Confirm dates display in correct local time
3. **Test Theme Toggle**: Verify Light/Dark/System modes work correctly
4. **Continue with Roadmap**: Check README.md for remaining roadmap items

---

**Note**: The repository has been renamed from `MediaCurator` to `MediaCleanup`. Update your remotes if needed:
```bash
git remote set-url origin https://github.com/Serph91P/MediaCleanup.git
```
