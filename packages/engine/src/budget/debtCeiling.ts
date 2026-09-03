/**
 * Debt-ceiling crisis trigger — port of src/lib/budget/debt.ts
 * triggerDebtCeilingCrisis (lines 216-230). Mainline upserts a single
 * `gameState` doc keyed "debt_ceiling_crisis"; solo keeps the same shape
 * per-country (mainline's doc is effectively global/US-scoped in practice,
 * but AHDClient has four independently-budgeted playable countries, so this
 * keys by countryId rather than inventing a single shared flag).
 *
 * Idempotent: re-triggering while already active resets turnsElapsed, same
 * as mainline's upsert. Two call sites converge on this in mainline
 * (billEnactment.ts's validateFederalBudgetImpact warning, and
 * budget/fiscalYear.ts's annual debt rollover) — this wave wires the first;
 * the second (fiscalYearPhase's own ceiling check) is a residual left for
 * whoever next touches budget/phases.ts fiscalYearPhase, not invented here
 * without a citation-backed call site to hang it on this pass.
 *
 * The gameplay CONSEQUENCES of an active crisis (mainline's
 * src/lib/crises/templates.ts DEBT_CEILING_CRISIS_TEMPLATE, consumed by the
 * crisis-template/crisisTurn system) are PORT-STUB — B09: no crisis-template
 * catalog entry exists for this kind in AHDClient's events/catalog.ts yet.
 * This wave only ports the trigger/state, not the downstream event.
 */
import type { DebtCeilingCrisisState, WorldState } from "../types.js";

export function triggerDebtCeilingCrisis(world: WorldState, countryId: string, turn: number): void {
  const existing = world.enactmentGates.debtCeilingCrisis[countryId];
  const state: DebtCeilingCrisisState = {
    active: true,
    triggeredAtTurn: existing?.active ? existing.triggeredAtTurn : turn,
    turnsElapsed: 0,
    resolved: false,
  };
  world.enactmentGates.debtCeilingCrisis[countryId] = state;
}
