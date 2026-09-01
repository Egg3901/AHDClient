/**
 * Effect application — maps EventEffect declarations to mutations on WorldState
 * systems that exist in solo: economy fields, support, favorability, party
 * org, budgets, commodity prices. Effects on unported systems become PORT-STUB
 * with blocker named, never silently dropped.
 *
 * Sources:
 *  - treasuryDelta -> budgets.treasuryBalance (src/lib/budget/treasurySpend.ts)
 *  - sectorDemandModifier -> commodityPrices globalPrice drift via activeWorldModifiers
 *    (src/lib/events/substrate/countryModifiers.ts writeSectorDemandModifier)
 *  - favorability -> player/pol favorability (src/lib/events/substrate/applyEffects.ts clampStat)
 *  - partyOrg -> parties[].organization + partyRegions (src/lib/turn/partyOrg/turnProcessing.ts)
 *  - gdpDelta/inflationDelta/unemploymentDelta -> countries[].economy (src/lib/turn/economicModelTurn.ts)
 *  - supportDelta -> candidateSupports (src/lib/turn/elections/supportAccrual.ts)
 */

import type { WorldState } from "../types.js";
import type { EventEffect } from "./catalog.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Apply a list of effects to the world. Returns count of applied vs stubbed.
 */
export function applyEffects(
  world: WorldState,
  countryId: string,
  effects: EventEffect[],
  turn: number,
): { applied: number; stubbed: number; stubs: string[] } {
  let applied = 0;
  let stubbed = 0;
  const stubs: string[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "treasuryDelta": {
        // Budgets system exists: mutate treasuryBalance.
        // Source: src/lib/budget/treasurySpend.ts creditTreasury/spendFromTreasury
        const budget = world.budgets[countryId];
        if (budget) {
          budget.treasuryBalance += effect.delta;
        } else {
          // Fallback to country economy gdp as proxy if budget missing (non-playable)
          const c = world.countries[countryId];
          if (c) c.economy.gdp = Math.max(1, c.economy.gdp + effect.delta);
        }
        applied++;
        break;
      }
      case "approvalDelta": {
        // PORT-STUB: requires governmentApprovals collection (not ported; solo has
        // GovernmentState.confidence but not a generic approvalRating per country).
        // Blocker: governmentApprovals/governmentApprovals.ts
        stubbed++;
        stubs.push(`approvalDelta -> PORT-STUB blocker: governmentApprovals (executive approval) not ported`);
        break;
      }
      case "favorability": {
        // Apply to player if country matches player country, else to a random
        // politician of that country (proxy for national executive favorability).
        if (world.player.countryId === countryId) {
          world.player.favorability = clamp(world.player.favorability + effect.delta, 0, 100);
        } else {
          // Apply to first politician of that country (executive proxy)
          const pol = world.politicians.find((p) => p.countryId === countryId);
          if (pol) pol.favorability = clamp(pol.favorability + effect.delta, 0, 100);
        }
        applied++;
        break;
      }
      case "infamy": {
        if (world.player.countryId === countryId) {
          world.player.infamy = clamp(world.player.infamy + effect.delta, 0, 100);
        } else {
          const pol = world.politicians.find((p) => p.countryId === countryId);
          if (pol) pol.infamy = clamp(pol.infamy + effect.delta, 0, 100);
        }
        applied++;
        break;
      }
      case "partyOrg": {
        // Party org: apply to every party of that country (national org).
        // Source: src/lib/turn/partyOrg/turnProcessing.ts ORG_DECAY_RATE
        for (const party of Object.values(world.parties)) {
          if (party.countryId === countryId) {
            party.organization = clamp(party.organization + effect.delta, 0, 100);
          }
        }
        // Also nudge partyRegions uniformly
        for (const pr of Object.values(world.partyRegions)) {
          if (pr.countryId === countryId) {
            pr.organization = clamp(pr.organization + effect.delta, 0, 100);
          }
        }
        applied++;
        break;
      }
      case "gdpDelta": {
        const c = world.countries[countryId];
        if (c) {
          // delta is percent point, e.g. -0.5 means gdp * 0.995
          c.economy.gdp = Math.max(1, c.economy.gdp * (1 + effect.delta / 100));
        }
        applied++;
        break;
      }
      case "inflationDelta": {
        const c = world.countries[countryId];
        if (c) {
          c.economy.inflationRate = clamp(c.economy.inflationRate + effect.delta / 100, -0.05, 0.20);
        }
        // Also bump budget economicFactors.inflationRate where budget exists
        const budget = world.budgets[countryId];
        if (budget) {
          budget.economicFactors.inflationRate = clamp(budget.economicFactors.inflationRate + effect.delta, -5, 20);
        }
        applied++;
        break;
      }
      case "unemploymentDelta": {
        const c = world.countries[countryId];
        if (c) c.economy.unemploymentRate = clamp(c.economy.unemploymentRate + effect.delta / 100, 0, 0.30);
        applied++;
        break;
      }
      case "sectorDemandModifier":
      case "sectorOutputDemandModifier": {
        // Commodity prices system: write activeWorldModifiers entry that commodityPricesPhase reads.
        // Source: src/lib/events/substrate/countryModifiers.ts
        world.activeWorldModifiers.push({
          countryId,
          kind: "sectorDemandModifier",
          sectorType: effect.sectorType,
          pct: effect.pct,
          expiresAtTurn: turn + effect.durationTurns,
        });
        // Also immediately nudge commodity globalPrice as immediate signal (4% -> price * 1.04)
        const commodity = world.commodityPrices[effect.sectorType];
        if (commodity) {
          const current = commodity.globalPrice ?? commodity.basePrice;
          commodity.globalPrice = current * (1 + effect.pct / 100);
        } else {
          // Create entry if missing (non-standard sectorType like "technology")
          world.commodityPrices[effect.sectorType] = {
            commodity: effect.sectorType,
            basePrice: 100,
            globalPrice: 100 * (1 + effect.pct / 100),
            globalSupply: 0,
            globalDemand: 0,
            turn,
          } as unknown as WorldState["commodityPrices"][string];
        }
        applied++;
        break;
      }
      case "warEmergencyMitigation": {
        stubbed++;
        stubs.push(`warEmergencyMitigation -> PORT-STUB blocker: warEmergencyMitigation/countryModifiers (requires living-conflict tension subsystem)`);
        // Still record modifier so future crisisTurn can read it if wired later
        world.activeWorldModifiers.push({
          countryId,
          kind: "warEmergencyMitigation",
          pct: effect.pct,
          expiresAtTurn: turn + effect.durationTurns,
        });
        break;
      }
      case "civilLibertiesDelta": {
        stubbed++;
        stubs.push(`civilLibertiesDelta -> PORT-STUB blocker: civilLiberties/democratic-health score (not ported)`);
        break;
      }
      case "supportDelta": {
        // Support system: bump every active candidateSupport of that country
        for (const cand of Object.values(world.candidateSupports)) {
          if (cand.countryId === countryId && cand.status === "active") {
            cand.support = clamp(cand.support + effect.delta, 0, 100);
          }
        }
        applied++;
        break;
      }
      case "politicalInfluence": {
        // Party influence: bump player/politicians
        if (world.player.countryId === countryId) {
          world.player.politicalInfluence = clamp(world.player.politicalInfluence + effect.delta, 0, 100);
        } else {
          for (const pol of world.politicians.filter((p) => p.countryId === countryId)) {
            pol.politicalInfluence = clamp(pol.politicalInfluence + effect.delta, 0, 100);
          }
        }
        applied++;
        break;
      }
      case "personalWealth": {
        // Player cash
        world.player.cash += effect.delta;
        applied++;
        break;
      }
      case "wireOnly": {
        // Pure news, no mechanical effect — counts as applied (news is the effect)
        applied++;
        break;
      }
      case "PORT-STUB": {
        stubbed++;
        stubs.push(`${effect.originalType} -> PORT-STUB blocker: ${effect.blocker}`);
        break;
      }
      default: {
        const unknown = effect as unknown as { type: string };
        stubbed++;
        stubs.push(`${unknown.type} -> PORT-STUB blocker: unknown effect type`);
        break;
      }
    }
  }

  return { applied, stubbed, stubs };
}
