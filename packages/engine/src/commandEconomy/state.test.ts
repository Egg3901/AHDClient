import { describe, expect, it } from "vitest";
import {
  accumulateOverhang,
  blackMarketPremiumFrom,
  blackMarketPressure,
  shortageIndexFrom,
  updateSecondEconomy,
} from "./state.js";

// Formula source (all): /root/projects/AHDGame/src/lib/economy/commandEconomyState.ts
describe("accumulateOverhang", () => {
  it("hand-computed: wage growth outrunning goods growth accrues overhang", () => {
    // gap = 10 - 2 = 8; flow = (1 * 8) / 48 = 0.16667; result = 50*0.99 + 0.16667
    const result = accumulateOverhang(50, 10, 2, 1, 0, 0, 1);
    expect(result).toBeCloseTo(49.5 + 8 / 48, 10);
  });

  it("floors the gap at 0: goods growth exceeding wage growth does not create negative overhang", () => {
    const result = accumulateOverhang(50, 2, 5, 1, 0, 0, 1);
    expect(result).toBeCloseTo(50 * 0.99, 10);
  });
});

describe("shortageIndexFrom", () => {
  it("hand-computed: overhang contributes up to ~70, physical gap up to ~30", () => {
    expect(shortageIndexFrom(50, 0)).toBeCloseTo(35, 10);
    expect(shortageIndexFrom(100, 0)).toBeCloseTo(70, 10);
    expect(shortageIndexFrom(0, 500)).toBeCloseTo(30, 10); // gap clamped at 500
  });
});

describe("blackMarketPremiumFrom", () => {
  it("hand-computed: max shortage + overhang at zero tolerance hits the premium ceiling", () => {
    expect(blackMarketPremiumFrom(100, 100, 0)).toBeCloseTo(2.0, 10);
  });
  it("tolerance relieves up to 40% of the premium", () => {
    expect(blackMarketPremiumFrom(100, 100, 1)).toBeCloseTo(1.2, 10);
  });
});

describe("updateSecondEconomy", () => {
  it("hand-computed: full shortage + full tolerance drives the share toward its cap", () => {
    const { share, relief } = updateSecondEconomy(0, 100, 100, 1);
    // target = 1*(0.2+0.6) = 0.8, clamped to MAX_SECOND_ECONOMY_SHARE=0.6
    // share = 0 + (0.6-0)*0.25 = 0.15
    expect(share).toBeCloseTo(0.15, 10);
    // relief = 0.15 * 1 * 0.5 * 100 = 7.5
    expect(relief).toBeCloseTo(7.5, 10);
  });
});

describe("blackMarketPressure", () => {
  it("hand-computed: max inputs, no repression, sum to 1.0", () => {
    expect(blackMarketPressure(100, 2.0, 0.6, 0)).toBeCloseTo(1.0, 10);
  });
  it("full repression suppresses the premium/second-economy terms by 80%, leaving only shortage", () => {
    // 0.5*1 + (0.3*1 + 0.2*1) * (1 - 0.8*1) = 0.5 + 0.5*0.2 = 0.6
    expect(blackMarketPressure(100, 2.0, 0.6, 1)).toBeCloseTo(0.6, 10);
  });
});
