// @ts-nocheck
/**
 * Unit tests for enrichCandidates (pure candidate enrichment).
 *
 * Ported from `src/lib/electionEngine/candidateEnrichment.test.ts`.
 * Mainline mapping: DB reads (characters, npps, politicalParties, endorsements,
 * countryState) are replaced with plain input interfaces (`CandidateInput`,
 * `CharacterInput`, `NPPInput`, `PartyInput`, `EndorsementCountInput`,
 * `RegimeInputs`). Field names match the Mongo documents they mirror.
 * The following sections document PORT-STUB neutral shapes:
 *   - Missing character/NPP → safe defaults (0, 50, 10, 0)
 *   - Missing party abbreviation → partyAbbr undefined
 *   - Missing endorsement counts → favorability unchanged
 *   - No regimeInputs → regimeMult 1.0 (non-OPS neutral)
 *   - Empty candidates list → empty array (no side effects)
 */

import { describe, it, expect } from "vitest";
import { enrichCandidates } from "./candidateEnrichment.js";
import type { CandidateInput } from "./candidateEnrichment.js";

// Helpers

function makePlayerCandidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    _id: "cand-player-" + Math.random().toString(36).slice(2, 6),
    electionId: "elec-1",
    characterId: "char-player",
    characterName: "Alice Player",
    party: "1",
    isNPP: false,
    ...overrides,
  };
}

function makeNPPCandidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    _id: "cand-npp-" + Math.random().toString(36).slice(2, 6),
    electionId: "elec-1",
    characterId: "char-npp",
    characterName: "Bob NPP",
    party: "2",
    isNPP: true,
    nppId: "npp-1",
    ...overrides,
  };
}

describe("enrichCandidates — empty list", () => {
  it("returns empty array when candidates is empty", () => {
    expect(enrichCandidates([])).toEqual([]);
  });
});

describe("enrichCandidates — player character", () => {
  it("maps character fields onto enriched candidate with clamping", () => {
    const candidate = makePlayerCandidate({ _id: "c1", characterId: "char-1", party: "1" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [
        {
          _id: "char-1",
          policies: { economic: 3, social: -2 },
          favorability: 165,
          politicalInfluence: 120,
          nationalInfluence: 80,
          archetypeApprovals: { liberal: 10 },
        },
      ],
      parties: [{ sequentialId: 1, economicPosition: -3, socialPosition: -1, abbreviation: "DEM" }],
    });
    expect(enriched!.candidateId).toBe("c1");
    expect(enriched!.characterId).toBe("char-1");
    expect(enriched!.charEP).toBe(3);
    expect(enriched!.charSP).toBe(-2);
    expect(enriched!.favorability).toBe(100);
    expect(enriched!.politicalInfluence).toBe(100);
    expect(enriched!.nationalInfluence).toBe(80);
    expect(enriched!.archetypeApprovals).toEqual({ liberal: 10 });
  });

  it("defaults nationalInfluence to 0 when character lacks the field", () => {
    const candidate = makePlayerCandidate({ characterId: "char-2" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [
        {
          _id: "char-2",
          policies: { economic: 0, social: 0 },
          favorability: 50,
          politicalInfluence: 50,
        },
      ],
    });
    expect(enriched!.nationalInfluence).toBe(0);
  });

  it("uses safe defaults when character record is not found", () => {
    const candidate = makePlayerCandidate({ characterId: "missing" });
    const [enriched] = enrichCandidates([candidate], { characters: [] });
    expect(enriched!.charEP).toBe(0);
    expect(enriched!.charSP).toBe(0);
    expect(enriched!.favorability).toBe(50);
    expect(enriched!.politicalInfluence).toBe(10);
    expect(enriched!.nationalInfluence).toBe(0);
    expect(enriched!.archetypeApprovals).toBeUndefined();
  });

  it("adds a small direct favorability bump from endorsements", () => {
    const candidate = makePlayerCandidate({ electionId: "elec-9", characterId: "char-9" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [
        { _id: "char-9", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 40, nationalInfluence: 25 },
      ],
      endorsementCounts: [
        { electionId: "elec-9", candidateId: "char-9", count: 2 },
      ],
    });
    expect(enriched!.favorability).toBe(54); // 50 + 2*2 = 54 (cap 10)
  });

  it("caps endorsement favorability boost at 10", () => {
    const candidate = makePlayerCandidate({ electionId: "e1", characterId: "c1" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "c1", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 40 }],
      endorsementCounts: [{ electionId: "e1", candidateId: "c1", count: 10 }],
    });
    expect(enriched!.favorability).toBe(60); // 50 + 10 cap
  });
});

