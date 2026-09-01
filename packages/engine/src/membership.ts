/**
 * Party membership helpers.
 * Ports mainline party membership seams:
 * - src/app/api/country/[code]/parties/[id]/join/route.ts
 * - src/app/api/country/[code]/parties/[id]/leave/route.ts
 * - src/lib/parties/applyCharacterPartyJoin.ts
 * - src/lib/parties/antiAbuseGuards.ts PARTY_SWITCH_COOLDOWN_MS -> 24 turns (1 turn = 1 hour)
 * - src/lib/constants/partyActions.ts PURGE_REJOIN_COOLDOWN_TURNS = 24
 * - Charter founding: src/lib/charters/draftCharter.ts + ratifyCharter.ts (3-founder draft, 14-turn expiry)
 *   For solo we collapse to immediate ratify: foundParty creates a Party row + ratified Charter.
 */

import type { WorldState, Party, PartyCharter, PurgeRejoinBlock } from "./types.js";

export const PARTY_SWITCH_COOLDOWN_TURNS = 24; // cites PARTY_SWITCH_COOLDOWN_MS 24*60*60*1000
export const PURGE_REJOIN_COOLDOWN_TURNS = 24; // cites src/lib/constants/partyActions.ts
export const CHARTER_DEADLINE_TURNS = 14; // cites src/lib/charters/charterDeadlines.ts
export const FOUND_PARTY_FUND_COST = 100_000; // cited as mainline-neutral founder cost (corp founding 1M; party cheaper)
export const FOUND_PARTY_ACTION_COST = 8;

export function isPartyMember(player: WorldState["player"]): boolean {
  return player.partyId != null;
}

export function getSwitchCooldownRemaining(player: WorldState["player"], currentTurn: number): number {
  const anchor = player.lastPartySwitchTurn;
  if (anchor == null) return 0;
  const remaining = anchor + PARTY_SWITCH_COOLDOWN_TURNS - currentTurn;
  return remaining > 0 ? remaining : 0;
}

export function getPurgeBlockRemaining(
  player: WorldState["player"],
  partyId: string,
  countryId: string,
  currentTurn: number,
): number {
  const blocks = player.purgeRejoinBlocks ?? [];
  const match = blocks.find((b) => b.partyId === partyId && b.countryId === countryId);
  if (!match) return 0;
  const rem = match.purgedAtTurn + PURGE_REJOIN_COOLDOWN_TURNS - currentTurn;
  return rem > 0 ? rem : 0;
}

export function prunePurgeRejoinBlocks(blocks: PurgeRejoinBlock[] | undefined, currentTurn: number): PurgeRejoinBlock[] {
  if (!blocks || blocks.length === 0) return [];
  return blocks.filter((b) => b.purgedAtTurn + PURGE_REJOIN_COOLDOWN_TURNS > currentTurn);
}

export type JoinResult = { ok: true } | { ok: false; error: string };

export function canJoinParty(world: WorldState, partyId: string): JoinResult {
  const player = world.player;
  const party = world.parties[partyId];
  if (!party) return { ok: false, error: `Party not found: ${partyId}` };
  if (party.countryId !== player.countryId) {
    return { ok: false, error: `Party ${partyId} belongs to ${party.countryId}, player is in ${player.countryId}` };
  }
  if (player.partyId === partyId) return { ok: false, error: `Already a member of ${partyId}` };
  const cooldown = getSwitchCooldownRemaining(player, world.meta.turn);
  if (cooldown > 0) return { ok: false, error: `Party switch cooldown: ${cooldown} turn(s) remaining` };
  const purgeRem = getPurgeBlockRemaining(player, partyId, party.countryId, world.meta.turn);
  if (purgeRem > 0) return { ok: false, error: `Purged from ${partyId}: ${purgeRem} turn(s) remaining` };
  return { ok: true };
}

