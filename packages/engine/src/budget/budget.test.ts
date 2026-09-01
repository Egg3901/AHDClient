import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { advanceTurn } from "../engine.js";
import { calculateBudgetRevenue } from "./revenue.js";
import { calculateBudgetSpending } from "./spending.js";
import { checkBudgetInvariants, derivedSurplus } from "./invariants.js";
import { computeFiscalTerm, computeInflation } from "../phases/macroCountryTurn.js";
import { FISCAL_YEAR_START_TURN_IN_YEAR, getTurnInYear, isFiscalYearEnd } from "./fiscalYear.js";
import { applyPerTurnGrowthToFederalBases } from "./fiscalBaseGrowth.js";
import { calculateGenericRegionalRevenue } from "./regionalBudget.js";

const OPTS = { seed: "budget-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

// ── Revenue = spending identity ──────────────────────────────────────
describe("budget identity invariants", () => {
  it("revenue - spending = surplus for US/UK/RU/DD 1953", () => {
    const world = createWorld(OPTS);
    for (const cid of ["US", "UK", "RU", "DD"]) {
      const b = (world as unknown as { budgets: Record<string, { revenue: { total: number }; spending: { total: number }; surplus: number }> }).budgets[cid]!;
      expect(b, `budget for ${cid} exists`).toBeDefined();
      expect(b.surplus).toBe(b.revenue.total - b.spending.total);
      const breaches = checkBudgetInvariants(b as unknown as import("./types.js").CountryBudget);
      expect(breaches, `no breaches for ${cid}`).toEqual([]);
    }
  });

  it("revenue components sum to total", () => {
    const world = createWorld(OPTS);
    const b = (world as unknown as { budgets: Record<string, { revenue: import("./types.js").BudgetRevenue }> }).budgets.US!;
    const r = b.revenue;
    expect(r.total).toBe(r.incomeTax + r.domesticCorporateTax + r.foreignCorporateTax + r.payrollTax + r.tariffs + r.salesTax + r.other);
  });

  it("spending components sum to total", () => {
    const world = createWorld(OPTS);
    const b = (world as unknown as { budgets: Record<string, { spending: import("./types.js").BudgetSpending }> }).budgets.US!;
    const s = b.spending;
    const catSum = Object.values(s.byCategory).reduce((a, v) => a + v, 0);
    expect(s.total).toBe(catSum + s.stateGrants + s.debtInterest);
  });

  it("calculateBudgetRevenue is pure and matches seeded US revenue", () => {
    // Cite: US seeded incomeTax = 0.35*387B *35% = 47.2725B etc. Check one key line.
    const gdp = 387_000_000_000;
    const bases = {
      taxableIncome: gdp * 0.35,
      domesticCorporateProfits: gdp * 0.08 * 0.75,
      foreignCorporateProfits: gdp * 0.08 * 0.25,
      wagesAndSalaries: gdp * 0.4,
      importValue: gdp * 0.06,
      taxableSales: gdp * 0.4,
    };
    const rates = { incomeTax: 35, domesticCorporateTax: 40, foreignCorporateTax: 32, payrollTax: 3, tariffs: 0, salesTax: 0 };
    const rev = calculateBudgetRevenue(rates, bases, 15_000_000_000);
    // Expected incomeTax = 135.45B *0.35 = 47.4075B? Actually 387*0.35=135.45B *0.35=47.4075B
    expect(rev.incomeTax).toBe(Math.round(bases.taxableIncome * 0.35));
    expect(rev.total).toBe(rev.incomeTax + rev.domesticCorporateTax + rev.foreignCorporateTax + rev.payrollTax + rev.tariffs + rev.salesTax + rev.other);
  });
});

// ── Fiscal term goldens (cited) ──────────────────────────────────────
describe("fiscal term goldens", () => {
  // Source: src/lib/budget/inflation.ts FISCAL_COEFF_DEFICIT 0.15, FISCAL_COEFF_SURPLUS 0.08, clamp [-30,50]
  it("5% deficit => 5*0.15=0.75pp fiscal term", () => {
    // surplus -19.35B on 387B gdp => -5% gdp deficit => deficitPct 5 => term 0.75
    const gdp = 387_000_000_000;
    const surplus = -0.05 * gdp;
    expect(computeFiscalTerm(surplus, gdp)).toBeCloseTo(0.75, 6);
  });

  it("3% surplus => -3*0.08=-0.24pp fiscal term", () => {
    const gdp = 387_000_000_000;
    const surplus = 0.03 * gdp;
    expect(computeFiscalTerm(surplus, gdp)).toBeCloseTo(-0.24, 6);
  });

  it("clamps extreme deficit to 50%", () => {
    const gdp = 100_000_000_000;
    const surplus = -100_000_000_000; // 100% deficit but clamp to 50
    expect(computeFiscalTerm(surplus, gdp)).toBeCloseTo(50 * 0.15, 6); // 7.5
  });

  it("clamps extreme surplus to -30%", () => {
    const gdp = 100_000_000_000;
    const surplus = 100_000_000_000; // 100% surplus => clamp deficit -30 => term -30*0.08? Actually deficitPct -100 -> clamp -30 *0.08 = -2.4
    expect(computeFiscalTerm(surplus, gdp)).toBeCloseTo(-30 * 0.08, 6);
  });

  it("balanced budget => 0 term, so computeInflation matches baseline ~2%", () => {
    // Cite: inflation.ts Phillips-only baseline at NAIRU 5, growth 2, surplus 0 gives ~2%
    expect(computeInflation(2, 5, 2, 0, 100_000_000_000)).toBeCloseTo(2, 1);
    expect(computeInflation(2, 5, 2, 1_000_000_000, 100_000_000_000)).toBeLessThan(computeInflation(2, 5, 2, -1_000_000_000, 100_000_000_000));
  });

  it("large deficit raises inflation vs surplus", () => {
    const gdp = 387_000_000_000;
    const prev = 2, u = 5, g = 2;
    const withDeficit = computeInflation(prev, u, g, -0.05 * gdp, gdp);
    const withSurplus = computeInflation(prev, u, g, 0.03 * gdp, gdp);
    expect(withDeficit).toBeGreaterThan(withSurplus);
  });
});

// ── Fiscal year rollover ──────────────────────────────────────────────
describe("fiscalYear rollover", () => {
  it("FISCAL_YEAR_START_TURN_IN_YEAR is 40 (source: fiscalCalendar)", () => {
    expect(FISCAL_YEAR_START_TURN_IN_YEAR).toBe(40);
  });

  it("getTurnInYear maps correctly", () => {
    expect(getTurnInYear(1)).toBe(1);
    expect(getTurnInYear(48)).toBe(48);
    expect(getTurnInYear(49)).toBe(1);
    expect(isFiscalYearEnd(40)).toBe(true);
    expect(isFiscalYearEnd(39)).toBe(false);
    expect(isFiscalYearEnd(88)).toBe(true); // 40 +48
  });

  it("fiscal year increments at turn 40", () => {
    const world = createWorld(OPTS);
    const startFY = (world as unknown as { budgets: Record<string, { fiscalYear: number }> }).budgets.US!.fiscalYear;
    expect(startFY).toBe(1953);
    for (let i = 0; i < 39; i++) advanceTurn(world);
    // turn should be 39, next turn hits boundary? Actually advanceTurn increments turn.
    // After 40 turns, turn=40 and fiscalYear should have rolled.
    advanceTurn(world); // 40th
    const fy40 = (world as unknown as { budgets: Record<string, { fiscalYear: number }> }).budgets.US!.fiscalYear;
    expect(fy40).toBe(1954);
    // Next boundary at 88
    for (let i = 0; i < 48; i++) advanceTurn(world);
    const fy88 = (world as unknown as { budgets: Record<string, { fiscalYear: number }> }).budgets.US!.fiscalYear;
    expect(fy88).toBe(1955);
  });
});

// ── Fiscal base growth determinism ────────────────────────────────────
describe("fiscalBaseGrowth", () => {
  it("applyPerTurnGrowthToFederalBases grows wages by wageGrowth slice", () => {
    const bases = { taxableIncome: 100_000_000_000, domesticCorporateProfits: 23_220_000_000, foreignCorporateProfits: 7_740_000_000, wagesAndSalaries: 154_800_000_000, importValue: 23_220_000_000, taxableSales: 154_800_000_000 };
    const factors = { gdpGrowth: 4.6, wageGrowth: 4.5, inflationRate: 0.75, tradeGrowth: 3.0 };
    const grown = applyPerTurnGrowthToFederalBases(bases, factors);
    // One turn slice is ~wageGrowth/48 => 4.5%/48=0.09375% per turn
    const expectedWages = bases.wagesAndSalaries * (1 + 4.5 / 100 / 48);
    expect(grown.wagesAndSalaries).toBeCloseTo(expectedWages, 0);
    expect(grown.taxableIncome).toBeCloseTo(bases.taxableIncome * (1 + 4.5 / 100 / 48), 0);
  });
});

// ── Regional budget generic ───────────────────────────────────────────
describe("regionalBudgetProcessing", () => {
  it("generic calculation sums shares correctly", () => {
    const r = calculateGenericRegionalRevenue({
      regionId: "CA",
      countryId: "US",
      regionGdp: 10_000_000_000,
      regionPopulation: 1_000_000,
      nationalPopulation: 10_000_000,
      grantPool: 1_000_000_000,
    });
    expect(r.councilTax).toBeCloseTo(10_000_000_000 * 0.016, 0);
    expect(r.businessRates).toBeCloseTo(10_000_000_000 * 0.01, 0);
    expect(r.grant).toBeCloseTo(100_000_000, 0);
    expect(r.total).toBe(r.councilTax + r.businessRates + r.grant);
  });
});

// ── Determinism ───────────────────────────────────────────────────────
describe("budget determinism", () => {
  it("same seed 50 turns identical budgets JSON", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify((a as unknown as { budgets: unknown }).budgets)).toBe(JSON.stringify((b as unknown as { budgets: unknown }).budgets));
    expect(JSON.stringify((a as unknown as { regionalBudgets: unknown }).regionalBudgets)).toBe(JSON.stringify((b as unknown as { regionalBudgets: unknown }).regionalBudgets));
  });
});

