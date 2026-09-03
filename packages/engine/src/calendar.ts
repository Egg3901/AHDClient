import type { EraId } from "./types.js";
import { PACKS_BY_DATE } from "@ahdclient/content";

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
 * Era thresholds, data-driven from the shipped pack registry: find the
 * latest pack whose startDate <= date, else the earliest pack. `world.ts`
 * already imports `@ahdclient/content` from this package with no cycle
 * (content never imports engine), so there is no boundary reason to keep
 * this hardcoded — the old ladder (1953/1960/1968/1976) baked in a
 * fabricated "1960" era and two eras ("1968", "1976") that were never
 * backed by any pack at all. See docs/briefs for the removal writeup.
 */
export function eraForDate(date: string): EraId {
  let best = PACKS_BY_DATE[0]!;
  for (const pack of PACKS_BY_DATE) {
    if (pack.era.startDate <= date) best = pack;
    else break;
  }
  return best.era.id;
}

/**
 * Legacy era anchors: date thresholds for era ids that USED to be a
 * shipped pack but no longer are. Currently just "1960" (see
 * packs/index.ts removal note). A save file created before the fix can
 * still carry `meta.era === "1960"`; this table lets `advanceCalendarPhase`
 * keep that save's era label stable while its date remains in the
 * legacy pack's original date range, and correctly promote it forward once
 * the calendar reaches the next REAL pack — instead of either regressing
 * the label back to "1953" (which `eraForDate`'s plain latest-pack walk
 * would do, since "1960" isn't a pack any more) or crashing.
 *
 * This table is intentionally NOT consulted by `eraForDate` — new worlds
 * (which always start on a real pack id) must never be assigned a legacy
 * era by ordinary calendar advancement; only `nextEraForDate` uses it, and
 * only when the world's CURRENT era is already a legacy id.
 */
const LEGACY_ERA_START_DATES: Record<string, string> = {
  "1960": "1960-01-05",
};

/**
 * Era-transition helper for `advanceCalendarPhase`. For a world already on
 * a real pack era, this is exactly `eraForDate`. For a world on a legacy
 * era id (only "1960" today), it never regresses the label and only
 * promotes forward once the date reaches a real pack whose startDate is
 * later than the legacy era's own start.
 */
export function nextEraForDate(date: string, currentEra: EraId): EraId {
  const legacyStart = LEGACY_ERA_START_DATES[currentEra];
  const isRealPack = PACKS_BY_DATE.some((p) => p.era.id === currentEra);
  if (legacyStart !== undefined && !isRealPack) {
    let candidate = currentEra;
    for (const pack of PACKS_BY_DATE) {
      if (pack.era.startDate > legacyStart && pack.era.startDate <= date) {
        candidate = pack.era.id;
      }
    }
    return candidate;
  }
  return eraForDate(date);
}
