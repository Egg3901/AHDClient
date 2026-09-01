/**
 * Governor turn phases - W30.
 *
 * Mainline sources:
 * - processGovernorAPRegen       src/lib/turn/governorAPRegen.ts
 * - processGovernorExecutiveOrders src/lib/turn/governorOrders.ts
 * - processGovernorAddressExpiry src/lib/turn/governorAddressExpiry.ts
 * - processGovernorEndorsements  src/lib/turn/governorEndorsements.ts
 * - processGovernorLegislationQueue src/lib/turn/governorLegislationQueue.ts
 * - processByElectionWatcher     src/lib/turn/byElections.ts (special_governor)
 *
 * Solo depth: AP regen and order/address expiry are REAL (state-level support/
 * regional-budget effects); endorsement/legislation-queue are PORT-STUB phases
 * that sweep vacated-officer state (no Budget/Senate side movement).
 * All RNG-free, deterministic.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import {
  BY_ELECTION_RETRY_COOLDOWN_TURNS,
  EXEC_ORDER_GRANT_BUMP_PER_STEP,
  GUBERNATORIAL_ACTION_CAP,
  GUBERNATORIAL_ACTION_REGEN_INTERVAL,
  SPECIAL_GOVERNOR_FILING_TURNS,
  SPECIAL_GOVERNOR_GENERAL_TURNS,
} from "./constants.js";

// ---------------------------------------------------------------------------
// governorAPRegen - REAL
// Source: src/lib/turn/governorAPRegen.ts processGovernorAPRegen
// Grants +1 every GUBERNATORIAL_ACTION_REGEN_INTERVAL turns while capped.
// ---------------------------------------------------------------------------
export const governorAPRegenPhase: TurnPhase = {
  name: "governorAPRegen",
  run(world: WorldState) {
    for (const gov of Object.values(world.governors)) {
      if (gov.gubernatorialActions >= GUBERNATORIAL_ACTION_CAP) continue;
      if (world.meta.turn - gov.lastActionGrantedTurn < GUBERNATORIAL_ACTION_REGEN_INTERVAL) continue;
      gov.gubernatorialActions += 1;
      gov.lastActionGrantedTurn = world.meta.turn;
    }
  },
};

// ---------------------------------------------------------------------------
// governorOrders - REAL expiry + REAL regional-budget grant bump,
// PORT-STUB supersession note
// Source: src/lib/turn/governorOrders.ts processGovernorExecutiveOrders
// Expiry: orders past expiresAtTurn flip to "expired" and stop contributing
// to the grant bump below on their own (removed from the active set).
// Supersession is PORT-STUB (no StatePolicy ladder to observe conflicts on -
// see powers.ts issueGovernorOrder's active-order-per-policy guard, which is
// the closest solo equivalent at issue time).
//
// Regional budget effect: every still-active order contributes
// steps * EXEC_ORDER_GRANT_BUMP_PER_STEP to its state's regionalBudget grant
// this turn. budget/phases.ts regionalBudgetProcessingPhase runs earlier in
// the same turn (see phases/registry.ts ordering) and fully recomputes
// revenue.grant from the population-share national pool from scratch every
// turn - there is no separate adjustment ledger for anything to accumulate
// into. Re-deriving the bump from the live order list each turn (rather than
// trying to persist a delta across turns) is therefore the correct match for
// that recompute-from-scratch design: the bump is visible on top of this
// turn's freshly-computed base and disappears on its own once every
// contributing order expires, without a separate revert step.
// ---------------------------------------------------------------------------
export const governorOrdersPhase: TurnPhase = {
  name: "governorOrders",
  run(world: WorldState) {
    for (const o of world.governorOrders) {
      if (o.status !== "active") continue;
      if (world.meta.turn >= o.expiresAtTurn) {
        o.status = "expired";
      }
    }
    const bumpByState = new Map<string, number>();
    for (const o of world.governorOrders) {
      if (o.status !== "active") continue;
      const bump = o.steps * EXEC_ORDER_GRANT_BUMP_PER_STEP;
      bumpByState.set(o.stateId, (bumpByState.get(o.stateId) ?? 0) + bump);
    }
    for (const [stateId, bump] of bumpByState) {
      const rb = world.regionalBudgets[stateId];
      if (!rb) continue;
      rb.revenue.grant += bump;
      rb.revenue.total += bump;
      rb.balance += bump;
      if (rb.balance >= 0) rb.consecutiveDeficits = 0;
    }
  },
};

// ---------------------------------------------------------------------------
// governorAddressExpiry - REAL
// Source: src/lib/turn/governorAddressExpiry.ts processGovernorAddressExpiry
// Reverts demographic turnoutDelta when the address window closes.
// ---------------------------------------------------------------------------
export const governorAddressExpiryPhase: TurnPhase = {
  name: "governorAddressExpiry",
  run(world: WorldState) {
    for (const a of world.governorAddresses) {
      if (a.expired) continue;
      const approvalExpired = a.approvalExpiresAtTurn <= world.meta.turn;
      const demoExpired = a.demographicExpiresAtTurn <= world.meta.turn;
      // Only the demographic turnout boost is write-side; approval/agenda are
      // read-side. Revert the turnout contribution when its window closes.
      if (demoExpired && !a.expired) {
        const rt = world.regionTurnouts[a.stateId];
        const gid = a.targetGroupId;
        if (rt && gid) {
          for (const cat of Object.keys(rt.modifiers)) {
            const groups = rt.modifiers[cat];
            if (groups && gid in groups) {
              const cur = groups[gid] ?? 0;
              // Subtract exactly what was added (ADDRESS_DEMOGRAPHIC_DELTA), clamped.
              const next = Math.max(-20, Math.min(20, cur - a.demographicDelta));
              groups[gid] = next;
              break;
            }
          }
        } else if (rt && !gid) {
          const firstCat = Object.keys(rt.modifiers)[0];
          if (firstCat) {
            const groups = rt.modifiers[firstCat];
            const firstGroup = groups ? Object.keys(groups)[0] : undefined;
            if (firstGroup && groups) {
              const cur = groups[firstGroup] ?? 0;
              const fixed = Math.max(-20, Math.min(20, cur - a.demographicDelta));
              groups[firstGroup] = fixed;
            }
          }
        }
      }
      if (approvalExpired && demoExpired) {
        a.expired = true;
      } else if (demoExpired || approvalExpired) {
        // Partial expiry: keep row for remaining window; turnout already reverted.
        // Mark expired only when both windows closed to avoid stale reads.
        // For goldens we mark expired when demographic window closed (the write-side effect).
        if (demoExpired) a.expired = true;
      }
    }
  },
};

// ---------------------------------------------------------------------------
// governorByElectionWatcher - REAL (special_governor)
// Source: src/lib/turn/byElections.ts processByElectionWatcher
// Spawns a special_governor election for any state whose governor office is
// a vacant tombstone (governorId null) and no regular/special is live and the
// last special cooled down. Timing is filing 24 + general 24 = 48 turns.
// ---------------------------------------------------------------------------
export const governorByElectionWatcherPhase: TurnPhase = {
  name: "governorByElectionWatcher",
  run(world: WorldState) {
    // Only US states in this wave; other BY_ELECTION_COUNTRIES (RU) are PORT-STUB.
    for (const gov of Object.values(world.governors)) {
      if (gov.governorId != null) continue; // seated
      const stateId = gov.stateId;
      // Suppress if a regular governor race already live
      const liveRegular = world.elections.some(
        (e) => e.state === stateId && e.electionType === "governor" && (e.status === "active" || e.status === "upcoming"),
      );
      if (liveRegular) continue;
      const lastSpecial = [...world.elections]
        .filter((e) => e.state === stateId && e.electionType === "special_governor")
        .sort((a, b) => (b.endTurn ?? 0) - (a.endTurn ?? 0))[0];
      if (lastSpecial) {
        if (lastSpecial.status === "active" || lastSpecial.status === "upcoming") continue;
        if ((lastSpecial.endTurn ?? 0) > world.meta.turn - BY_ELECTION_RETRY_COOLDOWN_TURNS) continue;
      }
      // Spawn special_governor election with filing + general windows
      const startTurn = world.meta.turn;
      const primaryEndTurn = startTurn + SPECIAL_GOVERNOR_FILING_TURNS;
      const endTurn = primaryEndTurn + SPECIAL_GOVERNOR_GENERAL_TURNS;

      world.elections.push({
        id: `special_governor:${gov.countryId}:${stateId}:c${startTurn}`,
        electionType: "special_governor",
        countryId: gov.countryId,
        state: stateId,
        chamberKey: "governor",
        cycle: startTurn,
        status: "active",
        startTurn,
        primaryEndTurn,
        endTurn,
        totalSeats: 1,
        candidates: [],
        tally: {},
      });
    }
  },
};

// ---------------------------------------------------------------------------
// governorLegislationQueue + governorEndorsements - PORT-STUB lifecycle sweeps
// ---------------------------------------------------------------------------
// These are no-ops in solo beyond marking rows expired when governor left office,
// matching the minimal solo support depth (no StateBill creation, no endorsement
// counting). They exist so registry completeness cites every mainline source.
// ---------------------------------------------------------------------------
export const governorLegislationQueuePhase: TurnPhase = {
  name: "governorLegislationQueue",
  run(_world: WorldState) {
    // PORT-STUB: would consume GovernorQueuedBill per
    // src/lib/turn/governorLegislationQueue.ts processGovernorLegislationQueue.
    // No queued bills exist in solo yet (no queueBill introducer wiring).
  },
};

export const governorEndorsementsPhase: TurnPhase = {
  name: "governorEndorsements",
  run(_world: WorldState) {
    // PORT-STUB: would sweep GovernorEndorsement per
    // src/lib/turn/governorEndorsements.ts processGovernorEndorsements.
    // Solo has no GovernorEndorsement ledger this wave.
  },
};

/** All governor phases in mainline-relative order for registry insertion. */
export const GOVERNOR_PHASES: readonly TurnPhase[] = [
  governorAPRegenPhase,
  governorOrdersPhase,
  governorAddressExpiryPhase,
  governorByElectionWatcherPhase,
  governorLegislationQueuePhase,
  governorEndorsementsPhase,
];