describe("enrichCandidates — NPP candidate", () => {
  it("maps NPP fields onto enriched candidate", () => {
    const candidate = makeNPPCandidate({ _id: "c1", nppId: "npp-1", party: "2" });
    const [enriched] = enrichCandidates([candidate], {
      npps: [{ _id: "npp-1", policies: { economic: -4, social: 5 }, favorability: 142, politicalInfluence: 190 }],
    });
    expect(enriched!.isNPP).toBe(true);
    expect(enriched!.charEP).toBe(-4);
    expect(enriched!.charSP).toBe(5);
    expect(enriched!.favorability).toBe(100);
    expect(enriched!.politicalInfluence).toBe(100);
    expect(enriched!.nationalInfluence).toBe(100); // proxied
  });

  it("uses safe defaults when NPP record is not found", () => {
    const candidate = makeNPPCandidate({ nppId: "missing" });
    const [enriched] = enrichCandidates([candidate], { npps: [] });
    expect(enriched!.charEP).toBe(0);
    expect(enriched!.favorability).toBe(50);
    expect(enriched!.politicalInfluence).toBe(10);
    expect(enriched!.nationalInfluence).toBe(0);
  });

  it("treats isNPP candidate without nppId like a missing NPP", () => {
    const candidate = makeNPPCandidate({ nppId: undefined as unknown as string });
    const [enriched] = enrichCandidates([candidate], { npps: [] });
    expect(enriched!.isNPP).toBe(true);
    expect(enriched!.favorability).toBe(50);
  });
});

describe("enrichCandidates — party positions", () => {
  it("does NOT include party positions by default", () => {
    const candidate = makePlayerCandidate({ characterId: "char-1", party: "1" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "char-1", policies: { economic: 1, social: 1 }, favorability: 50, politicalInfluence: 50 }],
      parties: [{ sequentialId: 1, economicPosition: -3, socialPosition: -1 }],
    });
    expect(enriched!.partyEcon).toBeUndefined();
    expect(enriched!.partySocial).toBeUndefined();
  });

  it("includes partyEcon and partySocial when includePartyPositions is true", () => {
    const candidate = makePlayerCandidate({ characterId: "char-1", party: "1" });
    const [enriched] = enrichCandidates([candidate], {
      includePartyPositions: true,
      characters: [{ _id: "char-1", policies: { economic: 1, social: 1 }, favorability: 50, politicalInfluence: 50 }],
      parties: [{ sequentialId: 1, economicPosition: -3, socialPosition: -1 }],
    });
    expect(enriched!.partyEcon).toBe(-3);
    expect(enriched!.partySocial).toBe(-1);
  });

  it("leaves partyEcon absent when party not found", () => {
    const candidate = makePlayerCandidate({ characterId: "char-1", party: "999" });
    const [enriched] = enrichCandidates([candidate], {
      includePartyPositions: true,
      characters: [{ _id: "char-1", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 50 }],
      parties: [{ sequentialId: 1, economicPosition: -2, socialPosition: 0 }],
    });
    expect(enriched!.partyEcon).toBeUndefined();
  });
});

