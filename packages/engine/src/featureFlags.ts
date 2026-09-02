/**
 * Singleplayer simulation controls. All controls default on so an untouched
 * world remains byte-for-byte compatible with the original full pipeline.
 * Core clock, action refresh, history, and news maintenance are deliberately
 * not switchable because other systems rely on those invariants.
 */
export const WORLD_FEATURE_FLAG_DEFINITIONS = [
  { key: "economy", label: "Macro economy", description: "GDP, growth, inflation, employment, and trade updates." },
  { key: "politics", label: "Party politics", description: "Party strength, organization, NPC behavior, and caucus activity." },
  { key: "elections", label: "Elections", description: "Election timers, vote accumulation, and results." },
  { key: "campaigns", label: "Campaigns", description: "Campaign spending, investment, and subsidies." },
  { key: "legislation", label: "Legislation", description: "Bill timers, votes, enactment, and repeal processing." },
  { key: "governments", label: "Government", description: "Government formation, executives, cabinets, courts, and impeachment." },
  { key: "demographics", label: "Demographics", description: "Population effects, flows, turnout, and census changes." },
  { key: "budgets", label: "Budgets", description: "Tax bases, subsidies, fiscal years, and regional budgets." },
  { key: "centralBanks", label: "Central banks", description: "Policy rate decisions and chair succession." },
  { key: "corporations", label: "Corporations", description: "Company revenue, investment, growth, and insolvency." },
  { key: "commodities", label: "Commodities", description: "Commodity prices and extraction-contract settlement." },
  { key: "markets", label: "Stock markets", description: "Share-price recomputation." },
  { key: "events", label: "Events and crises", description: "World events, random player events, and crisis progression." },
  { key: "banking", label: "Banking", description: "Bank balance-sheet and solvency turns." },
  { key: "governors", label: "Governors", description: "Governor powers, orders, vacancies, and endorsements." },
  { key: "unions", label: "Labor unions", description: "Union finances, membership, and NPC union behavior." },
  { key: "bonds", label: "Bond markets", description: "Issuance, coupons, maturity, prices, and NPC holders." },
  { key: "foreignExchange", label: "Foreign exchange", description: "Currency valuation and pre-FX ledger snapshots." },
  { key: "commandEconomy", label: "Command economy", description: "Planning, marketization, and state-ownership concentration." },
  { key: "devolution", label: "Devolution", description: "Independence desire and referendum lifecycle." },
  { key: "metrics", label: "Economic metrics", description: "National metrics, models, confidence, and vital signs." },
  { key: "coldWar", label: "Cold War", description: "Nuclear production and superpower tension." },
  { key: "conflicts", label: "Conflicts", description: "War and settlement progression." },
  { key: "policyEffects", label: "Policy effects", description: "Ministerial orders and enacted-policy effects." },
  { key: "extraction", label: "Resource extraction", description: "Prospecting results and contract offers." },
  { key: "achievements", label: "Achievements", description: "Achievement evaluation and awards." },
] as const;

export type WorldFeatureFlag = (typeof WORLD_FEATURE_FLAG_DEFINITIONS)[number]["key"];
export type WorldFeatureFlags = Record<WorldFeatureFlag, boolean>;

export const DEFAULT_WORLD_FEATURE_FLAGS: WorldFeatureFlags = Object.fromEntries(
  WORLD_FEATURE_FLAG_DEFINITIONS.map(({ key }) => [key, true]),
) as WorldFeatureFlags;

const WORLD_FEATURE_FLAG_KEYS = new Set<string>(
  WORLD_FEATURE_FLAG_DEFINITIONS.map(({ key }) => key),
);

export function isWorldFeatureFlag(value: unknown): value is WorldFeatureFlag {
  return typeof value === "string" && WORLD_FEATURE_FLAG_KEYS.has(value);
}

export function resolveWorldFeatureFlags(value?: Partial<WorldFeatureFlags>): WorldFeatureFlags {
  const resolved = { ...DEFAULT_WORLD_FEATURE_FLAGS };
  if (value === undefined) return resolved;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Feature flags must be an object");
  }
  for (const [key, enabled] of Object.entries(value)) {
    if (!isWorldFeatureFlag(key)) throw new Error(`Unknown feature flag: ${key}`);
    if (typeof enabled !== "boolean") throw new Error(`Feature flag ${key} must be boolean`);
    resolved[key] = enabled;
  }
  return resolved;
}

