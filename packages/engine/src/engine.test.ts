import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import { createWorld } from "./world.js";
import { rngFromSeed, rngFromState } from "./rng.js";
import { dateForTurn, eraForDate } from "./calendar.js";

const OPTS = { seed: "test-seed", playerName: "Tester", countryId: "us" } as const;

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = rngFromSeed("alpha");
    const b = rngFromSeed("alpha");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("differs across seeds", () => {
    expect(rngFromSeed("alpha").next()).not.toBe(rngFromSeed("beta").next());
  });

  it("resumes exactly from serialized state", () => {
    const a = rngFromSeed("alpha");
    for (let i = 0; i < 10; i++) a.next();
    const b = rngFromState(a.state());
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it("int stays in bounds and pick rejects empty", () => {
    const rng = rngFromSeed("bounds");
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
    expect(() => rng.pick([])).toThrow();
  });
});

describe("calendar", () => {
  it("maps turns to weekly dates from the 1953 start", () => {
    expect(dateForTurn(0)).toBe("1953-01-06");
    expect(dateForTurn(1)).toBe("1953-01-13");
    expect(dateForTurn(52)).toBe("1954-01-05");
  });

  it("crosses era thresholds by year", () => {
    expect(eraForDate("1959-12-29")).toBe("1953");
    expect(eraForDate("1960-01-05")).toBe("1960");
    expect(eraForDate("1976-01-06")).toBe("1976");
  });
});

describe("advanceTurn", () => {
  it("produces identical worlds for identical seeds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is unaffected by a save/load round trip mid-campaign", () => {
    const straight = createWorld(OPTS);
    const reloaded = createWorld(OPTS);
    for (let i = 0; i < 10; i++) advanceTurn(straight);
    let world = reloaded;
    for (let i = 0; i < 5; i++) advanceTurn(world);
    world = deserializeSave(serializeSave(world, "2026-01-01T00:00:00Z"));
    for (let i = 0; i < 5; i++) advanceTurn(world);
    expect(JSON.stringify(world)).toBe(JSON.stringify(straight));
  });

  it("advances the date weekly and reports phase timings", () => {
    const world = createWorld(OPTS);
    const report = advanceTurn(world);
    expect(world.meta.turn).toBe(1);
    expect(world.meta.date).toBe("1953-01-13");
    expect(report.phaseTimings.map((p) => p.name)).toEqual([
      "advanceCalendar",
      "macroEconomy",
      "newsMaintenance",
    ]);
  });

  it("fires an era transition news item at 1960", () => {
    const world = createWorld(OPTS);
    while (world.meta.era === "1953") advanceTurn(world);
    expect(world.meta.era).toBe("1960");
    expect(world.news.some((n) => n.headline.includes("new era"))).toBe(true);
  });
});

describe("save", () => {
  it("rejects garbage and future schema versions", () => {
    expect(() => deserializeSave("not json")).toThrow("unparseable");
    expect(() => deserializeSave('{"format":"other"}')).toThrow("format marker");
    const world = createWorld(OPTS);
    world.meta.schemaVersion = 999;
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    expect(() => deserializeSave(raw)).toThrow("newer version");
  });
});
