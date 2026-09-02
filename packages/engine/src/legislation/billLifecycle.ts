/**
 * Bill lifecycle engine for solo Rotunda.
 * Faithful to mainline src/lib/turn/billLifecycle engine stages and timing,
 * simplified for in-memory WorldState (no DB, no async).
 *
 * Stages:
 *  proposed -> active (origin vote) -> active_other (second chamber if bicameral)
 *  -> enrolled (executive window) -> veto_override (if vetoed) -> signed/failed
 *
 * Timing: votingDurationTurns=2 per chamber, executiveWindowTurns=2, overrideTurns=2.
 * Quorum cloture: 3/5 of votes cast when filibuster invoked (quorum-based).
 * Chamber routing per legislature config (bicameral/elected flags).
 */

import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { Bill } from "./types.js";
import { didPass, didPassWithFilibusterCheck, tallyVotes } from "./billVoteLogic.js";
import { assignBillToCommittee } from "./committees.js";
import { getLaw } from "./catalog.js";
import { UNEMPLOYMENT_MIN, UNEMPLOYMENT_MAX } from "../economy/macroConstants.js";
import { triggerDebtCeilingCrisis } from "../budget/debtCeiling.js";
import { applyCurrencyUnionProvision } from "../finance/currencyUnion.js";
import type { PolicyLedgerEntry } from "../policyEffects/types.js";

const VOTING_TURNS = 2;
const EXEC_WINDOW_TURNS = 2;
const OVERRIDE_TURNS = 2;

function getChambersForBill(world: WorldState, bill: Bill): string[] {
  const leg = world.legislatures[bill.countryId];
  if (!leg) return [bill.originChamber];
  if (!leg.bicameral) return [leg.chambers[0]?.key ?? bill.originChamber];
  // Filter to elected chambers for routing; appointed chambers are not voted by legislature
  const elected = leg.chambers.filter((c) => c.elected).map((c) => c.key);
  if (elected.length === 0) return [leg.chambers[0]!.key];
  if (elected.length === 1) return [elected[0]!];
  // Bicameral elected: origin + other
  const origin = bill.originChamber;
  if (elected.includes(origin)) {
    const other = elected.find((k) => k !== origin) ?? origin;
    return [origin, other];
  }
  // If origin is not in elected (e.g., joint), use elected order
  return elected;
}

function buildVoteSnapshot(bill: Bill, chamberKey: string): { for: number; against: number; abstain: number; votes: Record<string, string> } {
  const isOther = chamberKey !== bill.originChamber && bill.otherChamberVotes !== undefined;
  const votes = isOther ? (bill.otherChamberVotes ?? {}) : bill.votes;
  // snapshot mirrors tally
  const tally = tallyVotes(votes as Record<string, "for" | "against" | "abstain">);
  return { for: tally.for, against: tally.against, abstain: tally.abstain, votes: { ...votes } };
}

