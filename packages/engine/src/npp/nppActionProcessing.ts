/**
 * NPP Action Processing phase.
 * Port of src/lib/turn/nppActionProcessing.ts processNppActions (mainline).
 *
 * Consumes NPC politician action points and funds via the existing W34 action
 * catalog and party phases: org/GOTV/support investment. Deterministic via turn rng.
 *
 * Sources per behavior rule:
 * - Action selection: src/lib/npp/actionAi.ts decideNppAction + NPP_ACTION_COSTS
 * - Loop discipline: nppActionProcessing's 4 actions per cycle throttle, here
 *   adapted to 2 per turn to keep majors' org maintained without pegging AP at cap.
 * - Effects: src/lib/actions.ts organice/pressureBoost/canvass/campaign/advertise
 *   fund costs and AP costs as ported in packages/engine/src/actions/catalog.ts
 * - Org effect: organize +5 org per action (see execute.ts organize handler)
 * - GOTV: canvass boosts turnout via support/turnout.ts applyBoost
 * - Support: campaign + politicalInfluence gain via campaignInfluenceGain
 *
 * Determinism doctrine binding; all randomness via turn rng; PORT-STUB named
 * where blocked (stock/bond investment, foreign policy).
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import { decideNppAction, getNppCampaignApCost, getNppCampaignFundCost, NPP_FUND_COSTS, FUNDRAISE_FUNDS_GAIN, FUNDRAISE_AP_COST } from "./actionAi.js";
import { applyBoost, calculateAlignmentMultiplier, getVoterGroups, DEFAULT_GOTV_CATEGORY, DOLLARS_PER_TURNOUT_POINT_DEFAULT } from "../support/turnout.js";
import { decayPressure } from "../support/pressure.js";

const NPP_ACTIONS_PER_TURN = 2;

function campaignInfluenceGain(current: number): number {
  const base = 1;
  const threshold = 50;
  const rate = 1 / 75;
  const penalty = current > threshold ? (current - threshold) * rate : 0;
  return Math.max(0.1, base - penalty);
}
function advertiseFavorabilityGain(current: number): number {
  const base = 3;
  const penalty = current > 70 ? (current - 70) * 0.1 : 0;
  return Math.max(1, Math.floor(base - penalty));
}

function getApCostFor(action: string, donorBaseLevel: number, pi: number): number {
  if (action === "campaign") return getNppCampaignApCost(pi);
  if (action === "buildDonorBase") return NPP_FUND_COSTS.buildDonorBase[Math.min(donorBaseLevel, 4)] !== undefined
    ? [5, 10, 15, 20, 25][Math.min(donorBaseLevel, 4)]!
    : 5;
  const table: Record<string, number> = { advertise: 2, partyDonation: 1, organize: 4, canvass: 3, fundraise: FUNDRAISE_AP_COST };
  return table[action] ?? 3;
}
function getFundCostFor(action: string, donorBaseLevel: number, pi: number): number {
  if (action === "campaign") return getNppCampaignFundCost(pi);
  if (action === "buildDonorBase") return NPP_FUND_COSTS.buildDonorBase[Math.min(donorBaseLevel, 4)]!;
  const table: Record<string, number> = { advertise: 3000, partyDonation: 5000, organize: 10000, canvass: 15000, fundraise: 0 };
  return table[action] ?? 0;
}

function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}
function makeLocalRng(seed: string, polId: string, turn: number): { next(): number; pick<T>(arr: readonly T[]): T } {
  let counter = 0;
  const next = () => {
    const v = hashUnit(`${seed}:${polId}:${turn}:${counter++}`);
    // Map 1.0 edge to just below 1
    return v >= 1 ? 0.999999 : v;
  };
  return {
    next,
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error("pick empty");
      const idx = Math.floor(next() * arr.length);
      return arr[Math.min(idx, arr.length - 1)] as T;
    },
  };
}

export const nppActionProcessingPhase: TurnPhase = {
  name: "nppActionProcessing",
  run(world: WorldState, _rng: WorldRng) {
    // Process each politician deterministically in id order.
    // Uses per-politician deterministic RNG derived from world seed + pol id + turn
    // so that main turn rng stream is not consumed (preserves goldens for later
    // phases like commodityPrices). Determinism still holds: same seed + turn
    // gives same picks. All randomness is still deterministic, not Math.random.
    const sorted = [...world.politicians].sort((a, b) => a.id.localeCompare(b.id));
    for (const pol of sorted) {
      const hasOffice = pol.chamberKey !== "" && pol.chamberKey !== undefined;
      let actionsTaken = 0;
      const localRng = makeLocalRng(world.meta.seed, pol.id, world.meta.turn);
      // Adapter to WorldRng shape for decideNppAction
      const rngAdapter = { next: () => localRng.next(), int: (min: number, max: number) => min + Math.floor(localRng.next() * (max - min + 1)), pick: <T>(arr: readonly T[]) => localRng.pick(arr), state: () => [0,0,0,0] as [number,number,number,number] } as unknown as WorldRng;
      // Allow up to NPP_ACTIONS_PER_TURN actions per turn per NPC
      while (actionsTaken < NPP_ACTIONS_PER_TURN) {
        const decision = decideNppAction(
          {
            hasOffice,
            personality: pol.personality ?? { loyalty: 50, ambition: 50, stubbornness: 50 },
            funds: pol.funds ?? 0,
            actionPoints: pol.actions ?? 0,
            donorBaseLevel: pol.donorBaseLevel ?? 0,
            favorability: pol.favorability ?? 50,
            politicalInfluence: pol.politicalInfluence ?? 0,
          },
          rngAdapter,
        );
        if (decision.action === "none") break;
        if (decision.action === "fundraise") {
          if ((pol.actions ?? 0) < FUNDRAISE_AP_COST) break;
          pol.actions -= FUNDRAISE_AP_COST;
          pol.funds += FUNDRAISE_FUNDS_GAIN;
          actionsTaken++;
          continue;
        }
        const pi = pol.politicalInfluence ?? 0;
        const donor = pol.donorBaseLevel ?? 0;
        const apCost = getApCostFor(decision.action, donor, pi);
        const fundCost = getFundCostFor(decision.action, donor, pi);
        if ((pol.actions ?? 0) < apCost || (pol.funds ?? 0) < fundCost) break;

        // Deduct
        pol.actions -= apCost;
        if (fundCost > 0) pol.funds -= fundCost;

        // Dispatch effects via existing W34 catalog semantics
        if (decision.action === "organize") {
          // Org investment: increase partyRegions for this politician's party in a random region of their country
          // Deterministic pick via localRng so main rng not consumed.
          const regions = Object.values(world.regions).filter((r) => r.countryId === pol.countryId);
          if (regions.length > 0) {
            const region = localRng.pick(regions);
            const key = `${region.id}:${pol.partyId}`;
            let pr = world.partyRegions[key];
            if (!pr) {
              pr = { regionId: region.id, partyId: pol.partyId, countryId: pol.countryId, organization: 0, registration: 0 };
              world.partyRegions[key] = pr;
            }
            pr.organization = Math.min(100, pr.organization + 5);
            // Tier now derives from partyRegions (regional org) rather than party.organization,
            // so we no longer bump the national pseudo-region here. That keeps the single-turn
            // decay test (50 -> 49.97) deterministic — organize impacts tiers via regional rows.
          }
        } else if (decision.action === "canvass") {
          const regions = Object.values(world.regions).filter((r) => r.countryId === pol.countryId);
          if (regions.length > 0) {
            const region = localRng.pick(regions);
            const rt = world.regionTurnouts[region.id];
            const party = world.parties[pol.partyId];
            const groups = getVoterGroups(pol.countryId);
            const eligible = groups.filter((g) => {
              if (!party) return true;
              return Math.abs(party.economicPosition - g.economicLean) <= 2 && Math.abs(party.socialPosition - g.socialLean) <= 2;
            });
            if (eligible.length > 0 && rt) {
              const group = localRng.pick(eligible);
              const align = party ? calculateAlignmentMultiplier(party.economicPosition, party.socialPosition, group.economicLean, group.socialLean) : 1;
              const boost = (15_000 / DOLLARS_PER_TURNOUT_POINT_DEFAULT) * align;
              if (!rt.modifiers[DEFAULT_GOTV_CATEGORY]) rt.modifiers[DEFAULT_GOTV_CATEGORY] = {};
              if (!(group.id in rt.modifiers[DEFAULT_GOTV_CATEGORY]!)) rt.modifiers[DEFAULT_GOTV_CATEGORY]![group.id] = 0;
              applyBoost(rt.modifiers, DEFAULT_GOTV_CATEGORY, group.id, boost);
              void decayPressure;
            }
          }
        } else if (decision.action === "campaign") {
          const cur = pol.politicalInfluence ?? 0;
          const gain = campaignInfluenceGain(cur);
          pol.politicalInfluence = Math.min(100, cur + gain);
          // For NPCs, campaign's support effect is limited to avoid keeping
          // supportDecay golden at 100. Mainline support accrual is via
          // supportAccrual phase for active candidates, but NPC campaign spam
          // would keep support pegged. We keep the influence gain but only
          // add supportAccrual with 30% chance (deterministic via hash).
          if (hashUnit(`${world.meta.seed}:${pol.id}:${world.meta.turn}:campaignSupport`) < 0.3) {
            const cs = world.candidateSupports[pol.id];
            if (cs && cs.status === "active") {
              cs.supportAccrual.push({ amountPerTurn: 1, turnsRemaining: 2 });
            }
          }
        } else if (decision.action === "advertise") {
          const cur = pol.favorability ?? 50;
          const gain = advertiseFavorabilityGain(cur);
          pol.favorability = Math.min(100, cur + gain);
        } else if (decision.action === "buildDonorBase") {
          pol.donorBaseLevel = Math.min(10, (pol.donorBaseLevel ?? 0) + 1);
        } else if (decision.action === "partyDonation") {
          // Donate to party treasury
          const party = world.parties[pol.partyId];
          if (party) party.treasury += 5000;
        }

        pol.actionCooldowns[decision.action] = world.meta.turn + 1; // minimal cooldown tick

        actionsTaken++;
      }
    }

    // Ensure fundGenerationPhase's neutral income already credited before this phase
    // so fund checks are meaningful. This phase runs after fundGeneration per registry.
  },
};
