// Port of savings interest turn logic. Source citations per symbol below.
// Solo engine keeps plain input interfaces; where mainline reads a system solo
// lacks, the stub is marked PORT-STUB with the blocker.
//
// This whole module is a pure formula library with no live WorldState
// wiring (see the multi-currency CharacterInput/CentralBankInput types
// below — Rotunda's real Politician/PlayerCharacter/CentralBank types carry
// none of those fields yet). Below, `holder != null && holder !== "centralBank"`
// (bank-held savings) is intentionally skipped with the comment "paid by
// bankingTurn" — W12 (packages/engine/src/banking/bankingTurn.ts) is that
// resolution, but for REAL WorldState (single-currency player.savings/
// savingsHolder, not this module's hypothetical multi-currency map). This
// module itself stays unwired pending a future wave's multi-currency/
// per-politician-wealth retrofit.

// ── Input interfaces (PORT-STUB: mainline reads Db collections) ──────────────
// CentralBank doc: mainline src/lib/db/types/centralBank.ts
export interface CentralBankInput {
  _id: string;
  primeRate?: number;
  nationalSavingsBalance?: number;
  inflationHistory?: { rate: number }[];
  externalBroadMoney?: number;
  netMoneyCreatedLifetime?: number;
  savingsInterestPaidLifetime?: number;
  reserveBalance?: number;
}

// Character doc: mainline src/lib/db/types/character.ts + src/lib/db/types/npp.ts for NPP variant
export interface CharacterInput {
  _id: string;
  name?: string;
  countryId?: string;
  savingsOnHand?: number;
  currencyBalances?: {
    savings?: Record<string, number>;
    savingsHolder?: Record<string, string | null>;
    pendingSavingsInterest?: Record<string, number>;
    interestEarned?: Record<string, number>;
  };
}

// NPP doc subset for NPP savings path (PORT-STUB: separate collection npps)
export interface NppInput {
  _id: string;
  currencyBalances?: {
    savings?: Record<string, number>;
    pendingSavingsInterest?: Record<string, number>;
    interestEarned?: Record<string, number>;
  };
}

export interface SavingsLedgerEntry {
  characterId: string;
  countryId: string;
  currencyCode: string;
  type: "interest";
  amount: number;
  balanceAfter: number;
  turn: number;
  createdAt: number;
}

export interface SavingsInterestResult {
  charactersProcessed: number;
  totalInterest: number;
  characterUpdates: Record<string, Record<string, number>>;
  centralBankUpdates: Record<string, Partial<CentralBankInput>>;
  ledgerEntries: SavingsLedgerEntry[];
  txLogEntries: {
    type: "savings_interest";
    turn: number;
    createdAt: number;
    subjectType: "character";
    subjectId: string;
    subjectName: string;
    amount: number;
    currencyCode: string;
    balanceAfter: number;
  }[];
  // NPP accrual result when gated on (PORT-STUB: mainline writes npps collection directly)
  nppResult?: { nppsAccrued: number; totalInterest: number };
}

// ── Constants ────────────────────────────────────────────────────────────────
// source: src/lib/constants/turnTime.ts
const TURNS_PER_YEAR_SAVINGS = 48; // source: src/lib/constants/turnTime.ts TURNS_PER_YEAR
// source: src/lib/currency/savingsInterest.ts SAVINGS_CREDIT_INTERVAL_TURNS = TURNS_PER_YEAR / 4
export const SAVINGS_CREDIT_INTERVAL_TURNS = 12;
// source: src/lib/currency/savingsInterest.ts SAVINGS_POOL_SHARE_CAP
export const SAVINGS_POOL_SHARE_CAP = 0.25;
// source: src/lib/currency/savingsInterest.ts SAVINGS_REAL_RATE_FLOOR_PERCENT
export const SAVINGS_REAL_RATE_FLOOR_PERCENT = 0.5;
export const DEFAULT_PRIME = 2.5;

