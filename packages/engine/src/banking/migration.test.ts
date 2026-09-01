import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave } from "../save.js";

describe("save migration v17 -> v28 (W12 banking)", () => {
  it("backfills player.savings/savingsHolder, bankLoans, depositInsurance, and centralBank.externalBroadMoney on a pre-banking save", () => {
    const v17World: Record<string, unknown> = {
      meta: { schemaVersion: 17, seed: "mig-bank-seed", rng: [1, 2, 3, 4], turn: 12, date: "1953-03-24", era: "1953" },
      countries: {
        US: { id: "US", name: "United States", playable: true, economy: { gdp: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: 0 } },
        UK: { id: "UK", name: "United Kingdom", playable: true, economy: { gdp: 40336, growthRate: 0.04, inflationRate: 0.03, unemploymentRate: 0.018, outputGap: 0 } },
      },
      player: { name: "Tester", countryId: "US", cash: 10000 },
      news: [],
      // Pre-populate centralBanks directly rather than relying on an
      // unrelated earlier wave's own migration block to create it — this
      // test exercises ONLY the v26->v28 banking block, not the v<17
      // central-bank-seeding migration (see centralBank.test.ts for that).
      centralBanks: {
        US: { countryId: "US", primeRate: 2.5, chairMode: "npp", chairAlignment: null, chairInfamy: 0, resolveStreak: 0, lastRateChangeTurn: null, chairTermExpiresAtTurn: 192, interestRateHistory: [], chairAppointedBy: null },
      },
    };
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 17, savedAt: "2026-01-01T00:00:00Z", world: v17World });
    const loaded = deserializeSave(raw);

    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(32);

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
