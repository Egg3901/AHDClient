import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave } from "../save.js";

describe("save migration v17 -> v28 (W12 banking)", () => {
  it("backfills player.savings/savingsHolder, bankLoans, depositInsurance, and centralBank.externalBroadMoney on a pre-banking save", () => {
    const v17World = structuredClone(
      createWorld({ seed: "mig-bank-seed", playerName: "Tester", countryId: "US", era: "1953" }),
    ) as unknown as Record<string, unknown>;
    (v17World["meta"] as Record<string, unknown>)["schemaVersion"] = 17;
    const player = v17World["player"] as Record<string, unknown>;
    delete player["savings"];
    delete player["savingsHolder"];
    delete v17World["bankLoans"];
    delete v17World["depositInsurance"];
    for (const bank of Object.values(v17World["centralBanks"] as Record<string, Record<string, unknown>>)) {
      delete bank["externalBroadMoney"];
    }
    for (const corporation of Object.values(v17World["corporations"] as Record<string, Record<string, unknown>>)) {
      delete corporation["bankCharter"];
    }
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 17, savedAt: "2026-01-01T00:00:00Z", world: v17World });
    const loaded = deserializeSave(raw);

    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(SCHEMA_VERSION);

    expect(loaded.player.savings).toBe(0);
    expect(loaded.player.savingsHolder).toBe("centralBank");
    expect(Array.isArray(loaded.bankLoans)).toBe(true);
    expect(loaded.bankLoans).toEqual([]);
    expect(typeof loaded.depositInsurance).toBe("object");
    expect(loaded.depositInsurance).toEqual({});

    // Central banks seeded by the v0->v17 chain get a proportional externalBroadMoney.
    const usBank = loaded.centralBanks["US"];
    expect(usBank).toBeDefined();
    expect(Number.isFinite(usBank!.externalBroadMoney)).toBe(true);
    expect(usBank!.externalBroadMoney).toBeGreaterThan(0);

    // No bank charters are retroactively chartered on an old save (see save.ts
    // v26->v28 migration comment: seedNpcBanks moves real cash and only runs
    // for worlds CREATED after this wave).
    for (const corp of Object.values(loaded.corporations)) {
      expect(corp.bankCharter).toBeUndefined();
    }

    // Deterministic given the same input.
    const loaded2 = deserializeSave(raw);
    expect(loaded.player.savings).toBe(loaded2.player.savings);
    expect(JSON.stringify(loaded.centralBanks)).toBe(JSON.stringify(loaded2.centralBanks));
  });

  it("is idempotent on an already-current save (does not clobber a real chartered bank)", () => {
    const world = createWorld({ seed: "mig-bank-idem", playerName: "P", countryId: "US", era: "1953" });
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: SCHEMA_VERSION, savedAt: "2026-01-01T00:00:00Z", world });
    const loaded = deserializeSave(raw);
    expect(JSON.stringify(loaded.corporations)).toBe(JSON.stringify(world.corporations));
    expect(JSON.stringify(loaded.centralBanks)).toBe(JSON.stringify(world.centralBanks));
    expect(loaded.player.savings).toBe(world.player.savings);
    expect(loaded.player.savingsHolder).toBe(world.player.savingsHolder);
  });

  it("preserves an existing player.savings balance from a save already carrying the field", () => {
    const world = createWorld({ seed: "mig-bank-preserve", playerName: "P", countryId: "US", era: "1953" });
    world.player.savings = 4321;
    world.player.savingsHolder = "US-financial";
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: SCHEMA_VERSION, savedAt: "2026-01-01T00:00:00Z", world });
    const loaded = deserializeSave(raw);
    expect(loaded.player.savings).toBe(4321);
    expect(loaded.player.savingsHolder).toBe("US-financial");
  });
});
