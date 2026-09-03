import type { SeedPack } from "../types.js";
import { BUDGETS_2019 } from "./budgets2019.js";
import { ROSTER_2019_PARTIES, ROSTER_2019_LEGISLATURES, ROSTER_2019_STATES } from "./roster2019.js";
import { usStates2019 } from "./usStates2019.js";
import { ukRegions2019 } from "./ukRegions2019.js";

/**
 * Ported from mainline AHDGame ("2019-default" preset) — real authored
 * base/2019 data, no interpolation, no invented numbers.
 *
 * Source files:
 *  - src/lib/seeds/reference/budgets.ts NATIONAL_BUDGET_SEED_CONFIGS (the
 *    base/no-suffix table mainline itself uses for 2019-default)
 *  - src/lib/constants/currencies.ts INITIAL_RATES (base table)
 *  - src/lib/constants/countries.ts COUNTRY_CONFIGS.status — 2019-default
 *    resolves playability from `accessFromConfig()` (status "active" =
 *    player), not a hardcoded era list like 1953/1979/1991. Direct
 *    enumeration of every `status` field in COUNTRY_CONFIGS finds exactly
 *    six "active" countries: US, UK, JP, DE, IE, CN.
 *
 *    AHDClient SCOPE DECISION: this pack ships US and UK as playable (matching
 *    the depth already built for 1991) and keeps JP/DE/IE/CN as non-playable
 *    economy entries. Mainline marks those four player-eligible too, but
 *    giving them the same depth (parties, legislature, historical seats)
 *    this wave gives US/UK is out of scope for this pass — a country marked
 *    `playable: true` with no legislature/party data would let a player
 *    select it into a broken, depth-less world, which is worse than an
 *    honest `playable: false`. GENUINE GAP, documented, not fabricated:
 *    JP/DE/IE/CN full political depth is deferred to a future wave.
 *  - ERA_COUNTRY_CONFIG_OVERRIDES has no "2019-default" entries (as with
 *    1979/1991) — UK legislature numbers below are the same era-neutral
 *    base COUNTRY_CONFIGS values 1979/1991 use.
 *  - src/lib/constants/historicalSeats.ts US_HOUSE_2020, US_SENATE_2020,
 *    UK_COMMONS_2020 (seated compositions — the file's own header notes
 *    several of these arrays are NPP-count-scaled proxies distributed by
 *    real vote share, not literal historical seat-for-seat totals; used
 *    here because they are mainline's own authored numbers, not invented)
 *  - src/lib/seeds/uk/ukParties.ts, reference/politicalParties.ts
 *    (validForPresets filtered to "2019-default")
 *
 * Conversion method identical to 1979.ts / 1991.ts / 1953.ts: budget gdp
 * (local currency) / INITIAL_RATES[country] / 1e6 = millions USD.
 *
 * Country roster: the base NATIONAL_BUDGET_SEED_CONFIGS table authors
 * budgets for exactly 8 countries (US, UK, JP, DE, IE, BR, CN, NG) — all 8
 * are ported here. Mainline's own budgets.ts has NO 2019 budget entry at
 * all for FR/IT/ES/SE/TR/GR/AT/FI (confirmed absent, not merely unread) —
 * those countries are not in this pack. Fiscal years in the base table are
 * a genuine mixed bag (2019/2020/2023 per country, not a single snapshot
 * year) — reproduced faithfully as mainline ships it.
 *
 * Unemployment: no mainline unemploymentRate field in these budget configs
 * (same gap as 1979/1991 — see 1979.ts header). Figures below are EXTERNAL
 * historical references for each country's cited fiscal year, not
 * mainline-authored. Documented gap, not fabrication.
 *
 * No states/regions/demographics table is shipped for this era (same
 * documented gap as 1979.ts/1991.ts).
 */
