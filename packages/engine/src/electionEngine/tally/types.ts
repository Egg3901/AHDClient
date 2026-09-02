/**
 * Pure tally module — plain input interfaces mirroring Mongo documents.
 *
 * Each field's JSDoc notes the Mongo collection/field it mirrors so call
 * sites can pass WorldState slices or direct DB rows without renaming.
 * No WorldState import, no Mongo, no I/O.
 *
 * Ported from `src/lib/electionEngine/tallyManagement.ts` + `src/lib/db/types`.
 */

import type { EnrichedCandidate } from "../types.js";
import type { WorldRng } from "../../rng.js";

// ─── Election (mirrors `elections` collection) ──────────────────────────

export interface TallyElectionInput {
  /** `Election._id` */
  _id: string;
  /** `Election.countryId` — e.g. "US" */
  countryId: string;
  /** `Election.electionType` — e.g. "senate", "house", "commons" */
  electionType: string;
  /** `Election.state` — state/region id string */
  state: string;
  /** `Election.startTime` */
  startTime?: Date | string | null;
  /** `Election.endTime` */
  endTime?: Date | string | null;
  /** `Election.startTurn` */
  startTurn?: number | null;
  /** `Election.endTurn` */
  endTurn?: number | null;
  /** `Election.primaryEndTurn` */
  primaryEndTurn?: number | null;
  /** `Election.primaryEndTime` */
  primaryEndTime?: Date | string | null;
  /** `Election.totalSeats` — for multi-seat races */
  totalSeats?: number | null;
  /** `Election.createdAt` — fallback for legacy date window */
  createdAt?: Date | string | null;
  /** `Election.parentRegionId` — for UK/regional parties */
  parentRegionId?: string | null;
}

// ─── Candidate (mirrors `electionCandidates` collection) ───────────────

export interface TallyCandidateInput {
  /** `ElectionCandidate._id` */
  _id: string;
  /** `ElectionCandidate.electionId` */
  electionId: string;
  /** `ElectionCandidate.characterId` or `nppId` */
  characterId?: string | null;
  nppId?: string | null;
  /** `ElectionCandidate.characterName` */
  characterName: string;
  /** `ElectionCandidate.party` */
  party: string;
  /** `ElectionCandidate.status` */
  status: string;
  /** `ElectionCandidate.isNPP` */
  isNPP?: boolean;
  /** `ElectionCandidate.support` — 0..100, Phase 5a mood */
  support?: number | null;
}

// ─── Tally document (mirrors `electionVoteTallies` collection) ─────────

export interface VoteTurnSnapshotInput {
  turn: number;
  recordedAt: Date;
  cumulativeVotes: Record<string, number>;
  sharesPct: Record<string, number>;
  seatsEstimate?: Record<string, number>;
}

export interface TallyInput {
  /** `ElectionVoteTally._id` */
  _id?: string;
  /** `ElectionVoteTally.electionId` */
  electionId: string;
  /** `ElectionVoteTally.state` */
  state: string;
  /** `ElectionVoteTally.totalVotes` */
  totalVotes: Record<string, number>;
  /** `ElectionVoteTally.candidateNames` */
  candidateNames: Record<string, string>;
  /** `ElectionVoteTally.candidateParties` */
  candidateParties: Record<string, string>;
  /** `ElectionVoteTally.turnSnapshots` */
  turnSnapshots: VoteTurnSnapshotInput[];
  /** `ElectionVoteTally.finalized` */
  finalized?: boolean;
  /** `ElectionVoteTally.primaryResults` */
  primaryResults?: unknown;
  /** `ElectionVoteTally.primaryVotes` — legacy */
  primaryVotes?: unknown;
  /** `ElectionVoteTally.seatsEstimate` */
  seatsEstimate?: Record<string, number>;
  /** `ElectionVoteTally.createdAt` */
  createdAt: Date;
  /** `ElectionVoteTally.updatedAt` */
  updatedAt: Date;
}

// ─── State (mirrors `states` collection) ───────────────────────────────

export interface TallyStateInput {
  /** `State._id` */
  _id: string;
  /** `State.countryId` */
  countryId: string;
  /** `State.name` */
  name: string;
  /** `State.population` */
  population: number;
  /** `State.votingEligiblePopulation` — live VEP, fallback to population */
  votingEligiblePopulation?: number | null;
  /** `State.votingSystem` — "fptp" | "rcv" */
  votingSystem?: string | null;
  /** `State.parentRegionId` */
  parentRegionId?: string | null;
}

// ─── Turnout / registration (mirrors `stateDemographicTurnout` etc.) ───