describe("enrichCandidates — mixed player and NPP", () => {
  it("enriches both player and NPP candidates in a single call, preserving order", () => {
    const playerCandidate = makePlayerCandidate({ _id: "p1", characterId: "char-1", party: "1" });
    const nppCandidate = makeNPPCandidate({ _id: "n1", nppId: "npp-1", party: "2" });
    const results = enrichCandidates([playerCandidate, nppCandidate], {
      characters: [{ _id: "char-1", policies: { economic: 2, social: -1 }, favorability: 55, politicalInfluence: 100, nationalInfluence: 70 }],
      npps: [{ _id: "npp-1", policies: { economic: -5, social: 4 }, favorability: 38, politicalInfluence: 60 }],
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.candidateId).toBe("p1");
    expect(results[0]!.isNPP).toBe(false);
    expect(results[0]!.charEP).toBe(2);
    expect(results[0]!.nationalInfluence).toBe(70);
    expect(results[1]!.candidateId).toBe("n1");
    expect(results[1]!.isNPP).toBe(true);
    expect(results[1]!.charEP).toBe(-5);
    expect(results[1]!.nationalInfluence).toBe(60);
  });
});

describe("enrichCandidates — regime multiplier (PORT-STUB neutral shape)", () => {
  it("attaches ruling multiplier for OPS ruling-party candidate", () => {
    const candidate = makePlayerCandidate({ party: "1" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "char-player", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 10 }],
      parties: [{ sequentialId: 1, regimeStatus: "ruling", economicPosition: 0, socialPosition: 0 }],
      regimeInputs: { governmentType: "onePartyState", opsVoteMultipliers: { ruling: 8, approved: 2, independent: 0, banned: 0 } },
    });
    expect(enriched!.regimeMult).toBe(8);
    expect(enriched!.regimeStatus).toBe("ruling");
  });

  it("attaches approved multiplier", () => {
    const candidate = makePlayerCandidate({ party: "2" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "char-player", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 10 }],
      parties: [{ sequentialId: 2, regimeStatus: "approved", economicPosition: 0, socialPosition: 0 }],
      regimeInputs: { governmentType: "onePartyState", opsVoteMultipliers: { ruling: 8, approved: 2, independent: 0, banned: 0 } },
    });
    expect(enriched!.regimeMult).toBe(2);
  });

  it("attaches banned multiplier 0", () => {
    const candidate = makePlayerCandidate({ party: "3" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "char-player", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 10 }],
      parties: [{ sequentialId: 3, regimeStatus: "banned", economicPosition: 0, socialPosition: 0 }],
      regimeInputs: { governmentType: "onePartyState" },
    });
    expect(enriched!.regimeMult).toBe(0);
  });

  it("honest-by-election flag overrides every multiplier with atMultiplier", () => {
    const candidate = makePlayerCandidate({ party: "1" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "char-player", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 10 }],
      parties: [{ sequentialId: 1, regimeStatus: "ruling", economicPosition: 0, socialPosition: 0 }],
      regimeInputs: { governmentType: "onePartyState", pendingHonestByElection: { atMultiplier: 1 }, opsVoteMultipliers: { ruling: 8, approved: 2, independent: 0, banned: 0 } },
    });
    expect(enriched!.regimeMult).toBe(1);
  });

  it("attaches 1.0 for non-OPS country regardless of regimeStatus", () => {
    const candidate = makePlayerCandidate({ party: "1" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "char-player", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 10 }],
      parties: [{ sequentialId: 1, regimeStatus: "ruling", economicPosition: 0, socialPosition: 0 }],
      regimeInputs: { governmentType: "presidential" },
    });
    expect(enriched!.regimeMult).toBe(1);
  });

  it("no regimeInputs → neutral 1.0 (PORT-STUB shape)", () => {
    const candidate = makePlayerCandidate({ party: "1" });
    const [enriched] = enrichCandidates([candidate], {
      characters: [{ _id: "char-player", policies: { economic: 0, social: 0 }, favorability: 50, politicalInfluence: 10 }],
      parties: [{ sequentialId: 1, regimeStatus: "ruling", economicPosition: 0, socialPosition: 0 }],
    });
    expect(enriched!.regimeMult).toBe(1);
  });
});
