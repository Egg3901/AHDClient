import type { PartySeed, LegislatureSeed, StateSeed } from "../types.js";
import { jpRegions1991 } from "./jpRegions1991.js";
import { deRegions1991 } from "./deRegions1991.js";
import { cnRegions1991 } from "./cnRegions1991.js";
import { brRegions1991 } from "./brRegions1991.js";
import { ieRegions1991 } from "./ieRegions1991.js";
/**
 * 1991-default post-Cold-War roster (JP/DE/CN/BR/IE). Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/constants/historicalSeats.ts RESET_PRESETS["1991-default"].countries (the seeded roster) and the per-chamber seat tables named in each chamber note
 * - src/lib/seeds/{jp,de,cn,br,ie}/*Parties.ts filtered by validForPresets
 * - src/lib/constants/countries.ts COUNTRY_CONFIGS (chamber names/descriptions, bicameral flag)
 * - src/lib/npp/seedHistorical.ts SLUG_TO_NAME / INDEPENDENT_SLUGS (party slug resolution)
 *
 * Party ids follow the pack convention `${countryId}_${ABBREVIATION}`.
 * Independents and unrostered slugs are vacancies (1953 pack convention).
 */
export const ROSTER_1991_PARTIES: PartySeed[] = [
    { id: "JP_LDP", name: "Liberal Democratic Party", countryId: "JP", abbreviation: "LDP", color: "#2BA547", economicPosition: 2, socialPosition: 2 },
    { id: "JP_KMT", name: "Komeito", countryId: "JP", abbreviation: "KMT", color: "#F5A623", economicPosition: 0, socialPosition: 0 },
    { id: "JP_JCP", name: "Japanese Communist Party", countryId: "JP", abbreviation: "JCP", color: "#D71920", economicPosition: -4, socialPosition: -3 },
    { id: "JP_JSP", name: "Japan Socialist Party", countryId: "JP", abbreviation: "JSP", color: "#C8102E", economicPosition: -3, socialPosition: -2 },
    { id: "JP_DSP", name: "Democratic Socialist Party", countryId: "JP", abbreviation: "DSP", color: "#0E5FAA", economicPosition: -1, socialPosition: -1 },
    { id: "DE_SPD", name: "Sozialdemokratische Partei Deutschlands", countryId: "DE", abbreviation: "SPD", color: "#E3000F", economicPosition: -2, socialPosition: -2 },
    { id: "DE_CDU", name: "Christlich Demokratische Union", countryId: "DE", abbreviation: "CDU", color: "#000000", economicPosition: 2, socialPosition: 1 },
    { id: "DE_CSU", name: "Christlich-Soziale Union in Bayern", countryId: "DE", abbreviation: "CSU", color: "#0080C8", economicPosition: 2, socialPosition: 2 },
    { id: "DE_GRN", name: "Bündnis 90/Die Grünen", countryId: "DE", abbreviation: "GRN", color: "#64A12D", economicPosition: -2, socialPosition: -4 },
    { id: "DE_FDP", name: "Freie Demokratische Partei", countryId: "DE", abbreviation: "FDP", color: "#FFED00", economicPosition: 3, socialPosition: -1 },
    { id: "DE_PDS", name: "Partei des Demokratischen Sozialismus", countryId: "DE", abbreviation: "PDS", color: "#8E44AD", economicPosition: -4, socialPosition: -3 },
    { id: "CN_CCP", name: "Chinese Communist Party", countryId: "CN", abbreviation: "CCP", color: "#DE2910", economicPosition: -3, socialPosition: 2 },
    { id: "CN_CDL", name: "China Democratic League", countryId: "CN", abbreviation: "CDL", color: "#FFD700", economicPosition: -1, socialPosition: 0 },
    { id: "CN_CNDCA", name: "China National Democratic Construction Association", countryId: "CN", abbreviation: "CNDCA", color: "#1E90FF", economicPosition: 1, socialPosition: 0 },
    { id: "BR_PT", name: "Partido dos Trabalhadores", countryId: "BR", abbreviation: "PT", color: "#EE2027", economicPosition: -3, socialPosition: -2 },
    { id: "BR_PSD", name: "PSD", countryId: "BR", abbreviation: "PSD", color: "#007A32", economicPosition: 1, socialPosition: 0 },
    { id: "BR_PMDB", name: "Partido do Movimento Democrático Brasileiro", countryId: "BR", abbreviation: "PMDB", color: "#36A9E0", economicPosition: 0, socialPosition: 0 },
    { id: "BR_PFL", name: "Partido da Frente Liberal", countryId: "BR", abbreviation: "PFL", color: "#FF8C00", economicPosition: 2, socialPosition: 2 },
    { id: "BR_PDT", name: "Partido Democrático Trabalhista", countryId: "BR", abbreviation: "PDT", color: "#FF1744", economicPosition: -2, socialPosition: -1 },
    { id: "BR_PDS", name: "Partido Democrático Social", countryId: "BR", abbreviation: "PDS", color: "#005AA7", economicPosition: 2, socialPosition: 3 },
    { id: "BR_PTB", name: "Partido Trabalhista Brasileiro", countryId: "BR", abbreviation: "PTB", color: "#00A859", economicPosition: 1, socialPosition: 1 },
    { id: "BR_PRN", name: "Partido da Reconstrução Nacional", countryId: "BR", abbreviation: "PRN", color: "#FFCC00", economicPosition: 1, socialPosition: 1 },
    { id: "BR_PSB", name: "Partido Socialista Brasileiro", countryId: "BR", abbreviation: "PSB", color: "#FFD200", economicPosition: -2, socialPosition: -2 },
    { id: "BR_PCDOB", name: "Partido Comunista do Brasil", countryId: "BR", abbreviation: "PCDOB", color: "#C00000", economicPosition: -4, socialPosition: -2 },
    { id: "IE_FG", name: "Fine Gael", countryId: "IE", abbreviation: "FG", color: "#009DD6", economicPosition: 2, socialPosition: -2 },
    { id: "IE_FF", name: "Fianna Fáil", countryId: "IE", abbreviation: "FF", color: "#66BB00", economicPosition: 0, socialPosition: 0 },
    { id: "IE_LAB", name: "Labour", countryId: "IE", abbreviation: "LAB", color: "#CC0000", economicPosition: -2, socialPosition: -2 },
    { id: "IE_WP", name: "Workers' Party", countryId: "IE", abbreviation: "WP", color: "#C8102E", economicPosition: -4, socialPosition: -2 },
    { id: "IE_PD", name: "Progressive Democrats", countryId: "IE", abbreviation: "PD", color: "#7B68EE", economicPosition: 3, socialPosition: -1 },
];

