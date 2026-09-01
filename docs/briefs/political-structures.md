# Brief: port political structures (parties and legislatures), no election logic

Read `docs/FRAMEWORK.md` first. You own `packages/engine` and `packages/content`. Do not touch `apps/desktop`, `README.md`, or `docs/` beyond reading. Package scopes are `@rotunda/engine` and `@rotunda/content`. Country ids are uppercase mainline `CountryId` (`US`, `UK`, `RU`, `DD`, ...).

## Source of truth (READ-ONLY)

Mainline at `/root/projects/AHDGame`. Relevant: `src/lib/constants/countries.ts` (COUNTRY_CONFIGS, legislature shapes), `src/lib/seeds/<country>/` (party seeds), `src/lib/seeds/defaultPartyTiers.ts`, party and legislature model shapes wherever mainline defines them. **Live production-shared tree: read only, no git, no npm there.**

## Goal

WorldState gains the political skeleton the election systems will later run on: parties and legislatures, seeded from mainline data for every playable country (US, UK, RU, DD) in both eras. Election resolution, voting, campaigning are explicitly OUT of scope.

## Deliverables

1. **Types in engine**: `Party` (id, name, country, ideological position in whatever axis system mainline uses at the country level: port mainline's representation, do not invent a new one) and `Legislature` (chambers with names and seat counts per mainline's per-country config; note which chambers are elected vs appointed if mainline distinguishes). Seats hold party allocations (`Record<partyId, number>`) plus vacancy count; individual politicians are a later wave.
2. **Content pack extension**: parties and legislature composition per playable country per era, ported from mainline seeds (1953) and mainline's era data for 1960 where it exists; document derivation where it does not, citing sources, no invented numbers. Extend `validatePack` accordingly (seat allocations sum to chamber size, party refs resolve).
3. **World creation**: `createWorld` populates parties and legislatures for the chosen era. Non-playable countries may have empty political structures for now.
4. **Schema**: bump `SCHEMA_VERSION` to 3 with forward migration (empty structures for old saves) and a migration test, same pattern as v2.
5. **Tests**: pack validation for the new tables, deterministic creation, seat-sum invariants, migration.

## Rules

- Determinism doctrine binding. Run `npm install` first. Merge gate: `npm run verify` green from repo root.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: mainline sources used, shape decisions, per-country seat data ported, anything mainline lacked.
