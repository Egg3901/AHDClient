import type { EraId } from "./types.js";

export const START_DATE = "1953-01-06";
export const DAYS_PER_TURN = 7;

export function dateForTurn(turn: number): string {
  const start = Date.UTC(1953, 0, 6);
  const d = new Date(start + turn * DAYS_PER_TURN * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Add days to an ISO day string, returning ISO day. No Date.now, pure. */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  const out = new Date(d.getTime() + days * 86400000);
  return out.toISOString().slice(0, 10);
}

/**
 * Era thresholds.
 *
 * Shipped packs (1953, 1960) drive thresholds for those eras via their
 * startDate. Future eras (1968, 1976) keep hardcoded thresholds until
 * packs exist. Pack startDates are "1953-01-06" and "1960-01-05", so year
 * thresholds align. Data-driven lookup would be:
 *   find latest pack with startDate <= date, else earliest.
 * Until packs for 1968/1976 exist we preserve the full ladder explicitly.
 * This keeps the contract deterministic and avoids importing content here
 * to prevent a circular type boundary; engine/world.ts is the pack consumer.
 */
export function eraForDate(date: string): EraId {
  const year = Number(date.slice(0, 4));
  if (year >= 1976) return "1976";
  if (year >= 1968) return "1968";
  if (year >= 1960) return "1960";
  return "1953";
}