export function joinParty(world: WorldState, partyId: string): JoinResult {
  const check = canJoinParty(world, partyId);
  if (!check.ok) return check;
  const player = world.player;
  const oldPartyId = player.partyId;
  // Decrement old party memberCount if leaving
  if (oldPartyId) {
    const old = world.parties[oldPartyId];
    if (old) old.memberCount = Math.max(0, (old.memberCount ?? 1) - 1);
    // Clear old caucus membership (same as leave)
    if (player.caucusId) {
      const oldCaucus = world.caucuses.find((c) => c.id === player.caucusId);
      if (oldCaucus) oldCaucus.memberIds = oldCaucus.memberIds.filter((id) => id !== "player");
      player.caucusId = null;
    }
  }
  // Prune expired purge blocks and clear block for this party
  player.purgeRejoinBlocks = prunePurgeRejoinBlocks(player.purgeRejoinBlocks, world.meta.turn).filter(
    (b) => !(b.partyId === partyId && b.countryId === world.parties[partyId]!.countryId),
  );
  player.partyId = partyId;
  player.partyJoinedTurn = world.meta.turn;
  player.lastPartySwitchTurn = world.meta.turn;
  player.politicalInfluence = 0; // reset per applyCharacterPartyJoin partyInfluence:0
  const party = world.parties[partyId]!;
  party.memberCount = (party.memberCount ?? 0) + 1;
  // Sweep endorsements that become misaligned (primary-phase rule simplified: any cross-party endorsement while active)
  sweepEndorsementsOnPartyChange(world, player.partyId, oldPartyId);
  return { ok: true };
}

export function canLeaveParty(world: WorldState): JoinResult {
  if (world.player.partyId == null) return { ok: false, error: "Not a member of any party" };
  return { ok: true };
}

export function leaveParty(world: WorldState): JoinResult {
  const check = canLeaveParty(world);
  if (!check.ok) return check;
  const player = world.player;
  const oldPartyId = player.partyId!;
  const party = world.parties[oldPartyId];
  if (party) party.memberCount = Math.max(0, (party.memberCount ?? 1) - 1);
  // Clear caucus membership (mirrors src/app/api/country/[code]/parties/[id]/leave/route.ts caucus cleanup)
  if (player.caucusId) {
    const caucus = world.caucuses.find((c) => c.id === player.caucusId);
    if (caucus) caucus.memberIds = caucus.memberIds.filter((id) => id !== "player");
    player.caucusId = null;
  }
  player.partyId = null;
  player.partyJoinedTurn = null;
  // lastPartySwitchTurn intentionally NOT cleared (hop escape prevention, see leave route comment)
  player.politicalInfluence = 0;
  sweepEndorsementsOnPartyChange(world, null, oldPartyId);
  return { ok: true };
}

export type FoundPartyInput = {
  name: string;
  abbreviation: string;
  economicPosition?: number;
  socialPosition?: number;
  color?: string;
};

export function canFoundParty(world: WorldState, input: FoundPartyInput): JoinResult {
  const player = world.player;
  if (!input.name || input.name.trim().length < 2) return { ok: false, error: "Party name too short" };
  if (!input.abbreviation || input.abbreviation.trim().length < 2) return { ok: false, error: "Abbreviation too short" };
  const abbrUpper = input.abbreviation.trim().toUpperCase();
  // Uniqueness within country (mirrors draftCharter name/abbr taken checks)
  for (const p of Object.values(world.parties)) {
    if (p.countryId !== player.countryId) continue;
    if (p.name.toLowerCase() === input.name.trim().toLowerCase()) return { ok: false, error: `Party name taken: ${input.name}` };
    if (p.abbreviation.toUpperCase() === abbrUpper) return { ok: false, error: `Abbreviation taken: ${abbrUpper}` };
  }
  for (const ch of world.charters) {
    if (ch.countryId !== player.countryId) continue;
    if (ch.status !== "draft" && ch.status !== "pending-signatures" && ch.status !== "founder-replacement") continue;
    // Charter proposedName/Abbr not stored in our minimal PartyCharter; skip
  }
  const cooldown = getSwitchCooldownRemaining(player, world.meta.turn);
  if (cooldown > 0) return { ok: false, error: `Party switch cooldown: ${cooldown} turn(s) remaining` };
  if (player.funds < FOUND_PARTY_FUND_COST) return { ok: false, error: `Not enough funds. Need ${FOUND_PARTY_FUND_COST}` };
  return { ok: true };
}

