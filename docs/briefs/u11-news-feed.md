# Brief U11: news and events feed

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (W38 in flight).

Upgrade the dashboard news list into a proper feed: full-height NEWS screen (dashboard button) with all retained items newest-first, turn/date stamps, category inference from headline prefixes where the engine provides them (fall back to "general"), category filter chips, text search, and a compact latest-5 widget remaining on the dashboard. Auto-categorize known engine sources (era transitions, action results, cheat injections) explicitly. Defensive for empty/legacy worlds.

## Rules

- Read-only; no new permissions. `npm install` first. Merge gate: `npm run verify`, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: components, verification, commit hash.
