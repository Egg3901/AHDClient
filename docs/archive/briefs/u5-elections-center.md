# Brief U5: elections center screen

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (engine waves in flight). Backing: schema v13 live elections (`WorldState.elections`: records with status/startTurn/primaryEndTurn/endTurn/candidates/tally/winners), candidacy actions (`declareCandidacy`/`withdrawCandidacy` with `electionId` param), news integration.

ELECTIONS button in dashboard header. Screen:

1. **Race board**: upcoming/active races for the player's country grouped by type (House by state, Senate by class, national), each showing filing deadline (primaryEndTurn), election day (endTurn), candidate count, and the player's candidacy status. Filter chips by type and by "my races".
2. **Race detail**: candidates with party, incumbent badge, live tally shares as horizontal bars once accumulation starts (compute percent from `tally`), countdown in turns. DECLARE button when eligible (active/upcoming, filing open, player country) wired through `game.executeAction("declareCandidacy", { electionId })`; WITHDRAW when declared; errors inline (party membership requirement will surface from the engine; link to the character panel's join-party flow in the error case).
3. **Results**: recently resolved races (newest first): winners with party, player result highlighted; a compact "election night" pulse for races resolved on the current turn.
4. Defensive reads; no crashes for pre-v13 saves (empty board with a note).

## Rules

- Mutations only via `game.executeAction`; no new permissions. `npm install` first. Merge gate: `npm run verify`, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: components, flows, verification, commit hash.
