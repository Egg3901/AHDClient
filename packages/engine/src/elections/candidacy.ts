import type { WorldState } from "../types.js";
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

export function withdrawCandidacy(world: WorldState, electionId: string): CandidacyResult {
  const rec = world.elections.find((e) => e.id === electionId);
  if (!rec) return { ok: false, error: "Unknown election" };
  if (rec.status === "resolved") return { ok: false, error: "Election already resolved" };
  const idx = rec.candidates.findIndex((c) => c.id === "player");
  if (idx < 0) return { ok: false, error: "Not a candidate here" };
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
  return { ok: true };
}
