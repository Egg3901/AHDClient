import { describe, expect, it } from "vitest";
import { PACKS } from "./packs/index.js";
import { validatePack } from "./validate.js";
import type { SeedPack } from "./types.js";

describe("validatePack", () => {
  it("accepts every shipped pack", () => {
    for (const pack of PACKS) {
      expect(() => validatePack(pack)).not.toThrow();
    }
  });

  it("rejects duplicate country ids", () => {
    const dup: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    dup.countries.push({ ...dup.countries[0]! });
    expect(() => validatePack(dup)).toThrow(/duplicate/i);
  });

  it("rejects no playable countries", () => {
    const noPlay: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    for (const c of noPlay.countries) c.playable = false;
    expect(() => validatePack(noPlay)).toThrow(/playable/i);
  });

  it("rejects bad dates", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.era.startDate = "1953-13-01";
    expect(() => validatePack(bad)).toThrow(/date/i);
    const bad2 = structuredClone(PACKS[0]!) as SeedPack;
    bad2.era.startDate = "not-a-date";
    expect(() => validatePack(bad2)).toThrow(/date/i);
  });

  it("rejects non-finite numbers", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.countries[0]!.economy.gdp = Infinity;
    expect(() => validatePack(bad)).toThrow(/gdp/i);
    const bad2 = structuredClone(PACKS[0]!) as SeedPack;
    bad2.countries[0]!.economy.growthRate = NaN;
    expect(() => validatePack(bad2)).toThrow(/growthRate/i);
  });

  it("rejects invalid packVersion", () => {
    const bad = structuredClone(PACKS[0]!) as SeedPack;
    (bad as unknown as Record<string, unknown>)["packVersion"] = 0;
    expect(() => validatePack(bad)).toThrow(/packVersion/i);
  });
});
