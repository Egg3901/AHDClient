/**
 * Pure exchange-rate math — no DB/RNG, no IO. Solo port of
 * src/lib/currency/rateCalculation.ts (verbatim formulas, cited per section).
 *
 * Three components combine each turn: macro target drift, peg/float
 * clamping, and deterministic jitter (via WorldRng, not Math.random).
 *
 * Rate is local per anchor (USD). Lower = stronger — a stronger currency
 * needs fewer local units per dollar.
 */

import {
  ABSOLUTE_INFLATION_DEPRECIATION_THRESHOLD,
  ABSOLUTE_INFLATION_SENSITIVITY,
  DRIFT_SPEED,
  GDP_GROWTH_SENSITIVITY,
  INFLATION_SENSITIVITY,
  PRIME_RATE_SENSITIVITY,
  RATE_CEILING_MULTIPLIER,
  RATE_FLOOR_MULTIPLIER,
  TRADE_GROWTH_SENSITIVITY,
  MONETARY_BASELINES,
  MONETARY_BASELINES_1953,
  RATE_NOISE_MAX,
} from "./constants.js";

export interface MacroInputs {
  primeRate: number; // percent
  inflationRate: number; // percent
  gdpGrowth: number; // percent
  tradeGrowth: number; // percent
}

/**
 * Era-aware monetary baseline — resolves 1953 overrides when era is 1953.
 * Source: monetaryEra.ts MONETARY_BASELINES_1953 vs currencies.ts MONETARY_BASELINES.
 */
export function resolveMonetaryBaseline(countryId: string, era: string | null | undefined) {
  if (era === "1953") {
    const eraRow = (MONETARY_BASELINES_1953 as Record<string, { targetInflation: number; neutralPrimeRate: number }>)[countryId];
    if (eraRow) return eraRow;
  }
  return (MONETARY_BASELINES as Record<string, { targetInflation: number; neutralPrimeRate: number }>)[countryId] ?? { targetInflation: 2.0, neutralPrimeRate: 3.0 };
}

/**
 * Economic baseline — the GDP growth anchor the macro target is judged against.
 * Solo has no per-country ECONOMIC_BASELINES table this wave; uses the
 * 2.5% default that tradeGrowthMirror/budgets assume (budgets.ts economicFactors
 * and world.ts seed fallback). This matches the pre-era-table fallback in
 * rateCalculation.ts (ECONOMIC_BASELINES[countryId] when missing → treat as 0).
 */
function economicBaselineGdpGrowth(): number {
  return 2.5;
}

/**
 * Compute the macro-fundamental target rate.
 * Source: rateCalculation.ts computeMacroTarget — verbatim formula.
 */
export function computeMacroTarget(
  baseRate: number,
  inputs: MacroInputs,
  countryId: string,
  era: string | null | undefined,
): number {
  const monetaryBaseline = resolveMonetaryBaseline(countryId, era);
  const economicBaselineGrowth = economicBaselineGdpGrowth();

  const excessInflation = Math.max(0, inputs.inflationRate - ABSOLUTE_INFLATION_DEPRECIATION_THRESHOLD);
  const absoluteInflationPenalty = excessInflation * ABSOLUTE_INFLATION_SENSITIVITY;

  // If no specific baseline was different, still apply absolute penalty so high inflation always weakens
  // (the carry-trade fix, currencies.ts ABSOLUTE_INFLATION_DEPRECIATION_THRESHOLD).
  const baselineIsDefault = !(MONETARY_BASELINES as Record<string, unknown>)[countryId] && !(MONETARY_BASELINES_1953 as Record<string, unknown>)[countryId];
  if (baselineIsDefault) {
    return baseRate * Math.max(0.01, 1 + absoluteInflationPenalty);
  }

  const multiplier =
    1 -
    (inputs.primeRate - monetaryBaseline.neutralPrimeRate) * PRIME_RATE_SENSITIVITY +
    (inputs.inflationRate - monetaryBaseline.targetInflation) * INFLATION_SENSITIVITY +
    absoluteInflationPenalty -
    (inputs.gdpGrowth - economicBaselineGrowth) * GDP_GROWTH_SENSITIVITY -
    (inputs.tradeGrowth - 0) * TRADE_GROWTH_SENSITIVITY;

  return baseRate * Math.max(0.01, multiplier);
}

/** Source: rateCalculation.ts applyDrift */
export function applyDrift(currentRate: number, macroTarget: number, driftSpeed = DRIFT_SPEED): number {
  return currentRate + (macroTarget - currentRate) * driftSpeed;
}

/** Source: currencies.ts RATE_*_MULTIPLIER guardrail */
export function clampRate(rate: number, baseRate: number): number {
  const floor = baseRate * RATE_FLOOR_MULTIPLIER;
  const ceiling = baseRate * RATE_CEILING_MULTIPLIER;
  return Math.max(floor, Math.min(ceiling, rate));
}

/**
 * Deterministic per-turn jitter in [-RATE_NOISE_MAX, +RATE_NOISE_MAX].
 * Caller must thread WorldRng.next() -> [-1,1] mapped to this range. This
 * function is the mapping; no Math.random.
 */
export function noiseFromUnit(unit: number): number {
  // unit in [-1, 1] from rng
  return unit * RATE_NOISE_MAX;
}

export function applyNoise(rate: number, noise: number): number {
  return rate * (1 + noise);
}

export interface RateUpdateResult {
  rate: number;
  macroTarget: number;
}

/**
 * Full pipeline for one currency: macro target -> drift -> noise -> clamp.
 * Pegged regimes clamp tighter via regime.ts clampToRegimeBand (called by forexTurn).
 */
export function computeRateUpdate(
  currentRate: number,
  baseRate: number,
  countryId: string,
  macro: MacroInputs,
  noise: number,
  era: string | null | undefined,
  driftMultiplier = 1,
): RateUpdateResult {
  const macroTarget = computeMacroTarget(baseRate, macro, countryId, era);
  const drifted = applyDrift(currentRate, macroTarget, DRIFT_SPEED * driftMultiplier);
  const withNoise = applyNoise(drifted, noise);
  const clamped = clampRate(withNoise, baseRate);
  return { rate: clamped, macroTarget };
}
