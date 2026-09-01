import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { ensureCampaign } from "./lifecycle.js";
import { applyCampaignPartySubsidies, CAMPAIGN_PARTY_SUBSIDY_CAP_ANCHOR, CAMPAIGN_PARTY_SUBSIDY_RATE } from "./partySubsidy.js";

const OPTS = { seed: "subsidy-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("applyCampaignPartySubsidies (W26 new mechanic — the treasury sink)", () => {
  it("rate-bound: splits 5% of treasury evenly across the party's active NPP campaigns", () => {
    const w = createWorld(OPTS);
    w.parties["US_DEM"]!.treasury = 1_000_000;
    ensureCampaign(w, { electionId: "e1", candidateId: "US-1", candidateIsNPP: true, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });
    ensureCampaign(w, { electionId: "e2", candidateId: "US-2", candidateIsNPP: true, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });

    applyCampaignPartySubsidies(w);

    // perCampaignShare = 1_000_000 * 0.05 / 2 = 25_000; cap (house scalar 0.3) = 100_000*0.3 = 30_000 -> rate binds.
    expect(CAMPAIGN_PARTY_SUBSIDY_RATE).toBe(0.05);
    const c1 = w.campaigns["e1:US-1"]!;
    const c2 = w.campaigns["e2:US-2"]!;
    expect(c1.funds).toBe(25_000);
    expect(c2.funds).toBe(25_000);
    expect(w.parties["US_DEM"]!.treasury).toBe(1_000_000 - 50_000);
  });

  it("cap-bound: a flush treasury with one candidate is capped at the family-scaled anchor cap, not the full rate share", () => {
    const w = createWorld(OPTS);
    w.parties["US_DEM"]!.treasury = 10_000_000;
    ensureCampaign(w, { electionId: "e1", candidateId: "US-1", candidateIsNPP: true, partyId: "US_DEM", countryId: "US", electionType: "senate", turn: 0 });

    applyCampaignPartySubsidies(w);

    // rate share = 10_000_000*0.05 = 500_000; cap (senate scalar 0.5) = 100_000*0.5 = 50_000 -> cap binds.
    expect(CAMPAIGN_PARTY_SUBSIDY_CAP_ANCHOR).toBe(100_000);
    expect(w.campaigns["e1:US-1"]!.funds).toBe(50_000);
    expect(w.parties["US_DEM"]!.treasury).toBe(10_000_000 - 50_000);
  });

  it("never overdraws: a party with 0 treasury subsidizes nothing", () => {
    const w = createWorld(OPTS);
    w.parties["US_DEM"]!.treasury = 0;
    ensureCampaign(w, { electionId: "e1", candidateId: "US-1", candidateIsNPP: true, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });
    applyCampaignPartySubsidies(w);
    expect(w.campaigns["e1:US-1"]!.funds).toBe(0);
    expect(w.parties["US_DEM"]!.treasury).toBe(0);
  });

  it("skips player and archived campaigns", () => {
    const w = createWorld(OPTS);
    w.parties["US_DEM"]!.treasury = 1_000_000;
    ensureCampaign(w, { electionId: "e1", candidateId: "player", candidateIsNPP: false, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });
    ensureCampaign(w, { electionId: "e2", candidateId: "US-2", candidateIsNPP: true, partyId: "US_DEM", countryId: "US", electionType: "house", turn: 0 });
    w.campaigns["e2:US-2"]!.status = "archived";
    applyCampaignPartySubsidies(w);
    expect(w.campaigns["e1:player"]!.funds).toBe(0);
    expect(w.campaigns["e2:US-2"]!.funds).toBe(0);
    expect(w.parties["US_DEM"]!.treasury).toBe(1_000_000);
  });
});
