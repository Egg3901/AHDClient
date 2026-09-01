/**
 * Action economy constants.
 * Cited sources per brief (mainline-neutral values):
 * - MIN_BASE_ACTIONS_PER_TURN, ACTION_HOARD_PENALTY, DEFAULT_CHAIR_ACTION_BONUS
 *   from src/lib/turn/actionRefresh.ts (4, 4, 3)
 * - ENERGY_BASE_ACTION_CAP / ENERGY_MAX_ACTION_CAP (200/250) and
 *   ENERGY_BASE_HOARD_THRESHOLD / ENERGY_MAX_HOARD_THRESHOLD (100/125)
 *   from src/lib/stats/statsConstants.ts — PORT-STUB at neutral (energy=1)
 *   since solo has no stat system.
 * - FUND_GENERATION_RATES etc from src/lib/utils/fundGeneration.ts
 */

export const MIN_BASE_ACTIONS_PER_TURN = 4;
export const ACTION_HOARD_PENALTY = 4;
export const DEFAULT_CHAIR_ACTION_BONUS = 3;

export const ENERGY_BASE_ACTION_CAP = 200;
export const ENERGY_MAX_ACTION_CAP = 250;
export const ENERGY_BASE_HOARD_THRESHOLD = 100;
export const ENERGY_MAX_HOARD_THRESHOLD = 125;

// Fund generation (src/lib/utils/fundGeneration.ts)
export const FUND_GENERATION_RATES = {
  small: 5_000,
  medium: 10_000,
  large: 20_000,
  mega: 40_000,
} as const;

export const DONOR_BASE_BONUS_PER_LEVEL = {
  small: 100,
  medium: 200,
  large: 400,
  mega: 800,
} as const;

// Office fund bonuses per hour (src/lib/utils/fundGeneration.ts OFFICE_FUND_BONUS)
export const OFFICE_FUND_BONUS: Record<string, number> = {
  house: 5_000,
  senate: 15_000,
  stateSenate: 3_000,
  governor: 15_000,
  president: 50_000,
  vicePresident: 25_000,
  commons: 5_000,
  primeMinister: 50_000,
  bundestag: 5_000,
  chancellor: 50_000,
  ministerPresident: 15_000,
  landtag: 3_000,
  parliamentaryCabinet: 5_000,
  ukCabinet: 5_000,
  // Solo-specific neutral for chambers without explicit entry
  sovietOfTheUnion: 5_000,
  sovietOfNationalities: 5_000,
  volkskammer: 5_000,
};

// Office action bonus per turn (src/lib/actions/officeBonusRegistry.ts fallback via COUNTRY_CONFIGS actionBonus)
// Solo uses a neutral map: all elected chambers give 1, executive heads give 2-2.5
export const OFFICE_ACTION_BONUS: Record<string, number> = {
  house: 1,
  senate: 1,
  commons: 1,
  gov: 1.5,
  governor: 1,
  president: 2.5,
  primeMinister: 2.5,
  chancellor: 2.5,
  volkskammer: 1,
  sovietOfTheUnion: 1,
  sovietOfNationalities: 1,
  supremeSovietDeputy: 1,
  parliamentaryCabinet: 1,
  ukCabinet: 1,
  usCabinet: 1,
};

export const GDP_PER_CAPITA_BASELINE: Record<string, number> = {
  US: 65_000,
  UK: 30_000,
  CA: 55_000,
  DE: 45_000,
  NG: 3_000_000,
};
