import { describe, it, expect } from "vitest";
import {
  processSavingsInterestTurn,
  processNppSavingsInterest,
  computeSavingsInterestForTurn,
  interestEligibleBalance,
  roundSavingsAmount,
  savingsApyPercent,
  estimateSavingsAccrualFromApy,
  turnsUntilSavingsCredit,
  nppAutonomyLevelAtLeast,
  getBankId,
  getCountryIdForCurrency,
  getHomeCurrency,
  FOREX_ACTIVE_COUNTRIES,
  FOREX_ACTIVE_CURRENCIES,
  SAVINGS_CREDIT_INTERVAL_TURNS,
  SAVINGS_POOL_SHARE_CAP,
  SAVINGS_REAL_RATE_FLOOR_PERCENT,
} from "./savingsInterest.js";

describe("savingsInterest pure helpers", () => {
  it("interestEligibleBalance caps at 25% of pool", () => {
    expect(interestEligibleBalance(1000, 2000)).toBe(500); // 0.25*2000=500 <1000
    expect(interestEligibleBalance(1000, 10000)).toBe(1000); // cap 2500 >1000 so uncapped
    expect(interestEligibleBalance(1000, 0)).toBe(1000); // no pool basis
  });

  it("savingsApyPercent uses real rate floor", () => {
    expect(savingsApyPercent(5, 2)).toBe(1.5); // (5-2)/2
    expect(savingsApyPercent(0.6, 0.5)).toBe(0.25); // floor 0.5/2
    expect(SAVINGS_REAL_RATE_FLOOR_PERCENT).toBe(0.5);
    expect(SAVINGS_POOL_SHARE_CAP).toBe(0.25);
  });

  it("roundSavingsAmount JPY vs USD", () => {
    expect(roundSavingsAmount(1.234, "USD")).toBe(1.23);
    expect(roundSavingsAmount(1.235, "USD")).toBe(1.24);
    // source: src/lib/currency/savingsInterest.ts JPY rounds to whole yen
    expect(roundSavingsAmount(1.6, "JPY")).toBe(2);
    expect(roundSavingsAmount(1.4, "JPY")).toBe(1);
  });

  it("computeSavingsInterestForTurn hand-computed golden: 1000@5% prime 2% inflation", () => {
    // real 3pp apy 1.5% => 1000*0.015/48=0.3125 -> 0.31 after 2dp
    const interest = computeSavingsInterestForTurn(1000, 5, "USD", 2);
    expect(interest).toBe(0.31);
  });

  it("computeSavingsInterestForTurn JPY rounds to 0 for small accrual", () => {
    // 1000 JPY same raw 0.3125 but JPY rounds to 0
    expect(computeSavingsInterestForTurn(1000, 5, "JPY", 2)).toBe(0);
    // Larger balance yields 1 yen: 4000*0.015/48=1.25 -> 1 yen
    expect(computeSavingsInterestForTurn(4000, 5, "JPY", 2)).toBe(1);
  });

  it("estimateSavingsAccrualFromApy mirrors computeSavingsInterestForTurn", () => {
    expect(estimateSavingsAccrualFromApy(1000, 1.5, "USD")).toBe(0.31);
  });

  it("turnsUntilSavingsCredit", () => {
    expect(turnsUntilSavingsCredit(1)).toBe(11);
    expect(turnsUntilSavingsCredit(12)).toBe(12);
    expect(SAVINGS_CREDIT_INTERVAL_TURNS).toBe(12);
  });

  it("getBankId source: src/lib/centralBank/helpers.ts via sharedBankId", () => {
    expect(getBankId("DE")).toBe("ECB");
    expect(getBankId("SCO")).toBe("UK");
    expect(getBankId("WAL")).toBe("UK");
    expect(getBankId("US")).toBe("US");
    expect(getBankId("IE")).toBe("IE"); // not ECB in mainline (IE has sovereign CBI)
    expect(getBankId("FR")).toBe("FR");
  });

  it("FOREX constants verbatim from src/lib/constants/currencies.ts", () => {
    expect([...FOREX_ACTIVE_CURRENCIES]).toEqual([
      "USD", "GBP", "JPY", "EUR", "IEP", "CNY", "BRL", "NGN", "SUR", "DDM", "FRF", "ITL", "ESP", "SEK", "TRL", "GRD", "ATS", "FIM",
    ]);
    expect([...FOREX_ACTIVE_COUNTRIES]).toEqual([
      "US", "UK", "JP", "DE", "IE", "CN", "BR", "NG", "RU", "DD", "FR", "IT", "ES", "SE", "TR", "GR", "AT", "FI",
    ]);
  });

  it("getCountryIdForCurrency verbatim anchor map", () => {
    expect(getCountryIdForCurrency("USD")).toBe("US");
    expect(getCountryIdForCurrency("GBP")).toBe("UK");
    expect(getCountryIdForCurrency("IEP")).toBe("IE");
    expect(getCountryIdForCurrency("EUR")).toBe("DE");
    expect(getCountryIdForCurrency("SUR")).toBe("RU");
    expect(getCountryIdForCurrency("DDM")).toBe("DD");
    expect(getCountryIdForCurrency("FRF")).toBe("FR");
    expect(getCountryIdForCurrency("UNKNOWN")).toBe("US");
  });

  it("getHomeCurrency verbatim COUNTRY_CURRENCY_MAP", () => {
    expect(getHomeCurrency({ _id: "x", countryId: "US" })).toBe("USD");
    expect(getHomeCurrency({ _id: "x", countryId: "IE" })).toBe("IEP");
    expect(getHomeCurrency({ _id: "x", countryId: "RU" })).toBe("SUR");
    expect(getHomeCurrency({ _id: "x", countryId: "DD" })).toBe("DDM");
    expect(getHomeCurrency({ _id: "x", countryId: "FR" })).toBe("FRF");
    expect(getHomeCurrency({ _id: "x", countryId: "SCO" })).toBe("GBP");
  });

  it("nppAutonomyLevelAtLeast rank ordering", () => {
    expect(nppAutonomyLevelAtLeast("v3", "v3")).toBe(true);
    expect(nppAutonomyLevelAtLeast("v4", "v3")).toBe(true);
    expect(nppAutonomyLevelAtLeast("v2", "v3")).toBe(false);
    expect(nppAutonomyLevelAtLeast("off", "v3")).toBe(false);
  });
});

