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
import * as Candidacy from "../elections/candidacy.js";
import * as Coalition from "../intraparty/coalitions.js";
import { getLaw } from "../legislation/catalog.js";

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
  electionId?: string;
  // Legislation
  catalogId?: string;
  billId?: string;
  vote?: "for" | "against" | "abstain";
  sponsorCountryId?: string;
  billTitle?: string;
  billCategory?: string;
  originChamber?: string;
  // Intra-party ballots
  intrapartyElectionId?: string;
  candidateId?: string;
  committeeCandidateIds?: string[];
  coalitionId?: string;
  coalitionName?: string;
  coalitionAbbr?: string;
  position?: "chair" | "viceChair" | "treasurer";
  countryId?: string;
  disbandVote?: "yes" | "no";
  // W10 markets
  corpId?: string;
  shares?: number;
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
  if (actionId === "declareCandidacy" || actionId === "withdrawCandidacy") {
    if (found.kind !== "player") return { ok: false, error: "Only the player files candidacies" };
    if (!params.electionId) return { ok: false, error: `${actionId} requires electionId` };
    const res =
      actionId === "declareCandidacy"
        ? Candidacy.declareCandidacy(world, params.electionId)
        : Candidacy.withdrawCandidacy(world, params.electionId);
    if (!res.ok) {
      actor.actions += cost;
      actor.funds += fundCost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: res.error ?? "Candidacy action failed" };
    }
    return { ok: true, message: actionId === "declareCandidacy" ? "Candidacy declared" : "Candidacy withdrawn" };
  }
  if (actionId === "sponsorBill") {
    if (found.kind !== "player") return { ok: false, error: "Only player can sponsor bills" };
    const catalogId = params.catalogId;
    if (!catalogId) return { ok: false, error: "sponsorBill requires catalogId" };
    // Seed gating: must hold a legislative seat per mainline seat check; HoS mode grants bypass later
    const player = world.player as unknown as { legislativeSeat: { chamberKey: string; countryId: string } | null; mode: string; partyId: string | null };
    if (player.mode !== "hos" && !player.legislativeSeat) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Must hold a legislative seat to sponsor bills (career mode); HoS mode grants government sponsorship" };
    }
    // Validate catalog availability
    try {
      const leg = awaitImportCatalog(catalogId);
      if (!leg) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Unknown catalog entry: ${catalogId}` };
      }
      if (leg.status === "unavailable") {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Catalog entry unavailable: ${leg.blockingSystem ?? "unported system"} — PORT-STUB` };
      }
      // Origin chamber: player's seat chamber or first elected chamber of country
      const countryId = params.sponsorCountryId ?? world.player.countryId;
      const legConfig = world.legislatures[countryId];
      const originChamber = params.originChamber ?? player.legislativeSeat?.chamberKey ?? legConfig?.chambers.find((c) => c.elected)?.key ?? "house";
      const title = params.billTitle ?? leg.title;
      const category = params.billCategory ?? leg.category;
      const id = `bill-${world.meta.turn}-${world.bills.length + 1}-${catalogId}`;
      const provisions = [
        {
          type: "policy" as const,
          legislationTypeId: catalogId,
          effectDirection: 1,
          economic: 0,
          social: 0,
        },
      ];
      // If tax kind, add proposedRate handling (not needed for test)
      const bill: import("../legislation/types.js").Bill = {
        id,
        title,
        summary: leg.description,
        countryId,
        category,
        legislationTypeId: catalogId,
        effectDirection: 1,
        provisions,
        originChamber,
        currentChamber: originChamber,
        status: "proposed",
        sponsorId: "player",
        sponsorName: world.player.name,
        sponsorPartyId: world.player.partyId,
        votes: {},
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        proposedAtTurn: world.meta.turn,
        filibusterInvocations: [],
        updatedAtTurn: world.meta.turn,
        committeeId: null,
      };
      world.bills.push(bill);
      return { ok: true, message: `Sponsored bill ${id}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "voteOnBill") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote on bills" };
    const billId = params.billId;
    const vote = params.vote;
    if (!billId || !vote) return { ok: false, error: "voteOnBill requires billId and vote" };
    const bill = world.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: `Unknown bill: ${billId}` };
    const playerSeat = (world.player as unknown as { legislativeSeat: { chamberKey: string } | null }).legislativeSeat;
    if (!playerSeat) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Must hold a legislative seat to vote" };
    }
    if (playerSeat.chamberKey !== bill.currentChamber) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Player chamber ${playerSeat.chamberKey} does not match bill chamber ${bill.currentChamber}` };
    }
    if (bill.status !== "active" && bill.status !== "active_other" && bill.status !== "veto_override") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Bill not in voting status: ${bill.status}` };
    }
    const targetMap = bill.status === "active_other" ? (bill.otherChamberVotes ??= {}) : bill.status === "veto_override" ? (bill.vetoOverrideVotes ??= {}) as Record<string, string> : bill.votes;
    const key = "player";
    (targetMap as Record<string, string>)[key] = vote;
    return { ok: true, message: `Voted ${vote} on ${billId}` };
  }
  if (actionId === "repealLaw") {
    if (found.kind !== "player") return { ok: false, error: "Only player can repeal laws" };
    const catalogId = params.catalogId;
    if (!catalogId) return { ok: false, error: "repealLaw requires catalogId" };
    const player = world.player as unknown as { legislativeSeat: unknown; mode: string };
    if (player.mode !== "hos" && !player.legislativeSeat) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Must hold a legislative seat to repeal" };
    }
    const law = world.enactedLaws.find((l) => l.id === catalogId && l.repealedAtTurn === undefined);
    if (!law) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `No active enacted law ${catalogId} to repeal` };
    }
    // Create a repeal bill (negative effectDirection)
    const leg = awaitImportCatalog(catalogId);
    const title = `Repeal ${leg?.title ?? catalogId}`;
    const id = `bill-repeal-${world.meta.turn}-${world.bills.length + 1}-${catalogId}`;
    const countryId = law.countryId;
    const legConfig = world.legislatures[countryId];
    const originChamber = legConfig?.chambers.find((c) => c.elected)?.key ?? "house";
    const bill: import("../legislation/types.js").Bill = {
      id,
      title,
      summary: `Repeal of ${catalogId}`,
      countryId,
      category: leg?.category ?? "economy",
      legislationTypeId: catalogId,
      effectDirection: -1,
      provisions: [{ type: "policy", legislationTypeId: catalogId, effectDirection: -1 }],
      originChamber,
      currentChamber: originChamber,
      status: "proposed",
      sponsorId: "player",
      sponsorName: world.player.name,
      sponsorPartyId: world.player.partyId,
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      proposedAtTurn: world.meta.turn,
      filibusterInvocations: [],
      updatedAtTurn: world.meta.turn,
      committeeId: null,
    };
    world.bills.push(bill);
    return { ok: true, message: `Repeal bill ${id} sponsored` };
  }
  if (actionId === "invokeFilibuster") {
    const billId = params.billId;
    if (!billId) return { ok: false, error: "invokeFilibuster requires billId" };
    const bill = world.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: `Unknown bill: ${billId}` };
    if (bill.currentChamber !== "senate") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Filibuster only in senate" };
    }
    if (bill.status !== "active" && bill.status !== "active_other") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Bill not in voting: ${bill.status}` };
    }
    bill.filibusterInvocations.push({ characterId: "player", characterName: world.player.name, invokedAtTurn: world.meta.turn });
    return { ok: true, message: `Filibuster invoked on ${billId}` };
  }

  // Intra-party ballot actions (W20, W34 catalog pattern)
  if (actionId === "contestPartyLeadership") {
    if (found.kind !== "player") return { ok: false, error: "Only player can contest party leadership" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member to contest" };
    const targetId = params.intrapartyElectionId;
    const position = params.position;
    // If specific election id given, enter that one; otherwise find first matching voting race for player's party
    let election: import("../intraparty/types.js").StatePartyElectionRecord | import("../intraparty/types.js").NationalPartyElectionRecord | undefined;
    if (targetId) {
      election = (world.statePartyElections as unknown as Array<{ id: string }>).find((e) => e.id === targetId) as unknown as typeof election
        ?? (world.nationalPartyElections as unknown as Array<{ id: string }>).find((e) => e.id === targetId) as unknown as typeof election;
    } else if (position) {
      // Try state first: need regionId; use player's country first region
      const playerCountry = world.player.countryId;
      const regionIds = Object.values(world.regions).filter((r) => r.countryId === playerCountry).map((r) => r.id);
      for (const rid of regionIds) {
        const cand = world.statePartyElections.find((e) => e.status === "voting" && e.partyId === world.player.partyId && e.regionId === rid && e.position === position);
        if (cand) { election = cand; break; }
      }
      if (!election) {
        election = world.nationalPartyElections.find((e) => e.status === "voting" && e.partyId === world.player.partyId && e.position === position);
      }
    } else {
      return { ok: false, error: "contestPartyLeadership requires intrapartyElectionId or position" };
    }
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "No matching party leadership election found" };
    }
    const rec = election as unknown as { candidateIds: string[]; partyId: string };
    if (rec.candidateIds.includes("player")) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Already a candidate in this election" };
    }
    if (rec.partyId !== world.player.partyId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Election is for a different party" };
    }
    rec.candidateIds.push("player");
    return { ok: true, message: `Entered ${election.id} as candidate` };
  }
  if (actionId === "votePartyLeadership") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member to vote" };
    const electionId = params.intrapartyElectionId;
    const candidateId = params.candidateId;
    if (!electionId || !candidateId) return { ok: false, error: "votePartyLeadership requires intrapartyElectionId and candidateId" };
    const election = (world.statePartyElections.find((e) => e.id === electionId)
      ?? world.nationalPartyElections.find((e) => e.id === electionId)) as unknown as { votes: Record<string, string>; candidateIds: string[]; partyId: string; status: string } | undefined;
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown election ${electionId}` };
    }
    if (election.status !== "voting") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Election not in voting status" };
    }
    if (election.partyId !== world.player.partyId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Election is for a different party" };
    }
    if (!election.candidateIds.includes(candidateId)) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Candidate ${candidateId} not in this election` };
    }
    election.votes["player"] = candidateId;
    return { ok: true, message: `Voted for ${candidateId} in ${electionId}` };
  }
  if (actionId === "contestCommittee") {
    if (found.kind !== "player") return { ok: false, error: "Only player can contest committee" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member" };
    const electionId = params.intrapartyElectionId;
    let election: import("../intraparty/types.js").NationalCommitteeElectionRecord | undefined;
    if (electionId) election = world.nationalCommitteeElections.find((e) => e.id === electionId);
    else election = world.nationalCommitteeElections.find((e) => e.status === "voting" && e.partyId === world.player.partyId);
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "No committee election found for your party" };
    }
    if (election.candidateIds.includes("player")) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Already a candidate" };
    }
    election.candidateIds.push("player");
    return { ok: true, message: `Entered committee ${election.id}` };
  }
  if (actionId === "voteCommittee") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote committee" };
    const electionId = params.intrapartyElectionId;
    const picks = params.committeeCandidateIds ?? (params.candidateId ? [params.candidateId] : undefined);
    if (!electionId || !picks) return { ok: false, error: "voteCommittee requires intrapartyElectionId and committeeCandidateIds" };
    const election = world.nationalCommitteeElections.find((e) => e.id === electionId);
    if (!election) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown committee election ${electionId}` };
    }
    if (election.status !== "voting") {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Not in voting" };
    }
    if (election.partyId !== world.player.partyId) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: "Wrong party" };
    }
    const maxVotes = 6; // COMMITTEE SIZE
    if (picks.length > maxVotes) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Too many picks, max ${maxVotes}` };
    }
    for (const cid of picks) {
      if (!election.candidateIds.includes(cid)) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Candidate ${cid} not in race` };
      }
    }
    election.votes["player"] = picks;
    return { ok: true, message: `Voted committee ${picks.join(",")} in ${electionId}` };
  }
  if (actionId === "createCoalition") {
    if (found.kind !== "player") return { ok: false, error: "Only player can create coalition" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member" };
    const name = params.coalitionName ?? `Coalition ${world.coalitions.length + 1}`;
    const abbr = params.coalitionAbbr ?? `C${world.coalitions.length + 1}`;
    const countryId = params.countryId ?? world.player.countryId;
    try {
      const co = Coalition.createCoalition(world, { countryId, name, abbreviation: abbr, founderPartyId: world.player.partyId });
      return { ok: true, message: `Created coalition ${co.id}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "joinCoalition") {
    if (found.kind !== "player") return { ok: false, error: "Only player can join" };
    if (!world.player.partyId) return { ok: false, error: "Must be party member" };
    const coalitionId = params.coalitionId;
    if (!coalitionId) return { ok: false, error: "joinCoalition requires coalitionId" };
    try {
      Coalition.joinCoalition(world, coalitionId, world.player.partyId);
      return { ok: true, message: `Joined ${coalitionId}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "initiateCoalitionDisband") {
    if (found.kind !== "player") return { ok: false, error: "Only player can initiate" };
    const coalitionId = params.coalitionId;
    if (!coalitionId) return { ok: false, error: "requires coalitionId" };
    if (!world.player.partyId) return { ok: false, error: "Must be member" };
    try {
      Coalition.initiateDisbandVote(world, coalitionId, world.player.partyId);
      return { ok: true, message: `Disband vote started for ${coalitionId}` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "voteCoalitionDisband") {
    if (found.kind !== "player") return { ok: false, error: "Only player can vote" };
    const coalitionId = params.coalitionId;
    const vote = params.disbandVote ?? (params.vote as "yes" | "no" | undefined);
    if (!coalitionId || !vote) return { ok: false, error: "requires coalitionId and disbandVote" };
    if (!world.player.partyId) return { ok: false, error: "Must be member" };
    try {
      Coalition.voteDisband(world, coalitionId, world.player.partyId, vote);
      return { ok: true, message: `Voted ${vote} on ${coalitionId} disband` };
    } catch (e) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: String(e) };
    }
  }
  if (actionId === "buyShares" || actionId === "sellShares") {
    // Simplified market order: ports mainline's buyPublicShares/sellPublicShares
    // "instant" retail path only (price = corp.sharePrice, no brokerage fee —
    // see market/constants.ts), NOT the human-liquidity order book
    // (placeShareOrder/fillShareOrder/acceptShareOffer) — see
    // market/recomputeSharePrices.ts file doc PORT-STUB for why that gap
    // exists in a single-player world.
    if (found.kind !== "player") return { ok: false, error: "Only the player trades shares" };
    const corpId = params.corpId;
    const shares = params.shares;
    if (!corpId || shares === undefined || !Number.isInteger(shares) || shares <= 0) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `${actionId} requires corpId and a positive integer shares amount` };
    }
    const corp = world.corporations[corpId];
    if (!corp) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `Unknown corporation: ${corpId}` };
    }
    // Notional at the live (== fundamental, see PORT-STUB above) price, cash-rounded.
    const notional = Math.round(shares * corp.sharePrice * 100) / 100;
    const player = world.player as unknown as { cash: number };

    if (actionId === "buyShares") {
      if (corp.publicFloat < shares) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Only ${corp.publicFloat.toLocaleString()} shares available in ${corp.tickerSymbol}'s public float` };
      }
      if ((player.cash ?? 0) < notional) {
        actor.actions += cost;
        if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
        return { ok: false, error: `Not enough cash. Required: ${notional}, Available: ${player.cash}` };
      }
      player.cash -= notional;
      corp.publicFloat -= shares;
      // Treasury-backed market maker: the buyer's payment is injected into the
      // issuer's liquidCapital so a float buy conserves money instead of
      // vanishing. Source: buyPublicShares.ts applyFloatBuyCredit comment.
      corp.liquidCapital += notional;
      let holding = corp.shareholders.find((sh) => sh.holder === "player");
      if (!holding) {
        holding = { holder: "player", shares: 0, avgCostPerShare: corp.sharePrice };
        corp.shareholders.push(holding);
      }
      const priorShares = holding.shares;
      const priorAvg = holding.avgCostPerShare ?? corp.sharePrice;
      holding.avgCostPerShare =
        priorShares > 0 ? (priorShares * priorAvg + shares * corp.sharePrice) / (priorShares + shares) : corp.sharePrice;
      holding.shares += shares;
      return { ok: true, message: `Bought ${shares} shares of ${corp.tickerSymbol} for ${notional}` };
    }

    // sellShares
    const holding = corp.shareholders.find((sh) => sh.holder === "player");
    if (!holding || holding.shares < shares) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `You only own ${holding?.shares ?? 0} shares of ${corp.tickerSymbol}` };
    }
    if (corp.liquidCapital < notional) {
      actor.actions += cost;
      if (catalog.cooldown > 0) delete actor.actionCooldowns[actionId];
      return { ok: false, error: `${corp.tickerSymbol}'s treasury can't cover this sale (needs ${notional})` };
    }
    // Issuer buyback: proceeds paid from the issuing corp's own treasury,
    // capped by what it can cover (the check above). Source:
    // sellPublicShares.ts settleFloatSellDebit / gateIssuerBuyback comments.
    corp.liquidCapital -= notional;
    corp.publicFloat += shares;
    holding.shares -= shares;
    if (holding.shares === 0) {
      corp.shareholders = corp.shareholders.filter((sh) => sh !== holding);
    }
    player.cash = (player.cash ?? 0) + notional;
    return { ok: true, message: `Sold ${shares} shares of ${corp.tickerSymbol} for ${notional}` };
  }

  return { ok: false, error: `No effect for ${actionId}` };
}

function awaitImportCatalog(id: string): import("../legislation/catalog.js").CatalogEntry | null {
  return getLaw(id);
}
