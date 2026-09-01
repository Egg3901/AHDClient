// Thin contract shim for Engine v1 (docs/FRAMEWORK.md).
// Re-exports from @rotunda/engine when available; otherwise provides a
// clearly marked temporary stub so the branch typechecks and runs standalone.
// ---
// TEMPORARY STUB - delete once @rotunda/engine ships listEras/listPlayableCountries
// and NewWorldOptions.era. Search for TEMPORARY STUB to remove.

import * as engine from "@rotunda/engine";
import type { WorldState } from "@rotunda/engine";

// ---- Contract types (FRAMEWORK.md Engine contract v1) ----

export interface EraInfo {
  id: string;
  label: string;
  startDate: string;
}

export interface PlayableCountryInfo {
  id: string;
  name: string;
}

export interface NewWorldOptions {
  seed: string;
  playerName: string;
  countryId: string;
  era: string;
}

// ---- Stub data (TEMPORARY STUB) ----

const STUB_ERAS: EraInfo[] = [
  { id: "1953", label: "1953 - Postwar", startDate: "1953-01-06" },
];

const STUB_COUNTRIES: Record<string, PlayableCountryInfo[]> = {
  "1953": [
    { id: "us", name: "United States" },
    { id: "uk", name: "United Kingdom" },
  ],
};

// ---- Helpers to probe real engine exports ----

function hasListEras(m: unknown): m is { listEras: () => EraInfo[] } {
  return typeof (m as Record<string, unknown>)["listEras"] === "function";
}

function hasListPlayableCountries(m: unknown): m is {
  listPlayableCountries: (era: string) => PlayableCountryInfo[];
} {
  return typeof (m as Record<string, unknown>)["listPlayableCountries"] === "function";
}

// ---- Exported contract functions ----

export function listEras(): EraInfo[] {
  if (hasListEras(engine)) return (engine as unknown as { listEras: () => EraInfo[] }).listEras();
  // TEMPORARY STUB fallback
  return STUB_ERAS;
}

export function listPlayableCountries(era: string): PlayableCountryInfo[] {
  if (hasListPlayableCountries(engine))
    return (engine as unknown as { listPlayableCountries: (era: string) => PlayableCountryInfo[] }).listPlayableCountries(era);
  // TEMPORARY STUB fallback
  return STUB_COUNTRIES[era] ?? [];
}

// Re-export engine world/saves that already exist.
// createWorld wrapper accepts NewWorldOptions.era even when upstream does not yet.
export function createWorld(options: NewWorldOptions): WorldState {
  const raw = engine as unknown as {
    createWorld?: (opts: unknown) => WorldState;
  };
  if (!raw.createWorld) throw new Error("engine.createWorld not available");
  try {
    return raw.createWorld(options);
  } catch {
    // Fallback for engine builds where NewWorldOptions lacks `era`
    const { era: _era, ...rest } = options;
    const world = raw.createWorld(rest as unknown);
    // Patch era so UI stays consistent even with stub engine
    if (world.meta && (world.meta as unknown as { era?: string }).era !== options.era) {
      (world.meta as unknown as { era: string }).era = options.era;
    }
    return world;
  }
}

export { advanceTurn, serializeSave, deserializeSave } from "@rotunda/engine";
export type { TurnReport, WorldState } from "@rotunda/engine";
