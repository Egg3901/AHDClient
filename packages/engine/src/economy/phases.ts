/**
 * W14 turn phases: capital stock, unowned sector growth, state ownership
 * concentration. See capitalStock.ts / unownedSectorGrowth.ts /
 * stateOwnershipConcentration.ts for the ported formulas and PORT-STUB notes.
 */
import type { TurnPhase } from "../phases/types.js";
import { advanceCapitalStock, NEUTRAL_PRIME_RATE, seedCapitalStock } from "./capitalStock.js";
import { growUnownedSectorRevenue } from "./unownedSectorGrowth.js";
import { clampConcentration } from "./stateOwnershipConcentration.js";
import { plannedShare } from "../commandEconomy/constants.js";
import { CENTRAL_BANK_COUNTRY_ANCHORS } from "../centralBank/constants.js";
import { annualizedGrowthRate } from "../demographics/laborForce.js";
import { TURNS_PER_YEAR } from "./macroConstants.js";

/**
 * Advance every region's Solow capital stock one turn, then roll up each
 * country's aggregate annualized ΔK/K into `world.capitalGrowth` — the input
 * macroCountryTurn.ts's potential-growth `gK` term reads NEXT turn (this
 * phase runs in the tail, after macroCountryTurn already ran this turn — same
 * one-turn-lag shape as W9's corpRevenueSnapshots; see macroCountryTurn.ts
 * file doc at the gK assignment).
 */
export const advanceCapitalStockPhase: TurnPhase = {
  name: "advanceCapitalStock",
  run(world) {
    const prevTotalByCountry = new Map<string, number>();
    const newTotalByCountry = new Map<string, number>();
    for (const [regionId, region] of Object.entries(world.regions)) {
      const gdp = region.gdp ?? 0;
      const prevCapital = world.capitalStock[regionId] ?? seedCapitalStock(gdp);
      const bank = world.centralBanks[region.countryId];
      const anchor = CENTRAL_BANK_COUNTRY_ANCHORS[region.countryId];
      const step = advanceCapitalStock(
        prevCapital,
        gdp,
        bank?.primeRate ?? NEUTRAL_PRIME_RATE,
        TURNS_PER_YEAR,
        0,
        anchor?.neutralPrimeRate,
      );
      world.capitalStock[regionId] = step.capital;
      prevTotalByCountry.set(
        region.countryId,
        (prevTotalByCountry.get(region.countryId) ?? 0) + prevCapital,
      );
      newTotalByCountry.set(
        region.countryId,
        (newTotalByCountry.get(region.countryId) ?? 0) + step.capital,
      );
    }
    for (const [countryId, newTotal] of newTotalByCountry) {
      const prevTotal = prevTotalByCountry.get(countryId) ?? 0;
      world.capitalGrowth[countryId] = annualizedGrowthRate(newTotal, prevTotal, TURNS_PER_YEAR);
    }
  },
};

/** Grow every unowned-sector revenue pool one turn from its paired corp's growthRate. */
export const unownedSectorGrowthPhase: TurnPhase = {
  name: "unownedSectorGrowth",
  run(world) {
    for (const unowned of Object.values(world.unownedSectors)) {
      const corp = world.corporations[`${unowned.countryId}-${unowned.sectorType}`];
      unowned.revenue = growUnownedSectorRevenue(unowned.revenue, corp?.currentGrowthRate);
    }
  },
};

/**
 * Recompute each country's State Ownership Concentration Index from the LIVE
 * marketization dial (see stateOwnershipConcentration.ts file doc for the
 * plannedShare substitution). Runs after commandEconomyPhase so it reads this
 * turn's freshly-drifted marketizationLevel, not last turn's.
 */
export const stateOwnershipConcentrationPhase: TurnPhase = {
  name: "stateOwnershipConcentration",
  run(world) {
    for (const [countryId, budget] of Object.entries(world.budgets)) {
      const ce = world.commandEconomy[countryId];
      const soci = ce ? clampConcentration(plannedShare(ce.marketizationLevel) * 100) : 0;
      budget.stateOwnershipConcentration = soci;
    }
  },
};
