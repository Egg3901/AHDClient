/**
 * Central-bank formulas and constants — W3 port.
 *
 * Sources (AHDGame, all verbatim, cited per constant/function):
 *  - src/lib/nppAutonomy/nppChairAutoRate.ts (Taylor-rule target/step, autonomous chair)
 *  - src/lib/db/types/centralBank.ts (rate-grid snap, term length, coefficients)
 *  - src/lib/centralBank/chairAlignment.ts (hawk/dove policy, opposite-alignment rotation)
 *  - src/lib/centralBank/credibility.ts (scrutiny cap, resolve/relief, transmission multiplier)
 *  - src/lib/centralBank/rateCorridor.ts (corridor stance verdict)
 *  - src/lib/turn/centralBankChairTurn.ts (scrutiny-delta formula)
 *  - src/lib/budget/inflation.ts (monetary term: MONETARY_COEFF_*, effective-rate lag)
 */

// ── Taylor rule (autonomous chair) ──────────────────────────────────────────
// Source: src/lib/db/types/centralBank.ts

/** Source: db/types/centralBank.ts NPP_CHAIR_INFLATION_COEF. */
export const NPP_CHAIR_INFLATION_COEF = 1.0;
/** Source: db/types/centralBank.ts NPP_CHAIR_GROWTH_COEF. */
export const NPP_CHAIR_GROWTH_COEF = 0.5;
/** Source: db/types/centralBank.ts NPP_CHAIR_STEP_FRACTION. */
export const NPP_CHAIR_STEP_FRACTION = 0.5;
/** Source: db/types/centralBank.ts NPP_CHAIR_TARGET_GROWTH. */
export const NPP_CHAIR_TARGET_GROWTH = 2.0;
/** Source: db/types/centralBank.ts MAX_RATE_CHANGE_DELTA (hike cap). */
export const MAX_RATE_CHANGE_DELTA = 0.75;
/** Source: db/types/centralBank.ts MAX_RATE_CUT_DELTA (cut cap). */
export const MAX_RATE_CUT_DELTA = 1.75;
/** Source: db/types/centralBank.ts PRIME_RATE_STEP (quarter-point grid). */
export const PRIME_RATE_STEP = 0.25;
/** Source: nppChairAutoRate.ts / centralBank.ts RATE_CHANGE_COOLDOWN_TURNS. */
export const RATE_CHANGE_COOLDOWN_TURNS = 6;
/** Source: src/lib/turn/centralBankChairSelection.ts CHAIR_TERM_TURNS (4 years x 48 turns/year); mirrored as FOMC_TERM_TURNS in db/types/centralBank.ts. */
export const CHAIR_TERM_TURNS = 192;

/**
 * Snap a policy rate onto the quarter-point grid.
 * Source: db/types/centralBank.ts snapToPrimeRateGrid.
 */
export function snapToPrimeRateGrid(rate: number): number {
  if (!Number.isFinite(rate)) return rate;
  return Math.round(rate / PRIME_RATE_STEP) * PRIME_RATE_STEP;
}

// ── Hawk/dove alignment policy ───────────────────────────────────────────────
// Source: src/lib/centralBank/chairAlignment.ts

export type ChairAlignment = "hawk" | "dove";

export interface ChairAlignmentPolicy {
  inflationCoefMult: number;
  growthCoefMult: number;
  targetInflationDelta: number;
  hikeStepMult: number;
  cutStepMult: number;
}

/** Source: chairAlignment.ts NEUTRAL_CHAIR_POLICY. */
export const NEUTRAL_CHAIR_POLICY: ChairAlignmentPolicy = {
  inflationCoefMult: 1,
  growthCoefMult: 1,
  targetInflationDelta: 0,
  hikeStepMult: 1,
  cutStepMult: 1,
};

/** Source: chairAlignment.ts CHAIR_ALIGNMENT_POLICY. */
export const CHAIR_ALIGNMENT_POLICY: Record<ChairAlignment, ChairAlignmentPolicy> = {
  hawk: {
    inflationCoefMult: 1.5,
    growthCoefMult: 0.5,
    targetInflationDelta: -0.5,
    hikeStepMult: 1.25,
    cutStepMult: 0.75,
  },
  dove: {
    inflationCoefMult: 0.6,
    growthCoefMult: 1.5,
    targetInflationDelta: 0.5,
    hikeStepMult: 0.75,
    cutStepMult: 1.25,
  },
};

