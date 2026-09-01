/**
 * Fund generation for politicians and parties.
 * Ports src/lib/utils/fundGeneration.ts and src/lib/turn/fundGeneration.ts
 * at mainline-neutral values. All pure, deterministic.
 */

import {
  FUND_GENERATION_RATES,
  DONOR_BASE_BONUS_PER_LEVEL,
  OFFICE_FUND_BONUS,
  GDP_PER_CAPITA_BASELINE,
} from "./constants.js";

export type PopulationTier = "small" | "medium" | "large" | "mega";

const SMALL_POPULATION_MAX = 2_000_000;
const MEDIUM_POPULATION_MAX = 8_000_000;
const LARGE_POPULATION_MAX = 20_000_000;

export function getPopulationTier(population: number): PopulationTier {
  if (population < SMALL_POPULATION_MAX) return "small";
  if (population < MEDIUM_POPULATION_MAX) return "medium";
  if (population < LARGE_POPULATION_MAX) return "large";
  return "mega";
}

export function getFundGenerationRate(population: number): number {
  const tier = getPopulationTier(population);
  return FUND_GENERATION_RATES[tier];
}

export function getGdpBaseline(countryId: string): number {
  return GDP_PER_CAPITA_BASELINE[countryId] ?? 65_000;
}

export function getIncomeGdpScalar(gdpMillions: number, population: number, countryId = "US"): number {
  const baseline = getGdpBaseline(countryId);
  const gdpPerCapita = (gdpMillions * 1_000_000) / population;
  return Math.max(0.9, Math.min(1.5, gdpPerCapita / baseline));
}

export function getInfluenceMultiplier(stateInfluence: number): number {
  return 1 + Math.max(0, Math.min(100, stateInfluence)) / 100;
}

export function getDonorBaseBonus(donorBaseLevel: number, population: number, stateInfluence?: number): number {
  if (donorBaseLevel <= 0) return 0;
  const tier = getPopulationTier(population);
  const base = DONOR_BASE_BONUS_PER_LEVEL[tier] * donorBaseLevel;
  const multiplier = stateInfluence !== undefined ? getInfluenceMultiplier(stateInfluence) : 1;
  return Math.round(base * multiplier);
}

export function getOfficeFundBonus(chamberKey: string | null): number {
  if (!chamberKey) return 0;
  return OFFICE_FUND_BONUS[chamberKey] ?? 0;
}

/**
 * Total fund generation rate per turn for a politician.
 * Mirrors getTotalFundGeneration in src/lib/utils/fundGeneration.ts.
 * When gdp/population omitted, scalar = 1.0 (country average).
 */
export function getTotalFundGenerationForPolitician(opts: {
  population: number;
  donorBaseLevel: number;
  chamberKey: string | null;
  stateGdpMillions?: number;
  countryId?: string;
  politicalInfluence?: number;
}): number {
  const countryId = opts.countryId ?? "US";
  const gdpScalar =
    opts.stateGdpMillions !== undefined ? getIncomeGdpScalar(opts.stateGdpMillions, opts.population, countryId) : 1.0;
  const baseRate = getFundGenerationRate(opts.population);
  const donorBonus = getDonorBaseBonus(opts.donorBaseLevel, opts.population, opts.politicalInfluence);
  const officeBonus = getOfficeFundBonus(opts.chamberKey);
  return Math.round((baseRate + donorBonus) * gdpScalar) + officeBonus;
}

export function calculateTaxAmount(baseAmount: number, taxRate: number): number {
  const MAX_TAX_RATE = 33;
  if (taxRate <= 0 || taxRate > MAX_TAX_RATE) return 0;
  return Math.floor(baseAmount * (taxRate / 100));
}

// ─── Fundraise quote (src/lib/actions.ts actions.fundraiseQuote) ─────────────

/**
 * Per-use fundraising yield (anchor/local same in solo, no forex).
 * Ports calculateFundraisingAmount + fundraiseYieldAnchor per src/lib/actions.ts:
 *   base = 50_000 + donorBaseLevel * 2_000
 *   scaled by influence multiplier (1 + influence/100)
 */
export function calculateFundraisingAmount(donorBaseLevel: number, politicalInfluence?: number): number {
  const base = 50_000 + donorBaseLevel * 2_000;
  if (politicalInfluence === undefined) return base;
  const multiplier = 1 + Math.max(0, Math.min(100, politicalInfluence)) / 100;
  return Math.round(base * multiplier);
}

/**
 * Canonical fundraise quote for UI and crediting.
 * Solo has no fundraising stat multiplier (neutral 1.0) and no forex conversion,
 * so this is the single source of truth for both card and effect.
 */
export function fundraiseYield(donorBaseLevel: number, politicalInfluence?: number): number {
  return calculateFundraisingAmount(donorBaseLevel, politicalInfluence ?? 0);
}

// ─── Logarithmic variant for NPC comparison (kept for parity) ─────────────────

const LOG_SCALE_FACTOR = 9_200;
const LOG_POP_DIVISOR = 330_000;

export function logarithmicPopulationScale(population: number): number {
  if (population <= 0) return 0;
  return Math.round(LOG_SCALE_FACTOR * Math.log10(population / LOG_POP_DIVISOR + 1));
}

export function getDonorBaseBonusLogarithmic(donorBaseLevel: number, population: number): number {
  if (donorBaseLevel <= 0) return 0;
  const baseRate = logarithmicPopulationScale(population);
  const bonusPerLevel = baseRate * 0.2;
  return Math.round(bonusPerLevel * donorBaseLevel);
}
