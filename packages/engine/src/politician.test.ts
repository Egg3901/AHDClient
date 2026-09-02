import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "./world.js";
import { deserializeSave, serializeSave } from "./save.js";
import { isNameFromCountryPool } from "./npp/nameGenerator.js";

const OPTS_1953_US = { seed: "politician-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;
const OPTS_1979_DD = { seed: "politician-seed", playerName: "Tester", countryId: "DD", era: "1979" } as const;

describe("politician generation", () => {
  it("is deterministic: identical options give identical casts", () => {
    const a = createWorld(OPTS_1953_US);
    const b = createWorld(OPTS_1953_US);
    expect(a.politicians).toEqual(b.politicians);
    // different seed gives different cast
    const c = createWorld({ ...OPTS_1953_US, seed: "other-seed" });
    expect(JSON.stringify(a.politicians)).not.toBe(JSON.stringify(c.politicians));
  });

  it("politician count per chamber equals allocated seats", () => {
    for (const era of ["1953", "1979"] as const) {
      const world = createWorld({ seed: "seat-count", playerName: "P", countryId: "US", era });
      // group politicians by country:chamber
      const byChamber = new Map<string, number>();
      for (const pol of world.politicians) {
        const key = `${pol.countryId}:${pol.chamberKey}`;
        byChamber.set(key, (byChamber.get(key) ?? 0) + 1);
      }
      // every elected chamber's seatsByParty sum should match politician count
      for (const leg of Object.values(world.legislatures)) {
        for (const ch of leg.chambers) {
          if (!ch.elected) continue;
          const allocated = Object.values(ch.composition.seatsByParty).reduce((s, n) => s + n, 0);
          const held = byChamber.get(`${leg.countryId}:${ch.key}`) ?? 0;
          expect(held, `${era} ${leg.countryId} ${ch.key} held ${held} allocated ${allocated}`).toBe(allocated);
        }
      }
    }
  });

  it("total politician count matches sum of allocated seats in elected chambers of playable countries", () => {
    const world = createWorld(OPTS_1953_US);
    let expected = 0;
    for (const leg of Object.values(world.legislatures)) {
      for (const ch of leg.chambers) {
        if (!ch.elected) continue;
        expected += Object.values(ch.composition.seatsByParty).reduce((s, n) => s + n, 0);
      }
    }
    expect(world.politicians.length).toBe(expected);
    // spot check known 1953 elected national seats with allocations:
    // US house 213+221=434, US senate 47+48=95, RU union 398 + nationalities 388 =786, DD volkskammer 500
    // total allocated = 434+95+786+500 = 1815
    expect(expected).toBe(1815);
    expect(world.politicians.length).toBe(1815);
  });

  it("party consistency: each politician's party belongs to their country and exists in parties map", () => {
    const world = createWorld(OPTS_1953_US);
    const partyIds = new Set(Object.keys(world.parties));
    for (const pol of world.politicians) {
      expect(partyIds.has(pol.partyId), `unknown party ${pol.partyId} for ${pol.id}`).toBe(true);
      expect(world.parties[pol.partyId]!.countryId, pol.id).toBe(pol.countryId);
    }
  });

  it("chamber key matches a real elected chamber of that country", () => {
    const world = createWorld(OPTS_1953_US);
    for (const pol of world.politicians) {
      const leg = world.legislatures[pol.countryId];
      expect(leg, `no legislature for ${pol.countryId}`).toBeDefined();
      const chamber = leg!.chambers.find((c) => c.key === pol.chamberKey);
      expect(chamber, `${pol.id} chamber ${pol.chamberKey} not found`).toBeDefined();
      expect(chamber!.elected, `${pol.id} chamber should be elected`).toBe(true);
    }
  });

  it("ids are deterministic and sequential per country", () => {
    const world = createWorld(OPTS_1953_US);
    const byCountry = new Map<string, string[]>();
    for (const pol of world.politicians) {
      const list = byCountry.get(pol.countryId) ?? [];
      list.push(pol.id);
      byCountry.set(pol.countryId, list);
    }
    for (const [countryId, ids] of byCountry) {
      expect(ids.length).toBeGreaterThan(0);
      // should be "COUNTRY-1" ... "COUNTRY-N" in order of appearance
      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(`${countryId}-${i + 1}`);
      }
      // no duplicate ids overall
      expect(new Set(ids).size).toBe(ids.length);
    }
    // global uniqueness
    expect(new Set(world.politicians.map((p) => p.id)).size).toBe(world.politicians.length);
  });

  it("ideology within bounds -5..5 and centered near party position", () => {
    const world = createWorld(OPTS_1953_US);
    for (const pol of world.politicians) {
      expect(pol.ideology.economic).toBeGreaterThanOrEqual(-5);
      expect(pol.ideology.economic).toBeLessThanOrEqual(5);
      expect(pol.ideology.social).toBeGreaterThanOrEqual(-5);
      expect(pol.ideology.social).toBeLessThanOrEqual(5);
      // rounded to 1 decimal
      expect(Math.round(pol.ideology.economic * 10) / 10).toBe(pol.ideology.economic);
      expect(Math.round(pol.ideology.social * 10) / 10).toBe(pol.ideology.social);
      // within jitter window +/-1.2 of party (with clamp edge cases allowing more)
      const party = world.parties[pol.partyId]!;
      // clamp bounds may allow up to 5 even if party at -4, so check distance with clamp-aware tolerance
      const maxJitter = 1.25; // slightly above 1.2 for float
      // If not clamped, distance should be within jitter; if clamped, value at bound
      if (pol.ideology.economic !== 5 && pol.ideology.economic !== -5) {
        expect(Math.abs(pol.ideology.economic - party.economicPosition)).toBeLessThanOrEqual(maxJitter);
      }
      if (pol.ideology.social !== 5 && pol.ideology.social !== -5) {
        expect(Math.abs(pol.ideology.social - party.socialPosition)).toBeLessThanOrEqual(maxJitter);
      }
    }
    // centered: mean ideology per party should be within 0.3 of party position (large sample)
    const byParty = new Map<string, { economic: number[]; social: number[] }>();
    for (const pol of world.politicians) {
      const arr = byParty.get(pol.partyId) ?? { economic: [], social: [] };
      arr.economic.push(pol.ideology.economic);
      arr.social.push(pol.ideology.social);
      byParty.set(pol.partyId, arr);
    }
    for (const [partyId, vals] of byParty) {
      const party = world.parties[partyId]!;
      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      // All parties with >20 seats should have mean within 0.3 of party position
      if (vals.economic.length >= 20) {
        expect(Math.abs(mean(vals.economic) - party.economicPosition), `${partyId} economic mean`).toBeLessThan(0.35);
        expect(Math.abs(mean(vals.social) - party.socialPosition), `${partyId} social mean`).toBeLessThan(0.35);
      }
    }
  });

  it("age in plausible bounds 30..72", () => {
    const world = createWorld(OPTS_1953_US);
    for (const pol of world.politicians) {
      expect(pol.age).toBeGreaterThanOrEqual(30);
      expect(pol.age).toBeLessThanOrEqual(72);
      expect(Number.isInteger(pol.age)).toBe(true);
    }
    // not all same age
    const ages = new Set(world.politicians.map((p) => p.age));
    expect(ages.size).toBeGreaterThan(10);
  });

  it("name pools match country via isNameFromCountryPool or US fallback", () => {
    const world = createWorld(OPTS_1953_US);
    // Every politician's name should be plausibly from their country's pool
    // Countries with dedicated pools (US, UK, RU, DD) must pass membership check.
    // For world determinism we just verify the pool check for those with pools.
    const poolCountries = new Set(["UK", "RU", "DD", "US"]);
    for (const pol of world.politicians) {
      if (poolCountries.has(pol.countryId)) {
        // US names are always from US pool; use isNameFromCountryPool for non-US
        // For US we skip strict check because US pool is very large; just check non-empty
        if (pol.countryId !== "US") {
          expect(isNameFromCountryPool(pol.name, pol.countryId), `${pol.countryId} name ${pol.name} not in pool`).toBe(true);
        } else {
          expect(pol.name.trim().length).toBeGreaterThan(2);
          expect(pol.name.split(/\s+/).length).toBeGreaterThanOrEqual(2);
        }
      }
    }
    // Spot: DD names should use DE surnames + DD/DE first names (checked via pool helper)
    const ddPols = world.politicians.filter((p) => p.countryId === "DD");
    expect(ddPols.length).toBeGreaterThan(0);
    // RU names also checked above
    const ruPols = world.politicians.filter((p) => p.countryId === "RU");
    expect(ruPols.length).toBeGreaterThan(0);
  });

  it("appointed chambers produce no politicians and vacancies stay vacant", () => {
    const world = createWorld(OPTS_1953_US);
    const appointedKeys = new Set(
      Object.values(world.legislatures)
        .flatMap((leg) => leg.chambers.filter((c) => !c.elected).map((c) => `${leg.countryId}:${c.key}`)),
    );
    expect(appointedKeys.size).toBeGreaterThan(0);
    for (const pol of world.politicians) {
      expect(appointedKeys.has(`${pol.countryId}:${pol.chamberKey}`), `${pol.id} in appointed chamber`).toBe(false);
    }
    // vacancies: US senate has 5 vacancies, house 1; no politician should be assigned for a vacancy
    // Count already validated equals seatsByParty sum, which excludes vacancies.
    const usSenate = world.legislatures["US"]!.chambers.find((c) => c.key === "senate")!;
    expect(usSenate.composition.vacancies).toBe(5);
    const senatePols = world.politicians.filter((p) => p.countryId === "US" && p.chamberKey === "senate");
    expect(senatePols.length).toBe(95); // 47+48
  });

  it("subnational elected chambers with no allocated seats stay empty (this wave)", () => {
    const world = createWorld(OPTS_1953_US);
    // These subnational elected chambers have all vacancies (no seatsByParty) -> no politicians
    expect(world.politicians.filter((p) => p.chamberKey === "stateSenate").length).toBe(0);
    expect(world.politicians.filter((p) => p.chamberKey === "regionalCouncil").length).toBe(0);
    expect(world.politicians.filter((p) => p.chamberKey === "republicSupremeSoviet").length).toBe(0);
    expect(world.politicians.filter((p) => p.chamberKey === "landAssembly").length).toBe(0);
  });

  it("deterministic across eras and countries", () => {
    const a = createWorld(OPTS_1979_DD);
    const b = createWorld(OPTS_1979_DD);
    expect(JSON.stringify(a.politicians)).toBe(JSON.stringify(b.politicians));
    // same seed across eras still deterministic per era
    const c = createWorld({ seed: "same", playerName: "P", countryId: "US", era: "1979" });
    const d = createWorld({ seed: "same", playerName: "P", countryId: "US", era: "1979" });
    expect(JSON.stringify(c.politicians)).toBe(JSON.stringify(d.politicians));
  });
});

