/**
 * Per-turn fiscal base growth.
 * Source: src/lib/budget/revenue.ts growFederalBases / applyPerTurnGrowthToFederalBases +
 *         src/lib/turn/fiscalBaseGrowth.ts processFiscalBaseGrowth (per-turn slice)
 *
 * Each tax base grows each turn by 1/TURNS_PER_YEAR of its annual factor.
 * Annual factors are sourced from the budget's economicFactors (wageGrowth,
 * tradeGrowth, gdpGrowth) — mirrors mainline's metricEngine-sourced rates.
 */

import type { BudgetTaxBases, BudgetEconomicFactors } from "./types.js";
import { TURNS_PER_YEAR } from "./fiscalYear.js";

// Source: src/lib/budget/revenue.ts CAPITAL_RETURNS_PREMIUM
const CAPITAL_RETURNS_PREMIUM = 1.0;

function g(rate: number, divisor: number): number {
  const r = Number.isFinite(rate) ? rate : 0;
  return 1 + r / 100 / divisor;
}

/**
 * Apply one per-turn growth slice to federal bases.
 * Source: src/lib/budget/revenue.ts applyPerTurnGrowthToFederalBases (without gravity — deferred)
 */
export function applyPerTurnGrowthToFederalBases(
  bases: BudgetTaxBases,
  factors: BudgetEconomicFactors
): BudgetTaxBases {
  const d = TURNS_PER_YEAR;
  const gdp = g(factors.gdpGrowth, d);
  const wage = g(factors.wageGrowth, d);
  const trade = g(factors.tradeGrowth, d);
  const corp = g(factors.gdpGrowth + CAPITAL_RETURNS_PREMIUM, d);

  return {
    taxableIncome: bases.taxableIncome * wage,
    domesticCorporateProfits: bases.domesticCorporateProfits * corp,
    foreignCorporateProfits: bases.foreignCorporateProfits * corp,
    wagesAndSalaries: bases.wagesAndSalaries * wage,
    importValue: bases.importValue * trade,
    taxableSales: bases.taxableSales * ((gdp + wage) / 2),
  };
}