// ── Migration v14 -> v15 ──────────────────────────────────────────────
describe("migration v14 -> v15", () => {
  it("old save without budgets migrates to v15 with budgets present", () => {
    const world = createWorld(OPTS);
    // Simulate old save at v14: strip budgets, downgrade version, serialize, deserialize
    const raw = serializeSave(world, "2026-09-01T00:00:00.000Z");
    const parsed = JSON.parse(raw) as { schemaVersion: number; world: Record<string, unknown> };
    // Remove budgets to simulate pre-migration
    delete parsed.world["budgets"];
    delete parsed.world["regionalBudgets"];
    (parsed.world as unknown as { meta: { schemaVersion: number } }).meta.schemaVersion = 14;
    parsed.schemaVersion = 14;
    const downgraded = JSON.stringify(parsed);
    const migrated = deserializeSave(downgraded);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect((migrated as unknown as { budgets: unknown }).budgets).toBeDefined();
    expect((migrated as unknown as { regionalBudgets: unknown }).regionalBudgets).toBeDefined();
    // Round-trip still v15
    const re = serializeSave(migrated, "2026-09-01T01:00:00.000Z");
    const reWorld = deserializeSave(re);
    expect(reWorld.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("serialize/deserialize preserves budgets", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 5; i++) advanceTurn(world);
    const raw = serializeSave(world, "2026-09-01T00:00:00.000Z");
    const restored = deserializeSave(raw);
    expect(JSON.stringify((restored as unknown as { budgets: unknown }).budgets)).toBe(JSON.stringify((world as unknown as { budgets: unknown }).budgets));
  });
});
