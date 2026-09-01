/**
 * Seed pack format: versioned data, one per era.
 *
 * Forward compatibility: packs declare optional extension tables
 * (states, parties, sectors) as optional arrays. Existing packs
 * omit them; future packs may include them; validation and engine
 * ignore missing extensions. Unknown top-level keys are ignored so
 * adding new tables does not break older consumers.
 */

export interface SeedPack {
  /** Data format version for this pack. Bump when required fields change. */
  packVersion: number;
  era: EraSeed;
  countries: CountrySeed[];
  /** Optional extension tables: states, parties, sectors, budgets. */
  states?: StateSeed[];
  parties?: PartySeed[];
  legislatures?: LegislatureSeed[];
  sectors?: SectorSeed[];
  budgets?: BudgetSeed[];
}

export interface EraSeed {
  /** Stable id, e.g. "1953". Sourced from packs, not a hardcoded union. */
  id: string;
  /** Human label, e.g. "1953: Cold War Dawn". */
  label: string;
  /** ISO day, e.g. "1953-01-06". The world's turn 0 date when this era is selected. */
  startDate: string;
}

export interface CountrySeed {
  id: string;
  name: string;
  playable: boolean;
  economy: EconomySeed;
}

export interface EconomySeed {
  /** Nominal GDP in millions of in-game dollars. */
  gdp: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
}

/**
 * State/province seed. Ports mainline State collection (src/lib/db/types/state.ts)
 * and the political support tables that consume it.
 *
 * Mainline sources, all for the 1953 era:
 * - id, name, population, gdp, region, stateSenateSeats: src/lib/seeds/reference/states1953.ts (1950 Census + 1953 GSP estimates)
 * - houseSeats: src/lib/constants/states.ts HOUSE_SEATS_1953 (1950 Census apportionment for the 83rd Congress, sum 435; AK/HI 0)
 * - senateClasses: src/lib/constants/states.ts SENATE_CLASSES_BY_STATE
 * - registration: src/lib/seeds/registration/registrationLanes1953.ts (lane + per-state overrides; org/reg + independent/unregistered/unaffiliatedOrg)
 *
 * disenfranchisement is modeled via the unregistered pool (mainline uses large
 * Southern unregistered pools to represent Jim Crow disenfranchisement; e.g. MS 25, AL 22).
 * leans are implicit in the registration lane (DEM vs REP reg share) and not stored
 * separately; turnout anchors are neutral (RegionTurnout modifiers start at 0, ported from
 * src/lib/db/types/stateDemographicTurnout.ts).
 */
export interface StateSeed {
  id: string;
  name: string;
  countryId: string;
  population: number;
  /** Nominal GSP in millions USD (estimated 1953). */
  gdp: number;
  /** House apportionment for this era (1950 Census for 1953 pack, sum 435). */
  houseSeats: number;
  /** Upper-state legislature seats (era-invariant per states1953). */
  senateSeats: number;
  /** Census region. */
  region: string;
  /** Senate class pair from SENATE_CLASSES_BY_STATE. */
  senateClasses: [1 | 2 | 3, 1 | 2 | 3];
  /** Support/election transforms consume this bundle. */
  registration: {
    parties: Array<{ abbr: string; org: number; reg: number }>;
    independent: number;
    unregistered: number;
    unaffiliatedOrg: number;
  };
}

/**
 * Political party seed. Ports mainline's PoliticalParty axis representation:
 * economicPosition and socialPosition on -5..+5, as authored in
 * src/lib/seeds/reference/politicalParties.ts and per-country *Parties.ts.
 */
export interface PartySeed {
  id: string;
  name: string;
  countryId: string;
  abbreviation: string;
  color: string;
  economicPosition: number;
  socialPosition: number;
}

/** Legislature seed — one per country per era. */
export interface LegislatureSeed {
  countryId: string;
  name: string;
  bicameral: boolean;
  chambers: ChamberSeed[];
}

export interface ChamberSeed {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  elected: boolean;
  description?: string;
  composition: ChamberCompositionSeed;
}

export interface ChamberCompositionSeed {
  seatsByParty: Record<string, number>;
  vacancies: number;
}

/** Placeholder for future sectors table (industry sectors). */
export interface SectorSeed {
  id: string;
  name: string;
  [key: string]: unknown;
}

/** Budget seed for a country's national budget in this era. */
export interface BudgetSeed {
  /** Country id — must match a CountrySeed id. */
  countryId: string;
  fiscalYear: number;
  population: number;
  gdp: number; // absolute local currency
  currencyCode: string;
  /** Tax base ratios to build initial taxBases from gdp. */
  taxBaseRatios: {
    taxableIncome: number;
    corporateProfits: number;
    wagesAndSalaries: number;
    importValue: number;
    taxableSales: number;
  };
  /** Effective authored rates (%) — source: src/lib/politicalLegislation/seedTaxRates.ts SEED_TAX_RATES_1953 */
  taxRates: {
    incomeTax: number;
    domesticCorporateTax: number;
    foreignCorporateTax: number;
    payrollTax: number;
    tariffs: number;
    salesTax: number;
  };
  otherRevenue: number;
  debt: { principal: number; interestRate: number; ceiling: number };
  creditRating: string;
  /** Baseline spending lines — source: src/lib/seeds/reference/budgets.ts baselineSpendingByCategory */
  baselineSpendingByCategory: Record<string, number>;
  baselineStateGrants: number;
  economicFactors: { gdpGrowth: number; wageGrowth: number; inflationRate: number; tradeGrowth: number };
}
