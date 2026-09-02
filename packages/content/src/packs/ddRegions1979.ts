import type { StateSeed } from "../types.js";
/**
 * East Germany regions for 1979-default. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Generated: 2026-09-02 by packages/content/scripts/generateStateLayer.ts
 * Sources:
 * - src/lib/seeds/dd/ddRegions.ts (population, gdp, houseDistricts, stateSenateSeats, region) — the bundle mainline seeds for 1979-default
 * - src/lib/seeds/dd/ddStatePartyOrgCalculations.ts DD_REGION_ORG_1979 (SED/CDU/LDPD/NDPD/DBD org per Land)
 *
 * Regions: mainline has no dedicated 1979 region bundle for this country; admin/seed/seedRU.ts maps "1979-default" to ruRegions.ts (and seedDD.ts / selectPresetBundle fall back to the 2019-default bundle). This file applies that same mapping.
 * houseDistricts sum 500 = pack volkskammer seats; stateSenateSeats sum 80 = landAssembly.
 */
export const ddRegions1979: StateSeed[] = [
  {
    id: "BEO",
    name: "Berlin (Ost)",
    countryId: "DD",
    population: 1150000,
    gdp: 16000,
    houseSeats: 35,
    senateSeats: 6,
    region: "Berlin",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 73, reg: 73 }, { abbr: "CDU", org: 5, reg: 5 }, { abbr: "LDPD", org: 6, reg: 6 }, { abbr: "NDPD", org: 4, reg: 4 }, { abbr: "DBD", org: 1, reg: 1 }], independent: 11, unregistered: 0, unaffiliatedOrg: 11 },
  },
  {
    id: "MV",
    name: "Mecklenburg-Vorpommern",
    countryId: "DD",
    population: 2100000,
    gdp: 18000,
    houseSeats: 64,
    senateSeats: 10,
    region: "North",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 61, reg: 61 }, { abbr: "CDU", org: 7, reg: 7 }, { abbr: "LDPD", org: 4, reg: 4 }, { abbr: "NDPD", org: 5, reg: 5 }, { abbr: "DBD", org: 11, reg: 11 }], independent: 12, unregistered: 0, unaffiliatedOrg: 12 },
  },
  {
    id: "BB",
    name: "Brandenburg",
    countryId: "DD",
    population: 2650000,
    gdp: 28000,
    houseSeats: 81,
    senateSeats: 13,
    region: "North",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 63, reg: 63 }, { abbr: "CDU", org: 6, reg: 6 }, { abbr: "LDPD", org: 5, reg: 5 }, { abbr: "NDPD", org: 5, reg: 5 }, { abbr: "DBD", org: 9, reg: 9 }], independent: 12, unregistered: 0, unaffiliatedOrg: 12 },
  },
  {
    id: "ST",
    name: "Sachsen-Anhalt",
    countryId: "DD",
    population: 3000000,
    gdp: 34000,
    houseSeats: 91,
    senateSeats: 15,
    region: "North",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 65, reg: 65 }, { abbr: "CDU", org: 7, reg: 7 }, { abbr: "LDPD", org: 6, reg: 6 }, { abbr: "NDPD", org: 5, reg: 5 }, { abbr: "DBD", org: 7, reg: 7 }], independent: 10, unregistered: 0, unaffiliatedOrg: 10 },
  },
  {
    id: "SN",
    name: "Sachsen",
    countryId: "DD",
    population: 5000000,
    gdp: 58000,
    houseSeats: 153,
    senateSeats: 24,
    region: "South",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 68, reg: 68 }, { abbr: "CDU", org: 6, reg: 6 }, { abbr: "LDPD", org: 8, reg: 8 }, { abbr: "NDPD", org: 5, reg: 5 }, { abbr: "DBD", org: 3, reg: 3 }], independent: 10, unregistered: 0, unaffiliatedOrg: 10 },
  },
  {
    id: "TH",
    name: "Thüringen",
    countryId: "DD",
    population: 2500000,
    gdp: 26000,
    houseSeats: 76,
    senateSeats: 12,
    region: "South",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 65, reg: 65 }, { abbr: "CDU", org: 8, reg: 8 }, { abbr: "LDPD", org: 7, reg: 7 }, { abbr: "NDPD", org: 5, reg: 5 }, { abbr: "DBD", org: 6, reg: 6 }], independent: 9, unregistered: 0, unaffiliatedOrg: 9 },
  },
];

// Totals: 6 regions, 16,400,000 population, 500 house seats, 80 upper-state seats (sum).
