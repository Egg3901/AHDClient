/**
 * Cold War turn phases — W32.
 *
 *  1. coldWarTensionPhase — ports src/lib/turn/coldWarTensionTurn.ts
 *     processColdWarTensionTurn: reads standing pressure (active
 *     conflicts, warhead stockpiles, active crises) and relaxes
 *     world.coldWarTension toward the computed floor. No RNG (mainline has
 *     none in this path either). B12: mainline's escalationLevel input is a
 *     Vietnam-style regional-conflict escalation ladder with no Rotunda
 *     equivalent — held at 0 (PORT-STUB, named). activeCrises reads
 *     world.crises (W31) directly, a real Rotunda input with no blocker.
 *
 *  2. nuclearProductionPhase — ports the pure math half of
 *     src/lib/turn/nuclearProductionTurn.ts applyNuclearProduction
 *     (accrueWarheads against nuclear.ts's tech tree). The appropriation
 *     ledger it debits against is PORT-STUB (B11, see coldWar/nuclear.ts file
 *     doc) — this phase substitutes each country's current fiscal-year
 *     surplus (world.budgets[countryId].surplus, floored at 0) as the
 *     "available budget" and debits the spend from treasuryBalance, a
 *     Rotunda-native stand-in for mainline's separate defence-appropriation
 *     sub-ledger.
 *
 * Both run at the END of the phase list (registry.ts), just before
 * newsMaintenancePhase, per the same rng-stream-stability rule every other
 * tail cluster follows there. nuclearProductionPhase runs BEFORE
 * coldWarTensionPhase so a warhead built this turn is already counted in
 * that same turn's arsenal-pressure term (mirrors mainline's real ordering:
 * nuclearProductionTurn runs inside ministerialOrderProcessing, well before
 * coldWarTensionTurn later in the pipeline).
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { isNuclearWar, nuclearArmedCountryIds, stepTension, tensionFloor, warPressures, type WarPressureInput } from "./tension.js";
import { accrueWarheads, NUCLEAR_CAPABLE, productionCapFor } from "./nuclear.js";

export const nuclearProductionPhase: TurnPhase = {
  name: "nuclearProduction",
  run(world) {
    for (const countryId of NUCLEAR_CAPABLE) {
      const program = world.nuclearPrograms[countryId];
      if (!program) continue;
      if (productionCapFor(program.adopted) <= 0) continue;
      const budget = world.budgets[countryId];
      const available = budget ? Math.max(0, budget.surplus) : 0;
      const { built, cost } = accrueWarheads(program.adopted, program.productionRate, available);
      if (built <= 0) continue;
      program.warheads += built;
      if (budget) budget.treasuryBalance -= cost;
    }
  },
};

export const coldWarTensionPhase: TurnPhase = {
  name: "coldWarTension",
  run(world) {
    const programs = Object.values(world.nuclearPrograms).map((p) => ({ countryId: p.countryId, warheads: p.warheads }));
    const nuclearCountries = nuclearArmedCountryIds(programs);
    const totalWarheads = programs.reduce((sum, p) => sum + p.warheads, 0);
    const activeCrises = world.crises.filter((c) => c.status === "active").length;

    const wars: WarPressureInput[] = world.conflicts
      .filter((c) => c.status !== "resolved")
      .map((c) => ({
        sideACountries: c.sideA.countries,
        sideBCountries: c.sideB.countries,
        intensity: c.intensity,
        limitedWarSinceTurn: c.limitedWarSinceTurn,
      }));
    const summary = warPressures(wars, nuclearCountries, world.meta.turn);

    const pressures = {
      escalationLevel: 0, // B12: no Vietnam-style escalation ladder ported
      activeCrises,
      totalWarheads,
      nuclearWarIntensity: summary.nuclearWarIntensity,
      nuclearWarCount: summary.nuclearWarCount,
      nuclearWarMinimumPressure: summary.nuclearWarMinimumPressure,
      otherWarIntensity: summary.otherWarIntensity,
    };

    world.coldWarTension.value = stepTension(world.coldWarTension.value, pressures);
    world.coldWarTension.pressureFloor = tensionFloor(pressures);
    world.coldWarTension.updatedTurn = world.meta.turn;

    // Sync limitedWarSinceTurn clocks (source: src/lib/coldwar/standingPressure.ts:48-68):
    // hot turns (>=WAR_ACCLIMATION_HOT_INTENSITY) clear the clock; the first
    // sub-hot turn stamps it, so acclimation age is measured from when a war
    // last dropped below hot, not from its outbreak.
    for (const conflict of world.conflicts) {
      if (conflict.status === "resolved") continue;
      const isNuclear = isNuclearWar({ sideACountries: conflict.sideA.countries, sideBCountries: conflict.sideB.countries }, nuclearCountries);
      void isNuclear;
      if (conflict.intensity >= 85) {
        conflict.limitedWarSinceTurn = undefined;
      } else if (conflict.limitedWarSinceTurn === undefined) {
        conflict.limitedWarSinceTurn = world.meta.turn;
      }
    }
  },
};
