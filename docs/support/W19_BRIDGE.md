# W19 -> W38 Bridge: Opaque Regions

W19 models 3 opaque regions per playable country:

- US: `US-R1`, `US-R2`, `US-R3`
- UK: `UK-R1`, `UK-R2`, `UK-R3`
- RU: `RU-R1`, `RU-R2`, `RU-R3`
- DD: `DD-R1`, `DD-R2`, `DD-R3`

Total 12 regions. Each region owns:
- `PartyRegion` rows per party (org/reg)
- `ElectoratePool` (independent/unregistered)
- `RegionTurnout` modifiers
- `PartyPressure` per party

W38 replacement plan:

1. Content pack will ship real state tables (US 48 for 1953: the 48 contiguous states; AK/HI absent until statehood per mainline's 1950 Census apportionment and `states1953.ts`; UK ~11, RU 14, DD 15 Bezirke remain for W39).
2. Migration `v8 -> v9` will remap opaque ids to real ids:
   - **Bridge decision (US):** mainline has no explicit opaque-to-state mapping table, so W38 uses a deterministic **population-weighted (averaged) split**: pooled org/reg totals across `US-R1..R3` are averaged and assigned uniformly to all 48 new states (population weighting yields the same uniform result for percentage metrics; totals are preserved proportionally via population weight; sorted state tables ensure determinism). This preserves aggregate support investment without inventing a per-state delta. See `packages/engine/src/save.ts` v8->v9 and `packages/engine/src/world.ts` `seedSupport`.
   - Electorate pools: pooled independent/unregistered averaged and assigned uniformly.
   - Turnout modifiers copy current value to all new states in that country (neutral 0 to start, so copy is safe).
   - `Party.priorityRegion.regionIds` referencing US-Rx are dropped (no remap table; evicted).
   - `Party.psCapEarnedRegions` (already empty for W19) remains compatible.
   - UK/RU/DD remain opaque 3-region each until W39 (not remapped in this wave).
3. `PartyRegion` keys change from `US-Rx:<party>` to `STATE_ID:<party>`.
4. No election data depends on region ids yet, so remap is safe to run at load.

Determinism: W19 seeding uses no RNG; W38 remap must also be deterministic (sorted tables).

References: mainline `src/lib/constants/states.ts` (state tables), `src/lib/seeds/registration/*` for future lanes.
