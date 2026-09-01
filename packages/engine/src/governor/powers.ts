/**
 * Governor office powers - W30.
 *
 * Real effects (solo systems support):
 * - deliverGovernorAddress: state-level turnout boost on regionTurnouts
 *   (ADDRESS_DEMOGRAPHIC_DELTA=+5) plus approval bump bookkeeping.
 *   Source: src/lib/governorOffice/address/deliverAddress.ts,
 *           src/lib/constants/governorOffice.ts ADDRESS_*
 * - applyGovernorOrderEffect: active orders carry a regional budget
 *   adjustment (PORT-REAL via regionalBudgets grant modifier) - cites
 *   EXEC_ORDER_* constants. Expired orders revert.
 *
 * PORT-STUB powers (targets unported, blockers named):
 * - issueGovernorOrder's StatePolicy ladder write: blocker "StatePolicy/
 *   legislationTypes policy ladder not ported - would write
 *   StatePolicy.policyOptionIndex (see src/lib/governorOffice/orders/
 *   issueOrder.ts ladderBounds + regionalDefaultLevel)".
 * - queueGovernorBill: blocker "NPP state-legislature introducer network
 *   not ported - would create StateBill via GovernorQueuedBill (see
 *   src/lib/governorOffice/legislation/queueBill.ts + src/lib/turn/
 *   governorLegislationQueue.ts)".
 * - governorEndorsement: blocker "GovernorEndorsement collection + campaign
 *   endorsement counting not ported - would write GovernorEndorsement and
 *   be aggregated in src/lib/turn/governorEndorsements.ts".
 * - devolutionPolicy: blocker "UK-only FM Devolution Policy - not applicable
 *   to US governor scope (see src/lib/governorOffice/devolution/
 *   changeDevolutionPolicy.ts, src/lib/constants/devolution.ts)".
 * - senateAppointment: blocker "Gubernatorial Senate appointment - mainline
 *   notifies governor on Senate vacancy (src/lib/governors/senateVacancy.ts
 *   notifyGovernorOfSenateVacancy) but appointment route not ported".
 *
 * Every power spends gubernatorialActions where mainline does, with the
 * same costs/caps/cooldowns - no invented numbers.
 */

import type { WorldState } from "../types.js";
import type { GovernorAddress, GovernorOrder } from "./types.js";
import {
  ADDRESS_ACTION_COST,
  ADDRESS_AGENDA_DURATION_TURNS,
  ADDRESS_APPROVAL_BUMP,
  ADDRESS_APPROVAL_DURATION_TURNS,
  ADDRESS_COOLDOWN_TURNS,
  ADDRESS_DEMOGRAPHIC_DELTA,
  ADDRESS_DEMOGRAPHIC_DURATION_TURNS,
  EXEC_ORDER_AP_COST_PER_STEP,
  EXEC_ORDER_DURATION_TURNS,
  EXEC_ORDER_MAX_STEPS,
  EXEC_ORDER_SLOT_CAP,
} from "./constants.js";

// ---------------------------------------------------------------------------
// deliverGovernorAddress - REAL (state support effect)
// Source: src/lib/governorOffice/address/deliverAddress.ts
// Effect: +ADDRESS_DEMOGRAPHIC_DELTA voter turnout boost in the state
// (clamped to solo's regionTurnouts -20..+20 window) and an approval bump
// bookkeeping entry. Costs ADDRESS_ACTION_COST AP + cooldown.
// ---------------------------------------------------------------------------
export interface DeliverAddressInput {
  title: string;
  body?: string;
  emphasizedCategories: string[];
  targetGroupId?: string;
}

