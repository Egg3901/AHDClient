import { describe, expect, it } from "vitest";
import {
  ANNUAL_DEPRECIATION,
  CAPITAL_OUTPUT_RATIO_TARGET,
  advanceCapitalStock,
  investmentRate,
  seedCapitalStock,
} from "./capitalStock.js";

// Formula source: <mainline-checkout>/src/lib/metricEngine/capitalStock.ts
describe("investmentRate", () => {
  it("at the neutral rate, investment rate is exactly BASE_INVESTMENT_RATE", () => {
    expect(investmentRate(3, 3)).toBeCloseTo(0.2, 10);
  });
  it("cheaper money (below neutral) raises the rate", () => {
    expect(investmentRate(1, 3)).toBeCloseTo(0.24, 10);
  });
  it("tighter money (above neutral) lowers the rate", () => {
    expect(investmentRate(8, 3)).toBeCloseTo(0.1, 10);
  });
  it("clamps to [0.05, 0.4]", () => {
    expect(investmentRate(100, 3)).toBeCloseTo(0.05, 10);
    expect(investmentRate(-100, 3)).toBeCloseTo(0.4, 10);
  });
});

describe("seedCapitalStock", () => {
  it("K = CAPITAL_OUTPUT_RATIO_TARGET(3) × gdp", () => {
    expect(seedCapitalStock(1000)).toBeCloseTo(3000, 10);
    expect(CAPITAL_OUTPUT_RATIO_TARGET).toBe(3);
  });
  it("non-finite/non-positive gdp seeds 0", () => {
    expect(seedCapitalStock(-5)).toBe(0);
    expect(seedCapitalStock(NaN)).toBe(0);
  });
});

describe("advanceCapitalStock", () => {
  it("hand-computed: at exactly the steady-state K/Y ratio and the neutral rate, investment == depreciation (no net growth)", () => {
    // K=3000, Y=1000 -> K/Y=3=target. investmentRate(3,3)=0.2. investment=(0.2*1000)/48.
    // depreciation = (ANNUAL_DEPRECIATION/48)*3000 = ((0.2/3)/48)*3000 = (0.2*1000)/48. Identical.
    const step = advanceCapitalStock(3000, 1000, 3, 48, 0, 3);
    expect(step.investment).toBeCloseTo(step.depreciation, 10);
    expect(step.capital).toBeCloseTo(3000, 6);
    expect(step.annualizedGrowth).toBeCloseTo(0, 6);
    expect(ANNUAL_DEPRECIATION).toBeCloseTo(0.2 / 3, 10);
  });

  it("zero starting capital: no depreciation, growth read as 0 (k>0 guard)", () => {
    const step = advanceCapitalStock(0, 1000, 3, 48, 0, 3);
    expect(step.depreciation).toBe(0);
    expect(step.investment).toBeCloseTo((0.2 * 1000) / 48, 10);
    expect(step.annualizedGrowth).toBe(0);
  });

  it("PORT-STUB corpInvestmentPerTurn defaults to 0 (byte-identical without it)", () => {
    const a = advanceCapitalStock(3000, 1000, 3, 48, undefined, 3);
    const b = advanceCapitalStock(3000, 1000, 3, 48, 0, 3);
    expect(a).toEqual(b);
  });
});
