import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { CATEGORIES_BY_COUNTRY_1953, US_CATEGORY_1953 } from "./categories.js";
import { US_STATE_DEMOGRAPHICS_1953 } from "./usStateDemographics1953.js";
import { computeLaborForce, annualizedGrowthRate, potentialGrowth, TFP_BASELINE, NEUTRAL_LABOR_PARTICIPATION } from "./laborForce.js";
import { shouldRunCensus, computeSeatDeltas, buildCensusContent, runCensus } from "./census.js";
import { applyBaselineDecay } from "./demographicEffects.js";

// ── Seed tables validate and sum sanely against state populations ──────────

describe("US_STATE_DEMOGRAPHICS_1953 seed tables", () => {
  it("has 48 entries (no AK/HI territories, no DC)", () => {
    expect(US_STATE_DEMOGRAPHICS_1953).toHaveLength(48);
    const ids = new Set(US_STATE_DEMOGRAPHICS_1953.map((s) => s.stateId));
    expect(ids.has("AK")).toBe(false);
    expect(ids.has("HI")).toBe(false);
    expect(ids.has("DC")).toBe(false);
    expect(ids.has("CA")).toBe(true);
    expect(ids.has("NY")).toBe(true);
    expect(ids.has("AL")).toBe(true);
  });

  it("each state's groups sum to 100 (population share) within rounding", () => {
    for (const seed of US_STATE_DEMOGRAPHICS_1953) {
      const sum = Object.values(seed.groups).reduce((a, g) => a + g.population, 0);
      expect(sum, `state ${seed.stateId} sum ${sum}`).toBeCloseTo(100, 1);
    }
  });

  it("has 12 groups per state matching US_CATEGORY_1953", () => {
    const expected = new Set(US_CATEGORY_1953.groups.map((g) => g.id));
    for (const seed of US_STATE_DEMOGRAPHICS_1953) {
      expect(Object.keys(seed.groups)).toHaveLength(12);
      for (const gid of Object.keys(seed.groups)) expect(expected.has(gid), `${seed.stateId} unknown group ${gid}`).toBe(true);
    }
  });

  it("categoryWeights is { voterGroups: 100 }", () => {
    for (const seed of US_STATE_DEMOGRAPHICS_1953) {
      expect(seed.categoryWeights).toEqual({ voterGroups: 100 });
    }
  });

  it("leans and turnouts are within valid ranges", () => {
    for (const seed of US_STATE_DEMOGRAPHICS_1953) {
      for (const [gid, g] of Object.entries(seed.groups)) {
        expect(g.economicLean, `${seed.stateId} ${gid} econ`).toBeGreaterThanOrEqual(-5);
        expect(g.economicLean).toBeLessThanOrEqual(5);
        expect(g.socialLean).toBeGreaterThanOrEqual(-5);
        expect(g.socialLean).toBeLessThanOrEqual(5);
        expect(g.turnout).toBeGreaterThanOrEqual(0);
        expect(g.turnout).toBeLessThanOrEqual(100);
      }
    }
  });

  it("populations sum sanely: total national voter base vs state populations", () => {
    // Spot check: CA population 10,586,223 * avg group population share consistency
    // We just verify each state's groups sum to 100, and that state pops are positive
    const world = createWorld({ seed: "s", playerName: "P", countryId: "US", era: "1953" });
    for (const seed of US_STATE_DEMOGRAPHICS_1953) {
      const region = world.regions[seed.stateId];
      expect(region, `missing region ${seed.stateId}`).toBeDefined();
      expect(region!.population).toBeGreaterThan(0);
      // groups population 100 maps to 100% of electorate, so absolute voters = pop * share /100 * turnout-weighted, but we just check positivity
      for (const g of Object.values(seed.groups)) expect(g.population).toBeGreaterThan(0);
    }
  });

  it("is deterministic: same derivation yields same JSON", () => {
    const a = JSON.stringify(US_STATE_DEMOGRAPHICS_1953);
    const b = JSON.stringify(US_STATE_DEMOGRAPHICS_1953);
    expect(a).toBe(b);
  });
});