describe("savingsInterest forex quarterly compounding", () => {
  it("accrues pending on non-quarter turn, does not flush", () => {
    const chars = [
      {
        _id: "char1",
        name: "Test",
        countryId: "US",
        currencyBalances: {
          savings: { USD: 1000 },
          savingsHolder: { USD: "centralBank" },
          pendingSavingsInterest: { USD: 0 },
          interestEarned: { USD: 0 },
        },
      },
    ];
    const banks = [
      { _id: "US", primeRate: 5, nationalSavingsBalance: 10000, inflationHistory: [{ rate: 2 }] },
    ];
    const result = processSavingsInterestTurn(1, chars, banks, true, "off");
    expect(result.charactersProcessed).toBe(1);
    expect(result.totalInterest).toBe(0);
    expect(result.characterUpdates["char1"]!["currencyBalances.pendingSavingsInterest.USD"]).toBe(0.31);
    expect(result.ledgerEntries.length).toBe(0);
    expect(result.centralBankUpdates["US"]!.nationalSavingsBalance).toBe(1000);
  });

  it("flushes pending on quarterly credit turn 12 (includes just-accrued 0.31)", () => {
    const chars = [
      {
        _id: "char1",
        name: "Test",
        countryId: "US",
        currencyBalances: {
          savings: { USD: 1000 },
          savingsHolder: { USD: "centralBank" },
          pendingSavingsInterest: { USD: 30 },
          interestEarned: { USD: 0 },
        },
      },
    ];
    const banks = [
      { _id: "US", primeRate: 5, nationalSavingsBalance: 10000, inflationHistory: [{ rate: 2 }] },
    ];
    const result = processSavingsInterestTurn(12, chars, banks, true, "off");
    // Accrual 0.31 (1000@5-2 real) is folded into flush: 30 + 0.31 = 30.31
    expect(result.totalInterest).toBe(30.31);
    expect(result.characterUpdates["char1"]!["currencyBalances.savings.USD"]).toBe(30.31);
    expect(result.characterUpdates["char1"]!["currencyBalances.interestEarned.USD"]).toBe(30.31);
    expect(result.characterUpdates["char1"]!["currencyBalances.pendingSavingsInterest.USD"]).toBe(0);
    expect(result.ledgerEntries.length).toBe(1);
    expect(result.ledgerEntries[0]!.amount).toBe(30.31);
    expect(result.ledgerEntries[0]!.balanceAfter).toBe(1030.31);
    expect(result.txLogEntries[0]!.amount).toBe(30.31);
    expect(result.centralBankUpdates["US"]!.externalBroadMoney).toBe(30.31);
  });

  it("skips bank-held deposits on accrual", () => {
    const chars = [
      {
        _id: "char1",
        currencyBalances: {
          savings: { USD: 1000 },
          savingsHolder: { USD: "somePrivateBank" },
          pendingSavingsInterest: {},
        },
      },
    ];
    const banks = [{ _id: "US", primeRate: 5, nationalSavingsBalance: 10000, inflationHistory: [{ rate: 2 }] }];
    const result = processSavingsInterestTurn(1, chars, banks, true, "off");
    expect(result.charactersProcessed).toBe(0);
    expect(result.characterUpdates["char1"]).toBeUndefined();
  });

  it("NPP savings path gated by v3", () => {
    const banks = [{ _id: "US", primeRate: 5, nationalSavingsBalance: 10000, inflationHistory: [{ rate: 2 }] }];
    const chars: typeof banks = [];
    const npps = [
      { _id: "npp1", currencyBalances: { savings: { USD: 10000 }, pendingSavingsInterest: {} } },
    ];
    const off = processSavingsInterestTurn(1, chars as never[], banks, true, "off", npps);
    expect(off.nppResult).toBeUndefined();
    const on = processSavingsInterestTurn(1, chars as never[], banks, true, "v3", npps);
    expect(on.nppResult).toBeDefined();
    expect(on.nppResult!.nppsAccrued).toBe(1);
    // 10000*0.015/48=3.125 -> 3.13 but pool cap: 10000 cap vs pool 10000 => cap 2500 => 2500*0.015/48=0.781 -> 0.78
    // With pool 10000, eligible 2500, interest 0.78
    expect(on.nppResult!.totalInterest).toBe(0); // turn 1 not quarterly flush
    const q = processSavingsInterestTurn(12, chars as never[], banks, true, "v3", [
      { _id: "npp1", currencyBalances: { savings: { USD: 1000 }, pendingSavingsInterest: { USD: 5 } } },
    ]);
    expect(q.nppResult!.totalInterest).toBe(5);
  });

  it("processNppSavingsInterest direct: accrual and quarterly flush", () => {
    const resolvePrime = () => 5;
    const resolveInflation = () => 2;
    const resolvePool = () => 100000;
    const a = processNppSavingsInterest(1, [{ _id: "n1", currencyBalances: { savings: { USD: 1000 } } }], resolvePrime, resolveInflation, resolvePool);
    expect(a.nppsAccrued).toBe(1);
    expect(a.nppUpdates["n1"]!["currencyBalances.pendingSavingsInterest.USD"]).toBe(0.31);
    const q = processNppSavingsInterest(12, [{ _id: "n1", currencyBalances: { savings: { USD: 1000 }, pendingSavingsInterest: { USD: 2 } } }], resolvePrime, resolveInflation, resolvePool);
    expect(q.totalInterest).toBe(2);
  });
});

