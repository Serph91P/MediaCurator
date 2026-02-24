# ADR-002: Actionable Cleanup Suggestions

**Status:** Proposed  
**Date:** 2026-02-24

## Context

The Cleanup Suggestions page (`/cleanup-suggestions`) currently provides a **read-only analytics view**. It scores media items across categories like *Unwatched*, *Abandoned*, *Low Engagement*, *Stale*, and *Storage Hog* — but users cannot act on these suggestions directly. To actually clean up a suggested item, a user must manually create or adjust a cleanup rule, wait for it to be evaluated, and then let the scheduled job flag and process items. This disconnect between "here's what you should clean up" and "now go do it" adds unnecessary friction.

## Proposal

Add the ability to **take direct action on cleanup suggestions** from the Cleanup Suggestions page. Specifically, users should be able to:

### 1. Flag Suggestions for Deletion (Mark for Cleanup)

- Select one or more suggested items and **mark them for deletion** — equivalent to what happens when a cleanup rule matches an item.
- This sets `flagged_for_cleanup = true`, records `flagged_at`, and computes `scheduled_cleanup_at` based on a user-chosen or default grace period.
- After the grace period expires, the existing `run_scheduled_cleanups()` job picks them up and executes the configured action (delete via Sonarr/Radarr, unmonitor, etc.).
- Since these items are flagged manually (not by a rule), `flagged_by_rule_id` can remain `null` to distinguish manual flags from rule-driven ones.

### 2. Stage Suggestions Directly

- Select one or more suggested items and **move them to staging** in a single action — bypassing the need for a rule entirely.
- This invokes the existing `move_to_staging()` logic: the file is physically relocated to the staging directory, the item appears in the Emby staging library ("MediaCleanup - Scheduled for Deletion"), and the grace period countdown begins.
- Users can still restore staged items from the Staging page if they change their mind.

### 3. Bulk Actions

- Support **batch selection** (select all / select by category) so users can act on multiple suggestions at once rather than one at a time.
- Provide a confirmation dialog summarizing the action (number of items, total reclaimable space, chosen action).

## UI Changes

- Add **checkboxes** to each suggestion row on the Cleanup Suggestions page.
- Add a **toolbar/action bar** that appears when items are selected, offering:
  - "Flag for Deletion" — marks selected items for cleanup with a configurable grace period.
  - "Move to Staging" — immediately stages selected items (only visible when staging is enabled).
- Add a **"Select All" / "Select by Category"** control for bulk operations.
- Show a **confirmation dialog** before executing any action, displaying the list of affected items and total disk space.

## API Changes

The following new or adjusted endpoints are needed:

| Endpoint | Method | Description |
|---|---|---|
| `/media/cleanup-suggestions/flag` | POST | Accepts a list of media IDs + optional grace period; flags them for cleanup |
| `/media/cleanup-suggestions/stage` | POST | Accepts a list of media IDs; stages them via the existing staging service |

Alternatively, the existing `POST /staging/stage` (batch staging) endpoint may already cover the staging use case — evaluate whether it can be reused directly.

## How It Differs from Rules

- **Rules** are automated and recurring — they run on a schedule, evaluate conditions, and flag matching items every time.
- **This feature** is a **manual, one-time action** — the user reviews the AI-generated suggestions and decides which ones to act on right now.
- Think of it as: rules are the autopilot, suggestions are the manual override.

## Out of Scope

- Changing how suggestion scores are calculated.
- Auto-applying suggestions without user confirmation.
- Creating rules from suggestions (could be a future enhancement).