import type { ExtractableResource } from "../commodity/constants.js";

/**
 * Prospecting survey — ports src/lib/db/types/prospectingSurvey.ts.
 * initiatorId is "player" for every survey solo can launch today (national
 * government only, gated on HoS mode — see prospecting.ts launchProspectingSurvey
 * file doc; state-level/corp-initiated surveys are PORT-STUB, see constants.ts).
 */
export interface ProspectingSurvey {
  id: string;
  initiatorType: "corporation" | "national_government" | "state_government";
  /** Set for corporation surveys (none launchable in solo yet — see file doc). */
  corporationId?: string | null;
  /** "player" for every solo-launchable survey. */
  initiatorId: string;
  countryId: string;
  /** Region id (solo's regionId doubles as mainline's stateId). */
  regionId: string;
  resource: ExtractableResource;
  startedTurn: number;
  /** startedTurn + prospectDurationTurns(year). Resolves on the first turn >= this. */
  completesTurn: number;
  /** What was paid, in anchor units (post cost-escalation). */
  costAnchor: number;
  /** rdScore snapshot at launch (corp surveys only — always undefined in solo today). */
  rdScoreAtStart?: number;
  status: "active" | "succeeded" | "failed";
  /** Capacity units added on success. */
  capacityGained?: number;
  resolvedTurn?: number;
}

/**
 * Per-region extraction capacity ceiling. Ports
 * src/lib/db/types/stateResourceCapacity.ts, keyed by regionId (solo's region
 * id IS the mainline stateId for US states post-W38; UK/RU/DD opaque regions
 * carry an aggregated split — see founding.ts file doc).
 *
 * `resources[r]` is the per-turn flow ceiling (same daily basis as corp
 * revenue). `extractedUnits[r]` is the P3b-style depletion counter: cumulative
 * units drawn against the derived reserve (resources[r] * DEPOSIT_RESERVE_TURNS).
 * Absent/0 extractedUnits means an untouched deposit. See constants.ts
 * depletedCapacityPerTurn.
 */
export interface StateResourceCapacity {
  regionId: string;
  countryId: string;
  resources: Partial<Record<ExtractableResource, number>>;
  extractedUnits?: Partial<Record<ExtractableResource, number>>;
  updatedAtTurn: number;
}
