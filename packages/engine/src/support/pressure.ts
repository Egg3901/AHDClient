/**
 * Pressure decay (per-region PS pressure ladder).
 * Ports src/lib/turn/politicalStrength/pressureDecay.ts
 * Subtracts PRESSURE_DECAY_PER_TURN floored at 0.
 */

import { PRESSURE_DECAY_PER_TURN } from "./constants.js";

export function decayPressure(value: number): number {
  return Math.max(0, value - PRESSURE_DECAY_PER_TURN);
}
