# Brief: headless sim CLI and balance harness

Read `docs/FRAMEWORK.md` first. You own a NEW workspace package `packages/cli` (`@rotunda/cli`) only. Do not touch `packages/engine`, `packages/content`, `apps/desktop`, `README.md`, or root config (the `packages/*` workspace glob already covers you).

## Goal

A terminal harness for the engine, for balance work and CI-style checks without the desktop app. The engine stays IO-free; all IO lives here.

## Deliverables

Commands (runner: `tsx`, devDependency; script `"sim": "tsx src/sim.ts"`):

1. `run --era 1953 --country US --seed abc --turns 200 [--json]`: creates a world, advances N turns, prints a compact table every 52 turns and a final summary (per-country gdp, growthRate, inflationRate, unemploymentRate, outputGap) or full JSON with `--json`.
2. `determinism --turns 200`: two independent runs per shipped era with the same seed, deep-compare final JSON, exit nonzero with a diff summary on mismatch.
3. `bench --turns 2000`: turns/sec plus mean per-phase milliseconds from TurnReport timings.
4. Unit tests for the table formatter and the determinism comparator (vitest, standard workspace scripts `typecheck`/`test` so root verify picks you up).

## Rules

- Use only public `@rotunda/engine` / `@rotunda/content` exports.
- Country ids are uppercase (`US`). Era ids from `listEras()`.
- Run `npm install` first. Merge gate: `npm run verify` green from repo root.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: commands implemented, sample output, verification.
