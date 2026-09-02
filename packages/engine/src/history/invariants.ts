/**
 * Invariant checks — W41 port of mainline's ledgerReconcile
 * (AHDGame src/lib/ledger/reconcile.ts reconcileLedger / reconcileTurn).
 *
 * Mainline's reconciler runs three checks over double-entry ledger legs:
 *  1. Trial balance — every ledger entry's legs sum to ~0 (anchor and,
 *     for single-currency entries, native units too).
 *  2. Stock vs flow — per account, the ledger-implied balance delta must
 *     match the account's actual balance delta this turn.
 *  3. Money supply — per currency, minted vs sunk amounts are reported
 *     (net creation/retirement is a legitimate outcome), flagged only when
 *     there are unattributed-reason legs (unexplained mint/sink).
 * Status is green/amber/red per check, worst-of rolled up to an overall
 * status; violations are logged/alerted, never thrown or auto-corrected.
 *
 * Solo has no ledger-entry collection (no database, no double-entry
 * postings) to run that exact algorithm against. This module checks the
 * same CLASS of bug — money or units appearing/vanishing, sums drifting
 * from their components, history growing unbounded — directly against
 * WorldState's own aggregates, which is what solo actually has:
 *  - shareConservation ~ trial balance: a corporation's shareholders' shares
 *    plus its public float must equal totalShares (Corporation.totalShares,
 *    corporation/types.ts) at all times — shares neither created nor
 *    destroyed outside founding/split (no splits ported — market/
 *    constants.ts SHARE_PRICE_MAX_TURN_MOVE file doc).
 *  - bondUnitConservation ~ trial balance: a bond's holder units plus its
 *    publicFloat must never exceed totalIssued / BOND_UNIT_FACE_VALUE.
 *  - budgetComponentSums ~ trial balance: BudgetRevenue/BudgetSpending's
 *    named components must sum to their own `.total` field (budget/types.ts).
 *  - moneyAggregateNonNegative ~ money supply: CentralBank.externalBroadMoney
 *    and DepositInsuranceFund.balance must stay >= 0 and finite.
 *  - historyBounded ~ stock vs flow (a growth-rate check in spirit: mainline
 *    flags divergence between implied and actual deltas; solo flags the one
 *    growth divergence a bounded ring buffer must never show — length
 *    exceeding its own cap, i.e. history/phases.ts pushCapped not doing its
 *    job): every WorldHistory series must stay at or under HISTORY_CAP.
 *  - playerCashNonNegative: WorldState.player.cash must never go negative
 *    (a soft signal — flagged amber, not red, since no invariant elsewhere
 *    in the engine currently prevents an action from overdrawing it).
 *
 * Exposed as a pure function (no IO, no turn-pipeline wiring — mainline's
 * own ledgerReconcile is gated behind a shadow-ledger flag off in prod, so
 * this is likewise opt-in: call it from the CLI `invariants` command or a
 * future debug/admin surface, not from every turn).
 */

import type { WorldState } from "../types.js";
import { HISTORY_CAP } from "./types.js";
import { BOND_UNIT_FACE_VALUE } from "../bonds/constants.js";

export type InvariantSeverity = "green" | "amber" | "red";

export interface InvariantFinding {
  check: string;
  severity: "amber" | "red";
  message: string;
  detail?: Record<string, unknown>;
}

export interface InvariantReport {
  turn: number;
  status: InvariantSeverity;
  checksRun: number;
  findings: InvariantFinding[];
}

const EPS = 1; // currency-unit epsilon for component-sum comparisons (rounding tolerance)

function worse(a: InvariantSeverity, b: InvariantSeverity): InvariantSeverity {
  const rank: Record<InvariantSeverity, number> = { green: 0, amber: 1, red: 2 };
  return rank[b] > rank[a] ? b : a;
}

