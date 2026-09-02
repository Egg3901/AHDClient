import { addDaysIso, DAYS_PER_TURN, nextEraForDate } from "../calendar.js";
import type { TurnPhase } from "./types.js";

export const advanceCalendarPhase: TurnPhase = {
  name: "advanceCalendar",
  run(world) {
    world.meta.turn += 1;
    world.meta.date = addDaysIso(world.meta.date, DAYS_PER_TURN);
    // Label update only, via the legacy-safe nextEraForDate (era-truth v40):
    // never regresses a legacy-era save, promotes forward at real era
    // boundaries. The era-crossing announcement itself (W33) lives in its
    // own tail phase, eraCrossingPhase, mirroring mainline's separation of
    // the calendar advance from the dedicated `eraCrossing` turn phase.
    world.meta.era = nextEraForDate(world.meta.date, world.meta.era);
  },
};
