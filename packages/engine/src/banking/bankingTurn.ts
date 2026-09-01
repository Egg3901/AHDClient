/**
 * Banking turn phase — W12 port of src/lib/turn/bankingTurn.ts
 * processBankingTurn (+ processOneBank, servicePlayerLoan, serviceNpcBulkBook).
 *
 * Runs the NPC deposit flow, deposit interest (now correctly paid by the
 * bank for savings held there — see finance/savingsInterest.ts file doc,
 * whose own `holder !== "centralBank"` branch is intentionally never reached
 * by a wired caller: THIS phase is what actually pays that interest for
 * real WorldState players), named-loan servicing, the NPC household bulk
 * loan book, and the deposit-insurance premium.
 *
 * Scope cut vs mainline (cited once, applies to this whole module — see
 * banking/types.ts file doc for the itemized list): no interbank market, no
 * central-bank margin line, no B8 discount window, no proprietary trading
 * book. Those all sit behind mainline's separate `bankPropTradingEnabled`
 * kill switch (isBankPropTradingEnabled) and mainline's own bankingTurn.ts
 * runs them in a dedicated `serviceInterbankAndCbMargin` pass gated on that
 * flag — this port simply never calls that pass.
 *
 * Ordering within one bank's pass mirrors mainline processOneBank exactly:
 * (a) NPC deposit flow, (b) deposit interest, (c) insurance premium,
 * (d) named-loan servicing, (e) NPC household bulk book.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import type { BankLoan } from "./types.js";
import {
  ARREARS_DEFAULT_TURNS,
  CREDIT_BANDS,
  DEPOSIT_CEILING_CAPITAL_MULTIPLE,
  INSURED_CAP_CAPITAL_MULTIPLE,
  RESERVE_REQUIREMENT,
  TURNS_PER_YEAR,
  bandRatePercent,
  bandsForProfile,
  bankEquity,
  computeInsurancePremium,
  computeNpcDepositShare,
  computeNpcLoanBookVolume,
  computeReserveRatioActual,
  effectiveDepositRatePercent,
  effectiveLendingRatePercent,
  equityCappedDepositCeiling,
  npcFlowDelta,
  perTurnInterest,
  roundMoney,
  sumInsuredPlayerDeposits,
} from "./constants.js";

function ensureInsuranceFund(world: WorldState, countryId: string, insuredCap: number): void {
  if (!world.depositInsurance[countryId]) {
    world.depositInsurance[countryId] = {
      countryId,
      balance: 0,
      insuredCap,
      premiumsCollectedLifetime: 0,
      payoutsLifetime: 0,
    };
  } else {
    world.depositInsurance[countryId]!.insuredCap = insuredCap;
  }
}

/** Deposit ceiling from the capital-scale proxy, equity-capped. Source: capacityAllocation.ts + deposits.ts (see constants.ts file doc). */
function depositCeilingFor(charter: NonNullable<Corporation["bankCharter"]>): number {
  const capacityCeilingProxy = charter.postedCapital * DEPOSIT_CEILING_CAPITAL_MULTIPLE;
  const equity = bankEquity(charter.cashReserves, charter.totalLoans, charter.npcDeposits);
  return equityCappedDepositCeiling(capacityCeilingProxy, equity);
}

function servicedLoansForBank(world: WorldState, bankCorpId: string, turn: number): BankLoan[] {
  return world.bankLoans.filter(
    (l) =>
      l.bankCorpId === bankCorpId &&
      l.borrowerType !== "npcBulk" &&
      (l.status === "current" || l.status === "arrears") &&
      l.lastProcessedTurn !== turn,
  );
}

/** Borrower's available balance for loan servicing. Source: bankingTurn.ts readBorrowerAvailable, adapted to solo's borrower kinds. */
function borrowerAvailable(world: WorldState, loan: BankLoan): number {
  if (loan.borrowerType === "player") return Math.max(0, world.player.cash);
  if (loan.borrowerType === "corporation") {
    const corp = loan.borrowerId ? world.corporations[loan.borrowerId] : undefined;
    return corp ? Math.max(0, corp.liquidCapital) : 0;
  }
  return 0;
}

function debitBorrower(world: WorldState, loan: BankLoan, amount: number): void {
  if (amount <= 0) return;
  if (loan.borrowerType === "player") {
    world.player.cash = Math.max(0, world.player.cash - amount);
    return;
  }
  if (loan.borrowerType === "corporation" && loan.borrowerId) {
    const corp = world.corporations[loan.borrowerId];
    if (corp) corp.liquidCapital = Math.max(0, corp.liquidCapital - amount);
  }
}

