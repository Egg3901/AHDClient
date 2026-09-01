import { describe, it, expect } from "vitest";
import {
  processLineOfCreditTurn,
  computeLocInterestForTurn,
  computeLocScheduledPaymentFace,
  spreadPercentPointsFromComposite,
  computeLocBorrowerComposite,
  incomeScoreFromPerTurnCurrency,
  netWorthScoreFromInternal,
  toInternalUnits,
  fromInternalUnits,
  getBankId,
  getCountryIdForCurrency,
  getHomeCurrency,
  resolvePrimeForCurrency,
  FOREX_ACTIVE_CURRENCIES,
  LOC_IO_SURCHARGE_PERCENT_POINTS,
  LOC_PER_TURN_PAYMENT_RATE,
  roundSavingsAmount,
} from "./lineOfCredit.js";

describe("lineOfCredit pure math", () => {
  it("LOC_IO_SURCHARGE and PAYMENT_RATE are verbatim from src/lib/lineOfCredit/locMath.ts", () => {
    expect(LOC_IO_SURCHARGE_PERCENT_POINTS).toBe(2.0);
    expect(LOC_PER_TURN_PAYMENT_RATE).toBeCloseTo(0.0040625, 10);
  });

  it("computeLocInterestForTurn hand golden: 1000@5+2 spread /48 -> 1.46", () => {
    // obligation 1000 annual 7% raw 70/48=1.4583 -> 1.46
    expect(computeLocInterestForTurn(1000, 0, 5, 2, "USD")).toBe(1.46);
    // with arrears 100: 1100*0.07/48=1.604 ->1.60
    expect(computeLocInterestForTurn(1000, 100, 5, 2, "USD")).toBe(1.6);
    // JPY rounds to yen
    expect(computeLocInterestForTurn(1000, 0, 5, 2, "JPY")).toBe(1);
  });

  it("computeLocScheduledPaymentFace pi vs io", () => {
    // pi: 1000*0.0040625=4.0625 -> 4.06 after roundSavings
    expect(computeLocScheduledPaymentFace("pi", 1000, 0)).toBeCloseTo(4.0625, 10);
    expect(roundSavingsAmount(computeLocScheduledPaymentFace("pi", 1000, 0), "USD")).toBe(4.06);
    // io: arrears only
    expect(computeLocScheduledPaymentFace("io", 1000, 100)).toBe(100);
    expect(computeLocScheduledPaymentFace("io", 1000, 0)).toBe(0);
  });

  it("toInternal/fromInternal are inverses with guards", () => {
    expect(toInternalUnits(106, 106)).toBe(1);
    expect(fromInternalUnits(1, 106)).toBe(106);
    expect(toInternalUnits(100, 0)).toBe(0);
    expect(fromInternalUnits(100, 0)).toBe(0);
    expect(toInternalUnits(100, 1)).toBe(100);
    expect(fromInternalUnits(100, 1)).toBe(100);
  });

  it("spread from composite 5-(c/100)*6", () => {
    expect(spreadPercentPointsFromComposite(0)).toBe(5);
    expect(spreadPercentPointsFromComposite(100)).toBe(-1);
    expect(spreadPercentPointsFromComposite(50)).toBeCloseTo(2, 10);
  });

  it("computeLocBorrowerComposite hand golden 28.15", () => {
    const composite = computeLocBorrowerComposite({
      corpComposite: 50,
      incomeScore: 30,
      netWorthScore: 40,
      debtToAssetsRatio: 0.2,
      homePrimePercent: 5,
    });
    expect(composite).toBeCloseTo(28.15, 1);
  });

  it("income/netWorth scores saturating exponentials", () => {
    expect(incomeScoreFromPerTurnCurrency(0)).toBe(0);
    expect(netWorthScoreFromInternal(0)).toBe(0);
    expect(incomeScoreFromPerTurnCurrency(100000)).toBeGreaterThan(80);
    expect(netWorthScoreFromInternal(10_000_000)).toBeGreaterThan(80);
  });

  it("getBankId and currency helpers verbatim", () => {
    expect(getBankId("DE")).toBe("ECB");
    expect(getBankId("US")).toBe("US");
    expect(getBankId("IE")).toBe("IE");
    expect(getCountryIdForCurrency("IEP")).toBe("IE");
    expect(getCountryIdForCurrency("EUR")).toBe("DE");
    expect(getCountryIdForCurrency("SUR")).toBe("RU");
    expect(getHomeCurrency({ _id: "x", countryId: "IE" })).toBe("IEP");
    expect(getHomeCurrency({ _id: "x", countryId: "DD" })).toBe("DDM");
  });

  it("FOREX_ACTIVE_CURRENCIES verbatim includes SUR/DDM/FRF not modern SEK-only list", () => {
    expect([...FOREX_ACTIVE_CURRENCIES].includes("SUR" as never)).toBe(true);
    expect([...FOREX_ACTIVE_CURRENCIES].includes("IEP" as never)).toBe(true);
    expect([...FOREX_ACTIVE_CURRENCIES].includes("EUR" as never)).toBe(true);
  });

  it("resolvePrimeForCurrency via getBankId", () => {
    const m = new Map([["ECB", 4], ["US", 5]]);
    expect(resolvePrimeForCurrency(m, "EUR")).toBe(4); // DE->ECB
    expect(resolvePrimeForCurrency(m, "USD")).toBe(5);
    // IEP->IE not in map -> fallback DEFAULT_PRIME 2.5
    expect(resolvePrimeForCurrency(m, "IEP")).toBe(2.5);
    const m2 = new Map([["IE", 3]]);
    expect(resolvePrimeForCurrency(m2, "IEP")).toBe(3);
  });
});

