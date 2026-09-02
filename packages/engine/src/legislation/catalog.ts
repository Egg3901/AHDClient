import { CATALOG_JP } from "./catalogPortedJP.js";
import { CATALOG_DE } from "./catalogPortedDE.js";
import { CATALOG_IE } from "./catalogPortedIE.js";
import { CATALOG_CN } from "./catalogPortedCN.js";
import { CATALOG_BR } from "./catalogPortedBR.js";
/**
 * Bill catalog ported from mainline src/lib/politicalLegislation/catalog + laws.
 * Effect targets that exist in solo: economy fields (gdp, growthRate,
 * inflationRate, unemploymentRate, outputGap) and party/support effects
 * (registration, organization, pressure, turnout modifiers, candidate support).
 *
 * Entries whose effect targets are not yet ported are marked unavailable with
 * PORT-STUB blocking system named. This satisfies the brief's stub rule.
 */

export type CatalogStatus = "available" | "unavailable";

export interface CatalogLawLevel {
  name: string;
  description: string;
  gdpCostFraction?: number;
  incomeCostFraction?: number;
  gdpRevenueFraction?: number;
}

export interface CatalogEntry {
  id: string;
  /** Country id. US/UK/RU/DD are hand-ported; JP/DE/IE/CN/BR come from catalogPorted*.ts (W61 M2). */
  countryId: string;
  kind: "primary" | "secondary" | "tax";
  title: string;
  description: string;
  category: string;
  allowedScope: "national" | "regional" | "both";
  baselineLevel?: 0 | 1 | 2 | 3 | 4;
  levels?: [CatalogLawLevel, CatalogLawLevel, CatalogLawLevel, CatalogLawLevel, CatalogLawLevel];
  taxPolicy?: {
    scope: "federal" | "state";
    taxType: string;
    minRate: number;
    maxRate: number;
    step: number;
    baselineRate: number;
  };
  /**
   * Metric targets this law's DECAY-path effect pulls on. `higherBetter`
   * defaults true when absent — mainline's LegislationType carries an
   * authored isHigherBetter per metric (src/lib/db/types/legislation.ts);
   * Rotunda's catalog does not carry that flag yet for every entry (PORT-STUB
   * B03: per-metric direction authoring), so entries needing the opposite
   * sign must set it explicitly. Consumed by policyEffects/phases.ts.
   */
  targets: Array<{ metricId: string; weight: number; higherBetter?: boolean }>;
  status: CatalogStatus;
  blockingSystem?: string;
  /** Solo effect descriptor for available entries */
  effect?: {
    economy?: Partial<Record<"gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap", number>>;
    partySupport?: {
      registrationDelta?: number;
      organizationDelta?: number;
      pressureDelta?: number;
      supportDelta?: number;
    };
  };
  /**
   * W28: LegislationType.demographicEffects[] channel (src/lib/db/types/legislation.ts
   * DemographicEffect). Per-group/per-axis shifts applied every turn by
   * demographics/demographicEffects.ts runLegislationDemographicEffects, using
   * the enacting PolicyLedgerEntry's `economic` strength (effectDirection
   * stands in for it here — see policyEffects/phases.ts file doc, B01: no
   * per-option -3..3 "economic" ladder is authored in content yet, so
   * strength = effectDirection, not a graduated intensity).
   * No entries in AVAILABLE currently author this array — the mechanism is
   * wired end-to-end and tested with a synthetic entry; content seeding a
   * real demographicEffects[] array on a catalog entry is a separate task.
   */
  demographicEffects?: Array<{
    /** Voter group id, keyed against StateDemographics.groups. */
    groupId: string;
    target: "population" | "economicLean" | "socialLean" | "turnout";
    /** +1 pushes the target up, -1 pushes it down. Source: DemographicEffect.direction. */
    direction: 1 | -1;
    /** Magnitude scale, clamped [0.25, 3] by the applicator; default 1. Source: DemographicEffect.magnitude. */
    magnitude?: number;
    /**
     * When true, shifts the group's BASELINE permanently instead of a
     * capped/decaying overlay (mainline's durable-realignment channel,
     * src/lib/demographics/durableRealignment.ts). PORT-STUB this wave —
     * B04: no durable-baseline-rewrite path ported; permanent effects are
     * skipped with a note rather than silently treated as temporary.
     */
    permanent?: boolean;
  }>;
}