export interface TallyTurnoutInput {
  totalPool: number;
  byGroup: Record<string, number>;
}

export interface TallyRegistrationPoolInput {
  /** `StateRegistrationPool.unregistered` — % of electorate unregistered */
  unregistered?: number | null;
}

// ─── Party org (mirrors `statePartyOrg` collection) ────────────────────

export interface TallyStatePartyOrgInput {
  stateId: string;
  partyId: string;
  organization: number;
  registration?: number | null;
  registrationShare?: number | null;
}

// ─── Derived driver inputs (caller supplies, plain values) ─────────────

export interface TallyDerivedInputs {
  /** `getStateApprovalForElection` result / 100, 0..100 */
  approvalPct: number;
  /** Party-group favorability map — key `${partyId}:${groupId}` */
  partyGroupFavorabilityByKey?: Map<string, number>;
  /** Per-party spendThisTurn for money driver */
  fundsByParty?: Map<string, number>;
  /** Per-party prior seat-share for incumbency driver */
  incumbentSeatShareByParty?: Map<string, number>;
  /** Sitting regional executive for coattail/incumbency */
  govExecutive?: { partyId: string; approval: number } | null;
  /** Sitting president for presidential coattail */
  president?: { partyId: string; approval: number } | null;
  /** Governing party ids for midterm boost */
  governingPartyIds?: Set<string>;
  /** Per-candidate executive endorsement ids */
  executiveEndorsedCandidateIds?: Set<string>;
  /** Single-seat legislative incumbency */
  legislativeIncumbency?: { incumbentPartyId: string; tenureTerms: number } | null;
  /** House multi-incumbent tenures */
  houseIncumbentTenureTermsByCandidateId?: Map<string, number>;
  /** Manifesto multipliers — PORT-STUB if solo lacks UK manifesto system */
  manifestoMultipliers?: Record<string, Record<string, number>>;
  /** Granular electorate substrate — PORT-STUB: null means use archetype inputs */
  granularSubstrate?: null | {
    demographics: import("../types.js").StateDemographics;
    categories: import("../types.js").DemographicCategory[];
    liveTurnouts: Record<string, number>;
    totalPool: number;
    enriched: EnrichedCandidate[];
    partyGroupFavorabilityByKey?: Map<string, number>;
  };
  /** Era year for majoritarian bonus */
  currentYear?: number | null;
}

// ─── Distribution function type (injectable) ───────────────────────────

export type DistributeFn = (
  enriched: EnrichedCandidate[],
  effectiveTurnPool: number,
  totalPool: number,
  electorate: number,
  demographics: import("../types.js").StateDemographics,
  categories: import("../types.js").DemographicCategory[],
  partyOrgByParty: Map<string, number>,
  options: Record<string, unknown>,
) => { votesPerCandidate: Record<string, number>; sharesPct: Record<string, number> };

// ─── accumulateVoteTurn result ─────────────────────────────────────────

export interface AccumulateVoteTurnInput {
  election: TallyElectionInput;
  candidates: TallyCandidateInput[];
  tally: TallyInput;
  state: TallyStateInput;
  demographics: import("../types.js").StateDemographics;
  categories: import("../types.js").DemographicCategory[];
  statePartyOrgs: TallyStatePartyOrgInput[];
  turnout: TallyTurnoutInput;
  registrationPool?: TallyRegistrationPoolInput | null;
  enriched: EnrichedCandidate[];
  turnNumber: number;
  now: Date;
  derived?: TallyDerivedInputs;
  /** Injected distributor — defaults to a no-op for tests that stub */
  distributeFn?: DistributeFn;
  /** RNG — tally path is deterministic; param reserved for future stochastic drivers */
  rng?: WorldRng;
  /** Whether this is general election phase — if null, derived from election bounds */
  isGeneralElection?: boolean | null;
}

export interface AccumulateVoteTurnResult {
  tally: TallyInput;
  snapshot: VoteTurnSnapshotInput;
  newTotals: Record<string, number>;
  sharesPct: Record<string, number>;
  seatsEstimate?: Record<string, number> | undefined;
  /** Already-present turn — no mutation */
  alreadyCounted?: boolean | undefined;
}

// ─── initElectionVoteTally inputs ──────────────────────────────────────

export interface InitElectionVoteTallyInput {
  electionId: string;
  candidates: TallyCandidateInput[];
  state: string;
  primaryResults?: unknown;
  existingPrimaryVotes?: unknown;
  existingId?: string;
  now: Date;
  rng?: WorldRng;
}

export interface InitElectionVoteTallyResult {
  tally: TallyInput;
}
