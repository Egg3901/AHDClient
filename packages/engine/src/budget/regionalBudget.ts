/**
 * Regional (state) budget processing — generic.
 * Source: src/lib/turn/regionalBudget.ts (UK central model) +
 *         generic extraction of the shared revenue/spending pattern.
 *
 * Mainline has country-specific variants:
 *  - src/lib/turn/jpRegionalBudget.ts (Japan, deferred — JP not playable)
 *  - src/lib/turn/deRegionalBudget.ts (Germany, deferred — DE not playable)
 *  - src/lib/turn/cnRegionalBudget.ts / ruRegionalBudget.ts etc.
 *
 * Solo's generic processor handles any playable country's regions as a
 * population-share slice of the national grant pool plus a small own-revenue
 * share of regional GDP (mirrors the UK CN/DE pattern without country-specific
 * value-base drift).
 */

// Source: src/lib/turn/regionalBudget.ts COUNCIL_TAX_GDP_SHARE etc. — generic constant, not country-specific
export const REGIONAL_OWN_REVENUE_GDP_SHARE = 0.016; // generic own-revenue share of regional GDP (UK councilTax analogue)
export const REGIONAL_BUSINESS_GDP_SHARE = 0.01;

export interface GenericRegionalInput {
  regionId: string;
  countryId: string;
  regionGdp: number; // absolute local currency (state.gdp * 1e6 or region.gdp scaled)
  regionPopulation: number;
  nationalPopulation: number;
  grantPool: number;
  chancellorAllocation?: number | null;
}

export interface GenericRegionalResult {
  regionId: string;
  countryId: string;
  councilTax: number;
  businessRates: number;
  grant: number;
  revenueTotal: number;
  spendingTotal: number;
  balance: number;
}

/**
 * Calculate regional revenue as generic statutory shares of regional GDP + grant.
 * Pure helper exported for golden tests.
 * Source: src/lib/turn/regionalBudget.ts calculateRegionalBudget
 */
export function calculateGenericRegionalRevenue(input: GenericRegionalInput): { councilTax: number; businessRates: number; grant: number; total: number } {
  const councilTax = input.regionGdp * REGIONAL_OWN_REVENUE_GDP_SHARE;
  const businessRates = input.regionGdp * REGIONAL_BUSINESS_GDP_SHARE;
  const grant = input.chancellorAllocation != null
    ? input.chancellorAllocation
    : input.nationalPopulation > 0
      ? (input.grantPool * input.regionPopulation) / input.nationalPopulation
      : 0;
  const total = councilTax + businessRates + grant;
  return { councilTax, businessRates, grant, total };
}
