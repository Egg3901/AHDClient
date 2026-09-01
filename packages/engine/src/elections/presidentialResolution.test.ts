import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { applyPresidentialResolution } from "./presidentialResolution.js";
import { withdrawCandidacy } from "./candidacy.js";
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

describe("applyPresidentialResolution — real per-state Electoral College path (W24b)", () => {
  it("falls to the contingent path when a 3-way EV split leaves nobody at the real 266 majority", () => {
    const world = createWorld(OPTS);
    // Round-robin the 48 states (sorted by EV descending) across 3
    // candidates: with a 531-EV college this lands each candidate near
    // ~177 EV, comfortably short of the 266 majority no matter how the
    // large states fall, without hand-tuning per-state numbers.
    const states = Object.values(world.regions)
      .filter((r) => r.countryId === "US")
      .map((r) => ({ id: r.id, ev: (r.houseSeats ?? 0) + 2 }))
      .sort((a, b) => b.ev - a.ev || a.id.localeCompare(b.id));
    const names = ["cand-A", "cand-B", "cand-C"];
    const stateTallyStates: Record<string, { totalVotes: Record<string, number> }> = {};
    const evByCand: Record<string, number> = {};
    states.forEach((s, i) => {
      const winner = names[i % 3]!;
      stateTallyStates[s.id] = { totalVotes: { [winner]: 100, [names[(i + 1) % 3]!]: 10 } };
      evByCand[winner] = (evByCand[winner] ?? 0) + s.ev;
    });
    // Sanity: the round-robin split actually stays under the 266 majority
    // for all three (guards the test construction itself, not just the code
    // under test).
    for (const total of Object.values(evByCand)) expect(total).toBeLessThan(266);

    const rec = baseRecord({
      candidates: names.map((id, i) => ({
        id,
        name: id,
        partyId: ["US_DEM", "US_REP", "independent"][i]!,
        isNPP: true,
        incumbent: false,
      })),
      tally: { "cand-A": 1, "cand-B": 1, "cand-C": 1 },
      stateTallyStates,
    });
    world.elections.push(rec);

    applyPresidentialResolution(world, rec);

    expect(rec.status).toBe("resolved");
    expect(rec.winners).toHaveLength(1);
    expect(names).toContain(rec.winners![0]);
    expect(world.news.some((n) => n.headline.includes("House contingent election"))).toBe(true);
  });

  it("seats the EV-majority winner outright when EVs clear the real 266 threshold", () => {
    const world = createWorld(OPTS);
    const states = Object.values(world.regions).filter((r) => r.countryId === "US");
    const rec = baseRecord({
      candidates: [
        { id: "cand-A", name: "A", partyId: "US_DEM", isNPP: true, incumbent: false },
        { id: "cand-B", name: "B", partyId: "US_REP", isNPP: true, incumbent: false },
      ],
      tally: { "cand-A": 1, "cand-B": 1 },
      // A wins every state: 531/531 EV, well past the 266 majority.
      stateTallyStates: Object.fromEntries(
        states.map((s) => [s.id, { totalVotes: { "cand-A": 100, "cand-B": 10 } }]),
      ),
    });
    world.elections.push(rec);

    applyPresidentialResolution(world, rec);

    expect(rec.status).toBe("resolved");
    expect(rec.winners).toEqual(["cand-A"]);
    expect(world.news.some((n) => n.headline.includes("electoral college majority"))).toBe(true);
    expect(world.executives["US"]!.presidentId).toBe("cand-A");
  });
});

describe("withdrawCandidacy — per-state EC cleanup (W24b)", () => {
  it("purges the withdrawing player's votes from every state's tally, not just the national aggregate", () => {
    const world = createWorld(OPTS);
    world.player.partyId = "US_DEM";
    const rec = baseRecord({
      candidates: [
        { id: "player", name: world.player.name, partyId: "US_DEM", isNPP: false, incumbent: false },
        { id: "cand-B", name: "B", partyId: "US_REP", isNPP: true, incumbent: false },
      ],
      tally: { player: 500, "cand-B": 300 },
      stateTallyStates: {
        CA: { totalVotes: { player: 50, "cand-B": 10 } },
        TX: { totalVotes: { player: 20, "cand-B": 30 } },
      },
    });
    world.elections.push(rec);

    const result = withdrawCandidacy(world, rec.id);

    expect(result.ok).toBe(true);
    expect(rec.tally["player"]).toBeUndefined();
    expect((rec.stateTallyStates!["CA"] as { totalVotes: Record<string, number> }).totalVotes["player"]).toBeUndefined();
    expect((rec.stateTallyStates!["TX"] as { totalVotes: Record<string, number> }).totalVotes["player"]).toBeUndefined();
    // Untouched: the other candidate's per-state totals survive.
    expect((rec.stateTallyStates!["CA"] as { totalVotes: Record<string, number> }).totalVotes["cand-B"]).toBe(10);
  });
});

describe("president election — full turn-pipeline integration", () => {
  it("spawns the 1956 (turn 192) cycle-1 race and resolves it, seating an executive via real per-state EVs", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 260; i++) advanceTurn(world);

    const rec = world.elections.find((e) => e.electionType === "president");
    expect(rec).toBeDefined();
    expect(rec!.endTurn).toBe(192);
    expect(rec!.status).toBe("resolved");
    expect(world.executives["US"]).toBeDefined();
    expect(world.executives["US"]!.presidentId).not.toBeNull();
    // The real per-state EC path ran during accumulation (not the nationwide
    // fallback): stateTallyStates has an entry for every one of the 48 US
    // states, each carrying real accumulated votes.
    const resolved = world.elections
      .filter((e) => e.electionType === "president" && e.status === "resolved")
      .sort((a, b) => a.cycle - b.cycle)[0]!;
    const usStateIds = Object.values(world.regions)
      .filter((r) => r.countryId === "US")
      .map((r) => r.id)
      .sort();
    expect(Object.keys(resolved.stateTallyStates ?? {}).sort()).toEqual(usStateIds);
    for (const stateId of usStateIds) {
      const totals = (resolved.stateTallyStates![stateId] as { totalVotes: Record<string, number> }).totalVotes;
      expect(Object.values(totals).some((v) => v > 0)).toBe(true);
    }
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
