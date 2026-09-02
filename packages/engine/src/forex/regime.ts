/**
 * Bretton Woods peg regime — W4 port.
 *
 * Mainline models 1953 as a managed-peg world (Bretton Woods: USD-pegged par
 * values, ±1% bands, adjustable only by IMF consent). The peg is the defining
 * 1953 mechanic — a 1953 world must NOT float like a modern one. Bretton
 * Woods collapsed with the 1971 Nixon Shock, so the 1979/1991/2019 packs
 * (all >= 1971) float — the generic numeric-year fallback below already
 * handles this correctly with no per-preset entry needed (see
 * monetaryEra.ts: 1953 anchors hold until 1971, monetary/brettonWoods.ts
 * BW_EARLIEST_EXIT_YEAR 1968).
 *
 * Port decision (cited):
 *  - Regime is derived from world.meta.era (the seed preset era), not from
 *    the current in-game year. This mirrors mainline's `getInitialRates(preset)`
 *    seeding rule (preset-keyed anchor, see forexTurn.ts) — a world keeps its
 *    seeded Bretton Woods par for life; graduation flows through monetary
 *    baselines, not a re-anchoring of FX. Era crossing (eraCrossing.ts) does
 *    not re-seed FX.
 *  - 1953 era => pegged (managed). The legacy fabricated "1960" era (only
 *    reachable on an old save — see packs/index.ts and calendar.ts) also
 *    stays pegged via the same numeric-year fallback (1960 < 1971). Any era
 *    >= 1971 is floating, which is what 1979/1991/2019 all resolve to.
 *  - Hard peg target is baseRate (the seeded parity). Intervention is not
 *    modelled as tradable reserves (no CB reserve book yet — W3 is prime-rate
 *    only, no forexRevenue/reserveBalance), so the peg holds by clamping rather
 *    than by spending reserves. A future wave with reserve accounting can replace
 *    the clamp with intervention math.
 */

import { BRETTON_WOODS_BAND, PEGGED_DRIFT_DAMPEN } from "./constants.js";
import type { ExchangeRate } from "./types.js";

export type FxRegime = "pegged" | "floating";

/**
 * Resolve the regime for a world era.
 * Pure and era-deterministic; no RNG.
 */
export function regimeForEra(era: string): FxRegime {
  // Bretton Woods peg holds until 1971 (Nixon Shock). "1953" is explicit;
  // "1960" is kept only because it can still appear as a legacy era on an
  // old save (see calendar.ts) and 1960 genuinely predates the 1971
  // collapse. Every other era, including the shipped 1979/1991/2019 packs,
  // resolves through the numeric-year fallback below (1979/1991/2019 are
  // all >= 1971, so they float — no per-preset entry needed).
  if (era === "1953" || era === "1960") return "pegged";
  const y = Number.parseInt(era, 10);
  if (Number.isFinite(y) && y < 1971) return "pegged";
  return "floating";
}

/**
 * Band width for a regime — ±fraction of baseRate inside which the rate may
 * move without triggering a peg break. Pegged = 1% (BW band), floating = 50%
 * guardrail (currencies.ts RATE_FLOOR/CEILING). Used by forexTurn clamping.
 */
export function bandForRegime(regime: FxRegime): number {
  if (regime === "pegged") return BRETTON_WOODS_BAND;
  return 0.5; // guardrail is ±50% (0.5x to 1.5x baseRate)
}

/** Drift dampening for pegged regime — fundamentals bite slower under a peg. */
export function driftMultiplierForRegime(regime: FxRegime): number {
  if (regime === "pegged") return PEGGED_DRIFT_DAMPEN;
  return 1;
}

/**
 * Clamp a rate to the regime's band around baseRate.
 * Pegged: [base*(1-BAND), base*(1+BAND)] inside the guardrail.
 * Floating: [base*0.5, base*1.5] (the guardrail itself).
 */
export function clampToRegimeBand(rate: number, baseRate: number, regime: FxRegime): number {
  if (!Number.isFinite(rate) || !Number.isFinite(baseRate) || baseRate <= 0) return rate;
  const band = bandForRegime(regime);
  const floor = baseRate * (1 - band);
  const ceiling = baseRate * (1 + band);
  // For pegged, floor/ceiling are already inside guardrail; for floating they equal guardrail.
  // Guard the arithmetic: pegged floor must stay >= base*0.5 guardrail.
  const guardFloor = baseRate * 0.5;
  const guardCeiling = baseRate * 1.5;
  const clampedFloor = Math.max(floor, guardFloor);
  const clampedCeiling = Math.min(ceiling, guardCeiling);
  return Math.max(clampedFloor, Math.min(clampedCeiling, rate));
}

/**
 * Whether this exchange-rate doc should be held at its peg this turn.
 * Command economies are non-convertible pegs always (src/lib/constants/commandEconomy.ts
 * isCommandEconomy + MARKETIZATION_SCHEDULE). Solo has no commandEconomyEnabled flag
 * this wave (always market), so only the pegged regime triggers a hold — but the
 * helper is isolated so W7 can later wire command-economy peg without touching
 * the clamp logic.
 */
export function shouldHoldPeg(rateDoc: ExchangeRate, regime: FxRegime): boolean {
  if (rateDoc.currencyCode === "SUR" || rateDoc.currencyCode === "DDM") {
    // GDR and Soviet bloc currencies are administered, non-convertible pegs in 1953
    // (see currencies.ts: RU 9 SUR/USD, DD 4.2 DDM/USD are Western-estimate bases,
    // not market rates, and commandEconomy.ts MARKETIZATION_SCHEDULE holds them
    // at level 10 through 1990-91). Always pegged in the 1953 era regardless of
    // the global regime.
    return true;
  }
  return regime === "pegged";
}
