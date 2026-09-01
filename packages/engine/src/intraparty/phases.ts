/**
 * Intra-party phases for turn pipeline.
 * Placed at END before newsMaintenance per brief, with ordering-deviation comment.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import { rngFromSeed } from "../rng.js";
import {
  createMissingStatePartyElections,
  resolveStatePartyElections,
} from "./statePartyElections.js";
import {
  createMissingNationalPartyElections,
  resolveNationalPartyElections,
} from "./nationalPartyElections.js";
import {
  createMissingCommitteeElections,
  resolveCommitteeElections,
} from "./nationalCommitteeElections.js";
import { resolveExpiredDisbandVotes } from "./coalitions.js";

/**
 * State party elections: mirrors src/lib/statePartyElections.ts
 * createMissingElections (72-turn cycle) + processCompletedElections.
 * Turn-based resolution only; no Date fallback (see that file's wall-clock removal note).
 */
function forkRng(rng: WorldRng, label: string, turn: number): WorldRng {
  // Fork without consuming main rng state: derive seed from current rng state + label + turn
  const s = rng.state();
  const seed = `${s[0]}:${s[1]}:${s[2]}:${s[3]}:${label}:${turn}`;
  return rngFromSeed(seed);
}

export const statePartyElectionsPhase: TurnPhase = {
  name: "statePartyElections",
  run(world: WorldState, rng: WorldRng) {
    const fork = forkRng(rng, "statePartyElections", world.meta.turn);
    // Resolve before creating so completed slots free up for next cycle on same turn
    resolveStatePartyElections(world, fork);
    createMissingStatePartyElections(world, fork);
  },
};

/**
 * National party leadership: src/lib/nationalPartyElections.ts
 * createMissingNationalElections (72-turn, custom override) + processCompletedNationalElections
 * with quorum acceleration omitted as PORT-STUB (requires eligible-voter denominator logic).
 */
export const nationalPartyElectionsPhase: TurnPhase = {
  name: "nationalPartyElections",
  run(world: WorldState, rng: WorldRng) {
    const fork = forkRng(rng, "nationalPartyElections", world.meta.turn);
    resolveNationalPartyElections(world, fork);
    createMissingNationalPartyElections(world, fork);
  },
};

/**
 * National committee: src/lib/nationalCommitteeElections.ts
 * COMMITTEE_ELECTION_DURATION_TURNS=168, COMMITTEE_SIZE=6
 */
export const nationalCommitteeElectionsPhase: TurnPhase = {
  name: "nationalCommitteeElections",
  run(world: WorldState, rng: WorldRng) {
    const fork = forkRng(rng, "nationalCommitteeElections", world.meta.turn);
    resolveCommitteeElections(world, fork);
    createMissingCommitteeElections(world, fork);
  },
};

/**
 * Coalition disband votes: src/lib/turn/coalitionDisbandCheck.ts resolveExpiredDisbandVotes
 * Majority threshold floor(total/2)+1; turn-first expiry.
 */
export const coalitionDisbandPhase: TurnPhase = {
  name: "coalitionDisband",
  run(world: WorldState, rng: WorldRng) {
    const fork = forkRng(rng, "coalitionDisband", world.meta.turn);
    resolveExpiredDisbandVotes(world, fork);
  },
};

/**
 * PORT-STUB for congress leadership elections that would require
 * src/lib/congress/leadershipElections.ts chamber seat scopes (ElectedOfficial collection,
 * senateComposition/houseComposition). Solo has no per-chamber seat maps beyond
 * legislatures.composition, so congress leadership is not yet modeled.
 * This stub keeps the phase name reserved while documenting the blocker.
 * No state mutation.
 */
export const leadershipElectionsPhase: TurnPhase = {
  name: "leadershipElections",
  run(_world: WorldState, _rng: WorldRng) {
    // PORT-STUB blocked on: chamber seat scope (ElectedOfficial) + leadership role policy (src/lib/congress/leadership/rolePolicy.ts)
  },
};
