import { describe, expect, it } from "vitest";
import { isCampaignEligibleElection } from "./isCampaignEligible.js";

describe("isCampaignEligibleElection (src/lib/campaigns/isCampaignEligible.ts port)", () => {
  it("US house/senate are eligible (the only race types solo currently spawns for this flag)", () => {
    expect(isCampaignEligibleElection({ countryId: "US", electionType: "house" })).toBe(true);
    expect(isCampaignEligibleElection({ countryId: "US", electionType: "senate" })).toBe(true);
  });

  it("US governor/stateSenate are eligible per the family set, even though solo doesn't spawn them yet", () => {
    expect(isCampaignEligibleElection({ countryId: "US", electionType: "governor" })).toBe(true);
    expect(isCampaignEligibleElection({ countryId: "US", electionType: "stateSenate" })).toBe(true);
  });

  it("non-US races are never eligible (Phase 5.5 D4 deferral)", () => {
    expect(isCampaignEligibleElection({ countryId: "UK", electionType: "commons" })).toBe(false);
    expect(isCampaignEligibleElection({ countryId: "RU", electionType: "supremeSovietDeputy" })).toBe(false);
    expect(isCampaignEligibleElection({ countryId: "DD", electionType: "volkskammerDeputy" })).toBe(false);
  });

  it("US president is eligible (W24: direct-election head of state, mirrors mainline's isDirectElection)", () => {
    expect(isCampaignEligibleElection({ countryId: "US", electionType: "president" })).toBe(true);
  });
});
