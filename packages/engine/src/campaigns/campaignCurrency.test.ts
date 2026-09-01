import { describe, expect, it } from "vitest";
import { campaignAnchorToLocal, campaignLocalRate, campaignLocalToAnchor } from "./campaignCurrency.js";

describe("campaignCurrency (src/lib/campaigns/campaignCurrency.ts port, frozen INITIAL_RATES)", () => {
  it("US rate is 1.0 parity", () => {
    expect(campaignLocalRate("US")).toBe(1.0);
    expect(campaignAnchorToLocal(100_000, "US")).toBe(100_000);
  });

  it("UK rate 0.75, RU/DD rate 2.22 (verbatim mainline INITIAL_RATES)", () => {
    expect(campaignLocalRate("UK")).toBe(0.75);
    expect(campaignAnchorToLocal(100_000, "UK")).toBe(75_000);
    expect(campaignLocalRate("RU")).toBe(2.22);
    expect(campaignAnchorToLocal(100_000, "RU")).toBe(Math.round(100_000 * 2.22));
  });

  it("unmapped country falls back to 1.0 parity", () => {
    expect(campaignLocalRate("ZZ")).toBe(1.0);
  });

  it("local -> anchor round-trips through the same frozen rate", () => {
    const anchor = 55_000;
    const local = campaignAnchorToLocal(anchor, "UK");
    expect(campaignLocalToAnchor(local, "UK")).toBeCloseTo(anchor, 6);
  });
});
