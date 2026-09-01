import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { regressToward, decaySupport, tickSupportAccrual, buildRallyAccrualEntry } from "./support.js";
import { applyTurnoutDecay, applyDiminishingReturns, calculateGOTVSpend, calculateNationalGOTVBoost, calculateStateGOTVBoost, isWithinTwoPoints, calculateAlignmentMultiplier } from "./turnout.js";
import { computeDriftDeltas, computeDecayDeltas } from "./regDrift.js";
import { decayPressure } from "./pressure.js";
import { filterEligiblePriorityRegions } from "./priorityRegion.js";
import {
  DEFAULT_CANDIDATE_SUPPORT,
  SUPPORT_DECAY_PER_TURN,
  RALLY_IMMEDIATE_SHARE,
  RALLY_SPREAD_TURNS,
  SUPPORT_RALLY_FULL_VALUE,
  TURNOUT_DECAY_RATE,
  TURNOUT_ZERO_THRESHOLD,
  DOLLARS_PER_TURNOUT_POINT,
  PASSIVE_REG_DRIFT_RATE,
  PASSIVE_REG_DECAY_RATE,
  PRESSURE_DECAY_PER_TURN,
} from "./constants.js";

const OPTS = { seed: "w19-test", playerName: "T", countryId: "US", era: "1953" } as const;

// ---------------------------------------------------------------------------
// supportDecay golden values
// Source: mainline src/lib/turn/elections/supportDecay.test.ts + electionFormulaFactors.ts
// ---------------------------------------------------------------------------
describe("supportDecay golden values", () => {
  it("regressToward snaps within step", () => {
    expect(regressToward(50.3, 50, 0.5)).toBe(50);
    expect(regressToward(49.8, 50, 0.5)).toBe(50);
  });
  it("moves down toward target by step when above", () => {
    expect(regressToward(60, 50, 0.5)).toBe(59.5);
    expect(regressToward(80, 50, 0.5)).toBe(79.5);
  });
  it("moves up toward target by step when below", () => {
    expect(regressToward(40, 50, 0.5)).toBe(40.5);
    expect(regressToward(20, 50, 0.5)).toBe(20.5);
  });
  it("decaySupport matches SUPPORT_DECAY_PER_TURN golden", () => {
    expect(decaySupport(60)).toBe(59.5);
    expect(decaySupport(40)).toBe(40.5);
    expect(decaySupport(50.3)).toBe(50);
    expect(decaySupport(50)).toBe(50);
    expect(DEFAULT_CANDIDATE_SUPPORT).toBe(50);
    expect(SUPPORT_DECAY_PER_TURN).toBe(0.5);
  });
  it("bounds support [0,100] after many turns", () => {
    const world = createWorld(OPTS);
    const id = Object.keys(world.candidateSupports)[0]!;
    world.candidateSupports[id]!.support = 100;
    for (let i = 0; i < 200; i++) advanceTurn(world);
    const s = world.candidateSupports[id]!.support;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    // Should have decayed toward 50, not stayed at 100
    expect(s).toBeLessThan(100);
    expect(s).toBeGreaterThanOrEqual(50 - 0.5);
  });
});

