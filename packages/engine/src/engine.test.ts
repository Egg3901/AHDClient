import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import { createWorld, listEras, listPlayableCountries } from "./world.js";
import { rngFromSeed, rngFromState } from "./rng.js";
import { dateForTurn, eraForDate } from "./calendar.js";
import { PACKS } from "@rotunda/content";
import { validatePack } from "@rotunda/content";

const OPTS = { seed: "test-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = rngFromSeed("alpha");
    const b = rngFromSeed("alpha");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("differs across seeds", () => {
    expect(rngFromSeed("alpha").next()).not.toBe(rngFromSeed("beta").next());
  });

  it("resumes exactly from serialized state", () => {
    const a = rngFromSeed("alpha");
    for (let i = 0; i < 10; i++) a.next();
    const b = rngFromState(a.state());
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it("int stays in bounds and pick rejects empty", () => {
    const rng = rngFromSeed("bounds");
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
    expect(() => rng.pick([])).toThrow();
  });
});

describe("calendar", () => {
  it("maps turns to weekly dates from the 1953 start", () => {
    expect(dateForTurn(0)).toBe("1953-01-06");
    expect(dateForTurn(1)).toBe("1953-01-13");
    expect(dateForTurn(52)).toBe("1954-01-05");
  });

  it("crosses era thresholds by year", () => {
    expect(eraForDate("1959-12-29")).toBe("1953");
    expect(eraForDate("1960-01-05")).toBe("1960");
    expect(eraForDate("1976-01-06")).toBe("1976");
  });
});

describe("advanceTurn", () => {
  it("produces identical worlds for identical seeds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is unaffected by a save/load round trip mid-campaign", () => {
    const straight = createWorld(OPTS);
    const reloaded = createWorld(OPTS);
    for (let i = 0; i < 10; i++) advanceTurn(straight);
    let world = reloaded;
    for (let i = 0; i < 5; i++) advanceTurn(world);
    world = deserializeSave(serializeSave(world, "2026-01-01T00:00:00Z"));
    for (let i = 0; i < 5; i++) advanceTurn(world);
    expect(JSON.stringify(world)).toBe(JSON.stringify(straight));
  });

  it("advances the date weekly and reports phase timings", () => {
    const world = createWorld(OPTS);
    const report = advanceTurn(world);
    expect(world.meta.turn).toBe(1);
    expect(world.meta.date).toBe("1953-01-13");
    expect(report.phaseTimings.map((p) => p.name)).toEqual([
      "advanceCalendar",
      "partyInfluenceTurn",
      "caucusTax",
      "macroCountryTurn",
      "partyOrgTurn",
      "partyTierTurn",
      "partyActionGeneration",
      "expireCharters",
      "emptyPartyCleanup",
      "partyMemberCountReconcile",
      "newsMaintenance",
    ]);
  });

  it("fires an era transition news item at 1960", () => {
    const world = createWorld(OPTS);
    while (world.meta.era === "1953") advanceTurn(world);
    expect(world.meta.era).toBe("1960");
    expect(world.news.some((n) => n.headline.includes("new era"))).toBe(true);
  });
});

describe("save", () => {
  it("rejects garbage and future schema versions", () => {
    expect(() => deserializeSave("not json")).toThrow("unparseable");
    expect(() => deserializeSave('{"format":"other"}')).toThrow("format marker");
    const world = createWorld(OPTS);
    world.meta.schemaVersion = 999;
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    expect(() => deserializeSave(raw)).toThrow("newer version");
  });
});

describe("seed packs integration", () => {
  it("every shipped pack validates", () => {
    for (const pack of PACKS) {
      expect(() => validatePack(pack)).not.toThrow();
    }
  });

  it("listEras returns shipped eras sorted by startDate", () => {
    const eras = listEras();
    expect(eras.map((e) => e.id)).toEqual(["1953", "1960"]);
    expect(eras[0]!.startDate).toBe("1953-01-06");
    expect(eras[1]!.startDate).toBe("1960-01-05");
  });

  it("listPlayableCountries returns playable subset per era", () => {
    for (const era of listEras()) {
      const list = listPlayableCountries(era.id);
      expect(list.length).toBeGreaterThan(0);
      expect(list.some((c) => c.id === "US")).toBe(true);
      expect(list.some((c) => c.id === "UK")).toBe(true);
    }
  });

  it("createWorld succeeds for every era and playable country and is deterministic", () => {
    for (const era of listEras()) {
      const playable = listPlayableCountries(era.id);
      for (const country of playable) {
        const opts = { seed: "determinism-seed", playerName: "Tester", countryId: country.id, era: era.id };
        const a = createWorld(opts);
        const b = createWorld(opts);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(a.meta.era).toBe(era.id);
        expect(a.meta.date).toBe(era.startDate);
        expect(a.player.countryId).toBe(country.id);
        // world contains all countries from pack
        expect(Object.keys(a.countries).length).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("createWorld throws on unknown era", () => {
    expect(() => createWorld({ seed: "s", playerName: "P", countryId: "US", era: "2099" })).toThrow(/Unknown era/i);
  });

  it("createWorld throws on non-playable country", () => {
    // FR is non-playable (economy-preview in 1953-default)
    expect(() => createWorld({ seed: "s", playerName: "P", countryId: "FR", era: "1953" })).toThrow(/not playable/i);
  });

  it("createWorld throws on unknown country", () => {
    expect(() => createWorld({ seed: "s", playerName: "P", countryId: "zz", era: "1953" })).toThrow(/Unknown country/i);
  });

  it("listPlayableCountries throws on unknown era", () => {
    expect(() => listPlayableCountries("2099")).toThrow(/Unknown era/i);
  });

  it("1960 world is deterministic and distinct from 1953", () => {
    const w1953 = createWorld({ seed: "same", playerName: "P", countryId: "US", era: "1953" });
    const w1960 = createWorld({ seed: "same", playerName: "P", countryId: "US", era: "1960" });
    expect(w1953.meta.date).not.toBe(w1960.meta.date);
    expect(w1953.countries["US"]!.economy.gdp).not.toBe(w1960.countries["US"]!.economy.gdp);
    // same era repeated is identical
    const w1960b = createWorld({ seed: "same", playerName: "P", countryId: "US", era: "1960" });
    expect(JSON.stringify(w1960)).toBe(JSON.stringify(w1960b));
  });
});

describe("political structures", () => {
  it("createWorld populates parties and legislatures for every era and playable country", () => {
    for (const era of listEras()) {
      const playable = listPlayableCountries(era.id);
      for (const country of playable) {
        const world = createWorld({ seed: "pol-seed", playerName: "P", countryId: country.id, era: era.id });
        expect(Object.keys(world.parties).length).toBeGreaterThan(0);
        expect(Object.keys(world.legislatures).length).toBeGreaterThan(0);
        // each playable country has a legislature
        for (const pid of playable.map((c) => c.id)) {
          expect(world.legislatures[pid], `${era.id} missing legislature for ${pid}`).toBeDefined();
        }
        // each playable country's parties present
        const partyCountries = new Set(Object.values(world.parties).map((p) => p.countryId));
        for (const pid of playable.map((c) => c.id)) {
          expect(partyCountries.has(pid), `${era.id} missing parties for ${pid}`).toBe(true);
        }
        // non-playable countries may have empty political structures (allowed)
        // but they should NOT have a legislature entry
        expect(world.legislatures["FR"]).toBeUndefined();
      }
    }
  });

  it("parties carry ideological positions on -5..5 axis and deterministic color", () => {
    const world = createWorld({ seed: "pol-seed", playerName: "P", countryId: "US", era: "1953" });
    for (const party of Object.values(world.parties)) {
      expect(party.economicPosition).toBeGreaterThanOrEqual(-5);
      expect(party.economicPosition).toBeLessThanOrEqual(5);
      expect(party.socialPosition).toBeGreaterThanOrEqual(-5);
      expect(party.socialPosition).toBeLessThanOrEqual(5);
      expect(typeof party.color).toBe("string");
      expect(party.color).toMatch(/^#/);
    }
    // spot check US positions
    expect(world.parties["US_DEM"]!.economicPosition).toBe(-2);
    expect(world.parties["US_REP"]!.economicPosition).toBe(2);
    expect(world.parties["RU_CPSU"]!.economicPosition).toBe(-4);
  });

  it("legislature chambers note elected vs appointed and seats match config", () => {
    const world = createWorld({ seed: "pol-seed", playerName: "P", countryId: "US", era: "1953" });
    const usLeg = world.legislatures["US"]!;
    expect(usLeg.chambers.find((c) => c.key === "senate")!.elected).toBe(true);
    expect(usLeg.chambers.find((c) => c.key === "house")!.elected).toBe(true);
    const ukLeg = world.legislatures["UK"]!;
    expect(ukLeg.chambers.find((c) => c.key === "lords")!.elected).toBe(false);
    expect(ukLeg.chambers.find((c) => c.key === "commons")!.elected).toBe(true);
    const ddLeg = world.legislatures["DD"]!;
    expect(ddLeg.chambers.find((c) => c.key === "staatsrat")!.elected).toBe(false);
    expect(ddLeg.chambers.find((c) => c.key === "volkskammer")!.elected).toBe(true);
  });

  it("every chamber composition sums to chamber seats (seat-sum invariant)", () => {
    for (const era of listEras()) {
      const world = createWorld({ seed: "pol-seed", playerName: "P", countryId: "US", era: era.id });
      for (const leg of Object.values(world.legislatures)) {
        for (const ch of leg.chambers) {
          const sum = Object.values(ch.composition.seatsByParty).reduce((a, b) => a + b, 0) + ch.composition.vacancies;
          expect(sum, `${era.id} ${leg.countryId} ${ch.key} sum ${sum} vs seats ${ch.seats}`).toBe(ch.seats);
        }
      }
    }
  });

  it("legislature party allocations reference valid party ids for that country", () => {
    const world = createWorld({ seed: "pol-seed", playerName: "P", countryId: "US", era: "1953" });
    const partyIds = new Set(Object.keys(world.parties));
    for (const leg of Object.values(world.legislatures)) {
      for (const ch of leg.chambers) {
        for (const pid of Object.keys(ch.composition.seatsByParty)) {
          expect(partyIds.has(pid), `unknown party ${pid} in ${leg.countryId} ${ch.key}`).toBe(true);
          expect(world.parties[pid]!.countryId).toBe(leg.countryId);
        }
      }
    }
  });

  it("createWorld political structures are deterministic", () => {
    const opts = { seed: "det-pol", playerName: "P", countryId: "US", era: "1953" } as const;
    const a = createWorld(opts);
    const b = createWorld(opts);
    expect(JSON.stringify(a.parties)).toBe(JSON.stringify(b.parties));
    expect(JSON.stringify(a.legislatures)).toBe(JSON.stringify(b.legislatures));
  });

  it("per-country seat data matches mainline configs", () => {
    const world = createWorld({ seed: "x", playerName: "P", countryId: "US", era: "1953" });
    expect(world.legislatures["US"]!.chambers.find((c) => c.key === "house")!.seats).toBe(435);
    expect(world.legislatures["US"]!.chambers.find((c) => c.key === "senate")!.seats).toBe(100);
    expect(world.legislatures["UK"]!.chambers.find((c) => c.key === "commons")!.seats).toBe(625);
    expect(world.legislatures["UK"]!.chambers.find((c) => c.key === "lords")!.seats).toBe(784);
    expect(world.legislatures["RU"]!.chambers.find((c) => c.key === "sovietOfTheUnion")!.seats).toBe(526);
    expect(world.legislatures["RU"]!.chambers.find((c) => c.key === "sovietOfNationalities")!.seats).toBe(515);
    expect(world.legislatures["DD"]!.chambers.find((c) => c.key === "volkskammer")!.seats).toBe(500);
    expect(world.legislatures["DD"]!.chambers.find((c) => c.key === "staatsrat")!.seats).toBe(25);
  });

  it("US House composition matches 1952 election totals and DD Volkskammer matches National Front allocation", () => {
    const world = createWorld({ seed: "x", playerName: "P", countryId: "US", era: "1953" });
    const house = world.legislatures["US"]!.chambers.find((c) => c.key === "house")!.composition;
    expect(house.seatsByParty["US_DEM"]).toBe(213);
    expect(house.seatsByParty["US_REP"]).toBe(221);
    expect(house.vacancies).toBe(1);
    const senate = world.legislatures["US"]!.chambers.find((c) => c.key === "senate")!.composition;
    expect(senate.seatsByParty["US_DEM"]).toBe(47);
    expect(senate.seatsByParty["US_REP"]).toBe(48);
    expect(senate.vacancies).toBe(5);
    const volks = world.legislatures["DD"]!.chambers.find((c) => c.key === "volkskammer")!.composition;
    expect(volks.seatsByParty["DD_SED"]).toBe(292);
    expect(volks.seatsByParty["DD_CDU"]).toBe(51);
    expect(volks.seatsByParty["DD_LDPD"]).toBe(51);
    expect(volks.seatsByParty["DD_NDPD"]).toBe(51);
    expect(volks.seatsByParty["DD_DBD"]).toBe(55);
    expect(volks.vacancies).toBe(0);
  });
});
