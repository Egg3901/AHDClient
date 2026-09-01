/**
 * Shared types for the election engine pure formula layer.
 *
 * Mainline mapping: mirrors `src/lib/electionEngine/types.ts` but all Mongo /
 * WorldState imports are replaced with plain input interfaces defined below.
 * Field names match the Mongo documents they mirror so call sites can pass
 * `WorldState` slices or direct DB rows without renaming.
 *
 * No I/O, no WorldState reads.
 */

export type CountryId = string;

// ─── Demographic plain interfaces (mirror src/lib/db/types/demographics.ts) ──

export interface DemographicGroupDef {
  id: string;
  name: string;
  defaultEconomicLean: number;
  defaultSocialLean: number;
  defaultTurnout?: number;
}

export interface DemographicCategory {
  _id: string;
  name: string;
  groups: DemographicGroupDef[];
  defaultWeight: number;
}

export interface StateDemographicGroup {
  population: number;
  economicLean: number;
  socialLean: number;
  turnout?: number | undefined;
  nameRecognition?: number | undefined;
}

export type CategoryWeights = Record<string, number | undefined>;

export interface StateDemographics {
  _id: string;
  countryId: CountryId;
  categoryWeights: CategoryWeights;
  groups: Record<string, StateDemographicGroup>;
  cachedEconomicLean?: number | undefined;
  cachedSocialLean?: number | undefined;
  lastUpdated: Date;
  layer1PositionOverrides?: Record<string, Record<string, { economicLean: number; socialLean: number }>> | undefined;
  layer1TurnoutOverrides?: Record<string, Record<string, number>> | undefined;
}

// ─── State / turnout / org plain interfaces ────────────────────────────────

export interface State {
  _id: string;
  countryId: CountryId;
  regionType?: string | undefined;
  name: string;
  population: number;
  votingEligiblePopulation?: number | undefined;
  workingAgePopulation?: number | undefined;
  militaryServicePopulation?: number | undefined;
  gdp?: number | undefined;
  capitalStock?: number | undefined;
  houseDistricts?: number | undefined;
  stateSenateSeats?: number | undefined;
  region?: string | undefined;
  votingSystem?: "fptp" | "rcv" | undefined;
}

export interface StateDemographicTurnout {
  _id: string;
  countryId: CountryId;
  modifiers: Record<string, Record<string, number>>;
  lastDecayApplied: Date;
  lastUpdated: Date;
}

export interface StatePartyOrg {
  _id: string;
  countryId: CountryId;
  stateId: string;
  partyId: string;
  organization: number;
  chairId?: string | null | undefined;
  viceChairId?: string | null | undefined;
  treasurerId?: string | null | undefined;
  treasury: number;
  stateTaxRate: number;
  politicalStrength: number;
  hasPresence: boolean;
  createdAt: Date;
  updatedAt: Date;
  registration?: number | undefined;
  registrationShare?: number | undefined;
  primarySurge?: number | undefined;
}

// ─── EnrichedCandidate (mirrors src/lib/electionEngine/types.ts) ─────────

export interface EnrichedCandidate {
  candidateId: string;
  characterId: string;
  characterName: string;
  party: string;
  partyAbbr?: string | undefined;
  isNPP: boolean;
  charEP: number;
  charSP: number;
  favorability: number;
  politicalInfluence: number;
  nationalInfluence: number;
  partyInfluence?: number | undefined;
  partyChairRole?: "national" | "state" | null | undefined;
  stateChairStateIds?: string[] | undefined;
  infamy?: number | undefined;
  partyEcon?: number | undefined;
  partySocial?: number | undefined;
  archetypeApprovals?: Record<string, number> | undefined;
  support?: number | undefined;
  regimeStatus?: "ruling" | "approved" | "banned" | null | undefined;
  regimeMult?: number | undefined;
}

export interface DistributeVotesOptions {
  useAveragedPositions?: boolean | undefined;
  partyPositionWeight?: number | undefined;
  /** @deprecated no-op, kept for compatibility */
  usePresidentialPartyOrg?: boolean | undefined;
  includeInfluenceInAppeal?: boolean | undefined;
  useNationalInfluenceForReach?: boolean | undefined;
  presidentialPrimaryNationalReach?: boolean | undefined;
  votingSystem?: "fptp" | "rcv" | undefined;
  isGeneralElection?: boolean | undefined;
  countryId?: CountryId | undefined;
  manifestoMultipliers?: Record<string, Record<string, number>> | undefined;
  isOnePartyState?: boolean | undefined;
  parentRegionId?: string | undefined;
  liveTurnouts?: Record<string, number> | undefined;
  hasPlayerInRace?: boolean | undefined;
  spoilerRate?: number | undefined;
  useOrgAwareSpoiler?: boolean | undefined;
  partyGroupFavorabilityByKey?: Map<string, number> | undefined;
  regByParty?: Map<string, number> | undefined;
  regShareByParty?: Map<string, number> | undefined;
  govModifierByParty?: Map<string, number> | undefined;
  useSwingFlowModel?: boolean | undefined;
  presidentialModifierByParty?: Map<string, number> | undefined;
  midtermOppositionModifierByParty?: Map<string, number> | undefined;
  fundsByParty?: Map<string, number> | undefined;
  medianVoter?: { ep: number; sp: number } | undefined;
  incumbentSeatShareByParty?: Map<string, number> | undefined;
  incumbentPartyId?: string | undefined;
  incumbentApproval?: number | undefined;
  incumbencyApprovalPivot?: number | undefined;
  incumbentConsecutiveTerms?: number | undefined;
  legislativeIncumbentPartyId?: string | undefined;
  legislativeIncumbentTenureTerms?: number | undefined;
  houseIncumbentTenureTermsByCandidateId?: Map<string, number> | undefined;
  applyPartyFit?: boolean | undefined;
  stateOrgByCandidate?: Map<string, number> | undefined;
  homeStateByCandidate?: Map<string, string> | undefined;
  currentStateId?: string | undefined;
  ledgerSink?: import("./factorLedger.js").LedgerSink | undefined;
  ledgerUnitId?: string | undefined;
  ledgerBucketWeightsByGroup?: Map<string, Record<string, number>> | undefined;
}

export interface AppealWeightTrace {
  reachMult: number;
  fitMult: number;
  restMult: number;
}

export interface AccumulateVoteTurnPreload {
  preset?: string;
  currentYear?: number;
  startingYear?: number;
  eraSystemEnabled?: boolean;
  demographicDefaultsByState?: Map<string, StateDemographics>;
  categories: DemographicCategory[];
  stateMap: Map<string, State>;
  demographicsMap: Map<string, StateDemographics>;
  statePartyOrgsByState: Map<string, StatePartyOrg[]>;
  turnoutByState: Map<string, StateDemographicTurnout>;
  governingPartyIdsByCountry?: Map<CountryId, Set<string>>;
}
