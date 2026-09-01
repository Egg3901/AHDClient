/**
 * Intra-party democracy types for solo WorldState.
 * Ports mainline collections for statePartyElections, nationalPartyElections,
 * nationalCommitteeElections, coalitions, and leadership congress leaves as PORT-STUB.
 * See per-field citations in file doc comments.
 */

export type PartyPosition = "chair" | "viceChair" | "treasurer";
export type IntrapartyElectionStatus = "voting" | "completed";

export interface StatePartyElectionRecord {
  id: string; // `${regionId}:${partyId}:${position}:c${cycle}`
  regionId: string;
  partyId: string;
  countryId: string;
  position: PartyPosition;
  status: IntrapartyElectionStatus;
  startTurn: number;
  endTurn: number;
  durationTurns: number;
  cycle: number;
  winnerId: string | null;
  founding?: boolean;
  candidateIds: string[]; // politician ids + "player" when player contests
  // ballot: voterId -> candidateId (single choice)
  votes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface NationalPartyElectionRecord {
  id: string; // `${countryId}:${partyId}:${position}:c${cycle}`
  partyId: string;
  countryId: string;
  position: PartyPosition;
  status: IntrapartyElectionStatus;
  startTurn: number;
  endTurn: number;
  durationTurns: number;
  cycle: number;
  winnerId: string | null;
  founding?: boolean;
  candidateIds: string[];
  votes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface NationalCommitteeElectionRecord {
  id: string; // `${countryId}:${partyId}:c${cycle}`
  partyId: string;
  countryId: string;
  status: IntrapartyElectionStatus;
  startTurn: number;
  endTurn: number;
  durationTurns: number;
  cycle: number;
  winnerIds: string[];
  candidateIds: string[];
  // ballot: voterId -> candidateIds[] (up to MAX_VOTES_PER_VOTER)
  votes: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
}

export interface CoalitionDisbandVote {
  initiatedByPartyId: string;
  initiatedAtTurn: number;
  expiresOnTurn: number;
  votes: Record<string, "yes" | "no">; // partyId -> vote
}

export interface CoalitionRecord {
  id: string; // `coalition-${countryId}-${seq}`
  sequentialId: number;
  countryId: string;
  name: string;
  abbreviation: string;
  color: string;
  memberPartyIds: string[];
  chairPartyId: string | null;
  chairCharacterId: string | null;
  disbandVote: CoalitionDisbandVote | null;
  createdAtTurn: number;
  updatedAtTurn: number;
}
