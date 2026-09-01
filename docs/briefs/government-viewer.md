# Brief: government viewer screen

Read `docs/FRAMEWORK.md` first. You own `apps/desktop`. Do not touch `packages/*` (an agent is active in engine).

## Goal

An in-game Government screen so the political skeleton is visible: legislatures, seat balances, and the politician roster, all from the `WorldState` snapshot the UI already holds.

## Deliverables

1. **Navigation**: a GOVERNMENT button in the dashboard header opens the screen; back returns to the dashboard. Dark in-game theme.
2. **Chamber view**: for the player's country first (selector for other countries that have legislatures): per chamber a horizontal seat-composition bar (segments proportional to `seatsByParty` plus a vacancies segment), seat counts, elected/appointed tag. Party colors: assign deterministically from a small fixed palette by sorted party id so colors are stable across sessions; vacancies gray. Include a legend.
3. **Roster table**: politicians of the selected chamber: name, party, age, ideology (economic/social to one decimal). Sortable by name, party, age. A count line (e.g. "435 seats, 434 held, 1 vacant"). Handle empty chambers gracefully (appointed/subnational show "no seated members").
4. **Party panel**: side list of the country's parties with name and position on the two axes rendered as a tiny 2D marker (a small square grid with a dot), no invented data.

## Rules

- Read-only screen; no world mutation. No new permissions.
- Run `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: components, UX decisions, verification output.