describe("politician save migration v3->v4", () => {
  it("migrates old saves with missing politicians to empty array", () => {
    // Simulate a v3 save (pre-politicians) by manually crafting a save envelope
    const world = createWorld(OPTS_1953_US);
    const rawV3 = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 3,
      savedAt: "2026-01-01T00:00:00Z",
      world: { ...world, politicians: undefined, meta: { ...world.meta, schemaVersion: 3 } },
    });
    // Delete politicians key to simulate pre-v4 save
    const parsed = JSON.parse(rawV3) as Record<string, unknown>;
    const w = (parsed as { world: Record<string, unknown> }).world;
    delete w["politicians"];
    const rawWithout = JSON.stringify(parsed);
    const migrated = deserializeSave(rawWithout);
    expect(Array.isArray(migrated.politicians)).toBe(true);
    expect(migrated.politicians.length).toBe(0);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("preserves existing politicians on round-trip and v4 save rehydrates correctly", () => {
    const world = createWorld(OPTS_1953_US);
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const restored = deserializeSave(raw);
    expect(restored.politicians).toEqual(world.politicians);
    expect(restored.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("v1 save migrates through v2, v3, v4", () => {
    const world = createWorld(OPTS_1953_US);
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
        meta: { ...world.meta, schemaVersion: 1 },
      },
    });
    // Strip optional fields to mimic v1 on-disk shape
    const parsed = JSON.parse(rawV1) as { world: Record<string, unknown> };
    delete parsed.world["politicians"];
    delete parsed.world["parties"];
    delete parsed.world["legislatures"];
    const migrated = deserializeSave(JSON.stringify({ format: "ahdsolo-save", schemaVersion: 1, savedAt: "2026-01-01T00:00:00Z", world: parsed.world }));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Array.isArray((migrated as unknown as { politicians: unknown[] }).politicians)).toBe(true);
  });
});
