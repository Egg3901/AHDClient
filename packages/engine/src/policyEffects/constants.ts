/**
 * PolicyEffects constants — faithful port of the DECAY-path formulas from
 * shared/constants/formulas.ts. Mainline runs two independent channels per
 * enacted policy: a per-turn additive TICK path (policyOptions[].metricEffects
 * ratePerTurn * getFederalMultiplier) and a target-seeking DECAY path
 * (calculateMetricTarget -> applyPolicyDecay). Solo has no per-option
 * metricEffects tick-rate table authored in content, so this wave ports the
 * DECAY path only — the one calculateMetricTarget/computeMetricTarget drives
 * (see phases.ts). The TICK path stays PORT-STUB (named blocker: no content
 * authoring of policyOptions[].metricEffects[].ratePerTurn tables exists in
 * packages/content yet).
 *
 * Citations: shared/constants/formulas.ts (AHDGame mainline), lines as noted
 * per export below.
 */

/** Source: formulas.ts FEDERAL_MULTIPLIER (US, per state; also the fallback default). */
export const US_FEDERAL_MULTIPLIER = 1 / 50;
/** Source: formulas.ts UK_FEDERAL_MULTIPLIER (per UK region). */
export const UK_FEDERAL_MULTIPLIER = 1 / 12;

/**
 * Per-country override map for the TICK-path federal multiplier. Mainline
 * also carries JP (1/8) and DE (1/16); neither is playable in Rotunda's 1953
 * pack, so they are omitted here rather than invented against no content —
 * PORT-STUB: add when JP/DE become playable countries.
 * Source: formulas.ts FEDERAL_MULTIPLIER_BY_COUNTRY.
 */
const FEDERAL_MULTIPLIER_BY_COUNTRY: Record<string, number> = {
  UK: UK_FEDERAL_MULTIPLIER,
};

/**
 * Tick-path federal multiplier for a country; defaults to US_FEDERAL_MULTIPLIER
 * (1/50) for every country not in the override map — this is mainline's own
 * default, not a "no split" special case for non-federal countries (verified
 * against formulas.ts getFederalMultiplier: `?? FEDERAL_MULTIPLIER`).
 * Source: formulas.ts getFederalMultiplier, lines 151-174.
 */
export function getFederalMultiplier(countryId: string): number {
  return FEDERAL_MULTIPLIER_BY_COUNTRY[countryId] ?? US_FEDERAL_MULTIPLIER;
}

/**
 * Normalized scope for a NATIONAL law's DECAY-path contribution (Bug #0962
 * balance pass): a diluted (<1) tick-path scope multiplier is replaced by a
 * flat NATIONAL_LAW_DECAY_MULTIPLIER so a national law's target-metric pull
 * is independent of how many regions/states the country has. Regional laws
 * (scope multiplier 1) keep full strength. Source: formulas.ts
 * NATIONAL_LAW_DECAY_MULTIPLIER (0.21) + nationalDecayScope, lines 186-195.
 */
export const NATIONAL_LAW_DECAY_MULTIPLIER = 0.21;

export function nationalDecayScope(scopeMultiplier: number): number {
  return scopeMultiplier < 1 ? NATIONAL_LAW_DECAY_MULTIPLIER : scopeMultiplier;
}

/** Source: formulas.ts POLICY_TAU — ~96-turn half-life (~2 in-game years). */
export const POLICY_TAU = 139;

/** Source: formulas.ts getPolicyDecayFactor. Fraction of remaining distance moved per turn. */
export function getPolicyDecayFactor(tau: number = POLICY_TAU): number {
  return 1 - Math.exp(-1 / tau);
}

/**
 * Exponential approach of `current` toward `target` at rate `1 - e^(-1/tau)`.
 * Source: formulas.ts applyPolicyDecay, lines 208-215.
 */
export function applyPolicyDecay(current: number, target: number, tau: number = POLICY_TAU): number {
  const decayFactor = getPolicyDecayFactor(tau);
  return current + (target - current) * decayFactor;
}

/**
 * Half-life decay: `initial * 0.5^(turnsSince/halfLife)`. Used for
 * EffectTargetWeighted.adjustmentHalfLife (a contribution's strength fading
 * over turns since enactment). Source: formulas.ts applyHalfLifeDecay, lines 217-222.
 */
export function applyHalfLifeDecay(initial: number, turnsSince: number, halfLife: number): number {
  return initial * Math.pow(0.5, turnsSince / halfLife);
}

/**
 * Natural per-turn decay rate applied to metrics with no active policy
 * pressure on a given axis — the same 0.25%/turn convention already ported
 * for demographics (see demographics/demographicEffects.ts
 * DEMOGRAPHIC_DECAY_RATE). Source: src/lib/turn/metricDecay.ts DECAY_RATE.
 */
export const NATURAL_DECAY_RATE = 0.0025;

/** Source: formulas.ts POLICY_INTENSITY_GAMMA — convexity of the intensity->magnitude curve. */
export const POLICY_INTENSITY_GAMMA = 0.8;

/**
 * Reshape a signed intensity in [-1,1] by POLICY_INTENSITY_GAMMA, preserving
 * sign and the 0/±1 endpoints. Source: formulas.ts effectiveIntensity, lines 124-129.
 */
export function effectiveIntensity(intensity: number): number {
  return Math.sign(intensity) * Math.abs(intensity) ** POLICY_INTENSITY_GAMMA;
}

/**
 * Max decay-path points one law can move a metric, before scope. Source:
 * formulas.ts MAX_EFFECT_PER_LAW, lines 113-116.
 */
export const MAX_EFFECT_PER_LAW = 12;

/**
 * Per-law decay contribution to a metric. `policyStrength` is -3..3 (the
 * ladder-position convention); weight is the target's authored 0..1 weight;
 * scopeMultiplier is nationalDecayScope(getFederalMultiplier(...)) for
 * national laws or 1 for regional laws; isHigherBetter flips the sign.
 * Source: formulas.ts calculatePolicyContribution, lines 226-236.
 */
export function calculatePolicyContribution(
  policyStrength: number,
  weight: number,
  scopeMultiplier: number,
  isHigherBetter: boolean,
): number {
  const normalizedStrength = policyStrength / 3;
  const effectSign = isHigherBetter ? 1 : -1;
  return normalizedStrength * weight * MAX_EFFECT_PER_LAW * scopeMultiplier * effectSign;
}

/**
 * Large-range metric scale: metrics whose span exceeds 100 (e.g. medianIncome)
 * scale the decay contribution by |referenceValue|/100 instead of the raw
 * 0-100-index magnitude, else 1.0. Source: formulas.ts metricRangeScale, lines 135-150.
 */
export function metricRangeScale(minValue: number, maxValue: number, referenceValue: number): number {
  if (maxValue - minValue <= 100) return 1;
  return Math.abs(referenceValue) / 100;
}
