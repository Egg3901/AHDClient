import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";
import { findBlockingActiveCandidacy } from "../electionEngine/resolution/activeCandidacy.js";
import { ensureCampaign, archiveCampaign } from "../campaigns/lifecycle.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";

export interface CandidacyResult {
  ok: boolean;
  error?: string;
}

/**
 * Player candidacy (W21c). Mainline: declare during the filing window
 * (before primaryEndTurn), one active candidacy at a time
 * (activeCandidacy.findBlockingActiveCandidacy). Party membership is required
 * for the party ballot line; independent runs are a later port
 * (PORT-STUB: mainline independent candidacies not yet wired).
 */
export function declareCandidacy(world: WorldState, electionId: string): CandidacyResult {
  const rec = world.elections.find((e) => e.id === electionId);
  if (!rec) return { ok: false, error: "Unknown election" };
  if (rec.status === "resolved") return { ok: false, error: "Election already resolved" };
  if (world.meta.turn > rec.primaryEndTurn) return { ok: false, error: "Filing window closed (primary ended)" };
  if (rec.countryId !== world.player.countryId) return { ok: false, error: "Wrong country" };
  const partyId = world.player.partyId;
  if (!partyId) return { ok: false, error: "Party membership required for the ballot line" };
  if (rec.candidates.some((c) => c.id === "player")) return { ok: false, error: "Already a candidate here" };

  const candidateRows = world.elections
    .filter((e) => e.candidates.some((c) => c.id === "player"))
    .map((e) => ({ _id: `player:${e.id}`, electionId: e.id, characterId: "player", status: "active" as const }));
  const electionRows = world.elections.map((e) => ({ _id: e.id, status: e.status, countryId: e.countryId }));
  const blocking = findBlockingActiveCandidacy(candidateRows, electionRows, "player", rec.id);
  if (blocking) return { ok: false, error: `Active candidacy in ${blocking.election._id}` };

  rec.candidates.push({
    id: "player",
    name: world.player.name,
    partyId,
    isNPP: false,
    incumbent:
      world.player.legislativeSeat != null &&
      world.player.legislativeSeat.chamberKey === rec.chamberKey &&
      world.player.legislativeSeat.countryId === rec.countryId,
  });
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `You declare for the ${rec.state ? `${rec.state} ` : ""}${rec.electionType} race`,
  });
  // W26: create the player's campaign (no-op for non-eligible races).
  if (isCampaignEligibleElection(rec)) {
    ensureCampaign(world, {
      electionId: rec.id,
      candidateId: "player",
      candidateIsNPP: false,
      partyId,
      countryId: rec.countryId,
      electionType: rec.electionType,
      turn: world.meta.turn,
    });
  }
  return { ok: true };
}

/**
 * Shared removal: strip the player's candidacy row, tally entry, frozen
 * per-state EC totals, and campaign. Factored out of withdrawCandidacy so
 * sweepCandidaciesOnPartyChange (W22) can reuse the exact same cleanup.
 */
function removePlayerCandidacy(world: WorldState, rec: ElectionRecord): void {
  const idx = rec.candidates.findIndex((c) => c.id === "player");
  if (idx < 0) return;
  rec.candidates.splice(idx, 1);
  delete rec.tally["player"];
  // W24b: also purge the player's frozen per-state EC entries — without one
  // more accumulation turn to naturally drop them (accumulateVoteTurn only
  // carries forward candidates still in `rec.candidates`), a withdrawal on
  // the final pre-resolution turn would otherwise leave a stale winning
  // per-state tally on the board for a candidate no longer in the race.
  if (rec.stateTallyStates) {
    for (const state of Object.values(rec.stateTallyStates) as Array<{ totalVotes?: Record<string, number> }>) {
      if (state?.totalVotes) delete state.totalVotes["player"];
    }
  }
  archiveCampaign(world, rec.id, "player");
}

