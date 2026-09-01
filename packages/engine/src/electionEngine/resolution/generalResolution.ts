// @ts-nocheck
/**
 * General election resolution — pure planning layer.
 *
 * Ported from `src/lib/turn/election/generalResolution.ts`.
 * DB writes (electedOfficials, characters, npps, notifications, spawning)
 * are replaced with plain-input planning functions. Field names mirror the
 * Mongo documents they replace.
 *
 * Plain input mapping to WorldState:
 *   Election -> WorldState elections slice
 *   ElectionVoteTally -> tally objects with totalVotes
 *   ElectionCandidate -> candidateSupports / elections candidates
 *   ElectedOfficial -> WorldState politicians (currentOffice)
 *   CountryState / GameState -> apportionment context via ApportionmentEraContext
 *
 * Operator wires WorldState into these functions next wave.
 */

import { allocateSeats, getMajoritarianBonus, type MajoritarianBonusConfig, type RankedCandidate } from "./seatAllocation.js";
import { blocListQuotaForGovernment } from "./constants.js";
import type { Election } from "./generalResolutionHelpers.js";

export interface TallyInput {
  electionId: string;
  totalVotes: Record<string, number>;
  candidateParties?: Record<string, string>;
  finalized?: boolean;
}

export interface CandidateInput {
  _id: string;
  electionId: string;
  characterId?: string;
  characterName: string;
  party: string;
  isNPP?: boolean;
}

export interface ApportionmentInput {
  houseSeats: Record<string, number>;
  commonsSeats: Record<string, number>;
}

export interface GovernmentTypeInput {
  countryId: string;
  governmentType: string;
}

export interface GeneralResolutionInput {
  election: Election;
  tally: TallyInput | null;
  candidates: CandidateInput[];
  totalSeats: number;
  currentYear?: number | null;
  apportionment?: ApportionmentInput;
  government?: GovernmentTypeInput | null;
  orgRanking?: string[];
}

export interface GeneralResolutionResult {
  electionId: string;
  isMultiSeat: boolean;
  authoritativeSeats: number;
  seatsEstimate: Record<string, number>;
  winners: [string, number][];
  losers: string[];
  // Planning flags for operator to wire side effects
  shouldSpawnHouse?: boolean;
  shouldSpawnCommons?: boolean;
  blocListUsed?: boolean;
}

/**
 * Pure general-election resolution: given tally and candidates, determine
 * seat allocation via the same Largest Remainder + majoritarian-bonus path
 * the DB resolver uses. No DB reads/writes, no notifications.
 */
export function resolveGeneralElectionPure(input: GeneralResolutionInput): GeneralResolutionResult | null {
  const { election, tally, candidates, totalSeats, currentYear, apportionment, government, orgRanking } = input;
  if (!tally) return null;
  const totalVotesCast = Object.values(tally.totalVotes).reduce((a, b) => a + b, 0);
  if (totalVotesCast === 0) return null;
  if (candidates.length === 0) return null;

  const ranked: RankedCandidate[] = candidates
    .map((c) => ({ id: c._id, votes: tally.totalVotes[c._id] ?? 0, party: c.party }))
    .sort((a, b) => b.votes - a.votes);

  const majoritarianBonus: MajoritarianBonusConfig | undefined = getMajoritarianBonus(election.electionType, currentYear ?? null);
  if (majoritarianBonus && orgRanking) majoritarianBonus.orgRanking = orgRanking;

  const blocQuota = government ? blocListQuotaForGovernment(government.countryId, government.governmentType) : null;
  const blocShares = blocQuota?.shares;

  const res = allocateSeats(
    election.electionType,
    election.state,
    totalSeats,
    ranked,
    totalVotesCast,
    apportionment?.houseSeats,
    majoritarianBonus,
    blocShares,
    apportionment?.commonsSeats,
  );

  return {
    electionId: election._id,
    ...res,
    shouldSpawnHouse: election.electionType === "house",
    shouldSpawnCommons: election.electionType === "commons",
    blocListUsed: !!blocShares,
  };
}

// Re-export helpers for convenience
export { buildPrimaryShareMap, getChamberClass, multiSeatOfficialFilter, carryForwardCommonsConstituency, preserveExecutiveOffice } from "./generalResolutionHelpers.js";
