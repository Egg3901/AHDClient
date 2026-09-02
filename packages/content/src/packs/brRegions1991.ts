import type { StateSeed } from "../types.js";
/**
 * Brazil regions for 1991-default. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/seeds/br/brRegions1991.ts
 * - src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds BR entries
 */
export const brRegions1991: StateSeed[] = [
  {
    id: "NORTE",
    name: "Norte",
    countryId: "BR",
    population: 10257000,
    gdp: 35000,
    houseSeats: 45,
    senateSeats: 21,
    region: "Norte",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "PMDB", org: 15, reg: 18 }, { abbr: "PFL", org: 11, reg: 14 }, { abbr: "PDS", org: 6, reg: 8 }, { abbr: "PRN", org: 6, reg: 8 }, { abbr: "PDT", org: 5, reg: 7 }, { abbr: "PTB", org: 4, reg: 6 }, { abbr: "PT", org: 3, reg: 4 }], independent: 27, unregistered: 8, unaffiliatedOrg: 50 },
  },
  {
    id: "NORDESTE",
    name: "Nordeste",
    countryId: "BR",
    population: 42497000,
    gdp: 130000,
    houseSeats: 141,
    senateSeats: 27,
    region: "Nordeste",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "PFL", org: 24, reg: 28 }, { abbr: "PMDB", org: 17, reg: 21 }, { abbr: "PDS", org: 10, reg: 12 }, { abbr: "PRN", org: 7, reg: 9 }, { abbr: "PTB", org: 6, reg: 8 }, { abbr: "PDT", org: 5, reg: 6 }, { abbr: "PT", org: 3, reg: 4 }], independent: 6, unregistered: 6, unaffiliatedOrg: 28 },
  },
  {
    id: "CENTRO_OESTE",
    name: "Centro-Oeste",
    countryId: "BR",
    population: 9412000,
    gdp: 70000,
    houseSeats: 35,
    senateSeats: 12,
    region: "Centro-Oeste",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "PMDB", org: 18, reg: 22 }, { abbr: "PFL", org: 11, reg: 14 }, { abbr: "PRN", org: 8, reg: 10 }, { abbr: "PDT", org: 7, reg: 9 }, { abbr: "PDS", org: 6, reg: 8 }, { abbr: "PTB", org: 5, reg: 7 }, { abbr: "PT", org: 3, reg: 4 }], independent: 20, unregistered: 6, unaffiliatedOrg: 42 },
  },
  {
    id: "SUDESTE",
    name: "Sudeste",
    countryId: "BR",
    population: 62660000,
    gdp: 525000,
    houseSeats: 196,
    senateSeats: 12,
    region: "Sudeste",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "PMDB", org: 18, reg: 21 }, { abbr: "PFL", org: 11, reg: 14 }, { abbr: "PDT", org: 9, reg: 11 }, { abbr: "PRN", org: 8, reg: 10 }, { abbr: "PT", org: 9, reg: 11 }, { abbr: "PDS", org: 7, reg: 8 }, { abbr: "PTB", org: 6, reg: 8 }], independent: 11, unregistered: 6, unaffiliatedOrg: 32 },
  },
  {
    id: "SUL",
    name: "Sul",
    countryId: "BR",
    population: 22117000,
    gdp: 140000,
    houseSeats: 86,
    senateSeats: 9,
    region: "Sul",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "PMDB", org: 22, reg: 26 }, { abbr: "PDT", org: 12, reg: 15 }, { abbr: "PDS", org: 10, reg: 12 }, { abbr: "PFL", org: 8, reg: 10 }, { abbr: "PT", org: 7, reg: 9 }, { abbr: "PRN", org: 6, reg: 7 }, { abbr: "PTB", org: 5, reg: 7 }], independent: 7, unregistered: 7, unaffiliatedOrg: 30 },
  },
];

// Totals: 5 regions, 503 lower-house seats, 81 upper/subnational seats (sum).