// ---------------------------------------------------------------------------
// supportAccrual golden values
// Source: src/lib/turn/elections/supportAccrual.test.ts + supportAccrual.ts
// ---------------------------------------------------------------------------
describe("supportAccrual golden values", () => {
  it("buildRallyAccrualEntry splits R into 60% immediate / 40% spread over 4", () => {
    const R = SUPPORT_RALLY_FULL_VALUE; // 10
    const { immediateBump, entry } = buildRallyAccrualEntry(R);
    expect(immediateBump).toBeCloseTo(R * RALLY_IMMEDIATE_SHARE);
    expect(entry.amountPerTurn).toBeCloseTo((R * (1 - RALLY_IMMEDIATE_SHARE)) / RALLY_SPREAD_TURNS);
    expect(entry.turnsRemaining).toBe(RALLY_SPREAD_TURNS);
    expect(RALLY_IMMEDIATE_SHARE).toBe(0.6);
    expect(RALLY_SPREAD_TURNS).toBe(4);
  });
  it("immediate + trailing = R", () => {
    const R = 10;
    const { immediateBump, entry } = buildRallyAccrualEntry(R);
    expect(immediateBump + entry.amountPerTurn * entry.turnsRemaining).toBeCloseTo(R, 6);
  });
  it("tickSupportAccrual single entry delta and decrement", () => {
    const out = tickSupportAccrual([{ amountPerTurn: 1.0, turnsRemaining: 4 }]);
    expect(out.delta).toBeCloseTo(1.0);
    expect(out.newAccrual).toEqual([{ amountPerTurn: 1.0, turnsRemaining: 3 }]);
  });
  it("prunes entries hitting 0", () => {
    const out = tickSupportAccrual([{ amountPerTurn: 1.0, turnsRemaining: 1 }]);
    expect(out.delta).toBeCloseTo(1.0);
    expect(out.newAccrual).toEqual([]);
  });
  it("sums multiple entries (rally tour steady state 4 active -> 4.0/turn)", () => {
    const accrual = [
      { amountPerTurn: 1.0, turnsRemaining: 4 },
      { amountPerTurn: 1.0, turnsRemaining: 3 },
      { amountPerTurn: 1.0, turnsRemaining: 2 },
      { amountPerTurn: 1.0, turnsRemaining: 1 },
    ];
    const out = tickSupportAccrual(accrual);
    expect(out.delta).toBeCloseTo(4.0);
    expect(out.newAccrual).toHaveLength(3);
  });
  it("accrual integration via advanceTurn clamps [0,100]", () => {
    const world = createWorld(OPTS);
    const id = Object.keys(world.candidateSupports)[0]!;
    world.candidateSupports[id]!.support = 99;
    const { entry } = buildRallyAccrualEntry(10);
    world.candidateSupports[id]!.supportAccrual = [{ ...entry }, { ...entry }, { ...entry }, { ...entry }];
    for (let i = 0; i < 5; i++) advanceTurn(world);
    const s = world.candidateSupports[id]!.support;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// turnoutDecay golden values
// Source: src/lib/utils/turnoutDecay.test.ts
// ---------------------------------------------------------------------------
describe("turnoutDecay golden values", () => {
  it("reduces modifier by 2% per turn", () => {
    expect(applyTurnoutDecay(10)).toBeCloseTo(9.8);
    expect(applyTurnoutDecay(5)).toBeCloseTo(4.9);
    expect(TURNOUT_DECAY_RATE).toBe(0.02);
  });
  it("snaps to 0 below threshold", () => {
    expect(applyTurnoutDecay(0.005)).toBe(0);
    expect(applyTurnoutDecay(-0.005)).toBe(0);
    expect(TURNOUT_ZERO_THRESHOLD).toBe(0.01);
  });
  it("negative modifiers decay toward 0", () => {
    expect(applyTurnoutDecay(-10)).toBeCloseTo(-9.8);
  });
  it("bounds [-20,20] after GOTV boosts", () => {
    const world = createWorld(OPTS);
    world.parties["US_DEM"]!.organization = 100;
    world.parties["US_DEM"]!.politicalStrength = 280;
    for (let i = 0; i < 200; i++) advanceTurn(world);
    for (const rt of Object.values(world.regionTurnouts)) {
      for (const cat of Object.values(rt.modifiers)) {
        for (const v of Object.values(cat)) {
          expect(v).toBeGreaterThanOrEqual(-20);
          expect(v).toBeLessThanOrEqual(20);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GOTV helpers golden values
// Source: src/lib/turn/demographicTurnoutCalculations.test.ts + demographicAlignment.ts
// ---------------------------------------------------------------------------
describe("GOTV golden values", () => {
  it("calculateGOTVSpend percent vs flat", () => {
    expect(calculateGOTVSpend(100_000, 10, 0)).toBe(10_000);
    expect(calculateGOTVSpend(100_000, 0, 5000)).toBe(5000);
    expect(calculateGOTVSpend(0, 25, 0)).toBe(0);
  });
  it("calculateNationalGOTVBoost divides evenly", () => {
    expect(calculateNationalGOTVBoost(50_000, 10, 5000, 1.0)).toBe(1.0);
    expect(DOLLARS_PER_TURNOUT_POINT).toBe(5000);
  });
  it("calculateStateGOTVBoost linear", () => {
    expect(calculateStateGOTVBoost(5000, 5000, 1.0)).toBe(1.0);
    expect(calculateStateGOTVBoost(10_000, 5000, 0.5)).toBe(1.0);
  });
  it("isWithinTwoPoints both axes within 2", () => {
    expect(isWithinTwoPoints(-2, -2, -2, -2)).toBe(true);
    expect(isWithinTwoPoints(-2, -2, 0, -2)).toBe(true);
    expect(isWithinTwoPoints(-2, -2, 2, -2)).toBe(false); // econ diff 4
  });
  it("calculateAlignmentMultiplier distance scaling", () => {
    expect(calculateAlignmentMultiplier(0, 0, 0, 0)).toBeCloseTo(1.0);
    expect(calculateAlignmentMultiplier(0, 0, 2, 2)).toBeCloseTo(1 - 4 * 0.15);
  });
  it("applyDiminishingReturns at cap", () => {
    expect(applyDiminishingReturns(0, 1.0)).toBeCloseTo(1.0);
    expect(applyDiminishingReturns(10, 1.0)).toBeCloseTo(0.5);
    expect(applyDiminishingReturns(20, 1.0)).toBeCloseTo(0);
    expect(applyDiminishingReturns(-10, -1.0)).toBeCloseTo(-0.5);
  });
});

// ---------------------------------------------------------------------------
// regDriftDecay golden values
// Source: src/lib/turn/partyOrg/regDriftDecay.test.ts
// ---------------------------------------------------------------------------
describe("regDriftDecay golden values", () => {
  it("drift moves reg up toward org by min(rate,gap) one-directional", () => {
    const r = computeDriftDeltas(
      [
        { rowId: "a", partyId: "1", orgPct: 30, regPct: 25 },
        { rowId: "b", partyId: "2", orgPct: 20, regPct: 22 },
      ],
      0.04,
    );
    expect(r.partyDeltas[0]!.delta).toBeCloseTo(0.04);
    expect(r.partyDeltas.length).toBe(1);
    expect(PASSIVE_REG_DRIFT_RATE).toBe(0.06);
  });
  it("decay routes via sqrt(org) to eligible parties", () => {
    const r = computeDecayDeltas(
      [
        { rowId: "a", partyId: "1", orgPct: 36, regPct: 40 },
        { rowId: "b", partyId: "2", orgPct: 16, regPct: 20 },
      ],
      0.004,
      10,
    );
    expect(r.partyDeltas.length).toBeGreaterThan(0);
    expect(PASSIVE_REG_DECAY_RATE).toBe(0.004);
  });
  it("bounds registration [0,100] after many turns", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 200; i++) advanceTurn(world);
    for (const pr of Object.values(world.partyRegions)) {
      expect(pr.registration).toBeGreaterThanOrEqual(0);
      expect(pr.registration).toBeLessThanOrEqual(100);
      expect(pr.organization).toBeGreaterThanOrEqual(0);
      expect(pr.organization).toBeLessThanOrEqual(100);
    }
  });
});

// ---------------------------------------------------------------------------
// pressureDecay golden values
// Source: src/lib/turn/politicalStrength/pressureDecay.test.ts
// ---------------------------------------------------------------------------
describe("pressureDecay golden values", () => {
  it("subtracts 3 per turn floored at 0", () => {
    expect(decayPressure(5)).toBe(2);
    expect(decayPressure(2)).toBe(0);
    expect(decayPressure(0)).toBe(0);
    expect(PRESSURE_DECAY_PER_TURN).toBe(3);
  });
  it("bounds [0,8] after many turns", () => {
    const world = createWorld(OPTS);
    const key = Object.keys(world.partyPressures)[0]!;
    world.partyPressures[key]!.value = 8;
    for (let i = 0; i < 10; i++) advanceTurn(world);
    for (const pp of Object.values(world.partyPressures)) {
      expect(pp.value).toBeGreaterThanOrEqual(0);
      expect(pp.value).toBeLessThanOrEqual(8);
    }
  });
});

// ---------------------------------------------------------------------------
// priorityRegionDecay golden values
// Source: src/lib/turn/politicalStrength/priorityRegionDecay.test.ts
// ---------------------------------------------------------------------------
describe("priorityRegionDecay golden values", () => {
  it("evicts regions with org 0 or missing", () => {
    const { eligible, evicted } = filterEligiblePriorityRegions(
      ["CA", "TX", "FL"],
      new Map([
        ["CA", 30],
        ["TX", 0],
      ]),
    );
    expect(eligible).toEqual(["CA"]);
    expect(evicted).toBe(2);
  });
  it("keeps all eligible", () => {
    const { eligible, evicted } = filterEligiblePriorityRegions(
      ["CA", "TX"],
      new Map([
        ["CA", 10],
        ["TX", 5],
      ]),
    );
    expect(eligible).toEqual(["CA", "TX"]);
    expect(evicted).toBe(0);
  });
  it("integration via advanceTurn evicts via party.priorityRegion", () => {
    const world = createWorld(OPTS);
    const partyId = "US_DEM";
    const rid = "AL"; // real state after W38 (southern strong-D)
    const keep = "CA";
    world.parties[partyId]!.priorityRegion = { regionIds: [rid, keep], setAtTurn: 0 };
    const key = `${rid}:${partyId}`;
    world.partyRegions[key]!.organization = 0;
    advanceTurn(world);
    expect(world.parties[partyId]!.priorityRegion!.regionIds).not.toContain(rid);
    expect(world.parties[partyId]!.priorityRegion!.regionIds).toContain(keep);
  });
});

// ---------------------------------------------------------------------------
// Determinism and schema migration
// ---------------------------------------------------------------------------
describe("determinism", () => {
  it("identical seeds give identical support after N turns", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 20; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.candidateSupports)).toBe(JSON.stringify(b.candidateSupports));
    expect(JSON.stringify(a.regionTurnouts)).toBe(JSON.stringify(b.regionTurnouts));
    expect(JSON.stringify(a.partyRegions)).toBe(JSON.stringify(b.partyRegions));
    expect(JSON.stringify(a.partyPressures)).toBe(JSON.stringify(b.partyPressures));
  });
  it("no Math.random / Date.now in support phases (deterministic via WorldState)", () => {
    const a = createWorld({ seed: "det", playerName: "T", countryId: "UK", era: "1953" });
    const b = createWorld({ seed: "det", playerName: "T", countryId: "UK", era: "1953" });
    advanceTurn(a);
    const s1 = JSON.stringify(a.candidateSupports);
    advanceTurn(b);
    expect(JSON.stringify(b.candidateSupports)).toBe(s1);
  });
});

describe("schema bump and migration", () => {
  it("createWorld seeds 57 regions (48 US states + 9 opaque UK/RU/DD) and related maps", () => {
    const world = createWorld(OPTS);
    expect(Object.keys(world.regions)).toHaveLength(57);
    expect(Object.keys(world.electoratePools)).toHaveLength(57);
    expect(Object.keys(world.regionTurnouts)).toHaveLength(57);
    expect(Object.keys(world.regions).filter((k) => world.regions[k]!.countryId === "US")).toHaveLength(48);
    // partyRegions: 57 regions * parties per country
    expect(Object.keys(world.partyRegions).length).toBeGreaterThan(0);
    expect(world.meta.schemaVersion).toBe(15);
  });
  it("chained migration v7->v9 seeds W19 maps and migrates US to 48 states", () => {
    const oldWorld = {
      meta: { schemaVersion: 7, seed: "s", rng: [1, 2, 3, 4] as [number, number, number, number], turn: 0, date: "1953-01-06", era: "1953", cheatsUsed: false },
      countries: {
        US: { id: "US", name: "United States", playable: true, economy: { gdp: 100, growthRate: 0, inflationRate: 0, unemploymentRate: 0, outputGap: 0 } },
        UK: { id: "UK", name: "United Kingdom", playable: true, economy: { gdp: 100, growthRate: 0, inflationRate: 0, unemploymentRate: 0, outputGap: 0 } },
        RU: { id: "RU", name: "Soviet Union", playable: true, economy: { gdp: 100, growthRate: 0, inflationRate: 0, unemploymentRate: 0, outputGap: 0 } },
        DD: { id: "DD", name: "East Germany", playable: true, economy: { gdp: 100, growthRate: 0, inflationRate: 0, unemploymentRate: 0, outputGap: 0 } },
      },
      player: { name: "P", countryId: "US", cash: 10000 },
      parties: {
        US_DEM: { id: "US_DEM", name: "Dem", countryId: "US", abbreviation: "DEM", color: "#00f", economicPosition: -2, socialPosition: -2, treasury: 1000000, politicalStrength: 0, organization: 0, tier: "major" as const, psCapEarnedRegions: [], memberCount: 1, isDefault: true },
        US_REP: { id: "US_REP", name: "Rep", countryId: "US", abbreviation: "REP", color: "#f00", economicPosition: 2, socialPosition: 2, treasury: 1000000, politicalStrength: 0, organization: 0, tier: "major" as const, psCapEarnedRegions: [], memberCount: 1, isDefault: true },
      },
      legislatures: {},
      politicians: [{ id: "US-1", name: "A", gender: "male" as const, countryId: "US", partyId: "US_DEM", chamberKey: "house", ideology: { economic: 0, social: 0 }, age: 40, partyInfluence: 0, bonusActions: 0 }],
      charters: [],
      caucuses: [],
      commodityPrices: {},
      extractionContracts: [],
      news: [],
    };
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 7, savedAt: "2026-01-01", world: oldWorld });
    const migrated = deserializeSave(raw);
    expect(migrated.meta.schemaVersion).toBe(15);
    expect(Object.keys((migrated as unknown as { regions: Record<string, unknown> }).regions).length).toBeGreaterThan(0);
    expect(Object.keys((migrated as unknown as { candidateSupports: Record<string, unknown> }).candidateSupports).length).toBe(1);
    // round-trip preserves
    const re = deserializeSave(serializeSave(migrated, "2026-01-02"));
    expect(re.meta.schemaVersion).toBe(15);
  });
  it("US seed registration reflects 1953 southern strong-D lane (via MS/AL overrides, disenfranchisement modeled)", () => {
    const world = createWorld(OPTS);
    const demSouth = world.partyRegions["MS:US_DEM"]!;
    const repSouth = world.partyRegions["MS:US_REP"]!;
    expect(demSouth.registration).toBeGreaterThan(repSouth.registration + 30);
    expect(demSouth.registration).toBeGreaterThanOrEqual(60);
    // disenfranchisement via unregistered pool
    expect(world.electoratePools["MS"]!.unregistered).toBe(25);
    expect(world.electoratePools["AL"]!.unregistered).toBe(22);
  });
});
