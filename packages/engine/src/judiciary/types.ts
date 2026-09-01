/**
 * Judiciary types — W29 port.
 *
 * Sources:
 *  src/lib/db/types/scotus.ts (SupremeCourtSeat, ScotusNomination, DocketCase, HistoricalJusticeOccupant)
 *  src/lib/uk/judicialReview/surpriseTemplates.ts (JrSurpriseTemplate)
 *  src/lib/scotus/divergence.ts (decideCaseOutcome)
 *
 * Solo uses string ids and turn numbers; no ObjectId/Date in persisted state.
 */

export type ScotusNominationStatus = "active" | "confirmed" | "rejected" | "withdrawn";

export interface HistoricalOccupant {
  key: string;
  name: string;
  party?: string;
  economicLean: number;
  socialLean: number;
  seatedYear: number;
  departureYear: number | null;
  departureReason: "death" | "retirement" | null;
}

export interface SupremeCourtSeat {
  seatNumber: number;
  countryId: string;
  justiceMode: "character" | "npp" | "historical" | null;
  justiceId: string | null;
  justiceName: string | null;
  justiceParty: string | null;
  economicLean: number | null;
  socialLean: number | null;
  seatedAtTurn: number | null;
  isDivergent: boolean;
  historicalOccupantIndex: number;
  historicalOccupants: HistoricalOccupant[];
  divergentHazardStartsTurn: number | null;
}

export interface ScotusNomination {
  id: string;
  countryId: string;
  seatNumber: number;
  nomineeMode: "character" | "npp";
  nomineeId: string | null;
  nomineeName: string;
  nomineeParty?: string | null;
  proposedBy: string | null;
  status: ScotusNominationStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  votes: Record<string, "for" | "against" | "abstain">;
  votingEndsOnTurn: number;
  proposedAtTurn: number;
  confirmedAtTurn?: number;
  rejectedAtTurn?: number;
}

export type DocketCaseAxis = "economic" | "social";
export type DocketCaseOutcome = "affirmed" | "diverged";

export interface DocketCase {
  id: string;
  countryId: string;
  caseKey: string;
  title: string;
  axis: DocketCaseAxis;
  historicalMajorityDirection: 1 | -1;
  historicalOutcomeLocked?: boolean;
  decisionYear: number;
  effect?: { legislationTypeId: string; policyOptionId: string; effectDirection: -1 | 0 | 1 };
  status: "pending" | "decided";
  outcome?: DocketCaseOutcome;
  decidedAtTurn?: number;
  enactedLawId?: string;
  isSurprise?: boolean;
}

export type JrCaseAxis = "economic" | "social";

export interface JrCaseEffect {
  legislationTypeId: string;
  policyOptionId: string;
  effectDirection: -1 | 0 | 1;
}

export interface JrSurpriseTemplate {
  templateKey: string;
  title: string;
  axis: JrCaseAxis;
  positiveEffect: JrCaseEffect;
  negativeEffect: JrCaseEffect;
}

export interface UkJudicialReviewCase {
  id: string;
  countryId: "UK";
  templateKey: string;
  title: string;
  axis: JrCaseAxis;
  majoritySide: -1 | 0 | 1;
  decidedAtTurn: number;
  createdAtTurn: number;
}
