import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { processPresidentialSuccession } from "./succession.js";
import type { ExecutiveState } from "./types.js";

const OPTS = { seed: "succession-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

function vacantExec(overrides: Partial<ExecutiveState> = {}): ExecutiveState {
  return {
    countryId: "US",
    presidentId: null,
    presidentParty: null,
    termStartTurn: null,
    vicePresidentId: null,
    vicePresidentParty: null,
    ...overrides,
  };
}

describe("processPresidentialSuccession", () => {
  it("promotes the VP to president when the presidency is vacant", () => {
    const world = createWorld(OPTS);
    const vp = world.politicians[0]!;
    world.executives["US"] = vacantExec({ vicePresidentId: vp.id, vicePresidentParty: vp.partyId });
    world.meta.turn = 50;

    const result = processPresidentialSuccession(world);

    expect(result.promoted).toEqual([vp.id]);
    const exec = world.executives["US"]!;
    expect(exec.presidentId).toBe(vp.id);
    expect(exec.presidentParty).toBe(vp.partyId);
    expect(exec.termStartTurn).toBe(50);
    expect(exec.vicePresidentId).toBeNull();
    expect(exec.vicePresidentParty).toBeNull();
    expect(world.news.some((n) => n.headline.includes("succeeds to the presidency"))).toBe(true);
  });

  it("promotes the player when the player is VP", () => {
    const world = createWorld(OPTS);
    world.executives["US"] = vacantExec({ vicePresidentId: "player", vicePresidentParty: "US_DEM" });

    processPresidentialSuccession(world);

    expect(world.executives["US"]!.presidentId).toBe("player");
    expect(world.news.some((n) => n.headline.includes("You succeed to the presidency"))).toBe(true);
  });

  it("is a no-op when the presidency is already filled", () => {
    const world = createWorld(OPTS);
    const pres = world.politicians[0]!;
    const vp = world.politicians[1]!;
    world.executives["US"] = vacantExec({
      presidentId: pres.id,
      presidentParty: pres.partyId,
      vicePresidentId: vp.id,
      vicePresidentParty: vp.partyId,
    });

    const result = processPresidentialSuccession(world);

    expect(result.promoted).toEqual([]);
    expect(world.executives["US"]!.presidentId).toBe(pres.id);
    expect(world.executives["US"]!.vicePresidentId).toBe(vp.id);
  });

  it("is a no-op when both offices are vacant", () => {
    const world = createWorld(OPTS);
    world.executives["US"] = vacantExec();

    const result = processPresidentialSuccession(world);

    expect(result.promoted).toEqual([]);
    expect(world.executives["US"]!.presidentId).toBeNull();
  });

  it("is deterministic across identical seeds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    const vpA = a.politicians[0]!;
    const vpB = b.politicians[0]!;
    a.executives["US"] = vacantExec({ vicePresidentId: vpA.id, vicePresidentParty: vpA.partyId });
    b.executives["US"] = vacantExec({ vicePresidentId: vpB.id, vicePresidentParty: vpB.partyId });

    processPresidentialSuccession(a);
    processPresidentialSuccession(b);

    expect(JSON.stringify(a.executives)).toBe(JSON.stringify(b.executives));
  });
});
