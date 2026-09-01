import { describe, expect, it } from "vitest";
import {
  getCampaignFamilyScalar,
  getOpsBranchMagnitude,
  getTreeMaintenanceCost,
  getEffectiveBranchCost,
  OPS_TREES,
} from "./upgradeCosts.js";

describe("upgradeCosts (src/lib/campaigns/upgradeCosts.ts port)", () => {
  it("family scalars match mainline CAMPAIGN_FAMILY_SCALAR_BY_ELECTION_TYPE", () => {
    expect(getCampaignFamilyScalar("president")).toBe(1.0);
    expect(getCampaignFamilyScalar("senate")).toBe(0.5);
    expect(getCampaignFamilyScalar("house")).toBe(0.3);
    expect(getCampaignFamilyScalar(undefined)).toBe(1.0);
    expect(getCampaignFamilyScalar("unknownType")).toBe(1.0);
  });

  it("getOpsBranchMagnitude reads cumulative tier magnitude, 0 below level 1", () => {
    // fundraising branch a (Grassroots): L1=200_000, L2=700_000, L3=1_800_000
    expect(getOpsBranchMagnitude("fundraising", "a", 0)).toBe(0);
    expect(getOpsBranchMagnitude("fundraising", "a", 1)).toBe(200_000);
    expect(getOpsBranchMagnitude("fundraising", "a", 3)).toBe(1_800_000);
  });

  it("getTreeMaintenanceCost: unstarted tree costs 0", () => {
    expect(getTreeMaintenanceCost("mediaSpending", { starter: false, a: 0, b: 0, c: 0 }, "president")).toBe(0);
  });

  it("getTreeMaintenanceCost: starter + branches sum, scaled by family; volunteer corps reduces groundGame upkeep", () => {
    // groundGame starter maintenance 5_500 + Field Offices(a) L1 12_000 = 17_500 at president scalar 1.0
    const noReduction = getTreeMaintenanceCost("groundGame", { starter: true, a: 1, b: 0, c: 0 }, "president");
    expect(noReduction).toBe(5_500 + 12_000);
    // Volunteer Corps (c) L2 = -30% reduction: (5_500+12_000)*(1-0.3) = 12_250
    const withReduction = getTreeMaintenanceCost("groundGame", { starter: true, a: 1, b: 0, c: 2 }, "president");
    expect(withReduction).toBe(Math.round((5_500 + 12_000) * 0.7));
    // Senate scalar 0.5x applied after reduction: round(12_250 * 0.5) = 6_125
    const senateScaled = getTreeMaintenanceCost("groundGame", { starter: true, a: 1, b: 0, c: 2 }, "senate");
    expect(senateScaled).toBe(Math.round((5_500 + 12_000) * 0.7 * 0.5));
  });

  it("getEffectiveBranchCost: starter cost scaled by family, no general-phase surcharge (unwired this wave)", () => {
    const cost = getEffectiveBranchCost("fundraising", null, 0, "house");
    // starter funds 50_000 * house scalar 0.3 = 15_000
    expect(cost?.funds).toBe(15_000);
    expect(cost?.actions).toBe(10);
    expect(cost?.effect).toBe(OPS_TREES.fundraising.starter.effect);
    expect(cost?.maintenance).toBeUndefined();
  });

  it("getEffectiveBranchCost: branch tier includes maintenance + lumpSum when present", () => {
    // fundraising branch c (Direct Mail) L1: funds 200_000, maintenance 8_000, at president scalar
    const cost = getEffectiveBranchCost("fundraising", "c", 1, "president");
    expect(cost?.funds).toBe(200_000);
    expect(cost?.actions).toBe(16);
    expect(cost?.maintenance).toBe(8_000);
    // Bundlers (b) L1: lumpSum 250_000, no maintenance
    const bundlers = getEffectiveBranchCost("fundraising", "b", 1, "president");
    expect(bundlers?.lumpSum).toBe(250_000);
    expect(bundlers?.maintenance).toBeUndefined();
  });

  it("getEffectiveBranchCost returns null past max tier", () => {
    expect(getEffectiveBranchCost("fundraising", "a", 4, "president")).toBeNull();
  });
});
