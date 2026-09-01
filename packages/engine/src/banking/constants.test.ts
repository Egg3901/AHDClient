import { describe, expect, it } from "vitest";
import {
  ARREARS_DEFAULT_TURNS,
  bandRatePercent,
  bandsForProfile,
  bankEquity,
  CONFIDENCE_BAND_AMBER_MIN,
  CONFIDENCE_BAND_GREEN_MIN,
  computeConfidence,
  computeInsurancePremium,
  computeNpcDepositShare,
  computeNpcLoanBookVolume,
  computeReserveRatioActual,
  CREDIT_BANDS,
  effectiveDepositRatePercent,
  effectiveLendingRatePercent,
  equityCappedDepositCeiling,
  FLIGHT_RATE_BY_BAND,
  getCreditBand,
  npcFlowDelta,
  perTurnInterest,
  requiredReserves,
  roundMoney,
  RUN_FAILURE_COVER_FRACTION,
  sumInsuredPlayerDeposits,
  TURNS_PER_YEAR,
} from "./constants.js";

// ── Interest math — golden values hand-computed against
// src/lib/turn/bankingTurn.ts perTurnInterest ──────────────────────────
describe("perTurnInterest", () => {
  it("golden: 100000 @ 5% annual / 48 turns per year = 104.1666... -> 104.17", () => {
    // 100000 * 0.05 / 48 = 104.1666...
    expect(perTurnInterest(100000, 5)).toBe(104.17);
  });
  it("zero on non-positive balance or rate", () => {
    expect(perTurnInterest(0, 5)).toBe(0);
    expect(perTurnInterest(-100, 5)).toBe(0);
    expect(perTurnInterest(100, 0)).toBe(0);
  });
  it("effective rate floors. Source: rates.ts MIN_DEPOSIT_RATE_PERCENT/MIN_LENDING_RATE_PERCENT", () => {
    expect(effectiveDepositRatePercent(0, -1)).toBe(0.05);
    expect(effectiveDepositRatePercent(3, 0)).toBe(3);
    expect(effectiveLendingRatePercent(0, -1)).toBe(0.1);
    expect(effectiveLendingRatePercent(4, 1)).toBe(5);
  });
});

// ── NPC deposit flow ──────────────────────────────────────────────────
describe("npcFlowDelta", () => {
  it("ramps toward target capped at 2.5% of the larger side", () => {
    // Source: bankingTurn.ts MAX_NPC_FLOW_PER_TURN_FRACTION = 0.025
    expect(npcFlowDelta(1000, 2000)).toBe(50); // maxInflow = 0.025*max(2000,1000) = 50
    expect(npcFlowDelta(1000, 0)).toBe(-25); // maxOutflow = 0.025*1000
    expect(npcFlowDelta(0, 1000)).toBe(25); // 0.025*max(1000,0)
  });
});

describe("computeNpcDepositShare", () => {
  it("base share at parity with the CB comparison rate", () => {
    const shares = computeNpcDepositShare([{ bankId: "A", effectiveDepositRatePercent: 2 }], 2);
    expect(shares[0]!.share).toBeCloseTo(0.08, 6); // premiumRatio 0 -> base share
  });
  it("caps a single bank at NPC_DEPOSIT_MAX_SHARE_PER_BANK (0.25)", () => {
    const shares = computeNpcDepositShare([{ bankId: "A", effectiveDepositRatePercent: 100 }], 2);
    expect(shares[0]!.share).toBe(0.25);
  });
  it("scales every bank down proportionally when the combined total exceeds 0.6", () => {
    const shares = computeNpcDepositShare(
      [
        { bankId: "A", effectiveDepositRatePercent: 100 },
        { bankId: "B", effectiveDepositRatePercent: 100 },
        { bankId: "C", effectiveDepositRatePercent: 100 },
      ],
      2,
    );
    const total = shares.reduce((s, r) => s + r.share, 0);
    expect(total).toBeCloseTo(0.6, 6);
    // Each was capped at 0.25 pre-scale (0.75 combined), scaled by 0.6/0.75 = 0.8
    expect(shares[0]!.share).toBeCloseTo(0.2, 6);
  });
});

