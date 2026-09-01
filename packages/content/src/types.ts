/**
 * Seed pack format: versioned data, one per era.
 *
 * Forward compatibility: packs declare optional extension tables
 * (states, parties, sectors) as optional arrays. Existing packs
 * omit them; future packs may include them; validation and engine
 * ignore missing extensions. Unknown top-level keys are ignored so
 * adding new tables does not break older consumers.
 */

export interface SeedPack {
  /** Data format version for this pack. Bump when required fields change. */
  packVersion: number;
  era: EraSeed;
  countries: CountrySeed[];
  /** Optional extension tables: states, parties, sectors. */
  states?: StateSeed[];
  parties?: PartySeed[];
  sectors?: SectorSeed[];
}

export interface EraSeed {
  /** Stable id, e.g. "1953". Sourced from packs, not a hardcoded union. */
  id: string;
  /** Human label, e.g. "1953: Cold War Dawn". */
  label: string;
  /** ISO day, e.g. "1953-01-06". The world's turn 0 date when this era is selected. */
  startDate: string;
}

export interface CountrySeed {
  id: string;
  name: string;
  playable: boolean;
  economy: EconomySeed;
}

export interface EconomySeed {
  /** Nominal GDP in millions of in-game dollars. */
  gdp: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
}

/** Placeholder for future states table (province/state level). */
export interface StateSeed {
  id: string;
  name: string;
  countryId: string;
  [key: string]: unknown;
}

/** Placeholder for future parties table. */
export interface PartySeed {
  id: string;
  name: string;
  countryId: string;
  [key: string]: unknown;
}

/** Placeholder for future sectors table (industry sectors). */
export interface SectorSeed {
  id: string;
  name: string;
  [key: string]: unknown;
}
