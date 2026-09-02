import type { DemographicCategory } from "./categories.js";
/**
 * Demographic voter-group categories for JP/DE/IE/CN/BR. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/seeds/jp/jpDemographicCategories.ts
 * - src/lib/seeds/de/deDemographicCategories.ts
 * - src/lib/seeds/ie/ieDemographicCategories.ts
 * - src/lib/seeds/cn/cnDemographicCategories.ts
 * - src/lib/seeds/br/brDemographicCategories.ts
 *
 * Same {_id, name, defaultWeight, groups[{id,name,defaultEconomicLean,defaultSocialLean,defaultTurnout}]} shape as UK_CATEGORY in categories.ts.
 */
export const JP_CATEGORY: DemographicCategory = {
  _id: "jp_voterGroups",
  name: "Japan Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "salaryman_conservative", name: "Salaryman Conservatives", defaultEconomicLean: 1, defaultSocialLean: 1, defaultTurnout: 65 },
    { id: "urban_progressive", name: "Urban Progressives", defaultEconomicLean: -2, defaultSocialLean: -3, defaultTurnout: 68 },
    { id: "rural_traditionalist", name: "Rural Traditionalists", defaultEconomicLean: 1, defaultSocialLean: 3, defaultTurnout: 70 },
    { id: "young_urban", name: "Young Urban", defaultEconomicLean: -1, defaultSocialLean: -3, defaultTurnout: 48 },
    { id: "retiree", name: "Retirees & Elderly", defaultEconomicLean: 0, defaultSocialLean: 2, defaultTurnout: 74 },
    { id: "public_sector", name: "Public Sector & Teachers", defaultEconomicLean: -2, defaultSocialLean: -1, defaultTurnout: 66 },
    { id: "small_business", name: "Small Business & Self-Employed", defaultEconomicLean: 3, defaultSocialLean: 1, defaultTurnout: 68 },
    { id: "komeito_faithful", name: "Komeito Faithful", defaultEconomicLean: 0, defaultSocialLean: 0, defaultTurnout: 72 },
    { id: "reform_populist", name: "Reform Populists", defaultEconomicLean: 2, defaultSocialLean: 0, defaultTurnout: 55 },
    { id: "working_mothers", name: "Working Mothers", defaultEconomicLean: -1, defaultSocialLean: -2, defaultTurnout: 58 },
  ],
};

export const DE_CATEGORY: DemographicCategory = {
  _id: "de_voterGroups",
  name: "Germany Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "katholische_konservative", name: "Katholische Konservative", defaultEconomicLean: 2, defaultSocialLean: 2, defaultTurnout: 82 },
    { id: "gewerkschafter", name: "Gewerkschafter", defaultEconomicLean: -3, defaultSocialLean: 0, defaultTurnout: 78 },
    { id: "urbane_progressive", name: "Urbane Progressive", defaultEconomicLean: -2, defaultSocialLean: -3, defaultTurnout: 80 },
    { id: "wirtschaftsliberale", name: "Wirtschaftsliberale", defaultEconomicLean: 3, defaultSocialLean: -1, defaultTurnout: 83 },
    { id: "ost_post_industriell", name: "Ost-Post-Industriell", defaultEconomicLean: -2, defaultSocialLean: 2, defaultTurnout: 70 },
    { id: "gruene_mittelschicht", name: "Grüne Mittelschicht", defaultEconomicLean: -1, defaultSocialLean: -4, defaultTurnout: 85 },
    { id: "rentner_west", name: "Rentner West", defaultEconomicLean: 1, defaultSocialLean: 2, defaultTurnout: 86 },
    { id: "migranten_communities", name: "Migranten-Communities", defaultEconomicLean: -1, defaultSocialLean: -2, defaultTurnout: 62 },
    { id: "landwirte_dorf", name: "Landwirte und Dorfgemeinschaft", defaultEconomicLean: 1, defaultSocialLean: 3, defaultTurnout: 80 },
    { id: "junge_grossstadt", name: "Junge Großstadt", defaultEconomicLean: -3, defaultSocialLean: -4, defaultTurnout: 63 },
    { id: "protest_waehler_ost", name: "Protest-Wähler (Ost)", defaultEconomicLean: 0, defaultSocialLean: 4, defaultTurnout: 72 },
    { id: "mittelstand_selbstaendige", name: "Mittelstand-Selbstständige", defaultEconomicLean: 3, defaultSocialLean: 1, defaultTurnout: 82 },
  ],
};