export function processBillLifecycle(world: WorldState, _rng: WorldRng): { billsProcessed: number; billsPassed: number; billsFailed: number; billsVetoed: number } {
  let billsProcessed = 0, billsPassed = 0, billsFailed = 0, billsVetoed = 0;
  const turn = world.meta.turn;

  // Activate proposed bills into first chamber vote
  for (const bill of world.bills) {
    if (bill.status === "proposed") {
      const chambers = getChambersForBill(world, bill);
      const origin = chambers[0]!;
      bill.currentChamber = origin;
      bill.status = "active";
      bill.votingEndsOnTurn = turn + VOTING_TURNS;
      bill.updatedAtTurn = turn;
      // Assign to committee (depth required) — not gating
      if (!bill.committeeId) {
        bill.committeeId = assignBillToCommittee(bill.category, world.committees, bill.countryId, origin);
        bill.committeeReferralTurn = turn;
      }
      billsProcessed++;
    }
  }

  // Close origin chamber votes
  const originExpiring = world.bills.filter((b) => b.status === "active" && (b.votingEndsOnTurn ?? Infinity) <= turn);
  for (const bill of originExpiring) {
    const tally = tallyVotes(bill.votes);
    bill.votesFor = tally.for;
    bill.votesAgainst = tally.against;
    bill.votesAbstain = tally.abstain;
    bill.voteSnapshot = { for: tally.for, against: tally.against, abstain: tally.abstain, votes: { ...bill.votes } };

    const passed = didPassWithFilibusterCheck(bill, tally.for, tally.against, tally.abstain);
    if (!passed) {
      bill.status = "failed";
      bill.failedAtTurn = turn;
      bill.updatedAtTurn = turn;
      billsProcessed++;
      billsFailed++;
      continue;
    }

    const chambers = getChambersForBill(world, bill);
    if (chambers.length > 1) {
      // Advance to second chamber
      const second = chambers[1]!;
      bill.status = "active_other";
      bill.currentChamber = second;
      bill.otherChamberVotingEndsOnTurn = turn + VOTING_TURNS;
      bill.otherChamberVotes = {};
      bill.otherChamberVotesFor = 0;
      bill.otherChamberVotesAgainst = 0;
      bill.otherChamberVotesAbstain = 0;
      // Re-assign committee for second chamber
      bill.committeeId = assignBillToCommittee(bill.category, world.committees, bill.countryId, second) ?? bill.committeeId ?? null;
      bill.updatedAtTurn = turn;
      billsProcessed++;
    } else {
      // Unicameral or appointed upper: go straight to enrolled
      bill.status = "enrolled";
      bill.presidentActionDeadlineOnTurn = turn + EXEC_WINDOW_TURNS;
      bill.updatedAtTurn = turn;
      billsProcessed++;
    }
  }

  // Close second chamber votes
  const otherExpiring = world.bills.filter((b) => b.status === "active_other" && (b.otherChamberVotingEndsOnTurn ?? Infinity) <= turn);
  for (const bill of otherExpiring) {
    const tally = tallyVotes(bill.otherChamberVotes ?? {});
    bill.otherChamberVotesFor = tally.for;
    bill.otherChamberVotesAgainst = tally.against;
    bill.otherChamberVotesAbstain = tally.abstain;
    bill.otherChamberVoteSnapshot = { for: tally.for, against: tally.against, abstain: tally.abstain, votes: { ...(bill.otherChamberVotes ?? {}) } };

    const passed = didPassWithFilibusterCheck(bill, tally.for, tally.against, tally.abstain);
    if (!passed) {
      bill.status = "failed";
      bill.failedAtTurn = turn;
      bill.updatedAtTurn = turn;
      billsProcessed++;
      billsFailed++;
      continue;
    }
    bill.status = "enrolled";
    bill.presidentActionDeadlineOnTurn = turn + EXEC_WINDOW_TURNS;
    bill.updatedAtTurn = turn;
    billsProcessed++;
  }

  // Executive action window: pocket-sign on timeout (auto-enact)
  const enrolledExpiring = world.bills.filter((b) => b.status === "enrolled" && (b.presidentActionDeadlineOnTurn ?? Infinity) <= turn);
  for (const bill of enrolledExpiring) {
    // Pocket sign (unsigned_law equivalent) → signed
    bill.status = "signed";
    bill.enactedAtTurn = turn;
    bill.updatedAtTurn = turn;
    applyBillEffects(world, bill);
    billsProcessed++;
    billsPassed++;
  }

  // Veto override not yet modeled via player executive action;
  // bills in "veto_override" with deadline close
  const overrideExpiring = world.bills.filter((b) => b.status === "veto_override" && (b.overrideVotingEndsOnTurn ?? Infinity) <= turn);
  for (const bill of overrideExpiring) {
    const tally = tallyVotes(bill.vetoOverrideVotes as Record<string, "for" | "against" | "abstain"> ?? {});
    // 2/3 of seats? For solo quorum, use 2/3 of votes cast per mainline override threshold simplification.
    // Mainline uses seats; solo uses votes cast for simplicity but tests check threshold.
    const leg = world.legislatures[bill.countryId];
    const chamberSeats = leg?.chambers.find((c) => c.key === bill.currentChamber)?.seats ?? 100;
    const needed = Math.ceil((2 / 3) * chamberSeats);
    // For solo, we check if for >= 2/3 seats; if leg missing, use votes cast 2/3
    let overridePassed: boolean;
    if (leg) {
      // Count for votes; need to meet seat threshold
      overridePassed = tally.for >= needed;
      bill.overrideDisplaySnapshot = { for: tally.for, against: tally.against, seats: chamberSeats };
    } else {
      const cast = tally.for + tally.against;
      overridePassed = cast > 0 && tally.for * 3 >= 2 * cast;
    }
    if (overridePassed) {
      bill.status = "signed";
      bill.enactedAtTurn = turn;
      bill.updatedAtTurn = turn;
      applyBillEffects(world, bill);
      billsPassed++;
    } else {
      bill.status = "override_failed";
      bill.failedAtTurn = turn;
      bill.updatedAtTurn = turn;
      billsFailed++;
    }
    billsProcessed++;
  }

  // Vetoed bills that were manually vetoed would be in "vetoed" with transition to veto_override
  // Manual veto path is via action, not lifecycle timer, so not handled here.

  // Also handle bills that expired without ever getting enough votes? Already covered.

  return { billsProcessed, billsPassed, billsFailed, billsVetoed };
}

