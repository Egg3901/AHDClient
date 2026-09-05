# Brief: engine implementation of world overrides, listCountries, and cheats (contract v2)

Read `docs/FRAMEWORK.md`, section "Engine contract (v2 additions)"; it is the exact spec. You own `packages/engine`. Do not touch `apps/desktop` (another agent is active there), `packages/cli`, or `packages/content` beyond reading exports.

## Deliverables

1. `listCountries(era)` per the contract: full pack roster with default economy anchors.
2. `NewWorldOptions.overrides?: WorldOverrides` applied in `createWorld` after pack load and before politician generation. Validation exactly as the contract states: finite numbers, gdp > 0, fractional rates within the same bounds `validatePack` uses; unknown country id throws. Overrides do not disturb determinism: same options object including overrides gives identical worlds.
3. `applyCheat(world, op)` for the four `CheatOp` kinds. Validation: finite values, `advanceTurns.count` a positive integer with a sane cap (100000), `setCountryEconomy` bounds same as overrides, unknown country throws. `advanceTurns` loops the real `advanceTurn`. `addNews` appends at the current turn/date.
4. `meta.cheatsUsed: boolean` set true by any successful `applyCheat`. Schema bump to 5, forward migration defaulting `cheatsUsed: false`, migration test following the v2/v3/v4 pattern (chain from v1 too).
5. Tests: override application and validation errors, determinism with overrides, every cheat kind including validation failures, cheatsUsed flag, migrations.

## Rules

- Determinism doctrine binding. Run `npm install` first. Merge gate: `npm run verify` green from repo root. Note the cli package has a WorldState fixture in `packages/cli/src/formatter.test.ts`; if your schema change breaks it, you may add the new field to that fixture (single-line change) even though cli is otherwise out of scope.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: API decisions, validation bounds chosen, verification output.
