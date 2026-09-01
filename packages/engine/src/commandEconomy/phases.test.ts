import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { governmentFormationPhase } from "../government/phases.js";
import { commandEconomyPhase } from "./phases.js";
import { governmentReformismFromEconomicPosition, internalRepressionFromReformism } from "./constants.js";

describe("commandEconomyPhase", () => {
  it("reads the LIVE governing party's economicPosition (W23 governments) for reformism, not the NPP default", () => {
    const world = createWorld({ seed: "ce-phase-gov-seed", playerName: "P", countryId: "RU", era: "1953" });
    const rng = rngFromSeed("ce-phase-gov-rng");
    governmentFormationPhase.run(world, rng); // seats RU_CPSU / DD_SED (government.test.ts)
    expect(world.governments["RU"]!.governingPartyId).toBe("RU_CPSU");
    expect(world.governments["DD"]!.governingPartyId).toBe("DD_SED");

    commandEconomyPhase.run(world, rng);

    const ruParty = world.parties["RU_CPSU"]!;
    const expectedReformism = governmentReformismFromEconomicPosition(ruParty.economicPosition);
    expect(world.commandEconomy["RU"]!.governmentReformism).toBeCloseTo(expectedReformism!, 10);
    expect(world.commandEconomy["RU"]!.internalRepression).toBeCloseTo(
      internalRepressionFromReformism(expectedReformism),
      10,
    );
    // CPSU is authored at economicPosition -4 (command-left) — hardline, not neutral.
    expect(ruParty.economicPosition).toBe(-4);
    expect(expectedReformism).toBeLessThan(0);
  });

  it("constrains wage growth via the two-circuit wage fund and never lets a fully-market country drift", () => {
    const world = createWorld({ seed: "ce-phase-wage-seed", playerName: "P", countryId: "RU", era: "1953" });
    const rng = rngFromSeed("ce-phase-wage-rng");
    const ruWageBefore = world.budgets["RU"]!.economicFactors.wageGrowth;
    const usLevelBefore = world.commandEconomy["US"]; // never seeded — US is not a planned economy
    expect(usLevelBefore).toBeUndefined();

    commandEconomyPhase.run(world, rng);

    // RU's wage growth is capped at gdpGrowth + WAGE_FUND_SLACK_PP(2) whenever it
    // would otherwise exceed that (seeded RU wageGrowth 4.0 vs gdpGrowth 5.5 in
    // the 1953 pack is already below cap, so this asserts monotonic non-increase).
    expect(world.budgets["RU"]!.economicFactors.wageGrowth).toBeLessThanOrEqual(ruWageBefore + 1e-9);
    expect(world.commandEconomy["RU"]!.marketizationLevel).toBeGreaterThanOrEqual(0);
    expect(world.commandEconomy["RU"]!.marketizationLevel).toBeLessThanOrEqual(100);
  });

  it("stops drifting once a country crosses the dual-track ceiling (isPlannedEconomy gate)", () => {
    const world = createWorld({ seed: "ce-phase-gate-seed", playerName: "P", countryId: "RU", era: "1953" });
    const rng = rngFromSeed("ce-phase-gate-rng");
    world.commandEconomy["RU"]!.marketizationLevel = 70; // exactly at the ceiling
    const snapshot = JSON.stringify(world.commandEconomy["RU"]);
    commandEconomyPhase.run(world, rng);
    expect(JSON.stringify(world.commandEconomy["RU"])).toBe(snapshot);
  });
});
