/**
 * NPP Relationship Maintenance phase.
 * Port of src/lib/turn/partyOrg/caucusRelationshipMaintenance.ts
 * processCaucusRelationshipMaintenance (mainline).
 *
 * Two jobs:
 * 1) Drift every stored NPP↔character relationship back toward neutral so
 *    one-time interactions do not grant permanent caucus/slate access.
 * 2) Apply lower caucus-retention threshold after that drift so caucus
 *    membership is harder to earn than it is to keep, but still dissolves
 *    when the chair lets the relationship decay too far.
 *
 * Constants:
 * - NPP_RELATIONSHIP_DECAY_PER_TURN = 0.1 (src/lib/constants/partyOrg.ts)
 * - CAUCUS_NPP_RETENTION_MIN_RELATIONSHIP = 20 (same file)
 *
 * Determinism: pure, no rng.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";

const DECAY = 0.1;
const RETENTION_MIN = 20;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function decayScore(score: number): number {
  if (score > 0) return round1(Math.max(0, score - DECAY));
  if (score < 0) return round1(Math.min(0, score + DECAY));
  return 0;
}

export const nppRelationshipMaintenancePhase: TurnPhase = {
  name: "nppRelationshipMaintenance",
  run(world: WorldState, _rng: WorldRng) {
    // Decay all stored relationships toward 0
    for (const key of Object.keys(world.nppRelationships)) {
      const rel = world.nppRelationships[key];
      if (!rel) continue;
      const next = decayScore(rel.score);
      if (next !== rel.score) {
        rel.score = next;
        rel.updatedAtTurn = world.meta.turn;
      }
    }

    // Apply retention threshold: caucus membership dissolves when relationship
    // with chair < RETENTION_MIN. In mainline this checks nppRelationships
    // keyed `${chairId}_${memberId}` against caucus.chairId. In solo we
    // key `${caucusId}:${memberId}` and treat missing as 0 (neutral => below
    // threshold, so neglected links dissolve).
    // For solo, chair is first memberId in caucus.memberIds or the caucus
    // party's most senior politician; we use memberIds[0] as chair proxy.
    for (const caucus of world.caucuses) {
      if (caucus.disbandedAt !== null) continue;
      const chairId = caucus.memberIds[0];
      if (!chairId) continue;
      const toRemove: string[] = [];
      for (const memberId of caucus.memberIds) {
        if (memberId === chairId) continue; // chair keeps self
        // Try both key shapes for compatibility
        const key1 = `${chairId}:${memberId}`;
        const key2 = `${caucus.id}:${memberId}`;
        const rel = world.nppRelationships[key1] ?? world.nppRelationships[key2];
        const score = rel?.score ?? 0;
        if (score < RETENTION_MIN) toRemove.push(memberId);
      }
      if (toRemove.length > 0) {
        caucus.memberIds = caucus.memberIds.filter((id) => !toRemove.includes(id));
        // Also clear world.politicians who had caucus? Solo has no per-politician factionId,
        // but player caucusId is analogous — not needed for NPCs.
      }
    }
  },
};
