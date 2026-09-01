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
  /**
   * Running mate id (politician id or "player"), president races only.
   * Ports `ElectionCandidate.runningMateId` (src/lib/db/types/electionCandidate.ts).
   * PORT-STUB: no player-facing running-mate picker this wave, so player
   * presidential candidacies always carry an undefined running mate.
   */
  runningMateId?: string | undefined;
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
  /**
   * Per-state cumulative tally documents for the presidential general (W24b
   * real Electoral College port) — `stateId -> TallyInput` (same opaque
   * shape as `tallyState`, one independent accumulator per state). Absent
   * for every non-president race, and absent for president when the world's
   * states lack demographic tables — that absence is exactly what
   * `presidentialResolution.ts` reads as "run the nationwide-aggregate
   * fallback instead" (see that file's doc comment). Not schema-migrated: a
   * save file loaded mid-accumulation of an old-shape (nationwide-only)
   * presidential race simply starts per-state accumulation fresh for its
   * remaining turns — additive optional field, no crash, no invalid state,
   * self-resolves by the election's endTurn (see presidentialResolution.ts
   * for the full compatibility rationale; no SCHEMA_VERSION bump needed).
   */
  stateTallyStates?: Record<string, unknown>;
  winners?: string[];
  resolvedTurn?: number;
}
