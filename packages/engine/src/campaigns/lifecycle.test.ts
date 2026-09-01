import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { archiveCampaign, archiveCampaignsForElection, campaignKey, ensureCampaign, ensureCampaignsForElection } from "./lifecycle.js";

const OPTS = { seed: "campaign-lifecycle", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("campaign lifecycle (src/lib/campaigns/createInitialCampaign.ts port)", () => {
  it("ensureCampaign creates a fresh unstarted campaign", () => {
    const w = createWorld(OPTS);
    ensureCampaign(w, {
      electionId: "house:US:CA-1:c1",
      candidateId: "US-1",
      candidateIsNPP: true,
      partyId: "US_DEM",
      countryId: "US",
      electionType: "house",
      turn: 5,
    });
    const key = campaignKey("house:US:CA-1:c1", "US-1");
    const c = w.campaigns[key]!;
    expect(c.status).toBe("active");
    expect(c.funds).toBe(0);
    expect(c.fundraisingTree).toEqual({ starter: false, a: 0, b: 0, c: 0 });
    expect(c.createdAtTurn).toBe(5);
  });

  it("ensureCampaign is idempotent and reactivates an archived campaign without resetting state", () => {
    const w = createWorld(OPTS);
    const args = {
      electionId: "e1",
      candidateId: "US-1",
      candidateIsNPP: true,
      partyId: "US_DEM",
      countryId: "US",
      electionType: "house",
      turn: 0,
    };
    ensureCampaign(w, args);
    const c = w.campaigns[campaignKey("e1", "US-1")]!;
    c.funds = 12_345;
    c.status = "archived";
    ensureCampaign(w, args);
    expect(c.status).toBe("active");
    expect(c.funds).toBe(12_345); // reactivation preserves state, not a reset
  });

  it("ensureCampaignsForElection is a no-op for non-eligible races", () => {
    const w = createWorld(OPTS);
    ensureCampaignsForElection(w, {
      id: "commons:UK:-:c1",
      countryId: "UK",
      electionType: "commons",
      candidates: [{ id: "UK-1", partyId: "UK_LAB", isNPP: true }],
    });
    expect(Object.keys(w.campaigns)).toHaveLength(0);
  });

  it("ensureCampaignsForElection creates one campaign per candidate for eligible races", () => {
    const w = createWorld(OPTS);
    ensureCampaignsForElection(w, {
      id: "house:US:CA-1:c1",
      countryId: "US",
      electionType: "house",
      candidates: [
        { id: "US-1", partyId: "US_DEM", isNPP: true },
        { id: "US-2", partyId: "US_REP", isNPP: true },
      ],
    });
    expect(Object.keys(w.campaigns)).toHaveLength(2);
  });

  it("archiveCampaignsForElection archives every campaign for that election, leaves others untouched", () => {
    const w = createWorld(OPTS);
    ensureCampaign(w, { electionId: "e1", candidateId: "US-1", candidateIsNPP: true, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });
    ensureCampaign(w, { electionId: "e2", candidateId: "US-2", candidateIsNPP: true, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });
    archiveCampaignsForElection(w, "e1");
    expect(w.campaigns[campaignKey("e1", "US-1")]!.status).toBe("archived");
    expect(w.campaigns[campaignKey("e2", "US-2")]!.status).toBe("active");
  });

  it("archiveCampaign archives a single candidate's campaign", () => {
    const w = createWorld(OPTS);
    ensureCampaign(w, { electionId: "e1", candidateId: "player", candidateIsNPP: false, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });
    archiveCampaign(w, "e1", "player");
    expect(w.campaigns[campaignKey("e1", "player")]!.status).toBe("archived");
  });
});
