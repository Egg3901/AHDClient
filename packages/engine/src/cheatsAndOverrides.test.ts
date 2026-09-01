import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { createWorld, listCountries, SCHEMA_VERSION } from "./world.js";
import { deserializeSave, serializeSave } from "./save.js";
import { applyCheat } from "./cheats.js";

const OPTS = { seed: "cheat-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

// -- listCountries --
describe("listCountries", () => {
  it("returns full pack roster with default economy anchors", () => {
    for (const era of ["1953", "1960"] as const) {
      const list = listCountries(era);
      expect(list.length).toBeGreaterThanOrEqual(10);
      const us = list.find((c) => c.id === "US")!;
      expect(us).toBeDefined();
      expect(us.name).toBe("United States");
      expect(us.playable).toBe(true);
      expect(us.economy.gdp).toBeGreaterThan(0);
      expect(us.economy.outputGap).toBe(0);
      const fr = list.find((c) => c.id === "FR")!;
      expect(fr.playable).toBe(false);
      // every entry has finite economy
      for (const c of list) {
        expect(Number.isFinite(c.economy.gdp)).toBe(true);
        expect(Number.isFinite(c.economy.growthRate)).toBe(true);
        expect(Number.isFinite(c.economy.inflationRate)).toBe(true);
        expect(Number.isFinite(c.economy.unemploymentRate)).toBe(true);
        expect(Number.isFinite(c.economy.outputGap)).toBe(true);
      }
    }
  });

  it("throws on unknown era", () => {
    expect(() => listCountries("2099")).toThrow(/Unknown era/i);
  });
});

// -- overrides application --
describe("overrides application", () => {
  it("applies playerCash and country economy overrides", () => {
    const world = createWorld({
      ...OPTS,
      overrides: {
        playerCash: 99999,
        countries: {
          US: { gdp: 123456, growthRate: 0.07, inflationRate: 0.01, unemploymentRate: 0.05 },
          UK: { gdp: 9999 },
        },
      },
    });
    expect(world.player.cash).toBe(99999);
    expect(world.countries["US"]!.economy.gdp).toBe(123456);
    expect(world.countries["US"]!.economy.growthRate).toBe(0.07);
    expect(world.countries["US"]!.economy.inflationRate).toBe(0.01);
    expect(world.countries["US"]!.economy.unemploymentRate).toBe(0.05);
    expect(world.countries["UK"]!.economy.gdp).toBe(9999);
    // non-overridden country unchanged
    const vanilla = createWorld(OPTS);
    expect(world.countries["RU"]!.economy.gdp).toBe(vanilla.countries["RU"]!.economy.gdp);
  });

  it("overrides do not affect determinism: same options including overrides give identical worlds", () => {
    const overrides = { playerCash: 42, countries: { US: { gdp: 100000, unemploymentRate: 0.1 } } };
    const a = createWorld({ ...OPTS, overrides });
    const b = createWorld({ ...OPTS, overrides });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // advance deterministically still
    for (let i = 0; i < 10; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("overrides applied before politician generation: politicians still deterministic", () => {
    const overrides = { countries: { US: { gdp: 999999 } } };
    const a = createWorld({ ...OPTS, overrides });
    const b = createWorld({ ...OPTS, overrides });
    expect(a.politicians).toEqual(b.politicians);
  });

  // -- validation errors --
  it("throws on unknown country id in overrides", () => {
    expect(() =>
      createWorld({
        ...OPTS,
        overrides: { countries: { ZZ: { gdp: 1000 } } },
      }),
    ).toThrow(/Unknown country/i);
  });

  it("throws on non-finite and bad bounds in overrides", () => {
    expect(() => createWorld({ ...OPTS, overrides: { playerCash: Infinity } })).toThrow(/finite/i);
    expect(() => createWorld({ ...OPTS, overrides: { playerCash: NaN } })).toThrow(/finite/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { gdp: 0 } } } })).toThrow(/gdp/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { gdp: -5 } } } })).toThrow(/gdp/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { gdp: Infinity } } } })).toThrow(/finite/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { growthRate: NaN } } } })).toThrow(/finite/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { inflationRate: Infinity } } } })).toThrow(/finite/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { unemploymentRate: -0.1 } } } })).toThrow(/unemploymentRate/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { unemploymentRate: 1.5 } } } })).toThrow(/unemploymentRate/i);
    expect(() => createWorld({ ...OPTS, overrides: { countries: { US: { unemploymentRate: NaN } } } })).toThrow(/finite/i);
  });

  it("overrides with empty object still deterministic", () => {
    const a = createWorld({ ...OPTS, overrides: {} });
    const b = createWorld({ ...OPTS });
    // empty overrides should give same as no overrides (playerCash default, no country changes)
    // except meta may differ? Both have same economy, so JSON should be same except maybe player cash same default
    expect(a.player.cash).toBe(b.player.cash);
    // worlds should be otherwise identical (except maybe same)
    a.meta.cheatsUsed = b.meta.cheatsUsed;
    expect(JSON.stringify(a.countries)).toBe(JSON.stringify(b.countries));
  });
});

