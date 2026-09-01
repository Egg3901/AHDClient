import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { seedNpcBanks } from "./npcBanks.js";
import { CHARTER_CAPITAL_LIQUID_CAPITAL_FRACTION } from "./constants.js";

const OPTS = { seed: "npcbanks-test", playerName: "P", countryId: "US", era: "1953" };

describe("seedNpcBanks", () => {
  it("charters exactly one bank per playable country (US/UK/RU/DD)", () => {
    const world = createWorld(OPTS);
    const chartered = Object.values(world.corporations).filter((c) => c.bankCharter?.status === "active");
    const playableCountries = Object.values(world.countries).filter((c) => c.playable);
    expect(chartered.length).toBe(playableCountries.length);
    for (const country of playableCountries) {
      const corp = world.corporations[`${country.id}-financial`];
      expect(corp?.bankCharter?.status).toBe("active");
    }
  });

  it("is idempotent: re-running does not re-charter or move more cash", () => {
    const world = createWorld(OPTS);
    const before = JSON.stringify(world.corporations);
    const result = seedNpcBanks(world);
    expect(result.chartered).toBe(0);
    expect(JSON.stringify(world.corporations)).toBe(before);
  });

  it("moves real cash from liquidCapital into the charter (conservation, not creation)", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    // Posted capital = the fraction of ORIGINAL liquidCapital, and corp.liquidCapital
    // was reduced by exactly that amount (no cash conjured or destroyed).
    const originalLiquidCapital = corp.liquidCapital + charter.postedCapital;
    expect(charter.postedCapital).toBeCloseTo(originalLiquidCapital * CHARTER_CAPITAL_LIQUID_CAPITAL_FRACTION, 0);
    expect(charter.cashReserves).toBe(charter.postedCapital);
  });

  it("charter starts with zero deposits/loans and green confidence", () => {
    const world = createWorld(OPTS);
    const charter = world.corporations["US-financial"]!.bankCharter!;
    expect(charter.npcDeposits).toBe(0);
    expect(charter.totalLoans).toBe(0);
    expect(charter.confidence).toBe(1);
    expect(charter.warningBand).toBe("green");
    expect(charter.lendingProfile).toBe("balanced");
  });

  it("deterministic: identical seed produces byte-identical charters", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
  });
});
