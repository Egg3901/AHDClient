# Brief W34: port player action economy (actionRefresh, fundGeneration, action catalog)

Read `docs/FRAMEWORK.md`. Mainline at `/root/projects/AHDGame` is READ-ONLY. You own `packages/engine` actions surface. Do not touch `apps/desktop` (an agent is active there). Determinism doctrine; cite sources; PORT-STUB at mainline-neutral values; schema bump + chained migration + test; one-line cli fixture bump allowed.

Port from mainline: `actionRefresh` and `fundGeneration` phases plus the action catalog machinery under `src/lib/actions/` (action definitions, costs, cooldowns, fundraise quote logic per `actions.fundraiseQuote`). Deliver:

1. Action-point state on `Politician` and the player (mainline's refresh cadence and caps, cited), fund generation per turn for politicians and parties per mainline formulas. This replaces the `stubRevenueFromOrgPs` PORT-STUB inside the W19 GOTV code: wire the real revenue in and delete that stub (it is marked in `packages/engine/src/support/`).
2. A typed action execution API: `executeAction(world, actorId, actionId, params)` validating cost/cooldown/eligibility and dispatching to per-action effects. Port the subset of mainline actions whose target systems exist in solo today (support/pressure/GOTV/org actions from the political operations set, fundraising, party influence spending); catalog entries for actions whose systems are unported get `PORT-STUB: unavailable` status listed in the catalog with the blocking system named, so the UI can gray them out honestly.
3. NPC usage: where W18 `partyActionGeneration` or NPP phases already expect action generation, wire them to the real catalog.
4. Tests: refresh cadence goldens, fundraise quote goldens, cost/cooldown enforcement, an end-to-end action changing support deterministically, migration.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory; uncommitted work is lost. Do not push. No em dashes.
- Final summary: mainline files, actions ported vs stub-listed, schema changes, verification, commit hash.
