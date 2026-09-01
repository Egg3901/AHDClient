// Port of line-of-credit turn logic. Source citations per symbol.
// Solo engine keeps plain input interfaces with PORT-STUB markers.

// ── Input interfaces ────────────────────────────────────────────────────────
// PORT-STUB: mainline reads Db collections.
export interface CharacterInput {
  _id: string;
  name?: string;
  countryId?: string;
  currencyBalances?: {
    personal?: Record<string, number>;
    savings?: Record<string, number>;
    savingsHolder?: Record<string, string | null>;
  };
  lineOfCredit?: {
    balances?: Partial<Record<string, number>> | undefined;
    arrears?: Partial<Record<string, number>> | undefined;
    drawFrozen?: boolean | undefined;
    paymentMode?: Record<string, string> | undefined;
    accountsOpened?: number | undefined;
  };
}

export interface CorporationInput {
  _id: string;
  ceoId: string;
  countryId: string;
  creditCompositeSnapshot?: number | null;
}

export interface CentralBankInput {
  _id: string;
  primeRate?: number;
  reserveBalance?: number;
}

export interface LocLedgerEntry {
  characterId: string;
  currencyCode: string;
  type: "interest" | "auto_payment" | "freeze" | "unfreeze";
  amount: number;
  interestPortion?: number;
  principalPortion?: number;
  balanceAfter: number;
  arrearsAfter: number;
  turn: number;
  meta?: Record<string, unknown>;
}

export interface LineOfCreditResult {
  charactersProcessed: number;
  paymentsInternal: number;
  characterUpdates: Record<string, {
    lineOfCredit: CharacterInput["lineOfCredit"];
    personalDeduct: Record<string, number>;
  }>;
  centralBankUpdates: Record<string, { reserveBalance: number }>;
  ledgerEntries: LocLedgerEntry[];
  txLogEntries: {
    type: "loc_interest" | "loc_repay";
    turn: number;
    createdAt: number;
    subjectType: "character";
    subjectId: string;
    subjectName: string;
    amount: number;
    currencyCode: string;
    meta: Record<string, unknown>;
  }[];
}

export const DEFAULT_PRIME = 2.5;
// source: src/lib/lineOfCredit/locMath.ts LOC_IO_SURCHARGE_PERCENT_POINTS
export const LOC_IO_SURCHARGE_PERCENT_POINTS = 2.0;
// source: src/lib/lineOfCredit/locMath.ts LOC_PER_TURN_PAYMENT_RATE = 0.01625 / 4
export const LOC_PER_TURN_PAYMENT_RATE = 0.01625 / 4;
// source: src/lib/constants/turnTime.ts TURNS_PER_YEAR
const TURNS_PER_YEAR = 48;

// source: src/lib/constants/currencies.ts FOREX_ACTIVE_CURRENCIES (verbatim)
export const FOREX_ACTIVE_CURRENCIES = [
  "USD",
  "GBP",
  "JPY",
  "EUR",
  "IEP",
  "CNY",
  "BRL",
  "NGN",
  "SUR",
  "DDM",
  "FRF",
  "ITL",
  "ESP",
  "SEK",
  "TRL",
  "GRD",
  "ATS",
  "FIM",
] as const;

// source: src/lib/constants/currencies.ts FOREX_ACTIVE_COUNTRIES not needed here but referenced in savings; keep for completeness via re-export if needed

const CURRENCY_ANCHOR_COUNTRY: Record<string, string> = {
  USD: "US",
  GBP: "UK",
  JPY: "JP",
  CAD: "US",
  EUR: "DE",
  IEP: "IE",
  BRL: "BR",
  CNY: "CN",
  NGN: "NG",
  HUF: "HU",
  PLZ: "PL",
  ROL: "RO",
  YUD: "YU",
  BGL: "BG",
  CSK: "CS",
  SUR: "RU",
  FRF: "FR",
  ITL: "IT",
  ESP: "ES",
  SEK: "SE",
  TRL: "TR",
  GRD: "GR",
  ATS: "AT",
  FIM: "FI",
  DDM: "DD",
};

// source: src/lib/constants/currencies.ts getCountryIdForCurrency
export function getCountryIdForCurrency(currency: string): string {
  return CURRENCY_ANCHOR_COUNTRY[currency] ?? "US";
}

