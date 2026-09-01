/**
 * corporationTurn — W9. Per-corp growth, margin, cost, tax, and insolvency,
 * then the per-country revenue rollup that feeds macroCountryTurn's growth
 * signal (see macroCountryTurn.ts THE KEY WIRE comment).
 *
 * Registered at the END of the phase list (registry.ts), just before
 * newsMaintenancePhase, per the same rng-stream-stability rule the elections,
 * demographics, budget, and central-bank blocks already follow there —
 * mainline runs corporationTurn near turn-pipeline index ~ (see
 * turnPhaseNames.ts "corporationTurn"), well before macroCountryTurn's
 * metric-engine consumers; inserting it there would shift every downstream
 * rng draw for existing goldens.
 *
 * Ordering consequence (documented, not a bug): because corporationTurn runs
 * at the END of turn N while macroCountryTurn runs near the START of turn N,
 * macroCountryTurn always reads a snapshot that is one turn behind this
 * phase's own output — corpRevenueSnapshots reflects corp state as of the end
 * of turn N-1 when macroCountryTurn computes turn N's growth. This is a
 * deliberate lag, not a race: computeRealizedRevenueGrowthRate only needs a
 * consistent (previous, current, turnsSincePrev) triple, and turnsSincePrev
 * is always exactly 1 once a country's corps have run once.
 *
 * Scope (see types.ts + constants.ts file docs for full citations): per-corp
 * growth trend + affordability brake (sectorGrowthPolicy.ts, command-economy
 * plan-gravity branch not ported — no command-economy system in this
 * worktree), flat margin (no ~20-term modifier stack), corporate tax at the
 * country's authored rate (no consolidated-loss-offset apportionment — W9
 * corps are single-sector), and a simplified insolvency/reincorporation cycle
 * (nppInsolvencyDissolution.ts triggers 1+2 only; trigger 3 is bond-related,
 * W12/W13). Dividends, overhead budgets (marketing/logistics/R&D), CEO
 * salary, and the full nppCorporationBehavior.ts decision engine are PORT-STUB
 * / deferred — see constants.ts CEO_ARCHETYPE_MODIFIERS doc.
 */