export function withdrawCandidacy(world: WorldState, electionId: string): CandidacyResult {
  const rec = world.elections.find((e) => e.id === electionId);
  if (!rec) return { ok: false, error: "Unknown election" };
  if (rec.status === "resolved") return { ok: false, error: "Election already resolved" };
  if (!rec.candidates.some((c) => c.id === "player")) return { ok: false, error: "Not a candidate here" };
  removePlayerCandidacy(world, rec);
  return { ok: true };
}

/**
 * W22 leftover: candidate-party mismatch sweep. Ports mainline's
 * `sweepPartyMismatchedCandidates` (src/lib/utils/electionCandidacy.ts:450-556),
 * live every turn via the `candidatePartySweep` turn phase
 * (turnPhaseRegistry.ts:1041-1047, right after `withdrawInactiveCandidates`):
 * "withdraw any active election candidate whose current party no longer
 * matches the party on their candidacy record."
 *
 * Solo's only producer of a mid-campaign party change is the player
 * (joinParty/leaveParty/foundParty in membership.ts — NPC politicians never
 * change party after creation; there is no NPC-facing switch action, so
 * mainline's character-defection half of this sweep has nothing to trigger
 * it here). Rather than an unconditional per-turn scan, this is called
 * directly at those three call sites (mirrors the existing
 * `sweepEndorsementsOnPartyChange` idiom in membership.ts) — the resulting
 * world state is identical to a per-turn scan (every unresolved election is
 * already re-checked the instant the mismatch is created) without an extra
 * O(elections) pass every turn.
 */
export function sweepCandidaciesOnPartyChange(world: WorldState, newPartyId: string | null): void {
  for (const rec of world.elections) {
    if (rec.status === "resolved") continue;
    const cand = rec.candidates.find((c) => c.id === "player");
    if (cand && cand.partyId !== newPartyId) {
      removePlayerCandidacy(world, rec);
    }
  }
}

/**
 * W22 leftover assessment: the two remaining mainline candidate-lifecycle
 * phases from the roadmap list (docs/ROADMAP-1.0.md W22) are N/A for solo,
 * not merely unported — recorded here so a future reader does not re-open
 * them as a gap:
 *
 * - `withdrawInactiveCandidates` (src/lib/turn/withdrawInactiveCandidates.ts)
 *   withdraws the active candidacies of players inactive >96 turns, keyed
 *   off `activeUserIds` (other users' last-seen timestamps). This exists,
 *   per its own file doc, because other human players exist — the exact
 *   "N/A for singleplayer" reasoning ROADMAP-1.0.md already applies to
 *   activityLogging/altDetection/etc. Solo has exactly one human player and
 *   no user-activity table; there is nothing for this phase to query.
 * - `staleCandidateCleanup` (`cleanupStaleElectionCandidates`,
 *   src/lib/turn/perpetualElections.ts:929-949) is mainline's own file doc:
 *   "Safety net for pre-existing data and edge cases in the normal
 *   resolution path" — it withdraws any `electionCandidates` row still
 *   `status: "active"` on an election whose status has already flipped to
 *   "completed", a state that can only arise there because mainline writes
 *   election status and candidacy status as separate documents/collections
 *   that can desync. Solo's `ElectionRecord.candidates` carries no per-
 *   candidate status field at all (see elections/types.ts) — `applyResolution`
 *   (orchestration.ts) mutates `rec.status` to "resolved" and prunes/seats
 *   candidates in the same synchronous pass, and every reader that matters
 *   (`runVoteAccumulation`, `fillCandidates`) already gates on
 *   `rec.status === "active"`. The desync class mainline's safety net
 *   guards against cannot occur here by construction, so there is no
 *   `world.elections`-shaped bug for a port of this phase to fix.
 *
 * UPDATE (batch merge, W40 fallout): the desync argument above still holds,
 * but staleCandidateCleanup's POPULATION effect (dropping generated
 * candidates who hold nothing) turned out to be load-bearing once W40's
 * subnational chambers multiplied races: ex-holders displaced by a later race
 * they were not candidates in were never culled (3.8k orphans at t700). That
 * effect is now ported as `cullOrphanedGenerated` (orchestration.ts), run at
 * every resolution. Only `withdrawInactiveCandidates` remains N/A.
 */
