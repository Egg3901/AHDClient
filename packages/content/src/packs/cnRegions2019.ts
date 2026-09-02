import type { StateSeed } from "../types.js";
/**
 * China regions for 2019-default. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateRosters.ts
 * Sources:
 * - src/lib/seeds/cn/cnRegions.ts (2019-default bundle)
 * - src/lib/seeds/cn/cnStatePartyOrgCalculations.ts getCnRegionOrg(2019) (registration mirrors organization, per admin/seed/seedCnStatePartyOrg.ts)
 * - src/lib/constants/states.ts getCnPeoplesCongressSeats (senateSeats)
 *
 * senateSeats = CN_PEOPLES_CONGRESS_SEATS per mainline (the region doc's stateSenateSeats is the appointed CPPCC).
 */
export const cnRegions2019: StateSeed[] = [
  {
    id: "DB",
    name: "Dongbei",
    countryId: "CN",
    population: 99500000,
    gdp: 5500000,
    houseSeats: 238,
    senateSeats: 321,
    region: "Dongbei",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 94, reg: 94 }, { abbr: "CDL", org: 2, reg: 2 }, { abbr: "CNDCA", org: 3, reg: 3 }], independent: 1, unregistered: 0, unaffiliatedOrg: 1 },
  },
  {
    id: "HB",
    name: "Huabei",
    countryId: "CN",
    population: 135000000,
    gdp: 18000000,
    houseSeats: 323,
    senateSeats: 433,
    region: "Huabei",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 96, reg: 96 }, { abbr: "CDL", org: 4, reg: 4 }, { abbr: "CNDCA", org: 4, reg: 4 }], independent: 0, unregistered: 0, unaffiliatedOrg: 0 },
  },
  {
    id: "HD",
    name: "Huadong",
    countryId: "CN",
    population: 385000000,
    gdp: 42000000,
    houseSeats: 922,
    senateSeats: 1240,
    region: "Huadong",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 95, reg: 95 }, { abbr: "CDL", org: 5, reg: 5 }, { abbr: "CNDCA", org: 5, reg: 5 }], independent: 0, unregistered: 0, unaffiliatedOrg: 0 },
  },
  {
    id: "HZ",
    name: "Huazhong",
    countryId: "CN",
    population: 165000000,
    gdp: 16000000,
    houseSeats: 395,
    senateSeats: 533,
    region: "Huazhong",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 95, reg: 95 }, { abbr: "CDL", org: 4, reg: 4 }, { abbr: "CNDCA", org: 2, reg: 2 }], independent: 0, unregistered: 0, unaffiliatedOrg: 0 },
  },
  {
    id: "HN",
    name: "Huanan",
    countryId: "CN",
    population: 132000000,
    gdp: 18000000,
    houseSeats: 316,
    senateSeats: 425,
    region: "Huanan",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 94, reg: 94 }, { abbr: "CDL", org: 2, reg: 2 }, { abbr: "CNDCA", org: 4, reg: 4 }], independent: 0, unregistered: 0, unaffiliatedOrg: 0 },
  },
  {
    id: "XN",
    name: "Xinan",
    countryId: "CN",
    population: 195000000,
    gdp: 14000000,
    houseSeats: 466,
    senateSeats: 625,
    region: "Xinan",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 96, reg: 96 }, { abbr: "CDL", org: 3, reg: 3 }, { abbr: "CNDCA", org: 2, reg: 2 }], independent: 0, unregistered: 0, unaffiliatedOrg: 0 },
  },
  {
    id: "XB",
    name: "Xibei",
    countryId: "CN",
    population: 130000000,
    gdp: 8500000,
    houseSeats: 320,
    senateSeats: 423,
    region: "Xibei",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "CCP", org: 96, reg: 96 }, { abbr: "CDL", org: 2, reg: 2 }, { abbr: "CNDCA", org: 1, reg: 1 }], independent: 1, unregistered: 0, unaffiliatedOrg: 1 },
  },
];

// Totals: 7 regions, 2980 lower-house seats, 4000 upper/subnational seats (sum).