// Minimal ported catalog: select entries whose effect can be mapped to solo
// economy/party/support. Rest are stubbed as unavailable.

const AVAILABLE: CatalogEntry[] = [
  // Economy: mapped to CountryEconomy fields
  {
    id: "us.economy.workerSecurity.primary",
    countryId: "US",
    kind: "primary",
    title: "Fair Labor Standards and Employment Security Act",
    description: "Federal wage floors, hours rules, and workplace protections.",
    category: "economy",
    allowedScope: "both",
    baselineLevel: 1,
    targets: [{ metricId: "economy.workerSecurity", weight: 1 }],
    status: "available",
    effect: { economy: { unemploymentRate: -0.002 }, partySupport: { supportDelta: 1 } },
    levels: [
      { name: "No Federal Standards", description: "No standards." },
      { name: "Basic Standards", description: "Minium wage and hours.", gdpCostFraction: 0.00025 },
      { name: "National Standards", description: "Broader coverage.", gdpCostFraction: 0.0006 },
      { name: "Strong Protections", description: "Bargaining enforced.", gdpCostFraction: 0.0011 },
      { name: "Comprehensive Guarantees", description: "Universal coverage.", gdpCostFraction: 0.0018 },
    ],
  },
  {
    id: "us.economy.stability.primary",
    countryId: "US",
    kind: "primary",
    title: "Economic Stability and Fiscal Responsibility Act",
    description: "Counter-cyclical fiscal stance and stability.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 1,
    targets: [{ metricId: "economy.stability", weight: 1 }],
    status: "available",
    effect: { economy: { growthRate: 0.001, inflationRate: -0.001 } },
    levels: [
      { name: "No Policy", description: "No stance." },
      { name: "Stability Review", description: "Monitoring.", gdpCostFraction: 0.0002 },
      { name: "Counter-cyclical", description: "Buffers.", gdpCostFraction: 0.0005 },
      { name: "Active Stabilization", description: "Strong.", gdpCostFraction: 0.001 },
      { name: "Full Guarantee", description: "Comprehensive.", gdpCostFraction: 0.002 },
    ],
  },
  {
    id: "us.tax.incomeTax",
    countryId: "US",
    kind: "tax",
    title: "Federal Income Tax Structure",
    description: "Federal levy on personal incomes.",
    category: "economy",
    allowedScope: "national",
    targets: [],
    status: "available",
    taxPolicy: { scope: "federal", taxType: "incomeTax", minRate: 0, maxRate: 60, step: 1, baselineRate: 35 },
    effect: { economy: { growthRate: -0.0005, inflationRate: -0.0005 } },
  },
  {
    id: "us.tax.corporateTax",
    countryId: "US",
    kind: "tax",
    title: "Corporate Income Tax Act",
    description: "Taxation of corporate profits.",
    category: "economy",
    allowedScope: "national",
    targets: [],
    status: "available",
    taxPolicy: { scope: "federal", taxType: "domesticCorporateTax", minRate: 0, maxRate: 60, step: 1, baselineRate: 40 },
    effect: { economy: { growthRate: -0.0008 } },
  },
  {
    id: "us.infrastructure.highways.primary",
    countryId: "US",
    kind: "primary",
    title: "Highway Development and Interstate Act",
    description: "Federal highway and interstate investment.",
    category: "infrastructure",
    allowedScope: "national",
    baselineLevel: 1,
    targets: [{ metricId: "infrastructure.highways", weight: 1 }],
    status: "available",
    effect: { economy: { growthRate: 0.0015, gdp: 5000 } },
    levels: [
      { name: "No Program", description: "No highways." },
      { name: "Basic Roads", description: "Repairs.", gdpCostFraction: 0.001 },
      { name: "Expansion", description: "New miles.", gdpCostFraction: 0.002 },
      { name: "Interstate", description: "Network.", gdpCostFraction: 0.003 },
      { name: "Full Build", description: "Complete.", gdpCostFraction: 0.005 },
    ],
  },
  // UK examples
  {
    id: "uk.economy.workerSecurity.primary",
    countryId: "UK",
    kind: "primary",
    title: "Employment Protection and Wage Councils Act",
    description: "UK wage councils and employment protection.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 1,
    targets: [{ metricId: "economy.workerSecurity", weight: 1 }],
    status: "available",
    effect: { economy: { unemploymentRate: -0.0015 } },
    levels: [
      { name: "No Councils", description: "No councils." },
      { name: "Basic Councils", description: "Basic.", gdpCostFraction: 0.0003 },
      { name: "Expanded", description: "Expanded.", gdpCostFraction: 0.0007 },
      { name: "Strong", description: "Strong.", gdpCostFraction: 0.0012 },
      { name: "Comprehensive", description: "Full.", gdpCostFraction: 0.002 },
    ],
  },
  {
    id: "uk.tax.incomeTax",
    countryId: "UK",
    kind: "tax",
    title: "Income Tax Structure (UK)",
    description: "UK income levy.",
    category: "economy",
    allowedScope: "national",
    targets: [],
    status: "available",
    taxPolicy: { scope: "federal", taxType: "incomeTax", minRate: 0, maxRate: 60, step: 1, baselineRate: 30 },
    effect: { economy: { growthRate: -0.0004 } },
  },
  // Governance example with party/support effect
  {
    id: "us.governance.participation.primary",
    countryId: "US",
    kind: "primary",
    title: "Voting Rights and Participation Act",
    description: "Expands ballot access and participation.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    targets: [{ metricId: "governance.participation", weight: 1 }],
    status: "available",
    effect: { partySupport: { registrationDelta: 2, supportDelta: 2 } },
    levels: [
      { name: "Restricted", description: "Restricted." },
      { name: "Basic Access", description: "Basic.", gdpCostFraction: 0.0001 },
      { name: "Broad Access", description: "Broad.", gdpCostFraction: 0.0003 },
      { name: "Full Participation", description: "Full.", gdpCostFraction: 0.0006 },
      { name: "Guaranteed", description: "Universal.", gdpCostFraction: 0.001 },
    ],
  },
  {
    id: "us.health.universalCare.primary",
    countryId: "US",
    kind: "primary",
    title: "Health Care Coverage Act",
    description: "Federal health coverage expansion.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 0,
    targets: [{ metricId: "health.universalCare", weight: 1 }],
    status: "available",
    effect: { economy: { gdp: -2000 }, partySupport: { supportDelta: 1 } },
    levels: [
      { name: "No Coverage", description: "None." },
      { name: "Limited", description: "Limited.", gdpCostFraction: 0.001 },
      { name: "Expanded", description: "Expanded.", gdpCostFraction: 0.003 },
      { name: "Broad", description: "Broad.", gdpCostFraction: 0.006 },
      { name: "Universal", description: "Universal.", gdpCostFraction: 0.01 },
    ],
  },
  // Regional example
  {
    id: "us.state.tax.incomeTax",
    countryId: "US",
    kind: "tax",
    title: "State Income Tax Structure",
    description: "State-level income tax.",
    category: "economy",
    allowedScope: "regional",
    targets: [],
    status: "available",
    taxPolicy: { scope: "state", taxType: "incomeTax", minRate: 0, maxRate: 12, step: 0.5, baselineRate: 4 },
    effect: { economy: { growthRate: -0.0003 } },
  },
];

