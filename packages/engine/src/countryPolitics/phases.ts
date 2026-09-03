import type { TurnPhase } from "../phases/types.js";
import { updateCountryPolitics } from "./overview.js";

/**
 * Country political overview turn phase. RNG-free (reads live macro and
 * chamber state, eases the gauges, reconciles officers) so it neither
 * consumes the turn rng stream nor shifts any other phase's draws.
 */
export const countryPoliticsPhase: TurnPhase = {
  name: "countryPolitics",
  run(world) {
    updateCountryPolitics(world);
  },
};
