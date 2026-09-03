/**
 * Command-economy macro-state kernels — solo port of
 * src/lib/economy/commandEconomyState.ts (P1 + P3 subset; the v2 P1 Gosbank
 * directed-credit/SOE-capacity layer is PORT-STUB, see phases.ts file doc).
 *
 * Pure, deterministic, NaN-guarded math for the planned-economy readouts
 * stored on WorldState.commandEconomy (mainline: FederalBudget.economicFactors
 * monetaryOverhang/shortageIndex/blackMarketPremium/secondEconomyShare).
 *
 * The model is a qualitative rendering of the shortage-economy literature:
 *  - Kornai: a soft-budget, quantity-planned economy runs chronic shortage;
 *    administered (sticky) prices don't clear, so excess nominal income piles
 *    up as a MONETARY OVERHANG (forced savings).
 *  - The overhang and the physical demand-vs-supply gap drive a SHORTAGE INDEX.
 *  - Grossman: the repressed demand spills into a SECOND (black-market) economy
 *    that clears at a premium and, depending on how far the state tolerates it,
 *    RELIEVES the overhang.
 *
 * CADENCE: the phase runs every turn (TURNS_PER_YEAR = 48 turns/year), but the
 * growth signals it consumes (wage/GDP growth) are ANNUAL percentages. The flow
 * is therefore divided by TURNS_PER_YEAR so overhang accumulates at the real
 * annual pace, and the decay is a gentle per-turn rate (a multi-year
 * persistence horizon — forced savings are sticky).
 */

import { TURNS_PER_YEAR } from "../economy/macroConstants.js";

const clamp = (v: number, lo: number, hi: number): number =>
  !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));

/** Overhang is a pressure INDEX in [0, OVERHANG_CAP], not a currency amount. */
export const OVERHANG_CAP = 100;
/** Per-turn persistence of accumulated overhang absent new flow. Source: commandEconomyState.ts OVERHANG_DECAY. */
export const OVERHANG_DECAY = 0.99;
/** Max black-market premium as a fraction over official (2.0 = +200%). */
export const MAX_BLACK_MARKET_PREMIUM = 2.0;
/** Ceiling on how much of the economy can flee into the second economy. */
export const MAX_SECOND_ECONOMY_SHARE = 0.6;
/** How quickly the second-economy share tracks its target each turn. */
const SECOND_ECONOMY_ADJUST = 0.25;

/**
 * Accumulate the monetary overhang. Overhang grows when nominal income (wages)
 * outruns real goods availability (GDP growth) under a planned economy, scaled
 * by how much of the economy is administered (`plannedShare`); it decays as some
 * excess is spent, and is further relieved by whatever the second economy soaks
 * up.
 *
 * @param planFulfillment aggregate SOE plan fulfillment (1.0 = on plan).
 *        PORT-STUB always 1 in solo — AHDClient has no per-SOE plan-target/
 *        directed-credit system (see phases.ts file doc), so the unmet-plan
 *        goods-deficit term (mainline's PLAN_SHORTFALL_GOODS_DEFICIT) never
 *        fires; the model runs on the wage/GDP gap alone.
 * @param creditInjection PORT-STUB always 0 in solo — no Gosbank directed
 *        credit issuance is ported (mainline's overhangInjectionFromIssuance).
 */
export function accumulateOverhang(
  prevOverhang: number,
  wageGrowth: number,
  realGoodsGrowth: number,
  plannedShare: number,
  secondEconomyRelief = 0,
  creditInjection = 0,
  planFulfillment = 1,
): number {
  const prev = clamp(prevOverhang, 0, OVERHANG_CAP);
  const share = clamp(plannedShare, 0, 1);
  const shortfall = Number.isFinite(planFulfillment) ? Math.max(0, 1 - planFulfillment) : 0;
  const goodsDeficit = shortfall * 20; // source: commandEconomyState.ts PLAN_SHORTFALL_GOODS_DEFICIT
  const gap =
    Number.isFinite(wageGrowth) && Number.isFinite(realGoodsGrowth)
      ? wageGrowth - realGoodsGrowth + goodsDeficit
      : goodsDeficit;
  const flow = (share * Math.max(0, gap)) / TURNS_PER_YEAR;
  const injection = Number.isFinite(creditInjection) ? Math.max(0, creditInjection) : 0;
  const relief = clamp(secondEconomyRelief, 0, OVERHANG_CAP);
  return clamp(prev * OVERHANG_DECAY + flow + injection - relief, 0, OVERHANG_CAP);
}