export const IE_CATEGORY: DemographicCategory = {
  _id: "ie_voterGroups",
  name: "Ireland Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "urban_professional", name: "Urban Professional", defaultEconomicLean: 2, defaultSocialLean: -2, defaultTurnout: 68 },
    { id: "rural_traditional", name: "Rural Traditional", defaultEconomicLean: 1, defaultSocialLean: 2, defaultTurnout: 72 },
    { id: "working_class", name: "Working Class", defaultEconomicLean: -3, defaultSocialLean: 0, defaultTurnout: 58 },
    { id: "new_irish", name: "New Irish", defaultEconomicLean: -1, defaultSocialLean: -2, defaultTurnout: 45 },
    { id: "small_business", name: "Small Business & Farmers", defaultEconomicLean: 2, defaultSocialLean: 1, defaultTurnout: 74 },
    { id: "retirees", name: "Retirees", defaultEconomicLean: 0, defaultSocialLean: 1, defaultTurnout: 80 },
    { id: "young_urban", name: "Young Urban", defaultEconomicLean: -2, defaultSocialLean: -3, defaultTurnout: 46 },
    { id: "border_communities", name: "Border Communities", defaultEconomicLean: -1, defaultSocialLean: -1, defaultTurnout: 65 },
  ],
};

export const CN_CATEGORY: DemographicCategory = {
  _id: "cn_voterGroups",
  name: "China Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "party_cadre", name: "Party Cadre & Officials", defaultEconomicLean: 0, defaultSocialLean: 3, defaultTurnout: 95 },
    { id: "urban_professional", name: "Urban Professional", defaultEconomicLean: 2, defaultSocialLean: 0, defaultTurnout: 88 },
    { id: "rural_peasant", name: "Rural Peasantry", defaultEconomicLean: -2, defaultSocialLean: 2, defaultTurnout: 82 },
    { id: "industrial_worker", name: "Industrial Worker", defaultEconomicLean: -1, defaultSocialLean: 1, defaultTurnout: 86 },
    { id: "migrant_worker", name: "Migrant Worker", defaultEconomicLean: -2, defaultSocialLean: 1, defaultTurnout: 65 },
    { id: "entrepreneur", name: "Private Entrepreneur", defaultEconomicLean: 3, defaultSocialLean: 1, defaultTurnout: 90 },
    { id: "youth", name: "Youth (under-35)", defaultEconomicLean: 1, defaultSocialLean: -1, defaultTurnout: 78 },
  ],
};

export const BR_CATEGORY: DemographicCategory = {
  _id: "br_voterGroups",
  name: "Brazil Voter Groups",
  defaultWeight: 100,
  groups: [
    { id: "evangelical_conservative", name: "Evangelical Conservative", defaultEconomicLean: 1, defaultSocialLean: 4, defaultTurnout: 80 },
    { id: "working_class_pt", name: "Organized Labour", defaultEconomicLean: -3, defaultSocialLean: -1, defaultTurnout: 76 },
    { id: "rural_agribusiness", name: "Rural & Agribusiness", defaultEconomicLean: 2, defaultSocialLean: 3, defaultTurnout: 72 },
    { id: "urban_middle_class", name: "Urban Middle Class", defaultEconomicLean: 1, defaultSocialLean: 0, defaultTurnout: 78 },
    { id: "urban_poor", name: "Urban Poor", defaultEconomicLean: -4, defaultSocialLean: -1, defaultTurnout: 68 },
    { id: "afro_brazilian", name: "Afro-Brazilian Communities", defaultEconomicLean: -2, defaultSocialLean: -2, defaultTurnout: 62 },
    { id: "business_financial", name: "Business & Finance", defaultEconomicLean: 3, defaultSocialLean: 1, defaultTurnout: 82 },
    { id: "young_progressive", name: "Young Progressive", defaultEconomicLean: -2, defaultSocialLean: -3, defaultTurnout: 54 },
  ],
};