const STUBBED_IDS: Array<{ id: string; countryId: string; title: string; blockingSystem: string; category: string }> = [
  // Infrastructure/embargo/tariff etc. that need unported systems
  { id: "us.economy.mobility.primary", countryId: "US", title: "Economic Opportunity and Rural Assistance Act", blockingSystem: "budget/grants", category: "economy" },
  { id: "us.defense.diplomacy.primary", countryId: "US", title: "Diplomatic Posture and Alliance Act", blockingSystem: "military/alliance", category: "defense" },
  { id: "us.defense.armedForces.primary", countryId: "US", title: "Armed Forces Structure Act", blockingSystem: "military/conflict", category: "defense" },
  { id: "us.environment.conservation.primary", countryId: "US", title: "Conservation and Public Lands Act", blockingSystem: "politicalMetrics/environment", category: "environment" },
  { id: "uk.defense.security.primary", countryId: "UK", title: "Defence Readiness Act (UK)", blockingSystem: "military", category: "defense" },
  { id: "ru.economy.stability.primary", countryId: "RU", title: "Central Planning Stability Act", blockingSystem: "plannedEconomy", category: "economy" },
  { id: "dd.economy.workerSecurity.primary", countryId: "DD", title: "Labor Code (GDR)", blockingSystem: "politicalMetrics", category: "economy" },
  { id: "us.tariff.primary", countryId: "US", title: "Tariff and Customs Act (non-economy)", blockingSystem: "tariff/customs", category: "economy" },
  { id: "us.subsidy.industry.primary", countryId: "US", title: "Industrial Subsidy Act", blockingSystem: "subsidy/corporation", category: "economy" },
  { id: "us.union.law.primary", countryId: "US", title: "Union Law Act", blockingSystem: "labour/union", category: "order" },
  { id: "us.electoral.law.primary", countryId: "US", title: "Electoral Law Act", blockingSystem: "elections/electoralLaw", category: "governance" },
  { id: "us.centralBank.independence.primary", countryId: "US", title: "Central Bank Independence Act", blockingSystem: "centralBank/governance", category: "economy" },
];