/** Source: chairAlignment.ts chairAlignmentPolicy. Null/undefined (no alignment set) -> neutral. */
export function chairAlignmentPolicy(alignment: ChairAlignment | null | undefined): ChairAlignmentPolicy {
  if (alignment === "hawk" || alignment === "dove") return CHAIR_ALIGNMENT_POLICY[alignment];
  return NEUTRAL_CHAIR_POLICY;
}

/** Source: chairAlignment.ts oppositeAlignment. */
export function oppositeAlignment(alignment: ChairAlignment): ChairAlignment {
  return alignment === "hawk" ? "dove" : "hawk";
}

/**
 * Taylor-rule target rate: neutral + alpha*(inflation - target) + beta*(growth - 2.0),
 * tilted by hawk/dove alignment.
 * Source: nppChairAutoRate.ts computeNppChairRateTarget.
 */
export function computeNppChairRateTarget(params: {
  neutralRate: number;
  inflationRate: number;
  targetInflation: number;
  gdpGrowth: number;
  alignment?: ChairAlignment | null;
}): number {
  const policy = chairAlignmentPolicy(params.alignment);
  const effectiveTargetInflation = params.targetInflation + policy.targetInflationDelta;
  return (
    params.neutralRate +
    NPP_CHAIR_INFLATION_COEF * policy.inflationCoefMult * (params.inflationRate - effectiveTargetInflation) +
    NPP_CHAIR_GROWTH_COEF * policy.growthCoefMult * (params.gdpGrowth - NPP_CHAIR_TARGET_GROWTH)
  );
}

/**
 * Bounded step toward the target: 0.5x the gap, clamped to [-1.75, +0.75],
 * hike/cut speed scaled by alignment before the clamp.
 * Source: nppChairAutoRate.ts computeNppChairRateStep.
 */
export function computeNppChairRateStep(params: {
  currentRate: number;
  targetRate: number;
  alignment?: ChairAlignment | null;
}): number {
  const policy = chairAlignmentPolicy(params.alignment);
  const desired = params.targetRate - params.currentRate;
  let step = NPP_CHAIR_STEP_FRACTION * desired;
  step *= step >= 0 ? policy.hikeStepMult : policy.cutStepMult;
  return Math.max(-MAX_RATE_CUT_DELTA, Math.min(MAX_RATE_CHANGE_DELTA, step));
}

// ── Chair scrutiny / credibility ─────────────────────────────────────────────
// Source: src/lib/turn/centralBankChairTurn.ts + src/lib/centralBank/credibility.ts

/** Source: centralBankChairTurn.ts TARGET_GROWTH. */
export const TARGET_GROWTH = 2.0;
/** Source: centralBankChairTurn.ts INFAMY_COEFFICIENT. */
export const INFAMY_COEFFICIENT = 0.5;
/** Source: centralBankChairTurn.ts INFAMY_DECAY. */
export const INFAMY_DECAY = 0.95;
/** Source: centralBankChairTurn.ts POSITIVE_DAMPENING_SCALE. */
export const POSITIVE_DAMPENING_SCALE = 150;
/** Source: credibility.ts MAX_SCRUTINY_GAIN_PER_TURN. */
export const MAX_SCRUTINY_GAIN_PER_TURN = 8;
/** Source: credibility.ts RESOLVE_TURNS_REQUIRED. */
export const RESOLVE_TURNS_REQUIRED = 3;
/** Source: credibility.ts RESOLVE_SCRUTINY_RELIEF. */
export const RESOLVE_SCRUTINY_RELIEF = 6;
/** Source: credibility.ts CHAIR_CHANGE_SCRUTINY_RETAINED. */
export const CHAIR_CHANGE_SCRUTINY_RETAINED = 0.75;
/** Source: credibility.ts TRANSMISSION_FLOOR. */
export const TRANSMISSION_FLOOR = 0.6;
/** Source: rateCorridor.ts NEUTRAL_BAND. */
export const CORRIDOR_NEUTRAL_BAND = 0.5;

