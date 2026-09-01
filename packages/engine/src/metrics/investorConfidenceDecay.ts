/**
 * Investor confidence decay — port of src/lib/turn/investorConfidenceDecay.ts
 * and src/lib/nationalization/consequences/compute.ts computeConfidenceRecovery.
 *
 * Each country's investorConfidence (0-100) heals toward baseline 70 when below
 * it; at or above baseline it is left alone (confidence only recovers from below,
 * never drifts up past 70). Per-turn recovery is 5% of remaining gap.
 *
 * Mainline stores this on FederalBudget.investorConfidence and heals via a
 * bulkWrite on federalBudget. Solo stores it on CountryBudget.investorConfidence
 * (optional, added in v33) for the same semantics.
 *
 * Sources:
 *  - src/lib/nationalization/constants.ts INVESTOR_CONFIDENCE_BASELINE = 70
 *  - src/lib/nationalization/constants.ts CONFIDENCE_RECOVERY_PER_TURN = 0.05
 *  - src/lib/nationalization/consequences/compute.ts computeConfidenceRecovery
 *  - src/lib/turn/investorConfidenceDecay.ts processInvestorConfidenceDecay
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";

export const INVESTOR_CONFIDENCE_BASELINE = 70; // source: nationalization/constants.ts
export const CONFIDENCE_RECOVERY_PER_TURN = 0.05; // source: nationalization/constants.ts

export function computeConfidenceRecovery(current: number): number {
  const gap = INVESTOR_CONFIDENCE_BASELINE - current;
  return current + gap * CONFIDENCE_RECOVERY_PER_TURN;
}

export function applyInvestorConfidenceDecay(
  world: WorldState,
  turn: number,
): { countriesHealed: number } {
  let healed = 0;
  for (const budget of Object.values(world.budgets)) {
    const current = (budget as unknown as Record<string, unknown>).investorConfidence as number | undefined;
    if (typeof current !== "number" || !Number.isFinite(current)) continue;
    if (current >= INVESTOR_CONFIDENCE_BASELINE) continue;
    const next = Math.min(INVESTOR_CONFIDENCE_BASELINE, computeConfidenceRecovery(current));
    (budget as unknown as Record<string, unknown>).investorConfidence = Math.round(next * 1000) / 1000;
    (budget as unknown as Record<string, unknown>).investorConfidenceUpdatedAtTurn = turn;
    healed += 1;
  }
  return { countriesHealed: healed };
}

export const investorConfidenceDecayPhase: TurnPhase = {
  name: "investorConfidenceDecay",
  run(world) {
    const turn = world.meta.turn;
    applyInvestorConfidenceDecay(world, turn);
  },
};
