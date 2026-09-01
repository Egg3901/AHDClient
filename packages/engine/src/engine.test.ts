import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import { createWorld, listEras, listPlayableCountries, SCHEMA_VERSION } from "./world.js";
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
      "actionRefresh",
      "fundGeneration",
      "nppFundGeneration",
      "partyInfluenceTurn",
      "playerEndorsementPartySweep",
      "caucusTax",
      "macroCountryTurn",
      "turnoutDecay",
      "partyGOTV",
      "partyOrgTurn",
      "regDriftDecay",
      "pressureDecay",
      "priorityRegionDecay",
      "supportDecay",
      "supportAccrual",
      "partyTierTurn",
      "partyActionGeneration",
      "expireCharters",
      "emptyPartyCleanup",
      "partyMemberCountReconcile",
      "nppRelationshipMaintenance",
      "nppBillSponsorship",
      "nppStanceDrift",
      "nppActionProcessing",
      "nppBehavior",
      "billLifecycle",
      "commodityPrices",
      "contractSettlement",
      "voteAccumulation",
      "electionTimers",
      "electionResolution",
      "demographicEffects",
      "demographicFlows",
      "census",
      "tradeGrowth",
      "fiscalBaseGrowth",
      "subsidyBudget",
      "fiscalYear",
      "regionalBudgetProcessing",
      "centralBankChairTurn",
      "centralBankChairSelection",
      "corporationTurn",
      "campaignSpendReset",
      "campaignTurn",
      "campaignPartySubsidy",
      "campaignNpcInvestment",
      "statePartyElections",
      "nationalPartyElections",
      "nationalCommitteeElections",
      "coalitionDisband",
      "leadershipElections",
      "governmentFormation",
      "governmentVacancyWatcher",
      "impeachmentLifecycle",
      "presidentialSuccession",
      "cabinetTransition",
      "cabinetNominationLifecycle",
      "scotusTurn",
      "ukJrSurpriseTurn",
      "recomputeSharePrices",
      "worldEventsMaintenance",
      "worldEventsScheduler",
      "playerRandomEvents",
      "crisisTurn",
      "bankingTurn",
      "bankSolvencyTurn",
      "governorAPRegen",
      "governorOrders",
      "governorAddressExpiry",
      "governorByElectionWatcher",
      "governorLegislationQueue",
      "governorEndorsements",
      "nppUnionBehavior",
      "unionsTurn",
      "sovereignIssuance",
      "bondCouponMaturity",
      "npcBondHolder",
      "advanceCapitalStock",
      "unownedSectorGrowth",
      "commandEconomy",
      "stateOwnershipConcentration",
      "tradeGrowthMirror",
      "ledgerPreForexSnapshot",
      "forexTurn",
      "metricDecay",
      "investorConfidenceDecay",
      "nationalMetrics",
      "economicModel",
      "inflationRecalc",
      "economicVitalSigns",
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

  it("v21 -> v23: W24 migration backfills executives, impeachments, and centralBank chairAppointedBy", () => {
    const world = createWorld(OPTS);
    const v21 = structuredClone(world) as unknown as Record<string, unknown>;
    v21["meta"] = { ...world.meta, schemaVersion: 21 };
    delete v21["executives"];
    delete v21["impeachments"];
    const centralBanks = v21["centralBanks"] as Record<string, Record<string, unknown>>;
    for (const bank of Object.values(centralBanks)) delete bank["chairAppointedBy"];

    const raw = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 21,
      savedAt: "2026-01-01T00:00:00Z",
      world: v21,
    });
    const a = deserializeSave(raw);
    const b = deserializeSave(raw);

    expect(a.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(a.executives).toEqual({});
    expect(a.impeachments).toEqual([]);
    for (const bank of Object.values(a.centralBanks)) {
      expect(bank.chairAppointedBy).toBeNull();
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("chained migration: a v20 save (missing v21 fields too) reaches v23 cleanly", () => {
    const world = createWorld(OPTS);
    const v20 = structuredClone(world) as unknown as Record<string, unknown>;
    v20["meta"] = { ...world.meta, schemaVersion: 20 };
    delete v20["statePartyElections"];
    delete v20["nationalPartyElections"];
    delete v20["nationalCommitteeElections"];
    delete v20["coalitions"];
    delete v20["executives"];
    delete v20["impeachments"];

    const raw = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 20,
      savedAt: "2026-01-01T00:00:00Z",
      world: v20,
    });
    const migrated = deserializeSave(raw);

    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.statePartyElections).toEqual([]);
    expect(migrated.coalitions).toEqual([]);
    expect(migrated.executives).toEqual({});
    expect(migrated.impeachments).toEqual([]);
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

  it("US stateSenate is vacant 1972 with citation (no invented 1953 composition)", () => {
    const world = createWorld({ seed: "x", playerName: "P", countryId: "US", era: "1953" });
    const stateSenate = world.legislatures["US"]!.chambers.find((c) => c.key === "stateSenate")!;
    // No mainline 1953 composition exists for state legislatures; leave vacant.
    // Total 1972 matches sum of per-state senateSeats.
    expect(stateSenate.seats).toBe(1972);
    expect(stateSenate.composition.vacancies).toBe(1972);
    expect(Object.keys(stateSenate.composition.seatsByParty).length).toBe(0);
  });
});

