import { describe, expect, it } from "vitest";
import { globeBackingSize } from "./CommandGlobe.js";

describe("CommandGlobe resolution", () => {
  it("uses a sharp high-density backing store and caps pathological ratios", () => {
    expect(globeBackingSize(580, 2)).toBe(1160);
    expect(globeBackingSize(580, 3)).toBe(1740);
    expect(globeBackingSize(580, 4)).toBe(1740);
  });
});
