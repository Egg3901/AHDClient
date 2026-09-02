import type {
  WorldState,
  MacroHistoryPoint,
  PrimeRateHistoryPoint,
  PartyStrengthHistoryPoint,
  PlayerWealthHistoryPoint,
} from "@rotunda/engine";

/**
 * U12: thin selectors over the engine's WorldHistory (W41,
 * packages/engine/src/history/types.ts). Replaces the session-local
 * HistoryMap hack that used to live in this file (React-ref Map, populated
 * turn-by-turn client-side, reset on new-world/load, wiped on app restart).
 * world.history is part of WorldState now: it survives save/load, needs no
 * client-side tracking, and needs no reset logic — App.tsx no longer owns
 * any history state at all.
 */

export type HistoryRange = "1y" | "5y" | "all";

/** 1 turn = 1 week (engine/calendar.ts DAYS_PER_TURN = 7) => 52 turns/year. */
const TURNS_PER_YEAR = 52;

export function rangeTurnWindow(range: HistoryRange): number {
  if (range === "1y") return TURNS_PER_YEAR;
  if (range === "5y") return TURNS_PER_YEAR * 5;
  return Infinity;
}

export const HISTORY_RANGES: HistoryRange[] = ["1y", "5y", "all"];

function sliceRange<T>(points: T[], range: HistoryRange): T[] {
  const window = rangeTurnWindow(range);
  if (!Number.isFinite(window) || points.length <= window) return points;
  return points.slice(points.length - window);
}

export function macroSeries(world: WorldState, countryId: string, range: HistoryRange = "all"): MacroHistoryPoint[] {
  const arr = world.history?.macro?.[countryId];
  return sliceRange(arr ?? [], range);
}

export function primeRateSeries(world: WorldState, countryId: string, range: HistoryRange = "all"): PrimeRateHistoryPoint[] {
  const arr = world.history?.primeRate?.[countryId];
  return sliceRange(arr ?? [], range);
}

export function partyStrengthSeries(world: WorldState, partyId: string, range: HistoryRange = "all"): PartyStrengthHistoryPoint[] {
  const arr = world.history?.partyStrength?.[partyId];
  return sliceRange(arr ?? [], range);
}

export function playerWealthSeries(world: WorldState, range: HistoryRange = "all"): PlayerWealthHistoryPoint[] {
  const arr = world.history?.playerWealth;
  return sliceRange(arr ?? [], range);
}
