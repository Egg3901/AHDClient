/**
 * Alignment bloc contest — verbatim port of src/lib/alignment/crisis.ts
 * (contestRank, mostContested, tugOfWarCandidate) and
 * src/lib/alignment/normalize.ts (normalizeShares, roundToShareGrid).
 *
 * A crisis marks a nation as unusually movable for its window rather than
 * running an auction — it lifts a per-nation movement cap while it runs.
 * That mechanic (the movement-cap system itself) is PORT-STUB — B14, no
 * per-nation movement-cap/play system exists in AHDClient; this module ports
 * the pure contest-scoring math it depends on.
 */
import type { AlignmentPoleId, AlignmentShares } from "./types.js";
import { ALIGNMENT_GATES, TUG_OF_WAR_MIN_SHARE } from "./constants.js";

/**
 * How contested a nation is. Higher is more contested. Deliberately not
 * just the inverse of the lead: reward investment by both sides, penalize a
 * wide gap. Source: crisis.ts contestRank.
 */
export function contestRank(shares: AlignmentShares, poles: readonly AlignmentPoleId[]): number {
  const held = poles.map((p) => shares.shares[p] ?? 0).sort((a, b) => b - a);
  const top = held[0] ?? 0;
  const second = held[1] ?? 0;
  return second * 2 - (top - second);
}

/** The most contested entity in a field, or null when the field is empty. Source: crisis.ts mostContested. */
export function mostContested(
  rows: readonly { entityId: string; shares: AlignmentShares }[],
  poles: readonly AlignmentPoleId[],
): string | null {
  let best: string | null = null;
  let bestRank = -Infinity;
  for (const row of rows) {
    const rank = contestRank(row.shares, poles);
    if (rank > bestRank) {
      best = row.entityId;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Whether a nation is genuinely a flashpoint: two blocs both invested
 * (second-highest share >= TUG_OF_WAR_MIN_SHARE) and no decisive leader
 * (gap between top two <= ALIGNMENT_GATES.nonAligned). Source: crisis.ts
 * tugOfWarCandidate.
 */
export function tugOfWarCandidate(shares: AlignmentShares, poles: readonly AlignmentPoleId[]): boolean {
  const held = poles.map((p) => shares.shares[p] ?? 0).sort((a, b) => b - a);
  const top = held[0] ?? 0;
  const second = held[1] ?? 0;
  if (second < TUG_OF_WAR_MIN_SHARE) return false;
  return top - second <= ALIGNMENT_GATES.nonAligned;
}

const UNITS_PER_POINT = 100;
const TOTAL_UNITS = 100 * UNITS_PER_POINT;

const toUnits = (v: number): number => {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(TOTAL_UNITS, Math.round(v * UNITS_PER_POINT));
};

const toPoints = (units: number): number => units / UNITS_PER_POINT;

/** Snap a derived value back onto the storage grid (whole hundredths). Source: normalize.ts roundToShareGrid. */
export const roundToShareGrid = (v: number): number => Math.round(v * UNITS_PER_POINT) / UNITS_PER_POINT;

export const formatShare = (v: number): string => v.toFixed(2);
export const formatShareDelta = (v: number): string => (v > 0 ? `+${formatShare(v)}` : formatShare(v));

/**
 * The single write path for alignment shares. Runs entirely in integer
 * hundredths (0-10000) so summing decimal shares never drifts off the exact-
 * total invariant. An over-100 raw total is scaled proportionally (never
 * shaved) to preserve pole ordering, with Hamilton (largest-remainder)
 * apportionment for the leftover hundredths after flooring. Source:
 * normalize.ts normalizeShares.
 */
export function normalizeShares(
  raw: Partial<Record<AlignmentPoleId, number>>,
  poles: readonly AlignmentPoleId[],
): AlignmentShares {
  const units: Partial<Record<AlignmentPoleId, number>> = {};
  for (const pole of poles) units[pole] = toUnits(raw[pole] ?? 0);

  let total = poles.reduce((sum, p) => sum + (units[p] ?? 0), 0);

  if (total > TOTAL_UNITS) {
    const scale = TOTAL_UNITS / total;
    const exact = poles.map((pole) => ({ pole, value: (units[pole] ?? 0) * scale }));
    let assigned = 0;
    for (const e of exact) {
      units[e.pole] = Math.floor(e.value);
      assigned += units[e.pole] ?? 0;
    }
    const byRemainder = [...exact].sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)));
    for (let i = 0; assigned < TOTAL_UNITS; i++, assigned++) {
      const pole = byRemainder[i % byRemainder.length]!.pole;
      units[pole] = (units[pole] ?? 0) + 1;
    }
    total = TOTAL_UNITS;
  }

  const shares: Partial<Record<AlignmentPoleId, number>> = {};
  for (const pole of poles) shares[pole] = toPoints(units[pole] ?? 0);

  return { shares, nonAligned: toPoints(TOTAL_UNITS - total) };
}
