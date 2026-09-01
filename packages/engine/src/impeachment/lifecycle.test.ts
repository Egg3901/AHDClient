import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { fileImpeachment, processImpeachmentLifecycle } from "./lifecycle.js";
import { IMPEACHMENT_HOUSE_VOTING_TURNS, IMPEACHMENT_SENATE_VOTING_TURNS } from "./tally.js";
import type { ExecutiveState } from "../executive/types.js";

const OPTS = { seed: "impeachment-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

/** Seat a synthetic president (not a real politician) so the target's own
 * ideology stays undefined — `nppStanceCloseness` then returns null for
 * every voter, which makes the opposition-major-party vote a deterministic
 * "aye" (no rng coin flip branch), keeping these tests rng-independent. */
function seatTarget(world: ReturnType<typeof createWorld>, targetId: string, targetParty: string): void {
  const exec: ExecutiveState = {
    countryId: "US",
    presidentId: targetId,
    presidentParty: targetParty,
    termStartTurn: world.meta.turn,
    vicePresidentId: null,
    vicePresidentParty: null,
  };
  world.executives["US"] = exec;
}

function setAllChamberParty(world: ReturnType<typeof createWorld>, chamberKey: "house" | "senate", partyId: string): void {
  for (const p of world.politicians) {
    if (p.countryId === "US" && p.chamberKey === chamberKey) p.partyId = partyId;
  }
}

describe("fileImpeachment", () => {
  it("rejects a target who does not hold a presidency", () => {
    const world = createWorld(OPTS);
    const result = fileImpeachment(world, "not-a-president");
    expect(result.ok).toBe(false);
  });

  it("files a house-stage case against the sitting president", () => {
    const world = createWorld(OPTS);
    seatTarget(world, "test-target", "US_REP");
    const result = fileImpeachment(world, "test-target");
    expect(result.ok).toBe(true);
    expect(result.case?.stage).toBe("house");
    expect(result.case?.houseVotingEndsTurn).toBe(world.meta.turn + IMPEACHMENT_HOUSE_VOTING_TURNS);
    expect(world.impeachments).toHaveLength(1);
  });

  it("rejects a second open case against the same target", () => {
    const world = createWorld(OPTS);
    seatTarget(world, "test-target", "US_REP");
    expect(fileImpeachment(world, "test-target").ok).toBe(true);
    expect(fileImpeachment(world, "test-target").ok).toBe(false);
  });
});

describe("processImpeachmentLifecycle", () => {
  it("advances house -> senate -> convicted when the opposition holds all seats", () => {
    const world = createWorld(OPTS);
    seatTarget(world, "test-target", "US_REP");
    setAllChamberParty(world, "house", "US_DEM");
    setAllChamberParty(world, "senate", "US_DEM");
    const filed = fileImpeachment(world, "test-target");
    expect(filed.ok).toBe(true);

    const rng = rngFromSeed("impeachment-vote-rng");

    // Before the window closes: no-op.
    processImpeachmentLifecycle(world, rng);
    expect(world.impeachments[0]!.stage).toBe("house");

    world.meta.turn += IMPEACHMENT_HOUSE_VOTING_TURNS;
    processImpeachmentLifecycle(world, rng);
    expect(world.impeachments[0]!.stage).toBe("senate");
    expect(world.impeachments[0]!.senateVotingEndsTurn).toBe(world.meta.turn + IMPEACHMENT_SENATE_VOTING_TURNS);

    world.meta.turn += IMPEACHMENT_SENATE_VOTING_TURNS;
    processImpeachmentLifecycle(world, rng);
    expect(world.impeachments[0]!.stage).toBe("convicted");
    expect(world.impeachments[0]!.resolvedTurn).toBe(world.meta.turn);
    expect(world.executives["US"]!.presidentId).toBeNull();
    expect(world.news.some((n) => n.headline.includes("convicted"))).toBe(true);
  });

  it("dismisses in the House when every seat belongs to the target's own party", () => {
    const world = createWorld(OPTS);
    seatTarget(world, "test-target", "US_REP");
    setAllChamberParty(world, "house", "US_REP");
    fileImpeachment(world, "test-target");
    world.meta.turn += IMPEACHMENT_HOUSE_VOTING_TURNS;

    processImpeachmentLifecycle(world, rngFromSeed("dismiss-rng"));

    expect(world.impeachments[0]!.stage).toBe("dismissed");
    expect(world.executives["US"]!.presidentId).toBe("test-target"); // untouched
  });

  it("auto-cancels a case whose target no longer holds the presidency", () => {
    const world = createWorld(OPTS);
    seatTarget(world, "test-target", "US_REP");
    fileImpeachment(world, "test-target");
    world.executives["US"]!.presidentId = "someone-else";

    processImpeachmentLifecycle(world, rngFromSeed("cancel-rng"));

    expect(world.impeachments[0]!.stage).toBe("cancelled");
  });

  it("is deterministic across identical seeds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (const world of [a, b]) {
      seatTarget(world, "test-target", "US_REP");
      setAllChamberParty(world, "house", "US_DEM");
      setAllChamberParty(world, "senate", "US_DEM");
      fileImpeachment(world, "test-target");
      world.meta.turn += IMPEACHMENT_HOUSE_VOTING_TURNS;
    }
    processImpeachmentLifecycle(a, rngFromSeed("det-rng"));
    processImpeachmentLifecycle(b, rngFromSeed("det-rng"));
    expect(JSON.stringify(a.impeachments)).toBe(JSON.stringify(b.impeachments));
  });
});
