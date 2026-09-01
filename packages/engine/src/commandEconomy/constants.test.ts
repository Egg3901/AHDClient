import { describe, expect, it } from "vitest";
import {
  computePolicyStance,
  driftMarketizationLevel,
  governmentReformismFromEconomicPosition,
  internalRepressionFromReformism,
  isCommandEconomy,
  isPlannedEconomy,
  marketizationDrift,
  marketizationGravity,
  plannedShare,
  scheduledMarketizationLevel,
  wageFundConstrainedGrowth,
} from "./constants.js";

// Formula source: /root/projects/AHDGame/src/lib/constants/commandEconomy.ts
// and /root/projects/AHDGame/src/lib/economy/twoCircuitMoney.ts

describe("scheduledMarketizationLevel", () => {
  it("RU/DD read the 1953 command-band seed within their era, MARKET_LEVEL after", () => {
    expect(scheduledMarketizationLevel("RU", 1953)).toBe(10);
    expect(scheduledMarketizationLevel("RU", 1991)).toBe(10);
    expect(scheduledMarketizationLevel("RU", 1992)).toBe(100);
    expect(scheduledMarketizationLevel("DD", 1953)).toBe(10);
    expect(scheduledMarketizationLevel("DD", 1990)).toBe(10);
    expect(scheduledMarketizationLevel("DD", 1991)).toBe(100);
  });
  it("a country absent from the schedule (US/UK) is always fully market", () => {
    expect(scheduledMarketizationLevel("US", 1953)).toBe(100);
    expect(scheduledMarketizationLevel("UK", 2019)).toBe(100);
  });
});

describe("band predicates", () => {
  it("isPlannedEconomy / isCommandEconomy / plannedShare at the band edges", () => {
    expect(isPlannedEconomy(69.9)).toBe(true);
    expect(isPlannedEconomy(70)).toBe(false);
    expect(isCommandEconomy(29.9)).toBe(true);
    expect(isCommandEconomy(30)).toBe(false);
    expect(plannedShare(0)).toBeCloseTo(1, 10);
    expect(plannedShare(10)).toBeCloseTo(1 - 10 / 70, 10);
    expect(plannedShare(70)).toBe(0);
    expect(plannedShare(100)).toBe(0);
  });
});

describe("marketizationDrift", () => {
  it("hand-computed: each of the three weighted terms in isolation", () => {
    // w_bm * 1 = 0.22
    expect(marketizationDrift(1, 1.0, 0)).toBeCloseTo(0.22, 10);
    // w_pol * 1 = 0.12
    expect(marketizationDrift(0, 1.0, 1)).toBeCloseTo(0.12, 10);
    // w_soe * (1.0 - 0.5) = 0.09; w_pol * -1 = -0.12; sum -0.03
    expect(marketizationDrift(0, 0.5, -1)).toBeCloseTo(0.09 - 0.12, 10);
  });
});

describe("marketizationGravity", () => {
  it("zero at the scheduled value; capped magnitude off it", () => {
    expect(marketizationGravity(10, 10)).toBe(0);
    // pull = 0.004*(10-0) = 0.04, capped to MARKETIZATION_GRAVITY_MAX_STEP=0.02
    expect(marketizationGravity(0, 10)).toBeCloseTo(0.02, 10);
    expect(marketizationGravity(50, 10)).toBeCloseTo(-0.02, 10);
  });
});

describe("driftMarketizationLevel", () => {
  it("clamps to [0, MARKET_LEVEL]", () => {
    expect(driftMarketizationLevel(10, 0.22)).toBeCloseTo(10.22, 10);
    expect(driftMarketizationLevel(99.9, 5)).toBe(100);
    expect(driftMarketizationLevel(1, -5)).toBe(0);
  });
});

describe("computePolicyStance", () => {
  it("hand-computed: reformism-only and gosbank-only extremes", () => {
    // gosbank neutral at ca=bs=0.5 -> 0; 0.6*1 + 0.4*0 = 0.6
    expect(computePolicyStance(1, 0.5, 0.5)).toBeCloseTo(0.6, 10);
    expect(computePolicyStance(-1, 0.5, 0.5)).toBeCloseTo(-0.6, 10);
    // aggressive credit + soft budget -> gosbank = -1; 0.6*0 + 0.4*-1 = -0.4
    expect(computePolicyStance(0, 1, 1)).toBeCloseTo(-0.4, 10);
  });
});

describe("wageFundConstrainedGrowth", () => {
  it("hand-computed: only lowers wage growth above the cap, proportional to plannedShare", () => {
    // cap = 2 + WAGE_FUND_SLACK_PP(2) = 4
    expect(wageFundConstrainedGrowth(3, 2, 1)).toBe(3); // below cap: unchanged
    expect(wageFundConstrainedGrowth(10, 2, 1)).toBeCloseTo(4, 10); // full plan: pulled to the cap
    expect(wageFundConstrainedGrowth(10, 2, 0.5)).toBeCloseTo(7, 10); // half share: half the excess
  });
});

describe("governmentReformismFromEconomicPosition / internalRepressionFromReformism", () => {
  it("hand-computed", () => {
    expect(governmentReformismFromEconomicPosition(-5)).toBeCloseTo(-1, 10);
    expect(governmentReformismFromEconomicPosition(5)).toBeCloseTo(1, 10);
    expect(governmentReformismFromEconomicPosition(undefined)).toBeUndefined();
    expect(internalRepressionFromReformism(1)).toBeCloseTo(0, 10);
    expect(internalRepressionFromReformism(-1)).toBeCloseTo(1, 10);
    expect(internalRepressionFromReformism(undefined)).toBeCloseTo(0.5, 10);
  });
});
