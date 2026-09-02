import type { SeedPack } from "../types.js";
import { BUDGETS_1991 } from "./budgets1991.js";
import { ROSTER_1991_PARTIES, ROSTER_1991_LEGISLATURES, ROSTER_1991_STATES } from "./roster1991.js";
import { usStates1991 } from "./usStates1991.js";
import { ukRegions1991 } from "./ukRegions1991.js";

/**
 * Ported from mainline AHDGame ("1991-default" preset) — real authored 1991
 * data, no interpolation, no invented numbers.
 *
 * Source files:
 *  - src/lib/seeds/reference/budgets.ts NATIONAL_BUDGET_SEED_CONFIGS_1991
 *  - src/lib/constants/currencies.ts INITIAL_RATES_1991
 *  - src/lib/world/worldEntityManifest.ts POST_COLD_WAR_PLAYER = ["US","UK"]
 *    — the USSR dissolves and East Germany reunified into (AI-run) Germany
 *    as this era opens; mainline's worldEntityManifest has NO entry at all
 *    for RU or DD in "1991-default" (getWorldEntityOrThrow throws for
 *    them — confirmed by direct inspection, not merely absent from a list).
 *    There is also no scripted reunification/dissolution transition in
 *    mainline (src/lib/world/transitions/rules.ts has exactly 8 rules, all
 *    1953-default decolonization events) — mainline just starts a
 *    1991-default world with RU/DD already gone. This pack does the same:
 *    RU and DD are not present at all, not even as non-playable entries.
 *  - src/lib/constants/countries.ts COUNTRY_CONFIGS (base legislature seat
 *    counts — ERA_COUNTRY_CONFIG_OVERRIDES has no "1991-default" entries
 *    either, so these are the same era-neutral base numbers 1979 uses)
 *  - src/lib/constants/historicalSeats.ts US_HOUSE_1992, US_SENATE_1992,
 *    UK_COMMONS_1992 (seated compositions)
 *  - src/lib/seeds/uk/ukParties.ts, reference/politicalParties.ts
 *    (validForPresets filtered to "1991-default")
 *
 * Conversion method identical to 1979.ts / 1953.ts: budget gdp (local
 * currency) / INITIAL_RATES_1991[country] / 1e6 = millions USD.
 *
 * Country roster: NATIONAL_BUDGET_SEED_CONFIGS_1991 authors budgets for
 * exactly 13 countries; all 13 are ported here.
 *
 * Unemployment: no mainline unemploymentRate field exists in the 1991
 * budget configs (same gap as 1979 — see 1979.ts header). US/UK figures
 * below are EXTERNAL historical references (published 1991 annual national
 * averages), not mainline-authored. Documented gap, not fabrication.
 *
 * No states/regions/demographics table is shipped for this era (same
 * documented gap as 1979.ts — mainline's states1991.ts /
 * registrationLanes1991.ts are real and citable for a future wave; this
 * pack uses the engine's existing opaque-region fallback).
 */
