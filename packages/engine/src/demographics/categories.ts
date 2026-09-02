import { JP_CATEGORY, DE_CATEGORY, IE_CATEGORY, CN_CATEGORY, BR_CATEGORY } from "./categoriesPorted.js";
/**
 * Demographic categories — ports mainline's category tables.
 *
 * US: src/lib/seeds/demographicCategories.ts demographicCategories + ERA_COMPOSITIONS
 * UK: src/lib/seeds/uk/ukDemographicCategories.ts ukDemographicCategories
 * RU: src/lib/seeds/ru/ruDemographicCategories.ts ruDemographicCategories
 * DD: src/lib/seeds/dd/ddDemographicCategories.ts ddDemographicCategories
 *
 * Each category's groups carry the leans and turnouts that the election tally
 * consumes via StateDemographics.groups[ groupId ] (population, economicLean,
 * socialLean, turnout). The engine's types mirror mainline's
 * src/lib/db/types/demographics.ts DemographicCategory / StateDemographics.
 */

export interface DemographicGroupDef {
  id: string;
  name: string;
  defaultEconomicLean: number;
  defaultSocialLean: number;
  defaultTurnout?: number;
}

export interface DemographicCategory {
  _id: string;
  name: string;
  groups: DemographicGroupDef[];
  defaultWeight: number;
}

// ── US: 12 voter archetypes (1953 era) ───────────────────────────────────
// Source: src/lib/seeds/demographicCategories.ts ERA_COMPOSITIONS["1953"]
// defaultLeans + defaultTurnouts for that era, and the single category
// `voterGroups` with defaultWeight 100.
export const US_CATEGORY_1953: DemographicCategory = {
  _id: "voterGroups",
  name: "Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "young_renters", name: "Young Renters", defaultEconomicLean: -1.5, defaultSocialLean: -1.5, defaultTurnout: 36 },
    { id: "evangelicals", name: "Evangelicals", defaultEconomicLean: 2.0, defaultSocialLean: 3.5, defaultTurnout: 55 },
    { id: "rural_traditionalists", name: "Rural Traditionalists", defaultEconomicLean: 2.5, defaultSocialLean: 3.0, defaultTurnout: 60 },
    { id: "union_trades", name: "Union & Trades", defaultEconomicLean: -4.5, defaultSocialLean: -0.5, defaultTurnout: 67 },
    { id: "soccer_moms", name: "Soccer Moms", defaultEconomicLean: 0.5, defaultSocialLean: 0.5, defaultTurnout: 56 },
    { id: "college_liberals", name: "College Liberals", defaultEconomicLean: -3.5, defaultSocialLean: -3.0, defaultTurnout: 58 },
    { id: "small_business", name: "Small Business", defaultEconomicLean: 4.0, defaultSocialLean: 1.5, defaultTurnout: 66 },
    { id: "public_sector", name: "Public Sector Workers", defaultEconomicLean: -3.5, defaultSocialLean: -2.0, defaultTurnout: 62 },
    { id: "retirees", name: "Retirees", defaultEconomicLean: 0.0, defaultSocialLean: 0.5, defaultTurnout: 60 },
    { id: "libertarians", name: "Libertarians", defaultEconomicLean: 4.5, defaultSocialLean: 0.0, defaultTurnout: 60 },
    { id: "new_immigrants", name: "New Americans", defaultEconomicLean: -2.5, defaultSocialLean: -2.0, defaultTurnout: 28 },
    { id: "secular_professionals", name: "Secular Professionals", defaultEconomicLean: -2.0, defaultSocialLean: -2.5, defaultTurnout: 60 },
  ],
};

