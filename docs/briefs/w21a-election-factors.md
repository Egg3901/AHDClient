# Brief W21a: port election engine factor modules (pure functions only)

Read `docs/FRAMEWORK.md`. Mainline at `/root/projects/AHDGame` is READ-ONLY. You own `packages/engine/src/electionEngine/` (new directory) plus test files and the single export line in `index.ts`. Do NOT touch world.ts, save.ts, types.ts, phases, or any existing module: this wave is strictly the pure formula layer; the resolution pipeline that composes these is a separate operator-led wave.

Port from mainline `src/lib/electionEngine/` the pure factor modules as close to verbatim as their inputs allow: `constants.ts`, `electionFormulaFactors`, `factorLedger`, `medianVoter`, `incumbentSeatShare`, `coattailMagnitude`, `govCoattail`, `presidentialCoattail`, `midtermOppositionBoost`, `persuasionDrivers`, `nationwideElectorate`, `candidateEnrichment`, `fundsByParty`, `economicReferendum`, plus any sibling factor modules they import. Port their existing test files alongside, adapted only for import paths and for inputs that reference unported systems (PORT-STUB the input type with a documented neutral shape rather than dropping the factor). Where a module reads Mongo documents, define plain input interfaces mirroring the fields it reads and document the mapping; do not reach into WorldState.

Everything stays side-effect free: no phase registration, no WorldState reads, no schema changes. The deliverable is a compiling, tested formula library with mainline behavior.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: modules ported, input-shape mappings, any factor whose test values changed and why, verification, commit hash.
