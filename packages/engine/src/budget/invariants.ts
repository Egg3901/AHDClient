/**
 * Budget identity invariants.
 * Source: src/lib/budget/budgetInvariants.ts checkFederalBudgetInvariants +
 *         src/lib/budget/federalSurplus.ts federalSurplus
 */

import type { CountryBudget } from "./types.js";

export interface InvariantBreach {
  field: "surplus" | "balance";
  stored: number;
  derived: number;
  absDelta: number;
}

const TOLERANCE = 1;

/** Derived surplus = revenue.total - spending.total */
export function derivedSurplus(b: Pick<CountryBudget, "revenue" | "spending">): number {
  const rev = b.revenue?.total ?? 0;
  const spend = b.spending?.total ?? 0;
  const r = Number.isFinite(rev) ? rev : 0;
  const s = Number.isFinite(spend) ? spend : 0;
  return r - s;
}

export function checkBudgetInvariants(budget: CountryBudget): InvariantBreach[] {
  const breaches: InvariantBreach[] = [];
  const derived = derivedSurplus(budget);
  const stored = budget.surplus;
  if (typeof stored === "number" && Number.isFinite(stored)) {
    const delta = Math.abs(stored - derived);
    if (delta > TOLERANCE) {
      breaches.push({ field: "surplus", stored, derived, absDelta: delta });
    }
  }
  const balDerived = derived;
  const balStored = budget.surplus;
  // treasuryBalance is not a cached invariant — skip.
  void balDerived;
  void balStored;
  return breaches;
}
