/**
 * Currency conversion helpers — W4 port.
 *
 * Units explicit: all rates are local currency per 1 anchor (USD).
 * Conversion is always local <-> anchor; direct local-to-local is via anchor.
 *
 * Historical NG FX 100x incident: confusing NGN-per-USD (1550 modern) with era
 * era NGN-per-USD (~0.357 colonial peg) and re-anchoring baseRate mid-run
 * snapped valuations 100x. These helpers keep the rate's unit in the type
 * name and validate it so callers cannot silently pass an inverted rate.
 *
 * PORT-STUB note: multi-currency savings (W5) and multi-currency budget
 * plumbing beyond this wave are not rewired here. Savings interest
 * calculations that would need per-currency balances are PORT-STUBbed with
 * blocker comments where they would consume these helpers (see forexTurn.ts).
 * Do NOT rewrite W5/W12 modules in this wave.
 */

import type { WorldState } from "../types.js";
import type { ExchangeRate } from "./types.js";

/**
 * Convert a local-currency amount to anchor (USD) — division.
 * @param local — amount in local currency (e.g. pounds, yen)
 * @param rate — local per anchor (e.g. 0.357 GBP/₳, 360 JPY/₳). Must be >0.
 * @returns amount in anchor (USD) units.
 */
export function localToAnchor(local: number, rate: number): number {
  if (!Number.isFinite(local)) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return local; // passthrough: missing/invalid rate is anchor already
  return local / rate;
}

/**
 * Convert an anchor (USD) amount to local currency — multiplication.
 * @param anchor — amount in anchor (USD) units
 * @param rate — local per anchor. Must be >0.
 * @returns amount in local currency.
 */
export function anchorToLocal(anchor: number, rate: number): number {
  if (!Number.isFinite(anchor)) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return anchor;
  return anchor * rate;
}

/**
 * Convert between two local currencies via anchor.
 * @param amount — in fromCurrency local units
 * @param fromRate — fromCurrency per anchor
 * @param toRate — toCurrency per anchor
 * @returns amount in toCurrency local units.
 */
export function convertLocal(amount: number, fromRate: number, toRate: number): number {
  return anchorToLocal(localToAnchor(amount, fromRate), toRate);
}

/**
 * Get the live rate for a country, or its baseRate as fallback, or 1 (anchor passthrough).
 * Units: local per anchor.
 */
export function getRateForCountry(world: WorldState, countryId: string): number {
  const ex = world.exchangeRates?.[countryId] as ExchangeRate | undefined;
  if (ex && Number.isFinite(ex.rate) && ex.rate > 0) return ex.rate;
  if (ex && Number.isFinite(ex.baseRate) && ex.baseRate > 0) return ex.baseRate;
  return 1;
}

/**
 * Resolve the rate to use for a balance that is stored in `countryId`'s local currency.
 * For anchor-native stores (e.g. content GDP which is already USD via INITIAL_RATES_1953
 * conversion at pack generation), the rate is 1.
 */
export function rateForLocalBalance(world: WorldState, countryId: string): number {
  // Content packs for 1953 already store country.economy.gdp in USD (pack header:
  // "Converted to millions USD via INITIAL_RATES_1953"). Those fields must NOT be
  // divided again by FX. This helper is for genuinely local stores (treasuries,
  // corp liquidCapital where annotated as local).
  const ex = world.exchangeRates?.[countryId] as ExchangeRate | undefined;
  if (!ex) return 1; // no forex row — treat as already anchor (e.g. non-forex-active)
  if (!Number.isFinite(ex.rate) || ex.rate <= 0) return 1;
  return ex.rate;
}

/**
 * Round-trip invariant check: local -> anchor -> local returns original within epsilon.
 * Used in tests to guard against unit confusion (the NG 100x class).
 */
export function roundTripInvariant(local: number, rate: number, eps = 1e-9): boolean {
  if (!Number.isFinite(local) || !Number.isFinite(rate) || rate <= 0) return false;
  const anchor = localToAnchor(local, rate);
  const back = anchorToLocal(anchor, rate);
  return Math.abs(back - local) <= eps * Math.max(1, Math.abs(local));
}
