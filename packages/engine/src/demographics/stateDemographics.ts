/**
 * State demographics store — tally-compatible tables per region.
 *
 * Ports the per-state StateDemographics documents that mainline's
 * electionEngine/tally/accumulateVoteTurn requires (src/lib/db/types/demographics.ts
 * StateDemographics + DemographicCategory). Populated for all 48 US states from
 * the content pack's US_STATE_DEMOGRAPHICS_1953 (which itself is derived from
 * mainline's 1953 Layer 1 census shares via deriveGroupPopulations). UK/RU/DD
 * use the content-pack opaque-region equivalents until W39.
 *
 * This module provides the runtime map `stateDemographicsById` and a helper
 * `getStateDemographics` that tally orchestration calls. It also re-exports
 * the category tables for consumers that need to pass categories[] alongside
 * demographics.
 */

import type { DemographicCategory } from "./categories.js";
import { categoriesForCountry } from "./categories.js";

// ── StateDemographics shape mirrors src/lib/db/types/demographics.ts ──────

export interface StateDemographicGroup {
  population: number;
  economicLean: number;
  socialLean: number;
  turnout: number;
}

export interface StateDemographics {
  _id: string;
  countryId: string;
  categoryWeights: Record<string, number>;
  groups: Record<string, StateDemographicGroup>;
  cachedEconomicLean?: number;
  cachedSocialLean?: number;
  lastUpdated: string;
}

/**
 * US 1953 demographics are generated from mainline's Layer 1 census shares.
 * The generation script is documented in packages/content/src/packs/usStateDemographics1953.ts
 * and cited there per-source. Here we hold the live map, seeded at world creation.
 */
export type StateDemographicsMap = Map<string, StateDemographics>;

export function buildStateDemographicsMap(
  seeds: Array<{ stateId: string; categoryWeights: Record<string, number>; groups: Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }> }>,
  countryId: string,
  lastUpdated: string,
): StateDemographicsMap {
  const m = new Map<string, StateDemographics>();
  for (const s of seeds) {
    const groups: Record<string, StateDemographicGroup> = {};
    for (const [gid, g] of Object.entries(s.groups)) {
      groups[gid] = { population: g.population, economicLean: g.economicLean, socialLean: g.socialLean, turnout: g.turnout };
    }
    m.set(s.stateId, {
      _id: s.stateId,
      countryId,
      categoryWeights: { ...s.categoryWeights },
      groups,
      lastUpdated,
    });
  }
  return m;
}

/**
 * Opaque-region demographics for UK/RU/DD until W39.
 * Source: per-country category defaults + uniform population share (no Layer 1
 * region tables authored for those countries in 1953 at the granularity the
 * engine consumes). Documented as PORT-STUB with mainline-neutral values.
 *
 * UK note: mainline has ukRegionDemographics (12 regions) and
 * ukRegionCensusData1953 (Layer 1 shares), but the engine currently has 3
 * opaque UK regions (UK-R1..R3) until W39. This stub gives each opaque region
 * a uniform voterGroups split so tally has a complete input; W39 maps the
 * 12-region tables onto real constituency regions.
 *
 * RU/DD note: mainline seeds ruRegions1953 (14 regions) and ddRegions1953
 * (6 Laender) with ruRegionCensusData1953 / ddRegionCensusData1953 Layer 1
 * shares, but the engine retains 3 opaque per country until W39. Same uniform
 * stub; W39 will ingest the real Layer 1 region tables.
 */
export function buildOpaqueDemographics(
  regionId: string,
  countryId: string,
  categories: DemographicCategory[],
  lastUpdated: string,
): StateDemographics {
  const groups: Record<string, StateDemographicGroup> = {};
  for (const cat of categories) {
    const share = 100 / cat.groups.length;
    for (const g of cat.groups) {
      groups[g.id] = {
        population: Math.round(share * 100) / 100,
        economicLean: g.defaultEconomicLean,
        socialLean: g.defaultSocialLean,
        turnout: g.defaultTurnout ?? 50,
      };
    }
  }
  // Adjust to sum 100 (rounding)
  const total = Object.values(groups).reduce((s, v) => s + v.population, 0);
  const diff = Math.round((100 - total) * 100) / 100;
  if (Math.abs(diff) > 0.001) {
    const first = Object.keys(groups)[0];
    if (first) groups[first]!.population = Math.round((groups[first]!.population + diff) * 100) / 100;
  }
  const weights: Record<string, number> = {};
  for (const cat of categories) weights[cat._id] = cat.defaultWeight;
  return { _id: regionId, countryId, categoryWeights: weights, groups, lastUpdated };
}

/**
 * Convenience: retrieve demographics for a state, or null if absent.
 */
export function getStateDemographics(map: StateDemographicsMap, stateId: string): StateDemographics | null {
  return map.get(stateId) ?? null;
}

/**
 * Return the category set for a country (the categories[] tally requires
 * alongside demographics). Delegates to categoriesForCountry.
 */
export function getCategoriesForCountry(countryId: string): DemographicCategory[] {
  return categoriesForCountry(countryId);
}
