/**
 * Corporation core constants and pure formulas — W9.
 *
 * Sources (AHDGame, verbatim unless noted, cited per constant/function):
 *  - src/lib/constants/corporations.ts (margin soft cap, growth bounds, growth
 *    cost, dividend/CEO/overhead caps, CORPORATION_TYPES)
 *  - src/lib/turn/corporation/sectorGrowthPolicy.ts (growth trend + affordability
 *    brake; command-economy plan-gravity branch NOT ported — AHDClient has no
 *    command-economy system yet, W7 in the roadmap, not merged into this
 *    worktree)
 *  - src/lib/utils/sectorGrowth.ts (trendGrowthRate)
 *  - src/lib/npp/ceoArchetype.ts (deterministic CEO archetype + modifiers)
 *  - src/lib/turn/corporation/nppInsolvencyDissolution.ts (insolvency triggers)
 *  - src/lib/turn/gdpGrowth.ts (computeRealizedRevenueGrowthRate — the macro
 *    wire; re-exported from macroCountryTurn's existing SECTOR_SIGNAL_MIN/MAX
 *    which already cite this file, see economy/macroConstants.ts)
 *
 * OUT OF SCOPE, confirmed present in mainline but not touched here (per the
 * wave brief and docs/ROADMAP-1.0.md Lane 2 sequencing): src/lib/market/
 * (share price, order flow, clearing — W10), src/lib/indexFunds/ (W10),
 * src/lib/corporations/mergerReview/, subsidiaries/, groups/ (M&A, transfer
 * pricing, synergies), src/lib/constants/techTree.ts + corporations/techTree/,
 * corporate-governance votes/privatization, banking (W12), bonds (W13),
 * physicalPnl.ts / plants tier (needs W10's market-clearing prices — deferred),
 * granular wage/headcount tracking (mainline's own default is off; see
 * src/lib/labour/featureFlag.ts labourSystemMode default "off").
 */

import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import type { CeoArchetype, CorpCeoPersonality } from "./types.js";

// ── Margin ───────────────────────────────────────────────────────────────

/** Source: constants/corporations.ts:268 DEFAULT_PROFIT_MARGIN. */
export const DEFAULT_PROFIT_MARGIN = 35;
/** Source: constants/corporations.ts:282 MARGIN_SOFT_CAP_KNEE. */
export const MARGIN_SOFT_CAP_KNEE = 80;
/** Source: constants/corporations.ts:284 MARGIN_HARD_CEILING. */
export const MARGIN_HARD_CEILING = 100;

/**
 * Soft-cap an additive margin stack: identity at or below the knee, then a
 * tanh curve up to the hard ceiling. W9 has no margin-modifier stack (mainline
 * sums ~20 additive pp terms from macro/political systems not yet ported;
 * see sectorTurn.ts:1163-1188 — deferred), so this only bites if a future wave
 * pushes profitMargin itself above 80.
 * Source: constants/corporations.ts:294-299 softCapEffectiveMargin.
 */
export function softCapEffectiveMargin(rawMargin: number): number {
  if (rawMargin <= MARGIN_SOFT_CAP_KNEE) return rawMargin;
  const span = MARGIN_HARD_CEILING - MARGIN_SOFT_CAP_KNEE;
  return MARGIN_SOFT_CAP_KNEE + span * Math.tanh((rawMargin - MARGIN_SOFT_CAP_KNEE) / span);
}

// ── Growth ───────────────────────────────────────────────────────────────

/** Source: constants/corporations.ts:743 MAX_GROWTH_RATE (annual %). */
export const MAX_GROWTH_RATE = 15.0;
/** Source: constants/corporations.ts:746 MIN_GROWTH_RATE (annual %). */
export const MIN_GROWTH_RATE = -2;
/** Source: constants/corporations.ts:755 GROWTH_TREND_STEP_PER_TURN (pp/turn). */
export const GROWTH_TREND_STEP_PER_TURN = 0.5;
/**
 * Source: constants/corporations.ts:827 GROWTH_RATE_TURNS_PER_YEAR = 48.
 * Identical value and semantics to AHDClient's own TURNS_PER_YEAR
 * (economy/macroConstants.ts, itself sourced from turnTime.ts), reused
 * directly rather than re-declared.
 */
export const GROWTH_RATE_TURNS_PER_YEAR = TURNS_PER_YEAR;

/**
 * Trend current growth rate toward target by GROWTH_TREND_STEP_PER_TURN,
 * clamped to [MIN_GROWTH_RATE, MAX_GROWTH_RATE], no overshoot.
 * Source: src/lib/utils/sectorGrowth.ts trendGrowthRate (verbatim).
 */
