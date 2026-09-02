# W61: post-Cold-War playable rosters (1991: +JP/DE/CN/BR/IE, 2019: +JP/DE/CN/IE)

## Why
The authoritative roster is what each preset SEEDS with full political depth
(`constants/historicalSeats.ts` RESET_PRESETS[...].countries), i.e. what the
owner had open, not the newer `worldEntityManifest.ts` access gate
(`POST_COLD_WAR_PLAYER = US/UK`), which is narrower than the seeded worlds:

| Preset | Seeded roster (authoritative) | Rotunda today |
|---|---|---|
| 1953 | US, UK, RU, DD | matches |
| 1979 | US, UK, RU, DD | matches |
| 1991 | **US, UK, JP, DE, CN, BR, IE** (102nd Congress, post-1992 UK, post-1990 JP, 12th Bundestag, 7th NPC, 49th BR Congress, 27th Dail) | US, UK only |
| 2019 | **US, UK, JP, DE, CN, IE** (116th Congress, post-2019 UK, Jan-2020 Diet, 19th Bundestag, 13th NPC, 33rd Dail) | US, UK only |

Both later packs must open every seeded country. Seat tables exist for all of
them: JP_SHUGIIN_1990, DE_BUNDESTAG_1990, CN_NPC_1991, BR_CHAMBER_1991,
BR_SENATE_1991, IE_DAIL_1991, IE_SEANAD_1991, JP_SANGIIN_1989, JP_REGIONAL_COUNCIL_1991,
CN_PEOPLES_CONGRESS_1991, DE_LANDTAG_1990, DE_MINISTERPRAESIDENTEN_1992, and the
2020/2021 set listed below. BR sources: `seeds/br/brRegions*.ts`, `brParties.ts`,
`brGovernmentFormation.ts`, `brLegislationTypes.ts`, registration via
build1991RegistrationSeeds (BR:5), Layer-1 model via getCountryLayer1Model("BR").

## Doctrine (unchanged)
Mainline `/root/projects/AHDGame` is read-only source of truth. Every number
ports with a `// source:` citation; anything mainline lacks is `PORT-STUB`
with a named blocker. Engine purity holds. Generators run FROM the mainline
checkout (`cd /root/projects/AHDGame && npx tsx <script>`) so `@/` resolves;
see `packages/content/scripts/generateStateLayer.ts` for the pattern.

## Mainline sources (all verified present)
| Need | Source |
|---|---|
| Country config (chambers, offices, election systems, coalition thresholds) | `src/lib/constants/countries.ts` COUNTRY_CONFIGS.{JP,DE,IE,CN} |
| Regions (2019 bundle) | `seeds/jp/jpRegions.ts` (8), `seeds/de/deRegions.ts` (16 Laender), `seeds/ie/ieRegions.ts` (8), `seeds/cn/cnRegions.ts` (7 macro-regions) |
| Seated compositions | `constants/historicalSeats.ts` JP_SHUGIIN_2020, JP_SANGIIN_2020 (by class), JP_REGIONAL_COUNCIL_2020, JP_GOVERNORS_2020, DE_BUNDESTAG_2021, DE_LANDTAG_2020, DE_MINISTERPRAESIDENTEN_2020, IE_DAIL_2020, IE_SEANAD_2020, CN_NPC_2020, CN_PEOPLES_CONGRESS_2020, CN_GOVERNORS_2020 |
| Parties | `seeds/{jp,de,ie,cn}/{jp,de,ie,cn}Parties.ts` filtered `validForPresets` includes "2019-default" (JP 6, DE 7, IE 5, CN 3) |
| Registration / org | JP, DE: `registration/registrationLanes.ts` buildAllRegistrationSeeds. IE: `seeds/ie/ieStatePartyOrgCalculations.ts` calculateIEPartyOrg(voteShare) over `ieRegionVoteShares` (pure formula; the DB wrapper only maps slugs). CN: `seeds/cn/cnStatePartyOrgCalculations.ts` getCnRegionOrg(2019) (registration mirrors organization per row, per seedCnStatePartyOrg.ts) |
| Demographics | `seeds/international` getCountryLayer1Model({JP,DE,IE,CN}, "2019") + `international/derive.ts` buildModelRegionDemographics (same path admin/seed/seed{JP,DE,IE,CN}.ts run) |
| Seat maps for CN | `constants/states.ts` getCnNpcSeats / getCnPeoplesCongressSeats (modern bundle for 2019) |
| Government formation | `seeds/{jp,de,ie,cn}/*GovernmentFormation.ts` (majorityThreshold 233 / 316 / 81 / 1491 = chamber/2+1, same rule as Rotunda `computeFormation`) |
| Election spawn semantics | `turn/perpetualElections.ts` ensureJPElections (shugiin per region, totalSeats = region houseDistricts), ensureJPCouncillorElections (sangiin, two classes, half seats per class per region, 6-year cycle), ensureJPRegionalCouncilElections, ensureJPGovernorElections (regional governor spawner, 8 regions, 4-year), ensureDEElections (bundestag per Land, snap_bundestag), DE landtag per Land + ministerPresident, ensureIEElections (dail per region PR-STV, totalSeats = houseDistricts), IE seanad, ensureIEUachtaranElections (nationwide head of state), ensureCNElections (npcDelegate per region, seats getCnNpcSeats), ensureCNPeoplesCongressElections, ensureCNGovernorElections |
| Cycle anchors | already ported: `electionEngine/resolution/canonicalCycle.ts` cases shugiin, sangiin, bundestag, landtag, npcDelegate, peoplesCongress, dail, snap_shugiin, uachtaran |
| Head of state | IE uachtaran = direct nationwide election (`elections/nationwideExecutive.ts`); CN president = `headOfStateSelection: "partyChairSync"` (tracks CCP chair); JP Emperor / DE Bundespraesident ceremonial (no office to port) |
| Economic model | COUNTRY_CONFIGS.seedEconomicModel["2019"]: JP industrialPowerhouse, DE socialMarket, IE techInnovation, CN industrialPowerhouse (extend `metrics/economicModel.ts` archetype switch, which hardcodes US/UK/RU/DD) |
| Legislation catalogs | `seeds/{jp,de,ie,cn}/*LegislationTypes.ts` (63 / 60 / 58 / 62 types) |

