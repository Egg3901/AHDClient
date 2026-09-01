/**
 * Divergence algorithm — W29 port of src/lib/scotus/divergence.ts.
 *
 * Ports decideCaseOutcome verbatim (headcount, not lean average).
 * See src/lib/scotus/divergence.ts file header for historicalOutcomeLocked semantics (Brown v Board etc.)
 * Source: src/lib/scotus/divergence.ts : decideCaseOutcome
 */

export type CaseAxis = "economic" | "social";
export type MajorityDirection = 1 | -1;
export type CaseOutcome = "affirmed" | "diverged";

export interface SeatedJusticeLean {
  economicLean: number;
  socialLean: number;
}

export interface CaseDivergenceResult {
  seatedCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  majoritySide: MajorityDirection | 0;
  outcome: CaseOutcome;
}

export interface DecideCaseOutcomeOptions {
  historicalOutcomeLocked?: boolean;
}

export function decideCaseOutcome(
  seatedJustices: SeatedJusticeLean[],
  axis: CaseAxis,
  historicalMajorityDirection: MajorityDirection,
  options?: DecideCaseOutcomeOptions
): CaseDivergenceResult {
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  for (const justice of seatedJustices) {
    const lean = axis === "economic" ? justice.economicLean : justice.socialLean;
    if (lean > 0) positiveCount++;
    else if (lean < 0) negativeCount++;
    else neutralCount++;
  }

  const majoritySide: MajorityDirection | 0 =
    positiveCount > negativeCount ? 1 : negativeCount > positiveCount ? -1 : 0;

  const outcome: CaseOutcome =
    options?.historicalOutcomeLocked || majoritySide === 0
      ? "affirmed"
      : majoritySide === historicalMajorityDirection
        ? "affirmed"
        : "diverged";

  return {
    seatedCount: seatedJustices.length,
    positiveCount,
    negativeCount,
    neutralCount,
    majoritySide,
    outcome,
  };
}