/**
 * Active concurrent vote not yet ported for solo: stub.
 * Bills in active_both would need both chambers at once; for solo we treat
 * active_both as active (sequential) to keep lifecycle stage goldens simple.
 */

export function applyBillEffects(world: WorldState, bill: Bill): void {
  const catalog = bill.legislationTypeId ? getLaw(bill.legislationTypeId) : null;
  // Budget gate (W28): read the real W2 budget (world.budgets, no cast — this
  // used to reach budgets through an `unknown` cast written before W2 landed
  // as a real WorldState field; that indirection is gone). Warn-only —
  // sovereign deficit spending is a deliberate lane, so validation never
  // blocks enactment, same as mainline's validateFederalBudgetImpact
  // (src/lib/budget/validation.ts:109-174) which only sets a warning field.
  // When the debt ceiling IS exceeded, mainline actually fires
  // triggerDebtCeilingCrisis (src/lib/budget/debt.ts:216-230, idempotent
  // upsert) — this wave wires that into world.enactmentGates instead of
  // leaving it a comment-only bill field.
  const budget = world.budgets[bill.countryId];
  if (budget) {
    const projectedDebt = budget.debt.principal;
    if (projectedDebt > budget.debt.ceiling) {
      (bill as unknown as { budgetGateWarning?: string }).budgetGateWarning = "DEBT_CEILING_EXCEEDED";
      triggerDebtCeilingCrisis(world, bill.countryId, world.meta.turn);
    }
  }
  // Tax-rate enactment: where mainline writes billEnactment.ts applyTaxRateChange,
  // solo's per-option rate ladder is not yet ported (catalog levels store gdpCostFraction, not rate steps).
  // Blocking system: budget/taxRateLadder — connect the real budget read, PORT-STUB the detailed rate decode.
  if (catalog?.kind === "tax" && catalog.taxPolicy && budget) {
    // PORT-STUB: detailed rate from option ladder deferred; no rate write yet.
    void budget;
  }

  // W28: currency union accession provisions (finance/currencyUnion.ts).
  for (const provision of bill.provisions) {
    if (provision.type === "currency_union" && provision.currencyUnionId) {
      applyCurrencyUnionProvision(world, bill.countryId, provision.currencyUnionId);
    }
  }

  // W28: policyLedger entry — the DECAY-path analogue of mainline's
  // statePolicies row (policyEffects/types.ts PolicyLedgerEntry file doc).
  // Written whenever a catalog entry exists, independent of whether it also
  // carries an immediate `effect` bump below — these are two different
  // mainline channels (one-time tick-path economy delta vs. ongoing
  // decay-path metric target pull read every turn by policyEffectsPhase).
  if (bill.legislationTypeId && catalog) {
    const entry: PolicyLedgerEntry = {
      id: bill.id,
      legislationTypeId: bill.legislationTypeId,
      policyOptionId: String(bill.enactedLevel ?? catalog.baselineLevel ?? 0),
      effectDirection: bill.effectDirection ?? 1,
      scope: catalog.allowedScope === "regional" ? "regional" : "national",
      countryId: bill.countryId,
      enactedTurn: world.meta.turn,
      enactedAt: world.meta.date,
    };
    world.policyLedger[entry.id] = entry;
  }

  const effect = catalog?.effect;
  if (!effect) {
    // No catalog effect: check provisions directly for economy overrides
    for (const p of bill.provisions) {
      if (p.type === "economy" && p.legislationTypeId) {
        const c = getLaw(p.legislationTypeId);
        if (c?.effect) applyEffectToWorld(world, bill, c.effect);
      }
    }
    return;
  }
  applyEffectToWorld(world, bill, effect);

  // Support effects: track enacted law
  const enacted: import("./types.js").EnactedLaw = {
    id: bill.legislationTypeId ?? bill.id,
    countryId: bill.countryId,
    billId: bill.id,
    enactedAtTurn: world.meta.turn,
    level: bill.enactedLevel ?? 1,
    scope: "national",
    expiresAtTurn: bill.expiresAtTurn ?? null,
  };
  world.enactedLaws.push(enacted);

  // Emit news
  world.news.push({ turn: world.meta.turn, date: world.meta.date, headline: `Bill signed: ${bill.title}` });
}

