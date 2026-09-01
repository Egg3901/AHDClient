import type { EraId } from "./types.js";

/**
 * One turn = one in-game week. This is a deliberate solo divergence from
 * mainline's real-time server cadence: solo advances on demand, so the
 * turn-to-time mapping is a design constant, not a scheduler artifact.
 */
export const START_DATE = "1953-01-06";
export const DAYS_PER_TURN = 7;

export function dateForTurn(turn: number): string {
  const start = Date.UTC(1953, 0, 6);
  const d = new Date(start + turn * DAYS_PER_TURN * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Era thresholds by in-game year, mirroring mainline's era ladder. */
export function eraForDate(date: string): EraId {
  const year = Number(date.slice(0, 4));
  if (year >= 1976) return "1976";
  if (year >= 1968) return "1968";
  if (year >= 1960) return "1960";
  return "1953";
}