const PHASE_FEATURE_FLAGS: Readonly<Record<string, WorldFeatureFlag>> = {
  fundGeneration: "economy",
  macroCountryTurn: "economy",
  tradeGrowth: "economy",
  tradeGrowthMirror: "economy",
  advanceCapitalStock: "economy",
  unownedSectorGrowth: "economy",
  nppFundGeneration: "politics",
  partyInfluenceTurn: "politics",
  playerEndorsementPartySweep: "politics",
  caucusTax: "politics",
  partyOrgTurn: "politics",
  partyTierTurn: "politics",
  partyActionGeneration: "politics",
  expireCharters: "politics",
  emptyPartyCleanup: "politics",
  partyMemberCountReconcile: "politics",
  nppRelationshipMaintenance: "politics",
  nppBillSponsorship: "politics",
  nppStanceDrift: "politics",
  nppActionProcessing: "politics",
  nppBehavior: "politics",
  statePartyElections: "politics",
  nationalPartyElections: "politics",
  nationalCommitteeElections: "politics",
  coalitionDisband: "politics",
  leadershipElections: "politics",
  voteAccumulation: "elections",
  electionTimers: "elections",
  electionResolution: "elections",
  campaignSpendReset: "campaigns",
  campaignTurn: "campaigns",
  campaignPartySubsidy: "campaigns",
  campaignNpcInvestment: "campaigns",
  billLifecycle: "legislation",
  governmentFormation: "governments",
  governmentVacancyWatcher: "governments",
  impeachmentLifecycle: "governments",
  presidentialSuccession: "governments",
  cabinetTransition: "governments",
  cabinetNominationLifecycle: "governments",
  scotusTurn: "governments",
  ukJrSurpriseTurn: "governments",
  turnoutDecay: "demographics",
  partyGOTV: "demographics",
  regDriftDecay: "demographics",
  pressureDecay: "demographics",
  priorityRegionDecay: "demographics",
  supportDecay: "demographics",
  supportAccrual: "demographics",
  demographicEffects: "demographics",
  demographicFlows: "demographics",
  census: "demographics",
  fiscalBaseGrowth: "budgets",
  subsidyBudget: "budgets",
  fiscalYear: "budgets",
  regionalBudgetProcessing: "budgets",
  centralBankChairTurn: "centralBanks",
  centralBankChairSelection: "centralBanks",
  corporationTurn: "corporations",
  commodityPrices: "commodities",
  contractSettlement: "commodities",
  recomputeSharePrices: "markets",
  worldEventsMaintenance: "events",
  worldEventsScheduler: "events",
  playerRandomEvents: "events",
  crisisTurn: "events",
  bankingTurn: "banking",
  bankSolvencyTurn: "banking",
  governorAPRegen: "governors",
  governorOrders: "governors",
  governorAddressExpiry: "governors",
  governorByElectionWatcher: "governors",
  governorLegislationQueue: "governors",
  governorEndorsements: "governors",
  nppUnionBehavior: "unions",
  unionsTurn: "unions",
  sovereignIssuance: "bonds",
  bondCouponMaturity: "bonds",
  npcBondHolder: "bonds",
  ledgerPreForexSnapshot: "foreignExchange",
  forexTurn: "foreignExchange",
  commandEconomy: "commandEconomy",
  stateOwnershipConcentration: "commandEconomy",
  independenceDesireDrift: "devolution",
  referendumLifecycle: "devolution",
  metricDecay: "metrics",
  investorConfidenceDecay: "metrics",
  nationalMetrics: "metrics",
  economicModel: "metrics",
  inflationRecalc: "metrics",
  economicVitalSigns: "metrics",
  nuclearProduction: "coldWar",
  coldWarTension: "coldWar",
  warsTurn: "conflicts",
  ministerialOrders: "policyEffects",
  policyEffects: "policyEffects",
  resolveProspects: "extraction",
  contractOfferAcceptance: "extraction",
  achievementCheck: "achievements",
};

export function featureFlagForPhase(phaseName: string): WorldFeatureFlag | null {
  return PHASE_FEATURE_FLAGS[phaseName] ?? null;
}

export function isTurnPhaseEnabled(flags: WorldFeatureFlags, phaseName: string): boolean {
  const flag = featureFlagForPhase(phaseName);
  return flag === null || flags[flag];
}