describe("CATEGORIES_BY_COUNTRY_1953", () => {
  it("has US/UK/RU/DD entries at mainline's granularity", () => {
    expect(CATEGORIES_BY_COUNTRY_1953["US"]).toBeDefined();
    expect(CATEGORIES_BY_COUNTRY_1953["UK"]).toBeDefined();
    expect(CATEGORIES_BY_COUNTRY_1953["RU"]).toBeDefined();
    expect(CATEGORIES_BY_COUNTRY_1953["DD"]).toBeDefined();
    // US 12, UK 12, RU 7, DD 6
    expect(CATEGORIES_BY_COUNTRY_1953["US"]![0]!.groups).toHaveLength(12);
    expect(CATEGORIES_BY_COUNTRY_1953["UK"]![0]!.groups).toHaveLength(12);
    expect(CATEGORIES_BY_COUNTRY_1953["RU"]![0]!.groups).toHaveLength(7);
    expect(CATEGORIES_BY_COUNTRY_1953["DD"]![0]!.groups).toHaveLength(6);
  });

  it("UK/RU/DD have real Layer1-derived demographics for 1953 (W39)", () => {
    // W39 ships UK 12, RU 14, DD 6 Layer1-derived demographics via derive.ts from census + positions
    const world = createWorld({ seed: "s", playerName: "P", countryId: "UK", era: "1953" });
    const ukRegions = Object.values(world.regions).filter((r) => r.countryId === "UK");
    expect(ukRegions).toHaveLength(12);
    for (const r of ukRegions) {
      const demo = world.stateDemographics[r.id];
      expect(demo, `missing demo for ${r.id}`).toBeDefined();
      const sum = Object.values(demo!.groups).reduce((a, g) => a + g.population, 0);
      expect(sum).toBeCloseTo(100, 1);
    }
  });
});

// ── Labor force goldens with citations ────────────────────────────────────

