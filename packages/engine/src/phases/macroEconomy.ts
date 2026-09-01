import type { TurnPhase } from "./types.js";

const WEEKS_PER_YEAR = 52;

/**
 * Placeholder macro tick: compounds GDP weekly from the annual growth rate
 * with a small random walk on the rate itself. Mainline's macroCountryTurn
 * (sector output, trade, fiscal) replaces this as those systems port over.
 */
export const macroEconomyPhase: TurnPhase = {
  name: "macroEconomy",
  run(world, rng) {
    for (const country of Object.values(world.countries)) {
      const econ = country.economy;
      econ.gdp *= 1 + econ.growthRate / WEEKS_PER_YEAR;
      econ.growthRate += (rng.next() - 0.5) * 0.001;
      econ.growthRate = Math.max(-0.15, Math.min(0.15, econ.growthRate));
    }
  },
};
