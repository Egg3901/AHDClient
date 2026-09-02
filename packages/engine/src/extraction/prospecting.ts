import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { ExtractableResource } from "../commodity/constants.js";
import type { ProspectingSurvey } from "./types.js";
import {
  PROSPECT_GOVT_SUCCESS_CHANCE,
  PROSPECT_YIELD_MIN,
  PROSPECT_YIELD_MAX,
  PROSPECT_MAX_GAIN_FRACTION,
  PROSPECT_MAX_ACTIVE_PER_INITIATOR,
  PROSPECT_GOVT_RD_MULT,
  prospectCorpSuccessChance,
  prospectCorpRdMult,
  prospectEraScaling,
  prospectCostAnchor,
  prospectDurationTurns,
} from "./constants.js";

/**
 * Resolve prospecting surveys — ports src/lib/turn/prospecting/resolveProspects.ts.
 *
 * For each active survey whose completesTurn <= turn:
 *  - Determine success via chance (gov 0.5 or corp rdScore-derived) x era.success, clamped 0.01..0.99
 *  - On success, grow the region's capacity by currentCap x uniform(0.03,0.08) x rdMult x era.yield,
 *    capped at 20% x era.yield of current capacity
 *  - No capacity doc or zero capacity for the resource -> survey still resolves but adds nothing
 *    (fail-safe, matches mainline's "never auto-insert cap docs" rule)
 *
 * Determinism: mainline seeds one independent RNG stream per survey (keyed on
 * survey id + turn). Solo draws from the single shared WorldRng instead, in
 * deterministic (id-sorted) survey order — same substitution every other
 * ported turn phase in this codebase makes (see commodityPricesPhase file
 * doc); resolution order never affects any individual survey's own draws
 * since supply/demand and prior surveys' capacity writes don't feed back into
 * a later survey's roll this same turn.
 */
export function resolveProspectsForTurn(
  world: WorldState,
  rng: WorldRng,
): { surveysResolved: number; succeeded: number; failed: number; totalCapacityAdded: number } {
  const turn = world.meta.turn;
  const year = yearFromDate(world.meta.date);
  const era = prospectEraScaling(year);
  const due = world.prospectingSurveys
    .filter((s) => s.status === "active" && s.completesTurn <= turn)
    .sort((a, b) => a.id.localeCompare(b.id));
  const result = { surveysResolved: 0, succeeded: 0, failed: 0, totalCapacityAdded: 0 };
  if (due.length === 0) return result;

  for (const survey of due) {
    const isCorp = survey.initiatorType === "corporation";
    const rdScore = survey.rdScoreAtStart ?? 0;
    const baseChance = isCorp ? prospectCorpSuccessChance(rdScore) : PROSPECT_GOVT_SUCCESS_CHANCE;
    const chance = Math.max(0.01, Math.min(0.99, baseChance * era.success));
    const success = rng.next() < chance;

    let capacityGained = 0;
    if (success) {
      const cap = world.stateResourceCapacities[survey.regionId];
      const currentCap = cap?.resources[survey.resource] ?? 0;
      if (currentCap > 0) {
        const yieldRoll = rng.next();
        const yieldFraction = (PROSPECT_YIELD_MIN + yieldRoll * (PROSPECT_YIELD_MAX - PROSPECT_YIELD_MIN)) * era.yield;
        const rdMult = isCorp ? prospectCorpRdMult(rdScore) : PROSPECT_GOVT_RD_MULT;
        const rawGain = currentCap * yieldFraction * rdMult;
        const maxGain = currentCap * PROSPECT_MAX_GAIN_FRACTION * era.yield;
        capacityGained = Math.round(Math.min(rawGain, maxGain));
      }
      if (capacityGained > 0) {
        let entry = world.stateResourceCapacities[survey.regionId];
        if (!entry) {
          entry = { regionId: survey.regionId, countryId: survey.countryId, resources: {}, updatedAtTurn: turn };
          world.stateResourceCapacities[survey.regionId] = entry;
        }
        entry.resources[survey.resource] = (entry.resources[survey.resource] ?? 0) + capacityGained;
        entry.updatedAtTurn = turn;
      }
    }

    survey.status = success ? "succeeded" : "failed";
    survey.capacityGained = capacityGained;
    survey.resolvedTurn = turn;

    result.surveysResolved += 1;
    if (success) {
      result.succeeded += 1;
      result.totalCapacityAdded += capacityGained;
    } else {
      result.failed += 1;
    }

    const headline = success
      ? `Survey struck ${survey.resource} in ${survey.regionId}: +${capacityGained.toLocaleString()} capacity.`
      : `Survey for ${survey.resource} in ${survey.regionId} came up dry.`;
    world.news.push({ turn, date: world.meta.date, headline });
  }

  return result;
}

