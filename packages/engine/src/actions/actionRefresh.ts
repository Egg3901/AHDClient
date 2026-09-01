/**
 * Action-point refresh phase.
 * Ports src/lib/turn/actionRefresh.ts at mainline-neutral values.
 * Deterministic pure phase: base 4 + office bonus, hoard penalty 4 over 100, cap 200.
 * Office bonus via OFFICE_ACTION_BONUS (fallback to 0 for unknown chambers).
 * Also decays politicalInfluence at 0.75%/turn when present (mirrors mainline's
 * applyPoliticalInfluenceDecay), plus infamy/favorability decay hooks for future.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { MIN_BASE_ACTIONS_PER_TURN, ACTION_HOARD_PENALTY, ENERGY_BASE_ACTION_CAP, ENERGY_BASE_HOARD_THRESHOLD, OFFICE_ACTION_BONUS } from "./constants.js";

function officeActionBonus(chamberKey: string): number {
  return OFFICE_ACTION_BONUS[chamberKey] ?? 0;
}

function applyPoliticalInfluenceDecay(value: number): number {
  // 0.75% decay per turn per mainline's applyPoliticalInfluenceDecay default
  return Math.max(0, value * (1 - 0.0075));
}

function favorabilityPenalty(favorability: number): number {
  if (favorability <= 60) return 0;
  return (favorability - 60) * 0.05;
}

function infamyDrain(infamy: number): number {
  if (infamy <= 20) return 0;
  return (infamy - 20) * 0.05;
}

export const actionRefreshPhase: TurnPhase = {
  name: "actionRefresh",
  run(world: WorldState) {
    const base = MIN_BASE_ACTIONS_PER_TURN;
    const cap = ENERGY_BASE_ACTION_CAP;
    const threshold = ENERGY_BASE_HOARD_THRESHOLD;

    const refreshForPolitician = (pol: (typeof world.politicians)[number]) => {
      const bonus = officeActionBonus(pol.chamberKey);
      let refresh = base + bonus;
      // Consume bonusActions counter into actions (partyInfluenceTurn side effect)
      if (pol.bonusActions > 0) {
        refresh += pol.bonusActions;
        pol.bonusActions = 0;
      }
      const penalty = pol.actions > threshold ? ACTION_HOARD_PENALTY : 0;
      const next = Math.min(cap, Math.max(0, pol.actions - penalty + refresh));
      pol.actions = next;

      // Influence decay / national influence accrual mirrors mainline's actionRefresh
      // but limited to fields solo now tracks. Keep bounded.
      if (typeof pol.politicalInfluence === "number") {
        pol.politicalInfluence = Math.min(100, Math.max(0, applyPoliticalInfluenceDecay(pol.politicalInfluence)));
      }
      if (typeof pol.infamy === "number" && typeof pol.favorability === "number") {
        const drain = infamyDrain(pol.infamy);
        const fp = favorabilityPenalty(pol.favorability);
        pol.favorability = Math.min(100, Math.max(0, pol.favorability - fp - drain));
        pol.infamy = Math.max(0, pol.infamy * 0.95);
      }
      // Cooldowns tick down implicitly via turn comparison; no decrement needed
    };

    for (const pol of world.politicians) refreshForPolitician(pol);

    // Player refresh mirrors character path
    const player = world.player as unknown as { actions?: number; bonusActions?: number; politicalInfluence?: number; infamy?: number; favorability?: number; chamberKey?: string };
    if (typeof player.actions === "number") {
      const bonus = 0; // player has no office bonus unless we add currentOffice later
      let refresh = base + bonus;
      const penalty = player.actions > threshold ? ACTION_HOARD_PENALTY : 0;
      player.actions = Math.min(cap, Math.max(0, player.actions - penalty + refresh));
      if (typeof player.politicalInfluence === "number") {
        player.politicalInfluence = Math.min(100, Math.max(0, applyPoliticalInfluenceDecay(player.politicalInfluence)));
      }
      if (typeof player.infamy === "number" && typeof player.favorability === "number") {
        const drain = infamyDrain(player.infamy);
        const fp = favorabilityPenalty(player.favorability);
        player.favorability = Math.min(100, Math.max(0, player.favorability - fp - drain));
        player.infamy = Math.max(0, player.infamy * 0.95);
      }
    }
  },
};
