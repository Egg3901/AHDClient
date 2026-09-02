/**
 * Wars turn phase — W32. Steps every unresolved conflict's control track
 * (settlement.ts stepConflictControl), then applies mainline's portable
 * resolution triggers: a cold_war conflict resolves once one side has held
 * the pole for POLE_HOLD_TURNS consecutive turns (src/lib/turn/
 * coldWarHolds.ts); every other type opens a DICTATE_WINDOW_TURNS terms
 * window once control hits a pole, auto-resolving (dictated terms, imposed
 * by whichever side holds the pole) if the window lapses — mirrors
 * mainline's peaceWindows.ts fallback-to-white-peace behavior, except
 * Rotunda's model already has a decisive winner by the time the window
 * opens (see settlement.ts file doc), so the auto-resolution is "dictated",
 * not a true white peace. No RNG: fully deterministic from GDP state, same
 * as mainline's own combat resolution (hash-seeded, not RNG).
 *
 * Registered at the END of the phase list, before newsMaintenance, same
 * rng-stream-stability rule every other tail cluster follows — this phase
 * draws no rng either way, so the rule is about not reordering every other
 * tail phase's position, not about this one's own determinism.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { Conflict, Settlement } from "./types.js";
import { DICTATE_WINDOW_TURNS, POLE_HOLD_TURNS, stepConflictControl, TRUCE_TURNS } from "./settlement.js";

function sumGdp(world: WorldState, countryIds: readonly string[]): number {
  let total = 0;
  for (const id of countryIds) total += world.countries[id]?.economy.gdp ?? 0;
  return total;
}

function resolveConflict(world: WorldState, conflict: Conflict, winner: "A" | "B", path: Settlement["path"]): void {
  conflict.status = "resolved";
  conflict.outcome = { winner };
  const settlement: Settlement = {
    id: `settlement-${conflict.id}-${world.meta.turn}`,
    conflictId: conflict.id,
    turn: world.meta.turn,
    path,
    winner,
    truceUntilTurn: world.meta.turn + TRUCE_TURNS,
  };
  world.settlements.push(settlement);
}

export const warsTurnPhase: TurnPhase = {
  name: "warsTurn",
  run(world) {
    for (const conflict of world.conflicts) {
      if (conflict.status === "resolved") continue;
      const strengthA = sumGdp(world, conflict.sideA.countries);
      const strengthB = sumGdp(world, conflict.sideB.countries);
      const { control } = stepConflictControl(conflict, strengthA, strengthB);
      conflict.control = control;
      const atPole = control >= 100 || control <= 0;
      const poleSide: "A" | "B" = control >= 100 ? "B" : "A";

      if (conflict.type === "cold_war") {
        if (atPole) {
          if (conflict.poleSide !== poleSide) {
            conflict.poleSide = poleSide;
            conflict.poleSinceTurn = world.meta.turn;
          } else if (conflict.poleSinceTurn !== undefined && world.meta.turn - conflict.poleSinceTurn >= POLE_HOLD_TURNS) {
            resolveConflict(world, conflict, poleSide, "cold_war_absorption");
          }
        } else {
          conflict.poleSide = undefined;
          conflict.poleSinceTurn = undefined;
        }
        continue;
      }

      if (atPole) {
        if (conflict.status !== "terms_pending") {
          conflict.status = "terms_pending";
          conflict.termsWindowClosesTurn = world.meta.turn + DICTATE_WINDOW_TURNS;
        } else if (conflict.termsWindowClosesTurn !== undefined && world.meta.turn >= conflict.termsWindowClosesTurn) {
          resolveConflict(world, conflict, poleSide, "dictated");
        }
      } else if (conflict.status === "terms_pending") {
        conflict.status = "active";
        conflict.termsWindowClosesTurn = undefined;
      }
    }
  },
};