import type { TurnPhase } from "../phases/types.js";
import type { Corporation } from "./types.js";
import {
  GROWTH_COST_MARGIN_SHARE,
  GROWTH_BRAKE_STEP,
  GROWTH_RATE_TURNS_PER_YEAR,
  MIN_GROWTH_RATE,
  MAX_GROWTH_RATE,
  calculateGrowthCost,
  softCapEffectiveMargin,
  trendGrowthRate,
  PERSISTENT_INSOLVENCY_GRACE_TURNS,
  DEFAULT_CORPORATE_TAX_RATE_PCT,
} from "./constants.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * One corp's turn: growth trend + brake, margin, growth cost, tax, net
 * income. Mutates the corp in place; returns nothing (matches other W9
 * phases' style).
 * Formulas: sectorGrowthPolicy.ts resolveSectorGrowthPolicy (growth/brake) +
 * sectorProfitBasis.ts sectorDailyProfitAnchor (revenue - maintenance -
 * growthCost) + sectorCalculations.ts corporate tax (single-sector, no
 * consolidation).
 */
export function runCorporationTurn(corp: Corporation, taxRatePct: number): void {
  const priorRevenue = corp.revenue;
  const priorMargin = corp.effectiveProfitMargin || corp.profitMargin;
  const priorGrowthCostShare = priorRevenue > 0 ? (100 * corp.currentGrowthCost) / priorRevenue : 0;

  const growthUnaffordable =
    priorRevenue > 0 && (priorMargin <= 0 || priorGrowthCostShare >= priorMargin * GROWTH_COST_MARGIN_SHARE);

  const brakedTargetRate = growthUnaffordable
    ? Math.max(MIN_GROWTH_RATE, corp.targetGrowthRate - GROWTH_BRAKE_STEP)
    : corp.targetGrowthRate;

  const trended = trendGrowthRate(corp.currentGrowthRate, corp.targetGrowthRate);
  const newCurrentGrowthRate = growthUnaffordable
    ? Math.max(MIN_GROWTH_RATE, Math.min(trended, brakedTargetRate))
    : trended;

  const perTurnGrowthRate = newCurrentGrowthRate / GROWTH_RATE_TURNS_PER_YEAR;
  const growthCost = calculateGrowthCost(priorRevenue, perTurnGrowthRate);
  const newRevenue = priorRevenue * (1 + perTurnGrowthRate / 100);

  const effectiveMargin = softCapEffectiveMargin(corp.profitMargin);
  const netIncomePreTax = priorRevenue * (effectiveMargin / 100) - growthCost;

  const taxableIncome = Math.max(0, netIncomePreTax);
  const corporateTax = taxableIncome * (taxRatePct / 100);
  const netIncome = netIncomePreTax - corporateTax;

  corp.targetGrowthRate = clamp(brakedTargetRate, MIN_GROWTH_RATE, MAX_GROWTH_RATE);
  corp.currentGrowthRate = newCurrentGrowthRate;
  corp.currentGrowthCost = growthCost;
  corp.revenue = newRevenue;
  corp.effectiveProfitMargin = effectiveMargin;
  corp.liquidCapital += netIncome;
}

/**
 * Insolvency check + reincorporation. Source: nppInsolvencyDissolution.ts —
 * see constants.ts PERSISTENT_INSOLVENCY_GRACE_TURNS doc for the relative
 * deep-threshold adaptation. Reincorporation resets the corp to its founding
 * state (capital, revenue, growth) rather than removing it: mainline's full
 * dissolution returns the sector to an unowned pool and (eventually) a fresh
 * NPP corp is spawned into it by a separate admin process; Rotunda has no
 * unowned-pool/spawn-queue system to port that two-step pipeline, so W9
 * collapses "dissolve then eventually respawn" into one deterministic step
 * that keeps sector coverage and corp count stable across a long run — the
 * property the 200-turn long-run-sanity test exists to check.
 */
export function checkInsolvency(corp: Corporation, currentTurn: number): void {
  const deepThreshold = -corp.foundingRevenue;
  const deeplyInsolvent = corp.liquidCapital < deepThreshold;
  const negative = corp.liquidCapital < 0;

  let shouldReincorporate = false;
  if (deeplyInsolvent) {
    shouldReincorporate = true;
  } else if (negative) {
    if (corp.insolventSinceTurn === null) {
      corp.insolventSinceTurn = currentTurn;
    } else if (currentTurn - corp.insolventSinceTurn >= PERSISTENT_INSOLVENCY_GRACE_TURNS) {
      shouldReincorporate = true;
    }
  } else {
    corp.insolventSinceTurn = null;
  }

  if (shouldReincorporate) {
    corp.liquidCapital = corp.foundingRevenue;
    corp.revenue = corp.foundingRevenue / GROWTH_RATE_TURNS_PER_YEAR;
    corp.currentGrowthCost = 0;
    corp.effectiveProfitMargin = corp.profitMargin;
    corp.insolventSinceTurn = null;
    corp.reincorporationCount += 1;
  }
}

export const corporationTurnPhase: TurnPhase = {
  name: "corporationTurn",
  run(world) {
    for (const corp of Object.values(world.corporations)) {
      const taxRatePct = world.budgets?.[corp.countryId]?.taxRates.domesticCorporateTax ?? DEFAULT_CORPORATE_TAX_RATE_PCT;
      runCorporationTurn(corp, taxRatePct);
      checkInsolvency(corp, world.meta.turn);
    }

    // Per-country revenue rollup for the macro growth-signal wire (see file doc).
    const byCountry: Record<string, number> = {};
    for (const corp of Object.values(world.corporations)) {
      byCountry[corp.countryId] = (byCountry[corp.countryId] ?? 0) + corp.revenue;
    }
    for (const [countryId, total] of Object.entries(byCountry)) {
      const snap = world.corpRevenueSnapshots[countryId];
      world.corpRevenueSnapshots[countryId] = {
        current: total,
        previous: snap ? snap.current : total,
        turn: world.meta.turn,
      };
    }
  },
};
