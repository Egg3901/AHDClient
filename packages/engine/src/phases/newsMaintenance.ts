import type { TurnPhase } from "./types.js";

const MAX_NEWS_ITEMS = 500;

export const newsMaintenancePhase: TurnPhase = {
  name: "newsMaintenance",
  run(world) {
    if (world.news.length > MAX_NEWS_ITEMS) {
      world.news.splice(0, world.news.length - MAX_NEWS_ITEMS);
    }
  },
};
