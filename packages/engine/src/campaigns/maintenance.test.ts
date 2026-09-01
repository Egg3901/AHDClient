import { describe, expect, it } from "vitest";
import { calculateMaintenanceCosts } from "./maintenance.js";

const off = { starter: false, a: 0, b: 0, c: 0 };

describe("calculateMaintenanceCosts (src/lib/campaigns/maintenance.ts port)", () => {
  it("all unstarted trees cost 0", () => {
    const campaign = {
      fundraisingTree: off,
      oppositionResearchTree: off,
      groundGameTree: off,
      mediaSpendingTree: off,
    };
    expect(calculateMaintenanceCosts(campaign, "president")).toBe(0);
  });

  it("sums maintenance across every started lever, scaled once each", () => {
    const campaign = {
      fundraisingTree: { starter: true, a: 0, b: 0, c: 1 }, // Direct Mail L1 maintenance 8_000, starter has none
      oppositionResearchTree: off, // no maintenance in this tree at all (verified: starter + a/b/c none carry maintenance)
      groundGameTree: { starter: true, a: 0, b: 0, c: 0 }, // starter 5_500
      mediaSpendingTree: { starter: true, a: 1, b: 0, c: 0 }, // starter 6_000 + Broadcast L1 14_000
    };
    const total = calculateMaintenanceCosts(campaign, "president");
    expect(total).toBe(8_000 + 5_500 + 6_000 + 14_000);
  });

  it("house scalar 0.3x applies to the aggregate per-category cost", () => {
    const campaign = {
      fundraisingTree: off,
      oppositionResearchTree: off,
      groundGameTree: { starter: true, a: 0, b: 0, c: 0 }, // 5_500
      mediaSpendingTree: off,
    };
    expect(calculateMaintenanceCosts(campaign, "house")).toBe(Math.round(5_500 * 0.3));
  });
});
