/**
 * Labor force and potential growth — ports src/lib/metricEngine/potentialGrowth.ts
 *
 * computeLaborForce is the civilian labor force = (workingAge − serving) × participation
 * (people). Conscription is subtracted before scaling (§4.5 — serving people are
 * out of the civilian labor force, lowering potential L).
 *
 * potentialGrowth is Solow LEVEL form: potentialGrowth = αL·g_L + αK·g_K + TFP
 * (audit RA1). Shares default to LABOR_SHARE / CAPITAL_SHARE.
 *
 * TFP_BASELINE is the calibrated long-run TFP growth until the basket lands.
 * NEUTRAL_LABOR_PARTICIPATION is the mid-band fallback (50-75% range).
 */

// Mirrors mainline src/lib/metricEngine/potentialGrowth.ts
export const LABOR_SHARE = 0.66;
export const CAPITAL_SHARE = 0.34;
export const TFP_BASELINE = 1.2;
export const NEUTRAL_LABOR_PARTICIPATION = 62.5;

/**
 * Civilian labor force = (working-age − serving) × participation share (people).
 * Conscripts are subtracted before scaling (§4.5).
 *
 * Source: src/lib/metricEngine/potentialGrowth.ts computeLaborForce
 */
export function computeLaborForce(
  workingAgePop: number,
  militaryServicePop: number,
  laborParticipationPct: number,
): number {
  const wa = Number.isFinite(workingAgePop) && workingAgePop > 0 ? workingAgePop : 0;
  const serving = Number.isFinite(militaryServicePop) && militaryServicePop > 0 ? militaryServicePop : 0;
  const civilian = Math.max(0, wa - serving);
  const pct = Number.isFinite(laborParticipationPct) ? laborParticipationPct : NEUTRAL_LABOR_PARTICIPATION;
  return civilian * (pct / 100);
}

/**
 * Annualized growth rate (%) of a quantity from its prior-turn value. 0 on cold start.
 * Source: src/lib/metricEngine/potentialGrowth.ts annualizedGrowthRate
 */
export function annualizedGrowthRate(curr: number, prev: number, turnsPerYear: number): number {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev <= 0) return 0;
  return ((curr - prev) / prev) * 100 * turnsPerYear;
}

/** TFP bounds: never negative-growth from TFP alone; bounded upside. Source: potentialGrowth.ts TFP_BOUNDS */
export const TFP_BOUNDS: readonly [number, number] = [0.2, 2.6];

/**
 * Solow potential growth (annual %). Shares default to αL/αK (sum to 1).
 * Source: src/lib/metricEngine/potentialGrowth.ts potentialGrowth
 */
export function potentialGrowth(
  laborGrowthAnnual: number,
  capitalGrowthAnnual: number,
  tfpAnnual: number,
  laborShare: number = LABOR_SHARE,
  capitalShare: number = CAPITAL_SHARE,
): number {
  const gL = Number.isFinite(laborGrowthAnnual) ? laborGrowthAnnual : 0;
  const gK = Number.isFinite(capitalGrowthAnnual) ? capitalGrowthAnnual : 0;
  const tfp = Number.isFinite(tfpAnnual) ? tfpAnnual : 0;
  return laborShare * gL + capitalShare * gK + tfp;
}
