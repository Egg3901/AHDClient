import { TURN_PHASES } from "./phases/registry.js";
import type { TurnReport } from "./phases/types.js";
import { rngFromState } from "./rng.js";
import type { WorldState } from "./types.js";
import { isTurnPhaseEnabled } from "./featureFlags.js";

/**
 * Advance the world by one turn, in place. Deterministic: rng state is read
 * from and written back to world.meta, so save/load mid-campaign does not
 * change outcomes.
 */
export interface AdvanceTurnOptions {
  /** Adapter-provided monotonic clock for profiling. Omit for deterministic reports. */
  now?: () => number;
}

export function advanceTurn(world: WorldState, options: AdvanceTurnOptions = {}): TurnReport {
  const rng = rngFromState(world.meta.rng);
  const phaseTimings = [];
  for (const phase of TURN_PHASES) {
    if (!isTurnPhaseEnabled(world.featureFlags, phase.name)) continue;
    const startedAt = options.now?.();
    phase.run(world, rng);
    const ms = startedAt === undefined ? 0 : options.now!() - startedAt;
    phaseTimings.push({ name: phase.name, ms });
  }
  world.meta.rng = rng.state();
  return { turn: world.meta.turn, date: world.meta.date, phaseTimings };
}
