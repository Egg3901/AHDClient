import { describe, expect, it } from "vitest";
import { PACKS, pack1953 } from "./packs/index.js";
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

  it("1953 pack has 27 countries and expected ids exist", () => {
    expect(pack1953.countries.length).toBe(27);
    const ids = new Set(pack1953.countries.map((c) => c.id));
    expect(ids.has("US")).toBe(true);
    expect(ids.has("UK")).toBe(true);
    expect(ids.has("RU")).toBe(true);
    // eastern bloc satellites
    expect(ids.has("PL")).toBe(true);
    expect(ids.has("BAL")).toBe(true);
  });

  it("1953 pack has parties for all playable countries", () => {
    const playable = new Set(pack1953.countries.filter((c) => c.playable).map((c) => c.id));
    const partyCountries = new Set((pack1953.parties ?? []).map((p) => p.countryId));
    for (const id of playable) expect(partyCountries.has(id)).toBe(true);
  });

  it("1960 pack parties match 1953 party count and ids (no invented 1960 roster)", async () => {
    const { pack1960 } = await import("./packs/index.js");
    expect(pack1960.parties?.length).toBe(pack1953.parties?.length);
    const ids53 = new Set(pack1953.parties!.map((p) => p.id));
    const ids60 = new Set(pack1960.parties!.map((p) => p.id));
    expect(ids60).toEqual(ids53);
  });

  it("every chamber composition sums to chamber seats", () => {
    for (const pack of PACKS) {
      for (const leg of pack.legislatures ?? []) {
        for (const ch of leg.chambers) {
          const sum = Object.values(ch.composition.seatsByParty).reduce((a, b) => a + b, 0) + ch.composition.vacancies;
          expect(sum, `${pack.era.id} ${leg.countryId} ${ch.key} sum ${sum} vs seats ${ch.seats}`).toBe(ch.seats);
        }
      }
    }
  });

  it("every party ref in legislature compositions resolves and matches legislature country", () => {
    for (const pack of PACKS) {
      const partyMap = new Map((pack.parties ?? []).map((p) => [p.id, p]));
      for (const leg of pack.legislatures ?? []) {
        for (const ch of leg.chambers) {
          for (const pid of Object.keys(ch.composition.seatsByParty)) {
            expect(partyMap.has(pid), `${pack.era.id} ${leg.countryId} ${ch.key} party ${pid} missing`).toBe(true);
            expect(partyMap.get(pid)!.countryId).toBe(leg.countryId);
          }
        }
      }
    }
  });

  it("rejects duplicate party ids", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.parties!.push({ ...bad.parties![0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate party/i);
  });

  it("rejects party with invalid country ref", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    bad.parties!.push({ id: "FAKE_X", name: "Fake", countryId: "ZZ", abbreviation: "FAK", color: "#000", economicPosition: 0, socialPosition: 0 });
    expect(() => validatePack(bad)).toThrow(/countryId.*ZZ/i);
  });

  it("rejects seatsByParty unknown party ref", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers[0]!.composition.seatsByParty["FAKE_PARTY"] = 1;
    // adjust vacancies to keep sum valid so the unknown party error fires first
    leg.chambers[0]!.composition.vacancies -= 1;
    expect(() => validatePack(bad)).toThrow(/unknown party/i);
  });

  it("rejects composition sum mismatch", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers[0]!.composition.vacancies += 1;
    expect(() => validatePack(bad)).toThrow(/composition sum/i);
  });

  it("rejects duplicate chamber keys", () => {
    const bad: SeedPack = structuredClone(PACKS[0]!) as SeedPack;
    const leg = bad.legislatures!.find((l) => l.countryId === "US")!;
    leg.chambers.push({ ...leg.chambers[0]! });
    expect(() => validatePack(bad)).toThrow(/duplicate chamber key/i);
  });

  it("playable countries have legislature entries with expected chambers and elected flags", () => {
    const usLeg = pack1953.legislatures!.find((l) => l.countryId === "US")!;
    expect(usLeg.bicameral).toBe(true);
    expect(usLeg.chambers.some((c) => c.key === "senate" && c.elected === true)).toBe(true);
    expect(usLeg.chambers.some((c) => c.key === "house" && c.elected === true)).toBe(true);
    const ukLeg = pack1953.legislatures!.find((l) => l.countryId === "UK")!;
    expect(ukLeg.bicameral).toBe(false);
    expect(ukLeg.chambers.find((c) => c.key === "lords")!.elected).toBe(false);
    expect(ukLeg.chambers.find((c) => c.key === "commons")!.elected).toBe(true);
    const ddLeg = pack1953.legislatures!.find((l) => l.countryId === "DD")!;
    expect(ddLeg.chambers.find((c) => c.key === "staatsrat")!.elected).toBe(false);
    expect(ddLeg.chambers.find((c) => c.key === "volkskammer")!.elected).toBe(true);
    const ruLeg = pack1953.legislatures!.find((l) => l.countryId === "RU")!;
    expect(ruLeg.bicameral).toBe(true);
    expect(ruLeg.chambers.find((c) => c.key === "sovietOfNationalities")!.seats).toBe(515);
    expect(ruLeg.chambers.find((c) => c.key === "sovietOfTheUnion")!.seats).toBe(526);
  });

  it("party economic/social positions are within [-5,5] and match engine axis system", () => {
    for (const pack of PACKS) {
      for (const p of pack.parties ?? []) {
        expect(p.economicPosition).toBeGreaterThanOrEqual(-5);
        expect(p.economicPosition).toBeLessThanOrEqual(5);
        expect(p.socialPosition).toBeGreaterThanOrEqual(-5);
        expect(p.socialPosition).toBeLessThanOrEqual(5);
      }
    }
  });
});