## Rotunda surfaces to extend
1. **Pack `packages/content/src/packs/2019.ts`**: flip JP/DE/IE/CN `playable: true`; add legislatures (JP shugiin 465 + sangiin 248 + regionalCouncil 2679; DE bundestag 630 + bundesrat 69 (appointed, `elected: false`) + landtag 1901; IE dail 160 + seanad 60 + localCouncil (sum of region upper seats); CN npc 2980 + cppcc 2169 (`elected: false`) + peoplesCongress 4000) with 2020/2021 compositions from the seat tables; parties; `states` from a generator extension (`generateStateLayer.ts` gains jp/de/ie/cn 2019 regions + registration + demographics -> `engine/src/demographics/{jp,de,ie,cn}Demographics2019.ts`).
2. **Election orchestration** `elections/orchestration.ts` electionSeriesForWorld: per-region specs for shugiin / sangiin (class split) / regionalCouncil / governor (JP); bundestag per Land / landtag per Land / ministerPresident as the "governor" analogue (DE); dail per region / seanad national / uachtaran nationwide (IE); npcDelegate per region / peoplesCongress per region / governor per region (CN). Seat sums must equal chamber seats (content test enforces).
3. **Government** `government/constants.ts`: GOVERNMENT_CHAMBER_BY_COUNTRY += JP shugiin, DE bundestag, IE dail, CN npc; BASE_ELECTION_TYPE_BY_CHAMBER += shugiin, bundestag, dail, npcDelegate; SNAP_ELECTION_TYPE_BY_CHAMBER += snap_shugiin, snap_bundestag (mainline names), snap_dail, snap_npcDelegate (Rotunda-native, add to MULTI_SEAT_TYPES). Sangiin cannot be dissolved (config `snapElectionsAllowed: false`).
4. **Executives** `executive/`: PM-type heads of government already come from formation (UK path) — reuse for JP/DE/IE/CN. IE uachtaran = presidential-style nationwide race reusing the US president path with a country switch. CN president via partyChairSync = the CCP chair id. Regional executives (JP governors, DE Minister-Presidents, CN governors) reuse the governor path keyed by country.
5. **Country gates to widen**: `legislation/catalog.ts` countryId union + STUBBED_IDS; `metrics/economicModel.ts` archetype switch; `demographics/census.ts` and `elections/seatGeography.ts` are US-only by design (House apportionment) and stay; `cabinet/phases.ts` (cabinetEligibleChamberKeys from config: JP shugiin+sangiin); `judiciary` stays US/UK.
6. **HoS mode**: rulingPartyIdForCountry uses GOVERNMENT_CHAMBER_BY_COUNTRY, so it generalises once (3) lands.
7. **Legislation catalogs (M2)**: port the four *LegislationTypes.ts catalogs (~240 types) via a generator into `legislation/catalog.ts` per-country sections. Blocking systems that do not exist in Rotunda get PORT-STUB entries exactly as US/UK/RU/DD do today.
8. **Desktop**: `worldMap/idMap.ts` already maps JP/DE/IE/CN; launcher reads `listPlayableCountries(era)` so no UI change beyond era-themed copy.

## Milestones
- **M1 (playable)**: pack data + state layer + orchestration + government/executive wiring; a 2019 JP/DE/IE/CN world runs 400 turns with every elected chamber at capacity, a head of government formed, and invariants green. QA sweep (`verify:qa`) adds the four combos.
- **M2 (depth)**: legislation catalogs + economic model archetypes + cabinet eligibility.

## Definition of done
`npm run verify` EXIT:0; `npm run verify:qa` green for 2019 x {US,UK,JP,DE,IE,CN}; content seat-sum tests extended to the new chambers; ROADMAP row W61 added; no invented numbers.
