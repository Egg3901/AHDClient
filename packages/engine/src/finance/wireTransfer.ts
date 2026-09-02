/**
 * International/personal wire transfers — W35.
 *
 * Ports src/app/api/characters/[id]/wire/route.ts core transfer + quota
 * logic. The player wires personal `cash` to another politician's `cash`
 * (see types.ts Politician.cash file doc for why that field exists).
 *
 * Solo simplifications (cited):
 *  - No per-character currency wallets (see PlayerCharacter.savings file
 *    doc — solo's forex system, W4, lives at the country/exchange-rate
 *    level, not on individual characters). Mainline's forex-enabled branch
 *    (cross-border wire, currency travels with the transfer, no FX
 *    conversion) needs those wallets; solo therefore always takes mainline's
 *    PRE-forex branch: same-country transfers only. PORT-STUB, blocked on
 *    per-character currency wallets.
 *  - NEW_CHARACTER_TRANSFER_BARRIER_TURNS (24-turn anti-abuse window on a
 *    freshly created character) is not ported: it exists to stop a
 *    multiplayer economy's fresh-account money-laundering vector, and solo
 *    has exactly one persistent player character with no analogous
 *    multi-account surface.
 *  - The daily wire cap IS ported, turn-windowed the same way
 *    PARTY_SWITCH_COOLDOWN_MS became a 24-turn window elsewhere on
 *    PlayerCharacter (24h -> 24 turns at the established 1-turn-per-hour
 *    convention).
 */
import type { WorldState } from "../types.js";

// Source: src/app/api/characters/[id]/wire/route.ts DAILY_WIRE_CAP_ANCHORS.
export const DAILY_WIRE_CAP_ANCHOR = 50_000_000;
// Source: same file, WIRE_QUOTA_WINDOW_MS = 24h -> 24 turns (see file doc).
export const WIRE_QUOTA_WINDOW_TURNS = 24;

export type WireTransferResult = { ok: true; recipientName: string } | { ok: false; error: string };

export function wireTransfer(world: WorldState, targetPoliticianId: string, amount: number): WireTransferResult {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return { ok: false, error: "Invalid amount" };
  }
  const target = world.politicians.find((p) => p.id === targetPoliticianId);
  if (!target) return { ok: false, error: "Recipient not found" };

  const player = world.player;
  // PORT-STUB: forex-enabled cross-border wire needs per-character currency
  // wallets (see file doc) — solo always takes mainline's pre-forex branch.
  if (target.countryId !== player.countryId) {
    return { ok: false, error: "You cannot wire funds to politicians from other countries" };
  }
  if (player.cash < amount) {
    return { ok: false, error: `Insufficient cash. Available: ${player.cash}` };
  }

  const turn = world.meta.turn;
  const windowFresh =
    player.wireQuotaWindowStartTurn != null && turn - player.wireQuotaWindowStartTurn < WIRE_QUOTA_WINDOW_TURNS;
  const quotaUsed = windowFresh ? player.wireQuotaUsedAnchor : 0;
  if (quotaUsed + amount > DAILY_WIRE_CAP_ANCHOR) {
    const remaining = Math.max(0, DAILY_WIRE_CAP_ANCHOR - quotaUsed);
    return { ok: false, error: `Daily wire limit reached. ${remaining.toLocaleString()} remaining in your quota.` };
  }

  if (windowFresh) {
    player.wireQuotaUsedAnchor = quotaUsed + amount;
  } else {
    player.wireQuotaUsedAnchor = amount;
    player.wireQuotaWindowStartTurn = turn;
  }

  player.cash -= amount;
  target.cash += amount;
  world.news.push({
    turn,
    date: world.meta.date,
    headline: `You wire ${amount.toLocaleString()} to ${target.name}.`,
  });
  return { ok: true, recipientName: target.name };
}
