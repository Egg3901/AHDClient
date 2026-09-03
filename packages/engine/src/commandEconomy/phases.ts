/**
 * Command-economy turn phase — solo port of src/lib/turn/commandEconomyTurn.ts
 * processCommandEconomyTurn (the P1/P3 macro-state cluster only).
 *
 * PORT-STUB scope cut, cited: mainline's v2 P0/P1 layer (per-SOE plan
 * fulfillment refresh, Gosbank directed credit → SOE capacity, the plants-tier
 * replacement floor) needs a per-corp State-Owned-Enterprise model with plan
 * targets and capacity tracking that AHDClient does not have — W9 seeds one
 * NPC corporation per (country, sector) with no plan/capacity/ownership
 * fields at all (see corporation/types.ts file doc). Porting that layer is a
 * future wave alongside a real nationalization/SOE system. What DOES port
 * cleanly is the P1/P3 macro-state kernel (state.ts) plus the REAL parts of
 * the v2 policy-stance/marketization-drift layer (constants.ts): the
 * governing-party reformism read is wired to W23's real
 * `world.governments[countryId].governingPartyId` (RU="RU_CPSU",
 * DD="DD_SED" per government/government.test.ts), exactly mirroring
 * mainline's P3 "who actually governs" fix. Gosbank posture (credit
 * aggressiveness, budget softness) and SOE performance stay at mainline's own
 * NPP-brain defaults (NPP_DEFAULT_*, SOE_PERF_BASELINE) since there is no
 * player Gosbank directive panel or per-SOE plan-fulfillment score to read.
 *
 * Ships ON (no `commandEconomyEnabled` flag) — see constants.ts file doc.
 */

import type { TurnPhase } from "../phases/types.js";
import {
  accumulateOverhang,
  blackMarketPremiumFrom,
  blackMarketPressure,
  shortageIndexFrom,
  updateSecondEconomy,
} from "./state.js";
import {
  NPP_DEFAULT_BUDGET_SOFTNESS,
  NPP_DEFAULT_CREDIT_AGGRESSIVENESS,
  NPP_DEFAULT_REFORMISM,
  NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
  SOE_PERF_BASELINE,
  computePolicyStance,
  driftMarketizationLevel,
  governmentReformismFromEconomicPosition,
  internalRepressionFromReformism,
  isPlannedEconomy,
  marketizationDrift,
  marketizationGravity,
  plannedShare,
  scheduledMarketizationLevel,
  wageFundConstrainedGrowth,
} from "./constants.js";

export const commandEconomyPhase: TurnPhase = {
  name: "commandEconomy",
  run(world) {
    const currentYear = Number(world.meta.date.slice(0, 4));
    for (const ce of Object.values(world.commandEconomy)) {
      const budget = world.budgets[ce.countryId];
      if (!budget) continue;
      // Dual-track ceiling reached: plan machinery stops entirely (mirrors
      // mainline's isPlannedEconomy gate in commandEconomyTurn.ts).
      if (!isPlannedEconomy(ce.marketizationLevel)) continue;

      const share = plannedShare(ce.marketizationLevel);

      // ── LIVE government reformism (P3): who actually governs ──────────────
      const gov = world.governments[ce.countryId];
      const governingParty = gov?.governingPartyId ? world.parties[gov.governingPartyId] : undefined;
      const partyReformism = governmentReformismFromEconomicPosition(governingParty?.economicPosition);
      const reformism = partyReformism ?? NPP_DEFAULT_REFORMISM;
      const internalRepression = internalRepressionFromReformism(reformism);
      const budgetSoftness = NPP_DEFAULT_BUDGET_SOFTNESS; // PORT-STUB: no player Gosbank directive
      const creditAggressiveness = NPP_DEFAULT_CREDIT_AGGRESSIVENESS; // PORT-STUB

      // ── Two-circuit wage fund: constrain nominal wage growth ──────────────
      const wageGrowth = wageFundConstrainedGrowth(
        budget.economicFactors.wageGrowth,
        budget.economicFactors.gdpGrowth,
        share,
      );
      budget.economicFactors.wageGrowth = wageGrowth;

      // ── Overhang / shortage / black market / second economy ───────────────
      const relief = updateSecondEconomy(
        ce.secondEconomyShare,
        ce.shortageIndex,
        ce.monetaryOverhang,
        NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
      ).relief;
      const overhang = accumulateOverhang(
        ce.monetaryOverhang,
        wageGrowth,
        budget.economicFactors.gdpGrowth,
        share,
        relief,
      );
      const shortageIndex = shortageIndexFrom(overhang);
      const blackMarketPremium = blackMarketPremiumFrom(
        shortageIndex,
        overhang,
        NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
      );
      const secondEconomyShare = updateSecondEconomy(
        ce.secondEconomyShare,
        shortageIndex,
        overhang,
        NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
      ).share;

      const pressureBase = blackMarketPressure(shortageIndex, blackMarketPremium, secondEconomyShare);
      const pressureEffective = blackMarketPressure(
        shortageIndex,
        blackMarketPremium,
        secondEconomyShare,
        internalRepression,
      );

      // ── Endogenous marketization drift ─────────────────────────────────────
      const policyStance = computePolicyStance(reformism, creditAggressiveness, budgetSoftness);
      const gravity = marketizationGravity(
        ce.marketizationLevel,
        scheduledMarketizationLevel(ce.countryId, currentYear),
      );
      const drift =
        marketizationDrift(pressureEffective, SOE_PERF_BASELINE, policyStance) + gravity;
      const nextLevel = driftMarketizationLevel(ce.marketizationLevel, drift);

      ce.marketizationLevel = nextLevel;
      ce.monetaryOverhang = overhang;
      ce.shortageIndex = shortageIndex;
      ce.blackMarketPremium = blackMarketPremium;
      ce.secondEconomyShare = secondEconomyShare;
      ce.blackMarketPressureBase = pressureBase;
      ce.blackMarketPressureEffective = pressureEffective;
      ce.governmentReformism = reformism;
      ce.internalRepression = internalRepression;
      ce.budgetSoftness = budgetSoftness;
    }
  },
};
