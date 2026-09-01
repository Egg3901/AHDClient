import type { TurnPhase } from "../phases/types.js";
import { processScotusTurn } from "./scotusTurn.js";
import { processUkJrSurpriseTurn } from "./ukJrSurpriseTurn.js";

export const scotusTurnPhase: TurnPhase = {
  name: "scotusTurn",
  run(world) {
    processScotusTurn(world);
  },
};

export const ukJrSurpriseTurnPhase: TurnPhase = {
  name: "ukJrSurpriseTurn",
  run(world) {
    processUkJrSurpriseTurn(world);
  },
};
