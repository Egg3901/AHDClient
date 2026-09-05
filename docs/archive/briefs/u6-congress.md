# Brief U6: congress and bills screen

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (W21b in flight in electionEngine). Backing: W27 legislation (schema v12): bill state on WorldState, bill catalog with available vs PORT-STUB entries, sponsor/vote actions in the catalog, committees.

CONGRESS button in dashboard header. Screen: chamber tabs for the player country's elected chambers; active bills list (title, category, sponsor, stage, stage timer, committee badge) with detail panel: full stage history, vote tallies when voted (party breakdown bars, yea/nay/abstain), effects preview from the catalog entry. Sponsor flow: catalog picker (available entries only; stubbed entries visible but grayed with blocking system), uses the engine sponsor action via `game.executeAction` (respect the seat-holding gate: if the player holds no seat, show the gate reason honestly). Vote flow: when a bill is at floor vote in a chamber where the player holds a seat, present yea/nay/abstain via the vote action. Enacted/failed history section (last 20). All world reads defensive; mutations only through the action API.

## Rules

- No new permissions. `npm install` first. Merge gate: `npm run verify`, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: components, flows, verification, commit hash.
