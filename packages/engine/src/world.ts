import { START_DATE } from "./calendar.js";
import { rngFromSeed } from "./rng.js";
import type { WorldState } from "./types.js";

export const SCHEMA_VERSION = 1;

export interface NewWorldOptions {
  seed: string;
  playerName: string;
  countryId: string;
}

/**
 * Minimal seed world: US + UK with rough 1953 macro anchors. The real world
 * build ports mainline's seed content (countries, states, parties, sectors)
 * incrementally; this exists so the loop is playable from day one.
 */
export function createWorld(options: NewWorldOptions): WorldState {
  const rng = rngFromSeed(options.seed);
  const world: WorldState = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      seed: options.seed,
      rng: rng.state(),
      turn: 0,
      date: START_DATE,
      era: "1953",
    },
    countries: {
      us: {
        id: "us",
        name: "United States",
        playable: true,
        economy: { gdp: 389_000, growthRate: 0.046, inflationRate: 0.008, unemploymentRate: 0.029 },
      },
      uk: {
        id: "uk",
        name: "United Kingdom",
        playable: true,
        economy: { gdp: 47_000, growthRate: 0.035, inflationRate: 0.031, unemploymentRate: 0.017 },
      },
    },
    player: {
      name: options.playerName,
      countryId: options.countryId,
      cash: 10_000,
    },
    news: [
      { turn: 0, date: START_DATE, headline: "A new game begins." },
    ],
  };
  if (!world.countries[options.countryId]) {
    throw new Error(`Unknown country: ${options.countryId}`);
  }
  return world;
}
