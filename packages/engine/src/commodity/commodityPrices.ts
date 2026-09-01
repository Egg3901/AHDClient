import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import {
  COMMODITY_TYPES,
  type CommodityType,
  COMMODITY_PRICE_DRIFT_RATE,
  computeMarketPrice,
  getPriceSoftKnee,
} from "./constants.js";

/**
 * Commodity price turn phase.
 *
 * Ports src/lib/turn/commodityPriceTurn.ts global-price leg:
 *   targetPrice = computeMarketPrice(basePrice, supply, demand)
 *   price = previousPrice + COMMODITY_PRICE_DRIFT_RATE * (target - previous)
 *
 * Supply/demand evolution is PORT-STUB: mainline derives S/D from
 * corporation sectors, extraction capacity, demographics, household consumption,
 * government spend, freight settlement, and sphere routing. Solo has none of
 * those scopes yet, so we evolve S/D via small deterministic RNG drift around
 * the stabilizer baseline (mirroring UNOWNED_DRIFT concept at 6% amplitude
 * but via per-turn RNG rather than sine wave). The drift is the same ratio
 * the real pipeline would produce for a low-activity commodity — a real price
 * signal for commodities nothing produces, without masking real S/D when scopes
 * land.
 *
 * Era-scaled base prices via world.ts seeding (COMMODITY_BASE_PRICES scaled
 * by era nominal scale). No per-turn era rescaling; seed values are the era
 * anchor for the world lifetime like seedCommodityPrices.
 *
 * Ordering: runs AFTER macroCountryTurn (so same-turn GDP effects are visible
 * to price evolution if wired later) and BEFORE contractSettlement (so
 * settlement sees this turn's market).
 */

// Stabilizer-like baseline added to both supply and demand so commodities
// with zero activity still have a bounded ratio (mirrors NATIONAL_COMMODITY_STABILIZER 500
// but smaller for global baseline stability).
const GLOBAL_STABILIZER = 500;

// Drift amplitude: 6% of stabilizer per turn, matching UNOWNED_DRIFT_AMPLITUDE 0.06
const DRIFT_AMPLITUDE = 0.06;

export function computeCommodityPriceTarget(
  basePrice: number,
  supply: number,
  demand: number,
  commodity: CommodityType,
): number {
  const knee = getPriceSoftKnee(commodity);
  // Apply stabilizer to both sides so zero-activity case stays bounded
  return computeMarketPrice(basePrice, supply + GLOBAL_STABILIZER, demand + GLOBAL_STABILIZER, knee);
}

export const commodityPricesPhase: TurnPhase = {
  name: "commodityPrices",
  run(world: WorldState, rng: WorldRng) {
    const turn = world.meta.turn;
    for (const commodity of COMMODITY_TYPES) {
      const state = world.commodityPrices[commodity];
      if (!state) continue;

      // Evolve supply/demand via deterministic RNG drift.
      // Each commodity gets two independent draws per turn: supply and demand
      // drift in opposite phase (supply += delta, demand -= delta) so ratio
      // oscillates rather than both moving together.
      // Determinism: draws are from world RNG in commodity-sorted order.
      const supplyJitter = (rng.next() - 0.5) * 2 * DRIFT_AMPLITUDE * GLOBAL_STABILIZER;
      const demandJitter = (rng.next() - 0.5) * 2 * DRIFT_AMPLITUDE * GLOBAL_STABILIZER;

      // MAINLINE-BUG note (port concern): If mainline had used price LEVEL
      // (P/base - 1) as the commodity contribution to inflation or as direct
      // price input rather than RATE of change, we port that level-based
      // behavior and mark it. Current mainline commodityPriceTurn correctly
      // uses supply/demand ratio via computeMarketPrice and drift toward
      // target — no level-vs-rate confusion in price evolution itself. The
      // known level bug was in inflationRecalc (price LEVEL fed to inflation
      // RATE) and is already fixed in mainline to RATE
      // (annualized change pow(price/prior, TURNS_PER_YEAR/lookback)-1).
      // This phase therefore implements the FIXED (rate-based) mainline
      // behavior for price evolution; no MAINLINE-BUG marker needed here.

      state.globalSupply = Math.max(0, Math.round((state.globalSupply + supplyJitter) * 100) / 100);
      state.globalDemand = Math.max(0, Math.round((state.globalDemand + demandJitter) * 100) / 100);

      const targetPrice = computeCommodityPriceTarget(
        state.basePrice,
        state.globalSupply,
        state.globalDemand,
        commodity,
      );
      const previousPrice = state.globalPrice;
      state.globalPrice =
        Math.round((previousPrice + COMMODITY_PRICE_DRIFT_RATE * (targetPrice - previousPrice)) * 100) / 100;
      // Clamp to reasonable bounds (0.1x to 10x base) — prevents runaway
      // drift in edge cases while matching mainline's implicit log-scale bounds.
      const minPrice = Math.round(state.basePrice * 0.1 * 100) / 100;
      const maxPrice = Math.round(state.basePrice * 10 * 100) / 100;
      state.globalPrice = Math.max(minPrice, Math.min(maxPrice, state.globalPrice));
      state.turn = turn;
    }
  },
};
