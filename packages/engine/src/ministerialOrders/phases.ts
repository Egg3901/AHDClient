/**
 * MinisterialOrders turn phase — W28. Ports the metric-modifier accumulation
 * + cap + apply half of src/lib/turn/ministerialOrderProcessing.ts (the
 * defense sub-pipeline it also runs is PORT-STUB — see constants.ts file
 * doc). Combines every active order's effects targeting the same metric
 * path, boosts by CABINET_EFFECT_STRENGTH, caps at
 * ±MAX_PER_METRIC_MODIFIER_PER_TURN, then scales by modifierSpanScale before
 * writing an additive $inc onto world.nationalMetrics.
 *
 * Runs BEFORE policyEffectsPhase in the registry, mirroring mainline's
 * documented serialization order (crisisTurn -> navairOperations ->
 * ministerialOrders -> policyEffects, stateEffectsPhase.ts:107-126) so that
 * policyEffects' target recompute reads the order-shocked value the same
 * turn, same as mainline.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { clampCabinetModifier, modifierSpanScale } from "./constants.js";

export function runMinisterialOrders(world: WorldState): { metricsUpdated: number } {
  const combined = new Map<string, { countryId: string; metric: string; total: number }>();
  for (const order of world.ministerialOrders) {
    if (!order.active) continue;
    for (const effect of order.effects) {
      if (effect.scope !== "national") continue; // B02: regional order targets have no per-region metric store yet (same blocker as policyEffects)
      const key = `${order.countryId}:${effect.metric}`;
      let entry = combined.get(key);
      if (!entry) {
        entry = { countryId: order.countryId, metric: effect.metric, total: 0 };
        combined.set(key, entry);
      }
      entry.total += effect.modifier;
    }
  }

  let metricsUpdated = 0;
  for (const entry of combined.values()) {
    const capped = clampCabinetModifier(entry.total);
    if (capped === 0) continue;
    const applied = capped * modifierSpanScale(entry.metric);
    const perCountry = (world.nationalMetrics[entry.countryId] ??= {});
    const current = perCountry[entry.metric]?.value ?? 50;
    perCountry[entry.metric] = { value: Math.round((current + applied) * 1000) / 1000 };
    metricsUpdated++;
  }
  return { metricsUpdated };
}

export const ministerialOrdersPhase: TurnPhase = {
  name: "ministerialOrders",
  run(world) {
    runMinisterialOrders(world);
  },
};
