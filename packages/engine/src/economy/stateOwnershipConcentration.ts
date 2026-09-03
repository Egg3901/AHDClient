/**
 * State Ownership Concentration Index (SOCI) — solo port of
 * src/lib/nationalization/concentration.ts's pure math (clampConcentration,
 * sociMultiplier). A per-country 0-100 measure of state-owned corporate
 * revenue ÷ total national corporate revenue.
 *
 * PORT-STUB substitution, cited: mainline's live computation
 * (computeCountryStateOwnershipConcentration) sums every corp's
 * `countryOwnerId === countryId` sector revenue against the national total —
 * a per-corp nationalization/state-ownership flag AHDClient's Corporation type
 * does not carry (see corporation/types.ts; no nationalization action wave
 * has landed). W7's marketization dial already tracks the one form of
 * state-directed economic activity AHDClient models — `plannedShare`, the
 * fraction of a command economy's activity the plan governs — so this wave
 * uses `plannedShare(marketizationLevel) * 100` as the revenue-share proxy: a
 * fully-command country (RU/DD at their 1953 seed) reads a high SOCI, a
 * market country reads 0. The escalation multiplier (`sociMultiplier`) is
 * ported and exposed for a future nationalization-cost wave to consume; it
 * has no cost-channel consumer yet in solo.
 */

/** SOCI value at/below which the escalation multiplier is exactly 1.0. */
export const SOCI_DANGER_ZONE = 35;
/** Escalation multiplier at SOCI 100. */
export const CONCENTRATION_MULTIPLIER_MAX = 3.5;

/** Clamp any value into the SOCI range [0,100]; non-finite ⇒ 0. */
export function clampConcentration(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/**
 * Escalation multiplier (≥ 1.0). Exactly 1.0 at/below the danger zone, then a
 * convex (quadratic) ramp to CONCENTRATION_MULTIPLIER_MAX at SOCI 100 — early
 * takings barely escalate, empire-building bites hard.
 */
export function sociMultiplier(soci: number): number {
  const s = clampConcentration(soci);
  if (s <= SOCI_DANGER_ZONE) return 1;
  const span = 100 - SOCI_DANGER_ZONE;
  const t = (s - SOCI_DANGER_ZONE) / span;
  return 1 + (CONCENTRATION_MULTIPLIER_MAX - 1) * t * t;
}