export function trendGrowthRate(current: number, target: number): number {
  const clampedTarget = Math.max(MIN_GROWTH_RATE, Math.min(MAX_GROWTH_RATE, target));
  if (current === clampedTarget) return current;
  const diff = clampedTarget - current;
  const step = Math.sign(diff) * Math.min(GROWTH_TREND_STEP_PER_TURN, Math.abs(diff));
  const next = current + step;
  const clamped = Math.max(MIN_GROWTH_RATE, Math.min(MAX_GROWTH_RATE, next));
  return Math.round(clamped * 10) / 10;
}

/**
 * Largest share of a sector's gross margin growth may consume before the
 * affordability brake pulls the target rate back.
 * Source: sectorGrowthPolicy.ts:14 GROWTH_COST_MARGIN_SHARE.
 */
export const GROWTH_COST_MARGIN_SHARE = 0.5;
/** Percentage points the brake removes per turn while growth is unaffordable. Source: sectorGrowthPolicy.ts:16 GROWTH_BRAKE_STEP. */
export const GROWTH_BRAKE_STEP = 0.5;

/**
 * Growth cost calibration. Source: constants/corporations.ts:346
 * GROWTH_COST_MULTIPLIER = 3.0, and the calculateDailyGrowthCost formula
 * (lines 719-740) which also multiplies by TURNS_PER_DAY = 24 (line 830).
 * That factor is NOT a turn-length unit conversion (AHDClient's turn is a week,
 * not an hour) — it is baked into mainline's own calibration so that
 * growthCost/revenue lands in the same range GROWTH_COST_MARGIN_SHARE compares
 * against (see the brake math above); it is ported as a flat multiplier
 * applied once per AHDClient turn.
 * rateMultiplier (prime-rate/CEO-acumen sensitivity) and dominanceGrowthMult
 * (market-share toll) are PORT-STUB neutral 1.0: AHDClient has no central-bank
 * prime-rate-to-corp-cost link, no CEO acumen stat, and no market-share system
 * (W10) yet.
 */
export const GROWTH_COST_MULTIPLIER = 3.0;
export const TURNS_PER_DAY = 24;

/**
 * Growth investment cost charged against margin this turn, using the
 * pre-growth (current) revenue. Clamped to >=0: mainline's own formula has no
 * explicit floor, but AHDClient's growth range can go negative (MIN_GROWTH_RATE
 * -2), and a "negative cost" (credit) has no mainline analogue — clamped
 * defensively so a shrinking sector never gets a phantom cash injection.
 * Source: constants/corporations.ts:719-740 calculateDailyGrowthCost, with
 * rateMultiplier/dominanceGrowthMult/acumen multipliers at neutral 1.0 (see
 * doc above).
 */
export function calculateGrowthCost(revenue: number, perTurnGrowthRate: number): number {
  const raw = revenue * (perTurnGrowthRate / 100) * GROWTH_COST_MULTIPLIER * TURNS_PER_DAY;
  return Math.max(0, raw);
}

// ── NPC CEO archetype ────────────────────────────────────────────────────

/** Slider midpoint; at/above is "high", below is "low". Source: ceoArchetype.ts TRAIT_MIDPOINT. */
const TRAIT_MIDPOINT = 50;

/**
 * Deterministic archetype classification from personality sliders.
 * Source: src/lib/npp/ceoArchetype.ts deriveCeoArchetype (verbatim).
 */
export function deriveCeoArchetype(personality: CorpCeoPersonality): CeoArchetype {
  const highAmbition = personality.ambition >= TRAIT_MIDPOINT;
  const highStubbornness = personality.stubbornness >= TRAIT_MIDPOINT;
  if (highAmbition && !highStubbornness) return "aggressive";
  if (highAmbition && highStubbornness) return "innovator";
  if (!highAmbition && highStubbornness) return "costCutter";
  return "cautious";
}

export interface CeoArchetypeModifiers {
  growthDelta: number;
  marketingMult: number;
  rdMult: number;
  dividendMult: number;
  cashFloorMult: number;
  expansionMinMarginMult: number;
  expansionMinCashMult: number;
  divestMarginFloor: number;
}

/**
 * Archetype -> behavior modifiers, verbatim.
 * Source: src/lib/npp/ceoArchetype.ts CEO_ARCHETYPE_MODIFIERS.
 * W9 consumes only `growthDelta` (applied once at founding to the target
 * growth rate) — marketingMult/rdMult/dividendMult/cashFloorMult/
 * expansion-min-margin/expansion-min-cash/divestMarginFloor belong to overhead budgets, dividend
 * distribution, and sector expansion/divestment logic in
 * nppCorporationBehavior.ts (1941 lines) that W9 does not port (see
 * corporationTurn.ts file doc); kept here in full for a future wave to reuse
 * without re-deriving them.
 */