describe("equityCappedDepositCeiling", () => {
  it("returns capacity unchanged for a well-capitalized bank", () => {
    expect(equityCappedDepositCeiling(1000, 1000)).toBe(1000);
  });
  it("caps at 12x equity for a thinly-capitalized bank. Source: NPC_DEPOSIT_MAX_EQUITY_LEVERAGE", () => {
    expect(equityCappedDepositCeiling(1_000_000, 100)).toBe(1200);
  });
  it("drives to 0 for non-positive equity", () => {
    expect(equityCappedDepositCeiling(1_000_000, -50)).toBe(0);
    expect(equityCappedDepositCeiling(1_000_000, 0)).toBe(0);
  });
});

// ── Balance sheet ─────────────────────────────────────────────────────
describe("bankEquity / requiredReserves", () => {
  it("equity = cash + loans - cashBackedDeposits", () => {
    expect(bankEquity(1000, 500, 800)).toBe(700);
    expect(bankEquity(100, 0, 800)).toBe(-700); // insolvent bank: negative equity
  });
  it("requiredReserves = deposits * ratio", () => {
    expect(requiredReserves(1000, 0.2)).toBe(200);
    expect(requiredReserves(-1000, 0.2)).toBe(0);
  });
});

// ── Insurance ─────────────────────────────────────────────────────────
describe("computeInsurancePremium", () => {
  it("golden: at-required reserves, risk weight = 1", () => {
    // riskWeight = clamp(2 - actual/required, 0.5, 3); actual===required -> 1
    // premium = deposits * 0.004 / 48 * 1
    const premium = computeInsurancePremium(48_000, 0.2, 0.2);
    expect(roundMoney(premium)).toBe(4); // 48000*0.004/48 = 4
  });
  it("thin reserves pay more", () => {
    const thin = computeInsurancePremium(48_000, 0, 0.2);
    const full = computeInsurancePremium(48_000, 0.2, 0.2);
    expect(thin).toBeGreaterThan(full);
    // riskWeight = clamp(2 - 0/0.2, 0.5, 3) = 2 -> 48000*0.004/48*2 = 8
    expect(roundMoney(thin)).toBe(8);
  });
  it("zero on non-positive deposits", () => {
    expect(computeInsurancePremium(0, 0.2, 0.2)).toBe(0);
    expect(computeInsurancePremium(-100, 0.2, 0.2)).toBe(0);
  });
});

describe("sumInsuredPlayerDeposits", () => {
  it("caps each balance at insuredCap and sums", () => {
    expect(sumInsuredPlayerDeposits([100, 5000, 200], 1000)).toBe(100 + 1000 + 200);
  });
  it("ignores non-positive balances", () => {
    expect(sumInsuredPlayerDeposits([0, -50, 300], 1000)).toBe(300);
  });
});

describe("computeReserveRatioActual", () => {
  it("cash / deposits, 1 when no deposits", () => {
    expect(computeReserveRatioActual(200, 1000)).toBe(0.2);
    expect(computeReserveRatioActual(200, 0)).toBe(1);
  });
});

// ── Credit bands ──────────────────────────────────────────────────────
describe("bandsForProfile / bandRatePercent", () => {
  it("conservative opens AAA..A only. Source: creditBands.ts LENDING_PROFILES floorBand", () => {
    const bands = bandsForProfile("conservative").map((b) => b.id);
    expect(bands).toEqual(["AAA", "AA", "A"]);
  });
  it("balanced opens through BBB", () => {
    expect(bandsForProfile("balanced").map((b) => b.id)).toEqual(["AAA", "AA", "A", "BBB"]);
  });
  it("aggressive opens every band", () => {
    expect(bandsForProfile("aggressive").map((b) => b.id)).toEqual(CREDIT_BANDS.map((b) => b.id));
  });
  it("bandRatePercent adds the band premium, floored at 0", () => {
    expect(bandRatePercent(getCreditBand("AAA"), 5)).toBe(3.5); // 5 + (-1.5)
    expect(bandRatePercent(getCreditBand("AAA"), 1)).toBe(0); // 1 + (-1.5) = -0.5 -> floored
  });
});

