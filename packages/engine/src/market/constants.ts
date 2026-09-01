/**
 * Market cluster constants — W10 (share price, stock exchange).
 *
 * Sources (AHDGame, cited per constant):
 *  - src/lib/constants/corporations.ts (fundamental-formula weights, rate
 *    limiter, MIN_SHARE_PRICE, CEO_INITIAL_SHARES, SECTOR_RISK_PREMIUM,
 *    FUNDAMENTAL_ROLLING_AVG_TURNS)
 *  - src/lib/corporations/sharePriceFormula.ts (computeSharePrices — the
 *    CURRENT post-fix fundamental-value formula; see file doc there for the
 *    2026-08-20 wash-trade/knife-edge incident history behind the rate
 *    limiter and the split-cooldown anchor clamp)
 *  - src/lib/admin/spawnNppCorporation.ts (founder/public-float share split,
 *    initial share price)
 *  - src/lib/turn/corporation/earningsRollingAverage.ts (rolling earnings window)
 *  - src/lib/turn/corporation/recomputeSharePrices.ts (FALLBACK_PRIME_RATE_PERCENT)
 *
 * OUT OF SCOPE, confirmed present in mainline but not ported here (per the
 * wave brief): bonds (issuedBondDebt/bondHoldingsAnchor/bond-reliance
 * penalty — W12/W13, no bond system exists in this worktree yet), tech-tree
 * asset value (no tech tree ported), index-fund ownership premium (no index
 * funds ported), construction-in-progress / plants capex (no plants tier
 * ported — corp/constants.ts confirms this), stock splits and their
 * cooldown-smoothing blend (no split action ported — every corp's
 * lastShareStructureTurn is implicitly "never"), IMF bailout multiplier (no
 * IMF system ported), insider-concentration discount (only applies to
 * character-CEO public corps; W10 has no player-run corporations, so it
 * would always evaluate to a no-op multiplier of 1 — porting the dead branch
 * added nothing and is skipped, not silently dropped).
 *
 * The order-flow/sentiment multiplier (sharePrice = fundamentalValue ×
 * sentimentMultiplier × orderFlowMultiplier in mainline) is PORT-STUB — see
 * recomputeSharePrices.ts file doc for the human-liquidity gap this leaves.
 */

// ── Fundamental share-price formula weights ────────────────────────────
// Source: constants/corporations.ts:893-897.
export const FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT = 1.0;
export const FUNDAMENTAL_EARNINGS_POWER_WEIGHT = 0.4;
export const FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT = 0.1;

/**
 * Gordon Growth Model terminal-value cap buffer: sectorGrowthRate is capped
 * at costOfCapital - this buffer so the (costOfCapital - g) denominator never
 * reaches zero. Source: constants/corporations.ts:932 GROWTH_PREMIUM_CAP_BUFFER.
 */
export const GROWTH_PREMIUM_CAP_BUFFER = 0.02;

/** Price floor — never zero/negative regardless of fundamentals. Source: constants/corporations.ts:889 MIN_SHARE_PRICE. */
export const MIN_SHARE_PRICE = 0.01;

/**
 * Per-turn share-price rate limiter (mainline issue #2888): caps a turn's
 * fundamental move to +-35% of the previous price so a knife-edge fundamental
 * flip (e.g. debt crossing assets) cannot snap the price 100x+ in one turn.
 * Source: constants/corporations.ts:218 SHARE_PRICE_MAX_TURN_MOVE.
 */
export const SHARE_PRICE_MAX_TURN_MOVE = 0.35;

/**
 * Rate limiter is skipped when prevPrice <= this floor, so a genuinely
 * recovering penny stock isn't pinned near MIN_SHARE_PRICE forever.
 * Source: constants/corporations.ts:225 SHARE_PRICE_RATE_LIMIT_MIN_PREV.
 */
export const SHARE_PRICE_RATE_LIMIT_MIN_PREV = 1.0;

/** Source: constants/corporations.ts:228 DEFAULT_SHARE_PRICE (initial-price floor). */
export const DEFAULT_SHARE_PRICE = 0.1;

/**
 * Risk premium added to the (smoothed) prime rate to produce costOfCapital,
 * keyed by CorporationType — verbatim values, verbatim 17-key set (matches
 * corporation/types.ts CORPORATION_TYPES, itself cited to the same source).
 * Source: constants/corporations.ts:938-966 SECTOR_RISK_PREMIUM.
 */
export const SECTOR_RISK_PREMIUM: Record<string, number> = {
  financial: 0.07,
  media: 0.05,
  manufacturing: 0.04,
  chemical_industries: 0.05,
  healthcare: 0.05,
  retail: 0.04,
  automobiles: 0.05,
  technology: 0.06,
  energy: 0.07,
  agriculture: 0.03,
  real_estate: 0.04,
  construction: 0.04,
  defense: 0.04,
  telecommunications: 0.04,
  entertainment: 0.06,
  logistics: 0.04,
  extraction: 0.07,
  default: 0.05,
};

/**
 * Last-resort cost-of-capital input when a corp's countryId has no central
 * bank entry (should not happen for a playable-country corp, but mirrors
 * mainline's own guard rather than crashing repricing for every corp).
 * Source: turn/corporation/recomputeSharePrices.ts:47 FALLBACK_PRIME_RATE_PERCENT.
 */
export const FALLBACK_PRIME_RATE_PERCENT = 5;

// ── Rolling earnings window ────────────────────────────────────────────
/** Source: constants/corporations.ts:900 FUNDAMENTAL_ROLLING_AVG_TURNS. */
export const FUNDAMENTAL_ROLLING_AVG_TURNS = 3;

// ── Founding share allocation ──────────────────────────────────────────
/** Source: constants/corporations.ts:144 CEO_INITIAL_SHARES. */
export const CEO_INITIAL_SHARES = 10_000_000;
/**
 * NPC-founder share of totalShares at founding; the remainder is the public
 * float. Source: spawnNppCorporation.ts "NPP CEO gets 51%, public float gets
 * 49%" (nppShares = Math.floor(totalIssuedShares * 0.51)).
 */
export const NPC_FOUNDER_SHARE_FRACTION = 0.51;

// ── Share trading (buy/sell actions) ───────────────────────────────────
// Mainline's buyPublicShares/sellPublicShares charge NO per-trade brokerage
// fee: cost/proceeds = shares * executionPrice, full stop (confirmed by
// reading both route handlers — the only "fee" in that code is an FX
// conversion spread, which does not apply here since Rotunda has no
// cross-currency corp/character wallet system). "mainline's pricing/fees"
// for W10 is therefore: price = corp.sharePrice (order-flow execution-price
// banding is part of the PORT-STUB gap, see market/recomputeSharePrices.ts),
// fee = 0.
