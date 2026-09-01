import { addDaysIso, DAYS_PER_TURN, eraForDate } from "../calendar.js";
import type { TurnPhase } from "./types.js";

export const advanceCalendarPhase: TurnPhase = {
  name: "advanceCalendar",
  run(world) {
    world.meta.turn += 1;
    world.meta.date = addDaysIso(world.meta.date, DAYS_PER_TURN);
    const era = eraForDate(world.meta.date);
    if (era !== world.meta.era) {
      world.meta.era = era;
      world.news.push({
        turn: world.meta.turn,
        date: world.meta.date,
        headline: `A new era begins: the ${era}s`,
      });
    }
  },
};