/**
 * Service one named loan for one turn. Source: bankingTurn.ts servicePlayerLoan
 * (verbatim math; DB money-move ceremony dropped — solo mutates WorldState
 * synchronously with no concurrent writers, see finance/savingsInterest.ts
 * and lineOfCredit.ts for the same simplification already established).
 */
function serviceNamedLoan(
  world: WorldState,
  charter: NonNullable<Corporation["bankCharter"]>,
  loan: BankLoan,
  turn: number,
): { interestCollected: number; principalRepaid: number; writtenOff: number } {
  const outstanding = Math.max(0, loan.outstanding);
  if (outstanding <= 0) {
    loan.status = "repaid";
    loan.outstanding = 0;
    loan.arrearsTurns = 0;
    loan.lastProcessedTurn = turn;
    return { interestCollected: 0, principalRepaid: 0, writtenOff: 0 };
  }

  const remainingTurns = Math.max(1, loan.originatedTurn + loan.termTurns - turn);
  const interestDue = (outstanding * (loan.ratePercent / 100)) / TURNS_PER_YEAR;
  const principalDue = outstanding / remainingTurns;
  const paymentDue = interestDue + principalDue;

  const available = borrowerAvailable(world, loan);
  const payment = Math.min(paymentDue, Math.max(0, available));

  if (payment < paymentDue - 1e-9) {
    const interestPaid = Math.min(payment, interestDue);
    const principalPaid = Math.max(0, payment - interestPaid);
    const nextOutstanding = Math.max(0, outstanding - principalPaid);
    const arrearsTurns = loan.arrearsTurns + 1;

    debitBorrower(world, loan, payment);
    charter.cashReserves += payment;

    if (arrearsTurns >= ARREARS_DEFAULT_TURNS) {
      loan.outstanding = nextOutstanding;
      loan.status = "defaulted";
      loan.arrearsTurns = arrearsTurns;
      loan.lastProcessedTurn = turn;
      charter.totalLoans = Math.max(0, charter.totalLoans - (principalPaid + nextOutstanding));
      return { interestCollected: interestPaid, principalRepaid: principalPaid, writtenOff: nextOutstanding };
    }

    loan.outstanding = nextOutstanding;
    loan.status = "arrears";
    loan.arrearsTurns = arrearsTurns;
    loan.lastProcessedTurn = turn;
    charter.totalLoans = Math.max(0, charter.totalLoans - principalPaid);
    return { interestCollected: interestPaid, principalRepaid: principalPaid, writtenOff: 0 };
  }

  const principalPaid = Math.min(principalDue, outstanding);
  debitBorrower(world, loan, paymentDue);
  charter.cashReserves += paymentDue;
  loan.outstanding = Math.max(0, outstanding - principalPaid);
  loan.status = loan.outstanding <= 0 ? "repaid" : "current";
  loan.arrearsTurns = 0;
  loan.lastProcessedTurn = turn;
  charter.totalLoans = Math.max(0, charter.totalLoans - principalPaid);
  return { interestCollected: interestDue, principalRepaid: principalPaid, writtenOff: 0 };
}

/**
 * Service the NPC household book, one tranche per open credit band.
 * Source: bankingTurn.ts serviceNpcBulkBook (verbatim ramp/interest/default
 * math; per-band bulkWrite ceremony dropped for the same reason as above).
 */
