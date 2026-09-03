import type { PartySeed, LegislatureSeed, StateSeed } from "../types.js";
import { jpRegions2019 } from "./jpRegions2019.js";
import { deRegions2019 } from "./deRegions2019.js";
import { cnRegions2019 } from "./cnRegions2019.js";
import { ieRegions2019 } from "./ieRegions2019.js";
/**
 * 2019-default post-Cold-War roster (JP/DE/CN/IE). Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/constants/historicalSeats.ts RESET_PRESETS["2019-default"].countries (the seeded roster) and the per-chamber seat tables named in each chamber note
 * - src/lib/seeds/{jp,de,cn,br,ie}/*Parties.ts filtered by validForPresets
 * - src/lib/constants/countries.ts COUNTRY_CONFIGS (chamber names/descriptions, bicameral flag)
 * - src/lib/npp/seedHistorical.ts SLUG_TO_NAME / INDEPENDENT_SLUGS (party slug resolution)
 *
 * Party ids follow the pack convention `${countryId}_${ABBREVIATION}`.
 * Independents and unrostered slugs are vacancies (1953 pack convention).
 */
export const ROSTER_2019_PARTIES: PartySeed[] = [
    { id: "JP_LDP", name: "Liberal Democratic Party", countryId: "JP", abbreviation: "LDP", color: "#2BA547", economicPosition: 2, socialPosition: 2 },
    { id: "JP_CDP", name: "Constitutional Democratic Party", countryId: "JP", abbreviation: "CDP", color: "#1E4D8C", economicPosition: -2, socialPosition: -2 },
    { id: "JP_KMT", name: "Komeito", countryId: "JP", abbreviation: "KMT", color: "#F5A623", economicPosition: 0, socialPosition: 0 },
    { id: "JP_JCP", name: "Japanese Communist Party", countryId: "JP", abbreviation: "JCP", color: "#D71920", economicPosition: -4, socialPosition: -3 },
    { id: "JP_ISH", name: "Nippon Ishin no Kai", countryId: "JP", abbreviation: "ISH", color: "#39B54A", economicPosition: 3, socialPosition: 1 },
    { id: "JP_DPFP", name: "Democratic Party for the People", countryId: "JP", abbreviation: "DPFP", color: "#FF6B00", economicPosition: 0, socialPosition: -1 },
    { id: "DE_SPD", name: "Sozialdemokratische Partei Deutschlands", countryId: "DE", abbreviation: "SPD", color: "#E3000F", economicPosition: -2, socialPosition: -2 },
    { id: "DE_CDU", name: "Christlich Demokratische Union", countryId: "DE", abbreviation: "CDU", color: "#000000", economicPosition: 2, socialPosition: 1 },
    { id: "DE_CSU", name: "Christlich-Soziale Union in Bayern", countryId: "DE", abbreviation: "CSU", color: "#0080C8", economicPosition: 2, socialPosition: 2 },
    { id: "DE_GRN", name: "Bündnis 90/Die Grünen", countryId: "DE", abbreviation: "GRN", color: "#64A12D", economicPosition: -2, socialPosition: -4 },
    { id: "DE_FDP", name: "Freie Demokratische Partei", countryId: "DE", abbreviation: "FDP", color: "#FFED00", economicPosition: 3, socialPosition: -1 },
    { id: "DE_LNK", name: "Die Linke", countryId: "DE", abbreviation: "LNK", color: "#BE3075", economicPosition: -4, socialPosition: -3 },
    { id: "DE_AFD", name: "Alternative für Deutschland", countryId: "DE", abbreviation: "AFD", color: "#009EE0", economicPosition: 2, socialPosition: 4 },
    { id: "CN_CCP", name: "Chinese Communist Party", countryId: "CN", abbreviation: "CCP", color: "#DE2910", economicPosition: -3, socialPosition: 2 },
    { id: "CN_CDL", name: "China Democratic League", countryId: "CN", abbreviation: "CDL", color: "#FFD700", economicPosition: -1, socialPosition: 0 },
    { id: "CN_CNDCA", name: "China National Democratic Construction Association", countryId: "CN", abbreviation: "CNDCA", color: "#1E90FF", economicPosition: 1, socialPosition: 0 },
    { id: "IE_FG", name: "Fine Gael", countryId: "IE", abbreviation: "FG", color: "#009DD6", economicPosition: 2, socialPosition: -2 },
    { id: "IE_FF", name: "Fianna Fáil", countryId: "IE", abbreviation: "FF", color: "#66BB00", economicPosition: 0, socialPosition: 0 },
    { id: "IE_SF", name: "Sinn Féin", countryId: "IE", abbreviation: "SF", color: "#326760", economicPosition: -3, socialPosition: -3 },
    { id: "IE_LAB", name: "Labour", countryId: "IE", abbreviation: "LAB", color: "#CC0000", economicPosition: -2, socialPosition: -2 },
    { id: "IE_GP", name: "Green Party", countryId: "IE", abbreviation: "GP", color: "#00B140", economicPosition: -1, socialPosition: -3 },
];

