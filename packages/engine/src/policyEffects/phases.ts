/**
 * PolicyEffects turn phase — W28. Ports the DECAY-path half of
 * src/lib/policyEffects.ts (calculateMetricTarget -> applyPolicyDecay),
 * re-derived fresh every turn from world.policyLedger (the solo analogue of
 * mainline's statePolicies collection), same "recompute from what's
 * currently enacted" design mainline uses for both policyEffects and
 * demographicEffects (no enactment-time push, only a per-turn pull).
 *
 * Simplifications from mainline (named so a future wave can tighten them):
 *  - B01 intensity: mainline reads a -1..1 intensity from the enacted
 *    option's ladder position (policyOptionId indexes into an authored
 *    option list). Rotunda's catalog does not author that ladder, so
 *    intensity = sign(effectDirection) (-1, 0, or 1) — the faithful
 *    degenerate case (effectiveIntensity(±1) = ±1 either way, so a binary
 *    ladder is exact; only intermediate rungs are lost).
 *  - B02 regional scope: mainline's regional-scope multiplier (1) applies to
 *    that ONE region's own metric row. Rotunda has no per-region metric
 *    store for catalog targets (see metrics/nationalMetrics.ts E01 blocker),
 *    so a regional-scope policy is folded into the same national aggregate
 *    at scope 1 (full local strength) rather than diluted — a deliberate
 *    overstatement flagged here, not a silent one.
 *  - B03 direction: CatalogEntry.targets[].higherBetter defaults true when
 *    absent (see legislation/catalog.ts).
 *  - B05 weight: mainline's per-target `weight` is authored per metric on
 *    LegislationType; Rotunda's CatalogEntry.targets[].weight already carries
 *    this (ported 1:1, see catalog.ts), no additional simplification needed.
 *
 * Citations: shared/constants/formulas.ts calculateMetricTarget callers,
 * src/lib/policyEffects.ts:157-282 calculateMetricTarget.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { getLaw } from "../legislation/catalog.js";
import {
  applyPolicyDecay,
  calculatePolicyContribution,
  effectiveIntensity,
  getFederalMultiplier,
  metricRangeScale,
  nationalDecayScope,
  POLICY_TAU,
} from "./constants.js";

export interface ActivePolicyInput {
  effectDirection: number;
  countryId: string;
  scope: "national" | "regional";
  weight?: number;
}

/**
 * Sum every active policy's decay-path contribution onto `baseline`, then
 * (optionally) clamp/range-scale to [min,max]. Faithful port of
 * calculateMetricTarget's per-policy loop (policyEffects.ts:229-260) minus
 * the adjustmentHalfLife sub-term (no catalog target authors a half-life
 * yet — PORT-STUB, same B01 class: no content to drive it).
 */
export function computeMetricTarget(
  baseline: number,
  policies: readonly ActivePolicyInput[],
  higherBetter: boolean,
  range?: { min: number; max: number },
): number {
  let total = 0;
  for (const policy of policies) {
    const intensity = Math.sign(policy.effectDirection);
    if (intensity === 0) continue;
    const strength = effectiveIntensity(intensity) * 3;
    const rawScope = policy.scope === "national" ? getFederalMultiplier(policy.countryId) : 1;
    const scopeMultiplier = policy.scope === "national" ? nationalDecayScope(rawScope) : rawScope;
    const weight = policy.weight ?? 1;
    total += calculatePolicyContribution(strength, weight, scopeMultiplier, higherBetter);
  }
  const rangeScale = range ? metricRangeScale(range.min, range.max, baseline) : 1;
  const target = baseline + total * rangeScale;
  if (!range) return target;
  return Math.max(range.min, Math.min(range.max, target));
}

/**
 * Group active policyLedger entries by (countryId, metricId) via their
 * catalog entry's `targets`, then decay world.nationalMetrics[countryId]
 * [metricId] toward the computed target. Metrics with no active policy this
 * turn are left untouched (B06: no baseline table for catalog-target metric
 * ids exists to decay toward — see nationalMetrics.ts E01 note; only
 * demographics and the natural-decay-rate constant carry a baseline today).
 */
export function runPolicyEffects(world: WorldState): { metricsUpdated: number } {
  const groups = new Map<string, { countryId: string; metricId: string; weight: number; higherBetter: boolean; policies: ActivePolicyInput[] }>();
  for (const entry of Object.values(world.policyLedger)) {
    const catalog = getLaw(entry.legislationTypeId);
    if (!catalog || catalog.targets.length === 0) continue;
    for (const target of catalog.targets) {
      const key = `${entry.countryId}:${target.metricId}`;
      let group = groups.get(key);
      if (!group) {
        group = { countryId: entry.countryId, metricId: target.metricId, weight: target.weight, higherBetter: target.higherBetter ?? true, policies: [] };
        groups.set(key, group);
      }
      group.policies.push({ effectDirection: entry.effectDirection, countryId: entry.countryId, scope: entry.scope, weight: target.weight });
    }
  }

  let metricsUpdated = 0;
  for (const group of groups.values()) {
    const perCountry = (world.nationalMetrics[group.countryId] ??= {});
    const current = perCountry[group.metricId]?.value ?? 50;
    const target = computeMetricTarget(current, group.policies, group.higherBetter, { min: 0, max: 100 });
    const next = applyPolicyDecay(current, target, POLICY_TAU);
    perCountry[group.metricId] = { value: Math.round(next * 1000) / 1000 };
    metricsUpdated++;
  }
  return { metricsUpdated };
}

export const policyEffectsPhase: TurnPhase = {
  name: "policyEffects",
  run(world) {
    runPolicyEffects(world);
  },
};