describe("computeNpcLoanBookVolume", () => {
  it("golden: at the rate reference (4%), volume factor is 1 (full funding)", () => {
    expect(computeNpcLoanBookVolume(10000, 4)).toBe(10000);
  });
  it("volume shrinks above the rate reference, floored at 0.2x funding", () => {
    // 1 - (rate-4)*0.08, clamped [0.2, 1]
    expect(computeNpcLoanBookVolume(10000, 14)).toBe(2000); // factor floors at 0.2
  });
  it("zero funding -> zero volume", () => {
    expect(computeNpcLoanBookVolume(0, 4)).toBe(0);
    expect(computeNpcLoanBookVolume(-100, 4)).toBe(0);
  });
});

// ── Solvency confidence ───────────────────────────────────────────────
describe("computeConfidence", () => {
  it("golden: fully reserved, no loans, no arrears -> green", () => {
    const { confidence, band } = computeConfidence({
      cashReserves: 1000,
      cashBackedDeposits: 1000,
      totalLoans: 0,
      reserveRatioRequired: 0.2,
      arrearsOutstanding: 0,
      defaultsLastTurn: 0,
      panicTurns: 0,
    });
    // reserveCover = min(1.5, 1000/max(1,0.2*1000)) = min(1.5, 5) = 1.5 -> weighted min(1,1.5)=1
    // capitalCover = min(1, 1000/max(1,0)) = 1 (loanDenom for capitalCover uses max(1,loans)=1 -> 1000/1 capped at 1)
    // assetQuality = 1
    // raw = 0.45*1 + 0.25*1 + 0.3*1 = 1
    expect(confidence).toBe(1);
    expect(band).toBe("green");
  });
  it("band thresholds: green >= 0.7, amber >= 0.4, else red", () => {
    expect(CONFIDENCE_BAND_GREEN_MIN).toBe(0.7);
    expect(CONFIDENCE_BAND_AMBER_MIN).toBe(0.4);
  });
  it("panic turns penalize confidence, capped at 4 turns", () => {
    const base = computeConfidence({
      cashReserves: 1000,
      cashBackedDeposits: 1000,
      totalLoans: 0,
      reserveRatioRequired: 0.2,
      arrearsOutstanding: 0,
      defaultsLastTurn: 0,
      panicTurns: 0,
    });
    const panicked = computeConfidence({
      cashReserves: 1000,
      cashBackedDeposits: 1000,
      totalLoans: 0,
      reserveRatioRequired: 0.2,
      arrearsOutstanding: 0,
      defaultsLastTurn: 0,
      panicTurns: 10,
    });
    expect(base.confidence - panicked.confidence).toBeCloseTo(0.12 * 4, 6); // capped at 4 turns
  });
  it("no cash, no loans -> capitalCover 0, reserveCover 0 -> confidence from assetQuality only", () => {
    const { confidence, band } = computeConfidence({
      cashReserves: 0,
      cashBackedDeposits: 1000,
      totalLoans: 0,
      reserveRatioRequired: 0.2,
      arrearsOutstanding: 0,
      defaultsLastTurn: 0,
      panicTurns: 0,
    });
    expect(confidence).toBeCloseTo(0.3, 6); // only the 0.3 assetQuality weight survives
    expect(band).toBe("red");
  });
});

describe("solvency thresholds", () => {
  it("flight rates: amber 10%, red 30%. Source: bankSolvencyTurn.ts FLIGHT_RATE_BY_BAND", () => {
    expect(FLIGHT_RATE_BY_BAND.amber).toBe(0.1);
    expect(FLIGHT_RATE_BY_BAND.red).toBe(0.3);
  });
  it("run failure at 50% of required liquidity while red-banded. Source: RUN_FAILURE_COVER_FRACTION", () => {
    expect(RUN_FAILURE_COVER_FRACTION).toBe(0.5);
  });
  it("arrears default at 8 consecutive shortfall turns. Source: bankingTurn.ts ARREARS_DEFAULT_TURNS", () => {
    expect(ARREARS_DEFAULT_TURNS).toBe(8);
  });
});

describe("cadence", () => {
  it("48 turns per year, matching every other ported finance module", () => {
    expect(TURNS_PER_YEAR).toBe(48);
  });
});
