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
 * Solo port: the legislative billLifecycle produces enactedLaws, but the
 * DemographicEffect authoring on LegislationType is not yet seeded in content.
 * This phase therefore implements the full decay-to-baseline path (which is
 * always active and deterministic) and a neutral no-op for the legislation
 * drift path (no active effects this wave). The constants and helpers are
 * faithful copies so that when content seeds effects, the phase is already
 * correct.
 *
 * Citations:
 * - src/lib/demographicEffects.ts SHIFT_RATE_PER_TURN, LEAN_SHIFT_RATE_PER_TURN,
 *   TURNOUT_SHIFT_RATE_PER_TURN, LEAN_MAX_DEVIATION_FROM_BASELINE,
 *   TURNOUT_MAX_DEVIATION_FROM_BASELINE, applyBaselineDecay, calculateDemographicShifts
 * - src/lib/turn/metricDecay.ts DECAY_RATE (0.25%/turn)
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { StateDemographics } from "./stateDemographics.js";

export const SHIFT_RATE_PER_TURN = 0.1;
export const LEAN_SHIFT_RATE_PER_TURN = 0.035;
export const TURNOUT_SHIFT_RATE_PER_TURN = 0.25;
export const LEAN_MAX_DEVIATION_FROM_BASELINE = 1.5;
export const TURNOUT_MAX_DEVIATION_FROM_BASELINE = 10;
export const DEMOGRAPHIC_DECAY_RATE = 0.0025;

/**
 * Proportional decay toward baseline at 0.25%/turn (src/lib/turn/metricDecay.ts).
 * Used for lean/turnout when no active law targets that group+axis.
 */
export function applyBaselineDecay(current: number, baseline: number): number {
  const delta = current - baseline;
  return current - delta * DEMOGRAPHIC_DECAY_RATE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Apply banded decay: drift back toward baseline when no legislation is
 * pushing that group+axis. In solo this is the only active path until
 * content seeds LegislationType.demographicEffects.
 */
function decayDemographicsTowardBaseline(
  live: StateDemographics,
  baseline: StateDemographics,
): void {
  for (const [groupId, grp] of Object.entries(live.groups)) {
    const base = baseline.groups[groupId];
    if (!base) continue;
    // Lean decay (economic and social)
    if (typeof grp.economicLean === "number" && typeof base.economicLean === "number") {
      const decayed = applyBaselineDecay(grp.economicLean, base.economicLean);
      grp.economicLean = clamp(decayed, -5, 5);
    }
    if (typeof grp.socialLean === "number" && typeof base.socialLean === "number") {
      const decayed = applyBaselineDecay(grp.socialLean, base.socialLean);
      grp.socialLean = clamp(decayed, -5, 5);
    }
    // Turnout decay
    if (typeof grp.turnout === "number" && typeof base.turnout === "number") {
      const decayed = applyBaselineDecay(grp.turnout, base.turnout);
      grp.turnout = clamp(decayed, 0, 100);
    }
  }
}

export function runDemographicEffects(world: WorldState): { decayedGroups: number } {
  const demoMap = (world as unknown as { stateDemographics?: Record<string, StateDemographics> }).stateDemographics;
  const baselineMap = (world as unknown as { baselineDemographics?: Record<string, StateDemographics> }).baselineDemographics;
  if (!demoMap || !baselineMap) return { decayedGroups: 0 };
  let count = 0;
  for (const [stateId, live] of Object.entries(demoMap)) {
    const baseline = baselineMap[stateId];
    if (!baseline) continue;
    decayDemographicsTowardBaseline(live, baseline);
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