// ── Pure helpers ────────────────────────────────────────────────────────────
// source: src/lib/currency/savingsInterest.ts interestEligibleBalance
export function interestEligibleBalance(balance: number, poolTotal: number): number {
  if (!(poolTotal > 0)) return balance;
  return Math.min(balance, SAVINGS_POOL_SHARE_CAP * poolTotal);
}

// source: src/lib/currency/savingsInterest.ts turnsUntilSavingsCredit
export function turnsUntilSavingsCredit(currentTurn: number): number {
  return SAVINGS_CREDIT_INTERVAL_TURNS - (currentTurn % SAVINGS_CREDIT_INTERVAL_TURNS);
}

// source: src/lib/currency/savingsInterest.ts savingsApyPercent
export function savingsApyPercent(primeRatePercent: number, inflationPercent: number): number {
  const realRatePercent = Math.max(
    SAVINGS_REAL_RATE_FLOOR_PERCENT,
    primeRatePercent - inflationPercent,
  );
  return realRatePercent / 2;
}

// source: src/lib/currency/savingsInterest.ts computeSavingsInterestForTurn
export function computeSavingsInterestForTurn(
  balance: number,
  primeRatePercent: number,
  currencyCode: string,
  inflationPercent = 0,
): number {
  if (balance <= 0 || primeRatePercent <= 0) return 0;
  const apyPercent = savingsApyPercent(primeRatePercent, inflationPercent);
  const raw = (balance * (apyPercent / 100)) / TURNS_PER_YEAR_SAVINGS;
  return roundSavingsAmount(raw, currencyCode);
}

// source: src/lib/currency/savingsInterest.ts estimateSavingsAccrualFromApy
export function estimateSavingsAccrualFromApy(
  balance: number,
  savingsApyPercentValue: number,
  currencyCode: string,
): number {
  if (savingsApyPercentValue <= 0) return 0;
  return computeSavingsInterestForTurn(balance, savingsApyPercentValue * 2, currencyCode);
}

// source: src/lib/currency/savingsInterest.ts roundSavingsAmount
// JPY rounds to whole yen, others to 2 decimals.
export function roundSavingsAmount(amount: number, currency: string): number {
  if (currency === "JPY") {
    return Math.round(amount);
  }
  return Math.round(amount * 100) / 100;
}

// source: src/lib/centralBank/helpers.ts getBankId
// Mainline: return COUNTRY_CONFIGS[countryId]?.centralBank.sharedBankId ?? countryId
// Solo has no COUNTRY_CONFIGS table, so hardcode the only non-identity mappings that
// exist in mainline: DE shares ECB, SCO/WAL share UK (sterlingized). IE's Central
// Bank of Ireland is sovereign (IEP) and maps to itself, even though EU eurozone
// display uses gameState.eurozoneEnabled. Era note: ECB sharedBankId is present in
// mainline even for presets that predate the ECB's real founding (1953-default,
// 1979-default); the era gate controls display and policy union, not bank
// identity, so solo keeps DE→ECB in all eras.
export function getBankId(countryId: string): string {
  if (countryId === "DE") return "ECB";
  if (countryId === "SCO" || countryId === "WAL") return "UK";
  return countryId;
}

// source: src/lib/constants/currencies.ts FOREX_ACTIVE_COUNTRIES
// Verbatim list. Mainline comment: NG is forex-active even while coming-soon so
// bond holders are not trapped; SU/FR/IT/ES/SE/TR join for 1979 preset but stay
// active across eras for the same invariant. NPP-bloc (PL/HU/…) NOT active.
// No era filter here: even 1953 worlds use this full set.
export const FOREX_ACTIVE_COUNTRIES = [
  "US",
  "UK",
  "JP",
  "DE",
  "IE",
  "CN",
  "BR",
  "NG",
  "RU",
  "DD",
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "GR",
  "AT",
  "FI",
] as const;

// source: src/lib/constants/currencies.ts FOREX_ACTIVE_CURRENCIES
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

// source: src/lib/constants/currencies.ts CURRENCY_ANCHOR_COUNTRY + getCountryIdForCurrency
// Authoritative explicit map, not derived from COUNTRY_CURRENCY_MAP iteration order.
// EUR anchor is DE, IEP is IE, SUR anchor is RU, CAD fallback to US.
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

