# Brief: removing the fabricated era ladder, shipping real 1979/1991/2019 packs

## What was wrong

`docs/briefs/seed-packs.md` (the original brief that stood up era-keyed
packs) explicitly asked for a "1960 pack: same countries, anchors moved
plausibly seven years forward" — an instruction to fabricate data, taken
literally. The result:

- `packages/engine/src/calendar.ts` hardcoded a four-era ladder
  (1953/1960/1968/1976) with no pack backing 1968 or 1976 at all.
- `packages/content/src/packs/1960.ts` existed and was interpolation-derived
  (lerped between 1953 and 1979 mainline budget anchors, GDP compounded
  forward), not sourced from any real 1960 mainline data.
- Mainline (`Egg3901/AHDGame`) has never had a "1960" preset. Its real
  `EraId` union (`src/lib/seeds/presetSelector.ts`) is
  `"1953" | "1979" | "1991" | "1999" | "2007" | "2019" | "2023"`. Rotunda's
  own `src/lib/constants/countries.test.ts:770` cites exactly
  `1953-default`/`1979-default`/`1991-default`/`2019-default` as the
  four presets this port targets.

## What changed

- Deleted `packages/content/src/packs/1960.ts` and the 1960-generation code
  in `packages/content/scripts/generatePacks.ts`.
- Added real `1979.ts`, `1991.ts`, `2019.ts` packs, hand-authored (not
  script-generated, unlike 1953) from mainline's actual
  `NATIONAL_BUDGET_SEED_CONFIGS_{1979,1991}` and base (2019-default) budget
  tables, `INITIAL_RATES_{1979,1991}` and base FX tables, `COUNTRY_CONFIGS`
  base legislature seat counts (mainline's `ERA_COUNTRY_CONFIG_OVERRIDES`
  has zero entries beyond 1953-default — these ARE the real numbers, not an
  override gap), `historicalSeats.ts` seated compositions where they exist,
  and `validForPresets`-filtered party rosters. Every pack's file header
  cites its exact mainline sources and documents what was NOT portable
  (unemployment, states/regions/demographics, some legislature
  compositions) rather than inventing it. See each pack file for the full
  citation.
- `packages/engine/src/calendar.ts`'s `eraForDate` is now data-driven off
  `PACKS_BY_DATE` instead of a hardcoded ladder. A new `nextEraForDate`
  handles the one genuine back-compat wrinkle: a save created before this
  fix can carry `meta.era === "1960"`; that value has no pack any more, so
  plain `eraForDate` would either regress it to "1953" or (for "1968"/"1976",
  which never had packs) already threw nothing useful. `nextEraForDate`
  keeps a legacy save's era label stable until the calendar reaches the
  next real pack (1979), then promotes forward correctly.
- Schema bumped 34 -> 40 (v35-v39 pre-allocated stubs for parallel waves;
  see `save.ts` resolver note). v40 adds `meta.legacyEra: boolean`,
  backfilled true only for saves whose era isn't one of the four real pack
  ids — currently only reachable via "1960".
- `packages/engine/src/elections/orchestration.ts`'s `cycleContextForWorld`
  was hardcoded to always return the 1953-default preset regardless of the
  world's actual era — a real bug (any 1979/1991/2019 world silently ran
  its election-cycle timing on 1953's real-election-year anchors). Now maps
  `world.meta.era` through a new `eraToPreset()` helper
  (`electionEngine/resolution/constants.ts`) to the matching mainline
  preset id, and derives `startingYear` from it.
- `commodity/constants.ts`, `forex/regime.ts`, `forex/founding.ts`: removed
  hardcoded "1960" special-casing (kept only where it's genuinely serving
  legacy-save back-compat), and made FX seeding era-aware
  (`getInitialRatesForEra`) using the same real 1979/1991/2019 tables the
  new packs use, instead of always seeding every era from the 1953 table.
- UI: `apps/desktop/src/launcher/CommandGlobe.tsx` era theme map now has
  four entries (1953 phosphor green unchanged; 1979 amber, 1991 cyan, 2019
  cooler modern default — palettes are Rotunda's own CRT styling choice,
  not mainline-sourced, mainline has no UI theme data to port). The world
  creation screen (`apps/desktop/src/App.tsx`) got the same era-chip
  treatment the launcher already had, replacing a plain `<select>`.

## What was deliberately NOT done (documented gaps, not fabrication)

- **Subnational depth** (states/regions, demographics, voter registration)
  for 1979/1991/2019: mainline has real, citable source files
  (`states1979.ts`, `states1991.ts`, `ukRegions{1979,1991,1999}.ts`,
  `registrationLanes{1979,1991}.ts`, `stateCensusData{1979,1991}.ts`) but
  porting them (50+ US states x 2 eras, plus UK regions x 3 eras, each with
  population/gdp/apportionment/registration) is out of scope for this pass.
  The engine's existing opaque-3-region fallback (already used pre-W38/W39,
  and for the deleted 1960 pack) seeds support/electorate state for these
  packs instead.
- **2019 playable roster**: mainline's own 2019-default resolves
  playability from `COUNTRY_CONFIGS.status === "active"`, which is US, UK,
  JP, DE, IE, CN (six countries). This pack ships only US/UK as playable,
  matching the depth already built for 1991 — JP/DE/IE/CN get real economy
  numbers but no party/legislature depth, so marking them `playable: true`
  would let a player select into a broken world. Deferred to a future wave.
- **1979 Hungary**: excluded from the pack entirely. Mainline's
  `INITIAL_RATES_1979` has no HU entry (Eastern-bloc satellites besides DD
  aren't forex-active in 1979-default), so there's no non-invented way to
  convert its authored budget GDP to USD millions.
- **Third legislative chamber** (US stateSenate, UK regionalCouncil, RU
  republicSupremeSoviet, DD landAssembly): the 1953 pack models these from
  real per-state seat-sum data; no equivalent per-era subnational data was
  ported for 1979/1991/2019, so those packs are two-chamber only (matching
  mainline's own `COUNTRY_CONFIGS.legislature` shape more literally than
  1953's Rotunda-added extension does, in fact).
- **Union/corp sector weights and historical union names**: still reused
  from `SECTOR_WEIGHTS_1953`/`HISTORICAL_1953` for every era. Mainline has
  real `sectorSeedWeights{1979,1991,2019...}.ts` and per-era
  `UNION_NAMES_BY_ERA` tables; porting them is deferred (pre-existing
  simplification, not introduced by this fix — see `unions/founding.ts`).
- **Unemployment rates** for 1979/1991/2019: mainline's budget configs
  don't carry this field. A handful of figures are mainline-cited directly
  (US 1979 5.8%, DE 1979 3.4%); the rest are external historical references
  (published national annual averages), explicitly labeled as such in each
  pack's header — not presented as mainline-authored.

## Verification

`npm run verify` (typecheck + test, all workspaces), `npm run build:web
--workspace apps/desktop`, and `cargo check` in `apps/desktop/src-tauri`
per `docs/FRAMEWORK.md`. See the commit history on `feat/era-truth` for
exit-code confirmation of each.
