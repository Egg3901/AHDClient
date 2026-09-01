/**
 * Subsidy budget processing.
 * Source: src/lib/turn/subsidyBudgetTurn.ts processSubsidyBudget +
 *         src/lib/subsidies/subsidyBudgetCosts.ts
 *
 * Mainline computes sector-subsidy costs as sum(sector.revenue * TURNS_PER_YEAR)
 * grouped by owning budget. No corporation/sector system exists in solo yet,
 * so the cost line is PORT-STUB at 0. The budget spending key is retained
 * so future subsidy costs integrate idempotently.
 */

export const SECTOR_SUBSIDIES_SPENDING_KEY = "sectorSubsidies";

// Pure helper for golden tests — resolves the cost line for a given sector revenue set.
// Without sectors, this returns 0 (PORT-STUB: sector/corporation system not yet ported).
export function calculateSubsidyCost(sectorRevenues: number[]): number {
  // Mainline: sum(revenue) * TURNS_PER_YEAR per budget grouping
  // Solo stub: no sectors => 0
  if (sectorRevenues.length === 0) return 0;
  const TURNS_PER_YEAR = 48;
  return sectorRevenues.reduce((s, v) => s + v, 0) * TURNS_PER_YEAR;
}