export function foundParty(world: WorldState, input: FoundPartyInput): { ok: true; partyId: string } | { ok: false; error: string } {
  const check = canFoundParty(world, input);
  if (!check.ok) return check as { ok: false; error: string };
  const player = world.player;
  const abbrUpper = input.abbreviation.trim().toUpperCase();
  const baseId = `${player.countryId}_${abbrUpper}`;
  let partyId = baseId;
  let suffix = 1;
  while (world.parties[partyId]) {
    partyId = `${baseId}_${suffix++}`;
  }
  const econ = input.economicPosition ?? 0;
  const social = input.socialPosition ?? 0;
  const color = input.color ?? "#888888";
  const party: Party = {
    id: partyId,
    name: input.name.trim(),
    countryId: player.countryId,
    abbreviation: abbrUpper,
    color,
    economicPosition: Math.max(-5, Math.min(5, econ)),
    socialPosition: Math.max(-5, Math.min(5, social)),
    treasury: 0,
    politicalStrength: 0,
    organization: 0,
    tier: "minor",
    psCapEarnedRegions: [],
    memberCount: 0,
    isDefault: false,
  };
  world.parties[partyId] = party;
  // Charter machinery (W18): create a ratified charter marking this founding
  const charter: PartyCharter = {
    id: `charter-${partyId}-${world.meta.turn}`,
    countryId: player.countryId,
    partyId,
    status: "ratified",
    expiresOnTurn: null,
    expiresAt: null,
    founderReplacementDeadlineTurn: null,
    founderReplacementDeadline: null,
  };
  world.charters.push(charter);
  // Deduct funds
  player.funds -= FOUND_PARTY_FUND_COST;
  // Auto-join founder (mirrors ratifyCharter joining founders)
  const oldPartyId = player.partyId;
  if (oldPartyId) {
    const old = world.parties[oldPartyId];
    if (old) old.memberCount = Math.max(0, (old.memberCount ?? 1) - 1);
    if (player.caucusId) {
      const oldCaucus = world.caucuses.find((c) => c.id === player.caucusId);
      if (oldCaucus) oldCaucus.memberIds = oldCaucus.memberIds.filter((id) => id !== "player");
      player.caucusId = null;
    }
  }
  player.partyId = partyId;
  player.partyJoinedTurn = world.meta.turn;
  player.lastPartySwitchTurn = world.meta.turn;
  player.politicalInfluence = 0;
  party.memberCount = 1;
  // Purge blocks pruned
  player.purgeRejoinBlocks = prunePurgeRejoinBlocks(player.purgeRejoinBlocks, world.meta.turn);
  sweepEndorsementsOnPartyChange(world, partyId, oldPartyId);
  return { ok: true, partyId };
}

// Sweep misaligned endorsements on party change.
// Simplified primary-phase rule: if endorser is player and endorsement active,
// and endorsed party/politician's party differs from endorser's new party,
// withdraw it. Mirrors withdrawPlayerEndorsementsOnPartyChange for solo.
function sweepEndorsementsOnPartyChange(world: WorldState, newPartyId: string | null, oldPartyId: string | null): void {
  if (oldPartyId === newPartyId) return;
  for (const e of world.endorsements) {
    if (!e.active) continue;
    if (e.endorserId !== "player") continue;
    // If newParty null (independent), all party-aligned endorsements become misaligned if they were party-specific
    // We withdraw if endorsedPartyId != newPartyId
    if (e.endorsedPartyId == null) continue;
    if (e.endorsedPartyId !== newPartyId) {
      // Reverse support bump if politician endorsement
      if (e.endorsedType === "politician" && e.supportBump) {
        const cs = world.candidateSupports[e.endorsedId];
        if (cs) cs.support = Math.max(0, Math.min(100, cs.support - e.supportBump));
      }
      e.active = false;
    }
  }
}

export function sweepPartyMismatchedEndorsements(world: WorldState): number {
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