// -- cheats --
describe("applyCheat", () => {
  it("setPlayerCash mutates and sets cheatsUsed", () => {
    const world = createWorld(OPTS);
    expect(world.meta.cheatsUsed).toBe(false);
    applyCheat(world, { kind: "setPlayerCash", amount: 5000 });
    expect(world.player.cash).toBe(5000);
    expect(world.meta.cheatsUsed).toBe(true);
  });

  it("setCountryEconomy mutates gdp and other fields and sets cheatsUsed", () => {
    const world = createWorld(OPTS);
    applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "gdp", value: 777777 });
    expect(world.countries["US"]!.economy.gdp).toBe(777777);
    expect(world.meta.cheatsUsed).toBe(true);
    applyCheat(world, { kind: "setCountryEconomy", countryId: "UK", field: "growthRate", value: 0.12 });
    expect(world.countries["UK"]!.economy.growthRate).toBe(0.12);
    applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "inflationRate", value: 0.05 });
    expect(world.countries["US"]!.economy.inflationRate).toBe(0.05);
    applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "unemploymentRate", value: 0.08 });
    expect(world.countries["US"]!.economy.unemploymentRate).toBe(0.08);
    applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "outputGap", value: 10 });
    expect(world.countries["US"]!.economy.outputGap).toBe(10);
  });

  it("advanceTurns loops the real advanceTurn", () => {
    const world = createWorld(OPTS);
    const expectedTurn = 5;
    applyCheat(world, { kind: "advanceTurns", count: 5 });
    expect(world.meta.turn).toBe(expectedTurn);
    expect(world.meta.cheatsUsed).toBe(true);
    // Compare to manual advanceTurn loop
    const manual = createWorld(OPTS);
    for (let i = 0; i < 5; i++) advanceTurn(manual);
    // Worlds should be deeply equal after same number of turns (cheatsUsed difference: manual is false, cheat is true)
    // So set cheatsUsed equal for comparison of other state
    manual.meta.cheatsUsed = true;
    expect(JSON.stringify(world)).toBe(JSON.stringify(manual));
  });

  it("addNews appends at current turn/date", () => {
    const world = createWorld(OPTS);
    const beforeLen = world.news.length;
    applyCheat(world, { kind: "addNews", headline: "Test headline" });
    expect(world.news.length).toBe(beforeLen + 1);
    const last = world.news[world.news.length - 1]!;
    expect(last.headline).toBe("Test headline");
    expect(last.turn).toBe(world.meta.turn);
    expect(last.date).toBe(world.meta.date);
    expect(world.meta.cheatsUsed).toBe(true);
    // advance then add again
    applyCheat(world, { kind: "advanceTurns", count: 1 });
    const turnAfter = world.meta.turn;
    const dateAfter = world.meta.date;
    applyCheat(world, { kind: "addNews", headline: "Second" });
    const last2 = world.news[world.news.length - 1]!;
    expect(last2.turn).toBe(turnAfter);
    expect(last2.date).toBe(dateAfter);
  });

  it("validation: finite values and bounds", () => {
    const world = createWorld(OPTS);
    expect(() => applyCheat(world, { kind: "setPlayerCash", amount: Infinity } as unknown as { kind: "setPlayerCash"; amount: number })).toThrow(/finite/i);
    expect(() => applyCheat(world, { kind: "setPlayerCash", amount: NaN } as unknown as { kind: "setPlayerCash"; amount: number })).toThrow(/finite/i);
    expect(world.meta.cheatsUsed).toBe(false);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "ZZ", field: "gdp", value: 1000 })).toThrow(/Unknown country/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "gdp", value: 0 })).toThrow(/gdp/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "gdp", value: -1 as number })).toThrow(/gdp/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "gdp", value: Infinity })).toThrow(/finite/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "unemploymentRate", value: 2 })).toThrow(/unemploymentRate/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "unemploymentRate", value: -0.01 })).toThrow(/unemploymentRate/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "outputGap", value: 100 })).toThrow(/outputGap/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "outputGap", value: -20 })).toThrow(/outputGap/i);
    expect(() => applyCheat(world, { kind: "setCountryEconomy", countryId: "US", field: "outputGap", value: NaN })).toThrow(/finite/i);
    expect(() => applyCheat(world, { kind: "advanceTurns", count: 0 })).toThrow(/count/i);
    expect(() => applyCheat(world, { kind: "advanceTurns", count: -1 })).toThrow(/count/i);
    expect(() => applyCheat(world, { kind: "advanceTurns", count: 1.5 })).toThrow(/count/i);
    expect(() => applyCheat(world, { kind: "advanceTurns", count: 100001 })).toThrow(/count/i);
    expect(() => applyCheat(world, { kind: "advanceTurns", count: Infinity } as unknown as { kind: "advanceTurns"; count: number })).toThrow(/count/i);
    expect(() => applyCheat(world, { kind: "addNews", headline: "" })).toThrow(/headline/i);
    expect(() => applyCheat(world, { kind: "addNews", headline: "   " })).toThrow(/headline/i);
    // ensure cheatsUsed not set on failed cheats
    expect(world.meta.cheatsUsed).toBe(false);
  });

  it("cheatsUsed persists through save and only set on success", () => {
    const world = createWorld(OPTS);
    expect(world.meta.cheatsUsed).toBe(false);
    expect(() => applyCheat(world, { kind: "setPlayerCash", amount: Infinity } as unknown as { kind: "setPlayerCash"; amount: number })).toThrow();
    expect(world.meta.cheatsUsed).toBe(false);
    applyCheat(world, { kind: "setPlayerCash", amount: 123 });
    expect(world.meta.cheatsUsed).toBe(true);
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const restored = deserializeSave(raw);
    expect(restored.meta.cheatsUsed).toBe(true);
  });
});