function yearFromDate(date: string): number | null {
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export type LaunchProspectResult = { ok: true; surveyId: string; costAnchor: number } | { ok: false; error: string };

/**
 * Launch a national-government geological survey for the player's country.
 * Ports src/lib/extraction/commands/launchGovernmentProspect.ts at solo's
 * simplified authorization model: PORT-STUB state-level surveys (no governor
 * office / state budget system exists — see actions/catalog.ts launchProspect
 * entry) and PORT-STUB the issuer-authority-law lookup (getResourceContractAuthority
 * — no such law is modeled; every national-government survey is allowed
 * exactly like every other HoS-mode government action in this codebase, e.g.
 * sponsorBill's "HoS mode grants government sponsorship" gate).
 *
 * Cost is paid from the country's treasury (world.budgets[countryId].treasuryBalance),
 * same as mainline's spendFromTreasury: NO pre-check, borrowing allowed (a
 * negative balance already IS the national debt elsewhere in this codebase —
 * see budget/phases.ts fiscalYearPhase).
 */
export function launchProspectingSurvey(
  world: WorldState,
  params: { countryId: string; regionId: string; resource: ExtractableResource },
): LaunchProspectResult {
  const region = world.regions[params.regionId];
  if (!region || region.countryId !== params.countryId) {
    return { ok: false, error: `Unknown region ${params.regionId} for ${params.countryId}` };
  }
  const cap = world.stateResourceCapacities[params.regionId];
  if ((cap?.resources[params.resource] ?? 0) <= 0) {
    return { ok: false, error: `${params.resource} is not extractable in ${params.regionId}` };
  }

  const initiatorId = "player";
  const active = world.prospectingSurveys.filter(
    (s) => s.status === "active" && s.initiatorType === "national_government" && s.countryId === params.countryId,
  ).length;
  if (active >= PROSPECT_MAX_ACTIVE_PER_INITIATOR) {
    return { ok: false, error: `A government can run at most ${PROSPECT_MAX_ACTIVE_PER_INITIATOR} surveys at a time` };
  }
  const dup = world.prospectingSurveys.some(
    (s) =>
      s.status === "active" &&
      s.initiatorType === "national_government" &&
      s.countryId === params.countryId &&
      s.regionId === params.regionId &&
      s.resource === params.resource,
  );
  if (dup) return { ok: false, error: "A survey for that resource is already underway here" };

  const priorSuccessCount = world.prospectingSurveys.filter(
    (s) => s.regionId === params.regionId && s.resource === params.resource && s.status === "succeeded",
  ).length;
  const costAnchor = prospectCostAnchor(priorSuccessCount);
  const turn = world.meta.turn;
  const year = yearFromDate(world.meta.date);

  const budget = world.budgets[params.countryId];
  if (budget) budget.treasuryBalance -= costAnchor;

  const id = `prospect-${turn}-${world.prospectingSurveys.length + 1}-${params.regionId}-${params.resource}`;
  const survey: ProspectingSurvey = {
    id,
    initiatorType: "national_government",
    initiatorId,
    corporationId: null,
    countryId: params.countryId,
    regionId: params.regionId,
    resource: params.resource,
    startedTurn: turn,
    completesTurn: turn + prospectDurationTurns(year),
    costAnchor,
    status: "active",
  };
  world.prospectingSurveys.push(survey);
  world.news.push({
    turn,
    date: world.meta.date,
    headline: `Government commissions a ${params.resource} survey in ${params.regionId}.`,
  });
  return { ok: true, surveyId: id, costAnchor };
}

export const resolveProspectsPhase: TurnPhase = {
  name: "resolveProspects",
  run(world: WorldState, rng: WorldRng) {
    resolveProspectsForTurn(world, rng);
  },
};
