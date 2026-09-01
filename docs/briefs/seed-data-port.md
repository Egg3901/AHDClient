# Brief: port real mainline seed data into content packs

Read `docs/FRAMEWORK.md` first. You own `packages/content` and may make minimal supporting changes in `packages/engine` tests. Do not touch `apps/desktop`, `README.md`, or `docs/` outside this file's scope.

## Source of truth (READ-ONLY)

Mainline A House Divided lives at `/root/projects/AHDGame` (same owner, same PolyForm NC license; copying data is intended). Its audited world seed is under `/root/projects/AHDGame/src/lib/seeds/` (per-country directories: us, uk, de, dd, cn, su equivalents, etc.) with era logic under `/root/projects/AHDGame/src/lib/era/`.

**HARD RULE: that checkout is a live production-shared tree. Never write to it, never run git commands in it, never run its npm scripts. Read files only.**

## Goal

The current packs in `packages/content/src/packs/` (1953.ts, 1960.ts) contain hand-invented macro anchors for 12 countries. Replace them with the real thing: every country mainline seeds, with mainline's actual values and ids.

## Deliverables

1. **1953 pack from real data**: for every country in mainline's seed set, port id (keep mainline's country ids exactly, for future cross-repo alignment), display name, playable flag (mirror mainline's playable/country-group configuration; find where mainline defines which countries are playable rather than guessing), and the macro anchors our `EconomySeed` models (gdp, growthRate, inflationRate, unemploymentRate) from wherever mainline's seed stores them. If mainline stores a value in different units or shape, convert and document the conversion in a comment at the point of use.
2. **1960 pack**: check `/root/projects/AHDGame/src/lib/era/` for era scaling or 1960 recalibration data (mainline is live in its 1960 era). Derive the 1960 pack from mainline's own era-scale factors or 1960 anchors if they exist. Only if no usable source exists may you keep derived values, and then each derivation must cite the mainline file and factor it came from. No invented numbers.
3. **Provenance header** in each pack file: which mainline files it was generated from, and the date.
4. **Tests**: packs validate; a test asserting country count matches the number of countries ported and that us/uk/su-equivalent ids exist; engine determinism suite stays green. If a mainline value breaks `validatePack` (for example a zero or missing anchor), prefer fixing the port mapping; if mainline genuinely lacks the value, use the closest mainline-derived proxy and comment the source.

## Rules

- Determinism doctrine binding: no Math.random, no Date.now, no IO at pack module load time. Packs are static data compiled in; generation happens at your build time, not at runtime. A generator script under `packages/content/scripts/` reading mainline and emitting the pack source is welcome if it keeps the output as checked-in TypeScript.
- Run `npm install` first (fresh worktree). Merge gate: `npm run verify` green from repo root.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: countries ported, source files used, conversions applied, anything mainline lacked.
