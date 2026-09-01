/**
 * Census turn phase — ports src/lib/turn/census.ts
 *
 * Mainline runs the decennial census in Week 1 of years ending in 0 (real US
 * census cadence, keyed to the live game year). It reapportions the 435 House
 * seats by method of equal proportions (src/lib/elections/apportionment.ts),
 * writes new houseDistricts, and posts a National Wire news event.
 *
 * Solo port: same timing, same apportionment, adapted to WorldState.
 * - Timing: shouldRunCensus(currentYear, lastCensusYear) — year % 10 === 0 and
 *   not yet censused that year. No-op on non-decennial turns.
 * - Apportionment: uses the live apportionment allocator from
 *   electionEngine/resolution/apportionment.ts (Hamilton-like equal proportions
 *   is implemented there as Huntington-Hill; we reuse it directly).
 * - Side effects: mutates world.regions[].houseSeats for US states whose seats
 *   moved, stamps world.census { lastCensusYear, lastCensusDeltas }, and pushes
 *   a news item. Circuit-breaker and district-regeneration are out of scope
 *   (no district geometry in solo).
 *
 * Citations:
 * - src/lib/turn/census.ts shouldRunCensus, computeSeatDeltas, buildCensusContent, US_HOUSE_TOTAL_SEATS
 * - src/lib/elections/apportionment.ts apportionHouseSeats (Huntington-Hill)
 */

import type { TurnPhase } from "../phases/types.js";
import { apportionHouseSeats } from "../electionEngine/resolution/apportionment.js";

export const US_HOUSE_TOTAL_SEATS = 435;

export interface SeatDelta {
  state: string;
  from: number;
  to: number;
  delta: number;
}

export function shouldRunCensus(currentYear: number, lastCensusYear: number | undefined): boolean {
  if (!Number.isFinite(currentYear)) return false;
  if (currentYear % 10 !== 0) return false;
  return currentYear > (lastCensusYear ?? -Infinity);
}

export function computeSeatDeltas(oldSeats: Record<string, number>, newSeats: Record<string, number>): SeatDelta[] {
  const deltas: SeatDelta[] = [];
  for (const [state, to] of Object.entries(newSeats)) {
    const from = oldSeats[state] ?? to;
    if (to !== from) deltas.push({ state, from, to, delta: to - from });
  }
  return deltas.sort((a, b) => b.delta - a.delta);
}

export function buildCensusContent(year: number, deltas: SeatDelta[]): string {
  if (deltas.length === 0) return `The ${year} Census is complete. House apportionment is unchanged.`;
  const fmt = (d: SeatDelta) => `${d.state} ${d.delta > 0 ? "+" : ""}${d.delta}`;
  return `The ${year} Census reapportions the House of Representatives: ${deltas.map(fmt).join(", ")}.`;
}

export function runCensus(world: import("../types.js").WorldState): { ran: boolean; year?: number; deltas?: SeatDelta[] } {
  const currentYear = Number(world.meta.date.slice(0, 4));
  const censusState = (world as unknown as { census?: { lastCensusYear?: number; lastCensus?: { year: number; deltas: SeatDelta[] } } }).census;
  const lastCensusYear = censusState?.lastCensusYear;
  if (!shouldRunCensus(currentYear, lastCensusYear)) return { ran: false };
  // Collect US states that currently hold House seats (excludes territoires)
  const usRegionIds = Object.values(world.regions)
    .filter((r) => r.countryId === "US" && typeof r.houseSeats === "number" && (r.houseSeats as number) > 0)
    .map((r) => r.id);
  if (usRegionIds.length === 0) return { ran: false };
  const populations: Record<string, number> = {};
  const oldSeats: Record<string, number> = {};
  for (const id of usRegionIds) {
    const reg = world.regions[id];
    if (!reg) continue;
    populations[id] = reg.population ?? 0;
    oldSeats[id] = reg.houseSeats ?? 0;
  }
  const newSeats = apportionHouseSeats(populations, US_HOUSE_TOTAL_SEATS);
  const deltas = computeSeatDeltas(oldSeats, newSeats);
  for (const [stateId, seats] of Object.entries(newSeats)) {
    const reg = world.regions[stateId];
    if (reg) (reg as unknown as { houseSeats: number }).houseSeats = seats;
  }
  const w2 = world as unknown as { census?: { lastCensusYear?: number; lastCensus?: { year: number; deltas: SeatDelta[] } } };
  if (!w2.census) w2.census = {};
  w2.census.lastCensusYear = currentYear;
  w2.census.lastCensus = { year: currentYear, deltas };
  world.news.push({ turn: world.meta.turn, date: world.meta.date, headline: `${currentYear} Census: ${buildCensusContent(currentYear, deltas)}` });
  return { ran: true, year: currentYear, deltas };
}

export const censusPhase: TurnPhase = {
  name: "census",
  run(world) {
    runCensus(world);
  },
};
