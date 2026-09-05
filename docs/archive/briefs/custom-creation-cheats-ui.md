# Brief: granular world creation flow and singleplayer cheat panel (UI)

Read `docs/FRAMEWORK.md` first, especially "Engine contract (v2 additions)". You own `apps/desktop`. Do not touch `packages/*` (an agent is active in engine); the engine-side v2 APIs (`overrides`, `listCountries`, `applyCheat`) do NOT exist yet. Build against the contract through thin adapter modules you own, marked for deletion, same pattern as the earlier `engineContract.ts` stub:

- `src/worldSetup.ts`: `listCountries(era)` adapter. Until the engine exports it, derive the roster by calling `createWorld` with default options for that era and reading `world.countries` (works today; no engine change). `createWorldWithOverrides(options, overrides)` applies overrides client-side after `game.newGame` for now (validate: finite, gdp > 0, rates in [0,1] where fractional), with a `TEMPORARY - engine applyCheat/overrides pending` marker.
- `src/cheats.ts`: implements `CheatOp` application against the current world via the `game` module (single source of truth for world state; expose a `game.mutate(fn)` or equivalent), validating inputs per the contract. Same TEMPORARY marker.

## Deliverable 1: custom world creation flow

Replace the current `NewWorldScreen` with a granular setup screen (keep the dark in-game theme):

- **Identity**: character name.
- **World**: era select, playable-country select, seed input with a randomize button.
- **Advanced** (collapsed by default): starting cash; a full-roster economy editor: one row per country in the era pack (27), columns GDP ($M), growth %, inflation %, unemployment %, values prefilled with pack defaults, editable, per-row reset and reset-all. Percent fields display as percent, store as fractions. Invalid values highlight and block creation with a message, never silently clamp.
- Launch summary line before the create button: era, country, seed, N countries modified.
- On create: pass overrides through `worldSetup.createWorldWithOverrides`.

## Deliverable 2: cheat panel (singleplayer only)

- In-game slide-over panel, toggled by a small CHEATS button in the dashboard header and the backtick key. Dark, mono, dev-tools tone; no cheesy skull-and-crossbones copy.
- Sections: Player (set cash), Economy (country select, field select, value, apply), Time (advance N turns, run without intermediate rendering, show elapsed ms), News (inject headline).
- Every applied cheat appends a line to a session log inside the panel and sets a visible `CHEATS ACTIVE` tag in the dashboard header for the rest of the session.
- The panel and its toggle must not exist in any multiplayer surface (the online window is remote content and unaffected; just ensure no cheat UI leaks into launcher MP mode).

## Rules

- No new Tauri permissions. Run `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: components, adapter decisions, validation rules, verification output.
