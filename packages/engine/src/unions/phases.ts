/**
 * Unions turn phases — W15.
 *
 * Ports src/lib/turn/unions/index.ts processUnionsTurn (dues/services/approval)
 * plus the NPP behavior hook above, as two TurnPhase objects registered at the
 * END of the phase list before newsMaintenance.
 *
 * Membership bridge: mainline computes members from CorporateSector.workers *
 * unionization / 100. AHDClient has no per-sector workers table (single-sector
 * corp collapse, see corporation/types.ts). The bridge here derives members
 * from demographics/laborForce (W16) instead:
 *   1. Total country labor force = sum laborForces[regionId] for region.countryId == union.countryId
 *   2. Sector's workforce = totalLaborForce * (SECTOR_WEIGHTS_1953[country][sectorType]/100)
 *   3. Members = sectorWorkforce * (union.unionization / 100)
 *   This keeps dues arithmetic identical to mainline (via unionMembers etc.)
 *   while the only demographic input is the real laborForces map.
 *
 * Wage bridge: mainline's averageAnnualWage uses wagePerWorker (daily) * GAME_DAYS_PER_YEAR.
 * AHDClient derives annualWage as:
 *   annualWage = (budget.wagesAndSalaries OR gdp*0.35) / totalCountryLaborForce
 * which is the same per-worker annual payroll that budget revenue uses (see
 * budget/revenue.ts wagesAndSalaries = gdp * ratios.wagesAndSalaries).
 * Falls back to 0 when laborForce is 0 so duesBurdenRatio returns 0 rather
 * than dividing by zero (matches mainline's annualWage <=0 ->0 guard).
 *
 * Treasury/services/approval math is verbatim from unionDues.ts:
 *  - duesRate = min(stored, maxDuesForWage(annualWage)) (re-clamped each turn)
 *  - duesIncome = duesIncomePerTurn(members, duesRate)
 *  - servicesCost floored to 0 when > treasury+duesIncome (lapses)
 *  - contribution = politicalContributionPerTurn(freeCashFlow, pct) (PORT-STUB: not paid out to organizers yet, just debited)
 *  - treasury += duesIncome - servicesCost - contribution
 *  - approval trends toward approvalTarget
 *
 * Suspension (union ban law) is honoured: suspended unions skip the whole block.
 * NPP behavior runs first so a union elected this turn still gets its dues tick
 * the same turn? Mainline runs nppUnionBehavior AFTER unionsTurn; AHDClient runs
 * NPP before unionsTurn in the tail cluster so election is visible same turn —
 * deviation documented in registry.ts comment.
 *
 * Source: <mainline-checkout>/src/lib/turn/unions/index.ts processUnionsTurn
 *         <mainline-checkout>/src/lib/unions/unionDues.ts
 *         <mainline-checkout>/src/lib/unions/unionServices.ts
 *         <mainline-checkout>/src/lib/unions/unionPoliticalContributions.ts
 *         demographics/laborForce.ts laborForces
 *         corporation/sectorSeedWeights1953.ts SECTOR_WEIGHTS_1953
 *         budget/revenue.ts wagesAndSalaries ratio
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { SECTOR_WEIGHTS_1953 } from "../corporation/sectorSeedWeights1953.js";
import {
  averageAnnualWage,
  duesIncomePerTurn,
  maxDuesForWage,
  servicesCostPerTurn,
  approvalTarget,
  trendApproval,
  unionApproval,
  unionMembers,
} from "./dues.js";
import { normalizeServiceIds, GAME_DAYS_PER_YEAR } from "./services.js";
import {
  clampPoliticalContributionPct,
  freeCashFlowPerTurn,
  politicalContributionPerTurn,
} from "./political.js";
import { processNppUnionBehavior } from "./nppBehavior.js";

function totalLaborForceForCountry(world: WorldState, countryId: string): number {
  let total = 0;
  for (const [rid, lf] of Object.entries(world.laborForces ?? {})) {
    const region = world.regions[rid];
    if (region?.countryId === countryId && Number.isFinite(lf) && lf > 0) total += lf;
  }
  // Fallback: derive from region population if laborForces empty (e.g. in stripped test world)
  if (total === 0) {
    for (const region of Object.values(world.regions)) {
      if (region.countryId !== countryId) continue;
      const pop = region.population ?? 0;
      if (pop > 0) total += Math.round(pop * 0.58 * 0.625);
    }
  }
  return total;
}

function annualWageForCountry(world: WorldState, countryId: string, totalLaborForce: number): number {
  if (totalLaborForce <= 0) return 0;
  const budget = world.budgets?.[countryId];
  const wagesAndSalaries = budget?.taxBases?.wagesAndSalaries ?? budget?.revenue?.incomeTax ?? null;
  // Use budget wagesAndSalaries if present and positive, else gdp * 0.35 (revenue.ts default ratio)
  const annualPayroll =
    typeof wagesAndSalaries === "number" && wagesAndSalaries > 0
      ? (budget!.taxBases?.wagesAndSalaries ?? wagesAndSalaries * (1 / 0.3) * 0.35)
      : (world.countries[countryId]?.economy.gdp ?? 0) * 1_000_000 * 0.35;
  // Derive actual payroll from budgets if available, else from gdp proxy
  let payroll = 0;
  if (budget?.taxBases?.wagesAndSalaries && budget.taxBases.wagesAndSalaries > 0) {
    payroll = budget.taxBases.wagesAndSalaries;
  } else if (world.countries[countryId]) {
    payroll = world.countries[countryId]!.economy.gdp * 1_000_000 * 0.35;
  }
  return payroll / totalLaborForce;
}

export const unionsTurnPhase: TurnPhase = {
  name: "unionsTurn",
  run(world: WorldState) {
    const turn = world.meta.turn;
    const unions = world.unions as Record<string, import("./types.js").Union> | undefined;
    if (!unions || Object.keys(unions).length === 0) return;

    for (const union of Object.values(unions)) {
      if (union.suspended) continue;

      const countryId = union.countryId;
      const sectorType = union.sectorType;
      const weight = SECTOR_WEIGHTS_1953[countryId]?.[sectorType as keyof typeof SECTOR_WEIGHTS_1953[string]] ?? 0;
      if (weight <= 0) continue;

      const totalLF = totalLaborForceForCountry(world, countryId);
      if (totalLF <= 0) continue;

      const sectorWorkers = totalLF * (weight / 100);
      const density = Math.max(0, Math.min(100, union.unionization ?? 0));
      const annualWage = annualWageForCountry(world, countryId, totalLF);

      // Bridge into the exact dues helpers via a single synthetic sector,
      // so the dues math stays identical to mainline goldens.
      const dailyWage = GAME_DAYS_PER_YEAR > 0 ? annualWage / GAME_DAYS_PER_YEAR : 0;
      const sectors = [{ workers: sectorWorkers, unionization: density, wagePerWorker: dailyWage }];
      const members = unionMembers(sectors);
      const avgWage = averageAnnualWage(sectors); // should equal annualWage when single sector

      const activeServices = normalizeServiceIds(union.activeServices);
      const duesRate = Math.min(Math.max(0, union.duesPerWorkerAnnual ?? 0), maxDuesForWage(avgWage));
      const duesIncome = duesIncomePerTurn(members, duesRate);
      const fullServicesCost = servicesCostPerTurn(members, avgWage, activeServices);
      const affordableTreasury = union.treasury + duesIncome;
      const servicesLapsed = fullServicesCost > affordableTreasury;
      const servicesCost = servicesLapsed ? 0 : fullServicesCost;
      const contributionPct = clampPoliticalContributionPct(union.politicalContributionPct);
      const freeCashFlow = freeCashFlowPerTurn(duesIncome, servicesCost);
      // PORT-STUB: mainline distributes contributions to organizers by strength
      // (unionPoliticalContributions.ts distributePoliticalContributions). AHDClient
      // has no UnionOrganizer table yet, so contribution is debited from treasury
      // but not credited to any character — the organizer payout wire is blocked
      // until organizer/strength lands. BLOCKER: organizer payout requires
      // UnionOrganizer/strength (src/lib/db/types/union.ts UnionOrganizer).
      const contribution = politicalContributionPerTurn(freeCashFlow, contributionPct);
      const target = approvalTarget({
        duesPerWorkerAnnual: duesRate,
        annualWage: avgWage,
        activeServices,
        servicesLapsed,
        politicalContributionPct: contributionPct,
      });
      const nextApproval = trendApproval(unionApproval(union), target);

      union.treasury = union.treasury + duesIncome - servicesCost - contribution;
      // Clamp treasury to non-negative defensively (mainline never lets services push negative; contributions can still)
      if (union.treasury < 0) union.treasury = 0;
      // Round treasury to cents
      union.treasury = Math.round(union.treasury * 100) / 100;
      union.approval = nextApproval;
      union.duesPerWorkerAnnual = duesRate;
      union.updatedAtTurn = turn;
    }
  },
};

export const nppUnionBehaviorPhase: TurnPhase = {
  name: "nppUnionBehavior",
  run(world: WorldState) {
    // Deterministic NPP leadership filling + orphan cleanup. Campaign/bargaining
    // counters are PORT-STUB at 0 until bargainingCampaigns lands.
    processNppUnionBehavior(world);
  },
};