describe("savingsInterest legacy non-forex path", () => {
  it("credits per-turn interest directly", () => {
    const chars = [{ _id: "char1", name: "Test", countryId: "US", savingsOnHand: 1000 }];
    const banks = [{ _id: "US", primeRate: 5, nationalSavingsBalance: 10000, inflationHistory: [{ rate: 2 }] }];
    const result = processSavingsInterestTurn(1, chars, banks, false, "off");
    expect(result.charactersProcessed).toBe(1);
    expect(result.totalInterest).toBe(0.31);
    expect(result.characterUpdates["char1"]!["currencyBalances.savings.USD"]).toBe(0.31);
    expect(result.ledgerEntries[0]!.currencyCode).toBe("USD");
    expect(result.centralBankUpdates["US"]!.externalBroadMoney).toBe(0.31);
  });

  it("legacy path routes via COUNTRY_CURRENCY_MAP (IE->IEP)", () => {
    const chars = [{ _id: "c1", countryId: "IE", savingsOnHand: 1000 }];
    const banks = [{ _id: "IE", primeRate: 5, nationalSavingsBalance: 10000, inflationHistory: [{ rate: 0 }] }];
    // 1000 IEP prime5 real5 apy2.5 => 1000*0.025/48=0.5208 ->0.52
    const result = processSavingsInterestTurn(1, chars, banks, false, "off");
    expect(result.ledgerEntries[0]!.currencyCode).toBe("IEP");
    expect(result.totalInterest).toBe(0.52);
  });
});
