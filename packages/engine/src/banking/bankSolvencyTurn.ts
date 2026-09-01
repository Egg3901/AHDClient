/**
 * Bank solvency turn phase — W12 port of src/lib/turn/bankSolvencyTurn.ts
 * processBankSolvencyTurn (+ evaluateOneBank).
 *
 * Confidence/warning-band scoring, NPC deposit flight on amber/red, the
 * run-failure test, contagion panic to same-country peers, and failed-bank
 * depositor resolution.
 *
 * Scope cut vs mainline (see banking/types.ts file doc): no proprietary
 * trading book, so mainline's `isPropRunningCharter`/investment-bank branch
 * (mark-to-market, force-liquidation, the `band === "red" && equityBase <=
 * 0` failure test) has no solo counterpart — every solo bank is retail, so
 * only the deposit-taking failure test (`RUN_FAILURE_COVER_FRACTION`) runs.
 *
 * Treasury backstop (PORT-STUB, flagged for operator review): mainline funds
 * a failed bank's uninsured NPC deposits from the federal budget after the
 * insurance fund is exhausted (insurance.ts DEPOSIT_INSURANCE_SPENDING_KEY,
 * depositBookReturn.ts). Rotunda's budget module (W2) has no live spending
 * hook wired for this, and adding one risks the budget invariants a
 * different wave owns — see this file's `resolveFailedBank` for the honest
 * alternative: an uninsured excess is money that already left the bank's
 * books when it failed and is not returned to the household pool. It is
 * accounted (visible in the returned summary), not silently dropped.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import {
  CONTAGION_PANIC_TURNS,
  FLIGHT_RATE_BY_BAND,
  INSURED_CAP_CAPITAL_MULTIPLE,
  RESERVE_REQUIREMENT,
  RUN_FAILURE_COVER_FRACTION,
  computeConfidence,
} from "./constants.js";

export interface BankSolvencyTurnSummary {
  banksEvaluated: number;
  fled: number;
  failures: number;
  contagionTriggered: number;
  insurancePaid: number;
  uninsuredLoss: number;
}

export const bankSolvencyTurnPhase: TurnPhase = {
  name: "bankSolvencyTurn",
  run(world) {
    const turn = world.meta.turn;
    const summary: BankSolvencyTurnSummary = {
      banksEvaluated: 0,
      fled: 0,
      failures: 0,
      contagionTriggered: 0,
      insurancePaid: 0,
      uninsuredLoss: 0,
    };

    const candidates = Object.values(world.corporations).filter(
      (c) => c.bankCharter && c.bankCharter.status === "active" && c.bankCharter.lastSolvencyTurn !== turn,
    );
    if (candidates.length === 0) return;

    const failedThisTurnByCountry = new Map<string, string[]>();
    const evaluated: { corp: Corporation; failed: boolean }[] = [];

    for (const corp of candidates) {
      const failed = evaluateOneBank(world, corp, turn, summary);
      evaluated.push({ corp, failed });
      summary.banksEvaluated += 1;
      if (failed) {
        summary.failures += 1;
        const list = failedThisTurnByCountry.get(corp.countryId) ?? [];
        list.push(corp.id);
        failedThisTurnByCountry.set(corp.countryId, list);
      }
    }

    // Contagion: every OTHER active deposit-taking charter in the same country.
    if (failedThisTurnByCountry.size > 0) {
      for (const { corp, failed } of evaluated) {
        if (failed) continue;
        const failedPeers = failedThisTurnByCountry.get(corp.countryId);
        if (!failedPeers || failedPeers.length === 0) continue;
        const charter = corp.bankCharter!;
        charter.panicTurns = Math.max(charter.panicTurns, CONTAGION_PANIC_TURNS);
        summary.contagionTriggered += 1;
      }
    }

    for (const { corp, failed } of evaluated) {
      if (failed) continue;
      const charter = corp.bankCharter!;
      if (!failedThisTurnByCountry.get(corp.countryId)?.length) {
        charter.panicTurns = Math.max(0, charter.panicTurns - 1);
      }
      charter.lastSolvencyTurn = turn;
    }
  },
};

/** Returns true if this bank failed this turn. */
function evaluateOneBank(
  world: WorldState,
  corp: Corporation,
  turn: number,
  summary: BankSolvencyTurnSummary,
): boolean {
  const charter = corp.bankCharter!;
  const bank = world.centralBanks[corp.countryId];
  if (!bank) return false;

  const arrearsOutstanding = sumLoanOutstanding(world, corp.id, "arrears");
  const defaultsLastTurn = sumLoanOutstanding(world, corp.id, "defaulted", turn);

  const { confidence, band } = computeConfidence({
    cashReserves: charter.cashReserves,
    cashBackedDeposits: charter.npcDeposits,
    totalLoans: charter.totalLoans,
    reserveRatioRequired: RESERVE_REQUIREMENT,
    arrearsOutstanding,
    defaultsLastTurn,
    panicTurns: charter.panicTurns,
  });

  const priorBand = charter.warningBand;
  if (priorBand === "amber" || priorBand === "red") {
    const rate = FLIGHT_RATE_BY_BAND[priorBand];
    const outflow = Math.min(charter.npcDeposits * rate, Math.max(0, charter.cashReserves));
    if (outflow > 0) {
      charter.cashReserves = Math.max(0, charter.cashReserves - outflow);
      charter.npcDeposits = Math.max(0, charter.npcDeposits - outflow);
      bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + outflow);
      summary.fled += outflow;
    }
  }

  const requiredLiquidity = RESERVE_REQUIREMENT * charter.npcDeposits;
  const fails = priorBand === "red" && charter.cashReserves < RUN_FAILURE_COVER_FRACTION * requiredLiquidity;

  if (fails) {
    resolveFailedBank(world, corp, turn, summary);
    charter.status = "failed";
    charter.failedTurn = turn;
    charter.confidence = confidence;
    charter.warningBand = band;
    charter.lastSolvencyTurn = turn;
    return true;
  }

  charter.confidence = confidence;
  charter.warningBand = band;
  return false;
}

