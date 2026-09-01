/**
 * Live election state (W21c orchestration). The pure planning/resolution math
 * lives in ../electionEngine; these records are what the turn phases maintain.
 */

export interface ElectionCandidate {
  /** "player" or a politician id. */
  id: string;
  name: string;
  partyId: string;
  isNPP: boolean;
  /** True for the seat holder entering the race. */
  incumbent: boolean;
}

export type ElectionStatus = "upcoming" | "active" | "resolved";

export interface ElectionRecord {
  /** Deterministic: `${electionType}:${countryId}:${state ?? "-"}:c${cycle}`. */
  id: string;
  electionType: string;
  countryId: string;
  /** US state id for house/senate races; absent for national races. */
  state?: string | undefined;
  /** Senate class for US senate races. */
  senateClass?: 1 | 2 | 3 | undefined;
  cycle: number;
  status: ElectionStatus;
  startTurn: number;
  primaryEndTurn: number;
  endTurn: number;
  totalSeats: number;
  /** Chamber the winners are seated into. */
  chamberKey: string;
  candidates: ElectionCandidate[];
  /** candidate id -> accumulated votes. */
  tally: Record<string, number>;
  /** Full tally document for the ported accumulateVoteTurn (US races). */
  tallyState?: unknown;
  winners?: string[];
  resolvedTurn?: number;
}
