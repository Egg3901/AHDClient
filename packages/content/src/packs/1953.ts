import type { SeedPack } from "../types.js";

/**
 * 1953 pack: 12 countries, defensible period macro anchors.
 * GDP in millions of USD (nominal). Rates as fractions.
 * Sources: rough period national accounts (Maddison, US BEA, UK ONS, Mitchell).
 * Precision tuning comes later; values are plausible orders of magnitude.
 */
export const pack1953: SeedPack = {
  packVersion: 1,
  era: {
    id: "1953",
    label: "1953: Cold War Dawn",
    startDate: "1953-01-06",
  },
  countries: [
    {
      id: "us",
      name: "United States",
      playable: true,
      economy: { gdp: 389_000, growthRate: 0.046, inflationRate: 0.008, unemploymentRate: 0.029 },
    },
    {
      id: "uk",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 47_000, growthRate: 0.035, inflationRate: 0.031, unemploymentRate: 0.017 },
    },
    {
      id: "fr",
      name: "France",
      playable: true,
      economy: { gdp: 35_000, growthRate: 0.025, inflationRate: 0.05, unemploymentRate: 0.022 },
    },
    {
      id: "de",
      name: "West Germany",
      playable: true,
      economy: { gdp: 35_000, growthRate: 0.07, inflationRate: 0.012, unemploymentRate: 0.045 },
    },
    {
      id: "su",
      name: "Soviet Union",
      playable: false,
      economy: { gdp: 110_000, growthRate: 0.06, inflationRate: 0.02, unemploymentRate: 0.01 },
    },
    {
      id: "jp",
      name: "Japan",
      playable: true,
      economy: { gdp: 22_000, growthRate: 0.06, inflationRate: 0.055, unemploymentRate: 0.018 },
    },
    {
      id: "ca",
      name: "Canada",
      playable: true,
      economy: { gdp: 28_000, growthRate: 0.039, inflationRate: 0.02, unemploymentRate: 0.028 },
    },
    {
      id: "it",
      name: "Italy",
      playable: true,
      economy: { gdp: 22_000, growthRate: 0.055, inflationRate: 0.048, unemploymentRate: 0.08 },
    },
    {
      id: "au",
      name: "Australia",
      playable: true,
      economy: { gdp: 13_500, growthRate: 0.038, inflationRate: 0.042, unemploymentRate: 0.018 },
    },
    {
      id: "br",
      name: "Brazil",
      playable: false,
      economy: { gdp: 15_000, growthRate: 0.04, inflationRate: 0.18, unemploymentRate: 0.05 },
    },
    {
      id: "in",
      name: "India",
      playable: false,
      economy: { gdp: 27_000, growthRate: 0.036, inflationRate: 0.02, unemploymentRate: 0.04 },
    },
    {
      id: "cn",
      name: "China",
      playable: false,
      economy: { gdp: 25_000, growthRate: 0.08, inflationRate: 0.06, unemploymentRate: 0.05 },
    },
  ],
};
