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
import * as Membership from "../membership.js";
import * as Caucus from "../caucus.js";
import * as Endorsement from "../endorsement.js";

export type ExecuteActionParams = {
  regionId?: string;
  amount?: number; // for convertCash
  partyId?: string;
  caucusId?: string;
  caucusName?: string;
  caucusTaxRate?: number;
  foundPartyName?: string;
  foundPartyAbbr?: string;
  endorsedId?: string;
  endorsedType?: "party" | "politician";
  endorsementId?: string;
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
  // Membership eligibility: party actions require membership (ports mainline party actions gating)
  const membershipGated = new Set(["organize", "pressureBoost", "investInfluence", "createCaucus", "joinCaucus", "leaveCaucus", "endorse"]);
  if (found.kind === "player" && membershipGated.has(actionId)) {
    const pid = (world.player as unknown as { partyId: string | null }).partyId;
    if (actionId === "createCaucus" || actionId === "joinCaucus" || actionId === "leaveCaucus") {
      // handled via caucus helpers but still require party
      if (!pid && actionId !== "leaveCaucus") {
        // leaveCaucus also requires membership indirectly but caucus helper will error
      }
    }
    if (actionId === "organize" || actionId === "pressureBoost" || actionId === "investInfluence") {
      if (!pid) return { ok: false, error: `Action ${actionId} requires party membership` };
    }
    if (actionId === "endorse" && !pid) return { ok: false, error: "Must be a party member to endorse" };
  }
  if (actionId === "joinParty" && !params.partyId) return { ok: false, error: "joinParty requires partyId" };
  if (actionId === "foundParty" && (!params.foundPartyName || !params.foundPartyAbbr)) return { ok: false, error: "foundParty requires foundPartyName and foundPartyAbbr" };
  if (actionId === "createCaucus" && !params.caucusName) return { ok: false, error: "createCaucus requires caucusName" };
  if (actionId === "joinCaucus" && !params.caucusId) return { ok: false, error: "joinCaucus requires caucusId" };
  if (actionId === "endorse" && !params.endorsedId) return { ok: false, error: "endorse requires endorsedId" };

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
  if (actionId === "joinParty") {
    if (found.kind !== "player") return { ok: false, error: "Only player can join parties" };
    // Pre-charge already done; refund on failure
    const res = Membership.joinParty(world, params.partyId!);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Joined party ${params.partyId}` };
  }
  if (actionId === "leaveParty") {
    if (found.kind !== "player") return { ok: false, error: "Only player can leave parties" };
    const res = Membership.leaveParty(world);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: "Left party" };
  }
  if (actionId === "foundParty") {
    if (found.kind !== "player") return { ok: false, error: "Only player can found parties" };
    const res = Membership.foundParty(world, { name: params.foundPartyName!, abbreviation: params.foundPartyAbbr! });
    if (!res.ok) {
      actor.actions += cost;
      // funds not yet debited via membership? we already debited via catalog fundCost; need to compensate
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    // Membership.foundParty already deducted FOUND_PARTY_FUND_COST which equals catalog fundCost; we double-debited.
    // Refund one copy: catalog debited fundCost, so restore.
    actor.funds += fundCost;
    // Now apply the single correct deduction via membership (already done). So we keep funds as is after refund.
    // But membership deducted from player.funds directly; we need to undo catalog's deduction and keep membership's.
    // We refunded catalog, so net is membership deduction only. Correct.
    return { ok: true, message: `Founded party ${res.partyId}` };
  }
  if (actionId === "createCaucus") {
    if (found.kind !== "player") return { ok: false, error: "Only player can create caucuses" };
    const taxRate = params.caucusTaxRate ?? 0;
    const res = Caucus.createCaucus(world, params.caucusName!, taxRate);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    // createCaucus already deducted its own fund cost (same as catalog); fix double debit
    actor.funds += fundCost;
    return { ok: true, message: `Created caucus ${res.caucusId}` };
  }
  if (actionId === "joinCaucus") {
    if (found.kind !== "player") return { ok: false, error: "Only player can join caucuses" };
    const res = Caucus.joinCaucus(world, params.caucusId!);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Joined caucus ${params.caucusId}` };
  }
  if (actionId === "leaveCaucus") {
    if (found.kind !== "player") return { ok: false, error: "Only player can leave caucuses" };
    const res = Caucus.leaveCaucus(world);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: "Left caucus" };
  }
  if (actionId === "endorse") {
    if (found.kind !== "player") return { ok: false, error: "Only player can endorse" };
    const endorsedType = params.endorsedType ?? "politician";
    const res = Endorsement.endorse(world, params.endorsedId!, endorsedType);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error };
    }
    return { ok: true, message: `Endorsed ${params.endorsedId}` };
  }

  return { ok: false, error: `No effect for ${actionId}` };
}
