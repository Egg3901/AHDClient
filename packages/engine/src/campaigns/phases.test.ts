import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { campaignSpendResetPhase, campaignTurnPhase } from "./phases.js";
import { rngFromState } from "../rng.js";
import { calculateMaintenanceCosts } from "./maintenance.js";

const OPTS = { seed: "campaign-phase-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("campaignTurnPhase (src/lib/turn/campaignTurn.ts port — see phases.ts file doc for scope)", () => {
  it("hand-computed: house-scale campaign with mediaSpending started nets to zero funds, gains actions, boosts support", () => {
    const w = createWorld(OPTS);
    const pol = w.politicians[0]!;
    w.campaigns["e1:" + pol.id] = {
      id: "e1:" + pol.id,
      electionId: "e1",
      candidateId: pol.id,
      candidateIsNPP: true,
      partyId: pol.partyId,
      countryId: "US",
      electionType: "house",
      status: "active",
      funds: 0,
      actions: 0,
      fundraisingTree: { starter: false, a: 0, b: 0, c: 0 },
      oppositionResearchTree: { starter: false, a: 0, b: 0, c: 0 },
      groundGameTree: { starter: false, a: 0, b: 0, c: 0 },
      mediaSpendingTree: { starter: true, a: 1, b: 0, c: 0 },
      spendThisTurn: 0,
      totalFundsGenerated: 0,
      totalFundsSpent: 0,
      totalActionsGenerated: 0,
      totalActionsSpent: 0,
      createdAtTurn: 0,
    };
    const supportBefore = w.candidateSupports[pol.id]!.support;
    expect(supportBefore).toBe(50);

    const rng = rngFromState(w.meta.rng);
    campaignTurnPhase.run(w, rng);

    const c = w.campaigns["e1:" + pol.id]!;
    // income: unstarted fundraising -> 20_000 * house(0.3) = 6_000 anchor == local (US rate 1.0).
    // maintenance: mediaSpending starter 6_000 + Broadcast(a) L1 14_000 = 20_000 * 0.3 = 6_000.
    // projected (funds 0 + income 6_000 anchor) == maintenance 6_000 -> solvent, no downgrade.
    expect(c.funds).toBe(0); // 6_000 income - 6_000 maintenance
    expect(c.totalFundsGenerated).toBe(6_000);
    expect(c.totalFundsSpent).toBe(6_000);
    expect(c.spendThisTurn).toBe(6_000);
    // NPP baseline campaign actions = 2, no endorsements.
    expect(c.actions).toBe(2);
    expect(c.totalActionsGenerated).toBe(2);
    // media fav: starter 0.5 + Broadcast L1 0.5 = 1.0; no matching election record -> season multiplier 1x.
    expect(w.candidateSupports[pol.id]!.support).toBeCloseTo(51.0, 10);
  });

  it("insolvent campaign auto-downgrades instead of going negative", () => {
    const w = createWorld(OPTS);
    const pol = w.politicians[1]!;
    w.campaigns["e2:" + pol.id] = {
      id: "e2:" + pol.id,
      electionId: "e2",
      candidateId: pol.id,
      candidateIsNPP: true,
      partyId: pol.partyId,
      countryId: "US",
      electionType: "president", // scalar 1.0 to make the insolvency stark
      status: "active",
      funds: 0,
      actions: 0,
      fundraisingTree: { starter: false, a: 0, b: 0, c: 0 },
      oppositionResearchTree: { starter: false, a: 0, b: 0, c: 0 },
      groundGameTree: { starter: false, a: 0, b: 0, c: 0 },
      mediaSpendingTree: { starter: true, a: 3, b: 3, c: 3 }, // maxed — huge maintenance, income only $20k
      spendThisTurn: 0,
      totalFundsGenerated: 0,
      totalFundsSpent: 0,
      totalActionsGenerated: 0,
      totalActionsSpent: 0,
      createdAtTurn: 0,
    };
    const rng = rngFromState(w.meta.rng);
    campaignTurnPhase.run(w, rng);
    const c = w.campaigns["e2:" + pol.id]!;
    expect(c.funds).toBeGreaterThanOrEqual(0);
    // Maxed mediaSpending (maintenance 231_000 at president scale) cannot
    // possibly stay solvent against $20k/turn income — autoDowngrade must
    // shed branch tiers (exact stepwise trace is covered by
    // autoDowngrade.test.ts) until maintenance <= projected funds. Assert
    // the invariant it guarantees rather than re-deriving the exact greedy
    // trace here: real downgrades happened, and the campaign is solvent.
    expect(c.mediaSpendingTree.a + c.mediaSpendingTree.b + c.mediaSpendingTree.c).toBeLessThan(9); // was 3+3+3=9
    expect(calculateMaintenanceCosts(c, "president")).toBeLessThanOrEqual(20_000);
  });
});

describe("campaignSpendResetPhase (src/lib/turn/elections/campaignSpendReset.ts port)", () => {
  it("zeroes spendThisTurn on every campaign", () => {
    const w = createWorld(OPTS);
    w.campaigns["e1:X"] = {
      id: "e1:X",
      electionId: "e1",
      candidateId: "X",
      candidateIsNPP: true,
      partyId: "US_DEM",
      countryId: "US",
      electionType: "house",
      status: "active",
      funds: 0,
      actions: 0,
      fundraisingTree: { starter: false, a: 0, b: 0, c: 0 },
      oppositionResearchTree: { starter: false, a: 0, b: 0, c: 0 },
      groundGameTree: { starter: false, a: 0, b: 0, c: 0 },
      mediaSpendingTree: { starter: false, a: 0, b: 0, c: 0 },
      spendThisTurn: 12_345,
      totalFundsGenerated: 0,
      totalFundsSpent: 0,
      totalActionsGenerated: 0,
      totalActionsSpent: 0,
      createdAtTurn: 0,
    };
    const rng = rngFromState(w.meta.rng);
    campaignSpendResetPhase.run(w, rng);
    expect(w.campaigns["e1:X"]!.spendThisTurn).toBe(0);
  });
});
