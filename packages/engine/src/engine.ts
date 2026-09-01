import { TURN_PHASES } from "./phases/registry.js";
import type { TurnReport } from "./phases/types.js";
import { rngFromState } from "./rng.js";
import type { WorldState } from "./types.js";

/**
 * Advance the world by one turn, in place. Deterministic: rng state is read
 * from and written back to world.meta, so save/load mid-campaign does not
 * change outcomes.
 */
export function advanceTurn(world: WorldState): TurnReport {
  const rng = rngFromState(world.meta.rng);
  const phaseTimings = [];
  for (const phase of TURN_PHASES) {
    const startedAt = performance.now();
    phase.run(world, rng);
    phaseTimings.push({ name: phase.name, ms: performance.now() - startedAt });
  }
  world.meta.rng = rng.state();
  return { turn: world.meta.turn, date: world.meta.date, phaseTimings };
}
