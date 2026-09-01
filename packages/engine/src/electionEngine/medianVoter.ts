/**
 * Per-state median voter computation for the swing-flow engine's
 * policy-distance driver.
 *
 * Ported verbatim from `src/lib/electionEngine/medianVoter.ts`.
 * Mainline mapping: `DemographicCategory` / `StateDemographics` now come from
 * local `types.ts` plain interfaces (mirror `src/lib/db/types/demographics.ts`).
 * `CountryId` is `string`.
 */

import type { DemographicCategory, StateDemographics, CountryId } from "./types.js";

export interface MedianVoter {
  ep: number;
  sp: number;
}

export function computeMedianVoter(
  demographics: StateDemographics,
  categories: DemographicCategory[],
  liveTurnouts?: Record<string, number>
): MedianVoter {
  let weightSum = 0;
  let epWeighted = 0;
  let spWeighted = 0;

  for (const category of categories) {
    const catWeight = demographics.categoryWeights[category._id] ?? 0;
    if (!Number.isFinite(catWeight) || catWeight <= 0) continue;

    for (const group of category.groups) {
      const stateGroup = demographics.groups[group.id];
      const populationPct = stateGroup?.population;
      if (
        typeof populationPct !== "number" ||
        !Number.isFinite(populationPct) ||
        populationPct <= 0
      )
        continue;

      const turnoutPct =
        liveTurnouts?.[group.id] ??
        (typeof stateGroup?.turnout === "number" ? stateGroup.turnout : group.defaultTurnout) ??
        55;
      if (!Number.isFinite(turnoutPct) || turnoutPct <= 0) continue;

      const groupEP =
        typeof stateGroup?.economicLean === "number"
          ? stateGroup.economicLean
          : group.defaultEconomicLean;
      const groupSP =
        typeof stateGroup?.socialLean === "number"
          ? stateGroup.socialLean
          : group.defaultSocialLean;

      const w = catWeight * populationPct * turnoutPct;
      weightSum += w;
      epWeighted += w * groupEP;
      spWeighted += w * groupSP;
    }
  }

  if (weightSum <= 0) return { ep: 0, sp: 0 };
  return {
    ep: epWeighted / weightSum,
    sp: spWeighted / weightSum,
  };
}

const EV_WEIGHTED_HEAD_OF_GOVERNMENT_BY_COUNTRY: Readonly<Partial<Record<CountryId, string>>> = {
  US: "president",
};

export function usesEvWeightedNationalMedian(electionType: string, countryId: CountryId): boolean {
  return EV_WEIGHTED_HEAD_OF_GOVERNMENT_BY_COUNTRY[countryId] === electionType;
}

export function computeNationalEvWeightedMedian(
  states: Array<{
    demographics: StateDemographics;
    liveTurnouts?: Record<string, number>;
    ev: number;
  }>,
  categories: DemographicCategory[]
): MedianVoter {
  let evSum = 0;
  let epWeighted = 0;
  let spWeighted = 0;

  for (const { demographics, liveTurnouts, ev } of states) {
    if (!Number.isFinite(ev) || ev <= 0) continue;
    const stateMedian = computeMedianVoter(demographics, categories, liveTurnouts);
    evSum += ev;
    epWeighted += ev * stateMedian.ep;
    spWeighted += ev * stateMedian.sp;
  }

  if (evSum <= 0) return { ep: 0, sp: 0 };
  return {
    ep: epWeighted / evSum,
    sp: spWeighted / evSum,
  };
}
