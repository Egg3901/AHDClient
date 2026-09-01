/**
 * Federal spending calculation.
 * Source: src/lib/budget/spending.ts calculateFederalSpending (pure core) +
 *  src/lib/seeds/reference/budgets.ts deriveSpending (baseline branch).
 *
 * Spending = sum(byCategory) + stateGrants + debtInterest.
 * Category costs are baseline authored values; policy-derived costs are
 * deferred until law-cost engine is ported (no gdp-cost-fraction ladder).
 */

import type { BudgetSpending } from "./types.js";

export function calculateBudgetSpending(
  byCategory: Record<string, number>,
  stateGrants: number,
  debtPrincipal: number,
  interestRate: number
): BudgetSpending {
  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCategory)) {
    normalized[k] = Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  }
  const grants = Number.isFinite(stateGrants) && stateGrants > 0 ? Math.round(stateGrants) : 0;
  const debtInterest = Number.isFinite(debtPrincipal) && Number.isFinite(interestRate) && debtPrincipal > 0
    ? Math.round(debtPrincipal * interestRate)
    : 0;
  const categoryTotal = Object.values(normalized).reduce((s, v) => s + v, 0);
  const total = categoryTotal + grants + debtInterest;
  return { byCategory: normalized, stateGrants: grants, debtInterest, total };
}

export function spendingTotal(spending: BudgetSpending): number {
  return spending.total;
}
