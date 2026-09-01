import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";

const OPTS = { seed: "elections-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("election orchestration (W21c)", () => {
  it("spawns and resolves deterministically", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 120; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.elections)).toBe(JSON.stringify(b.elections));
    expect(a.elections.some((e) => e.status === "resolved")).toBe(true);
  });

  it("keeps house seat invariants exact over 700 turns", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 700; i++) advanceTurn(w);
    const house = w.legislatures["US"]!.chambers.find((c) => c.key === "house")!;
    const sum = Object.values(house.composition.seatsByParty).reduce((x, y) => x + y, 0) + house.composition.vacancies;
    expect(sum).toBe(house.seats);
    expect(house.composition.vacancies).toBe(0);
    const byState = new Map<string, number>();
    for (const p of w.politicians) {
      if (p.chamberKey === "house") byState.set(p.electedState ?? "?", (byState.get(p.electedState ?? "?") ?? 0) + 1);
    }
    for (const st of Object.values(w.regions).filter((r) => r.countryId === "US")) {
      expect(byState.get(st.id) ?? 0).toBe(st.houseSeats);
    }
  });

  it("senate seats stay 96 with the pre-statehood classes vacant", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 400; i++) advanceTurn(w);
    const senate = w.legislatures["US"]!.chambers.find((c) => c.key === "senate")!;
    const held = Object.values(senate.composition.seatsByParty).reduce((x, y) => x + y, 0);
    expect(held).toBe(96);
    expect(senate.composition.vacancies).toBe(4);
  });

  it("losing generated challengers retire; NPC population stays bounded", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 700; i++) advanceTurn(w);
    expect(w.politicians.length).toBeLessThan(6000);
  });

  it("player can join a party, declare, and the race resolves with news", () => {
    const w = createWorld(OPTS);
    const join = executeAction(w, "player", "joinParty", { partyId: "US_DEM" });
    expect(join.ok).toBe(true);
    // advance until a US house race is active and inside its filing window
    let target: string | null = null;
    for (let i = 0; i < 200 && !target; i++) {
      advanceTurn(w);
      const rec = w.elections.find(
        (e) => e.electionType === "house" && e.status === "active" && w.meta.turn <= e.primaryEndTurn,
      );
      if (rec) target = rec.id;
    }
    expect(target).not.toBeNull();
    const declare = executeAction(w, "player", "declareCandidacy", { electionId: target! });
    expect(declare.ok).toBe(true);
    const rec = w.elections.find((e) => e.id === target)!;
    expect(rec.candidates.some((c) => c.id === "player")).toBe(true);
    // second declaration elsewhere is blocked
    const other = w.elections.find((e) => e.id !== target && e.status !== "resolved" && e.countryId === "US");
    if (other) {
      const second = executeAction(w, "player", "declareCandidacy", { electionId: other.id });
      expect(second.ok).toBe(false);
    }
    while (w.elections.find((e) => e.id === target)!.status !== "resolved") advanceTurn(w);
    expect(w.news.some((n) => n.headline.startsWith("Election won") || n.headline.startsWith("Election lost"))).toBe(true);
  });

  it("declare requires party membership and an open filing window", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 120; i++) advanceTurn(w);
    const rec = w.elections.find((e) => e.countryId === "US" && e.status !== "resolved");
    expect(rec).toBeDefined();
    const res = executeAction(w, "player", "declareCandidacy", { electionId: rec!.id });
    expect(res.ok).toBe(false);
  });

  it("migrates v12 saves to v13 with elections and seat geography", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00Z"));
    raw.schemaVersion = 12;
    raw.world.meta.schemaVersion = 12;
    delete raw.world.elections;
    for (const p of raw.world.politicians) {
      delete p.electedState;
      delete p.senateClass;
    }
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(17);
    expect(Array.isArray(migrated.elections)).toBe(true);
    const houseWithState = migrated.politicians.filter((p) => p.chamberKey === "house" && p.electedState);
    expect(houseWithState.length).toBeGreaterThan(400);
  });

  it("resolved election retention is capped", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 900; i++) advanceTurn(w);
    expect(w.elections.filter((e) => e.status === "resolved").length).toBeLessThanOrEqual(400);
  });
});
