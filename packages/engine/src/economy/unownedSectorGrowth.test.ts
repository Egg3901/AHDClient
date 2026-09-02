import { describe, expect, it } from "vitest";
import { growUnownedSectorRevenue } from "./unownedSectorGrowth.js";

// Formula source: <mainline-checkout>/src/lib/turn/unownedSectorGrowth.ts (pre-plants branch)
describe("growUnownedSectorRevenue", () => {
  it("hand-computed: grows at HALF the paired corp's growth rate", () => {
    // annualRate = 10*0.5 = 5; perTurnRate = 5/48; new = round(1000*(1+ (5/48)/100))
    const result = growUnownedSectorRevenue(1000, 10, 48);
    expect(result).toBe(Math.round(1000 * (1 + 5 / 48 / 100)));
  });

  it("floors the effective rate at 0: a downsizing corp slows growth, never reverses it", () => {
    const result = growUnownedSectorRevenue(1000, -4, 48);
    expect(result).toBe(1000);
  });

  it("falls back to the 1%/yr FALLBACK_GROWTH_RATE when there is no paired corp", () => {
    const result = growUnownedSectorRevenue(1000, undefined, 48);
    expect(result).toBe(Math.round(1000 * (1 + 1 / 48 / 100)));
  });

  it("floors revenue at 0 and NaN-guards", () => {
    expect(growUnownedSectorRevenue(NaN, 10, 48)).toBe(0);
    expect(growUnownedSectorRevenue(-50, 10, 48)).toBe(0);
  });
});
