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
  /** Parties seeded from mainline party seeds. Keyed by party id. */
  parties: Record<string, Party>;
  /** Legislatures seeded from mainline country configs. Keyed by country id. */
  legislatures: Record<string, Legislature>;
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

/**
 * Era id sourced from seed packs, not a hardcoded union.
 * Historical values include "1953", "1960", "1968", "1976";
 * new eras come from shipped packs.
 */
export type EraId = string;

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
  /** Output gap level (percent) — cyclical deviation of output from potential. */
  outputGap: number;
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

/**
 * Political party. Ports mainline's PoliticalParty ideological axis:
 * economicPosition and socialPosition on -5..+5 (left/libertarian negative,
 * right/authoritarian positive) as authored in src/lib/seeds/*Parties.ts and
 * src/lib/seeds/reference/politicalParties.ts. No new axis invented.
 */
export interface Party {
  /** Party id — the abbreviation uppercased (e.g. "DEM", "LAB", "CPSU", "SED"). */
  id: string;
  name: string;
  countryId: string;
  abbreviation: string;
  color: string;
  /** Economic left (-5) to right (+5). */
  economicPosition: number;
  /** Social libertarian (-5) to authoritarian (+5). */
  socialPosition: number;
}

/**
 * Legislature for a country. Chambers are derived from mainline
 * COUNTRY_CONFIGS and ERA_COUNTRY_CONFIG_OVERRIDES (src/lib/constants/countries.ts).
 * The `elected` flag mirrors mainline's ChamberConfig.elected (false means appointed).
 */
export interface Legislature {
  countryId: string;
  name: string;
  bicameral: boolean;
  chambers: Chamber[];
}

export interface Chamber {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  /** True for elected chambers; false for appointed (e.g. UK Lords, DD Staatsrat, DE Bundesrat). */
  elected: boolean;
  description?: string;
  composition: ChamberComposition;
}

export interface ChamberComposition {
  /** Seats held per party, keyed by party id. Sum plus vacancies equals chamber seats. */
  seatsByParty: Record<string, number>;
  vacancies: number;
}