function applyEffectToWorld(world: WorldState, bill: Bill, effect: NonNullable<import("./catalog.js").CatalogEntry["effect"]>): void {
  if (effect.economy) {
    const econ = world.countries[bill.countryId]?.economy;
    if (econ) {
      if (effect.economy.gdp !== undefined) econ.gdp += effect.economy.gdp;
      if (effect.economy.growthRate !== undefined) econ.growthRate += effect.economy.growthRate;
      if (effect.economy.inflationRate !== undefined) econ.inflationRate += effect.economy.inflationRate;
      if (effect.economy.unemploymentRate !== undefined) econ.unemploymentRate += effect.economy.unemploymentRate;
      if (effect.economy.outputGap !== undefined) econ.outputGap += effect.economy.outputGap;
      // Clamp unemployment to macroCountryTurn's own bounds (UNEMPLOYMENT_MIN/MAX,
      // percent), not the wider [0,1] fraction range: an unclamped-to-macro-bounds
      // bill effect could otherwise push unemployment below the 1% floor
      // macroCountryTurn always enforces, surfacing as an intermittent bounds-sanity
      // failure whenever the rng stream happens to enact such a bill near the floor
      // (residual found and fixed during W9; not corporation-specific).
      econ.unemploymentRate = Math.max(UNEMPLOYMENT_MIN / 100, Math.min(UNEMPLOYMENT_MAX / 100, econ.unemploymentRate));
    }
  }
  if (effect.partySupport) {
    // Apply to party support cluster: for sponsor party, boost registration/org in all regions
    const partyId = bill.sponsorPartyId;
    if (partyId) {
      for (const key of Object.keys(world.partyRegions)) {
        if (key.endsWith(`:${partyId}`)) {
          const pr = world.partyRegions[key];
          if (!pr) continue;
          if (effect.partySupport.registrationDelta) pr.registration = Math.min(100, pr.registration + effect.partySupport.registrationDelta);
          if (effect.partySupport.organizationDelta) pr.organization = Math.min(100, pr.organization + effect.partySupport.organizationDelta);
        }
      }
      for (const key of Object.keys(world.partyPressures)) {
        if (key.startsWith(`${partyId}:`)) {
          const pp = world.partyPressures[key];
          if (!pp) continue;
          if (effect.partySupport.pressureDelta) pp.value = Math.min(100, pp.value + effect.partySupport.pressureDelta);
        }
      }
      // Candidate support bump for sponsor party members
      for (const pol of world.politicians) {
        if (pol.partyId === partyId) {
          const cs = world.candidateSupports[pol.id];
          if (cs && effect.partySupport.supportDelta) cs.support = Math.min(100, cs.support + effect.partySupport.supportDelta);
        }
      }
    }
  }
}

/**
 * State bill timers — regional equivalent.
 * Mirrors mainline src/lib/turn/billLifecycle/regionalEngine.ts processStateBillTimers
 * but for solo's stateBills collection. Since solo has no separate collection,
 * we model state bills as Bills with scope regional and regionId.
 */
export function processStateBillTimers(world: WorldState): { billsProcessed: number } {
  let billsProcessed = 0;
  const turn = world.meta.turn;
  // State bills are Bills with allowedScope regional tracked separately?
  // For solo, we treat world.stateBills if exists, else no-op.
  const stateBills: Bill[] = (world as unknown as { stateBills?: Bill[] }).stateBills ?? [];
  for (const bill of stateBills) {
    if (bill.status === "active" && (bill.votingEndsOnTurn ?? Infinity) <= turn) {
      const tally = tallyVotes(bill.votes);
      bill.votesFor = tally.for;
      bill.votesAgainst = tally.against;
      bill.votesAbstain = tally.abstain;
      if (didPass(tally.for, tally.against)) {
        // No governor in solo state: auto-enact if no executive? Use same enrolled path
        bill.status = "enrolled";
        bill.presidentActionDeadlineOnTurn = turn + EXEC_WINDOW_TURNS;
      } else {
        bill.status = "failed";
        bill.failedAtTurn = turn;
      }
      bill.updatedAtTurn = turn;
      billsProcessed++;
    }
    if (bill.status === "enrolled" && (bill.presidentActionDeadlineOnTurn ?? Infinity) <= turn) {
      bill.status = "signed";
      bill.enactedAtTurn = turn;
      bill.updatedAtTurn = turn;
      applyBillEffects(world, bill);
      billsProcessed++;
    }
  }
  return { billsProcessed };
}