function serviceNpcBulkBook(
  world: WorldState,
  corp: Corporation,
  charter: NonNullable<Corporation["bankCharter"]>,
  turn: number,
  lendingRatePercent: number,
  reserveRatioRequired: number,
): void {
  const bank = world.centralBanks[corp.countryId];
  if (!bank) return;

  const existing = world.bankLoans.filter((l) => l.bankCorpId === corp.id && l.borrowerType === "npcBulk" && (l.status === "current" || l.status === "arrears"));
  if (existing.some((l) => l.lastProcessedTurn === turn)) return;

  const loanFundingCapacity = charter.npcDeposits * (1 - reserveRatioRequired);
  const requiredReservesAmount = charter.npcDeposits * reserveRatioRequired;
  const currentTotal = existing.reduce((sum, l) => sum + Math.max(0, l.outstanding), 0);
  const nonNpcLoans = Math.max(0, charter.totalLoans - currentTotal);
  const npcFundingCapacity = Math.max(0, loanFundingCapacity - nonNpcLoans);

  const openBands = new Set(bandsForProfile(charter.lendingProfile).map((b) => b.id));
  const byBand = new Map(existing.map((l) => [l.creditBand, l] as const));

  let creditedToPool = 0;

  for (const band of CREDIT_BANDS) {
    const open = openBands.has(band.id);
    const loan = byBand.get(band.id);
    if (!open && !loan) continue;

    const rate = bandRatePercent(band, lendingRatePercent);
    const target = open ? Math.max(0, computeNpcLoanBookVolume(npcFundingCapacity * band.demandShare, rate)) : 0;
    const ratePercent = loan ? loan.ratePercent : rate;
    const current = Math.max(0, loan?.outstanding ?? 0);
    let adjust = npcFlowDelta(current, target);

    if (adjust > 0) {
      const lendable = Math.max(0, charter.cashReserves - requiredReservesAmount);
      adjust = Math.min(adjust, lendable);
      if (adjust > 0) {
        charter.cashReserves -= adjust;
        creditedToPool += adjust;
      }
    } else if (adjust < 0) {
      charter.cashReserves += -adjust;
      creditedToPool -= -adjust;
    }

    const nextOutstandingBeforeYield = Math.max(0, current + adjust);
    if (nextOutstandingBeforeYield <= 0 && current <= 0) continue;

    charter.totalLoans = Math.max(0, charter.totalLoans + adjust);

    const interest = (nextOutstandingBeforeYield * (ratePercent / 100)) / TURNS_PER_YEAR;
    const defaults = (nextOutstandingBeforeYield * (band.defaultRatePercent / 100)) / TURNS_PER_YEAR;

    const poolAvailable = Math.max(0, bank.externalBroadMoney);
    const interestAffordable = Math.min(interest, poolAvailable);
    if (interestAffordable > 0) {
      bank.externalBroadMoney = poolAvailable - interestAffordable;
      charter.cashReserves += interestAffordable;
    }

    const afterDefaults = Math.max(0, nextOutstandingBeforeYield - defaults);
    charter.totalLoans = Math.max(0, charter.totalLoans - defaults);

    if (loan) {
      loan.outstanding = afterDefaults;
      loan.principal = Math.max(loan.principal, afterDefaults);
      loan.ratePercent = ratePercent;
      loan.status = afterDefaults <= 0 ? "repaid" : "current";
      loan.lastProcessedTurn = turn;
    } else if (afterDefaults > 0) {
      world.bankLoans.push({
        id: `${corp.id}-npcBulk-${band.id}`,
        bankCorpId: corp.id,
        borrowerType: "npcBulk",
        borrowerId: null,
        creditBand: band.id,
        principal: afterDefaults,
        outstanding: afterDefaults,
        ratePercent,
        originatedTurn: turn,
        termTurns: TURNS_PER_YEAR,
        status: "current",
        arrearsTurns: 0,
        lastProcessedTurn: turn,
      });
    }
  }

  bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney + creditedToPool);
}

