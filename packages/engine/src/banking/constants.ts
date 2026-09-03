/**
 * Private-banking formulas and constants — W12 port.
 *
 * Sources (AHDGame, verbatim unless noted, cited per constant/function):
 *  - src/lib/turn/bankingTurn.ts (per-turn interest, NPC flow ramp, arrears)
 *  - src/lib/turn/bankSolvencyTurn.ts (flight rate, run-failure cover)
 *  - src/lib/banking/deposits.ts (NPC deposit share math, equity-capped ceiling)
 *  - src/lib/banking/creditBands.ts (household credit bands + lending profiles)
 *  - src/lib/banking/lending.ts (NPC loan-book volume math)
 *  - src/lib/banking/confidence.ts (solvency confidence score)
 *  - src/lib/banking/insurance.ts (premium formula, insured-deposit sum)
 *  - src/lib/banking/rates.ts (effective rate floors)
 *  - src/lib/banking/balanceSheet.ts (bank equity, required reserves)
 *  - src/lib/banking/reserveBounds.ts (reserve-ratio era defaults)
 *  - src/lib/banking/npcBanks.ts (per-country NPC bank seeding)
 *
 * FX/anchor substitution (repo-wide pattern, cited once here): mainline sizes
 * charter capital, the deposit ceiling, and the insured cap off an era/FX
 * -anchored USD reference (getGdpAnchorRate, loadWorldEraUnitScale — see
 * src/lib/currency/gdpAnchorRate.ts). AHDClient has no FX/anchor system (see
 * corporation/founding.ts file doc for the same substitution already made for
 * founding capital). This module follows the identical precedent: every
 * dollar-reference constant below is replaced with a multiple of the
 * chartered corp's own founding revenue, which is already scaled correctly
 * to that country's real GDP (see world.ts seedCorporations). Multiples are
 * chosen to land in the same *relative* range mainline's own comments state
 * (e.g. "target deposits ~10-20x charter capital" — capacityAllocation.ts);
 * they are marked PROVISIONAL, exactly as mainline marks its own multipliers.
 */

import type { CreditBandId, LendingProfileId } from "./types.js";

// ── Per-turn cadence ─────────────────────────────────────────────────────
/** Source: src/lib/constants/turnTime.ts TURNS_PER_YEAR. */
export const TURNS_PER_YEAR = 48;

// ── Reserve requirement ──────────────────────────────────────────────────
/**
 * Source: src/lib/banking/reserveBounds.ts RESERVE_REQUIREMENT_HISTORICAL_DEFAULT.
 * Every AHDClient era pack shipped so far is historical (eraUnitScale > 1 in
 * mainline terms), so the modern default is never selected; unlike mainline
 * this is not era-conditional yet (see file doc — no eraUnitScale in solo).
 */
export const RESERVE_REQUIREMENT = 0.2;

// ── Rate floors ───────────────────────────────────────────────────────────
/** Source: rates.ts MIN_DEPOSIT_RATE_PERCENT. */
export const MIN_DEPOSIT_RATE_PERCENT = 0.05;
/** Source: rates.ts MIN_LENDING_RATE_PERCENT. */
export const MIN_LENDING_RATE_PERCENT = 0.1;

/** Effective deposit/lending rate = prime + offset, floored. Source: rates.ts effectiveBankRatesFromPrime. */
export function effectiveDepositRatePercent(primeRate: number, depositOffset: number): number {
  return Math.max(MIN_DEPOSIT_RATE_PERCENT, primeRate + depositOffset);
}
export function effectiveLendingRatePercent(primeRate: number, lendingOffset: number): number {
  return Math.max(MIN_LENDING_RATE_PERCENT, primeRate + lendingOffset);
}

// ── Rounding ──────────────────────────────────────────────────────────────
/**
 * Source: src/lib/currency/savingsInterest.ts roundSavingsAmount, already
 * ported at finance/savingsInterest.ts. Duplicated here (not imported) so
 * this module has no dependency on the unwired finance/ cluster — see that
 * file's doc for why it is a pure library with no live WorldState consumer.
 */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Per-turn interest on a balance at an annual percent rate. Source: bankingTurn.ts perTurnInterest. */
