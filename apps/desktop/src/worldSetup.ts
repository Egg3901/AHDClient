// TEMPORARY - engine listCountries/applyCheat/overrides pending — delete when engine ships v2
// Thin adapter: listCountries and createWorldWithOverrides built on current engine exports.
// Do not import game state directly here except via game module for overrides application.
import { createWorld, listPlayableCountries } from "@rotunda/engine";
import type { NewWorldOptions, WorldState, CountryEconomy } from "@rotunda/engine";
import { game } from "./game.js";

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

export interface CountryRow {
  id: string;
  name: string;
  playable: boolean;
  economy: CountryEconomy;
}

// -------------------------------------------------------------------
// Validation helpers
// -------------------------------------------------------------------

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function validateOverrides(overrides: WorldOverrides): void {
  if (overrides.playerCash !== undefined) {
    if (!isFiniteNumber(overrides.playerCash) || overrides.playerCash < 0) {
      throw new Error(`playerCash must be a finite number >= 0, got ${String(overrides.playerCash)}`);
    }
  }
  if (overrides.countries !== undefined) {
    if (typeof overrides.countries !== "object" || overrides.countries === null || Array.isArray(overrides.countries)) {
      throw new Error("countries overrides must be a Record<string, CountryEconomyOverride>");
    }
    for (const [countryId, ov] of Object.entries(overrides.countries)) {
      if (typeof ov !== "object" || ov === null || Array.isArray(ov)) {
        throw new Error(`countries["${countryId}"] must be an object`);
      }
      const rec = ov as Record<string, unknown>;
      // gdp
      if (rec["gdp"] !== undefined) {
        const v = rec["gdp"] as number;
        if (!isFiniteNumber(v) || v <= 0) {
          throw new Error(`countries["${countryId}"].gdp must be a finite number > 0, got ${String(v)}`);
        }
      }
      // rates — fractions in [0,1]
      for (const field of ["growthRate", "inflationRate", "unemploymentRate"] as const) {
        const val = rec[field];
        if (val !== undefined) {
          if (!isFiniteNumber(val) || (val as number) < 0 || (val as number) > 1) {
            throw new Error(`countries["${countryId}"].${field} must be a finite number in [0,1], got ${String(val)}`);
          }
        }
      }
      // disallow unknown fields in override (defensive)
      for (const k of Object.keys(rec)) {
        if (!["gdp", "growthRate", "inflationRate", "unemploymentRate"].includes(k)) {
          throw new Error(`countries["${countryId}"] has unknown field "${k}"`);
        }
      }
    }
  }
}

// -------------------------------------------------------------------
// Public adapters
// -------------------------------------------------------------------

/**
 * TEMPORARY adapter for engine listCountries.
 * Derives the roster by creating a probe world with default options for the era.
 */
export function listCountries(era: string): CountryRow[] {
  // listPlayableCountries throws on unknown era — propagate as contract requires
  const playable = listPlayableCountries(era);
  if (playable.length === 0) {
    throw new Error(`No playable countries for era ${era}`);
  }
  const first = playable[0]!;
  const probe = createWorld({ seed: "__probe__", playerName: "probe", countryId: first.id, era });
  return Object.values(probe.countries).map((c) => ({
    id: c.id,
    name: c.name,
    playable: c.playable,
    economy: { ...c.economy },
  }));
}

/**
 * TEMPORARY adapter for engine createWorld with overrides.
 * Validates overrides per contract, then applies them client-side after game.newGame.
 */
export async function createWorldWithOverrides(
  options: NewWorldOptions,
  overrides: WorldOverrides,
): Promise<WorldState> {
  validateOverrides(overrides);

  // Create base world via game module (single source of truth)
  const world = await game.newGame(options);

  // Validate country ids exist in the created world
  if (overrides.countries) {
    for (const id of Object.keys(overrides.countries)) {
      if (!world.countries[id]) {
        throw new Error(`Unknown country: ${id}`);
      }
    }
  }

  // Apply overrides in place via game.mutate so React state can stay synced
  const hasOverrides =
    overrides.playerCash !== undefined ||
    (overrides.countries && Object.keys(overrides.countries).length > 0);

  if (hasOverrides) {
    game.mutate((w) => {
      if (overrides.playerCash !== undefined) {
        w.player.cash = overrides.playerCash as number;
      }
      if (overrides.countries) {
        for (const [id, ov] of Object.entries(overrides.countries)) {
          const c = w.countries[id];
          if (!c) continue;
          if (ov.gdp !== undefined) c.economy.gdp = ov.gdp;
          if (ov.growthRate !== undefined) c.economy.growthRate = ov.growthRate;
          if (ov.inflationRate !== undefined) c.economy.inflationRate = ov.inflationRate;
          if (ov.unemploymentRate !== undefined) c.economy.unemploymentRate = ov.unemploymentRate;
        }
      }
    });
    // Return mutated world
    const mutated = await game.getState();
    if (!mutated) throw new Error("World vanished after overrides");
    return mutated;
  }

  return world;
}
