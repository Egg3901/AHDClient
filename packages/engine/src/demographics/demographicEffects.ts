/**
 * Demographic effects turn phase — ports src/lib/demographicEffects.ts
 *
 * Mainline processes LegislationType.demographicEffects[] channels:
 * - population (legacy, always active): policies shift a group's population share
 * - economicLean / socialLean / turnout (v2, gated on
 *   legislationDemographicEffectsV2Enabled): policies shift a group's lean and
 *   turnout; shifts are additive across active laws and decay toward the seeded
 *   baseline at 0.25%/turn when no law targets that group+axis.
 *
 * Federal effects apply at 1/50 strength per US state (1/12 per UK region)
 * via getFederalMultiplier.
 *
 * W28 UPDATE: the legislation-drift path is now wired (previously a
 * documented no-op — see git history for the prior file doc). Every turn,
 * runLegislationDemographicEffects walks world.policyLedger (the same store
 * policyEffectsPhase reads — see policyEffects/phases.ts), looks up each
 * entry's catalog demographicEffects[] (legislation/catalog.ts CatalogEntry,
 * B01: content authors none yet, so this is exercised end-to-end only by the
 * synthetic catalog entry in demographics.test.ts), and applies the shift to
 * every region belonging to that policy's country. Groups/axes with no
 * active shift this turn fall through to the existing decay-to-baseline path
 * unchanged.
 *
 * Citations:
 * - src/lib/demographicEffects.ts SHIFT_RATE_PER_TURN, LEAN_SHIFT_RATE_PER_TURN,
 *   TURNOUT_SHIFT_RATE_PER_TURN, LEAN_MAX_DEVIATION_FROM_BASELINE,
 *   TURNOUT_MAX_DEVIATION_FROM_BASELINE, applyBaselineDecay, computeShiftsByTarget,
 *   applyBandedShift (buildDemographicUpdates)
 * - src/lib/turn/metricDecay.ts DECAY_RATE (0.25%/turn)
 * - shared/constants/formulas.ts getFederalMultiplier (same TICK-path split
 *   policyEffects/constants.ts ports; demographic shifts are a per-turn
 *   additive tick, not a decay-path target pull, so they use the raw
 *   getFederalMultiplier, not nationalDecayScope)
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { StateDemographics } from "./stateDemographics.js";
import { getFederalMultiplier } from "../policyEffects/constants.js";
import { getLaw, type CatalogEntry } from "../legislation/catalog.js";

/** Injectable for tests — see demographics.test.ts (real catalog entries author no demographicEffects yet, B01). */
export type CatalogLookup = (id: string) => Pick<CatalogEntry, "demographicEffects"> | null;

export const SHIFT_RATE_PER_TURN = 0.1;
export const LEAN_SHIFT_RATE_PER_TURN = 0.035;
export const TURNOUT_SHIFT_RATE_PER_TURN = 0.25;
export const LEAN_MAX_DEVIATION_FROM_BASELINE = 1.5;
export const TURNOUT_MAX_DEVIATION_FROM_BASELINE = 10;
export const DEMOGRAPHIC_DECAY_RATE = 0.0025;

/** Source: demographicEffects.ts SHIFT_RATE_BY_TARGET. */
const SHIFT_RATE_BY_TARGET: Record<"population" | "economicLean" | "socialLean" | "turnout", number> = {
  population: SHIFT_RATE_PER_TURN,
  economicLean: LEAN_SHIFT_RATE_PER_TURN,
  socialLean: LEAN_SHIFT_RATE_PER_TURN,
  turnout: TURNOUT_SHIFT_RATE_PER_TURN,
};

/**
 * Proportional decay toward baseline at 0.25%/turn (src/lib/turn/metricDecay.ts).
 * Used for lean/turnout when no active law targets that group+axis.
 */
export function applyBaselineDecay(current: number, baseline: number): number {
  const delta = current - baseline;
  return current - delta * DEMOGRAPHIC_DECAY_RATE;
}

/**
 * One-directional band: a positive shift may push `current` up to
 * `baseline + maxDeviation` (never past it, and never pulled BACK below
 * where it already was); a negative shift is the mirror. Values already
 * outside the band are never snapped in by a shift of the other sign either
 * — only decay (above) walks a value back toward baseline.
 * Source: src/lib/demographicEffects.ts applyBandedShift.
 */
export function applyBandedShift(
  current: number,
  baseline: number,
  shift: number,
  maxDeviation: number,
  absMin: number,
  absMax: number,
): number {
  let next = current + shift;
  if (shift > 0) next = Math.min(next, Math.max(baseline + maxDeviation, current));
  else if (shift < 0) next = Math.max(next, Math.min(baseline - maxDeviation, current));
  return Math.max(absMin, Math.min(absMax, next));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Sum every active policyLedger entry's catalog demographicEffects[] onto
 * the (groupId, target) pairs they touch, for one country. Faithful to
 * computeShiftsByTarget's per-policy loop (demographicEffects.ts:212-264),
 * with AHDClient's simplifications named inline (B01: strength = effectDirection,
 * not a graduated -3..3 "economic" ladder; B04: permanent/durable-baseline
 * effects are skipped, not silently treated as temporary).
 */
