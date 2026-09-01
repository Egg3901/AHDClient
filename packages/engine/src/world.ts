import { rngFromSeed } from "./rng.js";
import type { WorldState } from "./types.js";
import { getPackByEra, PACKS_BY_DATE } from "@rotunda/content";
import { createPoliticiansForWorld } from "./politician.js";

export const SCHEMA_VERSION = 5;

export interface EraInfo {
  id: string;
  label: string;
  startDate: string;
}

export interface PlayableCountryInfo {
  id: string;
  name: string;
}

export interface CountryEconomyOverride {
  gdp?: number;
  growthRate?: number;
  inflationRate?: number;
  unemploymentRate?: number;
}

export interface WorldOverrides {
  playerCash?: number;
  countries?: Record<string, CountryEconomyOverride>;
}

export interface NewWorldOptions {
  seed: string;
  playerName: string;
  countryId: string;
  /**
   * Era id from listEras(). Required per contract; optional at the type
   * level only for backward compat with the pre-pack desktop shell which
   * calls newGame without an era. When omitted, defaults to the earliest
   * shipped era ("1953").
   */
  era?: string;
  overrides?: WorldOverrides;
}

export function listEras(): EraInfo[] {
  return PACKS_BY_DATE.map((p) => ({
    id: p.era.id,
    label: p.era.label,
    startDate: p.era.startDate,
  }));
}

export function listPlayableCountries(era: string): PlayableCountryInfo[] {
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);
  return pack.countries.filter((c) => c.playable).map((c) => ({ id: c.id, name: c.name }));
}

export function listCountries(era: string): { id: string; name: string; playable: boolean; economy: WorldState["countries"][string]["economy"] }[] {
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);
  return pack.countries.map((c) => ({
    id: c.id,
    name: c.name,
    playable: c.playable,
    economy: { ...c.economy, outputGap: 0 },
  }));
}

export function createWorld(options: NewWorldOptions): WorldState {
  const era = options.era ?? PACKS_BY_DATE[0]!.era.id;
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);

  const countries: WorldState["countries"] = {};
  for (const c of pack.countries) {
    countries[c.id] = {
      id: c.id,
      name: c.name,
      playable: c.playable,
      economy: { ...c.economy, outputGap: 0 },
    };
  }

  const country = countries[options.countryId];
  if (!country) {
    throw new Error(`Unknown country: ${options.countryId} for era ${era}`);
  }
  if (!country.playable) {
    throw new Error(`Country ${options.countryId} is not playable in era ${era}`);
  }

  // Validate and apply overrides after pack load, before politician generation.
  // Validation: finite numbers, gdp > 0, fractional rates within same bounds validatePack uses.
  // Unknown country id throws.
  let playerCashOverride: number | undefined;
  if (options.overrides !== undefined) {
    const overrides = options.overrides;
    if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
      throw new Error("Invalid overrides: must be an object");
    }
    if (overrides.playerCash !== undefined) {
      if (!Number.isFinite(overrides.playerCash)) {
        throw new Error(`Invalid overrides.playerCash: must be a finite number, got ${String(overrides.playerCash)}`);
      }
      playerCashOverride = overrides.playerCash;
    }
    if (overrides.countries !== undefined) {
      if (overrides.countries === null || typeof overrides.countries !== "object" || Array.isArray(overrides.countries)) {
        throw new Error("Invalid overrides.countries: must be an object");
      }
      for (const [cid, economyOverride] of Object.entries(overrides.countries)) {
        if (!countries[cid]) {
          throw new Error(`Unknown country: ${cid}`);
        }
        if (economyOverride === null || typeof economyOverride !== "object" || Array.isArray(economyOverride)) {
          throw new Error(`Invalid overrides.countries["${cid}"]: must be an object`);
        }
        const eo = economyOverride as Record<string, unknown>;
        if (eo["gdp"] !== undefined) {
          const v = eo["gdp"] as number;
          if (!Number.isFinite(v) || v <= 0) {
            throw new Error(`Invalid overrides.countries["${cid}"].gdp: must be a finite number > 0, got ${String(v)}`);
          }
        }
        if (eo["growthRate"] !== undefined) {
          const v = eo["growthRate"] as number;
          if (!Number.isFinite(v)) {
            throw new Error(`Invalid overrides.countries["${cid}"].growthRate: must be a finite number, got ${String(v)}`);
          }
        }
        if (eo["inflationRate"] !== undefined) {
          const v = eo["inflationRate"] as number;
          if (!Number.isFinite(v)) {
            throw new Error(`Invalid overrides.countries["${cid}"].inflationRate: must be a finite number, got ${String(v)}`);
          }
        }
        if (eo["unemploymentRate"] !== undefined) {
          const v = eo["unemploymentRate"] as number;
          if (!Number.isFinite(v) || v < 0 || v > 1) {
            throw new Error(`Invalid overrides.countries["${cid}"].unemploymentRate: must be a finite number in [0,1], got ${String(v)}`);
          }
        }
      }
      // Apply after validation
      for (const [cid, economyOverride] of Object.entries(overrides.countries)) {
        const c = countries[cid]!;
        const eo = economyOverride as CountryEconomyOverride;
        if (eo.gdp !== undefined) c.economy.gdp = eo.gdp;
        if (eo.growthRate !== undefined) c.economy.growthRate = eo.growthRate;
        if (eo.inflationRate !== undefined) c.economy.inflationRate = eo.inflationRate;
        if (eo.unemploymentRate !== undefined) c.economy.unemploymentRate = eo.unemploymentRate;
      }
    }
  }

  const rng = rngFromSeed(options.seed);

  const parties: WorldState["parties"] = {};
  for (const p of pack.parties ?? []) {
    parties[p.id] = { ...p };
  }

  const legislatures: WorldState["legislatures"] = {};
  for (const leg of pack.legislatures ?? []) {
    legislatures[leg.countryId] = {
      countryId: leg.countryId,
      name: leg.name,
      bicameral: leg.bicameral,
      chambers: leg.chambers.map((c) => {
        const chamber: WorldState["legislatures"][string]["chambers"][number] = {
          key: c.key,
          name: c.name,
          shortName: c.shortName,
          seats: c.seats,
          elected: c.elected,
          composition: { seatsByParty: { ...c.composition.seatsByParty }, vacancies: c.composition.vacancies },
        };
        if (c.description !== undefined) chamber.description = c.description;
        return chamber;
      }),
    };
  }

  // Populate politicians for elected chambers of playable countries.
  // Uses the same world rng, in deterministic order, so identical options
  // give identical casts. Capture rng state AFTER generation so save/load
  // resumes the sequence correctly.
  const playableIds = new Set(pack.countries.filter((c) => c.playable).map((c) => c.id));
  const politicians = createPoliticiansForWorld(rng, {
    legislatures,
    parties,
    playableCountryIds: playableIds,
    era: pack.era.id,
  });

  const world: WorldState = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      seed: options.seed,
      rng: rng.state(),
      turn: 0,
      date: pack.era.startDate,
      era: pack.era.id,
      cheatsUsed: false,
    },
    countries,
    parties,
    legislatures,
    politicians,
    player: {
      name: options.playerName,
      countryId: options.countryId,
      cash: playerCashOverride !== undefined ? playerCashOverride : 10_000,
    },
    news: [{ turn: 0, date: pack.era.startDate, headline: "A new game begins." }],
  };
  return world;
}