// ── UK: 12 groups ────────────────────────────────────────────────────────
// Source: src/lib/seeds/uk/ukDemographicCategories.ts
export const UK_CATEGORY: DemographicCategory = {
  _id: "uk_voterGroups",
  name: "UK Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "post_industrial_workers", name: "Post-Industrial Workers", defaultEconomicLean: -2, defaultSocialLean: 2, defaultTurnout: 57 },
    { id: "urban_progressives", name: "Urban Progressives", defaultEconomicLean: -3, defaultSocialLean: -4, defaultTurnout: 72 },
    { id: "suburban_homeowners", name: "Suburban Homeowners", defaultEconomicLean: 2, defaultSocialLean: 2, defaultTurnout: 70 },
    { id: "young_renters", name: "Young Renters", defaultEconomicLean: -1, defaultSocialLean: -4, defaultTurnout: 52 },
    { id: "rural_traditionalists", name: "Rural Traditionalists", defaultEconomicLean: 3, defaultSocialLean: 3, defaultTurnout: 71 },
    { id: "retirees", name: "Retirees", defaultEconomicLean: 1, defaultSocialLean: 2, defaultTurnout: 73 },
    { id: "public_sector", name: "Public Sector", defaultEconomicLean: -3, defaultSocialLean: -2, defaultTurnout: 68 },
    { id: "moderate_centrists", name: "Moderate Centrists", defaultEconomicLean: 0, defaultSocialLean: -1, defaultTurnout: 67 },
    { id: "populist_right", name: "Populist Right", defaultEconomicLean: 1, defaultSocialLean: 3, defaultTurnout: 55 },
    { id: "green_activists", name: "Green Activists", defaultEconomicLean: -4, defaultSocialLean: -5, defaultTurnout: 61 },
    { id: "small_business", name: "Small Business", defaultEconomicLean: 3, defaultSocialLean: 1, defaultTurnout: 70 },
    { id: "new_britons", name: "New Britons", defaultEconomicLean: -2, defaultSocialLean: -1, defaultTurnout: 50 },
  ],
};

// ── RU: 7 groups ─────────────────────────────────────────────────────────
// Source: src/lib/seeds/ru/ruDemographicCategories.ts
export const RU_CATEGORY: DemographicCategory = {
  _id: "su_voterGroups",
  name: "USSR Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "party_nomenklatura", name: "Party Nomenklatura", defaultEconomicLean: -1, defaultSocialLean: 3, defaultTurnout: 95 },
    { id: "industrial_worker", name: "Industrial Worker", defaultEconomicLean: -2, defaultSocialLean: 1, defaultTurnout: 88 },
    { id: "collective_farmer", name: "Collective Farmer", defaultEconomicLean: -2, defaultSocialLean: 2, defaultTurnout: 86 },
    { id: "urban_professional", name: "Urban Professional", defaultEconomicLean: 0, defaultSocialLean: 0, defaultTurnout: 85 },
    { id: "intelligentsia", name: "Intelligentsia", defaultEconomicLean: 0, defaultSocialLean: -1, defaultTurnout: 88 },
    { id: "national_minority", name: "National Minority", defaultEconomicLean: -1, defaultSocialLean: 2, defaultTurnout: 82 },
    { id: "youth", name: "Youth", defaultEconomicLean: 0, defaultSocialLean: -1, defaultTurnout: 78 },
  ],
};

// ── DD: 6 groups ─────────────────────────────────────────────────────────
// Source: src/lib/seeds/dd/ddDemographicCategories.ts
export const DD_CATEGORY: DemographicCategory = {
  _id: "dd_voterGroups",
  name: "East Germany Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "party_nomenklatura", name: "Party Nomenklatura", defaultEconomicLean: -3, defaultSocialLean: 2, defaultTurnout: 96 },
    { id: "industrial_worker", name: "Industrial Worker", defaultEconomicLean: -3, defaultSocialLean: 0, defaultTurnout: 95 },
    { id: "collective_farmer", name: "Collective Farmer", defaultEconomicLean: -2, defaultSocialLean: 2, defaultTurnout: 94 },
    { id: "intelligentsia", name: "Technical Intelligentsia", defaultEconomicLean: 0, defaultSocialLean: -2, defaultTurnout: 95 },
    { id: "christian_milieu", name: "Christian Milieu", defaultEconomicLean: -1, defaultSocialLean: 3, defaultTurnout: 92 },
    { id: "youth", name: "FDJ Youth", defaultEconomicLean: -1, defaultSocialLean: -1, defaultTurnout: 90 },
  ],
};

/**
 * All categories keyed by country id, for the 1953 era.
 * Mainline note: US categories are era-specific (1953 vs 1979+); UK/RU/DD
 * categories in mainline are era-agnostic snapshots but we present them as
 * 1953. Cited per-country files above; RU/DD 1979-authored but structurally
 * identical, documented in summary.
 */
export const CATEGORIES_BY_COUNTRY_1953: Record<string, DemographicCategory[]> = {
  US: [US_CATEGORY_1953],
  UK: [UK_CATEGORY],
  RU: [RU_CATEGORY],
  DD: [DD_CATEGORY],
  // W61 roster (era-neutral group definitions; see categoriesPorted.ts sources).
  JP: [JP_CATEGORY],
  DE: [DE_CATEGORY],
  IE: [IE_CATEGORY],
  CN: [CN_CATEGORY],
  BR: [BR_CATEGORY],
};

export function categoriesForCountry(countryId: string): DemographicCategory[] {
  return CATEGORIES_BY_COUNTRY_1953[countryId] ?? [];
}
