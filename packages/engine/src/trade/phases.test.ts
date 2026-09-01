import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { tradeGrowthMirrorPhase, tradeGrowthPhase } from "./phases.js";
import { advanceTradeGrowth, computeTradeGrowthTarget } from "./tradeGrowth.js";
import { isTradeBlocMember } from "./bloc.js";

describe("tradeGrowthPhase + tradeGrowthMirrorPhase", () => {
  it("updates economicFactors.tradeGrowth to the hand-verifiable formula result and mirrors it onto the paired central bank", () => {
    const world = createWorld({ seed: "trade-phase-seed", playerName: "P", countryId: "US", era: "1953" });
    const rng = rngFromSeed("trade-phase-rng");
    const before = world.budgets["US"]!.economicFactors.tradeGrowth;
    const usTaxRates = world.budgets["US"]!.taxRates;
    const expectedTarget = computeTradeGrowthTarget({
      tariffPct: usTaxRates.tariffs,
      foreignCorporateTaxPct: usTaxRates.foreignCorporateTax,
      blocMember: isTradeBlocMember(world, "US"),
      forexStrength: 0, // US exchangeRate rate === baseRate at turn 0
    });
    const expected = advanceTradeGrowth(before, expectedTarget);

    tradeGrowthPhase.run(world, rng);
    tradeGrowthMirrorPhase.run(world, rng);
    const after = world.budgets["US"]!.economicFactors.tradeGrowth;

    expect(after).toBeCloseTo(expected, 10);
    expect(world.centralBanks["US"]!.tradeGrowth).toBe(after);
    for (const [countryId, bank] of Object.entries(world.centralBanks)) {
      expect(bank.tradeGrowth).toBe(world.budgets[countryId]!.economicFactors.tradeGrowth);
    }
  });

  it("is deterministic given the same seed", () => {
    const w1 = createWorld({ seed: "trade-phase-det", playerName: "P", countryId: "US", era: "1953" });
    const w2 = createWorld({ seed: "trade-phase-det", playerName: "P", countryId: "US", era: "1953" });
    const rng1 = rngFromSeed("x");
    const rng2 = rngFromSeed("x");
    tradeGrowthPhase.run(w1, rng1);
    tradeGrowthPhase.run(w2, rng2);
    expect(JSON.stringify(w1.budgets)).toBe(JSON.stringify(w2.budgets));
  });
});
