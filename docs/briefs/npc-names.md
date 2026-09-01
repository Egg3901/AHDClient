# Brief: port the NPC identity generator (names by era and country)

Read `docs/FRAMEWORK.md` first. You own `packages/engine/src/npp/` (new directory) plus its test file and the export line in `packages/engine/src/index.ts`. Touch nothing else (another agent is active in engine types/world/content; stay out of `types.ts`, `world.ts`, `save.ts`, `packages/content`, `apps/desktop`).

## Source of truth (READ-ONLY)

Mainline at `/root/projects/AHDGame`: `src/lib/npp/nameGenerator.ts`, `src/lib/npp/nameEra.ts`, and whatever name data they import. **Live production-shared tree: read only, no git, no npm there.**

## Goal

Deterministic NPC name generation for future politician generation: given a `WorldRng`, country id (uppercase mainline ids), and era, produce period-appropriate full names, faithful to mainline's generator (same name pools, same weighting approach). This is a pure module; it does not modify WorldState.

## Deliverables

1. `packages/engine/src/npp/nameGenerator.ts` (+ data modules as mainline structures them): port pools and selection logic with source citations. Cover at least US, UK, RU, DD; carry over whatever additional countries mainline's pools already include at no extra effort.
2. All randomness through the passed `WorldRng`. No Math.random, no Date.now.
3. Tests: same rng state gives same sequence of names; different countries draw from their own pools (sample checks); era affects output where mainline's nameEra logic says it should; pools are non-empty for every supported country.
4. Export the public API from `packages/engine/src/index.ts` (single line addition).

## Rules

- Run `npm install` first. Merge gate: `npm run verify` green from repo root.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: mainline files ported, countries covered, deviations if any.
