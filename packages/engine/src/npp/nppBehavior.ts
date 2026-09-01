/**
 * Unified NPP Turn Behavior (W37).
 * Port of src/lib/turn/nppBehavior.ts processNPPTurn (mainline) adapted to WorldState.
 *
 * Mainline consolidates:
 * - Election entry (deterministic priority-based) — PORT-STUB in solo (blocked system: elections/orchestration.ts, operator active)
 * - Bill voting (ideology + whip) — ported here as active bill voting
 * - Slate follow-through + endorsement cleanup — PORT-STUB (blocked: slate/endorsement subsystem not in solo)
 *
 * This phase therefore implements the bill-voting half of nppBehavior, plus a
 * lightweight endorsement cleanup (withdraw stale endorsements where endorser
 * party != endorsed). Election entry remains PORT-STUB with system named.
 *
 * Source: src/lib/turn/nppBehavior.ts + src/lib/turn/npp/billVoting.ts + stateBillVoting.ts
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";

function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

function voteForBill(pol: WorldState["politicians"][number], bill: WorldState["bills"][number], turn: number, seed: string): "for" | "against" | "abstain" {
  const sponsorParty = bill.sponsorPartyId;
  const polParty = pol.partyId;
  const r = hashUnit(`${seed}:${pol.id}:${bill.id}:${turn}:vote`);
  // Same party as sponsor: high for
  if (sponsorParty && polParty === sponsorParty) {
    if (r < 0.85) return "for";
    if (r < 0.95) return "against";
    return "abstain";
  }
  if (sponsorParty && polParty !== sponsorParty) {
    if (r < 0.25) return "for";
    if (r < 0.85) return "against";
    return "abstain";
  }
  if (r < 0.4) return "for";
  if (r < 0.8) return "against";
  return "abstain";
}

export const nppBehaviorPhase: TurnPhase = {
  name: "nppBehavior",
  run(world: WorldState, _rng: WorldRng) {
    // PORT-STUB: election entry — blocked system `elections/orchestration.ts` (operator active)
    // No NPP election filing in this wave; solo elections handle candidacy via elections/phases.ts.

    // Bill voting: for each active bill, eligible NPPs vote
    const activeStatuses = new Set(["active", "active_other"]);
    for (const bill of world.bills) {
      if (!activeStatuses.has(bill.status)) continue;
      const chamberKey = bill.currentChamber;
      const countryId = bill.countryId;

      const eligible = world.politicians.filter(
        (p) => p.countryId === countryId && p.chamberKey === chamberKey,
      );
      // Sort for determinism
      eligible.sort((a, b) => a.id.localeCompare(b.id));

      const voteMap = bill.status === "active_other" ? (bill.otherChamberVotes ??= {}) : bill.votes;

      for (const pol of eligible) {
        if (voteMap[pol.id] !== undefined) continue; // already voted
        // 85% chance to vote this turn (some abstain by not voting yet) — deterministic
        if (hashUnit(`${world.meta.seed}:${pol.id}:${bill.id}:${world.meta.turn}:turnout`) < 0.15) continue;
        const vote = voteForBill(pol, bill, world.meta.turn, world.meta.seed);
        voteMap[pol.id] = vote;
      }
    }

    // Endorsement cleanup: withdraw stale npp-like endorsements where endorser
    // is a politician whose party no longer matches endorsed's party.
    // Mirrors mainline's processNppEndorsements withdrawal of stale rows.
    for (const e of world.endorsements) {
      if (!e.active) continue;
      if (e.endorserId === "player") continue; // player sweep handled elsewhere
      const endorser = world.politicians.find((p) => p.id === e.endorserId);
      if (!endorser) continue;
      if (e.endorsedType === "politician") {
        const endorsed = world.politicians.find((p) => p.id === e.endorsedId);
        if (endorsed && e.endorsedPartyId && e.endorsedPartyId !== endorser.partyId) {
          // Endorser changed party → stale endorsement withdrawn
          e.active = false;
        } else if (endorser.partyId !== endorsed?.partyId && endorsed) {
          // Cross-party endorsement after switch → withdraw (deterministic 30% chance)
          if (hashUnit(`${world.meta.seed}:${e.id}:${world.meta.turn}`) < 0.3) e.active = false;
        }
      } else if (e.endorsedType === "party" && e.endorsedId !== endorser.partyId) {
        // Endorser left the endorsed party → withdraw if mismatched
        if (e.endorserPartyId && e.endorserPartyId !== endorser.partyId) {
          e.active = false;
        }
      }
    }
  },
};
