/**
 * War settlement — the control-track math is a verbatim port
 * (occupationShift/OCCUPATION, src/lib/military/occupation.ts:166-171 +
 * config.ts:319-345); everything upstream of it (how a turn's "margin" is
 * derived) is AHDClient-native, because mainline derives margin from a
 * per-unit battle engine with no AHDClient equivalent (see wars/types.ts file
 * doc, B15).
 *
 * AHDClient's margin: each side's committed strength is proxied by its
 * coalition's total GDP (src/lib/db/types Country.economy.gdp already
 * exists for this purpose — a bigger, richer coalition wins attritional
 * ground, which is the same intuition mainline's supply/logistics layer
 * encodes with actual unit throughput). margin = 100 * (strengthB -
 * strengthA) / (strengthB + strengthA), so a side with double the other's
 * GDP gets margin ~= +/-33, comparable in scale to mainline's battle-margin
 * range (occupationShift's own decisiveMargin=45 is calibrated against that
 * same -100..100 range). This is a deliberate simplification, not a hidden
 * one: it has no war-exhaustion, terrain, doctrine, or unit-quality term,
 * because AHDClient has none of those systems yet either.
 */
import type { Conflict } from "./types.js";

/** Source: military/config.ts OCCUPATION (verbatim). */
export const OCCUPATION = {
  decisiveMargin: 45,
  maxShift: 5,
  retreatYield: 0.7,
} as const;

/** Source: military/principal.ts DICTATE_WINDOW_TURNS. */
export const DICTATE_WINDOW_TURNS = 24;
/** Source: db/types/peaceOffer.ts TRUCE_TURNS. */
export const TRUCE_TURNS = 240;
/** Source: turn/coldWarHolds.ts POLE_HOLD_TURNS. */
export const POLE_HOLD_TURNS = 3;

/**
 * `control` after one turn's engagement. A decisive margin (|margin| >=
 * decisiveMargin) takes the full maxShift step; narrower margins scale down
 * linearly; a side that "retreated" (AHDClient: the loser's coalition GDP
 * share fell below 40% of the pair, i.e. heavily outmatched) yields less
 * ground per step, same intuition as mainline's orderly-withdrawal discount.
 * Source: occupation.ts occupationShift (verbatim formula).
 */
export function occupationShift(control: number, winner: "A" | "B", margin: number, loserRetreated: boolean): number {
  let shift = Math.min(1, Math.abs(margin) / OCCUPATION.decisiveMargin) * OCCUPATION.maxShift;
  if (loserRetreated) shift *= OCCUPATION.retreatYield;
  const next = winner === "B" ? control + shift : control - shift;
  return Math.max(0, Math.min(100, next));
}

/** AHDClient-native margin proxy — see file doc. Positive favors side B. */
export function gdpMargin(strengthA: number, strengthB: number): number {
  const total = strengthA + strengthB;
  if (total <= 0) return 0;
  return (100 * (strengthB - strengthA)) / total;
}

export interface ConflictStepResult {
  control: number;
  winner: "A" | "B" | null;
  loserRetreated: boolean;
}

/** One turn of the control track for a conflict, given each side's GDP proxy. */
export function stepConflictControl(conflict: Conflict, strengthA: number, strengthB: number): ConflictStepResult {
  const margin = gdpMargin(strengthA, strengthB);
  if (margin === 0) return { control: conflict.control ?? 50, winner: null, loserRetreated: false };
  const winner: "A" | "B" = margin > 0 ? "B" : "A";
  const loserRetreated = Math.min(strengthA, strengthB) / Math.max(strengthA, strengthB, 1) < 0.4;
  const control = occupationShift(conflict.control ?? 50, winner, margin, loserRetreated);
  return { control, winner, loserRetreated };
}
