import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import {
  advanceCapitalStockPhase,
  stateOwnershipConcentrationPhase,
  unownedSectorGrowthPhase,
} from "./phases.js";
import { commandEconomyPhase } from "../commandEconomy/phases.js";
import { seedCapitalStock } from "./capitalStock.js";

describe("advanceCapitalStockPhase", () => {
  it("advances every region's capital stock and rolls up capitalGrowth per country", () => {
    const world = createWorld({ seed: "capstock-phase-seed", playerName: "P", countryId: "US", era: "1953" });
    const rng = rngFromSeed("capstock-phase-rng");
    const before = { ...world.capitalStock };
    advanceCapitalStockPhase.run(world, rng);
    // Every region moved (or stayed exactly at steady state — but with the
    // seed's actual GDP/prime-rate mix at least one region should move).
    let anyChanged = false;
    for (const [rid, k] of Object.entries(world.capitalStock)) {
      if (k !== before[rid]) anyChanged = true;
      expect(Number.isFinite(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
    }
    expect(anyChanged).toBe(true);
    for (const countryId of Object.keys(world.countries)) {
      if (!world.countries[countryId]!.playable) continue;
      expect(Number.isFinite(world.capitalGrowth[countryId] ?? 0)).toBe(true);
    }
  });

  it("seeds capital at CAPITAL_OUTPUT_RATIO_TARGET × region gdp at world creation", () => {
    const world = createWorld({ seed: "capstock-seed-check", playerName: "P", countryId: "US", era: "1953" });
    for (const [rid, region] of Object.entries(world.regions)) {
      if (typeof region.gdp === "number") {
        expect(world.capitalStock[rid]).toBeCloseTo(seedCapitalStock(region.gdp), 6);
      }
    }
  });
});

describe("unownedSectorGrowthPhase", () => {
  it("grows every unowned-sector pool paired to its corp's growth rate", () => {
    const world = createWorld({ seed: "unowned-phase-seed", playerName: "P", countryId: "US", era: "1953" });
    const rng = rngFromSeed("unowned-phase-rng");
    const before = { ...world.unownedSectors };
    unownedSectorGrowthPhase.run(world, rng);
    for (const [key, state] of Object.entries(world.unownedSectors)) {
      expect(state.revenue).toBeGreaterThanOrEqual(before[key]!.revenue);
      expect(Number.isFinite(state.revenue)).toBe(true);
    }
  });
});

describe("commandEconomyPhase + stateOwnershipConcentrationPhase", () => {
  it("RU/DD drift a nonzero SOCI from the live marketization dial; US/UK stay at 0", () => {
    const world = createWorld({ seed: "soci-phase-seed", playerName: "P", countryId: "RU", era: "1953" });
    const rng = rngFromSeed("soci-phase-rng");
    commandEconomyPhase.run(world, rng);
    stateOwnershipConcentrationPhase.run(world, rng);
    expect(world.budgets["RU"]!.stateOwnershipConcentration).toBeGreaterThan(0);
    expect(world.budgets["DD"]!.stateOwnershipConcentration).toBeGreaterThan(0);
    expect(world.budgets["US"]!.stateOwnershipConcentration).toBe(0);
    expect(world.budgets["UK"]!.stateOwnershipConcentration).toBe(0);
  });
});

describe("W14 phases determinism", () => {
  it("produce byte-identical output given the same seed", () => {
    const w1 = createWorld({ seed: "w14-det", playerName: "P", countryId: "RU", era: "1953" });
    const w2 = createWorld({ seed: "w14-det", playerName: "P", countryId: "RU", era: "1953" });
    const r1 = rngFromSeed("y");
    const r2 = rngFromSeed("y");
    advanceCapitalStockPhase.run(w1, r1);
    unownedSectorGrowthPhase.run(w1, r1);
    commandEconomyPhase.run(w1, r1);
    stateOwnershipConcentrationPhase.run(w1, r1);
    advanceCapitalStockPhase.run(w2, r2);
    unownedSectorGrowthPhase.run(w2, r2);
    commandEconomyPhase.run(w2, r2);
    stateOwnershipConcentrationPhase.run(w2, r2);
    expect(JSON.stringify(w1.capitalStock)).toBe(JSON.stringify(w2.capitalStock));
    expect(JSON.stringify(w1.unownedSectors)).toBe(JSON.stringify(w2.unownedSectors));
    expect(JSON.stringify(w1.commandEconomy)).toBe(JSON.stringify(w2.commandEconomy));
    expect(JSON.stringify(w1.budgets)).toBe(JSON.stringify(w2.budgets));
  });
});
