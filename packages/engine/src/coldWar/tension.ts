/**
 * Global Cold War tension — verbatim port of src/lib/coldwar/tension.ts pure
 * math (tensionBand, clampTension, tensionPressureBreakdown, tensionFloor,
 * stepTension, warAcclimationMultiplier, warPressures, isNuclearWar,
 * nuclearArmedCountryIds, warDeclarationTensionDelta). Mainline's Mongo
 * read/write wrappers (getColdWarTension, applyTensionEvent, runTensionTurn's
 * DB I/O) are PORT-STUB — B10, folded into coldWar/phases.ts
 * coldWarTensionPhase operating on WorldState.coldWarTension directly instead.
 *
 * One 0-100 number the whole world shares, with a short ledger of what moved
 * it. Discrete events (a nuclear test, an escalation rung) apply spikes;
 * each turn the tension phase relaxes the value toward a floor set by the
 * world's standing pressure (escalation, active crises, warhead count,
 * active shooting wars). Discrete relief cannot cross that floor, so a hot
 * world never reads calm.
 */
import {
  NUCLEAR_WAR_MINIMUM_TENSION,
  NUCLEAR_WAR_RESIDUAL_PRESSURE,
  TENSION_BASELINE,
  TENSION_RELAXATION,
  WAR_ACCLIMATION_FULL_INTENSITY,
  WAR_ACCLIMATION_GRACE_TURNS,
  WAR_ACCLIMATION_HOT_INTENSITY,
  WAR_ACCLIMATION_MAX_REDUCTION,
  WAR_ACCLIMATION_TURNS_TO_MAX,
} from "./constants.js";

export type TensionBand = "DETENTE" | "CALM" | "ELEVATED" | "CRISIS" | "BRINK";

/** Source: tension.ts tensionBand. */
export function tensionBand(value: number): TensionBand {
  if (value < 15) return "DETENTE";
  if (value < 35) return "CALM";
  if (value < 60) return "ELEVATED";
  if (value < 80) return "CRISIS";
  return "BRINK";
}