/**
 * Shortage index in [0, 100]. Combines the accumulated overhang with the
 * physical demand-vs-supply gap at administered prices (0 when unknown — solo
 * has no per-good administered-price gap system, mirrors mainline's own P1
 * "runs on overhang alone" default).
 */
export function shortageIndexFrom(overhang: number, demandSupplyGapPct = 0): number {
  const o = clamp(overhang, 0, OVERHANG_CAP);
  const gap = clamp(demandSupplyGapPct, 0, 500);
  return clamp(0.7 * o + 0.06 * gap, 0, 100);
}

/**
 * Black-market premium (fraction over official). Rises with the shortage index
 * and, more mildly, the overhang; a more TOLERANT regime lets the second economy
 * clear more of the excess, damping the premium.
 */
export function blackMarketPremiumFrom(
  shortageIndex: number,
  overhang: number,
  tolerance = 0.3,
): number {
  const s = clamp(shortageIndex, 0, 100) / 100;
  const o = clamp(overhang, 0, OVERHANG_CAP) / OVERHANG_CAP;
  const tol = clamp(tolerance, 0, 1);
  const raw = (0.8 * s + 0.2 * o) * MAX_BLACK_MARKET_PREMIUM;
  return clamp(raw * (1 - 0.4 * tol), 0, MAX_BLACK_MARKET_PREMIUM);
}

/**
 * Update the second-economy share and report the overhang it relieves this turn.
 */
export function updateSecondEconomy(
  prevShare: number,
  shortageIndex: number,
  overhang: number,
  tolerance = 0.3,
): { share: number; relief: number } {
  const prev = clamp(prevShare, 0, MAX_SECOND_ECONOMY_SHARE);
  const s = clamp(shortageIndex, 0, 100) / 100;
  const tol = clamp(tolerance, 0, 1);
  const target = clamp(s * (0.2 + 0.6 * tol), 0, MAX_SECOND_ECONOMY_SHARE);
  const share = clamp(prev + (target - prev) * SECOND_ECONOMY_ADJUST, 0, MAX_SECOND_ECONOMY_SHARE);
  const relief = clamp(share * tol * 0.5 * clamp(overhang, 0, OVERHANG_CAP), 0, OVERHANG_CAP);
  return { share, relief };
}

/**
 * How far full internal repression (level 1) can force down the black-market
 * EXPRESSION terms of the pressure blend. Source: commandEconomyState.ts
 * REPRESSION_EXPRESSION_SUPPRESSION.
 */
export const REPRESSION_EXPRESSION_SUPPRESSION = 0.8;

/**
 * Collapse the three shortage-economy readouts into a single 0..1 BLACK-MARKET
 * PRESSURE scalar — the driver of the endogenous-marketization drift.
 * INTERNAL REPRESSION forces down the VISIBLE EXPRESSION (premium + grey
 * market) only; the shortage term (the cause) is left intact.
 */
export function blackMarketPressure(
  shortageIndex: number,
  blackMarketPremium: number,
  secondEconomyShare: number,
  repression = 0,
): number {
  const s = clamp(shortageIndex, 0, 100) / 100;
  const p = clamp(blackMarketPremium, 0, MAX_BLACK_MARKET_PREMIUM) / MAX_BLACK_MARKET_PREMIUM;
  const e = clamp(secondEconomyShare, 0, MAX_SECOND_ECONOMY_SHARE) / MAX_SECOND_ECONOMY_SHARE;
  const rep = clamp(repression, 0, 1);
  const expressionScale = 1 - REPRESSION_EXPRESSION_SUPPRESSION * rep;
  return clamp(0.5 * s + (0.3 * p + 0.2 * e) * expressionScale, 0, 1);
}
