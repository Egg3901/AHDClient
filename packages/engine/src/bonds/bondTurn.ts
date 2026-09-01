/**
 * Bond turn logic — W13 port.
 *
 * Mainline sources:
 *  - src/lib/bonds/sovereign.ts (issueScheduledSovereignBondSeries, applySovereignDebtAdjustment, settleSovereignBondMaturity, getBondCountryId, calculateRollover)
 *  - src/lib/turn/bondTurn.ts (processBondTurn: coupon payments, market-price updates, maturity settlement, holder bookkeeping)
 *  - src/lib/constants/bonds.ts (pricing/yield/perTurn formulas)
 *  - src/lib/centralBank/marketEffects sovereignCredibilitySpread (B4) — PORT-STUB at 0 (no chairInfamy wiring)
 *
 * Solo simplifications (all cited as cut, no silent divergence):
 *  - Single sovereign maturity (48t) per quarterly auction, not staggered 48/96/240 distribution. The distribution is an admin reconcile convenience and not required for the quarterly deficit auction shape; trace still shows price/yield vs prime correctly.
 *  - Rollover: solo rolls over *exact* maturing principal coming due next quarter (like mainline's calculateSovereignRolloverAmount) but only for the integer number of bonds whose maturityTurn falls in [turn, turn+12). This keeps the float stable even in surplus — cited.
 *  - No FX: all sovereign bonds denominate in the issuing country's currencyCode (resolveCountryCurrencyCode analog: budget.currencyCode). Cross-currency player holds are blocked in the action layer (see bonds/actions buyBond forex guard).
 *  - No corporate bonds this wave — issuerType is always "sovereign". Corporate-bond helpers (credit score, spread) are out of scope.
 *  - No escrow/forexReserve/imf/recovery/legislative/central-bank-QE flows — all mainline default/sovereign-crisis machinery is PORT-STUB.
 *  - Holder bookkeeping: solo tracks only the human player ("player") plus the publicFloat (NPC bulk). Full per-character/corp/fund/NPP holder map is not ported.
 *
 * Each function below is pure over WorldState (plus RNG for issuance ids).
 */

import type { WorldState } from "../types.js";
import type { Bond, BondMaturityTurns } from "./types.js";
import {
  BOND_UNIT_FACE_VALUE,
  calculateBondMarketPrice,
  calculateBondYieldToMaturityPercent,
  getSovereignCouponRate,
  perTurnCouponPayment,
  shouldIssueQuarterlySovereignBondSeries,
  calculateQuarterlyIssuanceAmount,
  annualCouponCostForBond,
  TURNS_PER_YEAR,
  type BondTrace,
} from "./constants.js";

// Deterministic bond id — derived from turn and countryId so cross-world runs
// with the same seed produce identical ids without a global counter (which would
// leak state across worlds and break determinism tests).
function bondIdFor(turn: number, countryId: string): string {
  return `bond-${turn}-${countryId}`;
}

function countryNameFor(countryId: string): string {
  // Minimal display; pack name would be more precise but this is stable and JSON-safe.
  return countryId;
}

/**
 * Sum the totalIssued of active sovereign bonds for countryId that will mature
 * during the upcoming issuance interval [turn, turn+SOVEREIGN_ISSUANCE_INTERVAL_TURNS).
 * Mirrors sovereign.ts calculateSovereignRolloverAmount.
 */