export function deliverGovernorAddress(
  world: WorldState,
  stateId: string,
  input: DeliverAddressInput,
): { ok: boolean; error?: string; addressId?: string } {
  const gov = world.governors[stateId];
  if (!gov) return { ok: false, error: `No governor office for state ${stateId}` };
  if (gov.governorId == null) return { ok: false, error: "Office vacant - cannot deliver address" };
  if (gov.gubernatorialActions < ADDRESS_ACTION_COST) {
    return { ok: false, error: "Insufficient office action points." };
  }
  if (gov.lastAddressTurn != null && world.meta.turn - gov.lastAddressTurn < ADDRESS_COOLDOWN_TURNS) {
    return { ok: false, error: `Address on cooldown until turn ${gov.lastAddressTurn + ADDRESS_COOLDOWN_TURNS}` };
  }
  const t = input.title.trim();
  if (t.length < 10 || t.length > 200) return { ok: false, error: "Title must be 10-200 characters." };
  if (input.emphasizedCategories.length < 1 || input.emphasizedCategories.length > 2) {
    return { ok: false, error: "Pick 1-2 emphasis categories." };
  }

  // Spend AP
  gov.gubernatorialActions -= ADDRESS_ACTION_COST;
  gov.lastAddressTurn = world.meta.turn;

  // Apply turnout boost to the state's regionTurnout (real support effect)
  // Source: ADDRESS_DEMOGRAPHIC_DELTA = 5 (src/lib/constants/governorOffice.ts)
  // Apply to the first category's first group if targetGroupId not given, else targeted group.
  const rt = world.regionTurnouts[stateId];
  if (rt && input.targetGroupId) {
    const groupId = input.targetGroupId;
    // Find which voter category holds this group
    for (const cat of Object.keys(rt.modifiers)) {
      const groups = rt.modifiers[cat];
      if (groups && groupId in groups) {
        const cur = groups[groupId] ?? 0;
        const next = Math.max(-20, Math.min(20, cur + ADDRESS_DEMOGRAPHIC_DELTA));
        groups[groupId] = next;
        break;
      }
    }
  } else if (rt && !input.targetGroupId) {
    // Default: bump first group of first category (deterministic)
    const firstCat = Object.keys(rt.modifiers)[0];
    if (firstCat) {
      const groups = rt.modifiers[firstCat];
      const firstGroup = groups ? Object.keys(groups)[0] : undefined;
      if (firstGroup && groups) {
        const cur = groups[firstGroup] ?? 0;
        groups[firstGroup] = Math.max(-20, Math.min(20, cur + ADDRESS_DEMOGRAPHIC_DELTA));
      }
    }
  }

  // Bookkeep address for expiry (approval/agenda/demographic windows)
  const id = `gov-addr:${stateId}:${world.meta.turn}`;
  const trimmedBody = input.body?.trim();
  const addr: GovernorAddress = {
    id,
    stateId,
    countryId: gov.countryId,
    title: t,
    ...(trimmedBody ? { body: trimmedBody } : {}),
    deliveredBy: gov.governorId ?? "vacant",
    deliveredAtTurn: world.meta.turn,
    approvalExpiresAtTurn: world.meta.turn + ADDRESS_APPROVAL_DURATION_TURNS,
    agendaExpiresAtTurn: world.meta.turn + ADDRESS_AGENDA_DURATION_TURNS,
    demographicExpiresAtTurn: world.meta.turn + ADDRESS_DEMOGRAPHIC_DURATION_TURNS,
    approvalBump: ADDRESS_APPROVAL_BUMP,
    demographicDelta: ADDRESS_DEMOGRAPHIC_DELTA,
    emphasizedCategories: [...input.emphasizedCategories],
    ...(input.targetGroupId ? { targetGroupId: input.targetGroupId } : {}),
  };
  world.governorAddresses.push(addr);

  // Add a news item (address headline mirrors mainline generateAddressNews)
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `Governor's address in ${stateId}: "${t}"`,
  });

  return { ok: true, addressId: id };
}