// source: src/lib/centralBank/helpers.ts getBankId
// Verbatim: COUNTRY_CONFIGS[cid]?.centralBank.sharedBankId ?? cid
// Solo hardcoded equivalents: DE→ECB, SCO/WAL→UK
export function getBankId(countryId: string): string {
  if (countryId === "DE") return "ECB";
  if (countryId === "SCO" || countryId === "WAL") return "UK";
  return countryId;
}

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  JP: "JPY",
  DE: "EUR",
  IE: "IEP",
  BR: "BRL",
  CN: "CNY",
  NG: "NGN",
  HU: "HUF",
  PL: "PLZ",
  RO: "ROL",
  YU: "YUD",
  BG: "BGL",
  BLR: "SUR",
  UKR: "SUR",
  CS: "CSK",
  BAL: "SUR",
  RU: "SUR",
  FR: "FRF",
  IT: "ITL",
  ES: "ESP",
  SE: "SEK",
  TR: "TRL",
  GR: "GRD",
  AT: "ATS",
  FI: "FIM",
  DD: "DDM",
  SCO: "GBP",
  WAL: "GBP",
};

// source: src/lib/currency/characterFunds.ts getHomeCurrency
export function getHomeCurrency(char: CharacterInput): string {
  return COUNTRY_CURRENCY_MAP[char.countryId ?? "US"] ?? "USD";
}

// source: src/lib/currency/characterFunds.ts getPersonalBalance
export function getPersonalBalance(char: CharacterInput, currency: string, forexEnabled: boolean): number {
  if (!forexEnabled) return 0;
  if (char.currencyBalances?.personal && currency in char.currencyBalances.personal) {
    return char.currencyBalances.personal[currency] ?? 0;
  }
  // Pre-forex fallback not used in forex path but keep faithful to mainline shape where forexEnabled false returns cashOnHand.
  // PORT-STUB: cashOnHand not modeled in solo CharacterInput; return 0 when no personal map.
  return 0;
}

// source: src/lib/currency/characterFunds.ts getSavingsBalance
export function getSavingsBalance(char: CharacterInput, currency: string, forexEnabled: boolean): number {
  if (!forexEnabled) return 0;
  return char.currencyBalances?.savings?.[currency] ?? 0;
}