const STUBBED: CatalogEntry[] = STUBBED_IDS.map((s) => ({
  id: s.id,
  countryId: s.countryId,
  kind: "primary",
  title: s.title,
  description: "PORT-STUB: unavailable",
  category: s.category,
  allowedScope: "national",
  targets: [{ metricId: `${s.category}.stub`, weight: 1 }],
  status: "unavailable",
  blockingSystem: s.blockingSystem,
}));

// W61 M2: generated per-country catalogs (see catalogPorted*.ts headers).
const PORTED: CatalogEntry[] = [...CATALOG_JP, ...CATALOG_DE, ...CATALOG_IE, ...CATALOG_CN, ...CATALOG_BR];
const AVAILABLE_ALL: CatalogEntry[] = [...AVAILABLE, ...PORTED.filter((e) => e.status === "available")];
const STUBBED_ALL: CatalogEntry[] = [...STUBBED, ...PORTED.filter((e) => e.status !== "available")];

const ALL: CatalogEntry[] = [...AVAILABLE_ALL, ...STUBBED_ALL];

const BY_ID = new Map<string, CatalogEntry>(ALL.map((e) => [e.id, e]));

export function getCatalog(countryId?: string, _year?: number): CatalogEntry[] {
  if (!countryId) return [...ALL];
  return ALL.filter((e) => e.countryId === countryId);
}

export function getLaw(id: string): CatalogEntry | null {
  return BY_ID.get(id) ?? null;
}

export function getAllLawIds(): string[] {
  return [...BY_ID.keys()];
}

export function isAvailable(id: string): boolean {
  const e = BY_ID.get(id);
  return !!e && e.status === "available";
}

export const CATALOG = ALL;
export const AVAILABLE_CATALOG = AVAILABLE_ALL;
export const STUBBED_CATALOG = STUBBED_ALL;
