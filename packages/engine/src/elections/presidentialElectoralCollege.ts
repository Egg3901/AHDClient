import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";

/**
 * Electoral College math (W24b) — winner-take-all per-state allocation and
 * the era's real electoral-vote apportionment, replacing the W24 nationwide
 * simplification.
 *
 * EV SOURCE: mainline's `src/lib/elections/apportionment.ts`
 * `electoralVotesFromSeats` (also ported verbatim, currently unwired, at
 * `packages/engine/src/electionEngine/resolution/apportionment.ts`) defines
 * EV = house seats + 2 senators per state, plus DC's 3 once the 23rd
 * Amendment is in force (from 1961), with Maine/Nebraska splitting into
 * congressional-district units from 1972/1992. For the 1953 content pack
 * (`packages/content/src/packs/usStates1953.ts`, sourced from mainline's
 * `HOUSE_SEATS_1953` / `ELECTORAL_VOTES_1953` — see
 * `packages/engine/src/electionEngine/resolution/constants.ts`, which holds
 * that exact 1953 table byte-for-byte for golden tests) none of DC, ME/NE
 * districting apply: DC is not a US state (no House seats, no electors
 * before 1961) and is absent from `world.regions` entirely; AK/HI are
 * absent too (territories until 1959, per that same source comment).
 * AHDClient also has no congressional-district entities at all — house races
 * are single per-state multi-seat contests (see `tallyAdapter.ts`
 * `stateSliceFor` / orchestration.ts's `state: r.id` house spec) — so the
 * ME/NE split has no structural home here even independent of the era gate.
 * This module therefore computes EV directly from each US region's live
 * `houseSeats` (+2 senators, no DC/ME-NE special-casing), which is simpler
 * than importing the ported-but-unwired apportionment.ts helpers and, for
 * every state AHDClient actually models, produces byte-identical output to
 * them: sum 435 house seats + 2×48 senators = 531 electoral votes,
 * majority = floor(531/2)+1 = 266.
 */

/** Electoral votes per US state, derived from live `houseSeats` (+2 senators). */
export function electoralVotesByState(world: WorldState, countryId: string): Record<string, number> {
  const ev: Record<string, number> = {};
  for (const region of Object.values(world.regions)) {
    if (region.countryId !== countryId) continue;
    const seats = region.houseSeats ?? 0;
    ev[region.id] = seats + 2;
  }
  return ev;
}

export interface ElectoralCollegeResult {
  /** candidate id -> electoral votes won. */
  evByCandidate: Record<string, number>;
  /** Total electoral votes actually allocated this cycle (college size). */
  totalEv: number;
  /** State-by-state winner, for display/debugging. */
  stateWinners: Record<string, string>;
}

/**
 * Winner-take-all EV allocation from the presidential race's per-state
 * cumulative tallies (`rec.stateTallyStates`, written by
 * `tallyAdapter.ts`'s `realAccumulatePresident`). Returns null when no
 * per-state tallies exist (real EC path never ran — either the accumulation
 * phase never ran, as in direct-resolution unit tests, or the world's
 * states lack demographics and the nationwide fallback ran instead) or when
 * every state fails to produce a winner (no votes cast anywhere).
 *
 * Tie-break: highest cumulative votes; an EXACT tie within a state resolves
 * alphabetically by candidate id. Mainline resolves the same exact-tie case
 * with a sha256 hash of the unit + tied candidate ids (deterministic, but
 * pulls in `node:crypto`, which the engine's Tauri/DOM/network/filesystem-free
 * module boundary — see docs/FRAMEWORK.md — has no other reason to import).
 * Alphabetical is equally deterministic and, at the vote scale a full
 * state's turnout produces, an exact tie is not realistically reachable —
 * documented simplification, not a behavior mainline players would notice.
 */
export function allocateElectoralVotes(world: WorldState, rec: ElectionRecord): ElectoralCollegeResult | null {
  const stateTallyStates = rec.stateTallyStates as Record<string, { totalVotes?: Record<string, number> }> | undefined;
  if (!stateTallyStates || Object.keys(stateTallyStates).length === 0) return null;

  const evByState = electoralVotesByState(world, rec.countryId);
  const evByCandidate: Record<string, number> = {};
  const stateWinners: Record<string, string> = {};
  let totalEv = 0;

  for (const stateId of Object.keys(stateTallyStates).sort((a, b) => a.localeCompare(b))) {
    const ev = evByState[stateId];
    if (!ev || ev <= 0) continue; // defensive: state has no live EV data (not a real region)

    const votes = stateTallyStates[stateId]?.totalVotes ?? {};
    const entries = Object.entries(votes)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const top = entries[0];
    if (!top) continue; // no votes cast in this state yet

    const winnerId = top[0];
    stateWinners[stateId] = winnerId;
    evByCandidate[winnerId] = (evByCandidate[winnerId] ?? 0) + ev;
    totalEv += ev;
  }

  if (totalEv === 0) return null;
  return { evByCandidate, totalEv, stateWinners };
}

/** Majority-of-the-actual-college threshold — never a hardcoded 270 (mainline's `electoralMajorityFor`). */
export function electoralMajorityFor(totalEv: number): number {
  if (!Number.isFinite(totalEv) || totalEv <= 0) return 0;
  return Math.floor(totalEv / 2) + 1;
}
