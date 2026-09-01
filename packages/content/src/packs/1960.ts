import type { SeedPack } from "../types.js";

/**
 * Generated from mainline AHDGame  -  DO NOT HAND-EDIT.
 * Source files: src/lib/seeds/reference/budgets.ts (NATIONAL_BUDGET_SEED_CONFIGS_1953 and _1979 for lerp), src/lib/seeds/eraInterpolation.ts (ERA_ANCHOR_YEARS, resolveEraBlend, lerpNumericTree), src/lib/constants/currencies.ts (INITIAL_RATES_1953 for GDP conversion), src/lib/seeds/reference/gdpDenomination.ts, src/lib/world/worldEntityManifest.ts (COLD_WAR_PLAYER)
 * Generated: 2026-09-01
 * See packages/content/scripts/generatePacks.ts for conversion notes.
 */
/**
 * 1960 is NOT an authored EraId in mainline (see presetSelector.ts EraId = 1953|1979|...; eraInterpolation.ts ERA_ANCHOR_YEARS).
 * No 1960 budget anchors exist. Values are derived per the brief's era-scale instruction:
 *  - growthRate/inflationRate: lerp between NATIONAL_BUDGET_SEED_CONFIGS_1953 and _1979 economicFactors via eraInterpolation.ts logic
 *    t = (1960-1953)/(1979-1953) = 7/26 applied to each country's gdpGrowth and inflationRate; countries without a 1979 peer clamp to 1953.
 *  - gdp: 1953 USD GDP (converted as in 1953 pack) compounded at 1953 gdpGrowth for 7 years (real growth only).
 *    This is a projection, not a historical nominal anchor  -  mainline has no 1960 nominal GDP table.
 *  - unemploymentRate: no 1979 peer table; reused from 1953 (same provenance as 1953 pack).
 * Playable set identical to 1953 (worldEntityManifest.ts COLD_WAR_PLAYER for 1953-default; 1960 is within that era's range).
 */
export const pack1960: SeedPack = {
  packVersion: 1,
  era: { id: "1960", label: "1960: Brink of Change", startDate: "1960-01-05" },
  countries: [
    {
      id: "US",
      name: "United States",
      playable: true,
      economy: { gdp: 530191, growthRate: 0.03765, inflationRate: 0.0359, unemploymentRate: 0.029 },
    },
    {
      id: "UK",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 53080, growthRate: 0.02331, inflationRate: 0.058, unemploymentRate: 0.018 },
    },
    {
      id: "RU",
      name: "Soviet Union",
      playable: true,
      economy: { gdp: 166345, growthRate: 0.04692, inflationRate: 0.00635, unemploymentRate: 0.005 },
    },
    {
      id: "FR",
      name: "France",
      playable: false,
      economy: { gdp: 59797, growthRate: 0.03446, inflationRate: 0.04735, unemploymentRate: 0.02 },
    },
    {
      id: "IT",
      name: "Italy",
      playable: false,
      economy: { gdp: 26418, growthRate: 0.05827, inflationRate: 0.05812, unemploymentRate: 0.08 },
    },
    {
      id: "ES",
      name: "Spain",
      playable: false,
      economy: { gdp: 5743, growthRate: 0.01731, inflationRate: 0.0715, unemploymentRate: 0.045 },
    },
    {
      id: "SE",
      name: "Sweden",
      playable: false,
      economy: { gdp: 8859, growthRate: 0.03581, inflationRate: 0.03765, unemploymentRate: 0.025 },
    },
    {
      id: "TR",
      name: "Turkey",
      playable: false,
      economy: { gdp: 16179, growthRate: 0.06808, inflationRate: 0.2025, unemploymentRate: 0.05 },
    },
    {
      id: "GR",
      name: "Greece",
      playable: false,
      economy: { gdp: 2676, growthRate: 0.06004, inflationRate: 0.11692, unemploymentRate: 0.06 },
    },
    {
      id: "AT",
      name: "Austria",
      playable: false,
      economy: { gdp: 4021, growthRate: 0.03458, inflationRate: 0.02458, unemploymentRate: 0.045 },
    },
    {
      id: "FI",
      name: "Finland",
      playable: false,
      economy: { gdp: 3683, growthRate: 0.02481, inflationRate: 0.03481, unemploymentRate: 0.03 },
    },
    {
      id: "DE",
      name: "West Germany",
      playable: false,
      economy: { gdp: 58162, growthRate: 0.07342, inflationRate: 0.00958, unemploymentRate: 0.084 },
    },
    {
      id: "JP",
      name: "Japan",
      playable: false,
      economy: { gdp: 47163, growthRate: 0.08004, inflationRate: 0.05719, unemploymentRate: 0.02 },
    },
    {
      id: "CN",
      name: "China",
      playable: false,
      economy: { gdp: 88579, growthRate: 0.13008, inflationRate: 0.03096, unemploymentRate: 0.045 },
    },
    {
      id: "BR",
      name: "Brazil",
      playable: false,
      economy: { gdp: 23887, growthRate: 0.05012, inflationRate: 0.26631, unemploymentRate: 0.05 },
    },
    {
      id: "IE",
      name: "Ireland",
      playable: false,
      economy: { gdp: 1057, growthRate: 0.02146, inflationRate: 0.05381, unemploymentRate: 0.05 },
    },
    {
      id: "NG",
      name: "Nigeria",
      playable: false,
      economy: { gdp: 4326, growthRate: 0.04038, inflationRate: 0.05369, unemploymentRate: 0.03 },
    },
    {
      id: "DD",
      name: "East Germany",
      playable: true,
      economy: { gdp: 14641, growthRate: 0.02865, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "HU",
      name: "Hungary",
      playable: false,
      economy: { gdp: 6361, growthRate: 0.03365, inflationRate: 0.03269, unemploymentRate: 0.005 },
    },
    {
      id: "PL",
      name: "Poland",
      playable: false,
      economy: { gdp: 16449, growthRate: 0.04, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "RO",
      name: "Romania",
      playable: false,
      economy: { gdp: 7539, growthRate: 0.035, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "YU",
      name: "Yugoslavia",
      playable: false,
      economy: { gdp: 8442, growthRate: 0.05, inflationRate: 0.05, unemploymentRate: 0.01 },
    },
    {
      id: "BG",
      name: "Bulgaria",
      playable: false,
      economy: { gdp: 3440, growthRate: 0.04, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BLR",
      name: "Belarus",
      playable: false,
      economy: { gdp: 7817, growthRate: 0.05, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "UKR",
      name: "Ukraine",
      playable: false,
      economy: { gdp: 47142, growthRate: 0.055, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "CS",
      name: "Czechoslovakia",
      playable: false,
      economy: { gdp: 10080, growthRate: 0.045, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BAL",
      name: "Baltic Republics",
      playable: false,
      economy: { gdp: 4410, growthRate: 0.045, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
  ],
};