export function checkInvariants(world: WorldState): InvariantReport {
  const findings: InvariantFinding[] = [];
  let checksRun = 0;

  // 1. Share conservation (trial balance analog).
  for (const corp of Object.values(world.corporations)) {
    checksRun++;
    const held = corp.shareholders.reduce((s, sh) => s + sh.shares, 0);
    const accounted = held + corp.publicFloat;
    if (accounted !== corp.totalShares) {
      findings.push({
        check: "shareConservation",
        severity: "red",
        message: `Corporation ${corp.id}: shareholders (${held}) + publicFloat (${corp.publicFloat}) = ${accounted} != totalShares (${corp.totalShares})`,
        detail: { corpId: corp.id, held, publicFloat: corp.publicFloat, totalShares: corp.totalShares },
      });
    }
  }

  // 2. Bond unit conservation (trial balance analog).
  for (const bond of Object.values(world.bonds)) {
    checksRun++;
    const holderUnits = bond.holders.reduce((s, h) => s + h.units, 0);
    const totalUnits = bond.totalIssued / BOND_UNIT_FACE_VALUE;
    const accounted = holderUnits + bond.publicFloat;
    if (accounted > totalUnits + EPS) {
      findings.push({
        check: "bondUnitConservation",
        severity: "red",
        message: `Bond ${bond.id}: holders (${holderUnits}) + publicFloat (${bond.publicFloat}) = ${accounted} exceeds totalIssued/faceValue (${totalUnits})`,
        detail: { bondId: bond.id, holderUnits, publicFloat: bond.publicFloat, totalUnits },
      });
    }
  }

  // 3. Budget component sums (trial balance analog).
  for (const budget of Object.values(world.budgets)) {
    checksRun++;
    const r = budget.revenue;
    const revSum = r.incomeTax + r.domesticCorporateTax + r.foreignCorporateTax + r.payrollTax + r.tariffs + r.salesTax + r.other;
    if (Math.abs(revSum - r.total) > EPS) {
      findings.push({
        check: "budgetRevenueSum",
        severity: "red",
        message: `Budget ${budget.countryId}: revenue components sum to ${revSum} but total is ${r.total}`,
        detail: { countryId: budget.countryId, revSum, total: r.total },
      });
    }
    checksRun++;
    const s = budget.spending;
    const categorySum = Object.values(s.byCategory).reduce((sum, v) => sum + v, 0);
    const spendSum = categorySum + s.stateGrants + s.debtInterest;
    if (Math.abs(spendSum - s.total) > EPS) {
      findings.push({
        check: "budgetSpendingSum",
        severity: "red",
        message: `Budget ${budget.countryId}: spending components sum to ${spendSum} but total is ${s.total}`,
        detail: { countryId: budget.countryId, spendSum, total: s.total },
      });
    }
  }

  // 4. Money aggregates non-negative and finite (money supply analog).
  for (const bank of Object.values(world.centralBanks)) {
    checksRun++;
    if (!Number.isFinite(bank.externalBroadMoney) || bank.externalBroadMoney < 0) {
      findings.push({
        check: "moneyAggregateNonNegative",
        severity: "red",
        message: `CentralBank ${bank.countryId}: externalBroadMoney is invalid (${bank.externalBroadMoney})`,
        detail: { countryId: bank.countryId, externalBroadMoney: bank.externalBroadMoney },
      });
    }
  }
  for (const fund of Object.values(world.depositInsurance)) {
    checksRun++;
    if (!Number.isFinite(fund.balance) || fund.balance < 0) {
      findings.push({
        check: "moneyAggregateNonNegative",
        severity: "red",
        message: `DepositInsuranceFund ${fund.countryId}: balance is invalid (${fund.balance})`,
        detail: { countryId: fund.countryId, balance: fund.balance },
      });
    }
  }

  // 5. WorldHistory series bounded (stock-vs-flow analog: a ring buffer must
  // never exceed its own cap).
  const boundedSeries: Array<{ label: string; entries: Array<[string, unknown[]]> }> = [
    { label: "macro", entries: Object.entries(world.history.macro) },
    { label: "primeRate", entries: Object.entries(world.history.primeRate) },
    { label: "partyStrength", entries: Object.entries(world.history.partyStrength) },
    { label: "moneySupply", entries: Object.entries(world.history.moneySupply) },
  ];
  for (const { label, entries } of boundedSeries) {
    for (const [id, arr] of entries) {
      checksRun++;
      if (arr.length > HISTORY_CAP) {
        findings.push({
          check: "historyBounded",
          severity: "red",
          message: `WorldHistory.${label}[${id}] has ${arr.length} entries, exceeding HISTORY_CAP (${HISTORY_CAP})`,
          detail: { series: label, id, length: arr.length, cap: HISTORY_CAP },
        });
      }
    }
  }
  checksRun++;
  if (world.history.playerWealth.length > HISTORY_CAP) {
    findings.push({
      check: "historyBounded",
      severity: "red",
      message: `WorldHistory.playerWealth has ${world.history.playerWealth.length} entries, exceeding HISTORY_CAP (${HISTORY_CAP})`,
      detail: { series: "playerWealth", length: world.history.playerWealth.length, cap: HISTORY_CAP },
    });
  }

  // 6. Player cash non-negative (soft signal).
  checksRun++;
  if (!Number.isFinite(world.player.cash) || world.player.cash < 0) {
    findings.push({
      check: "playerCashNonNegative",
      severity: "amber",
      message: `Player cash is negative or invalid (${world.player.cash})`,
      detail: { cash: world.player.cash },
    });
  }

  let status: InvariantSeverity = "green";
  for (const f of findings) status = worse(status, f.severity);

  return { turn: world.meta.turn, status, checksRun, findings };
}
