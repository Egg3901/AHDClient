/**
 * Metric decay — port of src/lib/turn/metricDecay.ts calculateDecay.
 *
 * Decay toward baseline is proportional (exponential) at 0.25% per turn,
 * never overshooting. Threshold 0.001 snaps near-baseline values to baseline
 * to avoid floating-point churn.
 *
 * Mainline's processMetricDecay is a no-op (returns 0) because decay is now
 * handled inside processStatePolicyEffects' consolidated write; the old
 * standalone phase targeted stateDemographics which lacks {value, baseline}.
 * Solo mirrors that: the active decay for solo runs inside the nationalMetrics
 * aggregation's smoothing, not as a separate writer. This module exports the
 * pure calculateDecay for goldens and keeps the no-op phase for registry
 * completeness.
 *
 * Sources:
 *  - src/lib/turn/metricDecay.ts DECAY_RATE 0.0025, DECAY_THRESHOLD 0.001
 *  - src/lib/turn/metricDecay.ts calculateDecay
 *  - src/lib/turn/metricDecay.ts processMetricDecay (no-op historical compat)
 */

export const DECAY_RATE = 0.0025; // source: metricDecay.ts DECAY_RATE
export const DECAY_THRESHOLD = 0.001; // source: metricDecay.ts DECAY_THRESHOLD

export function calculateDecay(currentValue: number, baseline: number): number {
  const distance = currentValue - baseline;
  if (Math.abs(distance) < DECAY_THRESHOLD) return baseline;
  return currentValue - distance * DECAY_RATE;
}

export async function processMetricDecay(): Promise<number> {
  return 0;
}

import type { TurnPhase } from "../phases/types.js";

export const metricDecayPhase: TurnPhase = {
  name: "metricDecay",
  run() {
    // No-op by design — decay is applied where metrics are written (nationalMetrics)
    // to avoid a competing writer. See module doc.
  },
};
