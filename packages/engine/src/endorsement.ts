/**
 * Endorsement helpers.
 * Ports mainline endorsement model:
 * - src/lib/electionEngine/electionFormulaFactors.ts SUPPORT_ENDORSEMENT_BUMP = 3
 * - src/app/api/elections/[id]/endorse/route.ts (B3 landing bump)
 * - src/lib/turn/elections/supportEvents.ts applyEndorsementSupportBump
 * - src/lib/elections/playerEndorsements.ts withdrawPlayerEndorsementsOnPartyChange + sweepPartyMismatchedPlayerEndorsements
 *
 * Solo endorsements are in-memory Endorsement[] on WorldState, not DB rows.
 * Effects: active endorsement contributes +3 support to candidateSupports[endorsedId]
 * when endorsedType=politician; party endorsements contribute no direct support but
 * are sweepable. Sweep withdraws misaligned endorsements on party switch and each turn.
 */

import type { WorldState, Endorsement } from "./types.js";

export const SUPPORT_ENDORSEMENT_BUMP = 3; // cites src/lib/electionEngine/electionFormulaFactors.ts
export const ENDORSE_ACTION_COST = 2;

export function canEndorse(world: WorldState, endorsedId: string, endorsedType: "party" | "politician"): { ok: true } | { ok: false; error: string } {
  if (!world.player.partyId) return { ok: false, error: "Must be a party member to endorse" };
  if (endorsedType === "party") {
    if (!world.parties[endorsedId]) return { ok: false, error: `Party not found: ${endorsedId}` };
  } else {
    const pol = world.politicians.find((p) => p.id === endorsedId);
    if (!pol) return { ok: false, error: `Politician not found: ${endorsedId}` };
  }
  // One active endorsement per endorser per target (mainline unique index)
  const existing = world.endorsements.find((e) => e.active && e.endorserId === "player" && e.endorsedId === endorsedId);
  if (existing) return { ok: false, error: "Already endorsed this target" };
  return { ok: true };
}

export function endorse(world: WorldState, endorsedId: string, endorsedType: "party" | "politician"): { ok: true; endorsementId: string } | { ok: false; error: string } {
  const check = canEndorse(world, endorsedId, endorsedType);
  if (!check.ok) return check as { ok: false; error: string };
  const player = world.player;
  let endorsedPartyId: string | null = null;
  if (endorsedType === "party") endorsedPartyId = endorsedId;
  else {
    const pol = world.politicians.find((p) => p.id === endorsedId)!;
    endorsedPartyId = pol.partyId;
  }
  const id = `endorse-${world.meta.turn}-${world.endorsements.length}`;
  const e: Endorsement = {
    id,
    endorserId: "player",
    endorsedId,
    endorsedType,
    countryId: player.countryId,
    turn: world.meta.turn,
    active: true,
    supportBump: SUPPORT_ENDORSEMENT_BUMP,
    endorsedPartyId,
    endorserPartyId: player.partyId,
  };
  world.endorsements.push(e);
  // Apply support bump immediately (B3)
  if (endorsedType === "politician") {
    const cs = world.candidateSupports[endorsedId];
    if (cs) cs.support = Math.max(0, Math.min(100, cs.support + SUPPORT_ENDORSEMENT_BUMP));
  } else {
    // Party endorsement: bump favorability of player slightly (+1) as proxy for favorability effect
    player.favorability = Math.min(100, player.favorability + 1);
  }
  return { ok: true, endorsementId: id };
}

export function withdrawEndorsement(world: WorldState, endorsementId: string): { ok: true } | { ok: false; error: string } {
  const e = world.endorsements.find((x) => x.id === endorsementId);
  if (!e) return { ok: false, error: `Endorsement not found: ${endorsementId}` };
  if (e.endorserId !== "player") return { ok: false, error: "Not your endorsement" };
  if (!e.active) return { ok: false, error: "Endorsement already inactive" };
  // Reverse bump
  if (e.endorsedType === "politician" && e.supportBump) {
    const cs = world.candidateSupports[e.endorsedId];
    if (cs) cs.support = Math.max(0, Math.min(100, cs.support - e.supportBump));
  }
  e.active = false;
  return { ok: true };
}

export function sweepEndorsements(world: WorldState): number {
  let withdrawn = 0;
  const playerParty = world.player.partyId;
  for (const e of world.endorsements) {
    if (!e.active) continue;
    if (e.endorserId !== "player") continue;
    if (e.endorsedPartyId == null) continue;
    if (e.endorsedPartyId !== playerParty) {
      if (e.endorsedType === "politician" && e.supportBump) {
        const cs = world.candidateSupports[e.endorsedId];
        if (cs) cs.support = Math.max(0, Math.min(100, cs.support - e.supportBump));
      }
      e.active = false;
      withdrawn++;
    }
  }
  return withdrawn;
}
