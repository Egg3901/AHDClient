# Brief W21b: port election resolution modules (pure layer)

Read `docs/FRAMEWORK.md`. Mainline at `/root/projects/AHDGame` is READ-ONLY. You own `packages/engine/src/electionEngine/resolution/` (new subdirectory) plus tests and export lines. Do NOT touch world.ts, save.ts, types.ts, phases, actions, party, support modules (another agent is active there): pure modules with plain input interfaces only, same discipline as the factor library that now lives in `packages/engine/src/electionEngine/`.

Port from mainline `src/lib/turn/election/` and `src/lib/elections/` the resolution layer for our four playable countries: `generalResolution` + `generalResolutionHelpers`, `electionSpawning` (as pure planning functions returning what elections should exist given date/term state, not DB writes), `conventionResolution`, `blocListAllocation`, `contingentElection` (+ data loading logic re-expressed over plain inputs), `canonicalCycle`, `cycleAnchorContext`, `apportionment` (+ era/statehood variants), `activeCandidacy`, `buildPollingData`, and the US/UK/RU/DD-relevant country variants (skip DE/JP/NG-specific modules like `germanyAMS`, `ngPresidentResolution` for now but list them as deferred with their file names; they port when those countries become playable). Port the sibling tests, adapted for import paths and plain-input shapes; keep numeric assertions byte-identical and document any that had to change.

Use the existing factor library rather than re-porting anything it already covers. Where a module reads Mongo or the support system, define plain input interfaces documenting the field mapping to our WorldState (the operator wires them next wave); do not import WorldState.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: modules ported vs deferred, input mappings, changed assertions, verification, commit hash.
