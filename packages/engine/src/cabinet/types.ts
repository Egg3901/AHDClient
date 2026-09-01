/**
 * Cabinet types — W29 port.
 *
 * Mainline sources:
 *  src/lib/db/types/cabinet.ts (CabinetMember, CabinetNomination)
 *  src/lib/constants/cabinet.ts (CABINET_POSITIONS)
 *  src/lib/cabinet/ministerialActionPool.ts (initialMinisterialActionFields)
 *  src/lib/congress/governmentVoteBreakdown.ts (computeCabinetNominationTally)
 *  src/lib/billLifecycleHelpers.ts (didPass)
 *
 * Solo representation is pure WorldState (no DB). Types mirror mainline fields
 * but replace ObjectId with string ids and Date with turn numbers where the
 * engine is turn-clocked.
 */

export type CabinetNominationStatus = "proposed" | "active" | "confirmed" | "rejected" | "withdrawn";

export interface CabinetMember {
  countryId: string;
  positionId: string;
  /** Holder id: "player" or politician id. */
  characterId: string;
  characterName: string;
  partyId: string | null;
  /** Who appointed them — president's character id (player or politician). */
  appointedBy: string | null;
  appointedAtTurn: number;
  confirmedAtTurn: number;
  acting?: boolean;
  actingSinceTurn?: number;
  actingExpiresOnTurn?: number;
}

export interface CabinetNomination {
  id: string;
  countryId: string;
  positionId: string;
  nomineeId: string;
  nomineeName: string;
  nomineeParty: string | null;
  proposedBy: string | null;
  proposedByName: string | null;
  status: CabinetNominationStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  votes: Record<string, "for" | "against" | "abstain">;
  /** House side only for VP nominations (25th Amendment, both chambers). */
  houseVotesFor?: number;
  houseVotesAgainst?: number;
  houseVotesAbstain?: number;
  houseVotes?: Record<string, "for" | "against" | "abstain">;
  votingEndsOnTurn: number;
  proposedAtTurn: number;
  confirmedAtTurn?: number;
  rejectedAtTurn?: number;
}

export interface CabinetConfirmationTally {
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  houseVotesFor?: number;
  houseVotesAgainst?: number;
  houseVotesAbstain?: number;
}
