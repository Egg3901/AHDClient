import type { SeedPack } from "../types.js";

/**
 * 1960 pack: same 12 countries, anchors moved seven years forward.
 * Nominal GDP growth reflects historical recovery and miracle economies;
 * inflation and unemployment shift plausibly. Same playable set.
 */
export const pack1960: SeedPack = {
  packVersion: 1,
  era: {
    id: "1960",
    label: "1960: Brink of Change",
    startDate: "1960-01-05",
  },
  countries: [
    {
      id: "us",
      name: "United States",
      playable: true,
      economy: { gdp: 542_000, growthRate: 0.025, inflationRate: 0.016, unemploymentRate: 0.055 },
    },
    {
      id: "uk",
      name: "United Kingdom",
      playable: true,
      economy: { gdp: 72_000, growthRate: 0.04, inflationRate: 0.01, unemploymentRate: 0.016 },
    },
    {
      id: "fr",
      name: "France",
      playable: true,
      economy: { gdp: 62_000, growthRate: 0.055, inflationRate: 0.035, unemploymentRate: 0.015 },
    },
    {
      id: "de",
      name: "West Germany",
      playable: true,
      economy: { gdp: 72_000, growthRate: 0.065, inflationRate: 0.015, unemploymentRate: 0.012 },
    },
    {
      id: "su",
      name: "Soviet Union",
      playable: false,
      economy: { gdp: 180_000, growthRate: 0.06, inflationRate: 0.02, unemploymentRate: 0.01 },
    },
    {
      id: "jp",
      name: "Japan",
      playable: true,
      economy: { gdp: 44_000, growthRate: 0.095, inflationRate: 0.03, unemploymentRate: 0.017 },
    },
    {
      id: "ca",
      name: "Canada",
      playable: true,
      economy: { gdp: 40_000, growthRate: 0.03, inflationRate: 0.013, unemploymentRate: 0.065 },
    },
    {
      id: "it",
      name: "Italy",
      playable: true,
      economy: { gdp: 40_000, growthRate: 0.06, inflationRate: 0.02, unemploymentRate: 0.045 },
    },
    {
      id: "au",
      name: "Australia",
      playable: true,
      economy: { gdp: 18_500, growthRate: 0.03, inflationRate: 0.025, unemploymentRate: 0.02 },
    },
    {
      id: "br",
      name: "Brazil",
      playable: false,
      economy: { gdp: 22_000, growthRate: 0.06, inflationRate: 0.25, unemploymentRate: 0.05 },
    },
    {
      id: "in",
      name: "India",
      playable: false,
      economy: { gdp: 38_000, growthRate: 0.035, inflationRate: 0.02, unemploymentRate: 0.04 },
    },
    {
      id: "cn",
      name: "China",
      playable: false,
      economy: { gdp: 60_000, growthRate: 0.03, inflationRate: 0.04, unemploymentRate: 0.05 },
    },
  ],
};
