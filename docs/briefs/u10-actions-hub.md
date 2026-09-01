# Brief U10: character and actions hub

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (W38 is in flight there). Engine exports from W34 are your backing: the action catalog, `executeAction`, action-point/cooldown state, fundraise quotes.

## Goal

The player can finally DO things: a character panel and an actions hub wired to the real engine action API.

## Deliverables

1. **CHARACTER button** in dashboard header: character panel with name, country, cash, action points (with refresh cadence note), party membership status (parties come in a later wave for the player; show "unaffiliated" honestly if the player has no party binding yet and note which wave adds joining if that is the case; check the engine API first).
2. **Actions hub** on the same screen: the catalog grouped by category; each action card shows name, cost (points/funds), cooldown state, eligibility; unavailable actions (PORT-STUB status from the catalog) render grayed with the blocking system named. Executing an action goes through the world-owning `game` module (add `game.executeAction` calling the engine; world state stays single-source), surfaces results (support delta, funds raised) in a result toast and appends to the news feed if the engine does so.
3. **Fundraise flow**: quote first (engine quote API), confirm, execute; show the quote breakdown.
4. **Region targeting**: actions requiring a region get a region picker from `WorldState.regions` for the player's country.
5. Errors surface inline on the card, never crash; action point changes reflect immediately.

## Rules

- Mutations ONLY via the engine action API through the game module; no direct world pokes. No new permissions.
- `npm install` first. Merge gate: `npm run verify`, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: components, wiring decisions, verification, commit hash.