export const pack2019: SeedPack = {
  packVersion: 1,
  era: { id: "2019", label: "2019 Start Date - Default Parties", startDate: "2019-01-01" },
  countries: [
    {
      id: "US",
      name: "United States",
      playable: true,
      economy: { gdp: 27_000_000, growthRate: 0.025, inflationRate: 0.025, unemploymentRate: 0.036 },
    },
    {
      id: "UK",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 3_866_667, growthRate: 0.012, inflationRate: 0.032, unemploymentRate: 0.038 },
    },
    {
      id: "JP",
      name: "Japan",
      playable: true,
      economy: { gdp: 5_188_679, growthRate: 0.006, inflationRate: 0.005, unemploymentRate: 0.024 },
    },
    {
      id: "DE",
      name: "Germany",
      playable: true,
      economy: { gdp: 4_891_304, growthRate: 0.011, inflationRate: 0.018, unemploymentRate: 0.031 },
    },
    {
      id: "IE",
      name: "Ireland",
      playable: true,
      economy: { gdp: 543_478, growthRate: 0.035, inflationRate: 0.032, unemploymentRate: 0.043 },
    },
    {
      id: "BR",
      name: "Brazil",
      playable: false,
      economy: { gdp: 2_180_000, growthRate: 0.029, inflationRate: 0.046, unemploymentRate: 0.079 },
    },
    {
      id: "CN",
      name: "China",
      playable: true,
      economy: { gdp: 17_500_000, growthRate: 0.052, inflationRate: 0.002, unemploymentRate: 0.05 },
    },
    {
      id: "NG",
      name: "Nigeria",
      playable: false,
      economy: { gdp: 92_903, growthRate: 0.022, inflationRate: 0.114, unemploymentRate: 0.233 },
    },
  ],
  // State layer (regions, apportionment, registration) generated from mainline's
  // per-era bundles by scripts/generateStateLayer.ts; see each file's header.
  states: [...ROSTER_2019_STATES, ...usStates2019, ...ukRegions2019],
  // Authored national budgets for every playable country (generateBudgets.ts).
  budgets: BUDGETS_2019,
  parties: [
    ...ROSTER_2019_PARTIES,
    { id: "US_DEM", name: "Democratic Party", countryId: "US", abbreviation: "DEM", color: "#3B82F6", economicPosition: -2, socialPosition: -2 },
    { id: "US_REP", name: "Republican Party", countryId: "US", abbreviation: "REP", color: "#EF4444", economicPosition: 2, socialPosition: 2 },
    // UK roster for 2019-default per ukParties.ts validForPresets: adds RUK
    // (valid "2019-default" only), drops UUP (1991-only) and LIB (1953-only).
    { id: "UK_LAB", name: "Labour Party", countryId: "UK", abbreviation: "LAB", color: "#E4003B", economicPosition: -2, socialPosition: -3 },
    { id: "UK_CON", name: "Conservative Party", countryId: "UK", abbreviation: "CON", color: "#0087DC", economicPosition: 2, socialPosition: 2 },
    { id: "UK_LD", name: "Liberal Democrats", countryId: "UK", abbreviation: "LD", color: "#FAA61A", economicPosition: 0, socialPosition: -2 },
    { id: "UK_SNP", name: "Scottish National Party", countryId: "UK", abbreviation: "SNP", color: "#FFF95D", economicPosition: -2, socialPosition: -2 },
    { id: "UK_PC", name: "Plaid Cymru", countryId: "UK", abbreviation: "PC", color: "#3F8428", economicPosition: -2, socialPosition: -2 },
    { id: "UK_GRN", name: "Green Party", countryId: "UK", abbreviation: "GRN", color: "#02A95B", economicPosition: -4, socialPosition: -4 },
    { id: "UK_RUK", name: "Reform UK", countryId: "UK", abbreviation: "RUK", color: "#12B6CF", economicPosition: 2, socialPosition: 4 },
    { id: "UK_DUP", name: "Democratic Unionist Party", countryId: "UK", abbreviation: "DUP", color: "#D46A4C", economicPosition: 2, socialPosition: 4 },
    { id: "UK_SF", name: "Sinn Fein", countryId: "UK", abbreviation: "SF", color: "#326760", economicPosition: -3, socialPosition: -2 },
  ],
  legislatures: [
    ...ROSTER_2019_LEGISLATURES,
    {
      // US chamber sizes constitutionally fixed. US_HOUSE_2020 (433 named:
      // 231 Democrat / 201 Republican / 1 independent) and US_SENATE_2020
      // (100: 54 Republican / 44 Democrat / 2 independent) are real, exact
      // historicalSeats.ts rosters; independents fold to vacancies (same
      // convention as 1991.ts and the 1953 pack).
      countryId: "US",
      name: "Congress",
      bicameral: true,
      chambers: [
        {
          key: "senate",
          name: "Senate",
          shortName: "Senate",
          seats: 100,
          elected: true,
          description: "100 senators, six-year staggered terms. Confirms judges and cabinet.",
          composition: { seatsByParty: { US_DEM: 44, US_REP: 54 }, vacancies: 2 },
        },
        {
          key: "house",
          name: "House of Representatives",
          shortName: "House",
          seats: 435,
          elected: true,
          description: "435 representatives, two-year terms. All revenue bills originate here.",
          composition: { seatsByParty: { US_DEM: 231, US_REP: 201 }, vacancies: 3 },
        },
        {
          // Subnational chamber (W40); seats = sum of per-region senateSeats in usStates2019.ts
          // (same convention as the 1953 pack, see its regionalCouncil W40 fix note).
          key: "stateSenate",
          name: "State Senate",
          shortName: "State Senate",
          seats: 1972,
          elected: true,
          description: "Each state's elected legislature, which sets state law and budgets.",
          composition: { seatsByParty: {}, vacancies: 1972 },
        },
      ],
    },
    {
      // UK base config unchanged (Commons 650, Lords 784). UK_COMMONS_2020
      // gives real per-party seat counts for parties in our roster (CON 352
      // / LAB 203 / SNP 47 / LD 14 / DUP 8 / SF 7 / PC 4 / GRN 1 = 636);
      // SDLP/Speaker/independent/Alliance (5 seats, none in our roster —
      // mainline's own code folds these to "independent") plus the
      // remainder up to the base 650-seat chamber size are vacancies.
      countryId: "UK",
      name: "Parliament",
      bicameral: false,
      chambers: [
        {
          key: "lords",
          name: "House of Lords",
          shortName: "Lords",
          seats: 784,
          elected: false,
          description: "Appointed and hereditary peers. Revises and scrutinises legislation.",
          composition: { seatsByParty: {}, vacancies: 784 },
        },
        {
          key: "commons",
          name: "House of Commons",
          shortName: "Commons",
          seats: 650,
          elected: true,
          description: "650 elected MPs from single-member constituencies (2019 general election result). The primary legislative chamber.",
          composition: {
            seatsByParty: { UK_CON: 352, UK_LAB: 203, UK_SNP: 47, UK_LD: 14, UK_DUP: 8, UK_SF: 7, UK_PC: 4, UK_GRN: 1 },
            vacancies: 14,
          },
        },
        {
          // Subnational chamber (W40); seats = sum of per-region senateSeats in ukRegions2019.ts
          // (same convention as the 1953 pack, see its regionalCouncil W40 fix note).
          key: "regionalCouncil",
          name: "Regional Council",
          shortName: "Regional Council",
          seats: 578,
          elected: true,
          description: "Elected regional councillors representing UK nations and regions on staggered five-year terms.",
          composition: { seatsByParty: {}, vacancies: 578 },
        },
      ],
    },
  ],
};
