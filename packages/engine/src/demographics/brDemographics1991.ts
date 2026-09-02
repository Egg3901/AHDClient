import type { StateDemographicsSeed } from "./usStateDemographics1953.js";
/**
 * Brazil region demographics for 1991. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/seeds/international/br.ts getBrModel("1991") via getCountryLayer1Model
 * - src/lib/seeds/international/derive.ts buildModelRegionDemographics (the path admin/seed/seedBR.ts runs)
 */
export const BR_DEMOGRAPHICS_1991: StateDemographicsSeed[] = [
  {
    stateId: "NORTE",
    categoryWeights: {"br_voterGroups":100},
    groups: {
      evangelical_conservative: { population: 21.11, economicLean: -1.3, socialLean: 0.3, turnout: 80 },
      working_class_pt: { population: 13.3, economicLean: -0.4, socialLean: -0.1, turnout: 80 },
      rural_agribusiness: { population: 8.93, economicLean: 1.4, socialLean: 1.1, turnout: 71 },
      urban_middle_class: { population: 10.08, economicLean: 0.8, socialLean: 0, turnout: 82 },
      urban_poor: { population: 18.94, economicLean: -1.8, socialLean: 0.5, turnout: 67 },
      afro_brazilian: { population: 12.63, economicLean: -2.2, socialLean: 0.3, turnout: 63 },
      business_financial: { population: 6.47, economicLean: 1.4, socialLean: 0.2, turnout: 85 },
      young_progressive: { population: 8.54, economicLean: -1, socialLean: -0.7, turnout: 62 },
    },
  },
  {
    stateId: "NORDESTE",
    categoryWeights: {"br_voterGroups":100},
    groups: {
      evangelical_conservative: { population: 20.94, economicLean: -1.3, socialLean: 0.3, turnout: 80 },
      working_class_pt: { population: 13.73, economicLean: -0.3, socialLean: -0.1, turnout: 80 },
      rural_agribusiness: { population: 8.46, economicLean: 1.6, socialLean: 1.1, turnout: 71 },
      urban_middle_class: { population: 10.73, economicLean: 0.9, socialLean: 0.1, turnout: 82 },
      urban_poor: { population: 18.24, economicLean: -1.8, socialLean: 0.5, turnout: 67 },
      afro_brazilian: { population: 12.4, economicLean: -2.2, socialLean: 0.2, turnout: 63 },
      business_financial: { population: 6.8, economicLean: 1.5, socialLean: 0.2, turnout: 85 },
      young_progressive: { population: 8.7, economicLean: -1, socialLean: -0.7, turnout: 62 },
    },
  },
  {
    stateId: "CENTRO_OESTE",
    categoryWeights: {"br_voterGroups":100},
    groups: {
      evangelical_conservative: { population: 20.19, economicLean: -1.1, socialLean: 0.2, turnout: 80 },
      working_class_pt: { population: 15.05, economicLean: -0.1, socialLean: -0.1, turnout: 80 },
      rural_agribusiness: { population: 7.66, economicLean: 2.2, socialLean: 1, turnout: 71 },
      urban_middle_class: { population: 12.77, economicLean: 1, socialLean: 0.1, turnout: 82 },
      urban_poor: { population: 15.65, economicLean: -1.7, socialLean: 0.4, turnout: 67 },
      afro_brazilian: { population: 10.58, economicLean: -2.1, socialLean: 0.2, turnout: 63 },
      business_financial: { population: 8.65, economicLean: 1.7, socialLean: 0.3, turnout: 85 },
      young_progressive: { population: 9.46, economicLean: -0.9, socialLean: -0.7, turnout: 62 },
    },
  },
  {
    stateId: "SUDESTE",
    categoryWeights: {"br_voterGroups":100},
    groups: {
      evangelical_conservative: { population: 19.5, economicLean: -0.9, socialLean: 0.1, turnout: 80 },
      working_class_pt: { population: 15.67, economicLean: 0.1, socialLean: -0.1, turnout: 80 },
      rural_agribusiness: { population: 8.01, economicLean: 2.7, socialLean: 1, turnout: 71 },
      urban_middle_class: { population: 14.47, economicLean: 1.3, socialLean: 0.1, turnout: 82 },
      urban_poor: { population: 13.63, economicLean: -1.6, socialLean: 0.3, turnout: 67 },
      afro_brazilian: { population: 8.97, economicLean: -1.9, socialLean: 0.1, turnout: 63 },
      business_financial: { population: 10.07, economicLean: 2, socialLean: 0.4, turnout: 85 },
      young_progressive: { population: 9.67, economicLean: -0.9, socialLean: -0.7, turnout: 62 },
    },
  },
  {
    stateId: "SUL",
    categoryWeights: {"br_voterGroups":100},
    groups: {
      evangelical_conservative: { population: 18.7, economicLean: -0.6, socialLean: 0.2, turnout: 80 },
      working_class_pt: { population: 15.55, economicLean: 0.5, socialLean: 0, turnout: 80 },
      rural_agribusiness: { population: 10.59, economicLean: 2.8, socialLean: 1, turnout: 71 },
      urban_middle_class: { population: 15.93, economicLean: 1.7, socialLean: 0.3, turnout: 82 },
      urban_poor: { population: 12.46, economicLean: -1.5, socialLean: 0.4, turnout: 67 },
      afro_brazilian: { population: 6.8, economicLean: -1.8, socialLean: 0, turnout: 63 },
      business_financial: { population: 10.86, economicLean: 2.3, socialLean: 0.5, turnout: 85 },
      young_progressive: { population: 9.11, economicLean: -0.9, socialLean: -0.7, turnout: 62 },
    },
  },
];