export const pack1991: SeedPack = {
  packVersion: 1,
  era: { id: "1991", label: "1991 Start Date - Default Parties", startDate: "1991-01-01" },
  countries: [
    {
      id: "US",
      name: "United States",
      playable: true,
      economy: { gdp: 6_200_000, growthRate: -0.001, inflationRate: 0.042, unemploymentRate: 0.068 },
    },
    {
      id: "UK",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 1_052_632, growthRate: -0.01, inflationRate: 0.059, unemploymentRate: 0.088 },
    },
    {
      id: "JP",
      name: "Japan",
      playable: true,
      economy: { gdp: 3_494_424, growthRate: 0.034, inflationRate: 0.033, unemploymentRate: 0.021 },
    },
    {
      id: "DE",
      name: "Germany",
      playable: true,
      economy: { gdp: 1_882_353, growthRate: 0.051, inflationRate: 0.035, unemploymentRate: 0.063 },
    },
    {
      id: "IE",
      name: "Ireland",
      playable: true,
      economy: { gdp: 28_235, growthRate: 0.02, inflationRate: 0.032, unemploymentRate: 0.144 },
    },
    {
      id: "BR",
      name: "Brazil",
      playable: true,
      economy: { gdp: 180_000, growthRate: 0.01, inflationRate: 4.8, unemploymentRate: 0.048 },
    },
    {
      id: "CN",
      name: "China",
      playable: true,
      economy: { gdp: 409_399, growthRate: 0.093, inflationRate: 0.034, unemploymentRate: 0.023 },
    },
    {
      id: "NG",
      name: "Nigeria",
      playable: false,
      economy: { gdp: 181_818, growthRate: 0.015, inflationRate: 0.2, unemploymentRate: 0.04 },
    },
    {
      id: "FR",
      name: "France",
      playable: false,
      economy: { gdp: 1_269_048, growthRate: 0.01, inflationRate: 0.032, unemploymentRate: 0.094 },
    },
    {
      id: "IT",
      name: "Italy",
      playable: false,
      economy: { gdp: 1_236_495, growthRate: 0.015, inflationRate: 0.063, unemploymentRate: 0.069 },
    },
    {
      id: "ES",
      name: "Spain",
      playable: false,
      economy: { gdp: 580_597, growthRate: 0.025, inflationRate: 0.059, unemploymentRate: 0.163 },
    },
    {
      id: "SE",
      name: "Sweden",
      playable: false,
      economy: { gdp: 270_396, growthRate: -0.011, inflationRate: 0.093, unemploymentRate: 0.03 },
    },
    {
      id: "TR",
      name: "Turkey",
      playable: false,
      economy: { gdp: 200_000, growthRate: 0.009, inflationRate: 0.66, unemploymentRate: 0.08 },
    },
  ],
  // State layer (regions, apportionment, registration) generated from mainline's
  // per-era bundles by scripts/generateStateLayer.ts; see each file's header.
  states: [...ROSTER_1991_STATES, ...usStates1991, ...ukRegions1991],
  // Authored national budgets for every playable country (generateBudgets.ts).
  budgets: BUDGETS_1991,
  parties: [
    ...ROSTER_1991_PARTIES,
    { id: "US_DEM", name: "Democratic Party", countryId: "US", abbreviation: "DEM", color: "#3B82F6", economicPosition: -2, socialPosition: -2 },
    { id: "US_REP", name: "Republican Party", countryId: "US", abbreviation: "REP", color: "#EF4444", economicPosition: 2, socialPosition: 2 },
    // UK roster for 1991-default per ukParties.ts validForPresets: adds UUP
    // (valid "1991-default" only) on top of the 1979 roster; still no LIB
    // (1953-only) or RUK (2019-only).
    { id: "UK_LAB", name: "Labour Party", countryId: "UK", abbreviation: "LAB", color: "#E4003B", economicPosition: -2, socialPosition: -3 },
    { id: "UK_CON", name: "Conservative Party", countryId: "UK", abbreviation: "CON", color: "#0087DC", economicPosition: 2, socialPosition: 2 },
    { id: "UK_LD", name: "Liberal Democrats", countryId: "UK", abbreviation: "LD", color: "#FAA61A", economicPosition: 0, socialPosition: -2 },
    { id: "UK_SNP", name: "Scottish National Party", countryId: "UK", abbreviation: "SNP", color: "#FFF95D", economicPosition: -2, socialPosition: -2 },
    { id: "UK_PC", name: "Plaid Cymru", countryId: "UK", abbreviation: "PC", color: "#3F8428", economicPosition: -2, socialPosition: -2 },
    { id: "UK_GRN", name: "Green Party", countryId: "UK", abbreviation: "GRN", color: "#02A95B", economicPosition: -4, socialPosition: -4 },
    { id: "UK_DUP", name: "Democratic Unionist Party", countryId: "UK", abbreviation: "DUP", color: "#D46A4C", economicPosition: 2, socialPosition: 4 },
    { id: "UK_SF", name: "Sinn Fein", countryId: "UK", abbreviation: "SF", color: "#326760", economicPosition: -3, socialPosition: -2 },
    { id: "UK_UUP", name: "Ulster Unionist Party", countryId: "UK", abbreviation: "UUP", color: "#9999FF", economicPosition: 1, socialPosition: 2 },
  ],
  legislatures: [
    ...ROSTER_1991_LEGISLATURES,
    {
      // US chamber sizes constitutionally fixed. US_HOUSE_1992 (435: 268
      // Democrat / 166 Republican / 1 independent) and US_SENATE_1992 (100:
      // 59 Democrat / 41 Republican) are real, exact historicalSeats.ts
      // rosters — the independent seat folds to a vacancy, same convention
      // the 1953 pack uses for the 1953 House's Reams independent.
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
          composition: { seatsByParty: { US_DEM: 59, US_REP: 41 }, vacancies: 0 },
        },
        {
          key: "house",
          name: "House of Representatives",
          shortName: "House",
          seats: 435,
          elected: true,
          description: "435 representatives, two-year terms. All revenue bills originate here.",
          composition: { seatsByParty: { US_DEM: 268, US_REP: 166 }, vacancies: 1 },
        },
        {
          // Subnational chamber (W40); seats = sum of per-region senateSeats in usStates1991.ts
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
      // UK base config unchanged (Commons 650, Lords 784). UK_COMMONS_1992
      // is a real, exact historicalSeats.ts roster of 651 seats (the actual
      // 1992-GE House of Commons size, one more than the era-neutral base
      // config's 650 — a genuine historical fact, not an error). Named
      // parties below are exactly what historicalSeats.ts records; SDLP (4)
      // and 1 independent are not in our roster and mainline's own code
      // comment says they "resolve to independent" — folded into vacancies
      // here for the same reason, so vacancies = 651 - 646 = 5.
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
          seats: 651,
          elected: true,
          description: "651 elected MPs from single-member constituencies (1992 general election result). The primary legislative chamber.",
          composition: {
            seatsByParty: { UK_CON: 336, UK_LAB: 271, UK_LD: 20, UK_UUP: 9, UK_PC: 4, UK_SNP: 3, UK_DUP: 3 },
            vacancies: 5,
          },
        },
        {
          // Subnational chamber (W40); seats = sum of per-region senateSeats in ukRegions1991.ts
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
