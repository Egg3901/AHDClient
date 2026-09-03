/**
 * Deterministic corporation founding at world creation — W9 (+ W10 share
 * seeding, see the totalShares/shareholders/publicFloat block below).
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
 * formula as a fallback). AHDClient has no ₳/FX anchor system, so W9 substitutes
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
 * (CEO selection there balances by party affiliation, not dice; AHDClient has
 * no party-CEO-affiliation system yet, so personality is drawn directly).
 */

import type { WorldRng } from "../rng.js";
import type { Corporation, CorporationType } from "./types.js";
import { CORPORATION_TYPES } from "./types.js";
import { SECTOR_WEIGHTS_1953 } from "./sectorSeedWeights1953.js";
import { GROWTH_RATE_TURNS_PER_YEAR, MAX_GROWTH_RATE, MIN_GROWTH_RATE, DEFAULT_PROFIT_MARGIN, deriveCeoArchetype, CEO_ARCHETYPE_MODIFIERS } from "./constants.js";
import { CEO_INITIAL_SHARES, NPC_FOUNDER_SHARE_FRACTION, DEFAULT_SHARE_PRICE } from "../market/constants.js";

/**
 * Deterministic ticker for a (country, sectorType) pair — always unique
 * because corp.id (`${countryId}-${sectorType}`) already is. Mainline's
 * generateTickerSymbol (tickerSymbol.ts) hashes the corp NAME and retries
 * against a live DB collision check; W9/W10 corps have no display name (see
 * types.ts — country+sector IS the identity), and this module is a pure
 * function with no registry to query, so the ticker is derived directly from
 * the already-unique id instead of porting the name+retry scheme.
 */
export function tickerForSector(countryId: string, sectorType: CorporationType): string {
  return `${countryId}.${sectorType.replace(/_/g, "").slice(0, 4).toUpperCase()}`;
}

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

      // W10: founder/public-float share split and initial price. Source:
      // spawnNppCorporation.ts — "NPP CEO gets 51%, public float gets 49%";
      // initialSharePrice = max(DEFAULT_SHARE_PRICE, round((startingCapital /
      // totalIssuedShares) * 100) / 100). startingCapital there maps to this
      // corp's founding liquidCapital (annualSectorRevenue) here — same role
      // (the founding treasury), same formula.
      const totalShares = CEO_INITIAL_SHARES;
      const npcShares = Math.floor(totalShares * NPC_FOUNDER_SHARE_FRACTION);
      const publicFloatShares = totalShares - npcShares;
      const initialSharePrice = Math.max(
        DEFAULT_SHARE_PRICE,
        Math.round((annualSectorRevenue / totalShares) * 100) / 100,
      );

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
        tickerSymbol: tickerForSector(country.id, sectorType),
        totalShares,
        sharePrice: initialSharePrice,
        fundamentalSharePrice: initialSharePrice,
        shareholders: [{ holder: "npc", shares: npcShares }],
        publicFloat: publicFloatShares,
        earningsHistory: [],
      };
      corporations[id] = corp;
    }
  }

  return corporations;
}