// source: src/lib/constants/currencies.ts COUNTRY_CURRENCY_MAP + src/lib/currency/characterFunds.ts getHomeCurrency
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

// ── NPP savings path ────────────────────────────────────────────────────────
// source: src/lib/turn/nppSavingsInterest.ts processNppSavingsInterest
// Solo adaptation: takes plain arrays instead of Db, returns updates rather than bulkWrite.
// PORT-STUB: mainline operates on npps collection with bulkWrite.
export function processNppSavingsInterest(
  turn: number,
  npps: NppInput[],
  resolvePrime: (currency: string) => number,
  resolveInflation: (currency: string) => number = () => 0,
  resolvePoolTotal: (currency: string) => number = () => 0,
): { nppsAccrued: number; totalInterest: number; nppUpdates: Record<string, Record<string, number>> } {
  const isQuarterlyCredit = turn > 0 && turn % SAVINGS_CREDIT_INTERVAL_TURNS === 0;
  const accrualOps: Record<string, Record<string, number>> = {};
  let nppsAccrued = 0;

  for (const npp of npps) {
    const savings = npp.currencyBalances?.savings ?? {};
    const perNppInc: Record<string, number> = {};
    for (const [code, bal] of Object.entries(savings)) {
      const oldBalance = typeof bal === "number" ? bal : 0;
      if (oldBalance <= 0) continue;
      const prime = resolvePrime(code);
      const eligible = interestEligibleBalance(oldBalance, resolvePoolTotal(code));
      const interest = computeSavingsInterestForTurn(eligible, prime, code, resolveInflation(code));
      if (interest <= 0) continue;
      perNppInc[`currencyBalances.pendingSavingsInterest.${code}`] = interest;
    }
    if (Object.keys(perNppInc).length > 0) {
      accrualOps[npp._id] = perNppInc;
      nppsAccrued += 1;
    }
  }

  let totalInterest = 0;
  if (isQuarterlyCredit) {
    for (const npp of npps) {
      const pending = npp.currencyBalances?.pendingSavingsInterest ?? {};
      for (const [, pendingAmt] of Object.entries(pending)) {
        const amount = typeof pendingAmt === "number" ? pendingAmt : 0;
        if (amount <= 0) continue;
        totalInterest += amount;
      }
    }
    // Build credit ops: flush pending → savings + interestEarned, zero pending
    for (const npp of npps) {
      const pending = npp.currencyBalances?.pendingSavingsInterest ?? {};
      const perNppInc: Record<string, number> = {};
      const perNppSet: Record<string, number> = {};
      for (const [code, pendingAmt] of Object.entries(pending)) {
        const amount = typeof pendingAmt === "number" ? pendingAmt : 0;
        if (amount <= 0) continue;
        perNppInc[`currencyBalances.savings.${code}`] = amount;
        perNppInc[`currencyBalances.interestEarned.${code}`] = amount;
        perNppSet[`currencyBalances.pendingSavingsInterest.${code}`] = 0;
      }
      if (Object.keys(perNppInc).length > 0) {
        const existing = accrualOps[npp._id] ?? {};
        accrualOps[npp._id] = { ...existing, ...perNppInc, ...perNppSet };
      }
    }
  }

  return { nppsAccrued, totalInterest, nppUpdates: accrualOps };
}

// source: src/lib/nppAutonomy/featureFlag.ts nppAutonomyLevelAtLeast
// PORT-STUB: mainline reads gameState.nppAutonomyLevel from Db via getNppAutonomyLevel.
// Solo uses plain string input.
const NPP_AUTONOMY_LEVEL_RANK: Record<string, number> = {
  off: 0,
  v0: 1,
  v1: 2,
  v2: 3,
  v3: 4,
  v4: 5,
};
export function nppAutonomyLevelAtLeast(level: string, min: string): boolean {
  return (NPP_AUTONOMY_LEVEL_RANK[level] ?? 0) >= (NPP_AUTONOMY_LEVEL_RANK[min] ?? 0);
}