// ---------------------------------------------------------------------------
// issueGovernorOrder - REAL AP gate + slot cap, STUB policy write
// Source: src/lib/governorOffice/orders/issueOrder.ts
// Real check: AP cost/gating, slot cap 2, step clamp. Policy write is
// PORT-STUB - blocker: StatePolicy ladder not ported.
// The regional-budget delta below is the solo-real counterpart: a temporary
// grant adjustment tracked on the GovernorOrder row and applied by the
// governorOrdersPhase into regionalBudgets.grant.
// ---------------------------------------------------------------------------
export function issueGovernorOrder(
  world: WorldState,
  stateId: string,
  legislationTypeId: string,
  effectDirection: 1 | -1,
  steps: 1 | 2 = 1,
): { ok: boolean; error?: string; orderId?: string } {
  const gov = world.governors[stateId];
  if (!gov) return { ok: false, error: `No governor office for state ${stateId}` };
  if (gov.governorId == null) return { ok: false, error: "Office vacant - cannot issue order" };
  if (steps !== 1 && steps !== 2) return { ok: false, error: "Invalid step count." };
  if (steps > EXEC_ORDER_MAX_STEPS) return { ok: false, error: "Step count exceeds maximum." };
  const apCost = steps * EXEC_ORDER_AP_COST_PER_STEP;
  if (gov.gubernatorialActions < apCost) {
    return { ok: false, error: "Insufficient office action points." };
  }
  const active = world.governorOrders.filter(
    (o) => o.stateId === stateId && o.status === "active",
  );
  if (active.length >= EXEC_ORDER_SLOT_CAP) {
    return { ok: false, error: "Both executive-order slots are in use." };
  }
  if (active.some((o) => o.legislationTypeId === legislationTypeId)) {
    return { ok: false, error: "An active order already exists for this policy." };
  }

  gov.gubernatorialActions -= apCost;

  // PORT-STUB: mainline computes ladderBounds from LegislationType.policyOptions
  // and clamps before/after indices - solo has no LegislationType/StatePolicy
  // ladder, so we use a synthetic 0-6 ladder with centre 3 (mainline's 7-option
  // default before per-type overrides). Citations are the same constants as above.
  const maxIndex = 6;
  const centerIndex = 3;
  const before = centerIndex;
  const desired = before + effectDirection * steps;
  const after = Math.max(0, Math.min(maxIndex, desired));
  if (after === before) return { ok: false, error: "Order would have no effect (clamped)." };
  if (after !== desired) return { ok: false, error: `Order would clamp - pick ${Math.abs(after - before)} step(s) instead.` };

  const id = `gov-order:${stateId}:${legislationTypeId}:${world.meta.turn}`;
  const order: GovernorOrder = {
    id,
    stateId,
    countryId: gov.countryId,
    issuedBy: gov.governorId ?? "vacant",
    legislationTypeId,
    effectDirection,
    steps,
    policyOptionIndexBefore: before,
    policyOptionIndexAfter: after,
    issuedAtTurn: world.meta.turn,
    expiresAtTurn: world.meta.turn + EXEC_ORDER_DURATION_TURNS,
    status: "active",
  };
  world.governorOrders.push(order);

  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `Executive order in ${stateId}: ${legislationTypeId} shifted ${effectDirection > 0 ? "up" : "down"} ${steps} step(s)`,
  });

  // The solo-real regional budget effect is applied as a grant bump in
  // governorOrdersPhase (regionalBudgets grant += steps * EXEC_ORDER_GRANT_BUMP_PER_STEP
  // per active order, re-derived from the live order list every turn - see
  // phases.ts for why). The shape (grant write) is real; the magnitude is
  // explicitly a solo-only tuning scalar, flagged PORT-STUB-level until
  // StatePolicy exists to drive budget deltas directly.

  return { ok: true, orderId: id };
}

// ---------------------------------------------------------------------------
// Pure read helpers for tests / UI
// ---------------------------------------------------------------------------
export function activeGovernorOrders(world: WorldState, stateId: string): GovernorOrder[] {
  return world.governorOrders.filter((o) => o.stateId === stateId && o.status === "active");
}

export function activeGovernorAddresses(world: WorldState, stateId: string): GovernorAddress[] {
  return world.governorAddresses.filter(
    (a) => a.stateId === stateId && !a.expired && a.demographicExpiresAtTurn > world.meta.turn,
  );
}

/** Ordered stub inventory for the task's "blockers named" clause. */
export const GOVERNOR_PORT_STUBS: Array<{ power: string; blocker: string }> = [
  {
    power: "StatePolicy ladder write (issueOrder policyOptionIndex)",
    blocker:
      "StatePolicy/legislationTypes policy ladder not ported - would write StatePolicy.policyOptionIndex per src/lib/governorOffice/orders/issueOrder.ts ladderBounds + regionalDefaultLevel (see src/lib/legislature/policyLadder.ts, src/lib/politicalLegislation/regionalDefaults.ts)",
  },
  {
    power: "Queued governor bill (GovernorQueuedBill -> StateBill)",
    blocker:
      "NPP state-legislature introducer network not ported - would queue GovernorQueuedBill and fire via src/lib/turn/governorLegislationQueue.ts processGovernorLegislationQueue (see src/lib/governorOffice/legislation/queueBill.ts)",
  },
  {
    power: "Governor endorsement (GovernorEndorsement -> campaign endorsement counting)",
    blocker:
      "GovernorEndorsement collection + campaign endorsement aggregation not ported - would write GovernorEndorsement and be swept by src/lib/turn/governorEndorsements.ts processGovernorEndorsements",
  },
  {
    power: "Devolution Policy (UK FM)",
    blocker:
      "UK-only FM Devolution Policy not applicable to US governor scope - see src/lib/governorOffice/devolution/changeDevolutionPolicy.ts, src/lib/constants/devolution.ts DEVOLUTION_*",
  },
  {
    power: "Gubernatorial Senate appointment (notifyGovernorOfSenateVacancy)",
    blocker:
      "Gubernatorial Senate appointment route not ported - mainline only notifies governor on vacancy (src/lib/governors/senateVacancy.ts notifyGovernorOfSenateVacancy); solo has no appointment action",
  },
];