export const ROSTER_2019_LEGISLATURES: LegislatureSeed[] = [
  {
    countryId: "JP",
    name: "Kokkai",
    bicameral: true,
    chambers: [
      {
        // seats = sum jpRegions2019.houseDistricts (per-region shugiin races, mainline ensureJPElections); config 465; table sum 465 (28 independent/unrostered -> vacancies)
        key: "shugiin",
        name: "Shūgiin",
        shortName: "Shūgiin",
        seats: 465,
        elected: true,
        description: "465 members elected by FPTP from regional constituencies. Invests confidence in the Cabinet.",
        composition: { seatsByParty: {"JP_LDP":278,"JP_CDP":59,"JP_KMT":32,"JP_DPFP":43,"JP_JCP":14,"JP_ISH":11}, vacancies: 28 },
      },
      {
        // seats = sum constants/states.ts JP_SANGIIN_SEATS (per-region, two classes: class 1 ceil / class 2 floor per mainline JP_SANGIIN_2020 header); table sum 248 (15 independent/unrostered -> vacancies)
        key: "sangiin",
        name: "Sangiin",
        shortName: "Sangiin",
        seats: 248,
        elected: true,
        description: "248 councillors elected on staggered 6-year terms. Half are contested every 3 years. Cannot be dissolved.",
        composition: { seatsByParty: {"JP_LDP":115,"JP_CDP":34,"JP_KMT":30,"JP_JCP":15,"JP_DPFP":22,"JP_ISH":17}, vacancies: 15 },
      },
      {
        // seats = sum jpRegions2019.stateSenateSeats (per-region regionalCouncil races); table sum 2079 (0 independent/unrostered -> vacancies)
        key: "regionalCouncil",
        name: "Regional Council",
        shortName: "Regional Council",
        seats: 2679,
        elected: true,
        description: "Elected regional councillors representing Japan's regions.",
        composition: { seatsByParty: {"JP_LDP":1392,"JP_CDP":165,"JP_KMT":203,"JP_JCP":144,"JP_DPFP":45,"JP_ISH":130}, vacancies: 600 },
      },
    ],
  },
  {
    countryId: "DE",
    name: "Bundestag",
    bicameral: false,
    chambers: [
      {
        // seats = sum deRegions2019.houseDistricts = mainline DE_WAHLKREIS_SEATS per Land, the totalSeats mainline ensureDEElections gives each per-Land Bundestag race; config 630 (AMS list seats are PORT-STUB: AHDClient allocates per-Land seats by Hamilton PR); table sum 201 (0 independent/unrostered -> vacancies)
        key: "bundestag",
        name: "Bundestag",
        shortName: "Bundestag",
        seats: 299,
        elected: true,
        description: "630 members elected via mixed-member proportional representation (2023 reform).",
        composition: { seatsByParty: {"DE_SPD":56,"DE_CDU":42,"DE_GRN":32,"DE_FDP":25,"DE_AFD":23,"DE_LNK":11,"DE_CSU":12}, vacancies: 98 },
      },
      {
        // appointed by Land governments (mainline: no election, no seat table) -> vacant; table sum 0 (0 independent/unrostered -> vacancies)
        key: "bundesrat",
        name: "Bundesrat",
        shortName: "Bundesrat",
        seats: 69,
        elected: false,
        description: "69 members representing the 16 German Länder.",
        composition: { seatsByParty: {}, vacancies: 69 },
      },
      {
        // seats = sum deRegions2019.stateSenateSeats = DE_LANDTAG_SEATS per Land; table sum 1901 (65 independent/unrostered -> vacancies)
        key: "landtag",
        name: "Landtag",
        shortName: "Landtag",
        seats: 1901,
        elected: true,
        description: "Elected state legislature of each Bundesland.",
        composition: { seatsByParty: {"DE_GRN":255,"DE_CDU":492,"DE_AFD":272,"DE_SPD":472,"DE_FDP":118,"DE_CSU":84,"DE_LNK":143}, vacancies: 65 },
      },
    ],
  },
  {
    countryId: "CN",
    name: "National People's Congress",
    bicameral: false,
    chambers: [
      {
        // seats = sum cnRegions2019.houseDistricts = CN_NPC_SEATS per macro-region (mainline ensureCNElections getCnNpcSeats); table sum 2980 (0 independent/unrostered -> vacancies)
        key: "npc",
        name: "National People's Congress",
        shortName: "NPC",
        seats: 2980,
        elected: true,
        description: "2,980 delegates representing provinces, municipalities, autonomous regions, the armed forces, and special administrative regions. Five-year terms.",
        composition: { seatsByParty: {"CN_CCP":2822,"CN_CDL":105,"CN_CNDCA":53}, vacancies: 0 },
      },
      {
        // advisory body, appointed (mainline: no election, no seat table) -> vacant; table sum 0 (0 independent/unrostered -> vacancies)
        key: "cppcc",
        name: "CPPCC",
        shortName: "CPPCC",
        seats: 2169,
        elected: false,
        description: "2,169 members of the Chinese People's Political Consultative Conference - an advisory body representing diverse social and economic constituencies.",
        composition: { seatsByParty: {}, vacancies: 2169 },
      },
      {
        // seats = sum CN_PEOPLES_CONGRESS_SEATS (getCnPeoplesCongressSeats) which this pack stores as each region's senateSeats; the region doc's stateSenateSeats field is the separate appointed CPPCC per mainline constants/states.ts; table sum 4000 (0 independent/unrostered -> vacancies)
        key: "peoplesCongress",
        name: "People's Congress",
        shortName: "People's Congress",
        seats: 4000,
        elected: true,
        description: "Provincial People's Congresses - the elected legislatures of each macro-region, operating as the legislative arm of each Provincial People's Government. Members serve five-year terms.",
        composition: { seatsByParty: {"CN_CCP":3781,"CN_CDL":139,"CN_CNDCA":80}, vacancies: 0 },
      },
    ],
  },
  {
    countryId: "IE",
    name: "Oireachtas",
    bicameral: false,
    chambers: [
      {
        // seats = sum ieRegions2019.houseDistricts (per-region PR-STV Dail races, mainline ensureIEElections; STV itself is PORT-STUB, Hamilton PR allocates); table sum 160 (32 independent/unrostered -> vacancies)
        key: "dail",
        name: "Dáil Éireann",
        shortName: "Dáil",
        seats: 160,
        elected: true,
        description: "160 TDs elected by proportional representation using the Single Transferable Vote across multi-seat constituencies.",
        composition: { seatsByParty: {"IE_SF":37,"IE_FF":38,"IE_FG":35,"IE_GP":12,"IE_LAB":6}, vacancies: 32 },
      },
      {
        // vocational panels / nominees / universities: mainline seeds the table, spawns no election -> seeded, static; table sum 60 (12 independent/unrostered -> vacancies)
        key: "seanad",
        name: "Seanad Éireann",
        shortName: "Seanad",
        seats: 60,
        elected: false,
        description: "60 senators - 43 elected from vocational panels, 11 nominated by the Taoiseach, 6 from universities.",
        composition: { seatsByParty: {"IE_FF":18,"IE_FG":18,"IE_SF":5,"IE_GP":4,"IE_LAB":3}, vacancies: 12 },
      },
      {
        // seats = sum ieRegions2019.stateSenateSeats, the per-region seat count mainline ensureIELocalCouncilElections uses (config 200 is stale vs the region bundle); no seat table -> vacant; table sum 0 (0 independent/unrostered -> vacancies)
        key: "localCouncil",
        name: "Local Council",
        shortName: "Council",
        seats: 60,
        elected: true,
        description: "Elected councillors representing Ireland's NUTS-III planning regions, exercising delegated local-government functions.",
        composition: { seatsByParty: {}, vacancies: 60 },
      },
    ],
  },
];

export const ROSTER_2019_STATES: StateSeed[] = [...jpRegions2019, ...deRegions2019, ...cnRegions2019, ...ieRegions2019];
