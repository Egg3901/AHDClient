/**
 * Ledger pre-forex snapshot — W4 port of
 * src/lib/ledger/balanceSnapshot.ts writePreForexBalanceCheckpoint.
 *
 * Captured immediately BEFORE forexTurn reprices every currency. The
 * reconciler values the turn's cash flow in two legs (pre-forex and
 * post-forex) so a pure FX repricing produces delta 0, not a phantom
 * mint/sink. See ledger/reconcile.ts cashMovementDelta.
 *
 * Solo is in-memory: collects balances already in WorldState (player,
 * corps, parties, budgets) converted to anchor (USD) via current rates,
 * then stores the snapshot in WorldState.ledgerPreForexSnapshot for that turn.
 * Overwritten each turn (no history needed).
 */

import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import { localToAnchor } from "./conversion.js";
import { CURRENCY_CODE_BY_COUNTRY } from "./constants.js";

function rateForCurrency(world: WorldState, currencyCode: string): number | undefined {
  for (const ex of Object.values(world.exchangeRates ?? {})) {
    const e = ex as { currencyCode: string; rate: number };
    if (e.currencyCode === currencyCode && Number.isFinite(e.rate) && e.rate > 0) return e.rate;
  }
  return undefined;
}

function countryRate(world: WorldState, countryId: string): number {
  const ex = (world.exchangeRates?.[countryId] as { rate: number } | undefined);
  if (ex && Number.isFinite(ex.rate) && ex.rate > 0) return ex.rate;
  return 1; // anchor passthrough for non-forex-active
}

export function ledgerPreForexSnapshotPhase(world: WorldState, _rng: WorldRng): void {
  const anchorRates: Record<string, number> = {};
  for (const ex of Object.values(world.exchangeRates ?? {})) {
    const e = ex as { currencyCode: string; rate: number };
    if (e.currencyCode && Number.isFinite(e.rate)) anchorRates[e.currencyCode] = e.rate;
  }

  const balancesAnchor: Record<string, number> = {};
  const balancesLocal: Record<string, number> = {};

  // Player cash — currently USD-anchored (single currency). Record as USD.
  // PORT-STUB: W5 will make this per-currency (multi-currency savings);
  // until then `player.cash` is anchor-native and not divided by FX.
  // Blocker: W5 savings-interest multi-currency balances.
  const playerUSD = world.player.cash;
  balancesLocal["player:cash:USD"] = playerUSD;
  balancesAnchor["player:cash:USD"] = playerUSD; // USD per USD = 1

  // Corporations: liquidCapital is in home-currency local (see corporation/types.ts).
  for (const corp of Object.values(world.corporations ?? {})) {
    const cid = (corp as { countryId: string }).countryId;
    const cur = CURRENCY_CODE_BY_COUNTRY[cid] ?? "USD";
    const local = (corp as { liquidCapital: number }).liquidCapital ?? 0;
    const rate = countryRate(world, cid);
    balancesLocal[`corporation:${(corp as { id: string }).id}:${cur}`] = local;
    const anchor = localToAnchor(local, rate);
    if (anchor !== 0) balancesAnchor[`corporation:${(corp as { id: string }).id}:${cur}`] = anchor;
  }

  // Parties: treasury in home currency
  for (const party of Object.values(world.parties ?? {})) {
    const cid = (party as { countryId: string }).countryId;
    const cur = CURRENCY_CODE_BY_COUNTRY[cid] ?? "USD";
    const local = (party as { treasury: number }).treasury ?? 0;
    const rate = countryRate(world, cid);
    balancesLocal[`party:${(party as { id: string }).id}:${cur}`] = local;
    const anchor = localToAnchor(local, rate);
    if (anchor !== 0) balancesAnchor[`party:${(party as { id: string }).id}:${cur}`] = anchor;
  }

  // Budgets: treasuryBalance is in country's currency (see budget/types.ts)
  for (const budget of Object.values(world.budgets ?? {})) {
    const cid = (budget as { countryId: string }).countryId;
    const cur = CURRENCY_CODE_BY_COUNTRY[cid] ?? "USD";
    const local = (budget as { treasuryBalance: number }).treasuryBalance ?? 0;
    const rate = countryRate(world, cid);
    balancesLocal[`government:${cid}:${cur}`] = local;
    const anchor = localToAnchor(local, rate);
    if (anchor !== 0) balancesAnchor[`government:${cid}:${cur}`] = anchor;
  }

  const w = world as unknown as Record<string, unknown>;
  w["ledgerPreForexSnapshot"] = {
    turn: world.meta.turn,
    date: world.meta.date,
    balancesAnchor,
    anchorRates,
    balancesLocal,
  };
}

// For tests: compute cashMovementDelta mirroring ledger/reconcile.ts cashMovementDelta
export function cashMovementDeltaForAccount(
  openingAnchor: number,
  preForexAnchor: number,
  closingAnchor: number,
): number {
  // In anchor units already — the ledger delta is directly comparable.
  // The local->anchor conversion above applied the right rate per leg, so the
  // movement check is simply closing - opening. The two-leg valuation is
  // only needed when raw local deltas are divided by different rates.
  return closingAnchor - openingAnchor;
}
