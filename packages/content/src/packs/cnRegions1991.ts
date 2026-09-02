import type { StateSeed } from "../types.js";
/**
 * China regions for 1991-default. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/seeds/cn/cnRegions1991.ts
 * - src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds CN entries
 * - src/lib/constants/states.ts getCnPeoplesCongressSeats (senateSeats)
 *
 * senateSeats = CN_PEOPLES_CONGRESS_SEATS per mainline (the region doc's stateSenateSeats is the appointed CPPCC).
 */
export const cnRegions1991: StateSeed[] = [
  {
    id: "DB",
    name: "Dongbei",
    countryId: "CN",
    population: 99840000,
    gdp: 220000,
    houseSeats: 238,
    senateSeats: 321,
    region: "Dongbei",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 82, reg: 88 }, { abbr: "CDL", org: 6, reg: 4 }, { abbr: "CNDCA", org: 4, reg: 3 }], independent: 4, unregistered: 1, unaffiliatedOrg: 8 },
  },
  {
    id: "HB",
    name: "Huabei",
    countryId: "CN",
    population: 120000000,
    gdp: 350000,
    houseSeats: 323,
    senateSeats: 433,
    region: "Huabei",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 82, reg: 88 }, { abbr: "CDL", org: 6, reg: 4 }, { abbr: "CNDCA", org: 4, reg: 3 }], independent: 4, unregistered: 1, unaffiliatedOrg: 8 },
  },
  {
    id: "HD",
    name: "Huadong",
    countryId: "CN",
    population: 312000000,
    gdp: 680000,
    houseSeats: 922,
    senateSeats: 1240,
    region: "Huadong",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 80, reg: 87 }, { abbr: "CDL", org: 7, reg: 5 }, { abbr: "CNDCA", org: 5, reg: 4 }], independent: 3, unregistered: 1, unaffiliatedOrg: 8 },
  },
  {
    id: "HZ",
    name: "Huazhong",
    countryId: "CN",
    population: 152000000,
    gdp: 260000,
    houseSeats: 395,
    senateSeats: 533,
    region: "Huazhong",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 82, reg: 88 }, { abbr: "CDL", org: 6, reg: 4 }, { abbr: "CNDCA", org: 4, reg: 3 }], independent: 4, unregistered: 1, unaffiliatedOrg: 8 },
  },
  {
    id: "HN",
    name: "Huanan",
    countryId: "CN",
    population: 113000000,
    gdp: 250000,
    houseSeats: 316,
    senateSeats: 425,
    region: "Huanan",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 81, reg: 88 }, { abbr: "CDL", org: 6, reg: 4 }, { abbr: "CNDCA", org: 4, reg: 3 }], independent: 4, unregistered: 1, unaffiliatedOrg: 9 },
  },
  {
    id: "XN",
    name: "Xinan",
    countryId: "CN",
    population: 192000000,
    gdp: 220000,
    houseSeats: 466,
    senateSeats: 625,
    region: "Xinan",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 82, reg: 89 }, { abbr: "CDL", org: 5, reg: 4 }, { abbr: "CNDCA", org: 4, reg: 3 }], independent: 3, unregistered: 1, unaffiliatedOrg: 9 },
  },
  {
    id: "XB",
    name: "Xibei",
    countryId: "CN",
    population: 130000000,
    gdp: 180000,
    houseSeats: 320,
    senateSeats: 423,
    region: "Xibei",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 83, reg: 90 }, { abbr: "CDL", org: 5, reg: 3 }, { abbr: "CNDCA", org: 4, reg: 2 }], independent: 4, unregistered: 1, unaffiliatedOrg: 8 },
  },
];

// Totals: 7 regions, 2980 lower-house seats, 4000 upper/subnational seats (sum).
