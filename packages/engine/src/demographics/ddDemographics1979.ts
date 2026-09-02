import type { StateDemographicsSeed } from "./usStateDemographics1953.js";
/**
 * DD region demographics for 1979. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateStateLayer.ts
 * Sources:
 * - src/lib/seeds/international/dd.ts getDdModel("1979") (census, POSITIONS_1979, composition, turnout)
 * - src/lib/seeds/international/derive.ts buildModelRegionDemographics — the exact path admin/seed/seedRU.ts / seedDD.ts run for 1979-default
 */
export const DD_DEMOGRAPHICS_1979: StateDemographicsSeed[] = [
  {
    stateId: "BEO",
    categoryWeights: {"dd_voterGroups":100},
    groups: {
      party_nomenklatura: { population: 16.73, economicLean: 0, socialLean: -0.3, turnout: 85 },
      industrial_worker: { population: 20.17, economicLean: -1, socialLean: -0.1, turnout: 85 },
      collective_farmer: { population: 11.1, economicLean: -1.2, socialLean: 0.9, turnout: 85 },
      intelligentsia: { population: 21.47, economicLean: -0.6, socialLean: -0.2, turnout: 85 },
      christian_milieu: { population: 12.51, economicLean: -0.7, socialLean: 1.4, turnout: 85 },
      youth: { population: 18.03, economicLean: -0.9, socialLean: -0.6, turnout: 83 },
    },
  },
  {
    stateId: "MV",
    categoryWeights: {"dd_voterGroups":100},
    groups: {
      party_nomenklatura: { population: 9.46, economicLean: -0.1, socialLean: -0.2, turnout: 85 },
      industrial_worker: { population: 17.06, economicLean: -1.2, socialLean: 0, turnout: 85 },
      collective_farmer: { population: 23.08, economicLean: -0.9, socialLean: 1.1, turnout: 85 },
      intelligentsia: { population: 16.03, economicLean: -0.7, socialLean: 0, turnout: 85 },
      christian_milieu: { population: 20.86, economicLean: -0.7, socialLean: 1.4, turnout: 85 },
      youth: { population: 13.52, economicLean: -1.1, socialLean: -0.6, turnout: 83 },
    },
  },
  {
    stateId: "BB",
    categoryWeights: {"dd_voterGroups":100},
    groups: {
      party_nomenklatura: { population: 10.44, economicLean: -0.1, socialLean: -0.2, turnout: 85 },
      industrial_worker: { population: 18.01, economicLean: -1.1, socialLean: 0, turnout: 85 },
      collective_farmer: { population: 20.34, economicLean: -1, socialLean: 1.1, turnout: 85 },
      intelligentsia: { population: 17.24, economicLean: -0.7, socialLean: 0, turnout: 85 },
      christian_milieu: { population: 19.12, economicLean: -0.7, socialLean: 1.4, turnout: 85 },
      youth: { population: 14.85, economicLean: -1, socialLean: -0.6, turnout: 83 },
    },
  },
  {
    stateId: "ST",
    categoryWeights: {"dd_voterGroups":100},
    groups: {
      party_nomenklatura: { population: 11.63, economicLean: -0.1, socialLean: -0.2, turnout: 85 },
      industrial_worker: { population: 18.67, economicLean: -1.1, socialLean: 0, turnout: 85 },
      collective_farmer: { population: 18.27, economicLean: -1, socialLean: 1.1, turnout: 85 },
      intelligentsia: { population: 18.27, economicLean: -0.7, socialLean: 0, turnout: 85 },
      christian_milieu: { population: 17.53, economicLean: -0.7, socialLean: 1.4, turnout: 85 },
      youth: { population: 15.64, economicLean: -1, socialLean: -0.6, turnout: 83 },
    },
  },
  {
    stateId: "SN",
    categoryWeights: {"dd_voterGroups":100},
    groups: {
      party_nomenklatura: { population: 12.94, economicLean: -0.1, socialLean: -0.2, turnout: 85 },
      industrial_worker: { population: 19.42, economicLean: -1, socialLean: -0.1, turnout: 85 },
      collective_farmer: { population: 15.79, economicLean: -1.1, socialLean: 1, turnout: 85 },
      intelligentsia: { population: 19.38, economicLean: -0.7, socialLean: -0.1, turnout: 85 },
      christian_milieu: { population: 15.9, economicLean: -0.7, socialLean: 1.4, turnout: 85 },
      youth: { population: 16.56, economicLean: -1, socialLean: -0.6, turnout: 83 },
    },
  },
  {
    stateId: "TH",
    categoryWeights: {"dd_voterGroups":100},
    groups: {
      party_nomenklatura: { population: 12.08, economicLean: -0.1, socialLean: -0.2, turnout: 85 },
      industrial_worker: { population: 18.74, economicLean: -1.1, socialLean: 0, turnout: 85 },
      collective_farmer: { population: 17.69, economicLean: -1, socialLean: 1, turnout: 85 },
      intelligentsia: { population: 18.57, economicLean: -0.7, socialLean: -0.1, turnout: 85 },
      christian_milieu: { population: 17.1, economicLean: -0.7, socialLean: 1.4, turnout: 85 },
      youth: { population: 15.82, economicLean: -1, socialLean: -0.6, turnout: 83 },
    },
  },
];
