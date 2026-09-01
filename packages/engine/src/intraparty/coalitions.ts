/**
 * Coalitions including disband votes.
 * Ports src/lib/turn/coalitionDisbandCheck.ts resolveExpiredDisbandVotes
 * and coalition chair sync via src/lib/coalitions/syncCoalitionChair.ts
 * with solo WorldState mutations.
 */

import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { CoalitionRecord } from "./types.js";
import { COALITION_DISBAND_VOTE_DURATION_TURNS } from "./constants.js";

export function ensureCoalitionsForWorld(world: WorldState): void {
  // No auto-creation; coalitions are player/NPC initiated. But ensure array exists.
  if (!world.coalitions) world.coalitions = [];
}

export function createCoalition(
  world: WorldState,
  params: { countryId: string; name: string; abbreviation: string; color?: string; founderPartyId: string },
): CoalitionRecord {
  if (!world.parties[params.founderPartyId]) throw new Error(`Unknown party ${params.founderPartyId}`);
  const seq = world.coalitions.length > 0 ? Math.max(...world.coalitions.map((c) => c.sequentialId)) + 1 : 1;
  const id = `coalition-${params.countryId}-${seq}`;
  const founderParty = world.parties[params.founderPartyId] as unknown as { chairId?: string | null } | undefined;
  const rec: CoalitionRecord = {
    id,
    sequentialId: seq,
    countryId: params.countryId,
    name: params.name,
    abbreviation: params.abbreviation,
    color: params.color ?? "#888888",
    memberPartyIds: [params.founderPartyId],
    chairPartyId: params.founderPartyId,
    chairCharacterId: (founderParty?.chairId as string | null) ?? null,
    disbandVote: null,
    createdAtTurn: world.meta.turn,
    updatedAtTurn: world.meta.turn,
  };
  world.coalitions.push(rec);
  // Mark party's coalitionId if field exists (we store on party as coalitionId stub)
  // PORT-STUB: mainline PoliticalParty.coalitionId is a ObjectId; solo stores on party extension if present
  const partyExt = world.parties[params.founderPartyId] as unknown as Record<string, unknown>;
  if (partyExt) partyExt["coalitionId"] = id;
  return rec;
}

export function joinCoalition(world: WorldState, coalitionId: string, partyId: string): void {
  const co = world.coalitions.find((c) => c.id === coalitionId);
  if (!co) throw new Error(`Unknown coalition ${coalitionId}`);
  if (!world.parties[partyId]) throw new Error(`Unknown party ${partyId}`);
  if (co.memberPartyIds.includes(partyId)) throw new Error("Party already in coalition");
  co.memberPartyIds.push(partyId);
  co.updatedAtTurn = world.meta.turn;
  const partyExt = world.parties[partyId] as unknown as Record<string, unknown>;
  if (partyExt) partyExt["coalitionId"] = co.id;
}

export function initiateDisbandVote(world: WorldState, coalitionId: string, initiatorPartyId: string): void {
  const co = world.coalitions.find((c) => c.id === coalitionId);
  if (!co) throw new Error(`Unknown coalition ${coalitionId}`);
  if (!co.memberPartyIds.includes(initiatorPartyId)) throw new Error("Initiator not in coalition");
  if (co.disbandVote) throw new Error("Disband vote already active");
  co.disbandVote = {
    initiatedByPartyId: initiatorPartyId,
    initiatedAtTurn: world.meta.turn,
    expiresOnTurn: world.meta.turn + COALITION_DISBAND_VOTE_DURATION_TURNS,
    votes: {},
  };
  co.updatedAtTurn = world.meta.turn;
}

export function voteDisband(world: WorldState, coalitionId: string, partyId: string, vote: "yes" | "no"): void {
  const co = world.coalitions.find((c) => c.id === coalitionId);
  if (!co) throw new Error(`Unknown coalition ${coalitionId}`);
  if (!co.disbandVote) throw new Error("No active disband vote");
  if (!co.memberPartyIds.includes(partyId)) throw new Error("Party not in coalition");
  co.disbandVote.votes[partyId] = vote;
  co.updatedAtTurn = world.meta.turn;
}

export function resolveExpiredDisbandVotes(world: WorldState, _rng: WorldRng): { resolved: number; disbanded: number } {
  const turn = world.meta.turn;
  let resolved = 0;
  let disbanded = 0;
  const toDelete: string[] = [];
  for (const co of world.coalitions) {
    if (!co.disbandVote) continue;
    if (co.disbandVote.expiresOnTurn > turn) continue;
    resolved++;
    const yesVotes = Object.values(co.disbandVote.votes).filter((v) => v === "yes").length;
    const totalMembers = co.memberPartyIds.length;
    const majorityThreshold = Math.floor(totalMembers / 2) + 1;
    if (yesVotes >= majorityThreshold) {
      // Disband: clear coalitionId on members, delete coalition
      for (const pid of co.memberPartyIds) {
        const partyExt = world.parties[pid] as unknown as Record<string, unknown> | undefined;
        if (partyExt && partyExt["coalitionId"] === co.id) delete partyExt["coalitionId"];
      }
      toDelete.push(co.id);
      world.news.push({
        turn: world.meta.turn,
        date: world.meta.date,
        headline: `Coalition "${co.name}" disbanded by majority vote (${yesVotes}/${totalMembers})`,
      });
      disbanded++;
    } else {
      co.disbandVote = null;
      co.updatedAtTurn = world.meta.turn;
      world.news.push({
        turn: world.meta.turn,
        date: world.meta.date,
        headline: `Coalition "${co.name}" disband vote failed (${yesVotes}/${totalMembers} yes)`,
      });
    }
  }
  if (toDelete.length > 0) {
    world.coalitions = world.coalitions.filter((c) => !toDelete.includes(c.id));
  }
  // Sync chairCharacterId drift: if coalition still exists but chair party's chair changed, sync
  for (const co of world.coalitions) {
    if (!co.chairPartyId) continue;
    const party = world.parties[co.chairPartyId] as unknown as { chairId?: string | null } | undefined;
    const currentChair = party?.chairId ?? null;
    if (co.chairCharacterId !== currentChair) {
      co.chairCharacterId = currentChair;
      co.updatedAtTurn = world.meta.turn;
    }
  }
  return { resolved, disbanded };
}