export function processSavingsInterestTurn(
  turn: number,
  characters: CharacterInput[],
  centralBanks: CentralBankInput[],
  forexEnabled: boolean,
  nppAutonomyLevel: string,
  // PORT-STUB: optional NPP array for solo. Mainline reads npps collection internally.
  npps: NppInput[] = [],
): SavingsInterestResult {
  const result: SavingsInterestResult = {
    charactersProcessed: 0,
    totalInterest: 0,
    characterUpdates: {},
    centralBankUpdates: {},
    ledgerEntries: [],
    txLogEntries: [],
  };

  const primeByCountryId = new Map<string, number>();
  const inflationByCountryId = new Map<string, number>();
  const poolTotalByCountryId = new Map<string, number>();
  for (const b of centralBanks) {
    const id = b._id;
    primeByCountryId.set(id, b.primeRate ?? DEFAULT_PRIME);
    poolTotalByCountryId.set(id, b.nationalSavingsBalance ?? 0);
    inflationByCountryId.set(id, b.inflationHistory?.at(-1)?.rate ?? 0);
  }

  // source: src/lib/turn/savingsInterestTurn.ts resolve* closures
  // Maps keyed by bank _id, resolve through getBankId (ECB anchor).
  const resolvePrime = (currency: string): number => {
    const bankId = getBankId(getCountryIdForCurrency(currency));
    return primeByCountryId.get(bankId) ?? DEFAULT_PRIME;
  };

  const resolvePoolTotal = (currency: string): number => {
    const bankId = getBankId(getCountryIdForCurrency(currency));
    return poolTotalByCountryId.get(bankId) ?? 0;
  };

  const resolveInflation = (currency: string): number => {
    const bankId = getBankId(getCountryIdForCurrency(currency));
    return inflationByCountryId.get(bankId) ?? 0;
  };

  if (forexEnabled) {
    const isQuarterlyCredit = turn > 0 && turn % SAVINGS_CREDIT_INTERVAL_TURNS === 0;

    // Phase 1: accrue
    const nationalSavingsBalance = new Map<string, number>();
    const accrualOps: Record<string, Record<string, number>> = {};

    for (const char of characters) {
      const savings = char.currencyBalances?.savings ?? {};
      const holders = char.currencyBalances?.savingsHolder ?? {};
      const perCharInc: Record<string, number> = {};
      for (const [code, bal] of Object.entries(savings)) {
        const oldBalance = typeof bal === "number" ? bal : 0;
        if (oldBalance <= 0) continue;
        const cid = getCountryIdForCurrency(code);
        nationalSavingsBalance.set(cid, (nationalSavingsBalance.get(cid) ?? 0) + oldBalance);
        const holder = holders[code];
        if (holder != null && holder !== "centralBank") continue;
        const prime = resolvePrime(code);
        const eligible = interestEligibleBalance(oldBalance, resolvePoolTotal(code));
        const interest = computeSavingsInterestForTurn(eligible, prime, code, resolveInflation(code));
        if (interest <= 0) continue;
        perCharInc[`currencyBalances.pendingSavingsInterest.${code}`] = interest;
      }
      if (Object.keys(perCharInc).length > 0) {
        accrualOps[char._id] = perCharInc;
      }
    }

    // Write national savings balances (PORT-STUB: mainline bulkWrites centralBanks)
    const centralBankUpdates: Record<string, Partial<CentralBankInput>> = {};
    for (const cid of FOREX_ACTIVE_COUNTRIES) {
      const bankId = getBankId(cid);
      centralBankUpdates[bankId] = {
        ...centralBankUpdates[bankId],
        nationalSavingsBalance: Math.round((nationalSavingsBalance.get(cid) ?? 0) * 100) / 100,
      };
    }

    // On quarterly turns mainline flushes AFTER accrual write, so the just-accrued amount is included in the flush.
    // Fold accruals into the credit totals when present.
    const quarterlyAccrualByCharAndCurrency = new Map<string, Map<string, number>>();
    for (const [charId, inc] of Object.entries(accrualOps)) {
      const m = new Map<string, number>();
      for (const [k, v] of Object.entries(inc)) {
        const cur = k.replace("currencyBalances.pendingSavingsInterest.", "");
        m.set(cur, v);
      }
      quarterlyAccrualByCharAndCurrency.set(charId, m);
    }

    let totalInterest = 0;
    if (isQuarterlyCredit) {
      const creditOps: Record<string, { inc: Record<string, number>; set: Record<string, number> }> = {};
      const interestPaidByCountry = new Map<string, number>();

      for (const char of characters) {
        const pending = char.currencyBalances?.pendingSavingsInterest ?? {};
        const savingsNow = char.currencyBalances?.savings ?? {};
        const holders = char.currencyBalances?.savingsHolder ?? {};
        const perCharInc: Record<string, number> = {};
        const perCharSet: Record<string, number> = {};
        const accrualForChar = quarterlyAccrualByCharAndCurrency.get(char._id);

        // Currencies that have either pending or new accrual
        const currencies = new Set<string>([
          ...Object.keys(pending),
          ...(accrualForChar ? [...accrualForChar.keys()] : []),
        ]);
        for (const code of currencies) {
          const pendingAmt = typeof pending[code] === "number" ? (pending[code] as number) : 0;
          const accrualAmt = accrualForChar?.get(code) ?? 0;
          const holder = holders[code];
          if (holder != null && holder !== "centralBank") continue;
          const amount = pendingAmt + accrualAmt;
          if (amount <= 0) {
            // Still need to zero pending if accrual was skipped due holder check (accrualAmt already filtered)
            continue;
          }
          totalInterest += amount;
          const payingCountry = getCountryIdForCurrency(code);
          interestPaidByCountry.set(payingCountry, (interestPaidByCountry.get(payingCountry) ?? 0) + amount);
          perCharInc[`currencyBalances.savings.${code}`] = amount;
          perCharInc[`currencyBalances.interestEarned.${code}`] = amount;
          perCharSet[`currencyBalances.pendingSavingsInterest.${code}`] = 0;
          const currentSavings = typeof savingsNow[code] === "number" ? (savingsNow[code] ?? 0) : 0;
          result.ledgerEntries.push({
            characterId: char._id,
            countryId: getCountryIdForCurrency(code),
            currencyCode: code,
            type: "interest",
            amount,
            balanceAfter: roundSavingsAmount(currentSavings + amount, code),
            turn,
            createdAt: 0,
          });
          result.txLogEntries.push({
            type: "savings_interest",
            turn,
            createdAt: 0,
            subjectType: "character",
            subjectId: char._id,
            subjectName: char.name ?? "",
            amount,
            currencyCode: code,
            balanceAfter: roundSavingsAmount(currentSavings + amount, code),
          });
        }

        if (Object.keys(perCharInc).length > 0) {
          creditOps[char._id] = { inc: perCharInc, set: perCharSet };
        }
      }

      for (const [countryId, amount] of interestPaidByCountry) {
        if (amount <= 0) continue;
        const bankId = getBankId(countryId);
        const rounded = Math.round(amount * 100) / 100;
        const prev = centralBankUpdates[bankId] ?? {};
        centralBankUpdates[bankId] = {
          ...prev,
          externalBroadMoney: (prev.externalBroadMoney ?? 0) + rounded,
          netMoneyCreatedLifetime: (prev.netMoneyCreatedLifetime ?? 0) + rounded,
          savingsInterestPaidLifetime: (prev.savingsInterestPaidLifetime ?? 0) + rounded,
        };
      }

      for (const [charId, ops] of Object.entries(creditOps)) {
        result.characterUpdates[charId] = { ...ops.inc, ...ops.set };
      }
    } else {
      for (const [charId, inc] of Object.entries(accrualOps)) {
        result.characterUpdates[charId] = { ...(result.characterUpdates[charId] ?? {}), ...inc };
      }
    }
    result.charactersProcessed = Object.keys(accrualOps).length;
    result.totalInterest = totalInterest;
    result.centralBankUpdates = { ...result.centralBankUpdates, ...centralBankUpdates };

    // v3 full-agency: NPP savings (source: savingsInterestTurn.ts gated block)
    // PORT-STUB: mainline reads nppAutonomyLevel from Db; solo takes string param.
    if (nppAutonomyLevelAtLeast(nppAutonomyLevel, "v3")) {
      const nppRes = processNppSavingsInterest(turn, npps, resolvePrime, resolveInflation, resolvePoolTotal);
      result.nppResult = { nppsAccrued: nppRes.nppsAccrued, totalInterest: nppRes.totalInterest };
    }

    return result;
  }

  // Legacy path (non-forex): per-turn credit, unchanged
  // source: src/lib/turn/savingsInterestTurn.ts legacy branch
  const bulkOps: Record<string, Record<string, number>> = {};
  let totalInterest = 0;
  const legacyNationalBalance = new Map<string, number>();
  const legacyInterestByCountry = new Map<string, number>();

  for (const char of characters) {
    const sav = char.savingsOnHand ?? 0;
    if (sav <= 0) continue;
    legacyNationalBalance.set(char.countryId ?? "US", (legacyNationalBalance.get(char.countryId ?? "US") ?? 0) + sav);
    const home = getHomeCurrency(char);
    const prime = resolvePrime(home);
    const eligible = interestEligibleBalance(sav, resolvePoolTotal(home));
    const interest = computeSavingsInterestForTurn(eligible, prime, home, resolveInflation(home));
    if (interest <= 0) continue;
    totalInterest += interest;
    const payingCountry = getCountryIdForCurrency(home);
    legacyInterestByCountry.set(payingCountry, (legacyInterestByCountry.get(payingCountry) ?? 0) + interest);
    bulkOps[char._id] = {
      [`currencyBalances.savings.${home}`]: interest,
      [`currencyBalances.interestEarned.${home}`]: interest,
    };
    result.ledgerEntries.push({
      characterId: char._id,
      countryId: char.countryId ?? "US",
      currencyCode: home,
      type: "interest",
      amount: interest,
      balanceAfter: roundSavingsAmount(sav + interest, home),
      turn,
      createdAt: 0,
    });
    result.txLogEntries.push({
      type: "savings_interest",
      turn,
      createdAt: 0,
      subjectType: "character",
      subjectId: char._id,
      subjectName: char.name ?? "",
      amount: interest,
      currencyCode: home,
      balanceAfter: roundSavingsAmount(sav + interest, home),
    });
  }

  if (Object.keys(bulkOps).length === 0) {
    return { ...result, charactersProcessed: 0, totalInterest: 0 };
  }

  // source: savingsInterestTurn.ts bookCentralBankInterestCreation (legacy path)
  result.centralBankUpdates = {};
  for (const [countryId, amount] of legacyInterestByCountry) {
    if (amount <= 0) continue;
    const bankId = getBankId(countryId);
    const rounded = Math.round(amount * 100) / 100;
    const prev = result.centralBankUpdates[bankId] ?? {};
    result.centralBankUpdates[bankId] = {
      ...prev,
      externalBroadMoney: (prev.externalBroadMoney ?? 0) + rounded,
      netMoneyCreatedLifetime: (prev.netMoneyCreatedLifetime ?? 0) + rounded,
      savingsInterestPaidLifetime: (prev.savingsInterestPaidLifetime ?? 0) + rounded,
    };
  }

  for (const [cid, balance] of legacyNationalBalance) {
    const bankId = getBankId(cid);
    result.centralBankUpdates[bankId] = {
      ...result.centralBankUpdates[bankId],
      nationalSavingsBalance: Math.round(balance * 100) / 100,
    };
  }

  result.charactersProcessed = Object.keys(bulkOps).length;
  result.totalInterest = totalInterest;
  result.characterUpdates = bulkOps;
  return result;
}