// source: src/lib/currency/savingsInterest.ts roundSavingsAmount
export function roundSavingsAmount(amount: number, currency: string): number {
  if (currency === "JPY") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

// ── Credit math: verbatim from src/lib/lineOfCredit/creditMath.ts ──────────
// source: src/lib/lineOfCredit/creditMath.ts (all functions verbatim)
const TURNS_PER_YEAR_CREDIT = 48;

function cmClamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** source: src/lib/lineOfCredit/creditMath.ts spreadPercentPointsFromComposite */
export function spreadPercentPointsFromComposite(composite: number): number {
  const c = Math.max(0, Math.min(100, composite));
  return 5 - (c / 100) * 6;
}

/** source: src/lib/lineOfCredit/creditMath.ts incomeScoreFromPerTurnCurrency */
export function incomeScoreFromPerTurnCurrency(perTurnNet: number): number {
  if (perTurnNet <= 0) return 0;
  const annual = perTurnNet * TURNS_PER_YEAR_CREDIT;
  return cmClamp(100 * (1 - Math.exp(-annual / 2_500_000)), 0, 100);
}

/** source: src/lib/lineOfCredit/creditMath.ts netWorthScoreFromInternal */
export function netWorthScoreFromInternal(netWorthInternal: number): number {
  if (netWorthInternal <= 0) return 0;
  return cmClamp(100 * (1 - Math.exp(-netWorthInternal / 4_000_000)), 0, 100);
}

/** source: src/lib/lineOfCredit/creditMath.ts userCreditComposite */
export function userCreditComposite(params: {
  corpComposite?: number | null;
  incomeScore: number;
  netWorthScore: number;
}): number {
  const { corpComposite, incomeScore, netWorthScore } = params;
  if (corpComposite != null && Number.isFinite(corpComposite) && corpComposite >= 0) {
    return cmClamp(0.75 * corpComposite + 0.25 * incomeScore, 0, 100);
  }
  return cmClamp(0.5 * incomeScore + 0.5 * netWorthScore, 0, 100);
}

/** source: src/lib/lineOfCredit/creditMath.ts applyDebtLeveragePenalty */
export function applyDebtLeveragePenalty(composite: number, debtToAssetsRatio: number): number {
  if (!Number.isFinite(debtToAssetsRatio) || debtToAssetsRatio <= 0) return composite;
  const penalty = Math.min(30, debtToAssetsRatio * 38);
  return cmClamp(composite - penalty, 0, 100);
}

/** source: src/lib/lineOfCredit/creditMath.ts applyPrimeEnvironmentToComposite */
export function applyPrimeEnvironmentToComposite(
  composite: number,
  primePercent: number,
  netWorthScore: number,
  baselinePrime = 2.5,
): number {
  const excess = Math.max(0, primePercent - baselinePrime);
  const rawStress = Math.min(22, excess * 5);
  const shield = netWorthScore / 100;
  const eased = rawStress * (1 - 0.65 * shield);
  return cmClamp(composite - eased, 0, 100);
}

/** source: src/lib/lineOfCredit/creditMath.ts computeLocBorrowerComposite */
export function computeLocBorrowerComposite(params: {
  corpComposite: number | null;
  incomeScore: number;
  netWorthScore: number;
  debtToAssetsRatio: number;
  homePrimePercent: number;
}): number {
  const base = userCreditComposite({
    corpComposite: params.corpComposite,
    incomeScore: params.incomeScore,
    netWorthScore: params.netWorthScore,
  });
  const afterLeverage = applyDebtLeveragePenalty(base, params.debtToAssetsRatio);
  return applyPrimeEnvironmentToComposite(afterLeverage, params.homePrimePercent, params.netWorthScore);
}

// ── locMath: verbatim from src/lib/lineOfCredit/locMath.ts ─────────────────
// source: src/lib/lineOfCredit/locMath.ts computeLocInterestForTurn
export function computeLocInterestForTurn(
  principal: number,
  arrears: number,
  primeRate: number,
  spreadPercentPoints: number,
  currency: string
): number {
  const obligation = principal + arrears;
  if (obligation <= 0) return 0;
  const annual = primeRate + spreadPercentPoints;
  const raw = (obligation * (annual / 100)) / TURNS_PER_YEAR;
  return roundSavingsAmount(raw, currency);
}

// source: src/lib/lineOfCredit/locMath.ts computeLocScheduledPaymentFace
export function computeLocScheduledPaymentFace(mode: string, principal: number, arrears: number): number {
  if (mode === "io") {
    return Math.max(0, arrears);
  }
  const obligation = Math.max(0, principal) + Math.max(0, arrears);
  return obligation * LOC_PER_TURN_PAYMENT_RATE;
}

// source: src/lib/lineOfCredit/locMath.ts toInternalUnits
// Converts face amount to internal units: internal = face / rate (rate = local per 1 internal)
export function toInternalUnits(faceAmount: number, rate: number): number {
  if (rate <= 0 || !Number.isFinite(faceAmount)) return 0;
  return faceAmount / rate;
}

// source: src/lib/lineOfCredit/locMath.ts fromInternalUnits
export function fromInternalUnits(internalAmount: number, rate: number): number {
  if (rate <= 0 || !Number.isFinite(internalAmount)) return 0;
  return internalAmount * rate;
}

// source: src/lib/lineOfCredit/netWorth.ts computePlayerGrossNetLocInternal
// PORT-STUB: mainline does DB reads for stocks/bonds via computePlayerNetWorthInternal
// and sumObligationInternal. Solo lacks those collections, so use simplified
// personal+savings only. Blocker: stock/bond ownership + market quotes.
export function computePlayerGrossNetLocInternal(
  char: CharacterInput,
  rates: Record<string, number>
): { grossInternal: number; locDebtInternal: number; netInternal: number } {
  let grossInternal = 0;
  let locDebtInternal = 0;
  for (const c of FOREX_ACTIVE_CURRENCIES) {
    const personal = getPersonalBalance(char, c, true);
    const savings = getSavingsBalance(char, c, true);
    const rate = rates[c] ?? 1;
    if (rate > 0) {
      grossInternal += toInternalUnits(personal + savings, rate);
    }
    const locBal = char.lineOfCredit?.balances?.[c] ?? 0;
    const locArr = char.lineOfCredit?.arrears?.[c] ?? 0;
    if (rate > 0) {
      locDebtInternal += toInternalUnits(locBal + locArr, rate);
    }
  }
  return { grossInternal, locDebtInternal, netInternal: Math.max(0, grossInternal - locDebtInternal) };
}

// source: src/lib/turn/lineOfCreditTurn.ts resolvePrimeForCurrency
export function resolvePrimeForCurrency(
  primeByBankId: ReadonlyMap<string, number>,
  currency: string
): number {
  const bankId = getBankId(getCountryIdForCurrency(currency));
  return primeByBankId.get(bankId) ?? DEFAULT_PRIME;
}

function hasLocActivity(loc: NonNullable<CharacterInput["lineOfCredit"]>): boolean {
  const b = loc.balances ?? {};
  const a = loc.arrears ?? {};
  for (const c of FOREX_ACTIVE_CURRENCIES) {
    if ((b[c] ?? 0) > 0 || (a[c] ?? 0) > 0) return true;
  }
  return loc.drawFrozen === true;
}

function mergeIncFragments(fragments: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fragments) {
    for (const [k, v] of Object.entries(f)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

// source: src/lib/turn/lineOfCreditTurn.ts processLineOfCreditTurn
// Adapts Db-based signature to plain inputs. PORT-STUB markers where Db reads are replaced.
// Note: mainline signature includes an unused _currencyIncomeFaceByCharacterId map (caller compat);
// solo drops it. Threshold/emitTxBulk PORT-STUB: thresholds only flag, never filter, so solo emits all.
export function processLineOfCreditTurn(
  turn: number,
  characters: CharacterInput[],
  corporations: CorporationInput[],
  centralBanks: CentralBankInput[],
  currencyIncomeInternalByCharacterId: Map<string, number>,
  forexEnabled: boolean,
  lineOfCreditEnabled: boolean,
  rates: Record<string, number>
): LineOfCreditResult {
  const result: LineOfCreditResult = {
    charactersProcessed: 0,
    paymentsInternal: 0,
    characterUpdates: {},
    centralBankUpdates: {},
    ledgerEntries: [],
    txLogEntries: [],
  };

  if (!forexEnabled || !lineOfCreditEnabled) {
    return result;
  }

  // PORT-STUB: mainline loads rates via loadExchangeRatesMap(db); solo takes rates param.
  // PORT-STUB: mainline loads banks prime via Db; solo takes centralBanks param.
  const primeByCountryId = new Map<string, number>();
  for (const b of centralBanks) {
    primeByCountryId.set(b._id, b.primeRate ?? DEFAULT_PRIME);
  }

  const resolvePrime = (currency: string): number => {
    return resolvePrimeForCurrency(primeByCountryId, currency);
  };

  let charactersProcessed = 0;
  let paymentsInternal = 0;
  let totalInterestAccruedInternal = 0;
  let newlyFrozen = 0;
  let newlyUnfrozen = 0;
  let distressedAfterTurn = 0;
  const bankReserveInc = new Map<string, number>();
  const txLocEntries: LineOfCreditResult["txLogEntries"] = [];

  for (const char of characters) {
    const loc = char.lineOfCredit;
    if (!loc || !hasLocActivity(loc)) continue;

    const incomeInternal = currencyIncomeInternalByCharacterId.get(char._id) ?? 0;
    const home = getHomeCurrency(char);
    const rateHome = rates[home] ?? 1;
    const incomeHomeFace = fromInternalUnits(incomeInternal, rateHome);
    const incomeScore = incomeScoreFromPerTurnCurrency(incomeHomeFace);

    const { grossInternal, locDebtInternal: locDebtForScore, netInternal } = computePlayerGrossNetLocInternal(char, rates);
    const debtToAssetsRatio = grossInternal > 0 ? locDebtForScore / grossInternal : locDebtForScore > 0 ? 1 : 0;
    const nwScore = netWorthScoreFromInternal(netInternal);

    // PORT-STUB: mainline finds corp via db corporations.findOne({ceoId, countryId}); solo scans array.
    const corp = corporations.find(c => c.ceoId === char._id && c.countryId === char.countryId);
    const primeHome = resolvePrime(home);

    const composite = computeLocBorrowerComposite({
      corpComposite: corp?.creditCompositeSnapshot ?? null,
      incomeScore,
      netWorthScore: nwScore,
      debtToAssetsRatio,
      homePrimePercent: primeHome,
    });
    const spread = spreadPercentPointsFromComposite(composite);

    const balances: Partial<Record<string, number>> = { ...(loc.balances ?? {}) };
    const arrears: Partial<Record<string, number>> = { ...(loc.arrears ?? {}) };
    let characterInterestAccruedInternal = 0;

    // 1. Accrue interest
    const interestAccruals: Partial<Record<string, number>> = {};
    const modeByCurrency: Partial<Record<string, string>> = {};
    const ioSurchargeByCurrency: Partial<Record<string, number>> = {};
    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const P = balances[c] ?? 0;
      const A = arrears[c] ?? 0;
      if (P <= 0 && A <= 0) continue;
      const mode = loc.paymentMode?.[c] ?? "pi";
      modeByCurrency[c] = mode;
      const ioSurcharge = mode === "io" ? LOC_IO_SURCHARGE_PERCENT_POINTS : 0;
      if (ioSurcharge > 0) ioSurchargeByCurrency[c] = ioSurcharge;
      const prime = resolvePrime(c);
      const int = computeLocInterestForTurn(P, A, prime, spread + ioSurcharge, c);
      if (int <= 0) continue;
      interestAccruals[c] = int;
      arrears[c] = roundSavingsAmount((arrears[c] ?? 0) + int, c);
      const rate = rates[c];
      if (rate && rate > 0) characterInterestAccruedInternal += toInternalUnits(int, rate);
    }

    // 2. Scheduled auto-payment
    const payments: Partial<Record<string, number>> = {};
    const walletPayments: Partial<Record<string, number>> = {};
    const interestPortions: Partial<Record<string, number>> = {};
    const principalPortions: Partial<Record<string, number>> = {};
    const crossConverted: Partial<Record<string, Partial<Record<string, number>>>> = {};
    let appliedInternal = 0;
    let shortfallAny = false;
    let scheduledInternalTotal = 0;

    const initialPersonalBalance: Partial<Record<string, number>> = {};
    const availableBalance: Partial<Record<string, number>> = {};
    for (const curr of FOREX_ACTIVE_CURRENCIES) {
      const personal = Math.max(0, getPersonalBalance(char, curr, forexEnabled));
      const savings = Math.max(0, getSavingsBalance(char, curr, forexEnabled));
      initialPersonalBalance[curr] = personal;
      availableBalance[curr] = personal + savings;
    }

    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const P = balances[c] ?? 0;
      const A = arrears[c] ?? 0;
      const obligation = P + A;
      if (obligation <= 0) continue;
      const mode = modeByCurrency[c] ?? loc.paymentMode?.[c] ?? "pi";
      const scheduled = roundSavingsAmount(computeLocScheduledPaymentFace(mode, P, A), c);
      if (scheduled <= 0) continue;

      const cRate = rates[c];
      if (cRate && cRate > 0) scheduledInternalTotal += toInternalUnits(scheduled, cRate);

      const walletC = availableBalance[c] ?? 0;
      let pay = Math.min(scheduled, walletC);
      const walletPay = pay;

      if (pay < scheduled - 1e-6) {
        const loanRate = rates[c];
        if (loanRate && loanRate > 0) {
          let remainingShortfall = roundSavingsAmount(scheduled - pay, c);
          const candidates = FOREX_ACTIVE_CURRENCIES.filter(
            (other) => other !== c && (availableBalance[other] ?? 0) > 1e-9
          )
            .map((other) => ({ currency: other, rate: rates[other] ?? 0 }))
            .filter((x) => x.rate > 0)
            .sort(
              (a, b) =>
                (availableBalance[b.currency] ?? 0) * b.rate -
                (availableBalance[a.currency] ?? 0) * a.rate
            );

          const convertedSources: Partial<Record<string, number>> = {};
          for (const { currency: other, rate: otherRate } of candidates) {
            if (remainingShortfall <= 1e-9) break;
            const otherAvailable = availableBalance[other] ?? 0;
            const otherNeeded = roundSavingsAmount(
              (remainingShortfall * loanRate) / otherRate,
              other
            );
            const otherUsed = Math.min(otherNeeded, otherAvailable);
            if (otherUsed <= 0) continue;
            const loanGained = roundSavingsAmount((otherUsed * otherRate) / loanRate, c);
            if (loanGained <= 0) continue;
            convertedSources[other] = (convertedSources[other] ?? 0) + otherUsed;
            availableBalance[other] = otherAvailable - otherUsed;
            pay = Math.min(scheduled, roundSavingsAmount(pay + loanGained, c));
            remainingShortfall = roundSavingsAmount(Math.max(0, scheduled - pay), c);
          }
          if (Object.keys(convertedSources).length > 0) crossConverted[c] = convertedSources;
        }
      }

      if (pay < scheduled - 1e-6) shortfallAny = true;
      availableBalance[c] = Math.max(0, walletC - walletPay);
      if (pay <= 0) continue;

      const interestPart = roundSavingsAmount(Math.min(pay, A), c);
      const principalPart = roundSavingsAmount(Math.max(0, pay - interestPart), c);
      arrears[c] = roundSavingsAmount(Math.max(0, A - interestPart), c);
      balances[c] = roundSavingsAmount(Math.max(0, (balances[c] ?? 0) - principalPart), c);
      payments[c] = roundSavingsAmount(interestPart + principalPart, c);
      walletPayments[c] = walletPay;
      interestPortions[c] = interestPart;
      principalPortions[c] = principalPart;
      const rate = rates[c];
      if (rate && rate > 0) {
        appliedInternal += toInternalUnits(payments[c] ?? 0, rate);
      }
    }

    const incomeCoversScheduled =
      loc.drawFrozen &&
      scheduledInternalTotal > 0 &&
      incomeInternal >= scheduledInternalTotal - 1e-6;
    const distress = shortfallAny && !incomeCoversScheduled;
    const drawFrozen = distress;

    const newP: Partial<Record<string, number>> = {};
    const newA: Partial<Record<string, number>> = {};
    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const p = balances[c] ?? 0;
      const a = arrears[c] ?? 0;
      if (p > 0) newP[c] = p;
      if (a > 0) newA[c] = a;
    }

    // 3. Deduct payments
    const totalDeductByCurrency: Partial<Record<string, number>> = {};
    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const direct = walletPayments[c] ?? 0;
      if (direct > 0) totalDeductByCurrency[c] = (totalDeductByCurrency[c] ?? 0) + direct;
    }
    for (const sources of Object.values(crossConverted)) {
      for (const [sourceC, amount] of Object.entries(sources ?? {})) {
        if ((amount ?? 0) > 0)
          totalDeductByCurrency[sourceC] = (totalDeductByCurrency[sourceC] ?? 0) + (amount as number);
      }
    }
    const deductIncs: Record<string, number>[] = [];
    for (const [c, totalDeduct] of Object.entries(totalDeductByCurrency) as [string, number][]) {
      const fromPersonal = Math.min(totalDeduct, initialPersonalBalance[c] ?? 0);
      const fromSavings = roundSavingsAmount(Math.max(0, totalDeduct - fromPersonal), c);
      if (fromPersonal > 0)
        deductIncs.push({ [`currencyBalances.personal.${c}`]: -fromPersonal });
      if (fromSavings > 0) deductIncs.push({ [`currencyBalances.savings.${c}`]: -fromSavings });
    }
    const personalDeduct = mergeIncFragments(deductIncs);

    const newLoc = {
      ...loc,
      balances: newP,
      arrears: newA,
      drawFrozen,
      ...(loc.accountsOpened !== undefined ? { accountsOpened: loc.accountsOpened } : {}),
    };

    result.characterUpdates[char._id] = {
      lineOfCredit: newLoc,
      personalDeduct,
    };

    totalInterestAccruedInternal += characterInterestAccruedInternal;
    if (distress) distressedAfterTurn += 1;
    if (distress && !loc.drawFrozen) newlyFrozen += 1;
    if (!distress && loc.drawFrozen) newlyUnfrozen += 1;

    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const interest = interestPortions[c] ?? 0;
      if (interest <= 0) continue;
      const cid = getCountryIdForCurrency(c);
      bankReserveInc.set(cid, (bankReserveInc.get(cid) ?? 0) + interest);
    }

    // 4. Ledger entries (PORT-STUB: mainline uses insertLocLedgerEntry to db; solo pushes to result)
    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const add = interestAccruals[c];
      if (add === undefined || add <= 0) continue;
      result.ledgerEntries.push({
        characterId: char._id,
        currencyCode: c,
        type: "interest",
        amount: add,
        balanceAfter: newP[c] ?? 0,
        arrearsAfter: newA[c] ?? 0,
        turn,
        meta: {
          primePercent: resolvePrime(c),
          spreadPercentPoints: spread,
          distress,
          paymentMode: modeByCurrency[c],
          ...(ioSurchargeByCurrency[c] ? { ioSurchargePoints: ioSurchargeByCurrency[c] } : {}),
        },
      });
    }

    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const pay = payments[c] ?? 0;
      if (pay <= 0) continue;
      result.ledgerEntries.push({
        characterId: char._id,
        currencyCode: c,
        type: "auto_payment",
        amount: pay,
        interestPortion: interestPortions[c] ?? 0,
        principalPortion: principalPortions[c] ?? 0,
        balanceAfter: newP[c] ?? 0,
        arrearsAfter: newA[c] ?? 0,
        turn,
        meta: {
          incomeInternalApplied: appliedInternal,
          distress,
          ...(crossConverted[c] ? { crossConverted: crossConverted[c] } : {}),
          paymentMode: modeByCurrency[c],
          ...(ioSurchargeByCurrency[c] ? { ioSurchargePoints: ioSurchargeByCurrency[c] } : {}),
        },
      });
    }

    if (distress && !loc.drawFrozen) {
      result.ledgerEntries.push({
        characterId: char._id,
        currencyCode: home,
        type: "freeze",
        amount: 0,
        balanceAfter: newP[home] ?? 0,
        arrearsAfter: newA[home] ?? 0,
        turn,
        meta: { distress: true },
      });
    } else if (!distress && loc.drawFrozen) {
      result.ledgerEntries.push({
        characterId: char._id,
        currencyCode: home,
        type: "unfreeze",
        amount: 0,
        balanceAfter: newP[home] ?? 0,
        arrearsAfter: newA[home] ?? 0,
        turn,
      });
    }

    // PORT-STUB: thresholds only flag, not filter; solo emits all loc tx entries.
    for (const c of FOREX_ACTIVE_CURRENCIES) {
      const interest = interestAccruals[c];
      if (interest && interest > 0) {
        txLocEntries.push({
          type: "loc_interest",
          turn,
          createdAt: 0,
          subjectType: "character",
          subjectId: char._id,
          subjectName: char.name ?? "",
          amount: -interest,
          currencyCode: c,
          meta: { primePercent: resolvePrime(c), spreadPercentPoints: spread, distress },
        });
      }
      const pay = payments[c] ?? 0;
      if (pay > 0) {
        txLocEntries.push({
          type: "loc_repay",
          turn,
          createdAt: 0,
          subjectType: "character",
          subjectId: char._id,
          subjectName: char.name ?? "",
          amount: -pay,
          currencyCode: c,
          meta: {
            interestPortion: interestPortions[c] ?? 0,
            principalPortion: principalPortions[c] ?? 0,
            distress,
          },
        });
      }
    }

    charactersProcessed += 1;
    paymentsInternal += appliedInternal;
    void totalInterestAccruedInternal;
    void newlyFrozen;
    void newlyUnfrozen;
    void distressedAfterTurn;
  }

  for (const [cid, inc] of bankReserveInc) {
    if (inc > 0) {
      const bankId = getBankId(cid);
      result.centralBankUpdates[bankId] = {
        reserveBalance: (result.centralBankUpdates[bankId]?.reserveBalance ?? 0) + inc,
      };
    }
  }

  result.charactersProcessed = charactersProcessed;
  result.paymentsInternal = paymentsInternal;
  result.txLogEntries = txLocEntries;
  return result;
}
