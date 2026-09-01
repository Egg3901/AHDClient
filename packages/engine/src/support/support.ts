/**
 * Candidate support decay and accrual.
 * Ports src/lib/turn/elections/supportDecay.ts and supportAccrual.ts.
 * Deterministic pure helpers; clamped to [0,100].
 */

import {
  DEFAULT_CANDIDATE_SUPPORT,
  RALLY_IMMEDIATE_SHARE,
  RALLY_SPREAD_TURNS,
  SUPPORT_DECAY_PER_TURN,
} from "./constants.js";

/**
 * Move value toward target by step, never overshooting.
 * Source: src/lib/turn/elections/supportDecay.ts regressToward
 */
export function regressToward(value: number, target: number, step: number): number {
  const delta = target - value;
  if (Math.abs(delta) <= step) return target;
  return value + Math.sign(delta) * step;
}

/**
 * One tick of support decay toward DEFAULT_CANDIDATE_SUPPORT.
 * Exported for golden-value tests.
 */
export function decaySupport(support: number): number {
  return regressToward(support, DEFAULT_CANDIDATE_SUPPORT, SUPPORT_DECAY_PER_TURN);
}

/**
 * Pure helper: compute new accrual list and delta from one tick.
 * Source: src/lib/turn/elections/supportAccrual.ts tickSupportAccrual
 */
export function tickSupportAccrual(
  accrual: Array<{ amountPerTurn: number; turnsRemaining: number }> | undefined,
): { newAccrual: Array<{ amountPerTurn: number; turnsRemaining: number }>; delta: number } {
  if (!accrual || accrual.length === 0) return { newAccrual: [], delta: 0 };
  let delta = 0;
  const newAccrual: Array<{ amountPerTurn: number; turnsRemaining: number }> = [];
  for (const entry of accrual) {
    if (!Number.isFinite(entry.amountPerTurn) || !Number.isFinite(entry.turnsRemaining)) continue;
    if (entry.turnsRemaining <= 0) continue;
    delta += entry.amountPerTurn;
    const nextRemaining = entry.turnsRemaining - 1;
    if (nextRemaining > 0) newAccrual.push({ amountPerTurn: entry.amountPerTurn, turnsRemaining: nextRemaining });
  }
  return { newAccrual, delta };
}

/**
 * Build one rally accrual entry from full-value R.
 * Source: src/lib/turn/elections/supportAccrual.ts buildRallyAccrualEntry
 */
export function buildRallyAccrualEntry(R: number): {
  immediateBump: number;
  entry: { amountPerTurn: number; turnsRemaining: number };
} {
  if (!Number.isFinite(R) || R <= 0) {
    return { immediateBump: 0, entry: { amountPerTurn: 0, turnsRemaining: 0 } };
  }
  const immediateBump = R * RALLY_IMMEDIATE_SHARE;
  const trailingTotal = R - immediateBump;
  const amountPerTurn = trailingTotal / RALLY_SPREAD_TURNS;
  return { immediateBump, entry: { amountPerTurn, turnsRemaining: RALLY_SPREAD_TURNS } };
}
