/**
 * DD Demographics for 1953 — derived from mainline Layer 1 census shares via Layer1 model.
 *
 * Sources (no invented numbers):
 * - Census: src/lib/seeds/dd/ddRegionCensusData1953.ts (6 Laender, 1953 GDR)
 * - Positions: src/lib/seeds/international/dd.ts POSITIONS_1953 (nascent GDR, June 17 uprising)
 * - Composition/turnout: src/lib/seeds/international/dd.ts (DD_GROUP_IDS 6, COMPOSITION, TURNOUT_RATES)
 * - Categories: src/lib/seeds/dd/ddDemographicCategories.ts ddDemographicCategories (dd_voterGroups)
 * - Derivation: src/lib/seeds/international/derive.ts
 */
export const DD_DEMOGRAPHICS_1953 = [
  {
    stateId: "BEO",
    categoryWeights: { dd_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 15.93, economicLean: -0.3, socialLean: -1.0, turnout: 85 },
      industrial_worker: { population: 20.42, economicLean: -1.5, socialLean: -0.6, turnout: 85 },
      collective_farmer: { population: 11.9, economicLean: -1.0, socialLean: 1.0, turnout: 85 },
      intelligentsia: { population: 20.1, economicLean: -0.8, socialLean: -0.7, turnout: 85 },
      christian_milieu: { population: 13.04, economicLean: -0.3, socialLean: 1.8, turnout: 85 },
      youth: { population: 18.61, economicLean: -1.3, socialLean: -1.4, turnout: 83 },
    },
  },
  {
    stateId: "MV",
    categoryWeights: { dd_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 6.82, economicLean: -0.2, socialLean: -0.6, turnout: 85 },
      industrial_worker: { population: 16.08, economicLean: -1.7, socialLean: 0.0, turnout: 85 },
      collective_farmer: { population: 28.71, economicLean: 0.2, socialLean: 1.9, turnout: 85 },
      intelligentsia: { population: 12.13, economicLean: -0.8, socialLean: -0.2, turnout: 85 },
      christian_milieu: { population: 23.67, economicLean: 0.3, socialLean: 2.2, turnout: 85 },
      youth: { population: 12.59, economicLean: -1.2, socialLean: -1.4, turnout: 83 },
    },
  },
  {
    stateId: "BB",
    categoryWeights: { dd_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 8.03, economicLean: -0.2, socialLean: -0.6, turnout: 85 },
      industrial_worker: { population: 16.68, economicLean: -1.6, socialLean: -0.1, turnout: 85 },
      collective_farmer: { population: 26.07, economicLean: 0.1, socialLean: 1.8, turnout: 85 },
      intelligentsia: { population: 13.66, economicLean: -0.8, socialLean: -0.3, turnout: 85 },
      christian_milieu: { population: 22.19, economicLean: 0.2, socialLean: 2.2, turnout: 85 },
      youth: { population: 13.37, economicLean: -1.2, socialLean: -1.4, turnout: 83 },
    },
  },
  {
    stateId: "ST",
    categoryWeights: { dd_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 9.48, economicLean: -0.2, socialLean: -0.7, turnout: 85 },
      industrial_worker: { population: 17.34, economicLean: -1.5, socialLean: -0.2, turnout: 85 },
      collective_farmer: { population: 23.18, economicLean: 0.1, socialLean: 1.7, turnout: 85 },
      intelligentsia: { population: 15.16, economicLean: -0.8, socialLean: -0.4, turnout: 85 },
      christian_milieu: { population: 20.35, economicLean: 0.2, socialLean: 2.1, turnout: 85 },
      youth: { population: 14.49, economicLean: -1.2, socialLean: -1.4, turnout: 83 },
    },
  },
  {
    stateId: "SN",
    categoryWeights: { dd_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 12.32, economicLean: -0.3, socialLean: -0.8, turnout: 85 },
      industrial_worker: { population: 18.73, economicLean: -1.5, socialLean: -0.4, turnout: 85 },
      collective_farmer: { population: 17.7, economicLean: -0.2, socialLean: 1.5, turnout: 85 },
      intelligentsia: { population: 17.89, economicLean: -0.8, socialLean: -0.5, turnout: 85 },
      christian_milieu: { population: 16.83, economicLean: 0.0, socialLean: 2.0, turnout: 85 },
      youth: { population: 16.53, economicLean: -1.2, socialLean: -1.4, turnout: 83 },
    },
  },
  {
    stateId: "TH",
    categoryWeights: { dd_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 10.42, economicLean: -0.2, socialLean: -0.7, turnout: 85 },
      industrial_worker: { population: 17.61, economicLean: -1.5, socialLean: -0.3, turnout: 85 },
      collective_farmer: { population: 21.72, economicLean: 0.0, socialLean: 1.7, turnout: 85 },
      intelligentsia: { population: 15.96, economicLean: -0.8, socialLean: -0.4, turnout: 85 },
      christian_milieu: { population: 19.28, economicLean: 0.2, socialLean: 2.1, turnout: 85 },
      youth: { population: 15.01, economicLean: -1.2, socialLean: -1.4, turnout: 83 },
    },
  },
];
