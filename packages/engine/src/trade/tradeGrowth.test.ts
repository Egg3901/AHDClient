import { describe, expect, it } from "vitest";
import { advanceTradeGrowth, computeTradeGrowthTarget } from "./tradeGrowth.js";

// Formula source: /root/projects/AHDGame/src/lib/metricEngine/registry/economic.ts tradeGrowthNode
describe("computeTradeGrowthTarget", () => {
  it("neutral inputs return WORLD_TRADE_BASELINE", () => {
    expect(
      computeTradeGrowthTarget({ tariffPct: 0, foreignCorporateTaxPct: 0, blocMember: false, forexStrength: 0 }),
    ).toBeCloseTo(2.5, 10);
  });
  it("tariff wedge: -0.15pp per 1% tariff", () => {
    expect(
      computeTradeGrowthTarget({ tariffPct: 10, foreignCorporateTaxPct: 0, blocMember: false, forexStrength: 0 }),
    ).toBeCloseTo(2.5 - 1.5, 10);
  });
  it("foreign-tax wedge: -0.03pp per 1% foreign corporate tax", () => {
    expect(
      computeTradeGrowthTarget({ tariffPct: 0, foreignCorporateTaxPct: 20, blocMember: false, forexStrength: 0 }),
    ).toBeCloseTo(2.5 - 0.6, 10);
  });
  it("bloc-member bonus: +1.0pp flat", () => {
    expect(
      computeTradeGrowthTarget({ tariffPct: 0, foreignCorporateTaxPct: 0, blocMember: true, forexStrength: 0 }),
    ).toBeCloseTo(3.5, 10);
  });
  it("forex competitiveness: +2.0pp per unit of weakness", () => {
    expect(
      computeTradeGrowthTarget({ tariffPct: 0, foreignCorporateTaxPct: 0, blocMember: false, forexStrength: 0.1 }),
    ).toBeCloseTo(2.7, 10);
  });
  it("terms combine additively", () => {
    expect(
      computeTradeGrowthTarget({ tariffPct: 10, foreignCorporateTaxPct: 0, blocMember: true, forexStrength: 0 }),
    ).toBeCloseTo(2.0, 10);
  });
});

describe("advanceTradeGrowth", () => {
  it("inertia EMA: 0.6 prev + 0.4 target", () => {
    expect(advanceTradeGrowth(0, 10)).toBeCloseTo(4.0, 10);
  });
  it("no-op at a settled value", () => {
    expect(advanceTradeGrowth(2.5, 2.5)).toBeCloseTo(2.5, 10);
  });
  it("clamps to [-30, 30]", () => {
    expect(advanceTradeGrowth(-1000, 0)).toBe(-30);
    expect(advanceTradeGrowth(1000, 0)).toBe(30);
  });
});