export function perTurnInterest(balance: number, annualPercent: number): number {
  if (!(balance > 0) || !(annualPercent > 0)) return 0;
  return roundMoney((balance * (annualPercent / 100)) / TURNS_PER_YEAR);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── NPC deposit flow ──────────────────────────────────────────────────────
/** Max fraction of the household target that can migrate each turn. Source: bankingTurn.ts MAX_NPC_FLOW_PER_TURN_FRACTION. */
export const MAX_NPC_FLOW_PER_TURN_FRACTION = 0.025;

/** Source: bankingTurn.ts npcFlowDelta (verbatim). */
export function npcFlowDelta(current: number, target: number): number {
  const cur = Math.max(0, current);
  const desired = target - cur;
  const maxOutflow = MAX_NPC_FLOW_PER_TURN_FRACTION * cur;
  const maxInflow = MAX_NPC_FLOW_PER_TURN_FRACTION * Math.max(target, cur);
  return clamp(desired, -maxOutflow, maxInflow);
}

/** Source: deposits.ts NPC_DEPOSIT_BASE_SHARE. */
export const NPC_DEPOSIT_BASE_SHARE = 0.08;
/** Source: deposits.ts NPC_DEPOSIT_MAX_SHARE_PER_BANK. */
export const NPC_DEPOSIT_MAX_SHARE_PER_BANK = 0.25;
/** Source: deposits.ts NPC_DEPOSIT_MAX_TOTAL_SHARE. */
export const NPC_DEPOSIT_MAX_TOTAL_SHARE = 0.6;
/** Source: deposits.ts NPC_DEPOSIT_APY_COMPARISON_FLOOR. */
export const NPC_DEPOSIT_APY_COMPARISON_FLOOR = 0.5;
/** Source: balanceSheet.ts / deposits.ts NPC_DEPOSIT_MAX_EQUITY_LEVERAGE. */
export const NPC_DEPOSIT_MAX_EQUITY_LEVERAGE = 12;

export interface NpcDepositBankInput {
  bankId: string;
  effectiveDepositRatePercent: number;
}
export interface NpcDepositShare {
  bankId: string;
  share: number;
}

/** Source: deposits.ts computeNpcDepositShare (verbatim math). */
export function computeNpcDepositShare(
  banks: readonly NpcDepositBankInput[],
  centralBankSavingsApyPercent: number,
): NpcDepositShare[] {
  const cbApy = Number.isFinite(centralBankSavingsApyPercent) ? centralBankSavingsApyPercent : 0;
  const denom = Math.max(cbApy, NPC_DEPOSIT_APY_COMPARISON_FLOOR);

  const raw: NpcDepositShare[] = banks.map((bank) => {
    const rate = Number.isFinite(bank.effectiveDepositRatePercent) ? bank.effectiveDepositRatePercent : 0;
    const premiumRatio = (rate - cbApy) / denom;
    const share = clamp(NPC_DEPOSIT_BASE_SHARE * (1 + premiumRatio), 0, NPC_DEPOSIT_MAX_SHARE_PER_BANK);
    return { bankId: bank.bankId, share };
  });

  const total = raw.reduce((sum, row) => sum + row.share, 0);
  if (total <= NPC_DEPOSIT_MAX_TOTAL_SHARE || total <= 0) return raw;

  const scale = NPC_DEPOSIT_MAX_TOTAL_SHARE / total;
  return raw.map((row) => ({ bankId: row.bankId, share: row.share * scale }));
}

/** Source: deposits.ts equityCappedDepositCeiling (verbatim). */
export function equityCappedDepositCeiling(capacityCeiling: number, bankEquity: number): number {
  const capacity = typeof capacityCeiling === "number" && Number.isFinite(capacityCeiling) ? Math.max(0, capacityCeiling) : 0;
  const equity = typeof bankEquity === "number" && Number.isFinite(bankEquity) ? bankEquity : 0;
  return Math.min(capacity, Math.max(0, equity) * NPC_DEPOSIT_MAX_EQUITY_LEVERAGE);
}

// ── Charter capital / deposit ceiling / insured cap (FX-anchor substitution) ──
/**
 * PROVISIONAL — flagged for user review. Fraction of the chartered corp's
 * OWN cash moved into the bank at charter time (postedCapital + cashReserves).
 * Adapted substitute for mainline's getCharterCapitalRequirement (FX-anchored
 * USD reference); see file doc. Half stays with the corp's ordinary
 * commodity-output business, half capitalizes the bank — real cash moves
 * corp -> bank, nothing is conjured.
 */
export const CHARTER_CAPITAL_LIQUID_CAPITAL_FRACTION = 0.5;

/**
 * PROVISIONAL — flagged for user review. Deposit ceiling as a multiple of
 * posted capital. Source range: capacityAllocation.ts file doc, "target
 * deposits at 50% branch share ~10-20x charter capital"; this substitutes the
 * midpoint of that stated range directly on posted capital since AHDClient has
 * no branch-capacity/financial-sector-capacity chain to derive it from (see
 * file doc). Still passed through {@link equityCappedDepositCeiling} exactly
 * as mainline does, so a bank cannot anchor more than its own equity allows
 * regardless of this multiple.
 */
export const DEPOSIT_CEILING_CAPITAL_MULTIPLE = 15;

/**
 * PROVISIONAL — flagged for user review. Insured cap as a multiple of
 * charter capital. Substitute for mainline's era/FX-anchored
 * INSURED_CAP_REFERENCE_USD (insurance.ts) — see file doc. Sized so the cap
 * sits well above any plausible single-player savings balance at this wave's
 * scale (the cap practically never binds against AHDClient's single named
 * character), matching the real-world intent that deposit insurance covers
 * "ordinary" savers in full.
 */
export const INSURED_CAP_CAPITAL_MULTIPLE = 2;

/** Source: insurance.ts BASE_PREMIUM_ANNUAL. */
export const BASE_PREMIUM_ANNUAL = 0.004;

/** Source: insurance.ts computeInsurancePremium (verbatim math). */
export function computeInsurancePremium(
  insuredDeposits: number,
  reserveRatioActual: number,
  reserveRatioRequired: number,
): number {
  const deposits = typeof insuredDeposits === "number" && Number.isFinite(insuredDeposits) ? Math.max(0, insuredDeposits) : 0;
  if (!(deposits > 0)) return 0;
  const actual = typeof reserveRatioActual === "number" && Number.isFinite(reserveRatioActual) ? Math.max(0, reserveRatioActual) : 0;
  const required = typeof reserveRatioRequired === "number" && Number.isFinite(reserveRatioRequired) ? reserveRatioRequired : 0;
  const riskWeight = clamp(2 - actual / Math.max(required, 0.01), 0.5, 3);
  return (deposits * BASE_PREMIUM_ANNUAL * riskWeight) / TURNS_PER_YEAR;
}

/** Source: insurance.ts sumInsuredPlayerDeposits (verbatim). */
export function sumInsuredPlayerDeposits(balances: readonly number[], insuredCap: number): number {
  const cap = Math.max(0, insuredCap);
  let total = 0;
  for (const bal of balances) {
    if (!(bal > 0)) continue;
    total += Math.min(bal, cap);
  }
  return total;
}

/** Source: insurance.ts computeReserveRatioActual (verbatim). */
export function computeReserveRatioActual(cashReserves: number, cashBackedDeposits: number): number {
  const deposits = Math.max(0, cashBackedDeposits);
  if (!(deposits > 0)) return 1;
  return Math.max(0, cashReserves) / deposits;
}

// ── Balance sheet ─────────────────────────────────────────────────────────
/**
 * Source: balanceSheet.ts bankEquity, scope-cut to the fields W12 carries
 * (no borrowings: interbank/CB-margin/discount-window are out of scope, see
 * types.ts file doc, so `totalBorrowings` is always 0 here).
 *   equity = cash + loans - cashBackedDeposits
 */
export function bankEquity(cashReserves: number, totalLoans: number, npcDeposits: number): number {
  return Math.max(0, cashReserves) + Math.max(0, totalLoans) - Math.max(0, npcDeposits);
}

/** Source: balanceSheet.ts requiredReserves (verbatim, scope-cut form). */
export function requiredReserves(npcDeposits: number, reserveRatio: number): number {
  return Math.max(0, npcDeposits) * Math.max(0, reserveRatio);
}

// ── Household credit bands ───────────────────────────────────────────────
/** Source: creditBands.ts CREDIT_BAND_IDS (verbatim order). */
export const CREDIT_BAND_IDS = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"] as const;

export interface CreditBand {
  id: CreditBandId;
  demandShare: number;
  ratePremiumPp: number;
  defaultRatePercent: number;
}

/** Source: creditBands.ts CREDIT_BANDS (verbatim). */
export const CREDIT_BANDS: readonly CreditBand[] = [
  { id: "AAA", demandShare: 0.1, ratePremiumPp: -1.5, defaultRatePercent: 0.2 },
  { id: "AA", demandShare: 0.15, ratePremiumPp: -0.75, defaultRatePercent: 0.5 },
  { id: "A", demandShare: 0.2, ratePremiumPp: 0, defaultRatePercent: 1.0 },
  { id: "BBB", demandShare: 0.22, ratePremiumPp: 1.0, defaultRatePercent: 2.0 },
  { id: "BB", demandShare: 0.18, ratePremiumPp: 2.5, defaultRatePercent: 4.5 },
  { id: "B", demandShare: 0.1, ratePremiumPp: 4.5, defaultRatePercent: 8.0 },
  { id: "CCC", demandShare: 0.05, ratePremiumPp: 8.0, defaultRatePercent: 15.0 },
];
const BAND_BY_ID = new Map<CreditBandId, CreditBand>(CREDIT_BANDS.map((b) => [b.id, b]));
export function getCreditBand(id: CreditBandId): CreditBand {
  return BAND_BY_ID.get(id)!;
}

/** Source: creditBands.ts LENDING_PROFILES floorBand (verbatim). */
const LENDING_PROFILE_FLOOR: Record<LendingProfileId, CreditBandId> = {
  conservative: "A",
  balanced: "BBB",
  aggressive: "CCC",
};
export const DEFAULT_LENDING_PROFILE: LendingProfileId = "balanced";

/** Source: creditBands.ts bandsForProfile (verbatim). */
export function bandsForProfile(profileId: LendingProfileId): CreditBand[] {
  const floorIndex = CREDIT_BAND_IDS.indexOf(LENDING_PROFILE_FLOOR[profileId]);
  return CREDIT_BANDS.filter((band) => CREDIT_BAND_IDS.indexOf(band.id) <= floorIndex);
}

/** Source: creditBands.ts bandRatePercent (verbatim). */
export function bandRatePercent(band: CreditBand, lendingRatePercent: number): number {
  const base = Number.isFinite(lendingRatePercent) ? lendingRatePercent : 0;
  return Math.max(0, base + band.ratePremiumPp);
}

// ── NPC household loan-book volume ───────────────────────────────────────
/** Source: lending.ts NPC_LOAN_BOOK_RATE_REFERENCE_PERCENT. */
export const NPC_LOAN_BOOK_RATE_REFERENCE_PERCENT = 4;
/** Source: lending.ts NPC_LOAN_BOOK_RATE_SENSITIVITY. */
export const NPC_LOAN_BOOK_RATE_SENSITIVITY = 0.08;
/** Source: lending.ts NPC_LOAN_BOOK_VOLUME_FACTOR_MIN. */
export const NPC_LOAN_BOOK_VOLUME_FACTOR_MIN = 0.2;
/** Source: lending.ts NPC_LOAN_BOOK_VOLUME_FACTOR_MAX. */
export const NPC_LOAN_BOOK_VOLUME_FACTOR_MAX = 1;

/** Source: lending.ts computeNpcLoanBook (verbatim volume half; defaultRate half unused — bankingTurn.ts uses the credit band's own defaultRatePercent instead, see bankingTurn.ts file doc). */
export function computeNpcLoanBookVolume(lendableDeposits: number, lendingRatePercent: number): number {
  const funding = Number.isFinite(lendableDeposits) && lendableDeposits > 0 ? lendableDeposits : 0;
  const rate = Number.isFinite(lendingRatePercent) ? lendingRatePercent : 0;
  const volumeFactor = clamp(
    1 - (rate - NPC_LOAN_BOOK_RATE_REFERENCE_PERCENT) * NPC_LOAN_BOOK_RATE_SENSITIVITY,
    NPC_LOAN_BOOK_VOLUME_FACTOR_MIN,
    NPC_LOAN_BOOK_VOLUME_FACTOR_MAX,
  );
  return funding * volumeFactor;
}

// ── Named loan servicing ─────────────────────────────────────────────────
/** Source: bankingTurn.ts ARREARS_DEFAULT_TURNS. */
export const ARREARS_DEFAULT_TURNS = 8;

// ── Solvency confidence ───────────────────────────────────────────────────
/** Source: confidence.ts CONFIDENCE_* weights (verbatim). */
export const CONFIDENCE_RESERVE_WEIGHT = 0.45;
export const CONFIDENCE_CAPITAL_WEIGHT = 0.25;
export const CONFIDENCE_ASSET_QUALITY_WEIGHT = 0.3;
export const CONFIDENCE_RESERVE_COVER_CAP = 1.5;
export const CONFIDENCE_CAPITAL_COVER_CAP = 1;
export const CONFIDENCE_ARREARS_PENALTY = 0.7;
export const CONFIDENCE_DEFAULTS_PENALTY = 0.3;
export const CONFIDENCE_PANIC_PENALTY_PER_TURN = 0.12;
export const CONFIDENCE_PANIC_TURNS_CAP = 4;
export const CONFIDENCE_BAND_GREEN_MIN = 0.7;
export const CONFIDENCE_BAND_AMBER_MIN = 0.4;

export interface ConfidenceInput {
  cashReserves: number;
  cashBackedDeposits: number;
  totalLoans: number;
  reserveRatioRequired: number;
  arrearsOutstanding: number;
  defaultsLastTurn: number;
  panicTurns: number;
}
export interface ConfidenceResult {
  confidence: number;
  band: ConfidenceBand;
}
export type ConfidenceBand = "green" | "amber" | "red";

/**
 * Source: confidence.ts computeConfidence, scope-cut form (no
 * forcedLiquidation/discountWindowStigma penalties — prop trading and the
 * discount window are out of scope, see types.ts file doc, so both terms are
 * always 0 here).
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const cash = Math.max(0, input.cashReserves);
  const deposits = Math.max(0, input.cashBackedDeposits);
  const loans = Math.max(0, input.totalLoans);
  const ratio = Math.max(0, input.reserveRatioRequired);
  const loanDenom = Math.max(1, loans);
  const arrears = Math.max(0, input.arrearsOutstanding);
  const defaults = Math.max(0, input.defaultsLastTurn);
  const panicTurns = Math.max(0, input.panicTurns);

  const reserveCover = Math.min(CONFIDENCE_RESERVE_COVER_CAP, cash / Math.max(1, ratio * deposits));
  const capitalCover = Math.min(CONFIDENCE_CAPITAL_COVER_CAP, cash / Math.max(1, loans));
  const assetQuality = clamp(
    1 -
      clamp(arrears / loanDenom, 0, 1) * CONFIDENCE_ARREARS_PENALTY -
      clamp(defaults / loanDenom, 0, 1) * CONFIDENCE_DEFAULTS_PENALTY,
    0,
    1,
  );

  const raw =
    CONFIDENCE_RESERVE_WEIGHT * Math.min(1, reserveCover) +
    CONFIDENCE_CAPITAL_WEIGHT * capitalCover +
    CONFIDENCE_ASSET_QUALITY_WEIGHT * assetQuality;

  const penalized = raw - CONFIDENCE_PANIC_PENALTY_PER_TURN * Math.min(panicTurns, CONFIDENCE_PANIC_TURNS_CAP);
  const confidence = clamp(penalized, 0, 1);
  const band: ConfidenceBand =
    confidence >= CONFIDENCE_BAND_GREEN_MIN ? "green" : confidence >= CONFIDENCE_BAND_AMBER_MIN ? "amber" : "red";
  return { confidence, band };
}

// ── Deposit flight / run failure / contagion ─────────────────────────────
/** Source: bankSolvencyTurn.ts FLIGHT_RATE_BY_BAND. */
export const FLIGHT_RATE_BY_BAND: Readonly<Record<"amber" | "red", number>> = { amber: 0.1, red: 0.3 };
/** Source: bankSolvencyTurn.ts RUN_FAILURE_COVER_FRACTION. */
export const RUN_FAILURE_COVER_FRACTION = 0.5;
/** Source: bankSolvencyTurn.ts CONTAGION_PANIC_TURNS. */
export const CONTAGION_PANIC_TURNS = 4;

// ── NPC bank seeding ──────────────────────────────────────────────────────
/**
 * Deviation from mainline (cited): mainline seeds NPC_BANKS_PER_COUNTRY = 2
 * NPP-run retail banks per eligible country (npcBanks.ts). AHDClient's W9
 * corporation founding seeds exactly ONE NPC corporation per (playable
 * country, sector type) pair (corporation/founding.ts file doc), so there is
 * only one "financial" sector corp per country to charter. Solo therefore
 * charters 1 bank per playable country, not 2 — a structural consequence of
 * the single-corp-per-sector model, not a balance choice.
 */
export const NPC_BANKS_PER_COUNTRY = 1;
