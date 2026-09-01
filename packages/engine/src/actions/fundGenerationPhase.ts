/**
 * Fund generation phase.
 * Ports src/lib/turn/fundGeneration.ts processFundGeneration at mainline-neutral
 * scale but adapted to solo's opaque regions and politician-centric income.
 *
 * Each politician generates funds per turn using getTotalFundGenerationForPolitician
 * at a neutral population (5M = medium tier, 10k base) and GDP scalar 1.0.
 * Taxes: stateTaxRate and nationalTaxRate are PORT-STUB at neutral 0 unless
 * parties configure them; solo defaults to 5% national tax if party.treasury
 * exists to keep a party income stream. Real mainline uses party-specific
 * nationalTaxRate/stateTaxRate per StatePartyOrg; solo uses a flat 5% split
 * when treasury income is enabled.
 *
 * Deterministic pure phase.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { getTotalFundGenerationForPolitician, calculateTaxAmount } from "./fundGeneration.js";

// Neutral population for solo politicians (medium tier) — mainline base 10k
const NEUTRAL_POPULATION = 5_000_000;

// Flat national tax at PORT-STUB neutral 5% when party has tax enabled (mainline 0-33)
const DEFAULT_NATIONAL_TAX_RATE = 5;

export const fundGenerationPhase: TurnPhase = {
  name: "fundGeneration",
  run(world: WorldState) {
    // Use a notional per-politician state GDP derived from country economy:
    // gdpScalar uses country average (undefined -> 1.0) to keep neutral.
    for (const pol of world.politicians) {
      const generation = getTotalFundGenerationForPolitician({
        population: NEUTRAL_POPULATION,
        donorBaseLevel: pol.donorBaseLevel ?? 0,
        chamberKey: pol.chamberKey ?? null,
        countryId: pol.countryId,
        politicalInfluence: pol.politicalInfluence ?? 0,
      });

      // Taxes go to party treasury
      const party = world.parties[pol.partyId];
      const nationalTaxRate = DEFAULT_NATIONAL_TAX_RATE; // PORT-STUB neutral, cited as mainline 0 when not configured
      const tax = party ? calculateTaxAmount(generation, nationalTaxRate) : 0;
      const net = generation - tax;

      pol.funds = (pol.funds ?? 0) + net;
      if (party) party.treasury = (party.treasury ?? 0) + tax;
    }

    // Player also generates
    const playerPoliticalInfluence = (world.player as unknown as { politicalInfluence?: number }).politicalInfluence ?? 0;
    const playerDonor = (world.player as unknown as { donorBaseLevel?: number }).donorBaseLevel ?? 0;
    // Player generation uses player's country for office/gdp baseline; office bonus 0
    const playerGeneration = getTotalFundGenerationForPolitician({
      population: NEUTRAL_POPULATION,
      donorBaseLevel: playerDonor,
      chamberKey: null,
      countryId: world.player.countryId,
      politicalInfluence: playerPoliticalInfluence,
    });
    // Player funds are separate from party; no tax split for player (independent)
    // For simplicity add directly to player funds
    (world.player as unknown as { funds: number }).funds = ((world.player as unknown as { funds: number }).funds ?? 0) + playerGeneration;
  },
};

/**
 * Compute real revenue for a party from member fund generation.
 * Used by GOTV to replace stubRevenueFromOrgPs at mainline-neutral scale.
 * Revenue = sum of taxed generation per member = sum of calculateTaxAmount(generation, DEFAULT_NATIONAL_TAX_RATE)
 */
export function computePartyRevenue(world: WorldState, partyId: string): number {
  const party = world.parties[partyId];
  if (!party) return 0;
  let revenue = 0;
  for (const pol of world.politicians) {
    if (pol.partyId !== partyId) continue;
    const gen = getTotalFundGenerationForPolitician({
      population: NEUTRAL_POPULATION,
      donorBaseLevel: pol.donorBaseLevel ?? 0,
      chamberKey: pol.chamberKey ?? null,
      countryId: pol.countryId,
      politicalInfluence: pol.politicalInfluence ?? 0,
    });
    revenue += calculateTaxAmount(gen, DEFAULT_NATIONAL_TAX_RATE);
  }
  return revenue;
}
