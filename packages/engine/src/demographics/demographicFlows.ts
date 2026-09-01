/**
 * Demographic flows turn phase — ports src/lib/demographics/phase.ts (runDemographicFlows)
 *
 * Mainline's phase is a per-region cohort advance (design §4.2):
 * continuous aging (1/TURNS_PER_YEAR of each cohort graduates) → mortality
 * (healthcare lifeExpectancy/preventableMortality modifiers) → fertility
 * (birthRateIndex→TFR, split by sex) → international migration (migrationRate %
 * + economic pull + global cap) → internal migration (cross-region zero-sum).
 * It writes RegionDemographics ages vectors, State population/votingEligible/
 * workingAge/militaryService, and macroMetrics population.* readouts.
 *
 * Solo port: solo has no cohort vectors yet (no RegionDemographics ages).
 * This phase therefore implements a population-dynamics stub that preserves the
 * observable contract meaningful to the engine:
 * - Population grows slowly (1953-era US ~1.6%/yr, ~0.033%/turn at 48 turns/yr)
 *   with a small RNG jitter, deterministically via world RNG.
 * - Voting-eligible and working-age shares are derived from the live population
 *   using fixed 1953 age-structure fractions (young 30%, senior 15% → voting
 *   70%, working 58%) so electorate and labor force track population without
 *   a full cohort.
 * - Labor force is derived in macroCountryTurn via computeLaborForce; this
 *   phase updates the workingAgePopulation / votingEligiblePopulation that
 *   computeLaborForce consumes.
 * - Military service population is 0 (no conscription law this wave).
 *
 * Citations:
 * - src/lib/demographics/phase.ts runDemographicFlows (overall contract: per-region
 *   local flows → internal migration → state metric writes)
 * - src/lib/demographics/cohortFlows.ts advanceCohort (aging→mortality→fertility→migration order)
 * - src/lib/demographics/cohortVector.ts totalPopulation, votingAgePopulation, workingAgePopulation
 * - src/lib/demographics/populationMetrics.ts derivePopulationMetrics (annualized growth, migrationRate)
 * - src/lib/constants/turnTime.ts TURNS_PER_YEAR
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";

const ANNUAL_POP_GROWTH_PCT_1953 = 1.6; // US 1953 natural + net migration, annualized %
const VOTING_ELIGIBLE_SHARE = 0.70; // 18+ share of population (1950 census age structure)
const WORKING_AGE_SHARE = 0.58; // 18-64 share (derived from youth+mid+mature fractions)
const RNG_JITTER_PCT_PER_TURN = 0.04; // annualized jitter ±0.02pp per turn, deterministic via RNG

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function runDemographicFlows(world: import("../types.js").WorldState, _rng: import("../rng.js").WorldRng): { regionsProcessed: number } {
  let count = 0;
  for (const region of Object.values(world.regions)) {
    if (!region.population || !Number.isFinite(region.population)) continue;
    // Annualized growth → per-turn factor
    // Deterministic: no RNG jitter — population growth is fixed 1.6%/yr so that
    // demographic flows do not shift the shared RNG stream (determinism doctrine).
    const jitter = 0;
    const annualGrowth = ANNUAL_POP_GROWTH_PCT_1953 + jitter;
    const perTurnGrowth = annualGrowth / 100 / TURNS_PER_YEAR;
    const newPop = Math.max(1, Math.round(region.population * (1 + perTurnGrowth)));
    region.population = newPop;
    // Derive electorate and labor-age stocks
    (region as unknown as { votingEligiblePopulation?: number }).votingEligiblePopulation = Math.round(newPop * VOTING_ELIGIBLE_SHARE);
    (region as unknown as { workingAgePopulation?: number }).workingAgePopulation = Math.round(newPop * WORKING_AGE_SHARE);
    (region as unknown as { militaryServicePopulation?: number }).militaryServicePopulation = 0;
    count++;
  }
  return { regionsProcessed: count };
}

export const demographicFlowsPhase: TurnPhase = {
  name: "demographicFlows",
  run(world, rng) {
    runDemographicFlows(world as WorldState, rng);
  },
};

// Back-compat export for tests that import the phase by alternate name
export const demographicFlowsTurnPhase = demographicFlowsPhase;
