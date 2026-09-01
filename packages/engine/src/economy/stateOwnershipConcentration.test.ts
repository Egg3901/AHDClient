import { describe, expect, it } from "vitest";
import { clampConcentration, sociMultiplier } from "./stateOwnershipConcentration.js";

// Formula source: /root/projects/AHDGame/src/lib/nationalization/concentration.ts
describe("clampConcentration", () => {
  it("clamps to [0, 100] and NaN-guards", () => {
    expect(clampConcentration(150)).toBe(100);
    expect(clampConcentration(-10)).toBe(0);
    expect(clampConcentration(NaN)).toBe(0);
    expect(clampConcentration(50)).toBe(50);
  });
});

describe("sociMultiplier", () => {
  it("exactly 1.0 at and below the danger zone (35)", () => {
    expect(sociMultiplier(0)).toBe(1);
    expect(sociMultiplier(35)).toBe(1);
  });
  it("hand-computed: quadratic ramp above the danger zone", () => {
    // t = (67.5-35)/(100-35) = 0.5; 1 + (3.5-1)*0.25 = 1.625
    expect(sociMultiplier(67.5)).toBeCloseTo(1.625, 10);
    expect(sociMultiplier(100)).toBeCloseTo(3.5, 10);
  });
});