export const bankingTurnPhase: TurnPhase = {
  name: "bankingTurn",
  run(world) {
    const turn = world.meta.turn;

    const activeCharters = Object.values(world.corporations).filter(
      (c) => c.bankCharter && c.bankCharter.status === "active" && c.bankCharter.lastBankingTurn !== turn,
    );
    if (activeCharters.length === 0) return;

    // Competing NPC deposit shares, once per country (solo has at most one
    // deposit-taking bank per country — see npcBanks.ts file doc — but this
    // is written generically so a future multi-bank country still nets to
    // NPC_DEPOSIT_MAX_TOTAL_SHARE, exactly as mainline's per-currency pass does).
    const byCountry = new Map<string, Corporation[]>();
    for (const corp of activeCharters) {
      const list = byCountry.get(corp.countryId) ?? [];
      list.push(corp);
      byCountry.set(corp.countryId, list);
    }
    const npcShareByBankId = new Map<string, number>();
    for (const [countryId, corps] of byCountry) {
      const bank = world.centralBanks[countryId];
      if (!bank) continue;
      const shares = computeNpcDepositShare(
        corps.map((c) => ({
          bankId: c.id,
          effectiveDepositRatePercent: effectiveDepositRatePercent(bank.primeRate, c.bankCharter!.depositOffset),
        })),
        bank.primeRate, // solo has no wired savingsApyPercent path (see finance/savingsInterest.ts file doc); prime rate stands in for the CB savings APY comparison baseline.
      );
      for (const s of shares) npcShareByBankId.set(s.bankId, s.share);
    }

    for (const corp of activeCharters) {
      const charter = corp.bankCharter!;
      const bank = world.centralBanks[corp.countryId];
      if (!bank) continue;

      const depositRatePercent = effectiveDepositRatePercent(bank.primeRate, charter.depositOffset);
      const lendingRatePercent = effectiveLendingRatePercent(bank.primeRate, charter.lendingOffset);

      const playerHolds = world.player.countryId === corp.countryId && world.player.savingsHolder === corp.id;
      const playerDeposits = playerHolds ? Math.max(0, world.player.savings) : 0;

      // (a) NPC deposit flow
      const depositCeiling = depositCeilingFor(charter);
      const npcRoom = Math.max(0, depositCeiling - playerDeposits);
      const share = npcShareByBankId.get(corp.id) ?? 0;
      const uncappedTarget = share * Math.max(0, bank.externalBroadMoney);
      const targetNpc = Math.min(uncappedTarget, npcRoom);
      const delta = npcFlowDelta(charter.npcDeposits, targetNpc);
      if (delta !== 0) {
        const actual = delta > 0 ? Math.min(delta, Math.max(0, bank.externalBroadMoney)) : delta;
        if (actual !== 0) {
          bank.externalBroadMoney = Math.max(0, bank.externalBroadMoney - actual);
          charter.cashReserves = Math.max(0, charter.cashReserves + actual);
          charter.npcDeposits = Math.max(0, charter.npcDeposits + actual);
        }
      }

      // (b) Deposit interest — player pointer balance + NPC cash-backed balance,
      // paid from cashReserves, scaled down proportionally on shortfall.
      const playerInterestDue = playerDeposits > 0 ? perTurnInterest(playerDeposits, depositRatePercent) : 0;
      const npcInterestDue = perTurnInterest(charter.npcDeposits, depositRatePercent);
      const totalDue = playerInterestDue + npcInterestDue;
      const scale = totalDue > charter.cashReserves && totalDue > 0 ? charter.cashReserves / totalDue : 1;
      const playerInterestPaid = playerInterestDue > 0 ? roundMoney(playerInterestDue * scale) : 0;
      const npcInterestPaid = npcInterestDue > 0 ? roundMoney(npcInterestDue * scale) : 0;

      if (playerInterestPaid > 0) {
        charter.cashReserves = Math.max(0, charter.cashReserves - playerInterestPaid);
        world.player.savings += playerInterestPaid;
      }
      if (npcInterestPaid > 0) {
        // NPC interest is credited to the account already at this bank: the
        // liability grows and the cash never leaves (mirrors bankingTurn.ts).
        charter.npcDeposits += npcInterestPaid;
      }

      // (c) Deposit insurance premium
      const insuredCap = charter.postedCapital * INSURED_CAP_CAPITAL_MULTIPLE;
      ensureInsuranceFund(world, corp.countryId, insuredCap);
      const fund = world.depositInsurance[corp.countryId]!;
      const insuredDeposits =
        sumInsuredPlayerDeposits([playerDeposits + playerInterestPaid], insuredCap) + charter.npcDeposits;
      const reserveRatioActual = computeReserveRatioActual(charter.cashReserves, charter.npcDeposits);
      const premiumDue = computeInsurancePremium(insuredDeposits, reserveRatioActual, RESERVE_REQUIREMENT);
      if (premiumDue > 0) {
        const premiumPaid = Math.min(premiumDue, charter.cashReserves);
        if (premiumPaid > 0) {
          charter.cashReserves -= premiumPaid;
          fund.balance += premiumPaid;
          fund.premiumsCollectedLifetime += premiumPaid;
        }
      }

      // (d) Named loan servicing (player/corporation borrowers)
      for (const loan of servicedLoansForBank(world, corp.id, turn)) {
        serviceNamedLoan(world, charter, loan, turn);
      }

      // (e) NPC household bulk loan book
      serviceNpcBulkBook(world, corp, charter, turn, lendingRatePercent, RESERVE_REQUIREMENT);

      // (f) Recompute cached aggregates, stamp idempotency key
      const finalPlayerDeposits = playerDeposits + playerInterestPaid;
      charter.totalDeposits = finalPlayerDeposits + charter.npcDeposits;
      charter.depositCeiling = depositCeiling;
      charter.lastBankingTurn = turn;
    }
  },
};
