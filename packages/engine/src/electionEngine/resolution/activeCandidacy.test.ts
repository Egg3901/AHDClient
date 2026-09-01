// @ts-nocheck
// Adapted from src/lib/elections/activeCandidacy.test.ts
// Mainline mapping: DB reads replaced with plain input arrays.
// Numeric assertions byte-identical; DB mock setup replaced with plain arrays.
// Changed: ObjectId -> string, MockDb -> plain arrays, async -> sync plain inputs.

import { describe, it, expect } from "vitest";
import { electionStatusBlocksFurtherEntry, findBlockingActiveCandidacy } from "./activeCandidacy.js";

describe("electionStatusBlocksFurtherEntry", () => {
  it("treats completed elections as blocking (awaiting resolution)", () => {
    expect(electionStatusBlocksFurtherEntry("completed")).toBe(true);
  });
  it("does not block after resolution or cancellation", () => {
    expect(electionStatusBlocksFurtherEntry("resolved")).toBe(false);
    expect(electionStatusBlocksFurtherEntry("cancelled")).toBe(false);
  });
});

describe("findBlockingActiveCandidacy — plain inputs", () => {
  it("returns null when character has no active candidacies", () => {
    const result = findBlockingActiveCandidacy([], [], "char-1");
    expect(result).toBeNull();
  });
  it("returns null when all active candidacies are in non-blocking elections", () => {
    const candidates = [{ _id: "c1", electionId: "e1", characterId: "char-1", status: "active" as const }];
    const elections = [{ _id: "e1", status: "resolved" as const }];
    const result = findBlockingActiveCandidacy(candidates, elections, "char-1");
    expect(result).toBeNull();
  });
  it("returns the candidate and election when a blocking election is found", () => {
    const candidates = [{ _id: "c1", electionId: "e1", characterId: "char-1", status: "active" as const }];
    const elections = [{ _id: "e1", status: "active" as const }];
    const result = findBlockingActiveCandidacy(candidates, elections, "char-1");
    expect(result).not.toBeNull();
    expect(result?.candidate._id).toBe("c1");
    expect(result?.election._id).toBe("e1");
  });
  it("skips the excluded election and returns null", () => {
    const candidates = [{ _id: "c1", electionId: "e1", characterId: "char-1", status: "active" as const }];
    const elections = [{ _id: "e1", status: "active" as const }];
    const result = findBlockingActiveCandidacy(candidates, elections, "char-1", "e1");
    expect(result).toBeNull();
  });
});
