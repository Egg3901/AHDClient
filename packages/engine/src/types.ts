import type { RngState } from "./rng.js";

/**
 * The entire game world is one serializable document. No database: the world
 * lives in memory while playing and round-trips losslessly through save files.
 *
 * Systems ported from mainline A House Divided (Egg3901/AHDGame) become pure
 * functions over this document, one turn phase at a time. Keep every field
 * JSON-safe: no Date, Map, Set, class instances, or undefined-vs-missing
 * ambiguity in persisted state.
 */

export interface WorldState {
  meta: WorldMeta;
  countries: Record<string, Country>;
  /** The human player. Solo has exactly one; everyone else is an NPC. */
  player: PlayerCharacter;
  /** Append-only feed of notable events, newest last. Trimmed by maintenance. */
  news: NewsItem[];
}

export interface WorldMeta {
  /** Bump on any breaking WorldState shape change; save loader checks it. */
  schemaVersion: number;
  seed: string;
  rng: RngState;
  /** Completed turns. 0 = freshly created world. */
  turn: number;
  /** In-game date as ISO day, e.g. "1953-01-06". One turn = one week. */
  date: string;
  era: EraId;
}

export type EraId = "1953" | "1960" | "1968" | "1976";

export interface Country {
  id: string;
  name: string;
  /** Playable countries have full political depth; others are macro-only. */
  playable: boolean;
  economy: CountryEconomy;
}

export interface CountryEconomy {
  /** Nominal GDP in millions of in-game dollars. */
  gdp: number;
  /** Annualized rates as fractions, e.g. 0.031 = 3.1%. */
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
}

export interface PlayerCharacter {
  name: string;
  countryId: string;
  cash: number;
}

export interface NewsItem {
  turn: number;
  date: string;
  headline: string;
}
