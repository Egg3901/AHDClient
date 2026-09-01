import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave } from "../save.js";
import { macroCountryTurnPhase } from "../phases/macroCountryTurn.js";
import { rngFromSeed } from "../rng.js";
import {
  softCapEffectiveMargin,
  trendGrowthRate,
  calculateGrowthCost,
  deriveCeoArchetype,
  computeRealizedRevenueGrowthRate,
  MARGIN_SOFT_CAP_KNEE,
  MARGIN_HARD_CEILING,
  GROWTH_TREND_STEP_PER_TURN,
  MIN_GROWTH_RATE,
  MAX_GROWTH_RATE,
} from "./constants.js";
import { seedCorporations } from "./founding.js";
import { runCorporationTurn, checkInsolvency } from "./corporationTurn.js";
import { CORPORATION_TYPES } from "./types.js";
import type { Corporation } from "./types.js";

const OPTS = { seed: "corp-test-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

// ── Pure formula goldens (hand-computed, cited) ─────────────────────────
describe("corporation formula goldens", () => {
  it("softCapEffectiveMargin: identity below the knee", () => {
    // Source: constants/corporations.ts:294-299. Below MARGIN_SOFT_CAP_KNEE (80), identity.
    expect(softCapEffectiveMargin(35)).toBe(35);
    expect(softCapEffectiveMargin(MARGIN_SOFT_CAP_KNEE)).toBe(MARGIN_SOFT_CAP_KNEE);
  });

  it("softCapEffectiveMargin: tanh curve above the knee", () => {
    // 80 + 20*tanh((90-80)/20) = 80 + 20*tanh(0.5) = 80 + 20*0.4621171573 = 89.242343...
    const expected = MARGIN_SOFT_CAP_KNEE + (MARGIN_HARD_CEILING - MARGIN_SOFT_CAP_KNEE) * Math.tanh(0.5);
    expect(softCapEffectiveMargin(90)).toBeCloseTo(expected, 9);
    expect(softCapEffectiveMargin(90)).toBeCloseTo(89.242343146, 6);
    expect(softCapEffectiveMargin(90)).toBeLessThan(MARGIN_HARD_CEILING);
  });

  it("trendGrowthRate: steps toward target by GROWTH_TREND_STEP_PER_TURN, no overshoot", () => {
    // Source: src/lib/utils/sectorGrowth.ts trendGrowthRate.
    expect(trendGrowthRate(3, 5)).toBe(3 + GROWTH_TREND_STEP_PER_TURN);
    expect(trendGrowthRate(4.9, 5)).toBe(5); // within one step: lands exactly on target, no overshoot
    expect(trendGrowthRate(5, 5)).toBe(5); // already at target
    expect(trendGrowthRate(-2, -10)).toBe(MIN_GROWTH_RATE); // target clamped to MIN_GROWTH_RATE first
  });

  it("calculateGrowthCost: revenue * (perTurnGrowthRate/100) * 3.0 * 24", () => {
    // Source: constants/corporations.ts:719-740 calculateDailyGrowthCost,
    // GROWTH_COST_MULTIPLIER=3.0 (line 346) * TURNS_PER_DAY=24 (line 830).
    // revenue=1000, perTurnGrowthRate=1% => 1000 * 0.01 * 72 = 720
    expect(calculateGrowthCost(1000, 1)).toBeCloseTo(720, 6);
    expect(calculateGrowthCost(1000, 0)).toBe(0);
  });

  it("calculateGrowthCost: clamped to >=0 for negative growth (Rotunda addition, cited)", () => {
    expect(calculateGrowthCost(1000, -1)).toBe(0);
  });

  it("deriveCeoArchetype: deterministic 2x2 classification", () => {
    // Source: src/lib/npp/ceoArchetype.ts deriveCeoArchetype.
    expect(deriveCeoArchetype({ ambition: 80, stubbornness: 20 })).toBe("aggressive");
    expect(deriveCeoArchetype({ ambition: 80, stubbornness: 80 })).toBe("innovator");
    expect(deriveCeoArchetype({ ambition: 20, stubbornness: 80 })).toBe("costCutter");
    expect(deriveCeoArchetype({ ambition: 20, stubbornness: 20 })).toBe("cautious");
    // Midpoint (50) counts as "high" per TRAIT_MIDPOINT >= comparison.
    expect(deriveCeoArchetype({ ambition: 50, stubbornness: 50 })).toBe("innovator");
  });

  it("computeRealizedRevenueGrowthRate: annualized one-turn delta, clamped to [-10,15]", () => {
    // Source: src/lib/turn/gdpGrowth.ts:189-209.
    // (1020/1000 - 1) * 100 * (48/1) = 2 * 48 = 96 -> clamped to 15
    expect(computeRealizedRevenueGrowthRate(1020, 1000, 1, 48)).toBe(15);
    // (1000.3/1000 - 1) * 100 * 48 = 0.03 * 48 = 1.44
    expect(computeRealizedRevenueGrowthRate(1000.3, 1000, 1, 48)).toBeCloseTo(1.44, 9);
    // Shrinking: (990/1000 - 1) * 100 * 48 = -1 * 48 = -48 -> clamped to -10
    expect(computeRealizedRevenueGrowthRate(990, 1000, 1, 48)).toBe(-10);
  });

  it("computeRealizedRevenueGrowthRate: null on missing/invalid baseline", () => {
    expect(computeRealizedRevenueGrowthRate(1000, undefined, 1, 48)).toBeNull();
    expect(computeRealizedRevenueGrowthRate(1000, 0, 1, 48)).toBeNull();
    expect(computeRealizedRevenueGrowthRate(1000, 1000, 0, 48)).toBeNull();
    expect(computeRealizedRevenueGrowthRate(-1, 1000, 1, 48)).toBeNull();
  });
});

// ── Founding (deterministic, revenue formula hand-computed) ─────────────
describe("corporation founding", () => {
  it("US manufacturing corp revenue = countryGDP(millions*1e6) * weight/100, per-turn = annual/48", () => {
    const rng = rngFromSeed("founding-golden");
    const corps = seedCorporations(
      [{ id: "US", playable: true, gdp: 387000, growthRate: 0.046 }],
      rng,
      0,
    );
    const manufacturing = corps["US-manufacturing"]!;
    // Source: sectorSeedWeights1953.ts US manufacturing weight = 26.
    const expectedAnnual = 387000 * 1_000_000 * (26 / 100);
    expect(manufacturing.foundingRevenue).toBeCloseTo(expectedAnnual, 6);
    expect(manufacturing.liquidCapital).toBeCloseTo(expectedAnnual, 6);
    expect(manufacturing.revenue).toBeCloseTo(expectedAnnual / 48, 6);
    expect(manufacturing.countryId).toBe("US");
    expect(manufacturing.sectorType).toBe("manufacturing");
  });

  it("skips zero-weight sectors (e.g. US technology, RU automobiles/technology/entertainment)", () => {
    const rng = rngFromSeed("founding-zero-weight");
    const corps = seedCorporations(
      [
        { id: "US", playable: true, gdp: 387000, growthRate: 0.046 },
        { id: "RU", playable: true, gdp: 114352, growthRate: 0.055 },
      ],
      rng,
      0,
    );
    expect(corps["US-technology"]).toBeUndefined();
    expect(corps["RU-automobiles"]).toBeUndefined();
    expect(corps["RU-technology"]).toBeUndefined();
    expect(corps["RU-entertainment"]).toBeUndefined();
  });

  it("founds a corp for every nonzero-weight sector across US/UK/RU/DD, all with valid archetypes and bounded target growth", () => {
    const rng = rngFromSeed("founding-structural");
    const corps = seedCorporations(
      [
        { id: "US", playable: true, gdp: 387000, growthRate: 0.046 },
        { id: "UK", playable: true, gdp: 40336, growthRate: 0.04 },
        { id: "RU", playable: true, gdp: 114352, growthRate: 0.055 },
        { id: "DD", playable: true, gdp: 11905, growthRate: 0.03 },
      ],
      rng,
      0,
    );
    const byCountry: Record<string, number> = {};
    for (const corp of Object.values(corps)) {
      byCountry[corp.countryId] = (byCountry[corp.countryId] ?? 0) + 1;
      expect(["aggressive", "cautious", "innovator", "costCutter"]).toContain(corp.archetype);
      expect(corp.targetGrowthRate).toBeGreaterThanOrEqual(MIN_GROWTH_RATE);
      expect(corp.targetGrowthRate).toBeLessThanOrEqual(MAX_GROWTH_RATE);
      expect(corp.revenue).toBeGreaterThan(0);
      expect(corp.liquidCapital).toBeGreaterThan(0);
      expect(CORPORATION_TYPES).toContain(corp.sectorType);
    }
    // Nonzero-weight sector counts per sectorSeedWeights1953.ts.
    expect(byCountry["US"]).toBe(16);
    expect(byCountry["UK"]).toBe(16);
    expect(byCountry["RU"]).toBe(14);
    expect(byCountry["DD"]).toBe(17);
  });

  it("is deterministic: same rng seed produces byte-identical corp sets", () => {
    const countries = [{ id: "US", playable: true, gdp: 387000, growthRate: 0.046 }];
    const a = seedCorporations(countries, rngFromSeed("det-seed"), 0);
    const b = seedCorporations(countries, rngFromSeed("det-seed"), 0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("non-playable and unweighted countries found no corporations", () => {
    const rng = rngFromSeed("no-corps");
    const corps = seedCorporations(
      [
        { id: "FR", playable: false, gdp: 50000, growthRate: 0.03 },
        { id: "ZZ", playable: true, gdp: 1000, growthRate: 0.01 }, // no authored 1953 weights
      ],
      rng,
      0,
    );
    expect(Object.keys(corps).length).toBe(0);
  });
});

// ── Per-corp turn math (growth/margin/tax, hand-computed) ───────────────
describe("runCorporationTurn", () => {
  function baseCorp(overrides: Partial<Corporation> = {}): Corporation {
    return {
      id: "TEST-manufacturing",
      countryId: "US",
      sectorType: "manufacturing",
      personality: { ambition: 50, stubbornness: 50 },
      archetype: "innovator",
      revenue: 1_000_000,
      targetGrowthRate: 5,
      currentGrowthRate: 3,
      currentGrowthCost: 0,
      profitMargin: 35,
      effectiveProfitMargin: 35,
      liquidCapital: 500_000,
      foundingRevenue: 1_000_000,
      foundedAtTurn: 0,
      insolventSinceTurn: null,
      reincorporationCount: 0,
      ...overrides,
    };
  }

  it("grows revenue, charges growth cost, taxes positive income, accumulates liquidCapital", () => {
    const corp = baseCorp();
    runCorporationTurn(corp, 30);
    // currentGrowthRate trends 3 -> 3.5 (step 0.5 toward target 5)
    expect(corp.currentGrowthRate).toBeCloseTo(3.5, 6);
    const perTurnGrowthRate = 3.5 / 48;
    const expectedRevenue = 1_000_000 * (1 + perTurnGrowthRate / 100);
    expect(corp.revenue).toBeCloseTo(expectedRevenue, 4);
    const expectedGrowthCost = 1_000_000 * (perTurnGrowthRate / 100) * 3.0 * 24;
    expect(corp.currentGrowthCost).toBeCloseTo(expectedGrowthCost, 4);
    const expectedPreTax = 1_000_000 * 0.35 - expectedGrowthCost;
    const expectedTax = Math.max(0, expectedPreTax) * 0.3;
    const expectedNetIncome = expectedPreTax - expectedTax;
    expect(corp.liquidCapital).toBeCloseTo(500_000 + expectedNetIncome, 2);
  });

  it("applies the affordability brake when growth cost exceeds half of margin", () => {
    // Pin currentGrowthCost artificially high relative to revenue so the
    // priorGrowthCostShare >= priorMargin * GROWTH_COST_MARGIN_SHARE(0.5) trip fires.
    const corp = baseCorp({ revenue: 1_000_000, currentGrowthCost: 200_000, effectiveProfitMargin: 35, profitMargin: 35, targetGrowthRate: 10, currentGrowthRate: 10 });
    runCorporationTurn(corp, 30);
    // brakedTargetRate = max(MIN_GROWTH_RATE, 10 - 0.5) = 9.5
    expect(corp.targetGrowthRate).toBeCloseTo(9.5, 6);
  });

  it("does not tax negative pre-tax income (losses are not taxed)", () => {
    const corp = baseCorp({ profitMargin: -50, effectiveProfitMargin: -50, revenue: 1_000_000, currentGrowthRate: 0, targetGrowthRate: 0 });
    const before = corp.liquidCapital;
    runCorporationTurn(corp, 30);
    // netIncomePreTax = 1,000,000 * -0.5 - growthCost (growthCost ~0 since growth rate 0) = -500,000
    expect(corp.liquidCapital).toBeCloseTo(before - 500_000, 2);
  });
});

describe("checkInsolvency", () => {
  it("reincorporates immediately when liquidCapital falls below -foundingRevenue (deep threshold)", () => {
    const corp: Corporation = {
      id: "X", countryId: "US", sectorType: "retail", personality: { ambition: 10, stubbornness: 10 },
      archetype: "cautious", revenue: 100, targetGrowthRate: 1, currentGrowthRate: 1, currentGrowthCost: 0,
      profitMargin: 35, effectiveProfitMargin: 35, liquidCapital: -1_100_000, foundingRevenue: 1_000_000,
      foundedAtTurn: 0, insolventSinceTurn: null, reincorporationCount: 0,
    };
    checkInsolvency(corp, 10);
    expect(corp.reincorporationCount).toBe(1);
    expect(corp.liquidCapital).toBe(1_000_000);
    expect(corp.revenue).toBeCloseTo(1_000_000 / 48, 6);
    expect(corp.insolventSinceTurn).toBeNull();
  });

  it("reincorporates after PERSISTENT_INSOLVENCY_GRACE_TURNS(30) turns of negative-but-shallow liquidCapital", () => {
    const corp: Corporation = {
      id: "X", countryId: "US", sectorType: "retail", personality: { ambition: 10, stubbornness: 10 },
      archetype: "cautious", revenue: 100, targetGrowthRate: 1, currentGrowthRate: 1, currentGrowthCost: 0,
      profitMargin: 35, effectiveProfitMargin: 35, liquidCapital: -100, foundingRevenue: 1_000_000,
      foundedAtTurn: 0, insolventSinceTurn: null, reincorporationCount: 0,
    };
    checkInsolvency(corp, 10); // insolventSinceTurn = 10
    expect(corp.insolventSinceTurn).toBe(10);
    expect(corp.reincorporationCount).toBe(0);
    checkInsolvency(corp, 39); // 39 - 10 = 29 < 30, not yet
    expect(corp.reincorporationCount).toBe(0);
    checkInsolvency(corp, 40); // 40 - 10 = 30 >= 30, reincorporate
    expect(corp.reincorporationCount).toBe(1);
    expect(corp.liquidCapital).toBe(1_000_000);
  });

  it("clears insolventSinceTurn on recovery", () => {
    const corp: Corporation = {
      id: "X", countryId: "US", sectorType: "retail", personality: { ambition: 10, stubbornness: 10 },
      archetype: "cautious", revenue: 100, targetGrowthRate: 1, currentGrowthRate: 1, currentGrowthCost: 0,
      profitMargin: 35, effectiveProfitMargin: 35, liquidCapital: -100, foundingRevenue: 1_000_000,
      foundedAtTurn: 0, insolventSinceTurn: null, reincorporationCount: 0,
    };
    checkInsolvency(corp, 10);
    expect(corp.insolventSinceTurn).toBe(10);
    corp.liquidCapital = 50;
    checkInsolvency(corp, 11);
    expect(corp.insolventSinceTurn).toBeNull();
  });
});

// ── THE KEY WIRE: macro growth signal driven by corp revenue ────────────
describe("macro wire: corp revenue growth signal", () => {
  it("macroCountryTurnPhase reads world.corpRevenueSnapshots and drives outputGap/growthRate", () => {
    const world = createWorld(OPTS);
    // Force a clean, known snapshot: +10% revenue growth this turn for US.
    world.corpRevenueSnapshots["US"] = { current: 1_100_000, previous: 1_000_000, turn: world.meta.turn };
    const before = world.countries["US"]!.economy.outputGap;
    macroCountryTurnPhase.run(world, rngFromSeed("wire-test"));
    // (1,100,000/1,000,000 - 1)*100*48 = 10*48 = 480 -> clamped to SECTOR_SIGNAL_MAX(15).
    // A strongly positive sector signal should open the output gap upward.
    expect(world.countries["US"]!.economy.outputGap).toBeGreaterThan(before);
    expect(Number.isFinite(world.countries["US"]!.economy.growthRate)).toBe(true);
  });

  it("falls back to flat (no-shock) previous growth for a country with no corp data", () => {
    const world = createWorld(OPTS);
    delete (world.corpRevenueSnapshots as Record<string, unknown>)["US"];
    const prevGrowth = world.countries["US"]!.economy.growthRate;
    macroCountryTurnPhase.run(world, rngFromSeed("wire-fallback"));
    // No RNG shock anymore (GROWTH_SHOCK_PCT removed) — growth still moves via
    // output-gap integration toward potential, but the sector *signal* itself
    // is exactly the flat previous growth rate rather than a noisy draw. We
    // can't observe the signal directly here, but the whole computation must
    // stay finite and bounded regardless.
    expect(Number.isFinite(world.countries["US"]!.economy.growthRate)).toBe(true);
    expect(world.countries["US"]!.economy.growthRate).toBeGreaterThanOrEqual(-0.15);
    expect(world.countries["US"]!.economy.growthRate).toBeLessThanOrEqual(0.15);
  });
});

// ── Determinism ───────────────────────────────────────────────────────
describe("corporationTurn determinism", () => {
  it("same seed 50 turns identical corporations/corpRevenueSnapshots JSON", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
    expect(JSON.stringify(a.corpRevenueSnapshots)).toBe(JSON.stringify(b.corpRevenueSnapshots));
  });
});

// ── Long-run sanity ───────────────────────────────────────────────────
describe("corporation long-run sanity", () => {
  it("200 turns: every corp's finances stay finite, revenue positive, no NaN", () => {
    const world = createWorld({ seed: "corp-longrun", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 200; i++) {
      advanceTurn(world);
      for (const corp of Object.values(world.corporations)) {
        expect(Number.isFinite(corp.revenue)).toBe(true);
        expect(corp.revenue).toBeGreaterThan(0);
        expect(Number.isFinite(corp.liquidCapital)).toBe(true);
        expect(Number.isFinite(corp.currentGrowthRate)).toBe(true);
        expect(corp.currentGrowthRate).toBeGreaterThanOrEqual(MIN_GROWTH_RATE);
        expect(corp.currentGrowthRate).toBeLessThanOrEqual(MAX_GROWTH_RATE);
        expect(Number.isFinite(corp.targetGrowthRate)).toBe(true);
        expect(Number.isFinite(corp.effectiveProfitMargin)).toBe(true);
      }
      for (const snap of Object.values(world.corpRevenueSnapshots)) {
        expect(Number.isFinite(snap.current)).toBe(true);
        expect(Number.isFinite(snap.previous)).toBe(true);
      }
    }
  });
});

// ── Migration v17 -> v19 ─────────────────────────────────────────────
describe("save migration v17 -> v19", () => {
  it("seeds corporations and corpRevenueSnapshots for a pre-corp save", () => {
    const v17World: Record<string, unknown> = {
      meta: { schemaVersion: 17, seed: "mig-corp-seed", rng: [1, 2, 3, 4], turn: 12, date: "1953-03-24", era: "1953" },
      countries: {
        US: { id: "US", name: "United States", playable: true, economy: { gdp: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: 0 } },
        UK: { id: "UK", name: "United Kingdom", playable: true, economy: { gdp: 40336, growthRate: 0.04, inflationRate: 0.03, unemploymentRate: 0.018, outputGap: 0 } },
      },
      player: { name: "Tester", countryId: "US", cash: 10000 },
      news: [],
    };
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 17, savedAt: "2026-01-01T00:00:00Z", world: v17World });
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.keys(loaded.corporations).length).toBeGreaterThan(0);
    expect(loaded.corporations["US-manufacturing"]).toBeDefined();
    expect(loaded.corporations["UK-manufacturing"]).toBeDefined();
    expect(loaded.corpRevenueSnapshots["US"]).toBeDefined();
    expect(loaded.corpRevenueSnapshots["US"]!.current).toBe(loaded.corpRevenueSnapshots["US"]!.previous);
    // Migration is deterministic given the same input.
    const loaded2 = deserializeSave(raw);
    expect(JSON.stringify(loaded.corporations)).toBe(JSON.stringify(loaded2.corporations));
  });

  it("is a no-op when corporations already present (idempotent re-load)", () => {
    const world = createWorld(OPTS);
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: SCHEMA_VERSION, savedAt: "2026-01-01T00:00:00Z", world });
    const loaded = deserializeSave(raw);
    expect(JSON.stringify(loaded.corporations)).toBe(JSON.stringify(world.corporations));
  });
});
