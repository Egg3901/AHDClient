/**
 * Bond constants and pure formulas — W13 port.
 *
 * Sources (AHDGame, all verbatim, cited per constant/function):
 *  - src/lib/db/types/bond.ts (BOND_UNIT_FACE_VALUE, BOND_MATURITY_OPTIONS, SOVEREIGN_BOND_MATURITY_ADMIN_OPTIONS)
 *  - src/lib/bonds/sovereign.ts (SOVEREIGN_ISSUANCE_INTERVAL_TURNS, SOVEREIGN_BOND_MATURITY_TURNS, SOVEREIGN_BOND_TERM_PREMIUMS, getSovereignCouponRate, calculateQuarterlyIssuanceAmount, applySovereignDebtAdjustment spirit)
 *  - src/lib/constants/bonds.ts (BOND_UNIT_FACE_VALUE re-export, calculateBondMarketPrice, calculateBondYieldToMaturityPercent, perTurnCouponPayment)
 *  - src/lib/db/types/centralBank.ts (CREDIT_RATING_SPREADS — not used for sovereign hot path, kept for share-price parity)
 *  - src/lib/constants/turnTime.ts (TURNS_PER_YEAR = 48)
 *
 * No invented numbers: every numeric literal below cites its mainline source file.
 */

import type { BondMaturityTurns } from "./types.js";

// Source: bone.ts BOND_UNIT_FACE_VALUE + bonds.ts re-export — every bond unit = $1,000 face
export const BOND_UNIT_FACE_VALUE = 1_000;

// Source: sovereign.ts SOVEREIGN_ISSUANCE_INTERVAL_TURNS = 12 (quarterly)
export const SOVEREIGN_ISSUANCE_INTERVAL_TURNS = 12;

// Source: sovereign.ts SOVEREIGN_BOND_MATURITY_TURNS = 48 (sovereign base; admin offers 48/96/240)
export const SOVEREIGN_BOND_MATURITY_TURNS: BondMaturityTurns = 48;

// Source: turnTime.ts TURNS_PER_YEAR = 48
export const TURNS_PER_YEAR = 48;

// ── Sovereign term premiums (pp over prime rate) ──────────────────────────
// Source: sovereign.ts SOVEREIGN_BOND_TERM_PREMIUMS
// Mirrors real-world yield-curve steepening: 1yr at par prime, 2yr +0.25pp, 5yr +0.75pp
export const SOVEREIGN_BOND_TERM_PREMIUMS: Partial<Record<BondMaturityTurns, number>> = {
  48: 0,
  96: 0.25,
  240: 0.75,
};

// Sovereign reconcile distribution is NOT ported — solo uses single-maturity issuance only
// (48t). The distribution is an admin reconcile convenience; the turn pipeline's
// staggered maturity is deferred as not needed for the quarterly deficit auction shape.

// ── Pricing ────────────────────────────────────────────────────────────────

/**
 * Effective sovereign coupon rate = primeRate + term premium for the given maturity.
 * Rounds to 2 dp so stored rates stay human-readable.
 * Source: sovereign.ts getSovereignCouponRate (without B4 credibility spread — solo has no chairInfamy spread wiring on issuance; rate transcript covers this gap).
 */
export function getSovereignCouponRate(primeRate: number, maturityTurns: BondMaturityTurns): number {
  const termPremium = SOVEREIGN_BOND_TERM_PREMIUMS[maturityTurns] ?? 0;
  return Math.round((primeRate + termPremium) * 100) / 100;
}

// Source: sovereign.ts shouldIssueQuarterlySovereignBondSeries — turn >0 && turn % 12 ==0
export function shouldIssueQuarterlySovereignBondSeries(turn: number): boolean {
  return turn > 0 && turn % SOVEREIGN_ISSUANCE_INTERVAL_TURNS === 0;
}

// Source: sovereign.ts calculateQuarterlyIssuanceAmount — floor((annualDeficit/4)/1000)*1000
export function calculateQuarterlyIssuanceAmount(annualDeficit: number): number {
  if (annualDeficit <= 0) return 0;
  const quarterlyAmount = annualDeficit / 4;
  return Math.floor(quarterlyAmount / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
}

/**
 * Total annual coupon cost for a bond's face: (couponRate/100)*totalIssued.
 * Used to roll debtInterest at issuance/maturity — mirrors sovereign.ts
 * buildSovereignBondDoc annualCouponCost + applySovereignDebtAdjustment delta.
 */
export function annualCouponCostForBond(couponRate: number, totalIssued: number): number {
  return (couponRate / 100) * totalIssued;
}

// ── Market price / yield / per-turn coupon ─────────────────────────────────
// Source: constants/bonds.ts calculateBondMarketPrice, calculateBondYieldToMaturityPercent, perTurnCouponPayment
// All copied verbatim (Math, clamp, rounding) — no invented ladder.

/**
 * Calculate bond market price based on current rates and time to maturity.
 * Price is expressed as fraction of face value (1.0 = par).
 * Source: bonds.ts calculateBondMarketPrice.
 */
export function calculateBondMarketPrice(
  couponRate: number,
  currentRate: number,
  turnsRemaining: number,
  defaulted: boolean,
): number {
  if (defaulted) return 0.1;
  if (turnsRemaining <= 0) return 1.0;
  const yearsRemaining = turnsRemaining / TURNS_PER_YEAR;
  const r = currentRate / 100;
  const c = couponRate / 100;
  if (r <= 0) return 1.0 + c * yearsRemaining;
  const discountFactor = Math.pow(1 + r, -yearsRemaining);
  const annuityFactor = (1 - discountFactor) / r;
  const price = c * annuityFactor + discountFactor;
  return Math.max(0.05, Math.min(2.0, Math.round(price * 10000) / 10000));
}

/**
 * Approximate yield-to-maturity as an annual percent using normalized bond fields.
 * Source: bonds.ts calculateBondYieldToMaturityPercent.
 */
export function calculateBondYieldToMaturityPercent(
  couponRate: number,
  marketPrice: number,
  turnsRemaining: number,
): number {
  if (marketPrice <= 0 || turnsRemaining <= 0) return 0;
  const yearsRemaining = turnsRemaining / TURNS_PER_YEAR;
  if (yearsRemaining <= 0) return 0;
  return ((couponRate / 100 + (1 - marketPrice) / yearsRemaining) / marketPrice) * 100;
}

/**
 * Per-turn coupon payment for a single bond unit: annual coupon / TURNS_PER_YEAR.
 * Source: bonds.ts perTurnCouponPayment.
 */
export function perTurnCouponPayment(couponRate: number, faceValue: number): number {
  return ((couponRate / 100) * faceValue) / TURNS_PER_YEAR;
}

/**
 * Trace shape for UI diagnostics — mirrors mainline's bond history snapshot shape
 * (src/lib/turn/bondTurnLedger snapshotBondHistory) at the per-bond granularity
 * the trace-bonds panel needs: price and yield alongside turns remaining.
 */
export interface BondTrace {
  id: string;
  countryId: string;
  couponRate: number;
  marketPrice: number;
  yieldToMaturity: number;
  turnsRemaining: number;
  totalIssued: number;
  publicFloat: number;
  playerUnits: number;
}
