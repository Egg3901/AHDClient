/**
 * Rolling earnings window feeding the earnings-power term of the share-price
 * formula — W10. Verbatim port.
 * Source: src/lib/turn/corporation/earningsRollingAverage.ts.
 */
import { FUNDAMENTAL_ROLLING_AVG_TURNS } from "./constants.js";

/**
 * Appends `newValue` (an annualized after-tax net-income figure) to the
 * earnings history and trims to the rolling window. Returns a new array;
 * does not mutate the input.
 */
export function pushEarningsHistory(history: readonly number[] | undefined, newValue: number): number[] {
  const next = [...(history ?? []), newValue];
  return next.slice(-FUNDAMENTAL_ROLLING_AVG_TURNS);
}

/**
 * Arithmetic mean of the history entries, or 0 if empty. This is
 * `normalizedEarnings` in the earnings-power formula component.
 */
export function normalizedEarningsFromHistory(history: readonly number[]): number {
  if (history.length === 0) return 0;
  return history.reduce((sum, v) => sum + v, 0) / history.length;
}
