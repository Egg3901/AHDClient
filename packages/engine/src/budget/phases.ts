/**
 * Fiscal turn phases for W2.
 * Sources:
 *  - src/lib/turn/fiscalBaseGrowth.ts processFiscalBaseGrowth
 *  - src/lib/turn/subsidyBudgetTurn.ts processSubsidyBudget
 *  - src/lib/budget/fiscalYear.ts processFiscalYear (annual reconciliation)
 *  - src/lib/turn/regionalBudget.ts processRegionalBudgets (generic)
 *
 * All phases are deterministic and pure over WorldState + RNG where cited.
 * Ordering: end of ported subset, before newsMaintenance (noted as deviation
 * from mainline's earlier placement; see registry.ts comment).
 */

import type { TurnPhase } from "../phases/types.js";
import { calculateBudgetRevenue } from "./revenue.js";
import { calculateBudgetSpending } from "./spending.js";
import { applyPerTurnGrowthToFederalBases } from "./fiscalBaseGrowth.js";
import { calculateGenericRegionalRevenue } from "./regionalBudget.js";
import { SECTOR_SUBSIDIES_SPENDING_KEY } from "./subsidyBudget.js";
import { getTurnInYear, FISCAL_YEAR_START_TURN_IN_YEAR, TURNS_PER_YEAR } from "./fiscalYear.js";
import { advanceTaxRatePhaseIn } from "./taxRatePhaseIn.js";

// ── Fiscal base growth ──────────────────────────────────────────────
// Source: src/lib/turn/fiscalBaseGrowth.ts — per-turn slice of wage/trade/gdp growth
export const fiscalBaseGrowthPhase: TurnPhase = {
  name: "fiscalBaseGrowth",
  run(world) {
    // Grows each country's taxBases by one per-turn slice of its economicFactors.
    // Factors are read from the country's budget.economicFactors (seeded from
    // NATIONAL_BUDGET_SEED_CONFIGS_1953), mirroring mainline's metricEngine read.
    for (const budget of Object.values(world.budgets ?? {})) {
      const before = budget.taxBases;
      const after = applyPerTurnGrowthToFederalBases(before, budget.economicFactors);
      // Round to nearest unit to keep JSON stable
      for (const k of Object.keys(after) as Array<keyof typeof after>) {
        after[k] = Math.round(after[k]);
      }
      budget.taxBases = after;
      // Ticket #1102: walk any enacted tax-rate change one step toward its
      // target (mainline treasuryTurn.ts). Reached targets drop out on their own.
      if (budget.taxRatePhaseIn && Object.keys(budget.taxRatePhaseIn).length > 0) {
        const ramp = advanceTaxRatePhaseIn(budget.taxRates as unknown as Record<string, number>, budget.taxRatePhaseIn as Record<string, number>);
        if (ramp.changed) {
          budget.taxRates = { ...budget.taxRates, ...(ramp.rates as Partial<typeof budget.taxRates>) };
          budget.taxRatePhaseIn = ramp.pending as typeof budget.taxRatePhaseIn;
        }
      }
      // Recompute revenue off grown bases so per-turn treasury accrual tracks live bases
      const rev = calculateBudgetRevenue(budget.taxRates, budget.taxBases, budget.revenue.other);
      budget.revenue = rev;
      // Keep surplus consistent
      budget.surplus = rev.total - budget.spending.total;
    }
  },
};

// ── Subsidy budget ──────────────────────────────────────────────────
// Source: src/lib/turn/subsidyBudgetTurn.ts — writes sectorSubsidies line each turn.
// Solo has no sector/corporation system, so cost is PORT-STUB 0 (deferred).
export const subsidyBudgetPhase: TurnPhase = {
  name: "subsidyBudget",
  run(world) {
    for (const budget of Object.values(world.budgets ?? {})) {
      const cost = 0; // PORT-STUB: no sectors/corporations (deferred: sector/corporation system)
      const current = budget.spending.byCategory[SECTOR_SUBSIDIES_SPENDING_KEY] ?? 0;
      if (current !== cost) {
        budget.spending.byCategory[SECTOR_SUBSIDIES_SPENDING_KEY] = cost;
        // Re-total spending (byCategory + stateGrants + debtInterest)
        const catSum = Object.values(budget.spending.byCategory).reduce((s, v) => s + v, 0);
        budget.spending.total = catSum + budget.spending.stateGrants + budget.spending.debtInterest;
        budget.surplus = budget.revenue.total - budget.spending.total;
      }
    }
  },
};

