/**
 * Typed action execution API.
 * Ports src/lib/actions/commands/executeAction.ts validation (cost/cooldown/eligibility)
 * and dispatches per-action effects deterministically.
 */

import type { WorldState } from "../types.js";
import { ACTION_CATALOG, getActionCost, type ActionId } from "./catalog.js";
import { fundraiseYield } from "./fundGeneration.js";
import { DOLLARS_PER_TURNOUT_POINT } from "../support/constants.js";
import { applyBoost, calculateAlignmentMultiplier, getVoterGroups, DEFAULT_GOTV_CATEGORY } from "../support/turnout.js";
import { decayPressure } from "../support/pressure.js";

export type ExecuteActionParams = {
  regionId?: string;
  amount?: number; // for convertCash
};

export type ExecuteActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function findActor(world: WorldState, actorId: string): { kind: "player" | "politician"; entity: any } | null {
  if (actorId === "player") return { kind: "player", entity: world.player };
  const pol = world.politicians.find((p) => p.id === actorId);
  if (pol) return { kind: "politician", entity: pol };
  return null;
}

export function executeAction(
  world: WorldState,
  actorId: string,
  actionId: string,
  params: ExecuteActionParams = {},
): ExecuteActionResult {
  const catalog = (ACTION_CATALOG as Record<string, typeof ACTION_CATALOG[ActionId]>)[actionId];
  if (!catalog) return { ok: false, error: `Unknown action: ${actionId}` };

  if (catalog.status === "unavailable") {
    return { ok: false, error: `Action ${actionId} unavailable: ${catalog.blockingSystem ?? "unported system"}` };
  }

  const found = findActor(world, actorId);
  if (!found) return { ok: false, error: `Unknown actor: ${actorId}` };
  const actor = found.entity as {
    actions: number;
    funds: number;
    donorBaseLevel: number;
    politicalInfluence: number;
    favorability: number;
    infamy: number;
    partyId?: string;
    countryId: string;
    cash?: number;
    actionCooldowns: Record<string, number>;
  };

  const turn = world.meta.turn;

  // Cooldown check
  const readyAt = actor.actionCooldowns[actionId] ?? 0;
  if (turn < readyAt) return { ok: false, error: `Action ${actionId} on cooldown until turn ${readyAt}` };

  // Cost check (dynamic)
  const cost = getActionCost(catalog, actor.donorBaseLevel ?? 0, actor.politicalInfluence ?? 0, actor.favorability ?? 50);
  if ((actor.actions ?? 0) < cost) return { ok: false, error: `Not enough action points. Required: ${cost}, Available: ${actor.actions}` };

  // Fund cost check (fundCost is flat for solo-neutral; campaign uses tier scaling simplified)
  // For campaign/advertise we scale fund cost by tier neutral 1.0
  let fundCost = catalog.fundCost;
  if (actionId === "campaign") {
    // Port getCampaignFundCost tier scaling at neutral gdpScalar 1.0: tier 1-5 => (1 + (tier-1)*0.2)
    const tier = cost; // campaign cost equals tier (1-5)
    const mult = 1 + (tier - 1) * 0.2;
    fundCost = Math.round((20_000 * tier * mult) / 1_000) * 1_000;
  }
  if (actionId === "advertise") {
    const tierIdx = cost - 5; // 0-4
    const mult = 1 + tierIdx * 0.2;
    fundCost = Math.round((100_000 * mult) / 1_000) * 1_000;
  }
  if (actionId === "buildDonorBase") {
    fundCost = Math.round((3_000 + (actor.donorBaseLevel ?? 0) * 1_500) / 1_000) * 1_000;
  }
  if (fundCost > 0) {
    // Prefer campaign funds; allow actor.funds only (player funds field)
    const available = actor.funds ?? 0;
    if (available < fundCost) return { ok: false, error: `Not enough funds. Required: ${fundCost}, Available: ${available}` };
  }

  // Eligibility per-type
  if (actionId === "fundraise" && (actor.donorBaseLevel ?? 0) === 0) {
    return { ok: false, error: "No donor base. Use Build Donor Network first." };
  }
  if (actionId === "convertCash") {
    const amount = params.amount ?? actor.cash ?? 0;
    if (amount <= 0) return { ok: false, error: "No amount to convert" };
    if ((actor.cash ?? 0) < amount) return { ok: false, error: `Not enough cash. Available: ${actor.cash}` };
  }
  if ((actionId === "canvass" || actionId === "organize" || actionId === "pressureBoost") && !params.regionId) {
    return { ok: false, error: `Action ${actionId} requires a regionId` };
  }

  // Deduct action points + cooldown stamp
  actor.actions -= cost;
  if (catalog.cooldown > 0) actor.actionCooldowns[actionId] = turn + catalog.cooldown + 1;

  // Deduct fund cost where applicable (except convertCash which adds)
  if (fundCost > 0 && actionId !== "convertCash" && actionId !== "rest" && actionId !== "investInfluence") {
    actor.funds -= fundCost;
  }

  // Dispatch effects
  const actorPartyId = actor.partyId as string | undefined;
  const actorCountry = actor.countryId;

  if (actionId === "fundraise") {
    const yieldAmt = fundraiseYield(actor.donorBaseLevel ?? 0, actor.politicalInfluence ?? 0);
    actor.funds = (actor.funds ?? 0) + yieldAmt;
    return { ok: true, message: `Raised ${yieldAmt} from donors.` };
  }
  if (actionId === "campaign") {
    // Increase politicalInfluence with diminishing returns above 50, mirroring campaignInfluenceGain
    const cur = actor.politicalInfluence ?? 0;
    const baseGain = 1;
    const threshold = 50;
    const rate = 1 / 75;
    const penalty = cur > threshold ? (cur - threshold) * rate : 0;
    const gain = Math.max(0.1, baseGain - penalty);
    actor.politicalInfluence = Math.min(100, cur + gain);
    // Also queue support accrual for candidateSupport entry if politician
    if (found.kind === "politician") {
      const cand = world.candidateSupports[actorId];
      if (cand && cand.status === "active") {
        // Simple: push a 1-turn accrual of +2 support per campaign action
        cand.supportAccrual.push({ amountPerTurn: 2, turnsRemaining: 3 });
      }
    }
    return { ok: true, message: `Campaigned: +${gain.toFixed(2)} influence.` };
  }
  if (actionId === "advertise") {
    const cur = actor.favorability ?? 50;
    const baseGain = 3;
    const penalty = cur > 70 ? (cur - 70) * 0.1 : 0;
    const gain = Math.max(1, Math.floor(baseGain - penalty));
    actor.favorability = Math.min(100, cur + gain);
    return { ok: true, message: `Advertised: +${gain} favorability.` };
  }
  if (actionId === "buildDonorBase") {
    actor.donorBaseLevel = (actor.donorBaseLevel ?? 0) + 1;
    return { ok: true, message: `Donor base now ${actor.donorBaseLevel}.` };
  }
  if (actionId === "convertCash") {
    const amount = params.amount ?? 0;
    const converted = Math.floor(amount * 0.5);
    const infamy = Math.min(100, Math.round(15 * Math.pow(amount / 1_000_000, 0.564)));
    actor.cash = (actor.cash ?? 0) - amount;
    actor.funds = (actor.funds ?? 0) + converted;
    actor.infamy = Math.min(100, (actor.infamy ?? 0) + infamy);
    return { ok: true, message: `Converted ${amount} cash to ${converted} funds.` };
  }
  if (actionId === "rest") {
    return { ok: true, message: "Rested." };
  }
  if (actionId === "canvass") {
    const regionId = params.regionId!;
    const rt = world.regionTurnouts[regionId];
    if (!rt) return { ok: false, error: `Unknown region ${regionId}` };
    // Apply a boost similar to partyGOTV but directly
    const party = actorPartyId ? world.parties[actorPartyId] : null;
    const groups = getVoterGroups(actorCountry);
    const eligible = groups.filter((g) => {
      if (!party) return true;
      return Math.abs(party.economicPosition - g.economicLean) <= 2 && Math.abs(party.socialPosition - g.socialLean) <= 2;
    });
    if (eligible.length === 0) return { ok: true, message: "No eligible voter groups." };
    const group = eligible[0]!;
    const align = party ? calculateAlignmentMultiplier(party.economicPosition, party.socialPosition, group.economicLean, group.socialLean) : 1;
    const boost = (15_000 / DOLLARS_PER_TURNOUT_POINT) * align; // fixed spend metaphor
    if (!rt.modifiers[DEFAULT_GOTV_CATEGORY]) rt.modifiers[DEFAULT_GOTV_CATEGORY] = {};
    if (!(group.id in (rt.modifiers[DEFAULT_GOTV_CATEGORY] ?? {}))) rt.modifiers[DEFAULT_GOTV_CATEGORY]![group.id] = 0;
    applyBoost(rt.modifiers, DEFAULT_GOTV_CATEGORY, group.id, boost);
    return { ok: true, message: `Canvassed ${regionId}: +${boost.toFixed(2)} turnout.` };
  }
  if (actionId === "organize") {
    const regionId = params.regionId!;
    const key = `${regionId}:${actorPartyId}`;
    const pr = world.partyRegions[key];
    if (!pr) return { ok: false, error: `No party region ${key}` };
    pr.organization = Math.min(100, pr.organization + 5);
    return { ok: true, message: `Organized ${regionId}: org ${pr.organization}.` };
  }
  if (actionId === "pressureBoost") {
    const regionId = params.regionId!;
    const pkey = `${actorPartyId}:${regionId}`;
    let pp = world.partyPressures[pkey];
    if (!pp) {
      pp = { partyId: actorPartyId ?? "unknown", regionId, countryId: actorCountry, value: 0 };
      world.partyPressures[pkey] = pp;
    }
    pp.value = Math.min(100, pp.value + 10);
    // ensure decay not zeroed immediately
    void decayPressure; // cite import
    return { ok: true, message: `Pressure ${pkey} now ${pp.value}.` };
  }
  if (actionId === "investInfluence") {
    const pol = found.kind === "politician" ? actor as unknown as { partyInfluence: number; bonusActions: number } : null;
    if (!pol) return { ok: false, error: "Only politicians can invest influence" };
    if ((pol.partyInfluence ?? 0) < 10) return { ok: false, error: "Need at least 10 party influence to invest" };
    pol.partyInfluence -= 10;
    // bonusActions consumed by actionRefresh; add directly to actions for immediacy
    (actor as unknown as { actions: number }).actions += 2;
    return { ok: true, message: "Invested 10 influence for +2 actions." };
  }

  return { ok: false, error: `No effect for ${actionId}` };
}