// -- migrations --
describe("save migration v4 -> v5", () => {
  it("migrates v4 save missing cheatsUsed to false", () => {
    const world = createWorld(OPTS);
    const rawV4 = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 4,
      savedAt: "2026-01-01T00:00:00Z",
      world: { ...world, meta: { ...world.meta, schemaVersion: 4, cheatsUsed: undefined as unknown as boolean } },
    });
    const parsed = JSON.parse(rawV4) as { world: Record<string, unknown> };
    delete (parsed.world["meta"] as Record<string, unknown>)["cheatsUsed"];
    const rawWithout = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 4, savedAt: "2026-01-01T00:00:00Z", world: parsed.world });
    const migrated = deserializeSave(rawWithout);
    expect(migrated.meta.cheatsUsed).toBe(false);
    expect(migrated.meta.schemaVersion).toBe(5);
  });

  it("preserves cheatsUsed true on round-trip", () => {
    const world = createWorld(OPTS);
    applyCheat(world, { kind: "setPlayerCash", amount: 999 });
    expect(world.meta.cheatsUsed).toBe(true);
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const restored = deserializeSave(raw);
    expect(restored.meta.cheatsUsed).toBe(true);
    expect(restored.meta.schemaVersion).toBe(5);
  });

  it("v1 save migrates through v2,v3,v4,v5", () => {
    const world = createWorld(OPTS);
    const rawV1 = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 1,
      savedAt: "2026-01-01T00:00:00Z",
      world: {
        ...world,
        politicians: undefined,
        parties: undefined,
        legislatures: undefined,
        countries: Object.fromEntries(
          Object.entries(world.countries).map(([k, v]) => [k, { ...v, economy: { gdp: v.economy.gdp, growthRate: v.economy.growthRate, inflationRate: v.economy.inflationRate, unemploymentRate: v.economy.unemploymentRate } }]),
        ),
        meta: { ...world.meta, schemaVersion: 1, cheatsUsed: undefined as unknown as boolean },
      },
    });
    const parsed = JSON.parse(rawV1) as { world: Record<string, unknown> };
    delete parsed.world["politicians"];
    delete parsed.world["parties"];
    delete parsed.world["legislatures"];
    delete (parsed.world["meta"] as Record<string, unknown>)["cheatsUsed"];
    const migrated = deserializeSave(JSON.stringify({ format: "ahdsolo-save", schemaVersion: 1, savedAt: "2026-01-01T00:00:00Z", world: parsed.world }));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.meta.schemaVersion).toBe(5);
    expect(migrated.meta.cheatsUsed).toBe(false);
    expect(Array.isArray((migrated as unknown as { politicians: unknown[] }).politicians)).toBe(true);
    for (const c of Object.values(migrated.countries)) {
      expect(Number.isFinite(c.economy.outputGap)).toBe(true);
    }
  });

  it("fresh world has cheatsUsed false and schema 5", () => {
    const world = createWorld(OPTS);
    expect(world.meta.cheatsUsed).toBe(false);
    expect(world.meta.schemaVersion).toBe(5);
  });
});
