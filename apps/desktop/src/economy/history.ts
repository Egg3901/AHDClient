import type { WorldState } from "@rotunda/engine";

export interface EconomyPoint {
  turn: number;
  gdp: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  outputGap: number;
}

export const HISTORY_CAP = 520;

export type HistoryMap = Map<string, EconomyPoint[]>;

export function createHistoryMap(): HistoryMap {
  return new Map<string, EconomyPoint[]>();
}

function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function pushHistoryWithTurn(map: HistoryMap, world: WorldState, turn: number): void {
  const countries = world.countries as Record<string, unknown> | undefined;
  if (!countries || typeof countries !== "object") return;
  for (const [id, raw] of Object.entries(countries)) {
    const c = raw as Record<string, unknown>;
    const econ = (c?.economy ?? {}) as Record<string, unknown>;
    const point: EconomyPoint = {
      turn,
      gdp: safeNum(econ["gdp"], 0),
      growthRate: safeNum(econ["growthRate"], 0),
      inflationRate: safeNum(econ["inflationRate"], 0),
      unemploymentRate: safeNum(econ["unemploymentRate"], 0),
      outputGap: safeNum(econ["outputGap"], 0),
    };
    let arr = map.get(id);
    if (!arr) {
      arr = [];
      map.set(id, arr);
    }
    arr.push(point);
    if (arr.length > HISTORY_CAP) {
      arr.splice(0, arr.length - HISTORY_CAP);
    }
  }
}

export function pushHistory(map: HistoryMap, world: WorldState): void {
  const turn = safeNum(world.meta?.turn, 0);
  const countries = world.countries as Record<string, unknown> | undefined;
  if (!countries || typeof countries !== "object") return;
  for (const [id, raw] of Object.entries(countries)) {
    const c = raw as Record<string, unknown>;
    const econ = (c?.economy ?? {}) as Record<string, unknown>;
    const point: EconomyPoint = {
      turn,
      gdp: safeNum(econ["gdp"], 0),
      growthRate: safeNum(econ["growthRate"], 0),
      inflationRate: safeNum(econ["inflationRate"], 0),
      unemploymentRate: safeNum(econ["unemploymentRate"], 0),
      outputGap: safeNum(econ["outputGap"], 0),
    };
    let arr = map.get(id);
    if (!arr) {
      arr = [];
      map.set(id, arr);
    }
    arr.push(point);
    if (arr.length > HISTORY_CAP) {
      arr.splice(0, arr.length - HISTORY_CAP);
    }
  }
}

export function getHistory(map: HistoryMap, countryId: string): EconomyPoint[] {
  return map.get(countryId) ?? [];
}