/**
 * Per-turn scrutiny delta (before decay/cap).
 * Source: centralBankChairTurn.ts computeScrutinyDelta.
 */
export function computeScrutinyDelta(
  inflationRate: number,
  gdpGrowth: number,
  currentInfamy: number,
  targetInflation: number,
): number {
  const inflationDelta = (inflationRate - targetInflation) * INFAMY_COEFFICIENT;
  const growthDelta = (TARGET_GROWTH - gdpGrowth) * INFAMY_COEFFICIENT;
  let totalDelta = inflationDelta + growthDelta;

  if (totalDelta < 0) {
    const dampener = Math.max(0.1, 1 - currentInfamy / POSITIVE_DAMPENING_SCALE);
    totalDelta *= dampener;
  }

  return totalDelta;
}

/** Cap the per-turn scrutiny rise. Source: credibility.ts capScrutinyGain. */
export function capScrutinyGain(delta: number): number {
  if (!Number.isFinite(delta)) return 0;
  return delta > MAX_SCRUTINY_GAIN_PER_TURN ? MAX_SCRUTINY_GAIN_PER_TURN : delta;
}

/**
 * Rate-corridor stance: restrictive (primeRate well above inflation),
 * accommodative (well below), else neutral.
 * Source: rateCorridor.ts corridorVerdict (copy/UI text omitted — engine-only).
 */
export function corridorStance(primeRate: number, inflation: number): "restrictive" | "neutral" | "accommodative" {
  const delta = primeRate - inflation;
  if (delta > CORRIDOR_NEUTRAL_BAND) return "restrictive";
  if (delta < -CORRIDOR_NEUTRAL_BAND) return "accommodative";
  return "neutral";
}

/** Source: credibility.ts stanceIsCorrect. */
export function stanceIsCorrect(primeRate: number, inflation: number, targetInflation: number): boolean {
  const stance = corridorStance(primeRate, inflation);
  if (inflation > targetInflation + 0.5) return stance === "restrictive";
  if (inflation < targetInflation - 0.5) return stance === "accommodative";
  return stance === "neutral";
}

export interface ResolveState {
  resolveStreak: number;
  relief: number;
}

/** Source: credibility.ts resolveRecoveryDelta. */
export function resolveRecoveryDelta(params: { correctStance: boolean; previousStreak: number }): ResolveState {
  if (!params.correctStance) return { resolveStreak: 0, relief: 0 };
  const streak = Math.max(0, params.previousStreak) + 1;
  if (streak < RESOLVE_TURNS_REQUIRED) return { resolveStreak: streak, relief: 0 };
  return { resolveStreak: 0, relief: RESOLVE_SCRUTINY_RELIEF };
}

/** 0 (no credibility) .. 1 (full credibility). Source: credibility.ts credibilityFromScrutiny. */
export function credibilityFromScrutiny(scrutiny: number): number {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(scrutiny) ? scrutiny : 0));
  return 1 - clamped / 100;
}

/** Source: credibility.ts transmissionMultiplier. */
export function transmissionMultiplier(scrutiny: number): number {
  return TRANSMISSION_FLOOR + (1 - TRANSMISSION_FLOOR) * credibilityFromScrutiny(scrutiny);
}

// ── Monetary term for inflation (macroCountryTurn wiring) ──────────────────
// Source: src/lib/budget/inflation.ts

/** Source: inflation.ts MONETARY_COEFF_LOW (below-neutral rate gap -> stimulative). */
export const MONETARY_COEFF_LOW = 0.4;
/** Source: inflation.ts MONETARY_COEFF_HIGH (above-neutral rate gap -> deflationary). */
export const MONETARY_COEFF_HIGH = 1.2;
/** Source: inflation.ts MONETARY_LAG_TURNS (trailing-average propagation window). */
export const MONETARY_LAG_TURNS = 12;
/** Source: inflation.ts SPOT_RATE_IMMEDIATE_WEIGHT. */
export const SPOT_RATE_IMMEDIATE_WEIGHT = 0.3;