export const ROSTER_1991_LEGISLATURES: LegislatureSeed[] = [
  {
    countryId: "JP",
    name: "Kokkai",
    bicameral: true,
    chambers: [
      {
        // seats = sum jpRegions1991.houseDistricts (per-region shugiin races, mainline ensureJPElections); config 465; table sum 512 (26 independent/unrostered -> vacancies)
        key: "shugiin",
        name: "Shūgiin",
        shortName: "Shūgiin",
        seats: 511,
        elected: true,
        description: "465 members elected by FPTP from regional constituencies. Invests confidence in the Cabinet.",
        composition: { seatsByParty: {"JP_LDP":275,"JP_JSP":136,"JP_KMT":45,"JP_JCP":16,"JP_DSP":14}, vacancies: 25 },
      },
      {
        // seats = sum constants/states.ts JP_SANGIIN_SEATS (per-region, two classes: class 1 ceil / class 2 floor per mainline JP_SANGIIN_2020 header); table sum 206 (14 independent/unrostered -> vacancies)
        key: "sangiin",
        name: "Sangiin",
        shortName: "Sangiin",
        seats: 248,
        elected: true,
        description: "248 councillors elected on staggered 6-year terms. Half are contested every 3 years. Cannot be dissolved.",
        composition: { seatsByParty: {"JP_LDP":101,"JP_JSP":40,"JP_KMT":28,"JP_JCP":14,"JP_DSP":9}, vacancies: 56 },
      },
      {
        // seats = sum jpRegions1991.stateSenateSeats (per-region regionalCouncil races); table sum 2679 (593 independent/unrostered -> vacancies)
        key: "regionalCouncil",
        name: "Regional Council",
        shortName: "Regional Council",
        seats: 2679,
        elected: true,
        description: "Elected regional councillors representing Japan's regions.",
        composition: { seatsByParty: {"JP_LDP":1315,"JP_JSP":384,"JP_KMT":209,"JP_JCP":115,"JP_DSP":63}, vacancies: 593 },
      },
    ],
  },
  {
    countryId: "DE",
    name: "Bundestag",
    bicameral: false,
    chambers: [
      {
        // seats = sum deRegions1991.houseDistricts = mainline DE_WAHLKREIS_SEATS per Land, the totalSeats mainline ensureDEElections gives each per-Land Bundestag race; config 630 (AMS list seats are PORT-STUB: AHDClient allocates per-Land seats by Hamilton PR); table sum 672 (0 independent/unrostered -> vacancies); scaled 672 -> 305 proportionally (largest remainder)
        key: "bundestag",
        name: "Bundestag",
        shortName: "Bundestag",
        seats: 305,
        elected: true,
        description: "630 members elected via mixed-member proportional representation (2023 reform).",
        composition: { seatsByParty: {"DE_SPD":108,"DE_CDU":122,"DE_GRN":8,"DE_FDP":36,"DE_CSU":23,"DE_PDS":8}, vacancies: 0 },
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
        // seats = sum deRegions1991.stateSenateSeats = DE_LANDTAG_SEATS per Land; table sum 1901 (5 independent/unrostered -> vacancies)
        key: "landtag",
        name: "Landtag",
        shortName: "Landtag",
        seats: 1987,
        elected: true,
        description: "Elected state legislature of each Bundesland.",
        composition: { seatsByParty: {"DE_CDU":719,"DE_SPD":759,"DE_GRN":115,"DE_FDP":101,"DE_CSU":128,"DE_PDS":74}, vacancies: 91 },
      },
    ],
  },
  {
    countryId: "CN",
    name: "National People's Congress",
    bicameral: false,
    chambers: [
      {
        // seats = sum cnRegions1991.houseDistricts = CN_NPC_SEATS per macro-region (mainline ensureCNElections getCnNpcSeats); table sum 2980 (0 independent/unrostered -> vacancies)
        key: "npc",
        name: "National People's Congress",
        shortName: "NPC",
        seats: 2980,
        elected: true,
        description: "2,980 delegates representing provinces, municipalities, autonomous regions, the armed forces, and special administrative regions. Five-year terms.",
        composition: { seatsByParty: {"CN_CCP":2892,"CN_CDL":59,"CN_CNDCA":29}, vacancies: 0 },
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
        composition: { seatsByParty: {"CN_CCP":3867,"CN_CDL":87,"CN_CNDCA":46}, vacancies: 0 },
      },
    ],
  },
  {
    countryId: "BR",
    name: "National Congress",
    bicameral: true,
    chambers: [
      {
        // seats = sum brRegions1991.houseDistricts (per-region Camara races, mainline ensureBRElections); config 513 is the modern count; table sum 503 (82 independent/unrostered -> vacancies)
        key: "chamber",
        name: "Chamber of Deputies",
        shortName: "Chamber",
        seats: 503,
        elected: true,
        description: "513 deputies elected by open-list proportional representation from 27 multi-member constituencies. Four-year terms.",
        composition: { seatsByParty: {"BR_PMDB":108,"BR_PFL":82,"BR_PDT":46,"BR_PDS":42,"BR_PTB":38,"BR_PRN":40,"BR_PT":35,"BR_PSB":11,"BR_PCDOB":5,"BR_PSD":14}, vacancies: 82 },
      },
      {
        // seats = sum brRegions1991.stateSenateSeats (per-region Senado races, mainline ensureBRSenateElections); staggered 1/3-2/3 renewal is PORT-STUB (single class); table sum 81 (13 independent/unrostered -> vacancies)
        key: "senate",
        name: "Federal Senate",
        shortName: "Senate",
        seats: 81,
        elected: true,
        description: "81 senators - three per state - serving eight-year staggered terms. Reviews legislation from the Chamber.",
        composition: { seatsByParty: {"BR_PMDB":26,"BR_PFL":16,"BR_PDT":7,"BR_PT":1,"BR_PRN":4,"BR_PDS":9,"BR_PTB":5}, vacancies: 13 },
      },
    ],
  },
  {
    countryId: "IE",
    name: "Oireachtas",
    bicameral: false,
    chambers: [
      {
        // seats = sum ieRegions1991.houseDistricts (per-region PR-STV Dail races, mainline ensureIEElections; STV itself is PORT-STUB, Hamilton PR allocates); table sum 160 (8 independent/unrostered -> vacancies)
        key: "dail",
        name: "Dáil Éireann",
        shortName: "Dáil",
        seats: 160,
        elected: true,
        description: "160 TDs elected by proportional representation using the Single Transferable Vote across multi-seat constituencies.",
        composition: { seatsByParty: {"IE_FF":72,"IE_FG":53,"IE_LAB":14,"IE_WP":7,"IE_PD":6}, vacancies: 8 },
      },
      {
        // vocational panels / nominees / universities: mainline seeds the table, spawns no election -> seeded, static; table sum 60 (2 independent/unrostered -> vacancies)
        key: "seanad",
        name: "Seanad Éireann",
        shortName: "Seanad",
        seats: 60,
        elected: false,
        description: "60 senators - 43 elected from vocational panels, 11 nominated by the Taoiseach, 6 from universities.",
        composition: { seatsByParty: {"IE_FF":30,"IE_FG":16,"IE_LAB":5,"IE_PD":6,"IE_WP":1}, vacancies: 2 },
      },
      {
        // seats = sum ieRegions1991.stateSenateSeats, the per-region seat count mainline ensureIELocalCouncilElections uses (config 200 is stale vs the region bundle); no seat table -> vacant; table sum 0 (0 independent/unrostered -> vacancies)
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

export const ROSTER_1991_STATES: StateSeed[] = [...jpRegions1991, ...deRegions1991, ...cnRegions1991, ...brRegions1991, ...ieRegions1991];
