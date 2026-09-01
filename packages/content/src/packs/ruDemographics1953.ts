/**
 * RU Demographics for 1953 — derived from mainline Layer 1 census shares via Layer1 model.
 *
 * Sources (no invented numbers):
 * - Census: src/lib/seeds/ru/ruRegionCensusData1953.ts (1939/1950 Soviet census, 14 regions)
 * - Positions: src/lib/seeds/international/ru.ts POSITIONS_1953 (Stalinist economy peak rigidity)
 * - Composition/turnout: src/lib/seeds/international/ru.ts (SU_GROUP_IDS 7, COMPOSITION, TURNOUT_RATES)
 * - Categories: src/lib/seeds/ru/ruDemographicCategories.ts ruDemographicCategories (su_voterGroups)
 * - Derivation: src/lib/seeds/international/derive.ts (same as UK)
 */
export const RU_DEMOGRAPHICS_1953 = [
  {
    stateId: "CEN",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 11.62, economicLean: -1.2, socialLean: 1.0, turnout: 85 },
      industrial_worker: { population: 23.93, economicLean: -1.8, socialLean: 1.5, turnout: 83 },
      collective_farmer: { population: 12.06, economicLean: -3.4, socialLean: 3.5, turnout: 77 },
      urban_professional: { population: 18.22, economicLean: -1.4, socialLean: 1.1, turnout: 85 },
      intelligentsia: { population: 16.14, economicLean: -1.4, socialLean: 1.1, turnout: 85 },
      national_minority: { population: 2.31, economicLean: -3.5, socialLean: 3.7, turnout: 72 },
      youth: { population: 15.72, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "NWR",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 11.54, economicLean: -1.2, socialLean: 1.0, turnout: 85 },
      industrial_worker: { population: 24.32, economicLean: -1.8, socialLean: 1.5, turnout: 83 },
      collective_farmer: { population: 11.64, economicLean: -3.4, socialLean: 3.5, turnout: 77 },
      urban_professional: { population: 18.37, economicLean: -1.4, socialLean: 1.1, turnout: 85 },
      intelligentsia: { population: 16.24, economicLean: -1.4, socialLean: 1.1, turnout: 85 },
      national_minority: { population: 2.37, economicLean: -3.4, socialLean: 3.6, turnout: 72 },
      youth: { population: 15.52, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "NOR",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 10.25, economicLean: -1.3, socialLean: 1.1, turnout: 85 },
      industrial_worker: { population: 23.06, economicLean: -1.8, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 15.65, economicLean: -3.4, socialLean: 3.5, turnout: 77 },
      urban_professional: { population: 16.99, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      intelligentsia: { population: 14.98, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      national_minority: { population: 3.75, economicLean: -3.4, socialLean: 3.6, turnout: 72 },
      youth: { population: 15.32, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "CBE",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 8.99, economicLean: -1.4, socialLean: 1.2, turnout: 85 },
      industrial_worker: { population: 21.67, economicLean: -1.9, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 21.43, economicLean: -3.5, socialLean: 3.6, turnout: 77 },
      urban_professional: { population: 15.16, economicLean: -1.6, socialLean: 1.2, turnout: 85 },
      intelligentsia: { population: 13.42, economicLean: -1.6, socialLean: 1.2, turnout: 85 },
      national_minority: { population: 4.76, economicLean: -3.7, socialLean: 3.9, turnout: 72 },
      youth: { population: 14.57, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "VOL",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 9.92, economicLean: -1.3, socialLean: 1.1, turnout: 85 },
      industrial_worker: { population: 22.32, economicLean: -1.8, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 16.45, economicLean: -3.4, socialLean: 3.5, turnout: 77 },
      urban_professional: { population: 16.44, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      intelligentsia: { population: 14.48, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      national_minority: { population: 5.21, economicLean: -3.1, socialLean: 3.2, turnout: 72 },
      youth: { population: 15.18, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "NCA",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 8.42, economicLean: -1.4, socialLean: 1.2, turnout: 85 },
      industrial_worker: { population: 20.8, economicLean: -1.8, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 20.62, economicLean: -3.5, socialLean: 3.6, turnout: 77 },
      urban_professional: { population: 14.57, economicLean: -1.6, socialLean: 1.3, turnout: 85 },
      intelligentsia: { population: 12.75, economicLean: -1.6, socialLean: 1.3, turnout: 85 },
      national_minority: { population: 8.15, economicLean: -2.5, socialLean: 3.7, turnout: 72 },
      youth: { population: 14.69, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "URA",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 10.51, economicLean: -1.3, socialLean: 1.1, turnout: 85 },
      industrial_worker: { population: 23.83, economicLean: -1.8, socialLean: 1.5, turnout: 83 },
      collective_farmer: { population: 13.92, economicLean: -3.4, socialLean: 3.5, turnout: 77 },
      urban_professional: { population: 17.34, economicLean: -1.5, socialLean: 1.1, turnout: 85 },
      intelligentsia: { population: 15.21, economicLean: -1.5, socialLean: 1.1, turnout: 85 },
      national_minority: { population: 3.89, economicLean: -3.1, socialLean: 3.2, turnout: 72 },
      youth: { population: 15.3, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "WSB",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 10.09, economicLean: -1.3, socialLean: 1.1, turnout: 85 },
      industrial_worker: { population: 23.17, economicLean: -1.8, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 15.62, economicLean: -3.4, socialLean: 3.5, turnout: 77 },
      urban_professional: { population: 16.92, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      intelligentsia: { population: 14.9, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      national_minority: { population: 3.88, economicLean: -3.4, socialLean: 3.5, turnout: 72 },
      youth: { population: 15.42, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "ESB",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 9.57, economicLean: -1.3, socialLean: 1.2, turnout: 85 },
      industrial_worker: { population: 23.12, economicLean: -1.8, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 16.36, economicLean: -3.4, socialLean: 3.6, turnout: 77 },
      urban_professional: { population: 16.44, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      intelligentsia: { population: 14.32, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      national_minority: { population: 4.81, economicLean: -3.2, socialLean: 3.3, turnout: 72 },
      youth: { population: 15.38, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "FEA",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 10.62, economicLean: -1.2, socialLean: 1.0, turnout: 85 },
      industrial_worker: { population: 23.68, economicLean: -1.8, socialLean: 1.5, turnout: 83 },
      collective_farmer: { population: 13.6, economicLean: -3.4, socialLean: 3.5, turnout: 77 },
      urban_professional: { population: 17.49, economicLean: -1.5, socialLean: 1.1, turnout: 85 },
      intelligentsia: { population: 15.31, economicLean: -1.5, socialLean: 1.1, turnout: 85 },
      national_minority: { population: 3.37, economicLean: -3.3, socialLean: 3.4, turnout: 72 },
      youth: { population: 15.93, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "KAZ",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 8.09, economicLean: -1.4, socialLean: 1.1, turnout: 85 },
      industrial_worker: { population: 19.93, economicLean: -1.9, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 19.69, economicLean: -3.5, socialLean: 3.6, turnout: 77 },
      urban_professional: { population: 14.16, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      intelligentsia: { population: 12.59, economicLean: -1.5, socialLean: 1.2, turnout: 85 },
      national_minority: { population: 11.02, economicLean: -2.1, socialLean: 3.9, turnout: 72 },
      youth: { population: 14.52, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "TRA",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 7.44, economicLean: -1.4, socialLean: 1.2, turnout: 85 },
      industrial_worker: { population: 19.62, economicLean: -1.9, socialLean: 1.6, turnout: 83 },
      collective_farmer: { population: 19.99, economicLean: -3.5, socialLean: 3.6, turnout: 77 },
      urban_professional: { population: 13.15, economicLean: -1.6, socialLean: 1.3, turnout: 85 },
      intelligentsia: { population: 11.54, economicLean: -1.6, socialLean: 1.3, turnout: 85 },
      national_minority: { population: 14.33, economicLean: -1.9, socialLean: 3.7, turnout: 72 },
      youth: { population: 13.93, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "CAS",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 5.42, economicLean: -1.5, socialLean: 1.3, turnout: 85 },
      industrial_worker: { population: 16.25, economicLean: -1.9, socialLean: 1.7, turnout: 83 },
      collective_farmer: { population: 24.63, economicLean: -3.5, socialLean: 3.6, turnout: 77 },
      urban_professional: { population: 10.52, economicLean: -1.6, socialLean: 1.4, turnout: 85 },
      intelligentsia: { population: 9.19, economicLean: -1.7, socialLean: 1.4, turnout: 85 },
      national_minority: { population: 19.63, economicLean: -1.8, socialLean: 4.1, turnout: 72 },
      youth: { population: 14.36, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
  {
    stateId: "MOL",
    categoryWeights: { su_voterGroups: 100 },
    groups: {
      party_nomenklatura: { population: 6.28, economicLean: -1.5, socialLean: 1.4, turnout: 85 },
      industrial_worker: { population: 18.41, economicLean: -2.0, socialLean: 1.7, turnout: 83 },
      collective_farmer: { population: 25.9, economicLean: -3.5, socialLean: 3.6, turnout: 77 },
      urban_professional: { population: 12.12, economicLean: -1.7, socialLean: 1.4, turnout: 85 },
      intelligentsia: { population: 10.79, economicLean: -1.7, socialLean: 1.4, turnout: 85 },
      national_minority: { population: 13.11, economicLean: -2.9, socialLean: 3.0, turnout: 72 },
      youth: { population: 13.39, economicLean: -1.4, socialLean: 0.9, turnout: 76 },
    },
  },
];
