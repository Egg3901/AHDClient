import { describe, expect, it } from "vitest";
import { calculateCampaignIncome } from "./income.js";

const tree = (starter: boolean, a = 0, b = 0, c = 0) => ({ starter, a, b, c });

describe("calculateCampaignIncome (src/lib/campaigns/income.ts port)", () => {
  it("unstarted tree earns the $20k base, scaled by family", () => {
    expect(calculateCampaignIncome({ fundraisingTree: tree(false) }, "president")).toBe(20_000);
    expect(calculateCampaignIncome({ fundraisingTree: tree(false) }, "house")).toBe(6_000); // 20_000 * 0.3
    expect(calculateCampaignIncome({ fundraisingTree: tree(false) }, undefined)).toBe(20_000);
  });

  it("started tree: (starter + Grassroots) * (1 + Direct Mail), president scale", () => {
    // starter 35_000 + Grassroots(a) L2 700_000 = 735_000; Direct Mail(c) L1 +15% -> *1.15
    const income = calculateCampaignIncome({ fundraisingTree: tree(true, 2, 0, 1) }, "president");
    expect(income).toBe(Math.round((35_000 + 700_000) * 1.15));
  });

  it("started tree with no branches: just the starter base", () => {
    expect(calculateCampaignIncome({ fundraisingTree: tree(true) }, "president")).toBe(35_000);
    // senate scalar 0.5
    expect(calculateCampaignIncome({ fundraisingTree: tree(true) }, "senate")).toBe(17_500);
  });
});
