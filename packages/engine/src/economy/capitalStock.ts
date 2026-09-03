/**
 * Per-region Solow capital stock K — verbatim port of
 * src/lib/metricEngine/capitalStock.ts. Millions, the SAME unit as
 * `Region.gdp`. Substrate for the macroCountryTurn potential-growth term
 * (αK · ΔK/K, previously a PORT-STUB `gK = 0` — see macroCountryTurn.ts).
 * Self-damping by construction: depreciation pulls K/Y back toward the
 * steady-state target, so the GDP→investment→capital→GDP loop converges.
 */

/** Steady-state capital/output ratio (seed multiple + convergence reference). */
export const CAPITAL_OUTPUT_RATIO_TARGET = 3;
/** Investment as a share of output at the neutral prime rate. */
export const BASE_INVESTMENT_RATE = 0.2;
/** Annual depreciation, derived so steady-state K/Y = invRate/δ = target. */
export const ANNUAL_DEPRECIATION = BASE_INVESTMENT_RATE / CAPITAL_OUTPUT_RATIO_TARGET;
/** Long-run neutral prime rate r* (%); at this rate investmentRate = BASE. */
export const NEUTRAL_PRIME_RATE = 3;

const INVESTMENT_RATE_SENSITIVITY = 0.02;
const INVESTMENT_RATE_MIN = 0.05;
const INVESTMENT_RATE_MAX = 0.4;
const CAPITAL_FLOOR = 0;

/**
 * Investment rate as a share of output, falling as the prime rate rises
 * relative to the country's OWN neutral rate (decision #12 monetary
 * coupling — see capitalStock.ts investmentRate file doc on why the neutral
 * rate must be country-specific, not a global constant).
 */
export function investmentRate(primeRate: number, neutralRate?: number): number {
  const r = Number.isFinite(primeRate) ? primeRate : NEUTRAL_PRIME_RATE;
  const neutral =
    typeof neutralRate === "number" && Number.isFinite(neutralRate) && neutralRate > 0
      ? neutralRate
      : NEUTRAL_PRIME_RATE;
  const raw = BASE_INVESTMENT_RATE + INVESTMENT_RATE_SENSITIVITY * (neutral - r);
  return Math.max(INVESTMENT_RATE_MIN, Math.min(INVESTMENT_RATE_MAX, raw));
}

/** Seed K at `target × GDP` (millions). Non-finite/non-positive GDP → 0. */
export function seedCapitalStock(gdp: number): number {
  const y = Number.isFinite(gdp) && gdp > 0 ? gdp : 0;
  return CAPITAL_OUTPUT_RATIO_TARGET * y;
}

export interface CapitalStep {
  /** New capital stock K (millions). */
  capital: number;
  investment: number;
  depreciation: number;
  /** Annualized ΔK/K — the input the potential-growth layer consumes. */
  annualizedGrowth: number;
}

/**
 * Advance K by one turn. Investment AND depreciation share the per-turn
 * cadence (`/turnsPerYear`); `outputAnnual` is the region's annual GDP
 * (millions). `corpInvestmentPerTurn` is PORT-STUB, always 0 in solo —
 * mainline's O1c term (extra per-turn investment from corporate buildout)
 * needs the plants-tier build-queue system AHDClient does not have.
 */
export function advanceCapitalStock(
  capital: number,
  outputAnnual: number,
  primeRate: number,
  turnsPerYear: number,
  corpInvestmentPerTurn: number = 0,
  neutralRate?: number,
): CapitalStep {
  const k = Number.isFinite(capital) && capital > 0 ? capital : 0;
  const y = Number.isFinite(outputAnnual) && outputAnnual > 0 ? outputAnnual : 0;
  const corp =
    Number.isFinite(corpInvestmentPerTurn) && corpInvestmentPerTurn > 0 ? corpInvestmentPerTurn : 0;
  const investment = (investmentRate(primeRate, neutralRate) * y) / turnsPerYear + corp;
  const depreciation = (ANNUAL_DEPRECIATION / turnsPerYear) * k;
  const next = Math.max(CAPITAL_FLOOR, k + investment - depreciation);
  const annualizedGrowth = k > 0 ? ((investment - depreciation) / k) * turnsPerYear : 0;
  return { capital: next, investment, depreciation, annualizedGrowth };
}
