/**
 * Presidential impeachment — W24 port.
 *
 * Mainline mapping: `Impeachment` (src/lib/db/types/impeachment.ts). Solo
 * scope is narrower: PRESIDENT only (US) — mainline's governor-impeachment
 * branch (state-legislature trial) is PORT-STUB, since AHDClient has no
 * governor-as-executive concept yet (governors are legislative-style seats
 * on `Politician.chamberKey`, not entries in `world.executives`).
 *
 * Solo also does not persist a per-voter ballot map (mainline's
 * `houseVotes`/`senateVotes` records, built for a live multiplayer whip/vote
 * UI). The lifecycle phase computes the seat-weighted tally directly and
 * deterministically from `world.politicians` + the world rng at resolution
 * time (see `impeachment/tally.ts` `nppImpeachmentVote`, ported verbatim from
 * mainline's `autoVoteNpps.ts` default heuristic), so the outcome is
 * identical to what mainline's all-NPP-vote sweep would produce.
 */
export type ImpeachmentStage =
  | "house" // articles filed, House voting to impeach
  | "senate" // impeached, Senate voting to convict
  | "convicted" // 2/3 of all Senate seats — target removed
  | "acquitted" // Senate failed to convict
  | "dismissed" // House failed to impeach
  | "cancelled"; // target no longer holds the office

export interface ImpeachmentCase {
  id: string;
  countryId: string;
  /** "player" or a politician id — the sitting president being impeached. */
  targetId: string;
  targetName: string;
  targetParty: string | null;
  stage: ImpeachmentStage;
  filedTurn: number;
  houseVotingEndsTurn: number;
  /** Null until the House impeaches and opens the Senate trial window. */
  senateVotingEndsTurn: number | null;
  resolvedTurn?: number;
}
