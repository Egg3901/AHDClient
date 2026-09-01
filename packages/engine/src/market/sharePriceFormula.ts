/**
 * Fundamental share-price formula — W10.
 *
 * Mainline: sharePrice = fundamentalValue x sentimentMultiplier x
 * orderFlowMultiplier (src/lib/corporations/sharePriceFormula.ts file doc).
 * This module ports fundamentalValue only — the sentiment and order-flow
 * multipliers require real buy/sell notional accumulated from OTHER actors'
 * trades within a rolling window (src/lib/corporations/orderFlowEngine.ts),
 * which a single-player world has none of. See recomputeSharePrices.ts file
 * doc for the full PORT-STUB rationale; the net effect is sharePrice ===
 * fundamentalSharePrice always in this wave (multiplier held at the
 * formula's own documented "no signal" value of 1.0).
 *
 * Ported terms, verbatim formula shape (see constants.ts for the full
 * component-by-component citation of what's cut and why — no bonds, no tech
 * assets, no index funds, no construction-in-progress, no stock splits, no
 * IMF bailout, no insider-concentration discount):
 *
 *   tangibleBookPerShare   = max(0, liquidCapitalAnchor) / totalShares
 *   earningsPowerPerShare  = max(0, normalizedEarningsAnchor) / costOfCapital / totalShares
 *   growthPremiumPerShare  = normalizedEarningsAnchor * gCapped / (costOfCapital - gCapped) / totalShares
 *     where gCapped = clamp(sectorGrowthRate, 0, costOfCapital - GROWTH_PREMIUM_CAP_BUFFER)
 *   fundamentalValue = TANGIBLE_BOOK_WEIGHT * tangibleBookPerShare
 *                     + EARNINGS_POWER_WEIGHT * earningsPowerPerShare
 *                     + GROWTH_PREMIUM_WEIGHT * growthPremiumPerShare
 *
 * Then the per-turn rate limiter (mainline #2888) and the MIN_SHARE_PRICE
 * floor, both verbatim.
 * Source: src/lib/corporations/sharePriceFormula.ts computeSharePrices +
 * rateLimitPrice (the subset of terms this wave ports).
 */
import {
  FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT,
  FUNDAMENTAL_EARNINGS_POWER_WEIGHT,
  FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT,
  GROWTH_PREMIUM_CAP_BUFFER,
  MIN_SHARE_PRICE,
  SHARE_PRICE_MAX_TURN_MOVE,
  SHARE_PRICE_RATE_LIMIT_MIN_PREV,
} from "./constants.js";

/** Per-corp inputs to the share-price formula (the W10-ported subset of mainline's SharePriceInput). */
export interface SharePriceInput {
  corpId: string;
  /** corp.liquidCapital — tangible-book numerator (no bonds/tech assets/CIP to add or subtract this wave). */
  liquidCapitalAnchor: number;
  /** Rolling 3-turn average of annualized after-tax income. Source: earnings.ts normalizedEarningsFromHistory. */
  normalizedEarningsAnchor: number;
  /** corp.currentGrowthRate / 100 (decimal, e.g. 0.05 = 5%/yr). */
  sectorGrowthRate: number;
  /** Smoothed country prime rate (decimal) + SECTOR_RISK_PREMIUM[corp.sectorType]. Must be > 0; guarded inside. */
  costOfCapital: number;
  totalShares: number;
  /** Previous share price — input to the rate limiter. */
  previousSharePrice: number;
}

/**
 * Compute share prices for all corps. Returns corpId -> price (rounded to 2dp).
 * Pure: no mutation of inputs.
 */
export function computeSharePrices(inputs: readonly SharePriceInput[]): Map<string, number> {
  const result = new Map<string, number>();

  for (const i of inputs) {
    const normalizedEarnings = Math.max(0, i.normalizedEarningsAnchor);

    // Component 1 — Tangible Book Per Share (liquidation floor).
    const tangibleBookPerShare = i.totalShares > 0 ? Math.max(0, i.liquidCapitalAnchor) / i.totalShares : 0;

    // Component 2 — Earnings Power Per Share.
    const earningsPowerPerShare =
      i.totalShares > 0 && i.costOfCapital > 0 ? normalizedEarnings / i.costOfCapital / i.totalShares : 0;

    // Component 3 — Growth Premium Per Share (Gordon Growth Model terminal value).
    const gCapped = Math.min(Math.max(0, i.sectorGrowthRate), i.costOfCapital - GROWTH_PREMIUM_CAP_BUFFER);
    const growthPremiumPerShare =
      i.totalShares > 0 && gCapped > 0 && i.costOfCapital > gCapped
        ? (normalizedEarnings * gCapped) / (i.costOfCapital - gCapped) / i.totalShares
        : 0;

    const fundamentalValue =
      FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT * tangibleBookPerShare +
      FUNDAMENTAL_EARNINGS_POWER_WEIGHT * earningsPowerPerShare +
      FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT * growthPremiumPerShare;

    const rawPrice = rateLimitPrice(fundamentalValue, i.previousSharePrice);

    const clampedPrice = Math.max(MIN_SHARE_PRICE, Number.isFinite(rawPrice) ? rawPrice : MIN_SHARE_PRICE);
    result.set(i.corpId, Math.round(clampedPrice * 100) / 100);
  }

  return result;
}

/**
 * Per-turn share-price rate limiter (mainline issue #2888). Clamps `rawPrice`
 * to within +-{@link SHARE_PRICE_MAX_TURN_MOVE} of `prevPrice`. Skipped when
 * `prevPrice <= SHARE_PRICE_RATE_LIMIT_MIN_PREV` so a recovering penny corp
 * isn't pinned near the floor.
 * Source: src/lib/corporations/sharePriceFormula.ts rateLimitPrice (verbatim).
 */
export function rateLimitPrice(rawPrice: number, prevPrice: number): number {
  if (!Number.isFinite(rawPrice) || !Number.isFinite(prevPrice)) return rawPrice;
  if (prevPrice <= SHARE_PRICE_RATE_LIMIT_MIN_PREV) return rawPrice;
  const maxUp = prevPrice * (1 + SHARE_PRICE_MAX_TURN_MOVE);
  const maxDown = prevPrice * (1 - SHARE_PRICE_MAX_TURN_MOVE);
  return Math.min(maxUp, Math.max(maxDown, rawPrice));
}
