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

1. Content pack will ship real state tables (US 51, UK ~11, RU 14, DD 15 Bezirke).
2. Migration `v8 -> v9` will remap opaque ids to real ids:
   - Preserve per-party org/reg by proportional split (opaque total pooled and redistributed equally or by historical lane mapping).
   - Electorate pools split equally.
   - Turnout modifiers copy current value to all new states in that country (neutral 0 to start, so copy is safe).
   - `Party.priorityRegion.regionIds` remapped via table; any opaque id not in remap is dropped (evicted).
   - `Party.psCapEarnedRegions` (already empty for W19) remains compatible.
3. `PartyRegion` keys change from `US-Rx:<party>` to `STATE_ID:<party>`.
4. No election data depends on region ids yet, so remap is safe to run at load.

Determinism: W19 seeding uses no RNG; W38 remap must also be deterministic (sorted tables).

References: mainline `src/lib/constants/states.ts` (state tables), `src/lib/seeds/registration/*` for future lanes.
