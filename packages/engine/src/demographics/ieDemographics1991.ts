import type { StateDemographicsSeed } from "./usStateDemographics1953.js";
/**
 * Ireland region demographics for 1991. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/seeds/international/ie.ts getIeModel("1991") via getCountryLayer1Model
 * - src/lib/seeds/international/derive.ts buildModelRegionDemographics (the path admin/seed/seedIE.ts runs)
 */
export const IE_DEMOGRAPHICS_1991: StateDemographicsSeed[] = [
  {
    stateId: "DUB",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 15.8, economicLean: -1.9, socialLean: -0.9, turnout: 73 },
      rural_traditional: { population: 8.93, economicLean: 0.3, socialLean: 1.2, turnout: 68 },
      working_class: { population: 15.34, economicLean: -2.7, socialLean: 0, turnout: 50 },
      new_irish: { population: 3.45, economicLean: -3.2, socialLean: -0.5, turnout: 27 },
      small_business: { population: 9.07, economicLean: 0.9, socialLean: 0.1, turnout: 73 },
      retirees: { population: 13.91, economicLean: 0.5, socialLean: 1.4, turnout: 80 },
      young_urban: { population: 12.93, economicLean: -2.8, socialLean: -0.9, turnout: 42 },
      border_communities: { population: 20.57, economicLean: -0.2, socialLean: 0.6, turnout: 62 },
    },
  },
  {
    stateId: "KIL",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 9.91, economicLean: -1, socialLean: -0.8, turnout: 73 },
      rural_traditional: { population: 15.27, economicLean: 1.5, socialLean: 1.5, turnout: 68 },
      working_class: { population: 11.31, economicLean: -2.3, socialLean: 0.5, turnout: 50 },
      new_irish: { population: 2.08, economicLean: -3.1, socialLean: -0.2, turnout: 27 },
      small_business: { population: 11.83, economicLean: 0.8, socialLean: 0.2, turnout: 73 },
      retirees: { population: 16.62, economicLean: 0.5, socialLean: 1.3, turnout: 80 },
      young_urban: { population: 7.94, economicLean: -2.4, socialLean: -0.8, turnout: 42 },
      border_communities: { population: 25.05, economicLean: 0.3, socialLean: 0.8, turnout: 62 },
    },
  },
  {
    stateId: "MID",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 7.18, economicLean: -0.9, socialLean: -0.7, turnout: 73 },
      rural_traditional: { population: 18.79, economicLean: 1.9, socialLean: 1.6, turnout: 68 },
      working_class: { population: 11.34, economicLean: -2.2, socialLean: 0.7, turnout: 50 },
      new_irish: { population: 1.99, economicLean: -3, socialLean: 0, turnout: 27 },
      small_business: { population: 9.92, economicLean: 0.7, socialLean: 0.3, turnout: 73 },
      retirees: { population: 16.14, economicLean: 0.5, socialLean: 1.4, turnout: 80 },
      young_urban: { population: 6.96, economicLean: -2.3, socialLean: -0.7, turnout: 42 },
      border_communities: { population: 27.67, economicLean: 0.6, socialLean: 0.9, turnout: 62 },
    },
  },
  {
    stateId: "WEX",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 8.48, economicLean: -1.1, socialLean: -0.7, turnout: 73 },
      rural_traditional: { population: 17.18, economicLean: 1.8, socialLean: 1.6, turnout: 68 },
      working_class: { population: 11.68, economicLean: -2.3, socialLean: 0.6, turnout: 50 },
      new_irish: { population: 2.14, economicLean: -3, socialLean: -0.1, turnout: 27 },
      small_business: { population: 10.29, economicLean: 0.8, socialLean: 0.3, turnout: 73 },
      retirees: { population: 16.13, economicLean: 0.5, socialLean: 1.4, turnout: 80 },
      young_urban: { population: 7.69, economicLean: -2.4, socialLean: -0.7, turnout: 42 },
      border_communities: { population: 26.42, economicLean: 0.4, socialLean: 0.9, turnout: 62 },
    },
  },
  {
    stateId: "LIM",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 10.29, economicLean: -1.5, socialLean: -0.8, turnout: 73 },
      rural_traditional: { population: 14.99, economicLean: 1.5, socialLean: 1.5, turnout: 68 },
      working_class: { population: 12.77, economicLean: -2.4, socialLean: 0.4, turnout: 50 },
      new_irish: { population: 2.5, economicLean: -3.1, socialLean: -0.2, turnout: 27 },
      small_business: { population: 9.87, economicLean: 0.8, socialLean: 0.3, turnout: 73 },
      retirees: { population: 15.48, economicLean: 0.5, socialLean: 1.4, turnout: 80 },
      young_urban: { population: 9.11, economicLean: -2.5, socialLean: -0.8, turnout: 42 },
      border_communities: { population: 24.98, economicLean: 0.3, socialLean: 0.8, turnout: 62 },
    },
  },
  {
    stateId: "COR",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 11.32, economicLean: -1.5, socialLean: -0.8, turnout: 73 },
      rural_traditional: { population: 14.01, economicLean: 1.4, socialLean: 1.5, turnout: 68 },
      working_class: { population: 12.68, economicLean: -2.5, socialLean: 0.3, turnout: 50 },
      new_irish: { population: 2.57, economicLean: -3.1, socialLean: -0.3, turnout: 27 },
      small_business: { population: 10.29, economicLean: 0.8, socialLean: 0.2, turnout: 73 },
      retirees: { population: 15.6, economicLean: 0.5, socialLean: 1.4, turnout: 80 },
      young_urban: { population: 9.5, economicLean: -2.6, socialLean: -0.8, turnout: 42 },
      border_communities: { population: 24.04, economicLean: 0.2, socialLean: 0.8, turnout: 62 },
    },
  },
  {
    stateId: "GAL",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 9.37, economicLean: -1.2, socialLean: -0.8, turnout: 73 },
      rural_traditional: { population: 16.93, economicLean: 1.8, socialLean: 1.6, turnout: 68 },
      working_class: { population: 11.76, economicLean: -2.4, socialLean: 0.5, turnout: 50 },
      new_irish: { population: 2.29, economicLean: -3, socialLean: -0.2, turnout: 27 },
      small_business: { population: 9.66, economicLean: 0.8, socialLean: 0.2, turnout: 73 },
      retirees: { population: 15.61, economicLean: 0.5, socialLean: 1.4, turnout: 80 },
      young_urban: { population: 8.28, economicLean: -2.4, socialLean: -0.7, turnout: 42 },
      border_communities: { population: 26.09, economicLean: 0.5, socialLean: 0.9, turnout: 62 },
    },
  },
  {
    stateId: "DON",
    categoryWeights: {"ie_voterGroups":100},
    groups: {
      urban_professional: { population: 6.73, economicLean: -0.9, socialLean: -0.7, turnout: 73 },
      rural_traditional: { population: 19.97, economicLean: 2.1, socialLean: 1.7, turnout: 68 },
      working_class: { population: 11.63, economicLean: -2.2, socialLean: 0.7, turnout: 50 },
      new_irish: { population: 2.07, economicLean: -3, socialLean: 0.1, turnout: 27 },
      small_business: { population: 8.73, economicLean: 0.7, socialLean: 0.3, turnout: 73 },
      retirees: { population: 15.47, economicLean: 0.5, socialLean: 1.4, turnout: 80 },
      young_urban: { population: 7.02, economicLean: -2.3, socialLean: -0.6, turnout: 42 },
      border_communities: { population: 28.38, economicLean: 0.6, socialLean: 0.9, turnout: 62 },
    },
  },
];