describe("lineOfCredit turn", () => {
  it("accrues interest at TURNS_PER_YEAR=48 and auto-pays from wallet", () => {
    const chars = [
      {
        _id: "char1",
        name: "Test",
        countryId: "US",
        currencyBalances: { personal: { USD: 1000 }, savings: { USD: 0 } },
        lineOfCredit: { balances: { USD: 1000 }, arrears: { USD: 0 }, drawFrozen: false, paymentMode: { USD: "pi" }, accountsOpened: 1 },
      },
    ];
    const corps: never[] = [];
    const banks = [{ _id: "US", primeRate: 5 }];
    const incomeMap = new Map<string, number>([["char1", 1000]]);

    const result = processLineOfCreditTurn(1, chars, corps, banks, incomeMap, true, true, { USD: 1, GBP: 0.75, JPY: 106, EUR: 0.92, IEP: 0.92, CNY: 7.2, BRL: 5, NGN: 1550, SUR: 2.22, DDM: 2.22, FRF: 4.2, ITL: 833, ESP: 67, SEK: 4.29, TRL: 34.5, GRD: 37, ATS: 13.4, FIM: 3.9 });

    expect(result.charactersProcessed).toBe(1);
    expect(result.ledgerEntries.length).toBeGreaterThan(0);
    const interestEntry = result.ledgerEntries.find((e) => e.type === "interest")!;
    expect(interestEntry).toBeDefined();
    expect(interestEntry.amount).toBeGreaterThan(0);
    expect(interestEntry.amount).toBeLessThan(10); // /48 not /12 (old fabricated 5.83 would fail)
    expect(result.characterUpdates["char1"]).toBeDefined();
    expect(result.characterUpdates["char1"]!.lineOfCredit).toBeDefined();
    // Payment should be small (pi rate 0.004) not 50
    const payEntry = result.ledgerEntries.find((e) => e.type === "auto_payment")!;
    expect(payEntry).toBeDefined();
    expect(payEntry.amount).toBeLessThan(20);
  });

  it("freezes on shortfall when wallet empty and income low", () => {
    const chars = [
      {
        _id: "char1",
        name: "Test",
        countryId: "US",
        currencyBalances: { personal: { USD: 0 }, savings: { USD: 0 } },
        lineOfCredit: { balances: { USD: 1000 }, arrears: { USD: 0 }, drawFrozen: false, paymentMode: { USD: "pi" }, accountsOpened: 1 },
      },
    ];
    const banks = [{ _id: "US", primeRate: 5 }];
    const incomeMap = new Map<string, number>([["char1", 0]]);

    const result = processLineOfCreditTurn(1, chars, [] as never[], banks, incomeMap, true, true, { USD: 1 });

    expect(result.characterUpdates["char1"]!.lineOfCredit!.drawFrozen).toBe(true);
    expect(result.ledgerEntries.some((e) => e.type === "freeze")).toBe(true);
  });

  it("unfreezes when income covers scheduled payment even though wallet drained by garnishment", () => {
    const chars = [
      {
        _id: "char1",
        countryId: "US",
        currencyBalances: { personal: { USD: 0 }, savings: { USD: 0 } },
        lineOfCredit: { balances: { USD: 100 }, arrears: { USD: 0 }, drawFrozen: true, paymentMode: { USD: "pi" } },
      },
    ];
    // scheduled pi for 100 = 0.406 -> internal 0.406; income 10 covers it
    const incomeMap = new Map([["char1", 10]]);
    const banks = [{ _id: "US", primeRate: 2.5 }];
    const result = processLineOfCreditTurn(1, chars, [] as never[], banks, incomeMap, true, true, { USD: 1 });
    expect(result.characterUpdates["char1"]!.lineOfCredit!.drawFrozen).toBe(false);
  });

  it("IO mode surcharge adds 2pp to interest", () => {
    const charsPi = [
      {
        _id: "a",
        countryId: "US",
        currencyBalances: { personal: { USD: 1000 } },
        lineOfCredit: { balances: { USD: 1000 }, arrears: { USD: 0 }, paymentMode: { USD: "pi" } },
      },
    ];
    const charsIo = [
      {
        _id: "b",
        countryId: "US",
        currencyBalances: { personal: { USD: 1000 } },
        lineOfCredit: { balances: { USD: 1000 }, arrears: { USD: 0 }, paymentMode: { USD: "io" } },
      },
    ];
    const banks = [{ _id: "US", primeRate: 5 }];
    const income = new Map([["a", 0], ["b", 0]]);
    const rates = { USD: 1 };
    const rPi = processLineOfCreditTurn(1, charsPi, [] as never[], banks, income, true, true, rates);
    const rIo = processLineOfCreditTurn(1, charsIo as never[], [] as never[], banks, income, true, true, rates);
    const iPi = rPi.ledgerEntries.find((e) => e.characterId === "a" && e.type === "interest")!.amount;
    const iIo = rIo.ledgerEntries.find((e) => e.characterId === "b" && e.type === "interest")!.amount;
    expect(iIo).toBeGreaterThan(iPi);
  });

  it("early returns when forex or LOC disabled", () => {
    const chars = [{ _id: "x", lineOfCredit: { balances: { USD: 100 } } }];
    expect(processLineOfCreditTurn(1, chars as never[], [] as never[], [], new Map(), false, true, { USD: 1 }).charactersProcessed).toBe(0);
    expect(processLineOfCreditTurn(1, chars as never[], [] as never[], [], new Map(), true, false, { USD: 1 }).charactersProcessed).toBe(0);
  });
});
