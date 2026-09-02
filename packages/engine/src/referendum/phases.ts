import type { TurnPhase } from "../phases/types.js";
import { runReferendumLifecycle } from "./lifecycle.js";

/** W25: live turn phase. See lifecycle.ts file doc for exactly what's ported. */
export const referendumLifecyclePhase: TurnPhase = {
  name: "referendumLifecycle",
  run(world, rng) {
    runReferendumLifecycle(world, rng);
  },
};
