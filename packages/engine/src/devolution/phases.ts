import type { TurnPhase } from "../phases/types.js";
import { runIndependenceDesireDrift } from "./independenceDesireDrift.js";

/** W25: live turn phase. See independenceDesireDrift.ts file doc for the full port. */
export const independenceDesireDriftPhase: TurnPhase = {
  name: "independenceDesireDrift",
  run(world) {
    runIndependenceDesireDrift(world);
  },
};
