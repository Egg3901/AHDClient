/**
 * Caucus lifecycle helpers.
 * Ports mainline caucus semantics:
 * - src/lib/db/types/caucus.ts (Caucus, CaucusMembership)
 * - src/app/api/country/[code]/parties/[id]/caucuses/route.ts (found)
 * - src/app/api/country/[code]/parties/[id]/caucuses/[slug]/members/route.ts (join/leave)
 * - src/lib/caucus/cleanupCaucusParticipationForCharacters.ts
 * - taxRate 0-5% (src/lib/db/types/caucus.ts taxRate 0–5)
 */

import type { WorldState, Caucus } from "./types.js";

export const CAUCUS_TAX_MAX = 5; // cites Caucus.taxRate 0–5
export const CAUCUS_CREATE_FUND_COST = 25_000;
export const CAUCUS_CREATE_ACTION_COST = 4;
export const CAUCUS_JOIN_ACTION_COST = 2;
export const CAUCUS_LEAVE_ACTION_COST = 1;

export type CaucusResult = { ok: true; caucusId?: string } | { ok: false; error: string };

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function canCreateCaucus(world: WorldState, name: string, _partyId?: string): CaucusResult {
  const player = world.player;
  if (!player.partyId) return { ok: false, error: "Must be a party member to create a caucus" };
  if (player.caucusId) return { ok: false, error: "Already in a caucus; leave it first" };
  if (!name || name.trim().length < 3) return { ok: false, error: "Caucus name too short" };
  const slug = slugify(name);
  if (!slug) return { ok: false, error: "Invalid caucus name" };
  const partyId = _partyId ?? player.partyId;
  if (partyId !== player.partyId) return { ok: false, error: "Can only create a caucus in your own party" };
  // Unique slug among active caucuses within (countryId, partyId)
  for (const c of world.caucuses) {
    if (c.disbandedAt !== null) continue;
    if (c.countryId === player.countryId && c.partyId === partyId && slugify(c.name) === slug) {
      return { ok: false, error: `Caucus slug taken: ${slug}` };
    }
  }
  if (player.funds < CAUCUS_CREATE_FUND_COST) return { ok: false, error: `Not enough funds. Need ${CAUCUS_CREATE_FUND_COST}` };
  return { ok: true };
}

export function createCaucus(world: WorldState, name: string, taxRate = 0): CaucusResult {
  const check = canCreateCaucus(world, name);
  if (!check.ok) return check;
  const player = world.player;
  const partyId = player.partyId!;
  if (taxRate < 0 || taxRate > CAUCUS_TAX_MAX) return { ok: false, error: `taxRate must be 0-${CAUCUS_TAX_MAX}` };
  const id = `caucus-${slugify(name)}-${world.meta.turn}-${world.caucuses.length}`;
  const caucus: Caucus = {
    id,
    countryId: player.countryId,
    partyId,
    name: name.trim(),
    treasury: 0,
    taxRate,
    disbandedAt: null,
    memberIds: ["player"],
  };
  world.caucuses.push(caucus);
  player.caucusId = id;
  player.funds -= CAUCUS_CREATE_FUND_COST;
  return { ok: true, caucusId: id };
}

export function canJoinCaucus(world: WorldState, caucusId: string): CaucusResult {
  const player = world.player;
  if (!player.partyId) return { ok: false, error: "Must be a party member to join a caucus" };
  if (player.caucusId) return { ok: false, error: "Already in a caucus; leave it first" };
  const caucus = world.caucuses.find((c) => c.id === caucusId);
  if (!caucus) return { ok: false, error: `Caucus not found: ${caucusId}` };
  if (caucus.disbandedAt !== null) return { ok: false, error: "Caucus is disbanded" };
  if (caucus.countryId !== player.countryId) return { ok: false, error: "Caucus country mismatch" };
  if (caucus.partyId !== player.partyId) return { ok: false, error: "Caucus party mismatch; must be same party" };
  return { ok: true };
}

export function joinCaucus(world: WorldState, caucusId: string): CaucusResult {
  const check = canJoinCaucus(world, caucusId);
  if (!check.ok) return check;
  const caucus = world.caucuses.find((c) => c.id === caucusId)!;
  if (!caucus.memberIds.includes("player")) caucus.memberIds.push("player");
  world.player.caucusId = caucusId;
  return { ok: true, caucusId };
}

export function canLeaveCaucus(world: WorldState): CaucusResult {
  if (!world.player.caucusId) return { ok: false, error: "Not in a caucus" };
  return { ok: true };
}

export function leaveCaucus(world: WorldState): CaucusResult {
  const check = canLeaveCaucus(world);
  if (!check.ok) return check;
  const caucusId = world.player.caucusId!;
  const caucus = world.caucuses.find((c) => c.id === caucusId);
  if (caucus) caucus.memberIds = caucus.memberIds.filter((id) => id !== "player");
  world.player.caucusId = null;
  return { ok: true };
}

export function setCaucusTaxRate(world: WorldState, caucusId: string, taxRate: number): CaucusResult {
  const caucus = world.caucuses.find((c) => c.id === caucusId);
  if (!caucus) return { ok: false, error: `Caucus not found: ${caucusId}` };
  if (caucus.disbandedAt !== null) return { ok: false, error: "Caucus is disbanded" };
  if (world.player.caucusId !== caucusId) return { ok: false, error: "Only members can set caucus tax rate" };
  if (taxRate < 0 || taxRate > CAUCUS_TAX_MAX) return { ok: false, error: `taxRate must be 0-${CAUCUS_TAX_MAX}` };
  caucus.taxRate = taxRate;
  return { ok: true };
}
