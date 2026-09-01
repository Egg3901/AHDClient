/**
 * Per-turn inflation recalculation — port of src/lib/turn/inflationRecalc.ts
 * (current fixed wiring) and src/lib/budget/inflation.ts calculateInflationWithBreakdown.
 *
 * Mainline bug history: the OLD commodity pressure channel used price LEVEL
 * (avg(P_national / P_base - 1)) as a constant fed into an inflation RATE,
 * which could never decay to zero when prices settled. Mainline fixed it to
 * annualized CHANGE: median over commodities of pow(price/prior, TURNS_PER_YEAR/lookback)-1,
 * with per-commodity clamp [-0.5, 2.0] and fallback to 12-turn short window when
 * the 24-turn window is unavailable. Forex pressure is rate/baseRate-1. Both
 * feed the inflation formula's cost-push arms with commodity clamp [-0.15,0.3]
 * and forex clamp [-0.25,0.25].
 *
 * This port implements the FIXED (rate-based) mainline behavior verbatim.
 * The OLD commodity package's MAINLINE-BUG markers porting the level conflation
 * are removed; this comment notes the fix source:
 *  - Fix source: src/lib/turn/inflationRecalc.ts COMMODITY_INFLATION_LOOKBACK_TURNS = TURNS_PER_YEAR/2 (24)
 *    and buildCommodityPressureSnapshots annualized change logic
 *  - Also: src/lib/budget/inflation.ts COMMODITY_PRESSURE_CLAMP_DOWN/UP, FOREX_PRESSURE_CLAMP, etc.
 *
 * Other pressures (savings, moneySupply, tariff, wage, policy, housing) are
 * PORT-STUB at neutral with named blockers where inputs absent.
 *
 * Sources:
 *  - src/lib/turn/inflationRecalc.ts (orchestrator, commodity snapshots, savings flow, median, clamps)
 *  - src/lib/budget/inflation.ts calculateInflationWithBreakdown (formula, inertia, mean-reversion, delta clamp)
 *  - src/lib/constants/turnTime.ts TURNS_PER_YEAR = 48 (annualization base)
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import {
  TURNS_PER_YEAR,
  INFLATION_BASE_TARGET,
  INFLATION_TREND_GDP_GROWTH,
  INFLATION_NAIRU,
  INFLATION_UNEMPLOYMENT_COEFF_UP,
  INFLATION_UNEMPLOYMENT_COEFF_DOWN,
  INFLATION_GDP_COEFF_UP,
  INFLATION_GDP_COEFF_DOWN,
  INFLATION_NEUTRAL_RATE,
  INFLATION_MONETARY_COEFF_LOW,
  INFLATION_MONETARY_COEFF_HIGH,
  INFLATION_FISCAL_COEFF_DEFICIT,
  INFLATION_FISCAL_COEFF_SURPLUS,
  INFLATION_INERTIA,
  INFLATION_MEAN_REVERSION_COEFF,
  INFLATION_MAX_PER_TURN_DELTA,
  INFLATION_MIN,
  INFLATION_MAX,
} from "../economy/macroConstants.js";

// Fixed wiring constants (source: inflationRecalc.ts / inflation.ts)
export const COMMODITY_INFLATION_LOOKBACK_TURNS = TURNS_PER_YEAR / 2; // 24, source: inflationRecalc.ts
export const COMMODITY_INFLATION_SHORT_LOOKBACK_TURNS = 12; // source: inflationRecalc.ts
export const COMMODITY_PRESSURE_ROW_FLOOR = -0.5; // source: inflationRecalc.ts
export const COMMODITY_PRESSURE_ROW_CEILING = 2.0; // source: inflationRecalc.ts
export const COMMODITY_PRESSURE_CLAMP_UP = 0.3; // source: inflation.ts COMMODITY_PRESSURE_CLAMP_UP
export const COMMODITY_PRESSURE_CLAMP_DOWN = -0.15; // source: inflation.ts COMMODITY_PRESSURE_CLAMP_DOWN
export const COMMODITY_PRESSURE_COEFF_UP = 30.0; // source: inflation.ts
export const COMMODITY_PRESSURE_COEFF_DOWN = 15.0;
export const FOREX_PRESSURE_CLAMP = 0.25; // source: inflation.ts
export const FOREX_PRESSURE_COEFF_UP = 8.0; // source: inflation.ts
export const FOREX_PRESSURE_COEFF_DOWN = 4.0;
export const FOREX_DEFLATION_ATTENUATION_HALFLIFE = 4.0; // source: inflation.ts
export const MONETARY_LAG_TURNS = 12; // source: inflation.ts MONETARY_LAG_TURNS
const SPOT_RATE_IMMEDIATE_WEIGHT = 0.3; // source: inflation.ts

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function computeEffectivePrimeRate(spotRate: number, history?: number[]): number {
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

// Pure inflation calculation (source: budget/inflation.ts calculateInflationWithBreakdown)
export interface InflationInputs {
  targetInflation?: number | undefined;
  neutralPrimeRate?: number | undefined;
  unemployment: number;
  gdpGrowth: number;
  primeRate: number;
  primeRateHistory?: number[] | undefined;
  surplusToGdp: number;
  tariffRate: number;
  wageGrowth: number;
  commodityPressure: number;
  forexPressure: number;
  savingsPressure: number;
  housingCostPressure?: number | undefined;
  previousInflation: number;
  policyStancePressure?: number | undefined;
  moneySupplyGrowthPct?: number | undefined;
  centralBankScrutiny?: number | undefined;
}

export function calculateInflationWithBreakdown(inputs: InflationInputs): { rate: number; breakdown: Record<string, number> } {
  const targetInflationInput = finiteOr(inputs.targetInflation, INFLATION_BASE_TARGET);
  const neutralPrimeRateInput = finiteOr(inputs.neutralPrimeRate, INFLATION_NEUTRAL_RATE);
  const unemploymentInput = finiteOr(inputs.unemployment, INFLATION_NAIRU);
  const gdpGrowthInput = finiteOr(inputs.gdpGrowth, INFLATION_TREND_GDP_GROWTH);
  const primeRateInput = finiteOr(inputs.primeRate, neutralPrimeRateInput);
  const primeRateHistoryInput = inputs.primeRateHistory?.filter((r): r is number => typeof r === "number" && Number.isFinite(r));
  const surplusToGdpInput = finiteOr(inputs.surplusToGdp, 0);
  const tariffRateInput = finiteOr(inputs.tariffRate, 3.0);
  const wageGrowthInput = finiteOr(inputs.wageGrowth, 2.5);
  const commodityPressureInput = finiteOr(inputs.commodityPressure, 0);
  const forexPressureInput = finiteOr(inputs.forexPressure, 0);
  const savingsPressureInput = finiteOr(inputs.savingsPressure, 0);
  const housingCostPressureInput = finiteOr(inputs.housingCostPressure, 0);
  const previousInflationInput = finiteOr(inputs.previousInflation, targetInflationInput);
  const policyStancePressureInput = finiteOr(inputs.policyStancePressure, 0);
  const moneySupplyGrowthInput = finiteOr(inputs.moneySupplyGrowthPct, gdpGrowthInput);

  const uGap = INFLATION_NAIRU - unemploymentInput;
  const unemployment = uGap >= 0 ? uGap * INFLATION_UNEMPLOYMENT_COEFF_UP : uGap * INFLATION_UNEMPLOYMENT_COEFF_DOWN;
  const gGap = gdpGrowthInput - INFLATION_TREND_GDP_GROWTH;
  const gdp = gGap >= 0 ? gGap * INFLATION_GDP_COEFF_UP : gGap * INFLATION_GDP_COEFF_DOWN;
  const effectiveRate = computeEffectivePrimeRate(primeRateInput, primeRateHistoryInput);
  const rateGap = neutralPrimeRateInput - effectiveRate;
  const monetaryRaw = rateGap >= 0 ? rateGap * INFLATION_MONETARY_COEFF_LOW : rateGap * INFLATION_MONETARY_COEFF_HIGH;
  // Blocked: central bank credibility transmission multiplier requires scrutiny model (E06_CREDIBILITY) — neutral 1.0
  const monetary = monetaryRaw;

  const deficitPctRaw = -surplusToGdpInput * 100;
  const deficitPct = Math.max(-30, Math.min(50, deficitPctRaw));
  const fiscal = deficitPct >= 0 ? deficitPct * INFLATION_FISCAL_COEFF_DEFICIT : deficitPct * INFLATION_FISCAL_COEFF_SURPLUS;

  const tariffGap = tariffRateInput - 3.0;
  const tariff = tariffGap >= 0 ? tariffGap * 0.05 : tariffGap * 0.025;
  const wageGap = wageGrowthInput - 2.5;
  const wage = wageGap >= 0 ? wageGap * 0.15 : wageGap * 0.08;

  const clampedCommodity = Math.max(COMMODITY_PRESSURE_CLAMP_DOWN, Math.min(COMMODITY_PRESSURE_CLAMP_UP, commodityPressureInput));
  const commodity = clampedCommodity >= 0 ? clampedCommodity * COMMODITY_PRESSURE_COEFF_UP : clampedCommodity * COMMODITY_PRESSURE_COEFF_DOWN;

  const clampedForex = Math.max(-FOREX_PRESSURE_CLAMP, Math.min(FOREX_PRESSURE_CLAMP, forexPressureInput));
  const rawForex = clampedForex >= 0 ? clampedForex * FOREX_PRESSURE_COEFF_UP : clampedForex * FOREX_PRESSURE_COEFF_DOWN;
  const deflationDepth = Math.max(0, targetInflationInput - previousInflationInput);
  const forex = rawForex < 0 ? rawForex * (FOREX_DEFLATION_ATTENUATION_HALFLIFE / (FOREX_DEFLATION_ATTENUATION_HALFLIFE + deflationDepth)) : rawForex;

  const savings = savingsPressureInput >= 0 ? savingsPressureInput * 1.0 : savingsPressureInput * 0.5;
  const housing = housingCostPressureInput * 0; // HOUSING_PRESSURE_COEFF = 0 retired
  const policy = policyStancePressureInput;
  const moneySupply = Math.max(-1.5, Math.min(2.5, (moneySupplyGrowthInput - gdpGrowthInput) * 0.08));

  const base = targetInflationInput;
  const rawInflation = base + unemployment + gdp + monetary + fiscal + tariff + wage + commodity + forex + savings + housing + policy + moneySupply;
  const smoothedRaw = INFLATION_INERTIA * previousInflationInput + (1 - INFLATION_INERTIA) * rawInflation;
  const meanReversion = INFLATION_MEAN_REVERSION_COEFF * (targetInflationInput - smoothedRaw);
  const smoothed = smoothedRaw + meanReversion;
  const delta = smoothed - previousInflationInput;
  const recoveringFromDeepDeflation = previousInflationInput < targetInflationInput - 4.0 && rawInflation > targetInflationInput - 1 && delta > 0;
  const maxPositiveDelta = recoveringFromDeepDeflation ? Math.max(INFLATION_MAX_PER_TURN_DELTA, targetInflationInput - previousInflationInput) : INFLATION_MAX_PER_TURN_DELTA;
  const clampedDelta = Math.max(-INFLATION_MAX_PER_TURN_DELTA, Math.min(maxPositiveDelta, delta));
  const clampedSmoothed = previousInflationInput + clampedDelta;
  const rate = Math.round(Math.max(INFLATION_MIN, Math.min(INFLATION_MAX, clampedSmoothed)) * 100) / 100;
  return {
    rate,
    breakdown: { base, unemployment, gdp, monetary, fiscal, tariff, wage, commodity, forex, savings, housing, policy, moneySupply, inertia: smoothed - rawInflation },
  };
}

export function calculateInflation(inputs: InflationInputs): number {
  return calculateInflationWithBreakdown(inputs).rate;
}

// Commodity pressure: annualized change median across commodities
export function commodityPressureForCountry(
  commodityPrices: WorldState["commodityPrices"],
  history: WorldState["commodityPriceHistory"],
  countryId?: string, // kept for API parity; in solo globalPrice is not country-scoped — block E07_COUNTRY_NATIONAL_PRICES
  turn = 0,
): number {
  void countryId;
  const pressures: number[] = [];
  for (const [commodity, state] of Object.entries(commodityPrices)) {
    const hist = history[commodity] ?? [];
    // Prefer 24t lookback, fallback 12t
    const lookback = hist.length >= COMMODITY_INFLATION_LOOKBACK_TURNS && turn >= COMMODITY_INFLATION_LOOKBACK_TURNS
      ? COMMODITY_INFLATION_LOOKBACK_TURNS
      : COMMODITY_INFLATION_SHORT_LOOKBACK_TURNS;
    if (hist.length < lookback || hist.length === 0) continue;
    const prior = hist[hist.length - lookback]?.price;
    const current = state.globalPrice;
    if (typeof prior !== "number" || !Number.isFinite(prior) || prior <= 0) continue;
    if (typeof current !== "number" || !Number.isFinite(current) || current <= 0) continue;
    const annualized = Math.pow(current / prior, TURNS_PER_YEAR / lookback) - 1.0;
    const clamped = Math.max(COMMODITY_PRESSURE_ROW_FLOOR, Math.min(COMMODITY_PRESSURE_ROW_CEILING, annualized));
    if (Number.isFinite(clamped)) pressures.push(clamped);
  }
  return pressures.length > 0 ? median(pressures) : 0.0;
}

export function forexPressureForCountry(world: WorldState, countryId: string): number {
  const ex = world.exchangeRates[countryId];
  if (!ex) return 0.0;
  const rate = finiteOr(ex.rate, NaN);
  const base = finiteOr(ex.baseRate, 0);
  if (!Number.isFinite(rate) || base <= 0) return 0.0;
  return rate / base - 1.0;
}

export function savingsPressureForCountry(world: WorldState, countryId: string): number {
  void world; void countryId;
  // Blocked: E08_SAVINGS_FLOW_LEDGER — requires 12-turn savings ledger aggregation per country.
  return 0.0;
}

// Orchestrator: recompute inflationRate for every country with a budget
export function recalculateInflationPerTurn(world: WorldState): number {
  let updated = 0;
  for (const countryId of Object.keys(world.countries).sort()) {
    const budget = world.budgets[countryId];
    if (!budget) continue;
    const country = world.countries[countryId]!;
    const gdpGrowth = country.economy.growthRate * 100;
    const unemploymentPct = country.economy.unemploymentRate * 100;
    const commodityPressure = commodityPressureForCountry(world.commodityPrices, world.commodityPriceHistory, countryId, world.meta.turn);
    const forexPressure = forexPressureForCountry(world, countryId);
    const savingsPressure = savingsPressureForCountry(world, countryId);
    const bank = world.centralBanks[countryId];
    const primeRate = bank ? finiteOr(bank.primeRate, 3.0) : 3.0;
    const primeRateHistory = bank ? bank.interestRateHistory.map((s) => s.rate).filter((r): r is number => Number.isFinite(r)) : undefined;
    const surplusToGdp = budget.gdp > 0 ? finiteOr(budget.surplus, 0) / budget.gdp : 0;
    const previousInflation = finiteOr(budget.economicFactors.inflationRate, country.economy.inflationRate * 100);
    const targetInflation = 2.0; // E09_MONETARY_BASELINES per-country target not yet ported — use BASE_TARGET
    const neutralPrimeRate = 3.0;
    const newInfl = calculateInflation({
      targetInflation,
      neutralPrimeRate,
      unemployment: unemploymentPct,
      gdpGrowth,
      primeRate,
      primeRateHistory,
      surplusToGdp,
      tariffRate: 3.0, // E03_TARIFF_FTA_COVERAGE blocked
      wageGrowth: finiteOr(budget.economicFactors.wageGrowth, 2.5),
      commodityPressure,
      forexPressure,
      savingsPressure,
      housingCostPressure: 0,
      previousInflation,
      policyStancePressure: 0, // E10_POLICY_STANCE_PRESSURE blocked
      moneySupplyGrowthPct: gdpGrowth, // E11_MONEY_SUPPLY_GROWTH blocked — fallback to gdpGrowth
      centralBankScrutiny: 0,
    });
    // Persist to both budget and country economy (mirroring mainline's budget write + nationalMetrics consumption)
    budget.economicFactors.inflationRate = Math.round(newInfl * 100) / 100;
    const clampedCountryInfl = Math.max(INFLATION_MIN, Math.min(INFLATION_MAX, newInfl)) / 100;
    country.economy.inflationRate = Math.round(clampedCountryInfl * 10000) / 10000;
    updated += 1;
  }
  return updated;
}

export const inflationRecalcPhase: TurnPhase = {
  name: "inflationRecalc",
  run(world) {
    recalculateInflationPerTurn(world);
  },
};