// ── Fiscal year rollover ────────────────────────────────────────────
// Source: src/lib/budget/fiscalYear.ts processFiscalYear (annual reconciliation — gdp, surplus, debt, revenue recompute)
// In solo we run the deterministic local reconciliation each turn the calendar hits the fiscal boundary.
export const fiscalYearPhase: TurnPhase = {
  name: "fiscalYear",
  run(world) {
    const turn = world.meta.turn;
    const turnInYear = getTurnInYear(turn === 0 ? 1 : turn); // turn 0 is pre-first; fiscal check on completed turn
    // Check if NEXT turn's start advances fiscal year? We evaluate current turn after it was incremented.
    // advanceCalendar increments turn before phases run (except fiscal phases need post-calendar).
    // So we check if turn is divisible boundary: turn % 48 == 40 or turn==40 etc.
    // Use getTurnInYear(turn) == FISCAL_YEAR_START_TURN_IN_YEAR and turn > 0.
    const isBoundary = turn > 0 && turnInYear === FISCAL_YEAR_START_TURN_IN_YEAR;
    if (!isBoundary) return;
    for (const budget of Object.values(world.budgets ?? {})) {
      budget.fiscalYear += 1;
      // Recompute gdp from regional rollup is deferred (would need state gdp growth) — keep current gdp
      // Update economicFactors deterministically (small drift) — keep authored for determinism
      // Recompute revenue off current grown bases (already grown via fiscalBaseGrowth this turn)
      const rev = calculateBudgetRevenue(budget.taxRates, budget.taxBases, budget.revenue.other);
      budget.revenue = rev;
      const spend = calculateBudgetSpending(budget.spending.byCategory, budget.spending.stateGrants, budget.debt.principal, budget.debt.interestRate);
      budget.spending = spend;
      budget.surplus = rev.total - spend.total;
      // Treasury balance accrues surplus this fiscal period; debt principal mirrors -treasuryBalance when negative
      budget.treasuryBalance += budget.surplus;
      if (budget.treasuryBalance < 0) {
        budget.debt.principal = -budget.treasuryBalance;
      } else {
        budget.debt.principal = 0;
      }
    }
  },
};

// ── Regional budget processing (generic) ─────────────────────────────
// Source: src/lib/turn/regionalBudget.ts processRegionalBudgets (generic; JP/DE variants deferred)
export const regionalBudgetProcessingPhase: TurnPhase = {
  name: "regionalBudgetProcessing",
  run(world) {
    // Generic processor handles all regions as population-share slices of national grant pool
    // plus own-revenue stat share of regional GDP (mirrors UK/CN/DE pattern generically).
    // JP variant: src/lib/turn/jpRegionalBudget.ts (deferred — JP not playable)
    // DE variant: src/lib/turn/deRegionalBudget.ts (deferred — DE not playable)
    for (const [rid, region] of Object.entries(world.regions)) {
      const countryBudget = world.budgets?.[region.countryId];
      if (!countryBudget) continue;
      const rb = world.regionalBudgets?.[rid];
      if (!rb) continue;
      const pop = region.population ?? 0;
      const nationalPop = countryBudget.population;
      const regionGdpAbs = (region as unknown as { gdp?: number }).gdp != null
        ? ((region as unknown as { gdp?: number }).gdp as number) * 1_000_000
        : (nationalPop > 0 ? (countryBudget.gdp * pop) / nationalPop : 0);
      const calc = calculateGenericRegionalRevenue({
        regionId: rid,
        countryId: region.countryId,
        regionGdp: regionGdpAbs,
        regionPopulation: pop,
        nationalPopulation: nationalPop,
        grantPool: countryBudget.spending.stateGrants,
      });
      rb.revenue.councilTax = Math.round(calc.councilTax);
      rb.revenue.businessRates = Math.round(calc.businessRates);
      rb.revenue.grant = Math.round(calc.grant);
      rb.revenue.total = Math.round(calc.total);
      // Simple spending: distribute national byCategory proportionally + 50% of grant as local spend
      const byCat: Record<string, number> = {};
      for (const [k, v] of Object.entries(countryBudget.spending.byCategory)) {
        byCat[k] = nationalPop > 0 ? Math.round((v * pop) / nationalPop) : 0;
      }
      const spendTotal = Object.values(byCat).reduce((s, v) => s + v, 0) + Math.round(rb.revenue.grant * 0.5);
      rb.spending.byCategory = byCat;
      rb.spending.total = spendTotal;
      const balance = rb.revenue.total - spendTotal;
      rb.balance = balance;
      if (balance < 0) rb.consecutiveDeficits += 1;
      else rb.consecutiveDeficits = 0;
      // Austerity trigger (>1 consecutive deficit) is deferred — would need enacted law downgrade
      // Cited as deferred: src/lib/turn/regionalBudget.ts forced austerity (most expensive programme downgraded)
    }
  },
};
