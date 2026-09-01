import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { createWorld } from "./world.js";
import { deserializeSave, serializeSave } from "./save.js";
import { advanceOutputGap, computeInflation, okunTarget } from "./phases/macroCountryTurn.js";
import { SCHEMA_VERSION } from "./world.js";

const OPTS = { seed: "test-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

// ── Determinism ────────────────────────────────────────────────────────
describe("macroCountryTurn determinism", () => {
  it("same seed 50 turns identical JSON", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── Golden values ──────────────────────────────────────────────────────
describe("golden values", () => {
  it("advanceOutputGap: impulse 2, gap closure 1.5, 48 tpy", () => {
    // prevGap 0, sector 4, potential 2 => impulse 2, rawGap 0 + (2-0)/48 = 0.04166...
    const r = advanceOutputGap(0, 4, 2, 48);
    expect(r.impulse).toBeCloseTo(2, 6);
    expect(r.gap).toBeCloseTo(2 / 48, 6);
    expect(r.gdpGrowth).toBeCloseTo(2 + (2 / 48) * 48, 6); // 4
    expect(r.gdpGrowth).toBeCloseTo(4, 6);
  });

  it("advanceOutputGap: gap closure from 10 with zero impulse", () => {
    // prevGap 10, sector 2, potential 2 => impulse 0, rawGap 10 + (0-15)/48 = 9.6875
    const r = advanceOutputGap(10, 2, 2, 48);
    expect(r.impulse).toBe(0);
    expect(r.gap).toBeCloseTo(10 - 15 / 48, 6);
    expect(r.gdpGrowth).toBeCloseTo(2 + (r.gap - 10) * 48, 6);
  });

  it("advanceOutputGap: clamps gap to [-15,15]", () => {
    const r = advanceOutputGap(14.9, 15, -10, 48);
    // impulse 25, rawGap 14.9 + (25 - 22.35)/48 = 14.955... within bound
    expect(r.gap).toBeLessThanOrEqual(15);
    const r2 = advanceOutputGap(15, 15, -10, 48);
    expect(r2.gap).toBeLessThanOrEqual(15);
    const r3 = advanceOutputGap(-15, -10, 10, 48);
    expect(r3.gap).toBeGreaterThanOrEqual(-15);
  });

  it("okunTarget: growth above neutral lowers unemployment", () => {
    // prev 5%, growth 4, potential 2 => deviation 2, coeff 0.2 => target 5 -0.4 =4.6
    expect(okunTarget(5, 4, 2)).toBeCloseTo(4.6, 6);
  });

  it("okunTarget: growth below neutral raises unemployment", () => {
    // prev 5, growth 0, potential 2 => deviation -2, coeff 0.25 => target 5 +0.5=5.5
    expect(okunTarget(5, 0, 2)).toBeCloseTo(5.5, 6);
  });

  it("computeInflation: baseline returns ~2% (target)", () => {
    // unemployment at NAIRU 5, gdp at trend 2 => raw 2, prev 2 => smoothed 2
    expect(computeInflation(2, 5, 2)).toBeCloseTo(2, 1);
  });

  it("computeInflation: tight labor (unemp 3) is inflationary", () => {
    expect(computeInflation(2, 3, 2)).toBeGreaterThan(2);
  });

  it("computeInflation: hot economy (gdp 5) is inflationary", () => {
    expect(computeInflation(2, 5, 5)).toBeGreaterThan(2);
  });
});

// ── Bounds sanity ──────────────────────────────────────────────────────
describe("bounds sanity", () => {
  it("rates stay finite and within mainline clamps over 200 turns", () => {
    const world = createWorld({ seed: "bounds-seed", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 200; i++) {
      advanceTurn(world);
      for (const c of Object.values(world.countries)) {
        const e = c.economy;
        expect(Number.isFinite(e.gdp)).toBe(true);
        expect(e.gdp).toBeGreaterThan(0);
        expect(Number.isFinite(e.growthRate)).toBe(true);
        expect(e.growthRate).toBeGreaterThanOrEqual(-0.15);
        expect(e.growthRate).toBeLessThanOrEqual(0.15);
        expect(Number.isFinite(e.inflationRate)).toBe(true);
        expect(e.inflationRate * 100).toBeGreaterThanOrEqual(-2);
        expect(e.inflationRate * 100).toBeLessThanOrEqual(100);
        expect(Number.isFinite(e.unemploymentRate)).toBe(true);
        expect(e.unemploymentRate * 100).toBeGreaterThanOrEqual(1);
        expect(e.unemploymentRate * 100).toBeLessThanOrEqual(15);
        expect(Number.isFinite(e.outputGap)).toBe(true);
        expect(e.outputGap).toBeGreaterThanOrEqual(-15);
        expect(e.outputGap).toBeLessThanOrEqual(15);
      }
    }
  });
});

// ── Migration ──────────────────────────────────────────────────────────
describe("save migration v2 -> v3", () => {
  it("loads a v2 save fixture and upgrades parties and legislatures", () => {
    const v2World: Record<string, unknown> = {
      meta: {
        schemaVersion: 2,
        seed: "mig-seed-2",
        rng: [1, 2, 3, 4] as unknown,
        turn: 5,
        date: "1953-02-10",
        era: "1953",
      },
      countries: {
        US: {
          id: "US",
          name: "United States",
          playable: true,
          economy: { gdp: 389000, growthRate: 0.03, inflationRate: 0.02, unemploymentRate: 0.05, outputGap: 0 },
        },
      },
      player: { name: "Tester", countryId: "US", cash: 10000 },
      news: [],
    };
    const raw = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 2,
      savedAt: "2026-01-01T00:00:00Z",
      world: v2World,
    });
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(3);
    expect(loaded.parties).toBeDefined();
    expect(loaded.legislatures).toBeDefined();
    expect(Object.keys(loaded.parties).length).toBe(0);
    expect(Object.keys(loaded.legislatures).length).toBe(0);
    const raw2 = serializeSave(loaded, "2026-01-02T00:00:00Z");
    const loaded2 = deserializeSave(raw2);
    expect(loaded2.meta.schemaVersion).toBe(3);
  });

  it("loads a v1 save fixture and migrates through v2 to v3", () => {
    const v1World: Record<string, unknown> = {
      meta: {
        schemaVersion: 1,
        seed: "mig-seed-1",
        rng: [1, 2, 3, 4] as unknown,
        turn: 5,
        date: "1953-02-10",
        era: "1953",
      },
      countries: {
        US: {
          id: "US",
          name: "United States",
          playable: true,
          economy: { gdp: 389000, growthRate: 0.03, inflationRate: 0.02, unemploymentRate: 0.05 },
        },
      },
      player: { name: "Tester", countryId: "US", cash: 10000 },
      news: [],
    };
    const raw = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 1,
      savedAt: "2026-01-01T00:00:00Z",
      world: v1World,
    });
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.meta.schemaVersion).toBe(3);
    for (const c of Object.values(loaded.countries)) {
      expect((c.economy as unknown as Record<string, unknown>)["outputGap"]).toBe(0);
    }
    expect(loaded.parties).toBeDefined();
    expect(loaded.legislatures).toBeDefined();
  });
});

