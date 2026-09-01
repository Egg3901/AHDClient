import type { TurnPhase } from "../phases/types.js";
import { processImpeachmentLifecycle } from "./lifecycle.js";

/**
 * W24: impeachment lifecycle. Registered at the tail of the phase list,
 * BEFORE presidentialSuccessionPhase — a same-turn conviction vacancy must
 * be visible to succession the same turn (mirrors mainline's ordering
 * requirement, see impeachment/lifecycle.ts file doc).
 */
export const impeachmentLifecyclePhase: TurnPhase = {
  name: "impeachmentLifecycle",
  run(world, rng) {
    processImpeachmentLifecycle(world, rng);
  },
};
