/**
 * Provisional weights for the AHDClient-native national-mood model (see
 * types.ts file doc: mainline has no national approval/legitimacy/unrest
 * system to cite, so every constant here is a judgment call flagged for
 * review, not a port). All inputs are real live world data; the weights
 * only set how strongly each input moves the 0-100 gauges.
 */

/** Neutral macro baselines the approval target is measured against. */
export const APPROVAL_BASE = 50;
export const NEUTRAL_GROWTH_RATE = 0.025;
export const NEUTRAL_UNEMPLOYMENT_RATE = 0.05;
export const NEUTRAL_INFLATION_RATE = 0.02;

/** Per-unit weights (rates as fractions, e.g. 0.03 = 3%). */
export const APPROVAL_GROWTH_WEIGHT = 120;
export const APPROVAL_UNEMPLOYMENT_WEIGHT = 150;
export const APPROVAL_INFLATION_WEIGHT = 100;
export const APPROVAL_DEFICIT_WEIGHT = 30;

/** Clamps on each approval-target contribution (points). */
export const APPROVAL_GROWTH_CLAMP: readonly [number, number] = [-8, 8];
export const APPROVAL_UNEMPLOYMENT_CLAMP: readonly [number, number] = [-12, 6];
export const APPROVAL_INFLATION_CLAMP: readonly [number, number] = [-10, 5];
export const APPROVAL_DEFICIT_CLAMP: readonly [number, number] = [-4, 2];

/** Flat adjustments (points). */
export const APPROVAL_VACANT_EXECUTIVE_PENALTY = -5;
export const APPROVAL_PENDING_GOVERNMENT_PENALTY = -3;
export const APPROVAL_ACTIVE_CONFLICT_PENALTY = -4;
export const APPROVAL_IMPEACHMENT_PENALTY = -6;

/** Max approval/legitimacy/unrest movement per turn (points). */
export const MOOD_MAX_DELTA_PER_TURN = 2;

/** Approval history cap: two in-game years of weekly turns. */
export const APPROVAL_HISTORY_CAP = 104;

/** Honest seed/neutral defaults when a country has no data to derive from. */
export const DEFAULT_APPROVAL = 50;
export const DEFAULT_LEGITIMACY = 60;
export const DEFAULT_UNREST = 20;

/** Legitimacy model. */
export const LEGITIMACY_BASE = 62;
export const LEGITIMACY_FILLED_EXECUTIVE_BONUS = 8;
export const LEGITIMACY_FORMED_GOVERNMENT_BONUS = 6;
export const LEGITIMACY_VACANCY_WEIGHT = 30;
export const LEGITIMACY_CONFLICT_PENALTY = -6;
export const LEGITIMACY_IMPEACHMENT_PENALTY = -8;

/** Unrest model. */
export const UNREST_BASE = 15;
export const UNREST_UNEMPLOYMENT_WEIGHT = 200;
export const UNREST_INFLATION_WEIGHT = 150;
export const UNREST_CRISIS_BONUS = 4;
export const UNREST_CONFLICT_BONUS = 5;
