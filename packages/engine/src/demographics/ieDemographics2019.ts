import type { StateDemographicsSeed } from "./usStateDemographics1953.js";
/**
 * Ireland region demographics for 2019. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/seeds/international/ie.ts getIeModel("2019") via getCountryLayer1Model
 * - src/lib/seeds/international/derive.ts buildModelRegionDemographics (the path admin/seed/seedIE.ts runs)
 */
export const IE_DEMOGRAPHICS_2019: StateDemographicsSeed[] = [
  {
    stateId: "DUB",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 23.78, economicLean: -1.5, socialLean: -2.2, turnout: 73 },
      rural_traditional: { population: 7.37, economicLean: 0.1, socialLean: 0.5, turnout: 68 },
      working_class: { population: 12.47, economicLean: -2.5, socialLean: -1.4, turnout: 50 },
      new_irish: { population: 4.12, economicLean: -2.4, socialLean: -1.7, turnout: 27 },
      small_business: { population: 10.18, economicLean: 1.3, socialLean: -0.6, turnout: 73 },
      retirees: { population: 12.76, economicLean: 0.3, socialLean: 0.7, turnout: 80 },
      young_urban: { population: 13.57, economicLean: -2.7, socialLean: -2.5, turnout: 42 },
      border_communities: { population: 15.74, economicLean: -0.2, socialLean: -0.4, turnout: 62 },
    },
  },
  {
    stateId: "KIL",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 17.81, economicLean: -1.1, socialLean: -2.2, turnout: 73 },
      rural_traditional: { population: 11.59, economicLean: 1, socialLean: 0.7, turnout: 68 },
      working_class: { population: 8.86, economicLean: -2.3, socialLean: -0.9, turnout: 50 },
      new_irish: { population: 2.67, economicLean: -2.3, socialLean: -1.6, turnout: 27 },
      small_business: { population: 14.13, economicLean: 1, socialLean: -0.5, turnout: 73 },
      retirees: { population: 16.03, economicLean: 0.3, socialLean: 0.5, turnout: 80 },
      young_urban: { population: 9.14, economicLean: -2.6, socialLean: -2.5, turnout: 42 },
      border_communities: { population: 19.78, economicLean: 0.2, socialLean: -0.2, turnout: 62 },
    },
  },
  {
    stateId: "MID",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 12.85, economicLean: -1.1, socialLean: -2.1, turnout: 73 },
      rural_traditional: { population: 16.47, economicLean: 1.6, socialLean: 0.9, turnout: 68 },
      working_class: { population: 8.76, economicLean: -2.2, socialLean: -0.5, turnout: 50 },
      new_irish: { population: 2.57, economicLean: -2.3, socialLean: -1.3, turnout: 27 },
      small_business: { population: 11.75, economicLean: 0.8, socialLean: -0.5, turnout: 73 },
      retirees: { population: 16.27, economicLean: 0.3, socialLean: 0.6, turnout: 80 },
      young_urban: { population: 7.83, economicLean: -2.6, socialLean: -2.4, turnout: 42 },
      border_communities: { population: 23.5, economicLean: 0.5, socialLean: 0, turnout: 62 },
    },
  },
  {
    stateId: "WEX",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 13.98, economicLean: -1.1, socialLean: -2.2, turnout: 73 },
      rural_traditional: { population: 15.29, economicLean: 1.5, socialLean: 0.9, turnout: 68 },
      working_class: { population: 8.95, economicLean: -2.2, socialLean: -0.6, turnout: 50 },
      new_irish: { population: 2.47, economicLean: -2.4, socialLean: -1.4, turnout: 27 },
      small_business: { population: 12.15, economicLean: 0.9, socialLean: -0.5, turnout: 73 },
      retirees: { population: 16.21, economicLean: 0.3, socialLean: 0.6, turnout: 80 },
      young_urban: { population: 8.16, economicLean: -2.6, socialLean: -2.4, turnout: 42 },
      border_communities: { population: 22.79, economicLean: 0.4, socialLean: 0, turnout: 62 },
    },
  },
  {
    stateId: "LIM",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 16.8, economicLean: -1.3, socialLean: -2.2, turnout: 73 },
      rural_traditional: { population: 12.87, economicLean: 1.2, socialLean: 0.8, turnout: 68 },
      working_class: { population: 9.78, economicLean: -2.4, socialLean: -0.9, turnout: 50 },
      new_irish: { population: 2.97, economicLean: -2.3, socialLean: -1.5, turnout: 27 },
      small_business: { population: 11.66, economicLean: 0.9, socialLean: -0.5, turnout: 73 },
      retirees: { population: 15.4, economicLean: 0.3, socialLean: 0.6, turnout: 80 },
      young_urban: { population: 9.74, economicLean: -2.6, socialLean: -2.4, turnout: 42 },
      border_communities: { population: 20.77, economicLean: 0.3, socialLean: -0.1, turnout: 62 },
    },
  },
  {
    stateId: "COR",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 18.75, economicLean: -1.2, socialLean: -2.2, turnout: 73 },
      rural_traditional: { population: 11.77, economicLean: 1.2, socialLean: 0.8, turnout: 68 },
      working_class: { population: 9.78, economicLean: -2.4, socialLean: -1, turnout: 50 },
      new_irish: { population: 3.05, economicLean: -2.3, socialLean: -1.6, turnout: 27 },
      small_business: { population: 11.96, economicLean: 1.1, socialLean: -0.5, turnout: 73 },
      retirees: { population: 14.57, economicLean: 0.3, socialLean: 0.6, turnout: 80 },
      young_urban: { population: 10.26, economicLean: -2.6, socialLean: -2.4, turnout: 42 },
      border_communities: { population: 19.85, economicLean: 0.2, socialLean: -0.1, turnout: 62 },
    },
  },
  {
    stateId: "GAL",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 16.4, economicLean: -1.1, socialLean: -2.2, turnout: 73 },
      rural_traditional: { population: 14.63, economicLean: 1.6, socialLean: 0.9, turnout: 68 },
      working_class: { population: 8.78, economicLean: -2.3, socialLean: -0.8, turnout: 50 },
      new_irish: { population: 2.77, economicLean: -2.3, socialLean: -1.4, turnout: 27 },
      small_business: { population: 11.59, economicLean: 1, socialLean: -0.5, turnout: 73 },
      retirees: { population: 15.08, economicLean: 0.3, socialLean: 0.6, turnout: 80 },
      young_urban: { population: 9.02, economicLean: -2.6, socialLean: -2.4, turnout: 42 },
      border_communities: { population: 21.74, economicLean: 0.5, socialLean: 0, turnout: 62 },
    },
  },
  {
    stateId: "DON",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 11.53, economicLean: -1.1, socialLean: -2.1, turnout: 73 },
      rural_traditional: { population: 18.19, economicLean: 1.8, socialLean: 1, turnout: 68 },
      working_class: { population: 8.82, economicLean: -2.2, socialLean: -0.3, turnout: 50 },
      new_irish: { population: 2.25, economicLean: -2.5, socialLean: -1.2, turnout: 27 },
      small_business: { population: 10.85, economicLean: 0.8, socialLean: -0.4, turnout: 73 },
      retirees: { population: 15.98, economicLean: 0.3, socialLean: 0.6, turnout: 80 },
      young_urban: { population: 7.39, economicLean: -2.6, socialLean: -2.3, turnout: 42 },
      border_communities: { population: 25, economicLean: 0.6, socialLean: 0.1, turnout: 62 },
    },
  },
];
