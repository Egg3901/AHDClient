/**
 * Trade turn phases — W8.
 *  - tradeGrowthPhase: solo analogue of mainline's national-metrics
 *    tradeGrowthNode recompute (src/lib/metricEngine/registry/economic.ts),
 *    writing the fresh economicFactors.tradeGrowth mainline's
 *    processFiscalBaseGrowth (src/lib/turn/fiscalBaseGrowth.ts:114) persists
 *    every turn. Must run before fiscalBaseGrowthPhase consumes it — see
 *    registry.ts insertion point.
 *  - tradeGrowthMirrorPhase: verbatim port of src/lib/turn/tradeGrowthMirror.ts
 *    mirrorTradeGrowth — copies economicFactors.tradeGrowth to the country's
 *    central bank so forexTurnPhase (which reads centralBanks, not budgets,
 *    per forex/forexTurn.ts file doc) sees a real trade signal instead of the
 *    `tradeGrowth: 0` PORT-STUB it shipped with in W4.
 */
import type { TurnPhase } from "../phases/types.js";
import { advanceTradeGrowth, computeTradeGrowthTarget } from "./tradeGrowth.js";
import { isTradeBlocMember } from "./bloc.js";

export const tradeGrowthPhase: TurnPhase = {
  name: "tradeGrowth",
  run(world) {
    for (const [countryId, budget] of Object.entries(world.budgets)) {
      const ex = world.exchangeRates[countryId];
      const forexStrength = ex && ex.baseRate > 0 ? ex.rate / ex.baseRate - 1 : 0;
      const target = computeTradeGrowthTarget({
        tariffPct: budget.taxRates.tariffs,
        foreignCorporateTaxPct: budget.taxRates.foreignCorporateTax,
        blocMember: isTradeBlocMember(world, countryId),
        forexStrength,
      });
      budget.economicFactors.tradeGrowth = advanceTradeGrowth(
        budget.economicFactors.tradeGrowth,
        target,
      );
    }
  },
};

export const tradeGrowthMirrorPhase: TurnPhase = {
  name: "tradeGrowthMirror",
  run(world) {
    for (const [countryId, bank] of Object.entries(world.centralBanks)) {
      const budget = world.budgets[countryId];
      bank.tradeGrowth = budget?.economicFactors.tradeGrowth ?? 0;
    }
  },
};