export function calculateSovereignRolloverAmount(world: WorldState, countryId: string, turn: number): number {
  const interval = 12;
  let total = 0;
  for (const bond of Object.values(world.bonds ?? {})) {
    if (bond.matured || bond.defaulted) continue;
    if (bond.issuerType !== "sovereign") continue;
    if (bond.countryId !== countryId) continue;
    if (bond.maturityTurn >= turn && bond.maturityTurn < turn + interval) {
      total += bond.totalIssued ?? 0;
    }
  }
  return Math.floor(total / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
}

function applySovereignDebtAdjustment(
  budget: WorldState["budgets"][string],
  principalDelta: number,
  annualInterestDelta: number,
): void {
  // Mirrors sovereign.ts applySovereignDebtAdjustment spirit but inline over the solo
  // CountryBudget shape (no debtToGdpRatio/creditRating recompute until that system is ported).
  // Solo's debtInterest is the annual coupon sum (same unit as mainline's spending.debtInterest).
  const newPrincipal = Math.max(0, budget.debt.principal + principalDelta);
  const newDebtInterest = Math.max(0, budget.spending.debtInterest + annualInterestDelta);
  const newSpendingTotal = Math.max(0, budget.spending.total - budget.spending.debtInterest + newDebtInterest);
  budget.debt.principal = newPrincipal;
  budget.spending.debtInterest = newDebtInterest;
  budget.spending.total = newSpendingTotal;
  budget.surplus = budget.revenue.total - newSpendingTotal;
  budget.treasuryBalance -= principalDelta < 0 ? 0 : 0; // treasury handled by caller for maturity; issuance cash is virtual (debt accrual) not instant treasury bump — see note below.
  // Note: In mainline, issuance increments both debt.principal and spending.debtInterest, which reduces surplus (revenue - spending). The cash proceeds are not a revenue line — they are a debt draw that the treasuryBalance fiscalYear step will reconcile. We mirror that exactly here.
}

/**
 * Issue one quarterly sovereign bond series per deficit country.
 * Returns count of bonds created this turn.
 * Called by the bond issuance phase.
 */
export function issueScheduledSovereignBonds(world: WorldState): number {
  const turn = world.meta.turn;
  if (!shouldIssueQuarterlySovereignBondSeries(turn)) return 0;

  let issuancesCreated = 0;
  const maturityTurns: BondMaturityTurns = 48;
  for (const [countryId, budget] of Object.entries(world.budgets ?? {})) {
    // Skip if there is already a bond issued this turn for this country (idempotency guard)
    const existingThisTurn = Object.values(world.bonds ?? {}).some(
      (b) => b.countryId === countryId && b.issuedAtTurn === turn && !b.matured,
    );
    if (existingThisTurn) continue;

    const annualDeficit = Math.max(0, -(budget.surplus ?? 0));
    const deficitAmount = calculateQuarterlyIssuanceAmount(annualDeficit);
    const rolloverAmount = calculateSovereignRolloverAmount(world, countryId, turn);
    const issueAmount = deficitAmount + rolloverAmount;
    if (issueAmount < BOND_UNIT_FACE_VALUE) continue;

    const bank = world.centralBanks[countryId];
    const primeRate = bank?.primeRate ?? 3.0;
    const couponRate = getSovereignCouponRate(primeRate, maturityTurns);
    const totalUnits = Math.floor(issueAmount / BOND_UNIT_FACE_VALUE);
    const totalIssued = totalUnits * BOND_UNIT_FACE_VALUE;
    const annualCoupon = annualCouponCostForBond(couponRate, totalIssued);

    const id = bondIdFor(turn, countryId);
    const nowIso = world.meta.date;
    const bond: Bond = {
      id,
      issuerType: "sovereign",
      countryId,
      issuerName: countryNameFor(countryId),
      faceValue: BOND_UNIT_FACE_VALUE,
      couponRate,
      maturityTurns,
      issuedAtTurn: turn,
      maturityTurn: turn + maturityTurns,
      marketPrice: 1.0,
      totalIssued,
      publicFloat: totalUnits,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: budget.currencyCode ?? "USD",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    world.bonds[id] = bond;
    // Budget linkage: bump principal and annual interest (same-currency, no FX).
    // Keep spending.total and surplus consistent.
    applySovereignDebtAdjustment(budget, totalIssued, annualCoupon);
    issuancesCreated++;
  }
  return issuancesCreated;
}

/**
 * Pay per-turn coupons for active sovereign bonds and update market prices.
 * Returns total coupons paid to the player this turn (for ledger sanity).
 *
 * Budget link: total coupon cost (all units, all holders + float) is charged
 * against the issuing country's treasuryBalance each turn (mirrors the debtInterest
 * accrual already reflected in surplus, but treasuryBalance needs the per-turn
 * cash outflow). This keeps budget-debt invariants testable per turn.
 */
export function payCouponsAndUpdatePrices(world: WorldState): { totalToPlayer: number; budgetCoupons: Record<string, number> } {
  const turn = world.meta.turn;
  let totalToPlayer = 0;
  const budgetCoupons: Record<string, number> = {};

  for (const bond of Object.values(world.bonds ?? {})) {
    if (bond.matured || bond.defaulted) continue;

    const turnsRemaining = bond.maturityTurn - turn;
    // Market price vs W3 prime rate: price = f(couponRate, currentRate=primeRate)
    // Sovereign spread is AAA (0) so currentRate is just primeRate.
    const bank = world.centralBanks[bond.countryId];
    const primeRate = bank?.primeRate ?? 3.0;
    // No credibility spread in solo (PORT-STUB)
    const currentRate = primeRate;
    bond.marketPrice = calculateBondMarketPrice(bond.couponRate, currentRate, turnsRemaining, false);

    // Coupon per unit local (same currency as bond/ budget)
    const couponPerUnit = perTurnCouponPayment(bond.couponRate, bond.faceValue);
    const unitsTotal = Math.floor(bond.totalIssued / bond.faceValue);
    const totalCouponThisTurn = couponPerUnit * unitsTotal;

    // Track budget coupon charge (all units)
    budgetCoupons[bond.countryId] = (budgetCoupons[bond.countryId] ?? 0) + totalCouponThisTurn;

    // Credit the player for their held units
    for (const h of bond.holders) {
      if (h.holderId === "player") {
        const pay = couponPerUnit * h.units;
        if (pay > 0) {
          // Player cash is single-currency. Cross-currency holds are blocked at buy time, so this is same-currency.
          world.player.cash += pay;
          totalToPlayer += pay;
        }
      }
    }
  }

  // Charge budgets' treasuryBalance for the per-turn coupon outflow.
  // This does not change spending.debtInterest (annual accrual already accounts for it) — it is the cash drain.
  for (const [countryId, totalCoupon] of Object.entries(budgetCoupons)) {
    const budget = world.budgets[countryId];
    if (budget) budget.treasuryBalance -= totalCoupon;
  }

  return { totalToPlayer, budgetCoupons };
}

/**
 * Settle matured bonds: return face value to holders, reduce debt principal and
 * annual interest, and mark bonds matured. Mirrors sovereign.ts settleSovereignBondMaturity.
 */
export function settleMaturedBonds(world: WorldState): number {
  const turn = world.meta.turn;
  let maturedCount = 0;
  for (const bond of Object.values(world.bonds ?? {})) {
    if (bond.matured || bond.defaulted) continue;
    if (turn < bond.maturityTurn) continue;

    // Pay face value to player holders
    for (const h of bond.holders) {
      if (h.holderId === "player" && h.units > 0) {
        const face = h.units * bond.faceValue;
        world.player.cash += face;
      }
    }
    // Budget linkage: reverse the issuance adjustment (principal and annual coupon) at maturity.
    const budget = world.budgets[bond.countryId];
    if (budget) {
      const annualCoupon = annualCouponCostForBond(bond.couponRate, bond.totalIssued);
      // Principal repayment also drains treasuryBalance (real cash outflow, separate from coupon drain above)
      budget.treasuryBalance -= bond.totalIssued;
      applySovereignDebtAdjustment(budget, -bond.totalIssued, -annualCoupon);
    }
    bond.matured = true;
    bond.holders = [];
    bond.publicFloat = 0;
    bond.updatedAt = world.meta.date;
    maturedCount++;
  }
  return maturedCount;
}

/**
 * NPC holder behavior — deterministic, RNG-free but price-sensitive.
 * Each active bond: if yield > primeRate + 0.5pp, NPCs buy 1 unit from float (if any) per bond.
 * If yield < primeRate - 0.5pp, NPCs sell 1 unit back to float (simulated by bumping float — not tracked as individual NPC holdings).
 * This is intentionally minimal: it gives the float some drift without inventing a full order book.
 * Deterministic because it reads only bond fields and central bank primeRate — no RNG draw.
 */
export function runNpcHolderBehavior(world: WorldState): void {
  const turn = world.meta.turn;
  for (const bond of Object.values(world.bonds ?? {})) {
    if (bond.matured || bond.defaulted) continue;
    const turnsRemaining = bond.maturityTurn - turn;
    if (turnsRemaining <= 0) continue;
    const primeRate = world.centralBanks[bond.countryId]?.primeRate ?? 3.0;
    const y = calculateBondYieldToMaturityPercent(bond.couponRate, bond.marketPrice, turnsRemaining);
    if (y > primeRate + 0.5 && bond.publicFloat > 0) {
      // NPC buys one unit: float down, no tracked NPC holder needed (float is the NPC bulk)
      bond.publicFloat -= 1;
      bond.updatedAt = world.meta.date;
    } else if (y < primeRate - 0.5 && bond.publicFloat < Math.floor(bond.totalIssued / bond.faceValue)) {
      // NPC sells one unit back to float
      bond.publicFloat += 1;
      bond.updatedAt = world.meta.date;
    }
  }
}

export function getTraceBonds(world: WorldState): BondTrace[] {
  const turn = world.meta.turn;
  return Object.values(world.bonds ?? {})
    .filter((b) => !b.matured)
    .map((b) => {
      const turnsRemaining = Math.max(0, b.maturityTurn - turn);
      const playerUnits = b.holders.find((h) => h.holderId === "player")?.units ?? 0;
      return {
        id: b.id,
        countryId: b.countryId,
        couponRate: b.couponRate,
        marketPrice: b.marketPrice,
        yieldToMaturity: calculateBondYieldToMaturityPercent(b.couponRate, b.marketPrice, turnsRemaining),
        turnsRemaining,
        totalIssued: b.totalIssued,
        publicFloat: b.publicFloat,
        playerUnits,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Test helper: kept for api compatibility — no-op now that ids are deterministic via turn+country.
export function resetBondIdSequenceForTests(): void {}