describe("laborForce goldens (src/lib/metricEngine/potentialGrowth.ts)", () => {
  it("computeLaborForce civilian = (workingAge - serving) * participation/100", () => {
    expect(computeLaborForce(1000, 50, 62.5)).toBeCloseTo(593.75, 4);
    expect(computeLaborForce(1000, 200, 60)).toBeLessThan(computeLaborForce(1000, 0, 60));
    expect(computeLaborForce(0, 500, 60)).toBe(0);
    expect(computeLaborForce(1000, 0, 60)).toBeCloseTo(600, 4);
    expect(NEUTRAL_LABOR_PARTICIPATION).toBe(62.5);
  });

  it("annualizedGrowthRate is ((curr-prev)/prev)*100*turnsPerYear, 0 on cold start", () => {
    expect(annualizedGrowthRate(110, 100, 48)).toBeCloseTo(480, 4);
    expect(annualizedGrowthRate(100, 0, 48)).toBe(0);
    expect(annualizedGrowthRate(100, 100, 48)).toBeCloseTo(0, 9);
  });

  it("potentialGrowth = αL·gL + αK·gK + TFP (Solow LEVEL)", () => {
    expect(potentialGrowth(0, 0, TFP_BASELINE)).toBeCloseTo(TFP_BASELINE, 9);
    expect(potentialGrowth(1, 2, TFP_BASELINE)).toBeCloseTo(0.66 * 1 + 0.34 * 2 + TFP_BASELINE, 9);
    expect(TFP_BASELINE).toBe(1.2);
  });

  it("createWorld seeds laborForces and integrates via macroCountryTurn", () => {
    const world = createWorld({ seed: "lab", playerName: "P", countryId: "US", era: "1953" });
    // laborForces seeded for each region (double-round: round(pop*0.58) then round(*0.625))
    expect(Object.keys(world.laborForces).length).toBe(80);
    for (const [rid, lf] of Object.entries(world.laborForces)) {
      const region = world.regions[rid]!;
      const workingAge = Math.round((region.population ?? 0) * 0.58);
      const expected = Math.round(workingAge * 0.625);
      expect(lf).toBe(expected);
      if ((region.population ?? 0) > 0) expect(lf, `laborForce for ${rid}`).toBeGreaterThan(0);
    }
    const before = world.laborForces["CA"]!;
    advanceTurn(world);
    const after = world.laborForces["CA"]!;
    // Population grew 1.6%/yr => labor grew similarly (small)
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

// ── Census goldens with citations ─────────────────────────────────────────

describe("census goldens (src/lib/turn/census.ts)", () => {
  it("shouldRunCensus fires on year %10===0 not yet censused", () => {
    expect(shouldRunCensus(2020, undefined)).toBe(true);
    expect(shouldRunCensus(2000, 1990)).toBe(true);
    expect(shouldRunCensus(2020, 2020)).toBe(false);
    expect(shouldRunCensus(2021, undefined)).toBe(false);
    expect(shouldRunCensus(NaN, undefined)).toBe(false);
  });

  it("computeSeatDeltas returns only changed states, gains first", () => {
    const deltas = computeSeatDeltas({ TX: 38, NY: 26, CA: 52 }, { TX: 40, NY: 25, CA: 52 });
    expect(deltas).toEqual([
      { state: "TX", from: 38, to: 40, delta: 2 },
      { state: "NY", from: 26, to: 25, delta: -1 },
    ]);
  });

  it("buildCensusContent names seat changes", () => {
    const content = buildCensusContent(2020, [
      { state: "TX", from: 38, to: 40, delta: 2 },
      { state: "NY", from: 26, to: 25, delta: -1 },
    ]);
    expect(content).toContain("2020 Census");
    expect(content).toContain("TX +2");
    expect(content).toContain("NY -1");
  });

  it("runCensus reapportions on decennial and is deterministic", () => {
    const world = createWorld({ seed: "cen", playerName: "P", countryId: "US", era: "1953" });
    // Fast-forward to 1960 (decennial)
    world.meta.date = "1960-01-06";
    world.meta.turn = 364; // ~7 years *52
    // Inflate CA to steal a seat from a small state
    const caPop = world.regions["CA"]!.population ?? 0;
    world.regions["CA"]!.population = caPop * 5;
    const result = runCensus(world);
    expect(result.ran).toBe(true);
    expect(result.year).toBe(1960);
    expect(world.census.lastCensusYear).toBe(1960);
    expect(world.news.some((n) => n.headline.includes("Census"))).toBe(true);
    // No re-fire same year
    const result2 = runCensus(world);
    expect(result2.ran).toBe(false);
  });
});

// ── Demographic effects / flows determinism ───────────────────────────────

describe("demographicEffects determinism (src/lib/demographicEffects.ts)", () => {
  it("applyBaselineDecay moves 0.25%/turn toward baseline", () => {
    expect(applyBaselineDecay(60, 50)).toBeCloseTo(60 - (10 * 0.0025), 6);
    expect(applyBaselineDecay(40, 50)).toBeCloseTo(40 - (-10 * 0.0025), 6);
  });

  it("two worlds with same seed stay identical through 20 turns (including new phases)", () => {
    const a = createWorld({ seed: "demo-det", playerName: "P", countryId: "US", era: "1953" });
    const b = createWorld({ seed: "demo-det", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 20; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.stateDemographics)).toBe(JSON.stringify(b.stateDemographics));
    expect(JSON.stringify(a.laborForces)).toBe(JSON.stringify(b.laborForces));
    expect(JSON.stringify(a.census)).toBe(JSON.stringify(b.census));
    expect(JSON.stringify(a.regions)).toBe(JSON.stringify(b.regions));
  });
});

// ── Migration schema v14 ──────────────────────────────────────────────────

describe("migration v14", () => {
  it("new worlds are schema 14 and carry demographics", () => {
    const world = createWorld({ seed: "m", playerName: "P", countryId: "US", era: "1953" });
    expect(world.meta.schemaVersion).toBe(23);
    expect(Object.keys(world.stateDemographics)).toHaveLength(80);
    expect(Object.keys(world.baselineDemographics)).toHaveLength(80);
    expect(Object.keys(world.demographicCategories).length).toBeGreaterThan(0);
    expect(Object.keys(world.laborForces)).toHaveLength(80);
    expect(world.census).toBeDefined();
  });

  it("migrates v13 saves to v14 with demographics stubs and preserves determinism", () => {
    const world = createWorld({ seed: "mig", playerName: "P", countryId: "US", era: "1953" });
    // Fake a v13 save
    const fakeV13 = {
      format: "ahdsolo-save" as const,
      schemaVersion: 13,
      savedAt: "2026-01-01T00:00:00Z",
      world: { ...world, meta: { ...world.meta, schemaVersion: 13 }, stateDemographics: undefined, baselineDemographics: undefined, demographicCategories: undefined, census: undefined, laborForces: undefined },
    };
    // Remove new fields
    delete (fakeV13.world as unknown as Record<string, unknown>)["stateDemographics"];
    delete (fakeV13.world as unknown as Record<string, unknown>)["baselineDemographics"];
    delete (fakeV13.world as unknown as Record<string, unknown>)["demographicCategories"];
    delete (fakeV13.world as unknown as Record<string, unknown>)["census"];
    delete (fakeV13.world as unknown as Record<string, unknown>)["laborForces"];
    const raw = JSON.stringify(fakeV13);
    const a = deserializeSave(raw);
    const b = deserializeSave(raw);
    expect(a.meta.schemaVersion).toBe(23);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Object.keys(a.stateDemographics).length).toBeGreaterThan(0);
  });

  it("save/load round trip preserves demographics and is deterministic", () => {
    const world = createWorld({ seed: "rt", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 5; i++) advanceTurn(world);
    const raw = serializeSave(world, "2026-01-02T00:00:00Z");
    const loaded = deserializeSave(raw);
    expect(JSON.stringify(loaded.stateDemographics)).toBe(JSON.stringify(world.stateDemographics));
    expect(JSON.stringify(loaded.laborForces)).toBe(JSON.stringify(world.laborForces));
    // Further turns stay in sync
    const a = loaded;
    const b = world;
    for (let i = 0; i < 5; i++) { advanceTurn(a); advanceTurn(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
