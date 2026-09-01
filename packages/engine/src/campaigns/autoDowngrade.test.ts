import { describe, expect, it } from "vitest";
import { computeAutoDowngrade } from "./autoDowngrade.js";

const off = { starter: false, a: 0, b: 0, c: 0 };

describe("computeAutoDowngrade (src/lib/campaigns/autoDowngrade.ts port)", () => {
  it("solvent campaign: no downgrades, maintenance unchanged", () => {
    const campaign = {
      fundraisingTree: off,
      oppositionResearchTree: off,
      groundGameTree: { starter: true, a: 0, b: 0, c: 0 }, // 5_500
      mediaSpendingTree: off,
    };
    const result = computeAutoDowngrade(campaign, { funds: 100_000, income: 0, electionType: "president" });
    expect(result.downgrades).toEqual([]);
    expect(result.newMaintenance).toBe(5_500);
    expect(result.patches).toEqual({});
  });

  it("insolvent campaign: sheds highest-upkeep branch first, then the whole lever", () => {
    // maintenance: mediaSpending starter 6_000 + Broadcast(a) L1 14_000 = 20_000; groundGame starter 5_500. Total 25_500.
    const campaign = {
      fundraisingTree: off,
      oppositionResearchTree: off,
      groundGameTree: { starter: true, a: 0, b: 0, c: 0 },
      mediaSpendingTree: { starter: true, a: 1, b: 0, c: 0 },
    };
    // projected funds+income = 10_000 < 25_500: must downgrade.
    const result = computeAutoDowngrade(campaign, { funds: 10_000, income: 0, electionType: "president" });
    // Step 1: drop mediaSpending branch a (saves 14_000, biggest single delta) -> maintenance 11_500, still insolvent.
    // Step 2: shed mediaSpending lever entirely (saves 6_000 > groundGame's 5_500) -> maintenance 5_500, solvent.
    expect(result.newMaintenance).toBe(5_500);
    expect(result.downgrades).toEqual([
      { category: "mediaSpending", branch: "a", fromLevel: 1, toLevel: 0 },
      { category: "mediaSpending", fromLevel: 1, toLevel: 0 },
    ]);
    expect(result.patches.mediaSpending).toEqual({ starter: false, a: 0, b: 0, c: 0 });
    expect(result.patches.groundGame).toBeUndefined();
  });

  it("terminates even when every lever is shed (guard against infinite loop)", () => {
    const campaign = {
      fundraisingTree: { starter: true, a: 0, b: 0, c: 3 }, // Direct Mail L3 maintenance 40_000
      oppositionResearchTree: off,
      groundGameTree: { starter: true, a: 3, b: 3, c: 0 },
      mediaSpendingTree: { starter: true, a: 3, b: 3, c: 3 },
    };
    const result = computeAutoDowngrade(campaign, { funds: 0, income: 0, electionType: "president" });
    expect(result.newMaintenance).toBe(0);
  });
});
