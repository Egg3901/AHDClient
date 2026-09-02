import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "./world.js";
import { deserializeSave } from "./save.js";

describe("save migration v32 -> v34 (batch: W7 command economy + W8 trade + W14 sector cleanup)", () => {
  it("backfills commandEconomy, capitalStock, capitalGrowth, unownedSectors, stateOwnershipConcentration, and centralBank tradeGrowth on a pre-batch save", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(34);

    const world = createWorld({ seed: "mig-batch-econ-seed", playerName: "Tester", countryId: "US", era: "1953" });
    const stripped = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    // Strip the v34 fields and roll schemaVersion back to v32 (pre-batch), as
    // if this were a save created before this batch landed.
    delete stripped["commandEconomy"];
    delete stripped["capitalStock"];
    delete stripped["capitalGrowth"];
    delete stripped["unownedSectors"];
    for (const budget of Object.values(stripped["budgets"] as Record<string, Record<string, unknown>>)) {
      delete budget["stateOwnershipConcentration"];
    }
    for (const bank of Object.values(stripped["centralBanks"] as Record<string, Record<string, unknown>>)) {
      delete bank["tradeGrowth"];
    }
    (stripped["meta"] as Record<string, unknown>)["schemaVersion"] = 32;

    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 32, savedAt: "2026-01-01T00:00:00Z", world: stripped });
    const loaded = deserializeSave(raw);

    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);

    // commandEconomy: RU and DD (the only MARKETIZATION_SCHEDULE entries), seeded
    // at the 1953 schedule level (10 for both).
    expect(Object.keys(loaded.commandEconomy).sort()).toEqual(["DD", "RU"]);
    expect(loaded.commandEconomy["RU"]!.marketizationLevel).toBe(10);
    expect(loaded.commandEconomy["DD"]!.marketizationLevel).toBe(10);
    expect(loaded.commandEconomy["RU"]!.monetaryOverhang).toBe(0);

    // capitalStock: one entry per region, capitalGrowth empty (cold start).
    expect(Object.keys(loaded.capitalStock).sort()).toEqual(Object.keys(world.regions).sort());
    for (const [rid, region] of Object.entries(loaded.regions)) {
      if (typeof region.gdp === "number") {
        expect(loaded.capitalStock[rid]).toBeCloseTo(3 * region.gdp, 6);
      }
    }
    expect(loaded.capitalGrowth).toEqual({});

    // unownedSectors: one pool per existing corp.
    expect(Object.keys(loaded.unownedSectors).sort()).toEqual(
      Object.values(world.corporations).map((c) => `${c.countryId}:${c.sectorType}`).sort(),
    );

    // stateOwnershipConcentration backfilled to 0 on every budget.
    for (const budget of Object.values(loaded.budgets)) {
      expect(budget.stateOwnershipConcentration).toBe(0);
    }

    // centralBank.tradeGrowth backfilled from the paired budget's economicFactors.
    for (const [countryId, bank] of Object.entries(loaded.centralBanks)) {
      expect(bank.tradeGrowth).toBe(loaded.budgets[countryId]?.economicFactors.tradeGrowth ?? 0);
    }

    // Deterministic given the same input.
    const loaded2 = deserializeSave(raw);
    expect(JSON.stringify(loaded.commandEconomy)).toBe(JSON.stringify(loaded2.commandEconomy));
    expect(JSON.stringify(loaded.capitalStock)).toBe(JSON.stringify(loaded2.capitalStock));
    expect(JSON.stringify(loaded.unownedSectors)).toBe(JSON.stringify(loaded2.unownedSectors));
  });

  it("is idempotent on an already-current save (does not clobber a live drifted commandEconomy state)", () => {
    const world = createWorld({ seed: "mig-batch-econ-idem", playerName: "P", countryId: "RU", era: "1953" });
    world.commandEconomy["RU"]!.marketizationLevel = 42;
    world.commandEconomy["RU"]!.monetaryOverhang = 17;
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: SCHEMA_VERSION, savedAt: "2026-01-01T00:00:00Z", world });
    const loaded = deserializeSave(raw);
    expect(loaded.commandEconomy["RU"]!.marketizationLevel).toBe(42);
    expect(loaded.commandEconomy["RU"]!.monetaryOverhang).toBe(17);
    expect(JSON.stringify(loaded.capitalStock)).toBe(JSON.stringify(world.capitalStock));
    expect(JSON.stringify(loaded.unownedSectors)).toBe(JSON.stringify(world.unownedSectors));
  });
});