function sumLoanOutstanding(world: WorldState, bankCorpId: string, status: "arrears" | "defaulted", lastProcessedTurn?: number): number {
  let total = 0;
  for (const loan of world.bankLoans) {
    if (loan.bankCorpId !== bankCorpId) continue;
    if (loan.borrowerType === "npcBulk") continue;
    if (loan.status !== status) continue;
    if (lastProcessedTurn !== undefined && loan.lastProcessedTurn !== lastProcessedTurn) continue;
    total += Math.max(0, loan.outstanding);
  }
  return total;
}

/**
 * Failed-bank depositor resolution. Source: insurance.ts
 * resolveFailedBankDepositors + depositBookReturn.ts waterfall, scope-cut to
 * solo's single named player + one NPC household pool (see file doc for the
 * Treasury-backstop cut).
 *
 * NPC deposits are cash-backed: the bank's remaining cash pays the household
 * pool first, the insurance fund tops up to `insuredCap` next, and anything
 * still short is an uninsured loss (accounted in the summary, not silently
 * destroyed nor invented).
 *
 * Player savings are a POINTER (see constants.ts / balanceSheet.ts doc): no
 * cash ever left `player.savings` for a deposit, so failure costs the
 * player the counterparty and future yield, never the principal — the
 * holder simply flips back to "centralBank", exactly mirroring mainline's
 * documented player-savings failure behavior.
 */
function resolveFailedBank(world: WorldState, corp: Corporation, turn: number, summary: BankSolvencyTurnSummary): void {
  const charter = corp.bankCharter!;
  const bank = world.centralBanks[corp.countryId];
  if (charter.depositorsResolvedTurn !== null) return;

  let available = Math.max(0, charter.cashReserves);
  let npcClaim = Math.max(0, charter.npcDeposits);

  const fromCash = Math.min(available, npcClaim);
  available -= fromCash;
  npcClaim -= fromCash;
  if (bank) bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + fromCash);

  const insuredCap = charter.postedCapital * INSURED_CAP_CAPITAL_MULTIPLE;
  const fund = world.depositInsurance[corp.countryId];
  if (fund && npcClaim > 0) {
    const fromFund = Math.min(fund.balance, npcClaim, insuredCap);
    if (fromFund > 0) {
      fund.balance -= fromFund;
      fund.payoutsLifetime += fromFund;
      if (bank) bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + fromFund);
      npcClaim -= fromFund;
      summary.insurancePaid += fromFund;
    }
  }
  if (npcClaim > 0) summary.uninsuredLoss += npcClaim;

  if (world.player.countryId === corp.countryId && world.player.savingsHolder === corp.id) {
    world.player.savingsHolder = "centralBank";
  }

  charter.npcDeposits = 0;
  charter.cashReserves = 0;
  charter.depositorsResolvedTurn = turn;
}