export function computeActiveShiftsForCountry(
  world: WorldState,
  countryId: string,
  lookupCatalog: CatalogLookup = getLaw,
): Map<string, Partial<Record<"population" | "economicLean" | "socialLean" | "turnout", number>>> {
  const shifts = new Map<string, Partial<Record<"population" | "economicLean" | "socialLean" | "turnout", number>>>();
  for (const policy of Object.values(world.policyLedger)) {
    if (policy.countryId !== countryId) continue;
    const catalog = lookupCatalog(policy.legislationTypeId);
    const effects = catalog?.demographicEffects;
    if (!effects || effects.length === 0) continue;
    const strength = policy.effectDirection; // B01: no -3..3 ladder authored in content; -1/0/1 stands in
    if (strength === 0) continue;
    const scopeMultiplier = policy.scope === "national" ? getFederalMultiplier(countryId) : 1;
    for (const effect of effects) {
      if (effect.permanent) continue; // B04: durable-baseline channel not ported
      const magnitude = clamp(effect.magnitude ?? 1, 0.25, 3);
      const shiftAmount = effect.direction * strength * scopeMultiplier * SHIFT_RATE_BY_TARGET[effect.target] * (effect.target === "population" ? 1 : magnitude);
      let group = shifts.get(effect.groupId);
      if (!group) {
        group = {};
        shifts.set(effect.groupId, group);
      }
      group[effect.target] = (group[effect.target] ?? 0) + shiftAmount;
    }
  }
  return shifts;
}

/**
 * Apply banded decay: drift back toward baseline when no legislation is
 * pushing that group+axis, or the active-shift-driven banded push when one
 * is. Population is always additive (no baseline concept — mirrors mainline
 * treating it as the "legacy, always active" channel).
 */
function applyDemographicsForState(
  live: StateDemographics,
  baseline: StateDemographics,
  activeShifts: Map<string, Partial<Record<"population" | "economicLean" | "socialLean" | "turnout", number>>>,
): void {
  for (const [groupId, grp] of Object.entries(live.groups)) {
    const base = baseline.groups[groupId];
    if (!base) continue;
    const shift = activeShifts.get(groupId);

    if (shift?.population) {
      grp.population = Math.max(0, grp.population + shift.population);
    }

    if (typeof grp.economicLean === "number" && typeof base.economicLean === "number") {
      grp.economicLean = shift?.economicLean
        ? clamp(applyBandedShift(grp.economicLean, base.economicLean, shift.economicLean, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5), -5, 5)
        : clamp(applyBaselineDecay(grp.economicLean, base.economicLean), -5, 5);
    }
    if (typeof grp.socialLean === "number" && typeof base.socialLean === "number") {
      grp.socialLean = shift?.socialLean
        ? clamp(applyBandedShift(grp.socialLean, base.socialLean, shift.socialLean, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5), -5, 5)
        : clamp(applyBaselineDecay(grp.socialLean, base.socialLean), -5, 5);
    }
    if (typeof grp.turnout === "number" && typeof base.turnout === "number") {
      grp.turnout = shift?.turnout
        ? clamp(applyBandedShift(grp.turnout, base.turnout, shift.turnout, TURNOUT_MAX_DEVIATION_FROM_BASELINE, 0, 100), 0, 100)
        : clamp(applyBaselineDecay(grp.turnout, base.turnout), 0, 100);
    }
  }
}

export function runDemographicEffects(world: WorldState, lookupCatalog: CatalogLookup = getLaw): { decayedGroups: number } {
  const demoMap = world.stateDemographics;
  const baselineMap = world.baselineDemographics;
  if (!demoMap || !baselineMap) return { decayedGroups: 0 };
  const shiftsByCountry = new Map<string, Map<string, Partial<Record<"population" | "economicLean" | "socialLean" | "turnout", number>>>>();
  let count = 0;
  for (const [stateId, live] of Object.entries(demoMap)) {
    const baseline = baselineMap[stateId];
    if (!baseline) continue;
    let activeShifts = shiftsByCountry.get(live.countryId);
    if (!activeShifts) {
      activeShifts = computeActiveShiftsForCountry(world, live.countryId, lookupCatalog);
      shiftsByCountry.set(live.countryId, activeShifts);
    }
    applyDemographicsForState(live, baseline, activeShifts);
    count += Object.keys(live.groups).length;
  }
  return { decayedGroups: count };
}

export const demographicEffectsPhase: TurnPhase = {
  name: "demographicEffects",
  run(world) {
    runDemographicEffects(world);
  },
};
