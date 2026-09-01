import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { applyPresidentialResolution } from "./presidentialResolution.js";
import type { ElectionRecord } from "./types.js";

const OPTS = { seed: "president-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

function baseRecord(overrides: Partial<ElectionRecord> = {}): ElectionRecord {
  return {
    id: "president:US:-:c1",
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: 1,
    primaryEndTurn: 100,
    endTurn: 192,
    totalSeats: 1,
    chamberKey: "president",
    candidates: [],
    tally: {},
    ...overrides,
  };
}

describe("applyPresidentialResolution — majority path", () => {
  it("seats the outright majority winner and their running mate", () => {
    const world = createWorld(OPTS);
    const vp = world.politicians.find((p) => p.chamberKey === "house" && p.partyId === "US_DEM")!;
    const rec = baseRecord({
      candidates: [
        { id: "cand-A", name: "A", partyId: "US_DEM", isNPP: true, incumbent: false, runningMateId: vp.id },
        { id: "cand-B", name: "B", partyId: "US_REP", isNPP: true, incumbent: false },
      ],
      tally: { "cand-A": 2000, "cand-B": 500 },
    });
    world.elections.push(rec);

    applyPresidentialResolution(world, rec);

    expect(rec.status).toBe("resolved");
    expect(rec.winners).toEqual(["cand-A"]);
    expect(world.executives["US"]).toMatchObject({
      presidentId: "cand-A",
      presidentParty: "US_DEM",
      vicePresidentId: vp.id,
      vicePresidentParty: "US_DEM",
    });
    expect(world.news.some((n) => n.headline.includes("wins the US presidency"))).toBe(true);
  });

  it("vacates the presidency when no votes were cast", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({ tally: {} });
    world.elections.push(rec);

    applyPresidentialResolution(world, rec);

    expect(rec.status).toBe("resolved");
    expect(rec.winners).toEqual([]);
    expect(world.executives["US"]!.presidentId).toBeNull();
  });
});

describe("applyPresidentialResolution — 12th Amendment contingent path", () => {
  it("resolves via the House/Senate contingent ballot when no candidate clears a national majority", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({
      candidates: [
        { id: "cand-A", name: "A", partyId: "US_DEM", isNPP: true, incumbent: false },
        { id: "cand-B", name: "B", partyId: "US_REP", isNPP: true, incumbent: false },
        { id: "cand-C", name: "C", partyId: "independent", isNPP: true, incumbent: false },
      ],
      // Fragmented three-way field: no candidate reaches floor(2997/2)+1 = 1499.
      tally: { "cand-A": 1000, "cand-B": 999, "cand-C": 998 },
    });
    world.elections.push(rec);

    applyPresidentialResolution(world, rec);

    expect(rec.status).toBe("resolved");
    expect(rec.winners).toHaveLength(1);
    expect(["cand-A", "cand-B", "cand-C"]).toContain(rec.winners![0]);
    expect(world.executives["US"]!.presidentId).toBe(rec.winners![0]);
    expect(world.news.some((n) => n.headline.includes("House contingent election"))).toBe(true);
  });

  it("is deterministic across identical seeds", () => {
    const inputs = () => {
      const world = createWorld(OPTS);
      const rec = baseRecord({
        candidates: [
          { id: "cand-A", name: "A", partyId: "US_DEM", isNPP: true, incumbent: false },
          { id: "cand-B", name: "B", partyId: "US_REP", isNPP: true, incumbent: false },
          { id: "cand-C", name: "C", partyId: "independent", isNPP: true, incumbent: false },
        ],
        tally: { "cand-A": 1000, "cand-B": 999, "cand-C": 998 },
      });
      world.elections.push(rec);
      return { world, rec };
    };
    const a = inputs();
    const b = inputs();
    applyPresidentialResolution(a.world, a.rec);
    applyPresidentialResolution(b.world, b.rec);
    expect(JSON.stringify(a.world.executives)).toBe(JSON.stringify(b.world.executives));
    expect(a.rec.winners).toEqual(b.rec.winners);
  });
});

describe("president election — full turn-pipeline integration", () => {
  it("spawns the 1956 (turn 192) cycle-1 race and resolves it, seating an executive", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 260; i++) advanceTurn(world);

    const rec = world.elections.find((e) => e.electionType === "president");
    expect(rec).toBeDefined();
    expect(rec!.endTurn).toBe(192);
    expect(rec!.status).toBe("resolved");
    expect(world.executives["US"]).toBeDefined();
    expect(world.executives["US"]!.presidentId).not.toBeNull();
  });

  it("is deterministic across identical seeds through the first presidential cycle", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 260; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.executives)).toBe(JSON.stringify(b.executives));
    expect(JSON.stringify(a.elections.filter((e) => e.electionType === "president"))).toBe(
      JSON.stringify(b.elections.filter((e) => e.electionType === "president")),
    );
  });
});
