/**
 * Deterministic corporation founding at world creation — W9.
 *
 * Mainline founds NPC corporations procedurally, never from a static roster
 * (there is no `usCorporations.ts`/`ukCorporations.ts`/etc. — see
 * src/lib/admin/seed/seedNppCorporations.ts + src/lib/admin/
 * spawnNppCorporation.ts). W9 ports the same shape at country granularity:
 * one national NPC corporation per (playable country, sector type) pair with
 * a nonzero 1953 weight (see sectorSeedWeights1953.ts), sized from that
 * country's real GDP and the real per-sector weight share.
 *
 * Starting capital/revenue: mainline capitalizes a founding NPP corp at an
 * era-deflated, FX-normalized anchor (spawnNppCorporation.ts
 * NPP_DEFAULT_STARTING_CAPITAL_ANCHOR = 2,000,000 modern ₳, scaled by
 * getEraNominalScale/getGdpAnchorRate) and starting revenue at 25% of the
 * local unowned-sector-pool market size (or the same computeUnownedSeedRevenue
 * formula as a fallback). Rotunda has no ₳/FX anchor system, so W9 substitutes
 * a country/era-neutral proxy: founding capital = one year of the sector's
 * national revenue (weight-share of country GDP), founding per-turn revenue =
 * that annual figure divided by GROWTH_RATE_TURNS_PER_YEAR. This keeps every
 * founded corp's capital buffer proportional to its own real economic size
 * rather than an invented absolute constant.
 *
 * RNG usage: personality (ambition, stubbornness) is the only randomness,
 * two int(0,100) draws per corp in deterministic order (countries sorted,
 * then CORPORATION_TYPES array order within a country) — matches the "no
 * RNG in the count/sizing logic" finding from mainline's own spawn pipeline
 * (CEO selection there balances by party affiliation, not dice; Rotunda has
 * no party-CEO-affiliation system yet, so personality is drawn directly).
 */

import type { WorldRng } from "../rng.js";
import type { Corporation, CorporationType } from "./types.js";
import { CORPORATION_TYPES } from "./types.js";
import { SECTOR_WEIGHTS_1953 } from "./sectorSeedWeights1953.js";
import { GROWTH_RATE_TURNS_PER_YEAR, MAX_GROWTH_RATE, MIN_GROWTH_RATE, DEFAULT_PROFIT_MARGIN, deriveCeoArchetype, CEO_ARCHETYPE_MODIFIERS } from "./constants.js";

export interface FoundingCountryInput {
  id: string;
  playable: boolean;
  /** Nominal GDP in millions of in-game dollars (CountryEconomy.gdp). */
  gdp: number;
  /** Annualized growth rate as a fraction, e.g. 0.03 = 3%. */
  growthRate: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Found every playable country's NPC corporations. Deterministic given rng
 * state and input order (countries iterated in the caller's sorted order).
 */
export function seedCorporations(
  countries: readonly FoundingCountryInput[],
  rng: WorldRng,
  currentTurn: number,
): Record<string, Corporation> {
  const corporations: Record<string, Corporation> = {};
  const sorted = [...countries].filter((c) => c.playable).sort((a, b) => a.id.localeCompare(b.id));

  for (const country of sorted) {
    const weights = SECTOR_WEIGHTS_1953[country.id];
    if (!weights) continue; // No authored 1953 weights for this country — no corps founded (era/country not covered, see sectorSeedWeights1953.ts).

    for (const sectorType of CORPORATION_TYPES) {
      const rawWeight = weights[sectorType as CorporationType];
      if (!rawWeight || rawWeight <= 0) continue; // Zero weight = "essentially zero commercial sector" per mainline annotations — no corp founded.

      const gdpAbsolute = country.gdp * 1_000_000; // CountryEconomy.gdp is millions; see world.ts createWorld usage of the same field.
      const annualSectorRevenue = gdpAbsolute * (rawWeight / 100);
      const perTurnRevenue = annualSectorRevenue / GROWTH_RATE_TURNS_PER_YEAR;

      const ambition = rng.int(0, 100);
      const stubbornness = rng.int(0, 100);
      const archetype = deriveCeoArchetype({ ambition, stubbornness });
      const growthDelta = CEO_ARCHETYPE_MODIFIERS[archetype].growthDelta;

      const targetGrowthRate = clamp(country.growthRate * 100 + growthDelta, MIN_GROWTH_RATE, MAX_GROWTH_RATE);

      const id = `${country.id}-${sectorType}`;
      const corp: Corporation = {
        id,
        countryId: country.id,
        sectorType,
        personality: { ambition, stubbornness },
        archetype,
        revenue: perTurnRevenue,
        targetGrowthRate,
        currentGrowthRate: targetGrowthRate,
        currentGrowthCost: 0,
        profitMargin: DEFAULT_PROFIT_MARGIN,
        effectiveProfitMargin: DEFAULT_PROFIT_MARGIN,
        liquidCapital: annualSectorRevenue,
        foundingRevenue: annualSectorRevenue,
        foundedAtTurn: currentTurn,
        insolventSinceTurn: null,
        reincorporationCount: 0,
      };
      corporations[id] = corp;
    }
  }

  return corporations;
}
