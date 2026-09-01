import type { SeedPack } from "../types.js";

/**
 * Generated from mainline AHDGame  -  DO NOT HAND-EDIT.
 * Source files: src/lib/seeds/reference/budgets.ts (NATIONAL_BUDGET_SEED_CONFIGS_1953 + makeEasternBlocBudget1953), src/lib/seeds/reference/gdpDenomination.ts (GDP_DENOMINATION_1953), src/lib/constants/currencies.ts (INITIAL_RATES_1953), src/lib/constants/countries.ts (COUNTRY_CONFIGS names), src/lib/world/worldEntityManifest.ts (COLD_WAR_PLAYER), src/lib/seeds/[country]/[country]MetricPresets1953.ts and ddStateMetrics1953.ts (unemployment where authored), src/lib/seeds/reference/stateMetrics1953.ts (UNEMP_1953 comment for US)
 * Generated: 2026-09-01
 * See packages/content/scripts/generatePacks.ts for conversion notes.
 */
/**
 * Conversions:
 *  - gdp: mainline stores GDP in local currency (or USD-anchored for IT/JP/CN/NG per gdpDenomination.ts).
 *    Converted to millions USD via INITIAL_RATES_1953 (currencies.ts). USD-anchored values divided by 1e6 only.
 *  - growthRate/inflationRate: mainline stores as percent (e.g. 4.6 = 4.6%). Divided by 100 to fractions as EconomySeed expects.
 *  - unemploymentRate: where NATIONAL_1953 carries economic.unemploymentRate (FR/IT/ES/SE/TR/GR/AT/FI/CN and DD baseline 0.5), used directly.
 *    Otherwise: US 2.9 via stateMetrics1953.ts UNEMP_1953/BLS; UK 1.8 historical; DE 8.4 Statistisches Bundesamt;
 *    JP 2.0 historical; IE/BR/NG via matchingFriction proxy; RU and eastern-bloc satellites at planned 0.5 (DD proxy, YU 1.0 self-management).
 * Playable: worldEntityManifest.ts COLD_WAR_PLAYER = US/UK/RU/DD for 1953-default; rest economy-preview/hidden.
 * Ids: kept as mainline CountryId values (uppercase, e.g. US not us) for cross-repo alignment.
 */
export const pack1953: SeedPack = {
  packVersion: 1,
  era: { id: "1953", label: "1953: Cold War Dawn", startDate: "1953-01-06" },
  countries: [
    {
      id: "US",
      name: "United States",
      playable: true,
      economy: { gdp: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029 },
    },
    {
      id: "UK",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 40336, growthRate: 0.04, inflationRate: 0.03, unemploymentRate: 0.018 },
    },
    {
      id: "RU",
      name: "Soviet Union",
      playable: true,
      economy: { gdp: 114352, growthRate: 0.055, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "FR",
      name: "France",
      playable: false,
      economy: { gdp: 47000, growthRate: 0.035, inflationRate: 0.025, unemploymentRate: 0.02 },
    },
    {
      id: "IT",
      name: "Italy",
      playable: false,
      economy: { gdp: 17000, growthRate: 0.065, inflationRate: 0.025, unemploymentRate: 0.08 },
    },
    {
      id: "ES",
      name: "Spain",
      playable: false,
      economy: { gdp: 5000, growthRate: 0.02, inflationRate: 0.04, unemploymentRate: 0.045 },
    },
    {
      id: "SE",
      name: "Sweden",
      playable: false,
      economy: { gdp: 6963, growthRate: 0.035, inflationRate: 0.025, unemploymentRate: 0.025 },
    },
    {
      id: "TR",
      name: "Turkey",
      playable: false,
      economy: { gdp: 8571, growthRate: 0.095, inflationRate: 0.045, unemploymentRate: 0.05 },
    },
    {
      id: "GR",
      name: "Greece",
      playable: false,
      economy: { gdp: 1667, growthRate: 0.07, inflationRate: 0.09, unemploymentRate: 0.06 },
    },
    {
      id: "AT",
      name: "Austria",
      playable: false,
      economy: { gdp: 3269, growthRate: 0.03, inflationRate: 0.02, unemploymentRate: 0.045 },
    },
    {
      id: "FI",
      name: "Finland",
      playable: false,
      economy: { gdp: 3435, growthRate: 0.01, inflationRate: 0.02, unemploymentRate: 0.03 },
    },
    {
      id: "DE",
      name: "West Germany",
      playable: false,
      economy: { gdp: 32857, growthRate: 0.085, inflationRate: -0.002, unemploymentRate: 0.084 },
    },
    {
      id: "JP",
      name: "Japan",
      playable: false,
      economy: { gdp: 25800, growthRate: 0.09, inflationRate: 0.065, unemploymentRate: 0.02 },
    },
    {
      id: "CN",
      name: "China",
      playable: false,
      economy: { gdp: 33300, growthRate: 0.15, inflationRate: 0.035, unemploymentRate: 0.045 },
    },
    {
      id: "BR",
      name: "Brazil",
      playable: false,
      economy: { gdp: 17553, growthRate: 0.045, inflationRate: 0.08, unemploymentRate: 0.05 },
    },
    {
      id: "IE",
      name: "Ireland",
      playable: false,
      economy: { gdp: 952, growthRate: 0.015, inflationRate: 0.025, unemploymentRate: 0.05 },
    },
    {
      id: "NG",
      name: "Nigeria",
      playable: false,
      economy: { gdp: 3400, growthRate: 0.035, inflationRate: 0.03, unemploymentRate: 0.03 },
    },
    {
      id: "DD",
      name: "East Germany",
      playable: true,
      economy: { gdp: 11905, growthRate: 0.03, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "HU",
      name: "Hungary",
      playable: false,
      economy: { gdp: 5000, growthRate: 0.035, inflationRate: 0.03, unemploymentRate: 0.005 },
    },
    {
      id: "PL",
      name: "Poland",
      playable: false,
      economy: { gdp: 12500, growthRate: 0.04, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "RO",
      name: "Romania",
      playable: false,
      economy: { gdp: 5926, growthRate: 0.035, inflationRate: 0.02, unemploymentRate: 0.005 },
    },
    {
      id: "YU",
      name: "Yugoslavia",
      playable: false,
      economy: { gdp: 6000, growthRate: 0.05, inflationRate: 0.05, unemploymentRate: 0.01 },
    },
    {
      id: "BG",
      name: "Bulgaria",
      playable: false,
      economy: { gdp: 2614, growthRate: 0.04, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BLR",
      name: "Belarus",
      playable: false,
      economy: { gdp: 5556, growthRate: 0.05, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "UKR",
      name: "Ukraine",
      playable: false,
      economy: { gdp: 32407, growthRate: 0.055, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
    {
      id: "CS",
      name: "Czechoslovakia",
      playable: false,
      economy: { gdp: 7407, growthRate: 0.045, inflationRate: 0.015, unemploymentRate: 0.005 },
    },
    {
      id: "BAL",
      name: "Baltic Republics",
      playable: false,
      economy: { gdp: 3241, growthRate: 0.045, inflationRate: 0.005, unemploymentRate: 0.005 },
    },
  ],
};