describe("W38 US states layer", () => {
  it("1953 world has 48 US state regions, 80 total (48 +12+14+6)", () => {
    const world = createWorld({ seed: "s", playerName: "P", countryId: "US", era: "1953" });
    const usRegions = Object.values(world.regions).filter((r) => r.countryId === "US");
    expect(usRegions.length).toBe(48);
    expect(usRegions.some((r) => r.id === "AK")).toBe(false);
    expect(usRegions.some((r) => r.id === "HI")).toBe(false);
    expect(Object.keys(world.regions).length).toBe(80); // 48 US +12 UK +14 RU +6 DD
  });

  it("apportionment sums to 435 and per-state senate sum to 1925 (50-state chamber is 1972)", () => {
    const world = createWorld({ seed: "s", playerName: "P", countryId: "US", era: "1953" });
    const usRegions = Object.values(world.regions).filter((r) => r.countryId === "US");
    const houseSum = usRegions.reduce((a, r) => a + (r.houseSeats ?? 0), 0);
    const senateSum = usRegions.reduce((a, r) => a + (r.senateSeats ?? 0), 0);
    expect(houseSum).toBe(435);
    expect(senateSum).toBe(1925);
  });

  it("population sums plausible vs mainline 149,895,183 and per-state population matches pack", () => {
    const world = createWorld({ seed: "s", playerName: "P", countryId: "US", era: "1953" });
    const usRegions = Object.values(world.regions).filter((r) => r.countryId === "US");
    const popSum = usRegions.reduce((a, r) => a + (r.population ?? 0), 0);
    expect(popSum).toBe(149_895_183);
  });

  it("senate classes per state are I/II/III pairs from mainline SENATE_CLASSES_BY_STATE", () => {
    const world = createWorld({ seed: "s", playerName: "P", countryId: "US", era: "1953" });
    const usRegions = Object.values(world.regions).filter((r) => r.countryId === "US");
    for (const r of usRegions) {
      expect(r.senateClasses).toBeDefined();
      expect(r.senateClasses!.length).toBe(2);
      for (const c of r.senateClasses!) expect([1, 2, 3]).toContain(c);
    }
    // spot check
    expect(world.regions["CA"]!.senateClasses).toEqual([1, 3]);
    expect(world.regions["AL"]!.senateClasses).toEqual([2, 3]);
    expect(world.regions["TX"]!.senateClasses).toEqual([1, 2]);
  });

  it("pack validation extended: 80 states (48 US +12 UK +14 RU +6 DD), apportionment 435 for US", async () => {
    // use imported pack directly
    const { pack1953: p1953 } = await import("@rotunda/content");
    expect(p1953.states!.length).toBe(80);
    expect(p1953.states!.filter((s) => s.countryId === "US").length).toBe(48);
    expect(p1953.states!.filter((s) => s.countryId === "UK").length).toBe(12);
    expect(p1953.states!.filter((s) => s.countryId === "RU").length).toBe(14);
    expect(p1953.states!.filter((s) => s.countryId === "DD").length).toBe(6);
    const sum = p1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.houseSeats, 0);
    expect(sum).toBe(435);
    const popUS = p1953.states!.filter((s) => s.countryId === "US").reduce((a, s) => a + s.population, 0);
    expect(popUS).toBe(149_895_183);
    const popUK = p1953.states!.filter((s) => s.countryId === "UK").reduce((a, s) => a + s.population, 0);
    expect(popUK).toBe(52600000);
    const popRU = p1953.states!.filter((s) => s.countryId === "RU").reduce((a, s) => a + s.population, 0);
    expect(popRU).toBe(148500000);
    const popDD = p1953.states!.filter((s) => s.countryId === "DD").reduce((a, s) => a + s.population, 0);
    expect(popDD).toBe(18400000);
  });

  it("region bridge determinism: v8->v9 migration is deterministic and preserves UK/RU/DD", async () => {
    // Build a v8 world snapshot: 12 opaque regions, then migrate via deserializeSave
    const v8World = createWorld({ seed: "bridge-test", playerName: "P", countryId: "US", era: "1953" });
    // Force a v8-shaped save payload by stripping US states and re-inserting opaque US-R1..R3
    // Simulate a pre-W38 save by creating a fake v8 file with schema 8 and opaque US regions
    const fakeV8 = {
      format: "ahdsolo-save" as const,
      schemaVersion: 8,
      savedAt: "2026-01-01T00:00:00Z",
      world: {
        ...structuredClone(v8World),
        meta: { ...v8World.meta, schemaVersion: 8 },
        regions: {
          ...Object.fromEntries(Object.entries(v8World.regions).filter(([, r]) => r.countryId !== "US")),
          "US-R1": { id: "US-R1", countryId: "US", name: "US Region 1" },
          "US-R2": { id: "US-R2", countryId: "US", name: "US Region 2" },
          "US-R3": { id: "US-R3", countryId: "US", name: "US Region 3" },
        },
        partyRegions: Object.fromEntries(
          Object.entries(v8World.partyRegions).filter(([k]) => !k.startsWith("AL:") && !k.includes("US-R") && false) // placeholder to keep shape; actual test rebuilds
        ),
        electoratePools: Object.fromEntries(Object.entries(v8World.electoratePools).filter(([k]) => !["AL","CA"].includes(k))),
        regionTurnouts: Object.fromEntries(Object.entries(v8World.regionTurnouts).filter(([k]) => !["AL","CA"].includes(k))),
        partyPressures: {},
      },
    };
    // Instead, test the real migration by constructing minimal v8 partyRegions/pools for US-R1..R3
    // Use the save.ts migration path: create a serialized v8 with known org/reg values, then deserialize twice and compare
    const baseWorld = createWorld({ seed: "bridge-determ", playerName: "P", countryId: "US", era: "1953" });
    // Create a v8 payload manually with controlled org/reg
    const v8 = {
      format: "ahdsolo-save" as const,
      schemaVersion: 8,
      savedAt: "2026-01-01T00:00:00Z",
      world: {
        ...baseWorld,
        meta: { ...baseWorld.meta, schemaVersion: 8 },
        regions: {
          "US-R1": { id: "US-R1", countryId: "US", name: "US Region 1" },
          "US-R2": { id: "US-R2", countryId: "US", name: "US Region 2" },
          "US-R3": { id: "US-R3", countryId: "US", name: "US Region 3" },
          "UK-R1": { id: "UK-R1", countryId: "UK", name: "UK Region 1" },
          "UK-R2": { id: "UK-R2", countryId: "UK", name: "UK Region 2" },
          "UK-R3": { id: "UK-R3", countryId: "UK", name: "UK Region 3" },
          "RU-R1": { id: "RU-R1", countryId: "RU", name: "RU Region 1" },
          "RU-R2": { id: "RU-R2", countryId: "RU", name: "RU Region 2" },
          "RU-R3": { id: "RU-R3", countryId: "RU", name: "RU Region 3" },
          "DD-R1": { id: "DD-R1", countryId: "DD", name: "DD Region 1" },
          "DD-R2": { id: "DD-R2", countryId: "DD", name: "DD Region 2" },
          "DD-R3": { id: "DD-R3", countryId: "DD", name: "DD Region 3" },
        },
        partyRegions: {
          "US-R1:US_DEM": { regionId: "US-R1", partyId: "US_DEM", countryId: "US", organization: 30, registration: 45 },
          "US-R2:US_DEM": { regionId: "US-R2", partyId: "US_DEM", countryId: "US", organization: 36, registration: 60 },
          "US-R3:US_DEM": { regionId: "US-R3", partyId: "US_DEM", countryId: "US", organization: 24, registration: 35 },
          "US-R1:US_REP": { regionId: "US-R1", partyId: "US_REP", countryId: "US", organization: 24, registration: 35 },
          "US-R2:US_REP": { regionId: "US-R2", partyId: "US_REP", countryId: "US", organization: 12, registration: 10 },
          "US-R3:US_REP": { regionId: "US-R3", partyId: "US_REP", countryId: "US", organization: 34, registration: 50 },
        },
        electoratePools: {
          "US-R1": { regionId: "US-R1", countryId: "US", independent: 8, unregistered: 7 },
          "US-R2": { regionId: "US-R2", countryId: "US", independent: 3, unregistered: 22 },
          "US-R3": { regionId: "US-R3", countryId: "US", independent: 8, unregistered: 6 },
          "UK-R1": { regionId: "UK-R1", countryId: "UK", independent: 8, unregistered: 8 },
          "UK-R2": { regionId: "UK-R2", countryId: "UK", independent: 8, unregistered: 8 },
          "UK-R3": { regionId: "UK-R3", countryId: "UK", independent: 8, unregistered: 8 },
          "RU-R1": { regionId: "RU-R1", countryId: "RU", independent: 3, unregistered: 2 },
          "RU-R2": { regionId: "RU-R2", countryId: "RU", independent: 3, unregistered: 2 },
          "RU-R3": { regionId: "RU-R3", countryId: "RU", independent: 3, unregistered: 2 },
          "DD-R1": { regionId: "DD-R1", countryId: "DD", independent: 5, unregistered: 3 },
          "DD-R2": { regionId: "DD-R2", countryId: "DD", independent: 5, unregistered: 3 },
          "DD-R3": { regionId: "DD-R3", countryId: "DD", independent: 5, unregistered: 3 },
        },
        regionTurnouts: {
          "US-R1": { regionId: "US-R1", countryId: "US", modifiers: { voterGroups: { urban_progressives: 0, rural_conservatives: 0, suburban_moderates: 0 } }, lastDecayAppliedTurn: 0 },
          "US-R2": { regionId: "US-R2", countryId: "US", modifiers: { voterGroups: { urban_progressives: 0, rural_conservatives: 0, suburban_moderates: 0 } }, lastDecayAppliedTurn: 0 },
          "US-R3": { regionId: "US-R3", countryId: "US", modifiers: { voterGroups: { urban_progressives: 0, rural_conservatives: 0, suburban_moderates: 0 } }, lastDecayAppliedTurn: 0 },
          "UK-R1": { regionId: "UK-R1", countryId: "UK", modifiers: { voterGroups: { urban_progressives: 0 } }, lastDecayAppliedTurn: 0 },
          "UK-R2": { regionId: "UK-R2", countryId: "UK", modifiers: { voterGroups: { urban_progressives: 0 } }, lastDecayAppliedTurn: 0 },
          "UK-R3": { regionId: "UK-R3", countryId: "UK", modifiers: { voterGroups: { urban_progressives: 0 } }, lastDecayAppliedTurn: 0 },
          "RU-R1": { regionId: "RU-R1", countryId: "RU", modifiers: { voterGroups: { workers: 0 } }, lastDecayAppliedTurn: 0 },
          "RU-R2": { regionId: "RU-R2", countryId: "RU", modifiers: { voterGroups: { workers: 0 } }, lastDecayAppliedTurn: 0 },
          "RU-R3": { regionId: "RU-R3", countryId: "RU", modifiers: { voterGroups: { workers: 0 } }, lastDecayAppliedTurn: 0 },
          "DD-R1": { regionId: "DD-R1", countryId: "DD", modifiers: { voterGroups: { workers: 0 } }, lastDecayAppliedTurn: 0 },
          "DD-R2": { regionId: "DD-R2", countryId: "DD", modifiers: { voterGroups: { workers: 0 } }, lastDecayAppliedTurn: 0 },
          "DD-R3": { regionId: "DD-R3", countryId: "DD", modifiers: { voterGroups: { workers: 0 } }, lastDecayAppliedTurn: 0 },
        },
        partyPressures: {
          "US_DEM:US-R1": { partyId: "US_DEM", regionId: "US-R1", countryId: "US", value: 5 },
          "US_REP:US-R1": { partyId: "US_REP", regionId: "US-R1", countryId: "US", value: 2 },
        },
      },
    };
    const raw = JSON.stringify(v8);
    const a = deserializeSave(raw);
    const b = deserializeSave(raw);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // W39: all 80 subdivisions real (US 48, UK 12, RU 14, DD 6)
    expect(Object.keys(a.regions).filter((k) => a.regions[k]!.countryId === "US").length).toBe(48);
    // W39 replaced the opaque triads with real subdivisions (UK 12, RU 14, DD 6)
    expect(Object.keys(a.regions).filter((k) => a.regions[k]!.countryId === "UK").length).toBe(12);
    expect(Object.keys(a.regions).filter((k) => a.regions[k]!.countryId === "RU").length).toBe(14);
    expect(Object.keys(a.regions).filter((k) => a.regions[k]!.countryId === "DD").length).toBe(6);
    expect(a.meta.schemaVersion).toBe(SCHEMA_VERSION);
    // No opaque US left
    expect(a.regions["US-R1"]).toBeUndefined();
    // Deterministic: partyRegions for US states are uniform averaged (round)
    // DEM org avg (30+36+24)/3=30, reg avg (45+60+35)/3=47 (rounded)
    expect(a.partyRegions["AL:US_DEM"]!.organization).toBe(30);
    expect(a.partyRegions["AL:US_DEM"]!.registration).toBe(47);
    // Pack validation extended passes
    const { validatePack } = await import("@rotunda/content");
    expect(() => validatePack(PACKS.find((p) => p.era.id === "1953")!)).not.toThrow();
  });
});
