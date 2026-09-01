# Brief: deterministic politician generation onto the political skeleton

Read `docs/FRAMEWORK.md` first. You own `packages/engine` (and `packages/content` only if a pack field is genuinely required). Do not touch `apps/desktop` or `packages/cli` (another agent owns it).

## Source of truth (READ-ONLY)

Mainline at `/root/projects/AHDGame`: `src/lib/npp/generator.ts` (challenger/NPC generation: ideology jitter, age, attributes), plus anything it imports. The name generator is ALREADY ported at `packages/engine/src/npp/nameGenerator.ts`; use it, do not re-port. **Live production tree: read only.**

## Goal

`createWorld` populates named NPC politicians holding the seats that the v3 legislatures allocate by party, so a world boots with a real cast: every allocated seat in an elected chamber of a playable country is held by a generated politician.

## Deliverables

1. **`Politician` type**: id (deterministic, e.g. sequential per country), name, gender, countryId, partyId, chamber key, ideology (mainline's economic/social axes, jittered around the party position using mainline's jitter logic and bounds from `generator.ts`, cited), age (mainline's distribution, cited). Skip attributes with no consumer yet; list what you skipped.
2. **World population**: for each playable country, elected chambers, `seatsByParty` counts become that many politicians; vacancies stay vacant. Appointed chambers and subnational chambers may stay empty this wave; document. All randomness from the world creation rng so identical options give identical casts.
3. **Schema v4** + forward migration (empty politicians for old saves) + migration test, following the v2/v3 pattern.
4. **Tests**: determinism (identical casts for identical options), seat-count match (politician count per chamber equals allocated seats), party consistency, ideology within bounds and centered near party position, name pools match country.

## Rules

- Determinism doctrine binding. Run `npm install` first. Merge gate: `npm run verify` green from repo root.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: mainline logic ported, distributions used, skipped attributes, verification.
