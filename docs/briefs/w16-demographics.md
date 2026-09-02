# Brief W16: port demographics (state demographics, categories, flows, census, labor force)

Read `docs/FRAMEWORK.md`. Mainline at `<mainline-checkout>` is READ-ONLY. You own `packages/engine/src/demographics/` (new), `packages/content` demographic seed tables, plus types/world/save extensions. Do NOT touch `src/npp/` or `src/party/phases.ts` (another agent, W37, owns them this wave) or `src/elections/orchestration.ts`. Schema: W37 may take v14 in parallel; if so the merge resolver renumbers yours to the next free number; write your migration self-containedly and note the collision in your summary.

Port from mainline: state/country demographics as the tally and turnout systems consume them: `src/lib/demographics/` (categories, per-state demographic tables), `src/lib/seeds/reference/stateMetrics1953.ts` demographic slices and `src/lib/seeds/<country>/*DemographicCategories.ts` / `*DemographicTurnout.ts` for US/UK/RU/DD, `demographicEffects`, `demographicFlows`, `census` turn phases, and the labor force computation (`computeLaborForce` and macroMetrics.laborForce wiring) that the macro potential-growth stub named.

Goals, in priority order:

1. **Tally-compatible demographics**: `StateDemographics` + `DemographicCategory` inputs that `electionEngine/tally/accumulateVoteTurn` requires, populated for all 48 US states from mainline 1953 seed data (real tables, no invented numbers; cite files), and country-level equivalents for UK/RU/DD at mainline's granularity (their region tables if authored; document what mainline lacks).
2. **Turn phases**: demographicEffects, demographicFlows, census ported with citations, registered in the phase registry at the end of the ported subset (before newsMaintenance) to avoid shifting existing rng streams; note this ordering deviation like the elections block does.
3. **Labor force**: real laborForce replacing the macro PORT-STUB where `potentialGrowth` named it; keep the rest of potential growth stubbed if its other inputs (education, capital stock) are still missing, updating the stub comment to name what remains.
4. Tests: seed tables validate and sum sanely against state populations, phase goldens with citations, determinism, migration.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: mainline files, tables ported per country, stubs remaining, schema changes, verification, commit hash.