export const CEO_ARCHETYPE_MODIFIERS: Record<CeoArchetype, CeoArchetypeModifiers> = {
  aggressive: {
    growthDelta: 1,
    marketingMult: 1.4,
    rdMult: 0.8,
    dividendMult: 1.2,
    cashFloorMult: 0.6,
    expansionMinMarginMult: 0.7,
    expansionMinCashMult: 0.7,
    divestMarginFloor: 0,
  },
  cautious: {
    growthDelta: 0,
    marketingMult: 0.8,
    rdMult: 0.8,
    dividendMult: 0.8,
    cashFloorMult: 1.5,
    expansionMinMarginMult: 1.3,
    expansionMinCashMult: 1.5,
    divestMarginFloor: -10,
  },
  innovator: {
    growthDelta: 0,
    marketingMult: 0.9,
    rdMult: 2.0,
    dividendMult: 0.6,
    cashFloorMult: 1.0,
    expansionMinMarginMult: 1.0,
    expansionMinCashMult: 1.0,
    divestMarginFloor: -15,
  },
  costCutter: {
    growthDelta: 0,
    marketingMult: 0.5,
    rdMult: 0.3,
    dividendMult: 1.3,
    cashFloorMult: 1.2,
    expansionMinMarginMult: 1.2,
    expansionMinCashMult: 1.1,
    divestMarginFloor: 0,
  },
};

// ── Insolvency / dissolution ─────────────────────────────────────────────

/**
 * Persistent-insolvency grace window (turns of negative liquidCapital before
 * a reincorporation). Source: nppInsolvencyDissolution.ts:81
 * PERSISTENT_INSOLVENCY_GRACE_TURNS = 30 (kept as the literal turn count —
 * both mainline and AHDClient run this cluster at a weekly-equivalent 48
 * turns/year cadence, see GROWTH_RATE_TURNS_PER_YEAR above).
 *
 * Deep-insolvency threshold: mainline's DISSOLUTION_ANCHOR_THRESHOLD
 * (nppInsolvencyDissolution.ts:76) is a fixed -1,000,000 ₳ (modern-scale
 * anchor currency), immediate no-grace trigger. AHDClient has no ₳/FX anchor
 * system and corp scale varies enormously by country/sector/era (see
 * founding.ts), so the port uses a RELATIVE threshold: a corp that has burned
 * through more cash than its entire founding capital (liquidCapital <
 * -foundingRevenue) dissolves immediately, same no-grace semantics as
 * mainline's fixed anchor, just expressed as a multiple of the corp's own
 * scale instead of an invented absolute number.
 */
export const PERSISTENT_INSOLVENCY_GRACE_TURNS = 30;

// ── Macro wire: realized revenue growth rate ────────────────────────────
// Source: <mainline-checkout>/src/lib/turn/gdpGrowth.ts:189-209
// computeRealizedRevenueGrowthRate (verbatim). This is the "one-turn delta"
// variant, not the EMA-smoothed computeTrailingRevenueGrowthRate companion
// (gdpGrowth.ts:299-310): mainline added the trailing variant specifically to
// damp noise from its market-clearing/settlement system (a ±10% timing wobble
// annualized by turnsPerYear/turnsSincePrev), which W9 does not port (no
// market/clearing, W10) — corp revenue here only moves via the smooth,
// bounded growth-rate compounding in corporationTurn.ts, so the simpler
// one-turn delta is not noisy and the EMA/snapshot machinery is unneeded.
// Bounds SECTOR_SIGNAL_MIN/MAX already exist in economy/macroConstants.ts
// (ported for this exact purpose), reused here rather than re-declared.
import { SECTOR_SIGNAL_MIN, SECTOR_SIGNAL_MAX } from "../economy/macroConstants.js";

export function computeRealizedRevenueGrowthRate(
  realizedNow: number,
  realizedPrev: number | undefined,
  turnsSincePrev: number | undefined,
  turnsPerYear: number,
): number | null {
  if (typeof realizedPrev !== "number" || !Number.isFinite(realizedPrev) || realizedPrev <= 0) {
    return null;
  }
  if (!Number.isFinite(realizedNow) || realizedNow < 0) return null;
  if (typeof turnsSincePrev !== "number" || !Number.isFinite(turnsSincePrev) || turnsSincePrev <= 0) {
    return null;
  }
  const raw = (realizedNow / realizedPrev - 1) * 100 * (turnsPerYear / turnsSincePrev);
  if (!Number.isFinite(raw)) return null;
  return Math.max(SECTOR_SIGNAL_MIN, Math.min(SECTOR_SIGNAL_MAX, raw));
}

// ── Corporate tax ────────────────────────────────────────────────────────
// Source: src/lib/turn/corporation/sectorCalculations.ts:549-699. W9 corps are
// single-sector (see types.ts file doc), so there is no multi-sector
// consolidated-loss-offset apportionment to port — taxable income is simply
// this corp's own positive pre-tax income, taxed at the country's authored
// domesticCorporateTax rate (already ported, W2 budgets). Losses are not
// taxed (matches mainline: only positive taxable income is apportioned).
export const DEFAULT_CORPORATE_TAX_RATE_PCT = 30; // fallback when a country has no budget entry.
