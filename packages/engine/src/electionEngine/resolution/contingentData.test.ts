import { describe, expect, it } from "vitest";
import { loadContingentElectionDataPlain } from "./contingentData.js";

describe("loadContingentElectionDataPlain", () => {
  it("captures a new chamber snapshot at the caller-supplied world time", () => {
    const capturedAt = new Date("1953-01-06T00:00:00Z");

    const result = loadContingentElectionDataPlain({
      countryId: "US",
      candidates: [],
      electoralVotesByCandidate: {},
      characters: [],
      npps: [],
      partyMap: new Map(),
      houseOfficials: [],
      senateOfficials: [],
      frozenChamber: null,
      capturedAt,
    });

    expect(result.chamberSnapshot?.capturedAt).toEqual(capturedAt);
  });
});
