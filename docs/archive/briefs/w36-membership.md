# Brief W36: player and politician party membership, caucuses, endorsements

Read `docs/FRAMEWORK.md`. Mainline at `<mainline-checkout>` is READ-ONLY. You own `packages/engine` membership surface (types, world, save, actions, party modules). Do NOT touch `packages/engine/src/electionEngine/` (another agent owns that directory this wave) or `apps/desktop`. Schema bump: current is v10; take v11 with chained migration + test; one-line cli fixture bump allowed.

Port from mainline the membership layer:

1. **Party membership**: `player.partyId` (nullable) plus join/leave/found-party as engine actions in the W34 catalog, with mainline's rules and costs cited (`src/lib/actions/`, party membership modules; founding uses the charter machinery from W18 where mainline wires it so). Politicians already carry partyId; add defection support only if mainline's npp behavior uses it (cite; otherwise leave).
2. **Caucuses**: creation/join/leave against the existing `WorldState.caucuses` (W18 shipped the type; wire real mainline caucus rules and caucusTax interaction).
3. **Endorsements**: mainline's endorsement model between politicians/parties (`playerEndorsementPartySweep` consumers) at whatever depth mainline models: endorsement records with effects on support/favorability, cited; sweep phase behavior for party switches.
4. Player membership affects fund generation and action eligibility exactly as mainline wires it (party actions require membership; update catalog eligibility).
5. Tests: join/leave/found flows, cost enforcement, caucus lifecycle, endorsement effects goldens, determinism, migration.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: mainline files, rules ported, stubs, schema changes, verification, commit hash.