describe("save migration v1 -> v2", () => {
  it("loads a v1 save fixture and upgrades outputGap", () => {
    // Construct a v1 save: schemaVersion 1, country economies without outputGap
    const v1World: Record<string, unknown> = {
      meta: {
        schemaVersion: 1,
        seed: "mig-seed",
        rng: [1, 2, 3, 4] as unknown,
        turn: 5,
        date: "1953-02-10",
        era: "1953",
      },
      countries: {
        us: {
          id: "US",
          name: "United States",
          playable: true,
          economy: { gdp: 389000, growthRate: 0.03, inflationRate: 0.02, unemploymentRate: 0.05 },
        },
        uk: {
          id: "uk",
          name: "United Kingdom",
          playable: true,
          economy: { gdp: 47000, growthRate: 0.02, inflationRate: 0.03, unemploymentRate: 0.04 },
        },
      },
      player: { name: "Tester", countryId: "US", cash: 10000 },
      news: [],
    };
    const raw = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 1,
      savedAt: "2026-01-01T00:00:00Z",
      world: v1World,
    });
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.meta.schemaVersion).toBe(3);
    for (const c of Object.values(loaded.countries)) {
      expect(c.economy.outputGap).toBe(0);
      expect(Number.isFinite(c.economy.outputGap)).toBe(true);
    }
    expect(loaded.parties).toBeDefined();
    expect(loaded.legislatures).toBeDefined();
    // Round-trip preserves v3
    const raw2 = serializeSave(loaded, "2026-01-02T00:00:00Z");
    const loaded2 = deserializeSave(raw2);
    expect(loaded2.meta.schemaVersion).toBe(3);
    for (const c of Object.values(loaded2.countries)) {
      expect(c.economy.outputGap).toBe(0);
    }
  });
});
