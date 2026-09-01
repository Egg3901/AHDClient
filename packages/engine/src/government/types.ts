/**
 * Parliamentary government state (W23).
 *
 * Ports the persisted shape of mainline's `GovernmentFormation`
 * (src/lib/db/types/governmentFormation.ts, collection `governmentFormations`,
 * `_id` = countryId — the CURRENT/live schema). Mainline also carries a
 * legacy `ParliamentaryGovernment` type (src/lib/db/types/parliamentaryGovernment.ts,
 * collection `parliamentaryGovernments`) that is dead: nothing in the live
 * turn pipeline writes it any more (only read as a one-time fallback by
 * `ukGovernmentFormation.ts`'s `seedGovernmentFormation`). Not ported.
 *
 * Solo collapses mainline's three-state status enum
 * ("pending" | "formed" | "collapsed") to two: mainline's `unformGovernmentAndVacatePM`
 * always writes "pending" in the same call that would otherwise pass through
 * "collapsed" (governmentFormation.ts status transitions never leave a
 * government sitting in "collapsed" across a turn boundary), so "collapsed"
 * is a same-tick transient never observed by a phase — solo skips straight
 * to "pending".
 */
export type GovernmentFormationStatus = "pending" | "formed";

/**
 * Mainline formation types: "majority" | "coalition" | "minority" | "admin".
 * "admin" (caretaker/administrator government, seeded for some countries at
 * world start rather than won by election) is PORT-STUB: solo worlds always
 * start countries with a seeded chamber composition that already resolves
 * through the ordinary majority/coalition/minority path at first formation,
 * so no country ever needs an "admin" caretaker at t0.
 */
export type GovernmentFormationType = "majority" | "coalition" | "minority" | null;

/**
 * Confidence bands, ported verbatim from mainline's OPS ruling-party
 * confidence thresholds (src/lib/onePartyState/rulingPartyConfidence.ts
 * CONFIDENCE_BANDS: secure>=80, stable>=65, watchful>=50, strained>=35,
 * crisis>=20, critical<20). Mainline scopes this system to one-party states
 * (CN/RU/DD) by default, gated by `hasLeaderConfidenceModel`; solo applies
 * the same numeric model uniformly to every government (UK included) since
 * solo has no separate "UK confidence gauge" consequence system to keep
 * distinct — mainline's own UK gauge (src/lib/uk/confidence/confidenceGauge.ts)
 * is documented as persistence-only with no gameplay effect until an unshipped
 * flag, so folding it into the one shared numeric model loses nothing real.
 */
export type ConfidenceBand = "secure" | "stable" | "watchful" | "strained" | "crisis" | "critical";

export interface GovernmentState {
  countryId: string;
  /** The elected chamber this government answers to (UK "commons", RU "sovietOfTheUnion", DD "volkskammer"). */
  chamberKey: string;
  status: GovernmentFormationStatus;
  formationType: GovernmentFormationType;
  /** Party id governing alone, or the largest coalition partner. Null while pending. */
  governingPartyId: string | null;
  /** All coalition member party ids (including governingPartyId) when formationType is "coalition"; null otherwise. */
  coalitionPartyIds: string[] | null;
  /** Politician id of the PM (or RU/DD equivalent head of government). Null while pending. */
  pmPoliticianId: string | null;
  /** Snapshot of seats held by the governing party/coalition at formation/last recompute. */
  totalSeatsSupporting: number;
  /** floor(totalSeats/2)+1, per src/lib/turn/lowerChamberSeats.ts lowerChamberMajorityThreshold. */
  majorityThreshold: number;
  totalSeats: number;
  /** Snapshot of the chamber's seatsByParty as of the last formation/recompute. */
  seatsByParty: Record<string, number>;
  /**
   * Set when a formed majority/coalition government's supporting seats fall
   * below majorityThreshold. Ports mainline's `lostMajority` field
   * (parliamentaryGovernment.ts updateParliamentaryGovernmentSeats): a flag
   * only, never minority governments (those are expected to run without a
   * majority), and never itself collapses the government — mainline's
   * comment is explicit that only a won no-confidence vote does that.
   */
  lostMajority: boolean;
  formedTurn: number | null;
  /**
   * Ports SNAP_ELECTION_LIMIT (2 per PM appointment, reset on each new
   * formation) and lastSnapElectionTurn (SNAP_ELECTION_COOLDOWN_TURNS = 336).
   * src/lib/turn/snapElection.ts:49-50.
   */
  snapElectionsUsed: number;
  lastSnapElectionTurn: number | null;
  /**
   * Turn by which a "pending" government must seat a PM or an auto-snap
   * fires. Ports PM_VACANCY_DEADLINE_TURNS = 96
   * (src/lib/constants/turnTime.ts:198), (re)armed to currentTurn+96 whenever
   * status enters "pending" (post-election, post-snap — mirrors mainline's
   * pmVacancyDeadline.ts re-arm points; solo has no interactive no-confidence
   * vote to also re-arm from, see phases.ts file doc).
   */
  pmVacancyDeadlineTurn: number | null;
  /**
   * 0-95 ruling-party/PM confidence. Ports INITIAL_CONFIDENCE=75,
   * RENEWAL_BUMP=+5, MIN=0, MAX=95 (rulingPartyConfidence.ts:11-34). Set to
   * 75 on a new PM's first formation; +5 (clamped 95) when the same PM's
   * government re-forms after resolving a chamber election. PORT-STUB: the
   * real per-turn drift (computeTurnDrift over policyCategories/purgeEvents,
   * rulingPartyConfidenceTurn.ts) has no solo input surface yet (no purge or
   * policy-alignment events wired to countries) so it does not decay/drift
   * per turn here — it only moves at formation events, and is exposed for a
   * future consequence system to read.
   */
  confidence: number;
}
