# Brief: era seed packs and parameterized world creation

Read `docs/FRAMEWORK.md` first; the Engine contract (v1) section is your deliverable's public surface. You own `packages/engine` and the new `packages/content`. Do not touch `apps/desktop`, `README.md`, or anything under `docs/`.

## Goal

Worlds are created from era-keyed seed packs instead of the current hardcoded 1953 US/UK stub in `packages/engine/src/world.ts`. A player can start in any shipped era as any playable country.

## Deliverables

1. **`packages/content` workspace package** (`@ahdsolo/content`): defines the seed pack format and ships the packs.
   - A seed pack is versioned data (`packVersion`), one per era: era id, label, start date, and a country table (id, name, playable flag, economy anchors: gdp, growthRate, inflationRate, unemploymentRate). Design the type so states, parties, and sectors can be added later without breaking existing packs.
   - A `validatePack(pack)` function with hard errors (duplicate ids, no playable countries, bad dates, non-finite numbers).
   - **1953 pack**: 10 to 12 countries with defensible period macro anchors (US, UK, France, West Germany, USSR, Japan, Canada, Italy, plus your pick). Playable: at minimum US and UK.
   - **1960 pack**: same countries, anchors moved plausibly seven years forward. This proves era parameterization; precision tuning comes later.
2. **Engine consumes packs**: implement `listEras()`, `listPlayableCountries(era)`, and pack-driven `createWorld(options)` per the contract. The engine may depend on `@ahdsolo/content`; content must not depend on engine internals beyond exported types. Era ladder (`eraForDate`) should key off pack start dates rather than the current hardcoded year thresholds where that is straightforward; if not straightforward, leave the calendar as is and note it.
3. **Tests** (extend `packages/engine` suite, add a `packages/content` suite): every shipped pack validates; createWorld succeeds for every era and playable country and stays deterministic (same options twice = identical JSON); unknown era and non-playable country throw; existing 11 tests keep passing, updated only where the createWorld signature changed.

## Rules

- Determinism doctrine from FRAMEWORK.md is binding: no Math.random, no Date.now, no IO in engine or content.
- WorldState shape changes bump SCHEMA_VERSION in the same commit.
- Run `npm install` first (fresh worktree). Merge gate: `npm run verify` green from repo root.
- Conventional commits on this branch when verified. Do not push. No em dashes anywhere.
- Final summary: files, API decisions, verification output, anything deferred.