/**
 * Effective prime rate for inflation purposes: 30% spot + 70% trailing weighted
 * average of up to the last MONETARY_LAG_TURNS history entries (older entries
 * weighted more heavily, since they have had longer to propagate). Falls back
 * to the spot rate when no history is available.
 * Source: inflation.ts computeEffectivePrimeRate.
 */
export function computeEffectivePrimeRate(spotRate: number, history?: readonly number[]): number {
  if (!history || history.length === 0) return spotRate;

  const window = history.slice(-MONETARY_LAG_TURNS);
  const n = window.length;

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < n; i++) {
    const turnsAgo = n - 1 - i;
    const propagation = Math.max(1 / MONETARY_LAG_TURNS, Math.min(1, turnsAgo / MONETARY_LAG_TURNS));
    weightedSum += window[i]! * propagation;
    totalWeight += propagation;
  }

  const trailingAvg = totalWeight > 0 ? weightedSum / totalWeight : spotRate;
  return SPOT_RATE_IMMEDIATE_WEIGHT * spotRate + (1 - SPOT_RATE_IMMEDIATE_WEIGHT) * trailingAvg;
}

/**
 * Signed pp contribution of monetary policy to inflation: a rate above neutral
 * is deflationary, below is stimulative, dampened toward TRANSMISSION_FLOOR by
 * chair scrutiny (a discredited bank's expectations channel is weaker).
 * Source: inflation.ts calculateInflationWithBreakdown, the "2. Monetary policy" block.
 */
export function computeMonetaryTerm(
  primeRate: number,
  primeRateHistory: readonly number[] | undefined,
  neutralPrimeRate: number,
  scrutiny: number,
): number {
  const effectiveRate = computeEffectivePrimeRate(primeRate, primeRateHistory);
  const rateGap = neutralPrimeRate - effectiveRate;
  const raw = rateGap >= 0 ? rateGap * MONETARY_COEFF_LOW : rateGap * MONETARY_COEFF_HIGH;
  return raw * transmissionMultiplier(scrutiny);
}

// ── Per-country 1953 anchors ─────────────────────────────────────────────────
// defaultPrimeRate: src/lib/constants/countries.ts COUNTRY_CONFIGS[id].centralBank.defaultPrimeRate
//   (the actual seeder value per src/lib/admin/seedDiagnostic/expectations.ts +
//   conformance.test.ts "uses seeder defaultPrimeRate, not era monetary baseline").
// neutralPrimeRate / targetInflation: era-graduated per src/lib/constants/monetaryEra.ts
//   MONETARY_BASELINES_1953 where a 1953 entry exists (RU, DD); otherwise the modern
//   src/lib/constants/currencies.ts MONETARY_BASELINES table, which the monetaryEra.ts
//   file doc says is "already era-plausible for 1953" for US/UK (no override authored).
export interface CentralBankCountryAnchor {
  defaultPrimeRate: number;
  neutralPrimeRate: number;
  targetInflation: number;
}

export const CENTRAL_BANK_COUNTRY_ANCHORS: Record<string, CentralBankCountryAnchor> = {
  // Source: countries.ts:888 defaultPrimeRate; currencies.ts:758 (no 1953 override).
  US: { defaultPrimeRate: 3.0, neutralPrimeRate: 3.0, targetInflation: 2.0 },
  // Source: countries.ts:1054 defaultPrimeRate; currencies.ts:759 (no 1953 override).
  UK: { defaultPrimeRate: 3.0, neutralPrimeRate: 3.0, targetInflation: 2.0 },
  // Source: countries.ts:3861 defaultPrimeRate; monetaryEra.ts MONETARY_BASELINES_1953.RU
  // (administered Gosbank rates; trendGdpGrowth 6.0 not consumed here — layer-1 growth
  // fallback only, solo already computes RU growth via macroCountryTurnPhase).
  RU: { defaultPrimeRate: 3.0, neutralPrimeRate: 2.5, targetInflation: 1.0 },
  // Source: countries.ts:5175 defaultPrimeRate; monetaryEra.ts MONETARY_BASELINES_1953.DD.
  DD: { defaultPrimeRate: 5.0, neutralPrimeRate: 3.5, targetInflation: 0.5 },
};
