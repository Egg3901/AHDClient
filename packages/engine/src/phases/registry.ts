import type { TurnPhase } from "./types.js";
import { advanceCalendarPhase } from "./advanceCalendar.js";
import { macroEconomyPhase } from "./macroEconomy.js";
import { newsMaintenancePhase } from "./newsMaintenance.js";

/**
 * Ordered turn pipeline. Mainline runs ~60 phases (see AHDGame
 * src/simulation/phases/turnPhaseNames.ts); systems port over here one phase
 * at a time, preserving mainline's relative ordering as they land.
 */
export const TURN_PHASES: readonly TurnPhase[] = [
  advanceCalendarPhase,
  macroEconomyPhase,
  newsMaintenancePhase,
];
