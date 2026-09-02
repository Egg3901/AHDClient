/**
 * Player savings actions — W35.
 *
 * Ports the three savings-management endpoints W12 (private banking) shipped
 * state for (player.savings/savingsHolder) but never wired a player-facing
 * action to move: src/app/api/character/savings/deposit/route.ts (+ its
 * withdraw sibling) and src/app/api/character/savings-holder/route.ts
 * moveCharacterSavings. Cited directly in W12's own file doc (types.ts
 * PlayerCharacter.savingsHolder): "No in-game action currently moves this
 * away from centralBank... the mechanism is real and tested even though it
 * is only reachable via a save edit or cheat today." This wave closes that
 * gap with real actions.
 *
 * Solo simplification (cited): mainline's moveCharacterSavings is
 * multi-currency (per-currency savings buckets) and validates a target
 * bank's charter currency match + blacklist. Solo's player.savings is a
 * single-currency pool (see PlayerCharacter.savings file doc — solo has no
 * per-character currency wallets), so the currency-match check is
 * structurally inapplicable; the blacklist is PORT-STUB (banking/types.ts
 * file doc already cuts blacklist entirely — "Prop trading, interbank, CB
 * margin, discount window, charter switching, Regulation Q, supervision and
 * loan approval are out of scope"). What IS ported: target must be
 * "centralBank" or an ACTIVE deposit-taking bank charter, and a move into a
 * private bank is capped by its cached depositCeiling (bankingTurn.ts
 * recomputes this each turn) — moving away from a bank (including to
 * "centralBank") is always allowed, mirroring mainline's own asymmetry.
 */
import type { WorldState } from "../types.js";

export type SavingsActionResult = { ok: true } | { ok: false; error: string };

/** Move liquid cash into savings. Ports the deposit route's core balance move. */
export function depositToSavings(world: WorldState, amount: number): SavingsActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid amount" };
  const player = world.player;
  if (player.cash < amount) return { ok: false, error: `Insufficient cash. Available: ${player.cash}` };
  player.cash -= amount;
  player.savings += amount;
  return { ok: true };
}

/** Move savings back into liquid cash. Ports the withdraw route's core balance move. */
export function withdrawFromSavings(world: WorldState, amount: number): SavingsActionResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid amount" };
  const player = world.player;
  if (player.savings < amount) return { ok: false, error: `Insufficient savings. Available: ${player.savings}` };
  player.savings -= amount;
  player.cash += amount;
  return { ok: true };
}

/**
 * Move the savings pointer to a new holder. Ports moveCharacterSavings
 * validation (charter status + deposit ceiling), scoped to solo's
 * single-currency player.savings.
 */
export function moveSavingsHolder(world: WorldState, holder: string): SavingsActionResult {
  const player = world.player;
  if (holder === "centralBank") {
    player.savingsHolder = "centralBank";
    return { ok: true };
  }
  const bank = world.corporations[holder];
  if (!bank) return { ok: false, error: "Bank corporation not found" };
  if (!bank.bankCharter || bank.bankCharter.status !== "active") {
    return { ok: false, error: "Target bank must have an active deposit-taking charter" };
  }
  if (player.savingsHolder !== holder) {
    const ceiling = bank.bankCharter.depositCeiling;
    const projected = bank.bankCharter.totalDeposits + player.savings;
    if (projected > ceiling) {
      return { ok: false, error: `${bank.tickerSymbol}'s deposit capacity is full (ceiling ${ceiling.toLocaleString()})` };
    }
  }
  player.savingsHolder = holder;
  return { ok: true };
}
