import type { TurnPhase } from "../phases/types.js";
import { processPresidentialSuccession } from "./succession.js";

/** W24: presidential succession, registered at the tail of the phase list. */
export const presidentialSuccessionPhase: TurnPhase = {
  name: "presidentialSuccession",
  run(world) {
    processPresidentialSuccession(world);
  },
};
