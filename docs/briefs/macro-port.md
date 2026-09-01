# Brief: port mainline macro country economy

Read `docs/FRAMEWORK.md` first. You own `packages/engine`. Do not touch `packages/content` (another agent is working there), `apps/desktop`, `README.md`, or `docs/` beyond reading.

## Source of truth (READ-ONLY)

Mainline lives at `/root/projects/AHDGame`. Entry point: `/root/projects/AHDGame/src/lib/world/macro/index.ts` and whatever it imports, plus the phase wiring around `macroCountryTurn` in `src/lib/turn/`. **That checkout is a live production-shared tree: read files only, never write, never run git or npm there.**

## Goal

Replace the placeholder `macroEconomy` phase in `packages/engine/src/phases/macroEconomy.ts` with a faithful port of mainline's country-level macro turn: growth, inflation, unemployment dynamics and whatever country-level state they require. Formulas and constants copy from mainline with a comment citing the source file for each nontrivial formula or constant. No invented math.

## Scope discipline

Mainline macro will reference systems we have not ported (corporations, trade, budgets, sectors). Do not chase those dependencies. For each missing input, take the neutral value mainline itself uses when the input is absent or zero, document it with a `PORT-STUB` comment naming the missing system, and keep the phase structured so the stub is replaced by a real input later. Porting half of the corporation system is failure; a faithful macro core with clearly marked stub inputs is success.

## Deliverables

1. `macroCountryTurn` phase (rename from `macroEconomy`, update the registry; mirror mainline's phase name) operating on `WorldState` countries, deterministic, RNG only through the turn rng.
2. WorldState extensions as needed (fields on `CountryEconomy` or a new sub-document). Any shape change bumps `SCHEMA_VERSION` in `world.ts` and adds a forward migration in `save.ts` in the same commit, with a migration test (load a v1 save fixture, expect upgraded world).
3. Constants in one module (`src/economy/macroConstants.ts` or similar) with source citations.
4. Tests: determinism (same seed, 50 turns, identical JSON); at least three golden-value tests where you hand-compute the expected output of a ported formula for known inputs and assert it (this catches transcription errors); bounds sanity (rates stay finite and within mainline's clamps).

## Rules

- Determinism doctrine binding: no Math.random, no Date.now, no IO in engine.
- Run `npm install` first (fresh worktree). Merge gate: `npm run verify` green from repo root.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: mainline files ported, formulas carried, every PORT-STUB and why, verification output.
