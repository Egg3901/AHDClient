/**
 * Pure turnout helpers ported from `src/lib/electionEngine/resolvedTurnout.ts`.
 *
 * No DB, no I/O. Byte-identical.
 */

export function capTurnSliceToElectorate(
  slice: number,
  totalPool: number,
  electorate: number,
): number {
  if (totalPool > electorate && electorate > 0) return slice * (electorate / totalPool);
  return slice;
}

export function scalePoolToRegistered(
  pool: number,
  unregisteredPct: number | null | undefined,
): number {
  if (typeof unregisteredPct !== "number" || !Number.isFinite(unregisteredPct)) return pool;
  const clamped = Math.min(100, Math.max(0, unregisteredPct));
  return pool * (1 - clamped / 100);
}

export function capTurnSliceToRemainingElectorate(
  slice: number,
  alreadyCast: number,
  electorate: number,
): number {
  if (!(electorate > 0)) return slice;
  return Math.max(0, Math.min(slice, electorate - alreadyCast));
}
