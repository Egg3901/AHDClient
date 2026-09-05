# Brief U2: economy dashboard screen

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (an engine wave is in flight). Mainline at `<mainline-checkout>` is READ-ONLY reference for layout inspiration only; do not copy proprietary-looking assets, just structure.

## Goal

Replace the dashboard's plain economy table with a real economy screen driven by the WorldState snapshot: the player sees their world's economy move.

## Deliverables

1. **ECONOMY button** in the dashboard header opens the screen; back returns. Dark in-game theme, consistent with the government screen.
2. **Country strip**: player's country pinned first with big stat tiles (GDP, growth, inflation, unemployment, output gap), then a sortable all-countries table (the existing columns plus output gap).
3. **History sparklines**: the UI keeps a session-local ring buffer of per-turn values per country (record on every advanceTurn result; cap 520 turns) and renders small line charts (canvas or SVG, no chart library) for the player country's five series. Label clearly that history starts when the session starts (engine-side WorldHistory is a later wave, W41).
4. **Party treasuries panel**: parties of the player country with treasury, political strength, organization, tier (fields exist on Party since schema v6). Note tier as a badge.
5. Handle worlds created before the current schema gracefully (defensive reads, no crashes on missing fields).

## Rules

- Read-only screen; no world mutation; no new permissions.
- `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT your work on this branch with a conventional commit message. This step is mandatory; uncommitted work is lost. Do not push. No em dashes.
- Final summary: components, decisions, verification output, commit hash.
