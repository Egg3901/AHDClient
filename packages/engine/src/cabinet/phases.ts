import type { TurnPhase } from "../phases/types.js";
import { processCabinetNominationLifecycle } from "./nominationLifecycle.js";
import { fillVacantCabinetSlots, fillUkCabinetDirectly, clearCabinetOnTransition } from "./transition.js";
import type { WorldState } from "../types.js";

function detectPresidentialTransition(world: WorldState): string[] {
  const changed: string[] = [];
  for (const [countryId, exec] of Object.entries(world.executives)) {
    // Compare termStartTurn to current turn: if term just started this turn, cabinet should have been cleared already
    // For solo we use a news-driven detection: if president changed since last turn, clear was needed.
    // Simplified: if executives[countryId] changed presidentId this is tracked via a turn marker stored on the object.
    // We store no prior state, so we use a heuristic: if cabinet has nominations proposed by a prior president, clear them.
    // Instead, the actual clearing is triggered by presidentialSuccessionPhase or electionResolution setting termStartTurn == world.meta.turn.
    if (exec.termStartTurn === world.meta.turn) {
      changed.push(countryId);
    }
  }
  return changed;
}

export const cabinetTransitionPhase: TurnPhase = {
  name: "cabinetTransition",
  run(world) {
    const turn = world.meta.turn;
    // US presidential transition: if termStartTurn == current turn, clear and re-seed
    const presidentialTransitions = detectPresidentialTransition(world);
    for (const countryId of presidentialTransitions) {
      clearCabinetOnTransition(world, countryId);
      // After clearing, auto-nominate for US
      fillVacantCabinetSlots(world, countryId);
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `${countryId}: cabinet nominations underway after presidential transition`,
      });
    }

    // UK government transition: if government formed this turn (formedTurn == current turn), clear old seats then fill directly
    for (const [countryId, gov] of Object.entries(world.governments)) {
      if (gov.formedTurn === turn) {
        // Check if there was a prior cabinet for this country — clear only if this is a new formation
        // We do not clear on every turn, only on formation turn where members existed prior.
        // For idempotency, we check news length: if government just formed, wipe stale
        // members from prior government.
        const beforeCount = (world.cabinetMembers ?? []).filter((m) => m.countryId === countryId).length;
        if (beforeCount === 0) {
          // Fresh fill
          fillUkCabinetDirectly(world, countryId);
        } else {
          // Government already had incumbents but a new PM took office — transition semantics:
          // mainline clears all seats on government transition (clearCabinetOnTransition).
          // We mirror that: if PM changed, clear then refill.
          // Detect PM change via term: formedTurn == turn means new formation; we clear.
          const isNewPm = gov.pmPoliticianId !== null;
          if (isNewPm) {
            clearCabinetOnTransition(world, countryId);
            fillUkCabinetDirectly(world, countryId);
          }
        }
      }
    }

    // UK cabinet per-parliamentary appointment path: if UK government exists formed but cabinet empty, fill it
    // (covers first world creation where government forms before cabinet phase)
    if (world.governments["UK"]?.status === "formed") {
      const ukMembers = (world.cabinetMembers ?? []).filter((m) => m.countryId === "UK");
      if (ukMembers.length === 0) {
        fillUkCabinetDirectly(world, "UK");
      }
    }

    // Also ensure US nominations are created if executive seated and no nominations exist (fresh world after president elected)
    for (const countryId of Object.keys(world.executives)) {
      if (countryId === "US" && world.executives[countryId]?.presidentId) {
        const hasNoms = (world.cabinetNominations ?? []).some((n) => n.countryId === countryId && (n.status === "active" || n.status === "proposed"));
        const hasMembers = (world.cabinetMembers ?? []).some((m) => m.countryId === countryId);
        if (!hasNoms && !hasMembers) {
          fillVacantCabinetSlots(world, countryId);
        }
      }
    }
  },
};

export const cabinetNominationLifecyclePhase: TurnPhase = {
  name: "cabinetNominationLifecycle",
  run(world) {
    // Ports src/lib/cabinetNominationLifecycle.ts processCabinetNominationLifecycle
    processCabinetNominationLifecycle(world);
  },
};