/** Source: tension.ts clampTension — round to 0.1, clamp [0,100]. */
export function clampTension(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

/** Standing inputs the per-turn step reads off the rest of the world. Source: tension.ts TensionPressures. */
export interface TensionPressures {
  escalationLevel: number;
  activeCrises: number;
  totalWarheads: number;
  nuclearWarIntensity: number;
  nuclearWarCount: number;
  nuclearWarMinimumPressure?: number;
  otherWarIntensity: number;
}

export interface TensionPressureBreakdown {
  baseline: number;
  escalation: number;
  activeCrises: number;
  arsenal: number;
  wars: number;
  floor: number;
}

/** Source: tension.ts tensionPressureBreakdown. */
export function tensionPressureBreakdown(p: TensionPressures): TensionPressureBreakdown {
  const escalation = Math.min(30, p.escalationLevel * 4);
  const activeCrises = Math.min(12, p.activeCrises * 3);
  const arsenal = Math.min(18, Math.sqrt(Math.max(0, p.totalWarheads)) * 1.2);
  const nuclearIntensity = Math.max(0, p.nuclearWarIntensity) * 0.15;
  const conventionalIntensity = Math.max(0, p.otherWarIntensity) * 0.12;
  const nuclearWarMinimum =
    p.nuclearWarCount > 0
      ? Math.max(NUCLEAR_WAR_RESIDUAL_PRESSURE, p.nuclearWarMinimumPressure ?? NUCLEAR_WAR_MINIMUM_TENSION - TENSION_BASELINE)
      : 0;
  const wars =
    nuclearWarMinimum > 0
      ? Math.min(70, nuclearWarMinimum + nuclearIntensity + conventionalIntensity)
      : Math.min(45, conventionalIntensity);
  return {
    baseline: TENSION_BASELINE,
    escalation: clampTension(escalation),
    activeCrises: clampTension(activeCrises),
    arsenal: clampTension(arsenal),
    wars: clampTension(wars),
    floor: clampTension(TENSION_BASELINE + escalation + activeCrises + arsenal + wars),
  };
}

/** Source: tension.ts tensionFloor. */
export function tensionFloor(p: TensionPressures): number {
  return tensionPressureBreakdown(p).floor;
}

/** One turn of relaxation toward the pressure floor. Source: tension.ts stepTension. */
export function stepTension(value: number, p: TensionPressures): number {
  const floor = tensionFloor(p);
  if (value <= floor) return floor;
  return clampTension(Math.max(floor, value + (floor - value) * TENSION_RELAXATION));
}

export interface WarPressureInput {
  sideACountries: string[];
  sideBCountries: string[];
  intensity: number;
  limitedWarSinceTurn?: number | undefined;
}

export interface NuclearProgramPressureInput {
  countryId: string;
  warheads: number;
}

/** Source: tension.ts nuclearArmedCountryIds. */
export function nuclearArmedCountryIds(programs: readonly NuclearProgramPressureInput[]): ReadonlySet<string> {
  return new Set(programs.filter((p) => p.warheads > 0).map((p) => p.countryId));
}

/** Source: tension.ts isNuclearWar. */
export function isNuclearWar(
  war: Pick<WarPressureInput, "sideACountries" | "sideBCountries">,
  nuclearCountries: ReadonlySet<string>,
): boolean {
  return war.sideACountries.some((c) => nuclearCountries.has(c)) && war.sideBCountries.some((c) => nuclearCountries.has(c));
}

/**
 * Public alarm slowly normalizes around a long limited war. Hot wars
 * (intensity >= WAR_ACCLIMATION_HOT_INTENSITY) never acclimate. Source:
 * tension.ts warAcclimationMultiplier.
 */
export function warAcclimationMultiplier(
  war: Pick<WarPressureInput, "intensity" | "limitedWarSinceTurn">,
  currentTurn?: number,
): number {
  const intensity = Math.max(0, Math.min(100, war.intensity));
  if (intensity >= WAR_ACCLIMATION_HOT_INTENSITY) return 1;
  if (currentTurn == null || war.limitedWarSinceTurn == null) return 1;
  const limitedWarAge = Math.max(0, currentTurn - war.limitedWarSinceTurn);
  const acclimationTurns = limitedWarAge - WAR_ACCLIMATION_GRACE_TURNS;
  if (acclimationTurns <= 0) return 1;
  const coolness =
    intensity <= WAR_ACCLIMATION_FULL_INTENSITY
      ? 1
      : (WAR_ACCLIMATION_HOT_INTENSITY - intensity) / (WAR_ACCLIMATION_HOT_INTENSITY - WAR_ACCLIMATION_FULL_INTENSITY);
  const ageReduction = Math.min(1, acclimationTurns / WAR_ACCLIMATION_TURNS_TO_MAX) * WAR_ACCLIMATION_MAX_REDUCTION;
  return Math.max(1 - WAR_ACCLIMATION_MAX_REDUCTION, 1 - ageReduction * coolness);
}

export interface WarPressureSummary {
  nuclearWarIntensity: number;
  otherWarIntensity: number;
  activeWarCount: number;
  nuclearWarCount: number;
  nuclearWarMinimumPressure: number;
}

/** Fold active wars into the two intensity sums the pressure floor reads. Source: tension.ts warPressures. */
export function warPressures(
  wars: readonly WarPressureInput[],
  nuclearCountries: ReadonlySet<string>,
  currentTurn?: number,
): WarPressureSummary {
  let nuclearWarIntensity = 0;
  let otherWarIntensity = 0;
  let nuclearWarCount = 0;
  let nuclearWarMinimumPressure = 0;
  for (const war of wars) {
    const intensity = Math.max(0, Math.min(100, war.intensity));
    const multiplier = warAcclimationMultiplier(war, currentTurn);
    const pressureIntensity = intensity * multiplier;
    if (isNuclearWar(war, nuclearCountries)) {
      nuclearWarIntensity += pressureIntensity;
      nuclearWarCount += 1;
      nuclearWarMinimumPressure = Math.max(
        nuclearWarMinimumPressure,
        Math.max(NUCLEAR_WAR_RESIDUAL_PRESSURE, (NUCLEAR_WAR_MINIMUM_TENSION - TENSION_BASELINE) * multiplier),
      );
    } else {
      otherWarIntensity += pressureIntensity;
    }
  }
  return {
    nuclearWarIntensity,
    otherWarIntensity,
    activeWarCount: wars.length,
    nuclearWarCount,
    nuclearWarMinimumPressure: clampTension(nuclearWarMinimumPressure),
  };
}

/** Immediate outbreak spike before the next standing-pressure turn runs. Source: tension.ts warDeclarationTensionDelta. */
export function warDeclarationTensionDelta(
  war: Pick<WarPressureInput, "sideACountries" | "sideBCountries"> & { type: string },
  nuclearCountries: ReadonlySet<string>,
): number {
  if (isNuclearWar(war, nuclearCountries)) return 20;
  return war.type === "interstate" ? 10 : 5;
}
