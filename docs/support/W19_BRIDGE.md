# W19 -> W39 Bridge: Opaque Regions

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

W38 replacement plan (shipped):

1. Content pack shipped real US state tables (US 48 for 1953: the 48 contiguous states; AK/HI absent until statehood per mainline's 1950 Census apportionment and `states1953.ts`).
2. Migration `v9 -> v10` remapped opaque US ids to real ids:
   - **Bridge decision (US):** mainline has no explicit opaque-to-state mapping table, so W38 uses a deterministic **population-weighted (averaged) split**: pooled org/reg totals across `US-R1..R3` are averaged and assigned uniformly to all 48 new states (population weighting yields the same uniform result for percentage metrics; totals are preserved proportionally via population weight; sorted state tables ensure determinism). This preserves aggregate support investment without inventing a per-state delta. See `packages/engine/src/save.ts` v9->v10 and `packages/engine/src/world.ts` `seedSupport`.
   - Electorate pools: pooled independent/unregistered averaged and assigned uniformly.
   - Turnout modifiers copy current value to all new states in that country (neutral 0 to start, so copy is safe).
   - `Party.priorityRegion.regionIds` referencing US-Rx are dropped (no remap table; evicted).
   - `Party.psCapEarnedRegions` (already empty for W19) remains compatible.
3. `PartyRegion` keys change from `US-Rx:<party>` to `STATE_ID:<party>`.
4. No election data depends on region ids yet, so remap is safe to run at load.

W39 replacement plan (this wave):

1. Content pack ships real subdivisions for the remaining three playable countries at mainline's 1953 granularity:
   - UK: 12 electoral regions (mainline `src/lib/seeds/uk/ukRegions1953.ts` — 1951 Census, 625 commons). Mainline models UK at region level, not per-constituency; W39 ports that granularity (see ukRegions1953.ts header: "Phase 1 uses the 12 UK electoral regions as the top-level playable units. A future phase will expand to all 650 individual constituencies.").
   - RU: 14 regions (10 RSFSR macro-regions + KAZ/TRA/CAS/MOL) from `src/lib/seeds/ru/ruRegions1953.ts` (1939/1950 Census, 526 Soviet of the Union seats).
   - DD: 6 Laender (BEO/MV/BB/ST/SN/TH) from `src/lib/seeds/dd/ddRegions1953.ts` (18.4M, 500 Volkskammer) per the W16 report.
   Total for 1953 pack: 80 states (48 US +12 UK +14 RU +6 DD). Population, gdp, houseSeats (commons/Union/Volkskammer), senateSeats (regional council/supreme soviet/landtag), region, registration anchors, and census/org data are cited per file; no invented numbers. SenateClasses for UK/RU/DD have no mainline Senate-class table (FPTP Commons / Soviet / Volkskammer have no staggered classes) so neutral [1,2] placeholder is used and documented.
2. Migration `v15 -> v18` (pre-allocated 18; parallel waves hold 16 and 17) remaps opaque ids to real ids for UK, RU, DD using the same deterministic averaged-split approach as W38:
   - **Bridge decision (UK/RU/DD):** same as US — pooled org/reg totals across `UK-R1..R3` (resp. RU, DD) are averaged and assigned uniformly to all new subdivisions for that country. Electorate pools averaged, turnout modifiers copied, priorityRegion ids filtered, deterministic via sorted tables. See `packages/engine/src/save.ts` v15->v18 and `packages/engine/src/world.ts` `seedSupport`.
   - Real registration tables for new worlds use per-region anchors from `registrationLanes1953.ts` (UK polling 51 via `UK_REGION_POLLING_1951` org = max(3, round(voteShare*0.6)), RU `RU_REGION_ORG_1953` CPSU 91-98, DD `DD_REGION_ORG_1953` SED 54-66 + bloc parties). Census tables from `ukRegionCensusData1953.ts`, `ruRegionCensusData1953.ts`, `ddRegionCensusData1953.ts`.
   - Demographics for new regions: new worlds use Layer1-derived tables via `ukDemographics1953.ts` / `ruDemographics1953.ts` / `ddDemographics1953.ts` (derived via `src/lib/seeds/international/derive.ts` from census × positions × composition). Migration seeds uniform stubs for old saves so tally has input.
3. Demographics: `CATEGORIES_BY_COUNTRY_1953` already provided UK/RU/DD categories (W16). W39 activates the real tally path by shipping `UK_DEMOGRAPHICS_1953` (12), `RU_DEMOGRAPHICS_1953` (14), `DD_DEMOGRAPHICS_1953` (6) derived from Layer1 models (`src/lib/seeds/international/uk.ts`, `ru.ts`, `dd.ts` POSITIONS_1953) via `derive.ts`. No gaps: mainline has census + positions + composition for all three, so derivation yields compatible StateDemographics shape. Documented per file.
4. Schema: migration is `latest -> 18`; note for merge resolver that 16/17 are held by parallel waves.

Determinism: W19 seeding uses no RNG; W38 and W39 remaps are deterministic (sorted tables).

References: mainline `src/lib/constants/states.ts` (US), `src/lib/seeds/uk/ukRegions1953.ts`, `src/lib/seeds/ru/ruRegions1953.ts` + `ruRegionCensusData1953.ts` + `ruStatePartyOrgCalculations.ts`, `src/lib/seeds/dd/ddRegions1953.ts` + `ddRegionCensusData1953.ts` + `ddStatePartyOrgCalculations.ts`, `src/lib/seeds/registration/registrationLanes1953.ts`, `src/lib/seeds/international/derive.ts` + `uk.ts`/`ru.ts`/`dd.ts`.
