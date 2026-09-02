import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { evaluateAchievements } from "./evaluate.js";
import { ACHIEVEMENT_CATALOG } from "./catalog.js";

const NAME_BY_SLUG = new Map(ACHIEVEMENT_CATALOG.map((e) => [e.slug, e.name]));

/**
 * Per-turn achievement grant. Deterministic, no rng — see evaluate.ts file
 * doc for why a once-per-turn current-state scan is equivalent to mainline's
 * event-driven grant for every "available" catalog entry.
 */
export const achievementCheckPhase: TurnPhase = {
  name: "achievementCheck",
  run(world: WorldState) {
    const newlyEarned = evaluateAchievements(world);
    if (newlyEarned.length === 0) return;
    for (const slug of newlyEarned) {
      world.achievementsEarned.push(slug);
      world.news.push({
        turn: world.meta.turn,
        date: world.meta.date,
        headline: `Achievement unlocked: ${NAME_BY_SLUG.get(slug) ?? slug}.`,
      });
    }
  },
};
