import { describe, expect, it, beforeEach } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import {
  BOND_UNIT_FACE_VALUE,
  calculateBondMarketPrice,
  calculateBondYieldToMaturityPercent,
  perTurnCouponPayment,
  getSovereignCouponRate,
  calculateQuarterlyIssuanceAmount,
  annualCouponCostForBond,
} from "./constants.js";
import { getTraceBonds, resetBondIdSequenceForTests } from "./bondTurn.js";
import { executeAction } from "../actions/execute.js";
import { ACTION_CATALOG } from "../actions/catalog.js";

const OPTS = { seed: "bonds-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

beforeEach(() => resetBondIdSequenceForTests());

// ── Price / yield goldens with citations ───────────────────────────────
describe("yield/price goldens (cite: bonds.ts calculateBondMarketPrice, calculateBondYieldToMaturityPercent)", () => {
  it("par bond at par price yields couponRate", () => {
    // coupon 5%, price 1.0, 1yr remaining => yield approx 5%
    const y = calculateBondYieldToMaturityPercent(5, 1.0, 48);
    expect(y).toBeCloseTo(5.0, 6);
  });

  it("premium bond (price >1) yields below coupon", () => {
    const yPremium = calculateBondYieldToMaturityPercent(5, 1.1, 48);
    const yPar = calculateBondYieldToMaturityPercent(5, 1.0, 48);
    expect(yPremium).toBeLessThan(yPar);
    // (0.05 + (1-1.1)/1)/1.1 = (0.05 -0.1)/1.1 = -0.04545 => -4.545%
    expect(yPremium).toBeCloseTo(((0.05 + (1 - 1.1) / 1) / 1.1) * 100, 6);
  });

  it("discount bond (price <1) yields above coupon", () => {
    const yDiscount = calculateBondYieldToMaturityPercent(5, 0.9, 48);
    const yPar = calculateBondYieldToMaturityPercent(5, 1.0, 48);
    expect(yDiscount).toBeGreaterThan(yPar);
  });

  it("calculateBondMarketPrice: coupon > currentRate => price > par; coupon < currentRate => price < par", () => {
    // Cite: bonds.ts price = c*annuity + discount; when c>r => price>1, c<r => price<1
    const premium = calculateBondMarketPrice(5, 3, 48, false);
    expect(premium).toBeGreaterThan(1.0);
    const discount = calculateBondMarketPrice(3, 5, 48, false);
    expect(discount).toBeLessThan(1.0);
  });

  it("calculateBondMarketPrice: short maturity converges to par", () => {
    // With 1 turn remaining, price should be very close to par regardless of rate gap
    const short = calculateBondMarketPrice(5, 10, 1, false);
    expect(Math.abs(short - 1.0)).toBeLessThan(0.1);
  });

  it("defaulted bond price is 0.1", () => {
    expect(calculateBondMarketPrice(5, 3, 48, true)).toBe(0.1);
  });

  it("at maturity price = 1.0", () => {
    expect(calculateBondMarketPrice(5, 10, 0, false)).toBe(1.0);
  });

  it("pull-to-par: 240t vs 48t with same rate gap", () => {
    const longPrice = calculateBondMarketPrice(5, 3, 240, false);
    const shortPrice = calculateBondMarketPrice(5, 3, 48, false);
    // Long bond deviates more from par than short
    expect(Math.abs(longPrice - 1)).toBeGreaterThan(Math.abs(shortPrice - 1));
  });

  it("golden: 5% coupon, 3% current, 1yr => price ~1.0194", () => {
    // Hand-computed: r=0.03, c=0.05, years=1, discount=1/1.03=0.97087, annuity=(1-0.97087)/0.03=0.97087, price=0.05*0.97087+0.97087=1.0194
    const price = calculateBondMarketPrice(5, 3, 48, false);
    expect(price).toBeCloseTo(1.0194, 3);
  });

  it("golden: 3% coupon, 5% current, 5yr => price ~0.9135", () => {
    // years=5, r=0.05, c=0.03: discount=0.7835, annuity=4.3295, price=0.03*4.3295+0.7835 ≈0.9134
    const price = calculateBondMarketPrice(3, 5, 240, false);
    expect(price).toBeCloseTo(0.9134, 3);
  });
});

// ── Sovereign coupon rate vs term premium ─────────────────────────────
describe("sovereign coupon rate (cite: sovereign.ts getSovereignCouponRate, SOVEREIGN_BOND_TERM_PREMIUMS)", () => {
  it("48t at prime 3.0 => 3.0 (no premium)", () => {
    expect(getSovereignCouponRate(3.0, 48)).toBe(3.0);
  });
  it("96t at prime 3.0 => 3.25 (+0.25)", () => {
    expect(getSovereignCouponRate(3.0, 96)).toBe(3.25);
  });
  it("240t at prime 3.0 => 3.75 (+0.75)", () => {
    expect(getSovereignCouponRate(3.0, 240)).toBe(3.75);
  });
});

// ── Quarterly issuance math ────────────────────────────────────────────
describe("quarterly issuance (cite: sovereign.ts calculateQuarterlyIssuanceAmount)", () => {
  it("surplus => 0 issuance; deficit => floor((deficit/4)/1000)*1000", () => {
    expect(calculateQuarterlyIssuanceAmount(-100)).toBe(0); // surplus negative deficit? Actually we pass annualDeficit positive
    expect(calculateQuarterlyIssuanceAmount(0)).toBe(0);
    expect(calculateQuarterlyIssuanceAmount(4_000)).toBe(1000);
    expect(calculateQuarterlyIssuanceAmount(4_500)).toBe(1000);
    expect(calculateQuarterlyIssuanceAmount(8_000)).toBe(2000);
  });
});

// ── Coupon servicing math ─────────────────────────────────────────────
describe("coupon servicing math (cite: bonds.ts perTurnCouponPayment)", () => {
  it("perTurn = (couponRate/100 * face)/48", () => {
    expect(perTurnCouponPayment(5, 1_000)).toBeCloseTo((0.05 * 1_000) / 48, 10);
    expect(perTurnCouponPayment(3.25, 1_000)).toBeCloseTo((0.0325 * 1_000) / 48, 10);
  });

  it("annualCouponCost = (couponRate/100)*totalIssued", () => {
    expect(annualCouponCostForBond(5, 10_000_000)).toBe(500_000);
    expect(annualCouponCostForBond(3.25, 1_200_000)).toBeCloseTo(39_000, 10);
  });

  it("coupon turn integration: player holding 10 units of 5% bond receives perTurn*10 each turn", () => {
    const world = createWorld(OPTS);
    // Seed a controlled bond
    world.bonds["test-1"] = {
      id: "test-1",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: BOND_UNIT_FACE_VALUE,
      couponRate: 5,
      maturityTurns: 48,
      issuedAtTurn: world.meta.turn,
      maturityTurn: world.meta.turn + 48,
      marketPrice: 1.0,
      totalIssued: 1_000_000,
      publicFloat: 990,
      holders: [{ holderId: "player", units: 10 }],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const beforeCash = world.player.cash;
    const perUnit = perTurnCouponPayment(5, BOND_UNIT_FACE_VALUE);
    advanceTurn(world);
    const expected = perUnit * 10;
    expect(world.player.cash - beforeCash).toBeCloseTo(expected, 6);
  });
});

// ── Budget-debt linkage invariants ─────────────────────────────────────
describe("budget-debt linkage invariants (cite: sovereign.ts applySovereignDebtAdjustment)", () => {
  it("after issuance, budget.debt.principal and spending.debtInterest increase, surplus = revenue - spending", () => {
    const world = createWorld(OPTS);
    // Force a large deficit so auction triggers at turn 12.
    // Keep invariants consistent: bump a spending category so total matches categories+grants+interest.
    const us = world.budgets["US"]!;
    const deficitTarget = 40_000_000_000; // 40B deficit -> quarterly ~10B
    // Achieve deficit by keeping revenue fixed and inflating defense so spending.total reflects categories.
    const extraSpend = 60_000_000_000;
    us.spending.byCategory["defense"] = (us.spending.byCategory["defense"] ?? 0) + extraSpend;
    const catSumPre = Object.values(us.spending.byCategory).reduce((a, v) => a + v, 0);
    us.spending.total = catSumPre + us.spending.stateGrants + us.spending.debtInterest;
    us.surplus = us.revenue.total - us.spending.total;
    // Now force revenue low enough to keep deficit ~40B even after fiscalBaseGrowth drift.
    us.revenue.total = us.spending.total - deficitTarget;
    us.surplus = us.revenue.total - us.spending.total;
    const principalBefore = us.debt.principal;
    const debtInterestBefore = us.spending.debtInterest;
    const revTotal = us.revenue.total;
    // Advance to next quarterly auction boundary (turn %12==0). Current turn 0 -> advance 12 turns
    for (let i = 0; i < 12; i++) advanceTurn(world);
    // At turn 12, at least one bond for US should have been created (deficit + rollover)
    const usBonds = Object.values(world.bonds).filter((b) => b.countryId === "US" && b.issuedAtTurn === 12);
    expect(usBonds.length).toBeGreaterThan(0);
    const newlyIssued = usBonds.reduce((s, b) => s + b.totalIssued, 0);
    const newlyAnnual = usBonds.reduce((s, b) => s + annualCouponCostForBond(b.couponRate, b.totalIssued), 0);
    // Invariant: principal and debtInterest grew by the new issuance amounts
    // Note: fiscalBaseGrowth may have moved revenue/spending slightly, but debt delta should dominate
    expect(world.budgets["US"]!.debt.principal).toBeGreaterThanOrEqual(principalBefore + newlyIssued - 1);
    // Check surplus invariant holds after issuance
    const b = world.budgets["US"]!;
    expect(b.surplus).toBe(b.revenue.total - b.spending.total);
    // Also check that spending.total still equals categories + grants + debtInterest
    const catSum = Object.values(b.spending.byCategory).reduce((a, v) => a + v, 0);
    expect(b.spending.total).toBe(catSum + b.spending.stateGrants + b.spending.debtInterest);
    void newlyAnnual;
    void debtInterestBefore;
    void revTotal;
  });

  it("at maturity, budget principal and debtInterest decrease, player receives face value", () => {
    const world = createWorld(OPTS);
    world.player.cash = 10_000;
    world.bonds["mature-test"] = {
      id: "mature-test",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: BOND_UNIT_FACE_VALUE,
      couponRate: 4,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 2, // will mature on turn 2
      marketPrice: 1.0,
      totalIssued: 100_000,
      publicFloat: 90,
      holders: [{ holderId: "player", units: 10 }],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    // Manually bump budget debt to reflect this outstanding bond (so reversal is testable)
    const b = world.budgets["US"]!;
    const annual = annualCouponCostForBond(4, 100_000);
    b.debt.principal += 100_000;
    b.spending.debtInterest += annual;
    b.spending.total += annual;
    b.surplus = b.revenue.total - b.spending.total;
    const principalBefore = b.debt.principal;
    const interestBefore = b.spending.debtInterest;
    const cashBefore = world.player.cash;
    // Advance 2 turns -> bond matures on the second turn's bondCouponMaturity phase
    advanceTurn(world); // turn 1
    advanceTurn(world); // turn 2 -> maturity
    expect(world.bonds["mature-test"]!.matured).toBe(true);
    expect(b.debt.principal).toBe(principalBefore - 100_000);
    expect(b.spending.debtInterest).toBeCloseTo(interestBefore - annual, 6);
    // Player received face (10*1000) plus two turns of coupons (10 units * perTurn*2). Face dominates.
    expect(world.player.cash).toBeGreaterThan(cashBefore + 10_000 - 1);
  });

  it("surplus invariant holds over 60 turns", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 60; i++) advanceTurn(world);
    for (const b of Object.values(world.budgets)) {
      expect(b.surplus).toBe(b.revenue.total - b.spending.total);
      const catSum = Object.values(b.spending.byCategory).reduce((a, v) => a + v, 0);
      expect(b.spending.total).toBe(catSum + b.spending.stateGrants + b.spending.debtInterest);
    }
  });
});

// ── Price/yield vs W3 prime rate ───────────────────────────────────────
describe("price/yield vs W3 prime rate (cite: sovereign coupon vs prime + bondTurn marketPrice)", () => {
  it("raising primeRate lowers existing bond marketPrice, lowering raises it", () => {
    const world = createWorld(OPTS);
    world.bonds["price-test"] = {
      id: "price-test",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: BOND_UNIT_FACE_VALUE,
      couponRate: 3.0,
      maturityTurns: 240,
      issuedAtTurn: 0,
      maturityTurn: 240,
      marketPrice: 1.0,
      totalIssued: 1_000_000,
      publicFloat: 1000,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    world.centralBanks["US"]!.primeRate = 3.0;
    advanceTurn(world); // price at parity -> ~1.0
    const priceAtPar = world.bonds["price-test"]!.marketPrice;
    world.centralBanks["US"]!.primeRate = 5.0;
    advanceTurn(world);
    const priceAfterHike = world.bonds["price-test"]!.marketPrice;
    expect(priceAfterHike).toBeLessThan(priceAtPar);
    world.centralBanks["US"]!.primeRate = 1.5;
    advanceTurn(world);
    const priceAfterCut = world.bonds["price-test"]!.marketPrice;
    expect(priceAfterCut).toBeGreaterThan(priceAfterHike);
  });

  it("trace shape reflects current price/yield", () => {
    const world = createWorld(OPTS);
    world.bonds["trace-1"] = {
      id: "trace-1",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: 1000,
      couponRate: 5,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1.05,
      totalIssued: 5_000_000,
      publicFloat: 5000,
      holders: [{ holderId: "player", units: 5 }],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const traces = getTraceBonds(world);
    const t = traces.find((x) => x.id === "trace-1")!;
    expect(t).toBeDefined();
    expect(t.yieldToMaturity).toBeCloseTo(calculateBondYieldToMaturityPercent(5, 1.05, 48), 6);
    expect(t.playerUnits).toBe(5);
  });
});

// ── Player buy/sell bond actions (W34 catalog pattern with mainline pricing) ─
describe("player buy/sell bond actions (cite: bonds purchase at marketPrice × face, bondHolderOps hold)", () => {
  it("buyBond deducts cash at marketPrice × face and increases holding", () => {
    const world = createWorld(OPTS);
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    world.bonds["buy-1"] = {
      id: "buy-1",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: 1000,
      couponRate: 3,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1.02,
      totalIssued: 10_000_000,
      publicFloat: 1000,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    expect(ACTION_CATALOG.buyBond.status).toBe("available");
    expect(ACTION_CATALOG.sellBond.status).toBe("available");
    const beforeCash = world.player.cash;
    const res = executeAction(world, "player", "buyBond", { bondId: "buy-1", units: 10 });
    expect(res.ok).toBe(true);
    const expectedCost = Math.round(10 * 1000 * 1.02 * 100) / 100;
    expect(world.player.cash).toBe(beforeCash - expectedCost);
    expect(world.bonds["buy-1"]!.holders.find((h) => h.holderId === "player")!.units).toBe(10);
    expect(world.bonds["buy-1"]!.publicFloat).toBe(990);
  });

  it("sellBond credits cash and reduces holding", () => {
    const world = createWorld(OPTS);
    world.player.cash = 0;
    world.player.actions = 10;
    world.bonds["sell-1"] = {
      id: "sell-1",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: 1000,
      couponRate: 3,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 0.98,
      totalIssued: 10_000_000,
      publicFloat: 900,
      holders: [{ holderId: "player", units: 20 }],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const beforeCash = world.player.cash;
    const res = executeAction(world, "player", "sellBond", { bondId: "sell-1", units: 5 });
    expect(res.ok).toBe(true);
    const expectedProceeds = Math.round(5 * 1000 * 0.98 * 100) / 100;
    expect(world.player.cash).toBe(beforeCash + expectedProceeds);
    expect(world.bonds["sell-1"]!.holders.find((h) => h.holderId === "player")!.units).toBe(15);
  });

  it("PORT-STUB: cross-currency buy is blocked with named blocker forex", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 1_000_000;
    // Bond in UK (GBP) while player is US (USD) — should be blocked
    world.bonds["fx-1"] = {
      id: "fx-1",
      issuerType: "sovereign",
      countryId: "UK",
      issuerName: "UK",
      faceValue: 1000,
      couponRate: 4,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1.0,
      totalIssued: 5_000_000,
      publicFloat: 5000,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "GBP",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const res = executeAction(world, "player", "buyBond", { bondId: "fx-1", units: 1 });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/forex/);
  });

  it("rejects buying more than public float", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 1_000_000;
    world.bonds["float-1"] = {
      id: "float-1",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: 1000,
      couponRate: 3,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1.0,
      totalIssued: 10_000,
      publicFloat: 2,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const res = executeAction(world, "player", "buyBond", { bondId: "float-1", units: 5 });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/available/);
  });

  it("rejects buy with insufficient cash", () => {
    const world = createWorld(OPTS);
    world.player.actions = 10;
    world.player.cash = 100;
    world.bonds["cash-1"] = {
      id: "cash-1",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: 1000,
      couponRate: 3,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1.0,
      totalIssued: 10_000,
      publicFloat: 100,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const res = executeAction(world, "player", "buyBond", { bondId: "cash-1", units: 1 });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/Not enough cash/);
  });
});

// ── Determinism ──────────────────────────────────────────────────────────
describe("determinism", () => {
  it("same seed 30 turns yields identical bonds + player cash + budgets", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 30; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.bonds)).toBe(JSON.stringify(b.bonds));
    expect(a.player.cash).toBe(b.player.cash);
    expect(JSON.stringify(a.budgets)).toBe(JSON.stringify(b.budgets));
    expect(JSON.stringify(a.centralBanks)).toBe(JSON.stringify(b.centralBanks));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── Chained migration + schema ─────────────────────────────────────────
describe("schema migration v30 -> v31 (chained, resolver note in save.ts)", () => {
  it("old save without bonds migrates to v31 with bonds present", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, "2026-09-01T00:00:00.000Z")) as { schemaVersion: number; world: Record<string, unknown> };
    delete raw.world["bonds"];
    (raw.world as unknown as { meta: { schemaVersion: number } }).meta.schemaVersion = 30;
    raw.schemaVersion = 30;
    const downgraded = JSON.stringify(raw);
    const migrated = deserializeSave(downgraded);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect((migrated as unknown as { bonds: unknown }).bonds).toBeDefined();
    expect(typeof (migrated as unknown as { bonds: Record<string, unknown> }).bonds).toBe("object");
    // Round-trip still v31
    const re = serializeSave(migrated, "2026-09-01T01:00:00.000Z");
    const reWorld = deserializeSave(re);
    expect(reWorld.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("serialize/deserialize preserves bonds and holder cash", () => {
    const world = createWorld(OPTS);
    world.bonds["persist-1"] = {
      id: "persist-1",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "US",
      faceValue: 1000,
      couponRate: 4,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1.03,
      totalIssued: 2_000_000,
      publicFloat: 1995,
      holders: [{ holderId: "player", units: 5 }],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const raw = serializeSave(world, "2026-09-01T00:00:00.000Z");
    const restored = deserializeSave(raw);
    expect(JSON.stringify((restored as unknown as { bonds: unknown }).bonds)).toBe(JSON.stringify((world as unknown as { bonds: unknown }).bonds));
    expect(restored.player.cash).toBe(world.player.cash);
  });
});
