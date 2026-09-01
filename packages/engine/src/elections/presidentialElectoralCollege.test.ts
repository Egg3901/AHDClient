import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import {
  allocateElectoralVotes,
  electoralMajorityFor,
  electoralVotesByState,
} from "./presidentialElectoralCollege.js";
import type { ElectionRecord } from "./types.js";

const OPTS = { seed: "ec-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

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

/** Mainline HOUSE_SEATS_1953 sum (83rd-87th Congress, 1953 census apportionment). */
const HOUSE_SEATS_1953: Record<string, number> = {
  AL: 9, AZ: 2, AR: 6, CA: 30, CO: 4, CT: 6, DE: 1, FL: 8, GA: 10, ID: 2,
  IL: 25, IN: 11, IA: 8, KS: 6, KY: 8, LA: 8, ME: 3, MD: 7, MA: 14, MI: 18,
  MN: 9, MS: 6, MO: 11, MT: 2, NE: 4, NV: 1, NH: 2, NJ: 14, NM: 2, NY: 43,
  NC: 12, ND: 2, OH: 23, OK: 6, OR: 4, PA: 30, RI: 2, SC: 6, SD: 2, TN: 9,
  TX: 22, UT: 2, VT: 1, VA: 10, WA: 7, WV: 6, WI: 10, WY: 1,
};

describe("electoralVotesByState — EV apportionment (1953)", () => {
  it("matches mainline HOUSE_SEATS_1953 + 2 senators per state, 48 states, no DC/AK/HI", () => {
    const world = createWorld(OPTS);
    const ev = electoralVotesByState(world, "US");
    expect(Object.keys(ev).sort()).toEqual(Object.keys(HOUSE_SEATS_1953).sort());
    for (const [stateId, seats] of Object.entries(HOUSE_SEATS_1953)) {
      expect(ev[stateId]).toBe(seats + 2);
    }
    expect(ev["DC"]).toBeUndefined();
    expect(ev["AK"]).toBeUndefined();
    expect(ev["HI"]).toBeUndefined();
  });

  it("sums to 531 (435 house seats + 2×48 senators) — mainline's ELECTORAL_VOTES_1953 total", () => {
    const world = createWorld(OPTS);
    const ev = electoralVotesByState(world, "US");
    const total = Object.values(ev).reduce((a, b) => a + b, 0);
    expect(total).toBe(531);
    const houseSeatSum = Object.values(HOUSE_SEATS_1953).reduce((a, b) => a + b, 0);
    expect(houseSeatSum).toBe(435);
  });
});

describe("electoralMajorityFor", () => {
  it("computes the era's real majority (266 for a 531-EV college), not a hardcoded 270", () => {
    expect(electoralMajorityFor(531)).toBe(266);
  });
  it("floor(total/2)+1 for an even college too", () => {
    expect(electoralMajorityFor(530)).toBe(266);
  });
  it("returns 0 for a non-positive/invalid total", () => {
    expect(electoralMajorityFor(0)).toBe(0);
    expect(electoralMajorityFor(-5)).toBe(0);
    expect(electoralMajorityFor(NaN)).toBe(0);
  });
});

describe("allocateElectoralVotes — winner-take-all goldens", () => {
  it("returns null when no per-state tallies exist (accumulation never ran)", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord();
    expect(allocateElectoralVotes(world, rec)).toBeNull();
  });

  it("awards each state's full EV block to its plurality winner (constructed 3-state outcome)", () => {
    const world = createWorld(OPTS);
    // CA=32 EV (30 house + 2), TX=24 EV (22 house + 2), WY=3 EV (1 house + 2).
    const rec = baseRecord({
      stateTallyStates: {
        CA: { totalVotes: { A: 5_000_000, B: 4_000_000 } },
        TX: { totalVotes: { A: 1_000_000, B: 2_000_000 } },
        WY: { totalVotes: { A: 50_000, B: 40_000 } },
      },
    });
    const result = allocateElectoralVotes(world, rec);
    expect(result).not.toBeNull();
    expect(result!.stateWinners).toEqual({ CA: "A", TX: "B", WY: "A" });
    expect(result!.evByCandidate).toEqual({ A: 32 + 3, B: 24 });
    expect(result!.totalEv).toBe(32 + 24 + 3);
  });

  it("breaks an exact intra-state tie alphabetically by candidate id (deterministic, documented simplification)", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({
      stateTallyStates: { WY: { totalVotes: { Zed: 100, Alpha: 100 } } },
    });
    const result = allocateElectoralVotes(world, rec);
    expect(result!.stateWinners["WY"]).toBe("Alpha");
  });

  it("skips a state with zero votes cast and still allocates the rest", () => {
    const world = createWorld(OPTS);
    const rec = baseRecord({
      stateTallyStates: {
        CA: { totalVotes: { A: 100 } },
        WY: { totalVotes: {} },
      },
    });
    const result = allocateElectoralVotes(world, rec);
    expect(result!.stateWinners).toEqual({ CA: "A" });
    expect(result!.totalEv).toBe(32);
  });
});
