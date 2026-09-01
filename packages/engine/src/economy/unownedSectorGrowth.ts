/**
 * Unowned sector growth — solo port of the PRE-PLANTS branch of
 * src/lib/turn/unownedSectorGrowth.ts processUnownedSectorGrowth (the plants-
 * tier branch needs per-state CorporateSector capital stock / headroom units
 * Rotunda's single-sector-per-country Corporation model does not carry — see
 * corporation/types.ts file doc; W9 collapsed mainline's Corporation +
 * CorporateSector into one record with no plants fields at all).
 *
 * An unowned sector's revenue grows at HALF the growthRate of the same
 * (country, sector) corporate sector (1%/yr fallback when there is no corp),
 * floored at 0 — a downsizing corp slows the unowned pool's growth, it never
 * makes it contract (untapped market opportunity cannot un-happen because one
 * company shrank).
 */
import { GROWTH_RATE_TURNS_PER_YEAR } from "../corporation/constants.js";

const FALLBACK_GROWTH_RATE = 1; // %/yr, source: unownedSectorGrowth.ts FALLBACK_GROWTH_RATE

/**
 * Grow one unowned-sector revenue pool by one turn.
 * @param corpGrowthRatePct the paired corp's `currentGrowthRate` (%/yr), or
 *        undefined when the sector has no corp (uses the 1%/yr fallback).
 */
export function growUnownedSectorRevenue(
  currentRevenue: number,
  corpGrowthRatePct: number | undefined,
  turnsPerYear: number = GROWTH_RATE_TURNS_PER_YEAR,
): number {
  const rawAnnualRate =
    typeof corpGrowthRatePct === "number" && Number.isFinite(corpGrowthRatePct)
      ? corpGrowthRatePct * 0.5
      : FALLBACK_GROWTH_RATE;
  const annualRate = Math.max(0, rawAnnualRate);
  const perTurnRate = annualRate / turnsPerYear;
  const currentRevenueSafe = Number.isFinite(currentRevenue) ? currentRevenue : 0;
  return Math.max(0, Math.round(currentRevenueSafe * (1 + perTurnRate / 100)));
}
