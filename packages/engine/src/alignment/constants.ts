import type { AlignmentPoleId } from "./types.js";

/** Turns a crisis stays open — a quarter game-year. Source: src/lib/alignment/crisis.ts CRISIS_WINDOW_TURNS. */
export const CRISIS_WINDOW_TURNS = 12;

/** Source: src/lib/constants/alignmentEras.ts ALIGNMENT_GATES. */
export const ALIGNMENT_GATES = { locked: 85, nonAligned: 20 } as const;

/** A pole must hold at least this much of a nation to count as invested. Source: crisis.ts TUG_OF_WAR_MIN_SHARE. */
export const TUG_OF_WAR_MIN_SHARE = 25;

/** 1953 bipolar pole set — see alignment/types.ts file doc for the B13 multipolar blocker. */
export const ALIGNMENT_POLES: readonly AlignmentPoleId[] = ["WEST", "EAST"];
