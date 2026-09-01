import type { StateSeed } from "../types.js";

/**
 * East Germany regions for 1953-default. Generated from mainline AHDGame — DO NOT HAND-EDIT.
 * Sources:
 * - ddRegions1953.ts (population, gdp, houseDistricts, stateSenateSeats, region) — 6 Laender (BEO/MV/BB/ST/SN/TH) per W16 report, ~18.4M total
 * - ddRegionCensusData1953.ts not used for registration; registration uses ddStatePartyOrgCalculations.ts DD_REGION_ORG_1953 and registrationLanes1953.ts buildDDSeeds1953: parties [{abbr, org, reg}] per Land, independent = 100 - sumReg, unaffiliatedOrg = 100 - sumOrg
 * Total: 6 Laender, 18,400,000 population, 500 House seats (Volkskammer single National Front list), 80 Landtag seats. Laender dissolve to Bezirke mid-1952 historically but remain gameplay units (see ddRegions1953 header).
 * SenateClasses: no mainline Senate-class table for DD (Volkskammer has no staggered classes); using neutral [1,2] placeholder. Documented as PORT-STUB.
 */
export const ddRegions1953: StateSeed[] = [
  {
    id: "BEO",
    name: "Berlin (Ost)",
    countryId: "DD",
    population: 1190000,
    gdp: 5200,
    houseSeats: 32,
    senateSeats: 5,
    region: "Berlin",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 66, reg: 66 }, { abbr: "CDU", org: 6, reg: 6 }, { abbr: "LDPD", org: 8, reg: 8 }, { abbr: "NDPD", org: 5, reg: 5 }, { abbr: "DBD", org: 1, reg: 1 }], independent: 14, unregistered: 0, unaffiliatedOrg: 14 },
  },
  {
    id: "MV",
    name: "Mecklenburg-Vorpommern",
    countryId: "DD",
    population: 2120000,
    gdp: 3900,
    houseSeats: 58,
    senateSeats: 9,
    region: "North",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 54, reg: 54 }, { abbr: "CDU", org: 8, reg: 8 }, { abbr: "LDPD", org: 5, reg: 5 }, { abbr: "NDPD", org: 6, reg: 6 }, { abbr: "DBD", org: 13, reg: 13 }], independent: 14, unregistered: 0, unaffiliatedOrg: 14 },
  },
  {
    id: "BB",
    name: "Brandenburg",
    countryId: "DD",
    population: 2620000,
    gdp: 5600,
    houseSeats: 71,
    senateSeats: 11,
    region: "North",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 57, reg: 57 }, { abbr: "CDU", org: 7, reg: 7 }, { abbr: "LDPD", org: 6, reg: 6 }, { abbr: "NDPD", org: 6, reg: 6 }, { abbr: "DBD", org: 11, reg: 11 }], independent: 13, unregistered: 0, unaffiliatedOrg: 13 },
  },
  {
    id: "ST",
    name: "Sachsen-Anhalt",
    countryId: "DD",
    population: 4120000,
    gdp: 9900,
    houseSeats: 112,
    senateSeats: 18,
    region: "North",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 59, reg: 59 }, { abbr: "CDU", org: 8, reg: 8 }, { abbr: "LDPD", org: 7, reg: 7 }, { abbr: "NDPD", org: 6, reg: 6 }, { abbr: "DBD", org: 8, reg: 8 }], independent: 12, unregistered: 0, unaffiliatedOrg: 12 },
  },
  {
    id: "SN",
    name: "Sachsen",
    countryId: "DD",
    population: 5560000,
    gdp: 13900,
    houseSeats: 151,
    senateSeats: 24,
    region: "South",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 63, reg: 63 }, { abbr: "CDU", org: 7, reg: 7 }, { abbr: "LDPD", org: 9, reg: 9 }, { abbr: "NDPD", org: 6, reg: 6 }, { abbr: "DBD", org: 4, reg: 4 }], independent: 11, unregistered: 0, unaffiliatedOrg: 11 },
  },
  {
    id: "TH",
    name: "Thüringen",
    countryId: "DD",
    population: 2790000,
    gdp: 5500,
    houseSeats: 76,
    senateSeats: 13,
    region: "South",
    senateClasses: [1, 2],
    registration: { parties: [{ abbr: "SED", org: 59, reg: 59 }, { abbr: "CDU", org: 9, reg: 9 }, { abbr: "LDPD", org: 8, reg: 8 }, { abbr: "NDPD", org: 6, reg: 6 }, { abbr: "DBD", org: 7, reg: 7 }], independent: 11, unregistered: 0, unaffiliatedOrg: 11 },
  },
];
