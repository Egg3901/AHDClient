import { describe, expect, it } from "vitest";
import { investCampaign } from "./npcInvestment.js";
import type { Campaign } from "../types.js";

function freshCampaign(overrides: Partial<Campaign> = {}): Campaign {
  const off = { starter: false, a: 0, b: 0, c: 0 };
  return {
    id: "e1:US-1",
    electionId: "e1",
    candidateId: "US-1",
    candidateIsNPP: true,
    partyId: "US_DEM",
    countryId: "US",
    electionType: "president",
    status: "active",
    funds: 0,
    actions: 0,
    fundraisingTree: { ...off },
    oppositionResearchTree: { ...off },
    groundGameTree: { ...off },
    mediaSpendingTree: { ...off },
    spendThisTurn: 0,
    totalFundsGenerated: 0,
    totalFundsSpent: 0,
    totalActionsGenerated: 0,
    totalActionsSpent: 0,
    createdAtTurn: 0,
    ...overrides,
  };
}

describe("investCampaign (W26 NPC investment AI — see file doc for why this is not a mainline port)", () => {
  it("no-op for player campaigns", () => {
    const c = freshCampaign({ candidateIsNPP: false, funds: 1_000_000, actions: 1_000 });
    investCampaign(c);
    expect(c.fundraisingTree.starter).toBe(false);
    expect(c.funds).toBe(1_000_000);
  });

  it("no-op for archived campaigns", () => {
    const c = freshCampaign({ status: "archived", funds: 1_000_000, actions: 1_000 });
    investCampaign(c);
    expect(c.funds).toBe(1_000_000);
  });

  it("no-op when nothing is affordable", () => {
    const c = freshCampaign({ funds: 100, actions: 100 });
    investCampaign(c);
    expect(c.fundraisingTree.starter).toBe(false);
    expect(c.mediaSpendingTree.starter).toBe(false);
    expect(c.funds).toBe(100);
  });

  it("hand-computed: 200k funds / 100 actions buys fundraising starter, mediaSpending starter, then Television (b), in cheapest-first order", () => {
    const c = freshCampaign({ funds: 200_000, actions: 100 });
    investCampaign(c);

    // Step 1: fundraising starter (50_000/10) < mediaSpending starter (60_000/12) -> buy fundraising starter.
    // Step 2: cheapest remaining is mediaSpending starter (60_000/12) -> buy it.
    // Step 3: cheapest remaining is mediaSpending Television/b L1 (80_000/12) -> buy it.
    // Step 4: cheapest remaining (mediaSpending Rapid Response/c L1, 100_000) exceeds the 10_000 left -> stop.
    expect(c.fundraisingTree).toEqual({ starter: true, a: 0, b: 0, c: 0 });
    expect(c.mediaSpendingTree).toEqual({ starter: true, a: 0, b: 1, c: 0 });
    expect(c.oppositionResearchTree.starter).toBe(false); // never auto-invested (see file doc)
    expect(c.groundGameTree.starter).toBe(false); // never auto-invested (see file doc)

    const fundsSpent = 50_000 + 60_000 + 80_000;
    const actionsSpent = 10 + 12 + 12;
    expect(c.funds).toBe(200_000 - fundsSpent);
    expect(c.actions).toBe(100 - actionsSpent);
    expect(c.totalFundsSpent).toBe(fundsSpent);
    expect(c.totalActionsSpent).toBe(actionsSpent);
    expect(c.spendThisTurn).toBe(fundsSpent);
  });

  it("Bundlers (fundraising b) lump-sum credits funds immediately, funding further purchases the same turn", () => {
    // mediaSpending pre-maxed (no purchasable steps left there) isolates fundraising-branch
    // ordering: starter (50k) -> Bundlers/b L1 (120k, +250k lump, cheaper than a/c) -> the lump
    // refunds the campaign, which then affords Grassroots/a L1 (150k).
    const c = freshCampaign({
      funds: 170_000,
      actions: 100,
      mediaSpendingTree: { starter: true, a: 3, b: 3, c: 3 },
    });
    investCampaign(c);
    expect(c.fundraisingTree.starter).toBe(true);
    expect(c.fundraisingTree.b).toBe(1);
    expect(c.fundraisingTree.a).toBe(1);
    // net funds: -50k (starter) -120k (Bundlers) +250k (lump) -150k (Grassroots) = -70k off 170k -> 100k.
    expect(c.totalFundsGenerated).toBeGreaterThanOrEqual(250_000);
    expect(c.funds).toBe(170_000 - 50_000 - 120_000 + 250_000 - 150_000);
  });

  it("respects the action-pool budget independently of funds", () => {
    // Plenty of funds, only 5 actions — starter (10 actions) is unaffordable.
    const c = freshCampaign({ funds: 10_000_000, actions: 5 });
    investCampaign(c);
    expect(c.fundraisingTree.starter).toBe(false);
    expect(c.mediaSpendingTree.starter).toBe(false);
    expect(c.funds).toBe(10_000_000);
  });
});
