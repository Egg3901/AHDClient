# Brief U10b: membership UI on the character panel

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (W21b is in flight, confined to electionEngine). Engine schema v11 backing: `player.partyId`, `player.caucusId`, endorsements, and the W36 membership actions in the action catalog.

Extend the character panel and actions hub: replace the "unaffiliated (W36 pending)" state with real membership UI. Party section: current party (name, tier, role note) with leave (confirm, shows mainline cooldown/purge-block state if returned by the engine), or a join flow listing the player country's parties (ideology marker, member count, treasury) plus found-party flow (name/abbreviation inputs, cost shown, uses the engine action). Caucus section: current caucus or create/join list. Endorsements: show endorsements involving the player. All mutations via `game.executeAction` only; errors inline; action point/fund costs shown up front. Update any action cards whose eligibility changed with membership gating so the hub reflects it live.

## Rules

- No direct world pokes; no new permissions. `npm install` first. Merge gate: `npm run verify`, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: components, flows, verification, commit hash.
