import { describe, it, expect } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { seedCorporations, tickerForSector } from "../corporation/founding.js";
import { rngFromSeed } from "../rng.js";
import { computeSharePrices, rateLimitPrice, type SharePriceInput } from "./sharePriceFormula.js";
import { pushEarningsHistory, normalizedEarningsFromHistory } from "./earnings.js";
import {
  FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT,
  FUNDAMENTAL_EARNINGS_POWER_WEIGHT,
  FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT,
  MIN_SHARE_PRICE,
  SHARE_PRICE_MAX_TURN_MOVE,
  CEO_INITIAL_SHARES,
  NPC_FOUNDER_SHARE_FRACTION,
  DEFAULT_SHARE_PRICE,
} from "./constants.js";

const OPTS = { seed: "w10-market-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

function input(overrides: Partial<SharePriceInput>): SharePriceInput {
  return {
    corpId: "corpA",
    liquidCapitalAnchor: 0,
    normalizedEarningsAnchor: 0,
    sectorGrowthRate: 0,
    costOfCapital: 0.1,
    totalShares: 1_000_000,
    previousSharePrice: 1.0, // <= SHARE_PRICE_RATE_LIMIT_MIN_PREV: skips the rate limiter for these pure-formula goldens
    ...overrides,
  };
}

// ── Pricing formula goldens (hand-computed, cited to sharePriceFormula.ts) ──
describe("computeSharePrices — fundamental value (W10 ported subset)", () => {
  it("zero everything floors at MIN_SHARE_PRICE", () => {
    const r = computeSharePrices([input({})]).get("corpA")!;
    expect(r).toBe(MIN_SHARE_PRICE);
  });

  it("tangible-book-only: liquidCapital=1,000,000 / totalShares=1,000,000 => weight 1.0 * 1.00 = 1.00", () => {
    // tangibleBookPerShare = 1,000,000 / 1,000,000 = 1.00; weight 1.0 => 1.00
    const r = computeSharePrices([input({ liquidCapitalAnchor: 1_000_000 })]).get("corpA")!;
    expect(r).toBeCloseTo(FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT * 1.0, 6);
    expect(r).toBeCloseTo(1.0, 6);
  });

  it("earnings-power-only: 100,000/0.1/1,000,000 = 1.00/share; weight 0.4 => 0.40", () => {
    const r = computeSharePrices(
      [input({ normalizedEarningsAnchor: 100_000, costOfCapital: 0.1 })],
    ).get("corpA")!;
    expect(r).toBeCloseTo(FUNDAMENTAL_EARNINGS_POWER_WEIGHT * 1.0, 6);
    expect(r).toBeCloseTo(0.4, 6);
  });

  it("growth premium adds on top of earnings power (hand-computed)", () => {
    // gCapped = min(0.05, 0.1 - 0.02) = 0.05
    // growthPremiumPerShare = (100,000 * 0.05) / (0.1 - 0.05) / 1,000,000 = 5,000 / 0.05 / 1e6 = 0.10
    // earningsPowerPerShare = 100,000 / 0.1 / 1e6 = 1.00
    // total = 0.4*1.00 + 0.1*0.10 = 0.40 + 0.01 = 0.41
    const r = computeSharePrices(
      [input({ normalizedEarningsAnchor: 100_000, costOfCapital: 0.1, sectorGrowthRate: 0.05 })],
    ).get("corpA")!;
    expect(r).toBeCloseTo(0.4 + FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT * 0.1, 6);
    expect(r).toBeCloseTo(0.41, 6);
  });

  it("higher earnings => higher price", () => {
    const low = computeSharePrices([input({ normalizedEarningsAnchor: 50_000 })]).get("corpA")!;
    const high = computeSharePrices([input({ normalizedEarningsAnchor: 200_000 })]).get("corpA")!;
    expect(high).toBeGreaterThan(low);
  });

  it("higher costOfCapital => lower price, all else equal", () => {
    const lowRate = computeSharePrices([input({ normalizedEarningsAnchor: 100_000, costOfCapital: 0.05 })]).get("corpA")!;
    const highRate = computeSharePrices([input({ normalizedEarningsAnchor: 100_000, costOfCapital: 0.15 })]).get("corpA")!;
    expect(highRate).toBeLessThan(lowRate);
  });

  it("sectorGrowthRate >= costOfCapital is capped (no div-by-zero blowup)", () => {
    const r = computeSharePrices(
      [input({ normalizedEarningsAnchor: 100_000, sectorGrowthRate: 0.1, costOfCapital: 0.1 })],
    ).get("corpA")!;
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
  });

  it("negative liquidCapital floors tangible book at 0, never produces a negative price", () => {
    const r = computeSharePrices([input({ liquidCapitalAnchor: -5_000_000 })]).get("corpA")!;
    expect(r).toBe(MIN_SHARE_PRICE);
  });

  it("rounds to 2 decimal places", () => {
    const r = computeSharePrices([input({ liquidCapitalAnchor: 1_234_567 })]).get("corpA")!;
    expect(r).toBe(Math.round(r * 100) / 100);
  });
});

describe("rateLimitPrice — per-turn move cap (mainline #2888)", () => {
  it("caps an up-move at +MAX_TURN_MOVE of prev", () => {
    expect(rateLimitPrice(1000, 10)).toBeCloseTo(10 * (1 + SHARE_PRICE_MAX_TURN_MOVE), 6);
  });
  it("caps a down-move at -MAX_TURN_MOVE of prev", () => {
    expect(rateLimitPrice(0, 100)).toBeCloseTo(100 * (1 - SHARE_PRICE_MAX_TURN_MOVE), 6);
  });
  it("passes through small moves unchanged", () => {
    expect(rateLimitPrice(105, 100)).toBe(105);
  });
  it("exempts penny corps (prev <= $1) so recovery isn't pinned", () => {
    expect(rateLimitPrice(50, 1.0)).toBe(50);
    expect(rateLimitPrice(50, 0.01)).toBe(50);
  });

  it("computeSharePrices applies the limiter end-to-end: fundamental far above prev is capped", () => {
    // fundamental = 1.0 * (100,000,000/1,000,000) = 100; prev = 10 => capped at 10*1.35=13.50
    const r = computeSharePrices(
      [input({ liquidCapitalAnchor: 100_000_000, previousSharePrice: 10 })],
    ).get("corpA")!;
    expect(r).toBeCloseTo(10 * (1 + SHARE_PRICE_MAX_TURN_MOVE), 2);
  });
});

// ── Earnings rolling window ──────────────────────────────────────────────
describe("earnings rolling window", () => {
  it("normalizedEarningsFromHistory is the arithmetic mean, 0 for empty", () => {
    expect(normalizedEarningsFromHistory([])).toBe(0);
    expect(normalizedEarningsFromHistory([100, 200, 300])).toBeCloseTo(200, 6);
  });
  it("pushEarningsHistory trims to the rolling window (3 turns)", () => {
    let h = pushEarningsHistory(undefined, 1);
    h = pushEarningsHistory(h, 2);
    h = pushEarningsHistory(h, 3);
    h = pushEarningsHistory(h, 4);
    expect(h).toEqual([2, 3, 4]);
  });
});

// ── Ownership seeding (founding.ts) ──────────────────────────────────────
describe("W10 share ownership seeding at founding", () => {
  it("splits founder/public-float 51/49 of CEO_INITIAL_SHARES, prices from founding liquidCapital", () => {
    const countries = [{ id: "US", playable: true, gdp: 387000, growthRate: 0.046 }];
    const corps = seedCorporations(countries, rngFromSeed("ownership-seed"), 0);
    const corp = corps["US-manufacturing"]!;
    expect(corp.totalShares).toBe(CEO_INITIAL_SHARES);
    const expectedNpcShares = Math.floor(CEO_INITIAL_SHARES * NPC_FOUNDER_SHARE_FRACTION);
    expect(corp.shareholders).toEqual([{ holder: "npc", shares: expectedNpcShares }]);
    expect(corp.publicFloat).toBe(CEO_INITIAL_SHARES - expectedNpcShares);
    expect(corp.shareholders[0]!.shares + corp.publicFloat).toBe(corp.totalShares);
    expect(corp.tickerSymbol).toBe(tickerForSector("US", "manufacturing"));
    const expectedPrice = Math.max(DEFAULT_SHARE_PRICE, Math.round((corp.liquidCapital / corp.totalShares) * 100) / 100);
    expect(corp.sharePrice).toBe(expectedPrice);
    expect(corp.fundamentalSharePrice).toBe(expectedPrice);
    expect(corp.earningsHistory).toEqual([]);
  });
});

// ── advanceTurn-path integration: recomputeSharePricesPhase wiring ───────
describe("recomputeSharePricesPhase (advanceTurn integration)", () => {
  it("reprices every corp each turn from that same turn's corporationTurn output", () => {
    const world = createWorld(OPTS);
    const before = world.corporations["US-manufacturing"]!.sharePrice;
    advanceTurn(world);
    const corp = world.corporations["US-manufacturing"]!;
    // sharePrice === fundamentalSharePrice always in W10 (order-flow/sentiment PORT-STUB, see file doc).
    expect(corp.sharePrice).toBe(corp.fundamentalSharePrice);
    expect(Number.isFinite(corp.sharePrice)).toBe(true);
    expect(corp.sharePrice).toBeGreaterThanOrEqual(MIN_SHARE_PRICE);
    // earningsHistory got this turn's push.
    expect(corp.earningsHistory.length).toBe(1);
    void before;
  });

  it("is deterministic: same seed produces byte-identical corp market state after 5 turns", () => {
    const a = createWorld(OPTS);
    const b = createWorld({ ...OPTS });
    for (let i = 0; i < 5; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
  });
});

// ── Buy/sell actions: conservation + gating ──────────────────────────────
describe("buyShares / sellShares actions", () => {
  it("buy debits player cash and credits it to the issuing corp's treasury (treasury-backed market maker)", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-manufacturing"]!;
    const price = corp.sharePrice;
    world.player.cash = 1_000_000_000; // corp.sharePrice scales with real sector GDP; give the player enough headroom to buy 100 shares
    const cashBefore = world.player.cash;
    const liquidBefore = corp.liquidCapital;
    const floatBefore = corp.publicFloat;

    const res = executeAction(world, "player", "buyShares", { corpId: "US-manufacturing", shares: 100 });
    expect(res.ok).toBe(true);

    const notional = Math.round(100 * price * 100) / 100;
    expect(world.player.cash).toBeCloseTo(cashBefore - notional, 6);
    expect(corp.liquidCapital).toBeCloseTo(liquidBefore + notional, 6);
    expect(corp.publicFloat).toBe(floatBefore - 100);
    const holding = corp.shareholders.find((sh) => sh.holder === "player");
    expect(holding?.shares).toBe(100);
    expect(holding?.avgCostPerShare).toBe(price);
  });

  it("buy/sell round trip at an unchanged price conserves money exactly (no money created)", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-manufacturing"]!;
    world.player.cash = 1_000_000_000; // headroom for 250 shares at real sector-GDP-scaled price
    const cashBefore = world.player.cash;
    const liquidBefore = corp.liquidCapital;
    const floatBefore = corp.publicFloat;
    const totalBefore = cashBefore + liquidBefore;

    const buy = executeAction(world, "player", "buyShares", { corpId: "US-manufacturing", shares: 250 });
    expect(buy.ok).toBe(true);
    const sell = executeAction(world, "player", "sellShares", { corpId: "US-manufacturing", shares: 250 });
    expect(sell.ok).toBe(true);

    expect(world.player.cash).toBeCloseTo(cashBefore, 6);
    expect(corp.liquidCapital).toBeCloseTo(liquidBefore, 6);
    expect(corp.publicFloat).toBe(floatBefore);
    expect(corp.shareholders.find((sh) => sh.holder === "player")).toBeUndefined();
    expect(world.player.cash + corp.liquidCapital).toBeCloseTo(totalBefore, 6);
  });

  it("sell rejects when the player doesn't own enough shares", () => {
    const world = createWorld(OPTS);
    const res = executeAction(world, "player", "sellShares", { corpId: "US-manufacturing", shares: 10 });
    expect(res.ok).toBe(false);
  });

  it("buy rejects when requested shares exceed the public float", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-manufacturing"]!;
    const res = executeAction(world, "player", "buyShares", {
      corpId: "US-manufacturing",
      shares: corp.publicFloat + 1,
    });
    expect(res.ok).toBe(false);
  });

  it("buy rejects when the player doesn't have enough cash", () => {
    const world = createWorld(OPTS);
    world.player.cash = 1;
    const res = executeAction(world, "player", "buyShares", { corpId: "US-manufacturing", shares: 1_000_000 });
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown corporation id", () => {
    const world = createWorld(OPTS);
    const res = executeAction(world, "player", "buyShares", { corpId: "NOPE-nothing", shares: 1 });
    expect(res.ok).toBe(false);
  });
});

// ── Long-run sanity ────────────────────────────────────────────────────
describe("market long-run sanity", () => {
  it("200 turns: every corp's share price and float stay finite, positive, and share-conserving", () => {
    const world = createWorld({ seed: "market-longrun", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 200; i++) {
      advanceTurn(world);
      for (const corp of Object.values(world.corporations)) {
        expect(Number.isFinite(corp.sharePrice)).toBe(true);
        expect(corp.sharePrice).toBeGreaterThan(0);
        expect(Number.isFinite(corp.fundamentalSharePrice)).toBe(true);
        expect(corp.fundamentalSharePrice).toBeGreaterThan(0);
        expect(corp.totalShares).toBe(CEO_INITIAL_SHARES);
        expect(corp.publicFloat).toBeGreaterThanOrEqual(0);
        const heldShares = corp.shareholders.reduce((sum, sh) => sum + sh.shares, 0);
        expect(heldShares + corp.publicFloat).toBe(corp.totalShares);
      }
    }
  });
});

// ── Schema migration v25 -> v26 ──────────────────────────────────────────
describe("save migration v25 -> v26", () => {
  it("backfills tickerSymbol/totalShares/sharePrice/shareholders/publicFloat/earningsHistory on pre-W10 corps", () => {
    const w = createWorld(OPTS);
    // Simulate a pre-W10 save: corporations exist (W9) but without any market field.
    const strippedCorporations: Record<string, unknown> = {};
    for (const [id, corp] of Object.entries(w.corporations)) {
      const c = { ...corp } as Record<string, unknown>;
      delete c["tickerSymbol"];
      delete c["totalShares"];
      delete c["sharePrice"];
      delete c["fundamentalSharePrice"];
      delete c["shareholders"];
      delete c["publicFloat"];
      delete c["earningsHistory"];
      strippedCorporations[id] = c;
    }
    const v25World = { ...w, corporations: strippedCorporations, meta: { ...w.meta, schemaVersion: 25 } };
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 25, savedAt: "2026-01-01T00:00:00Z", world: v25World });

    const migrated = deserializeSave(raw);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.meta.schemaVersion).toBe(30);

    const corp = migrated.corporations["US-manufacturing"]!;
    expect(corp.totalShares).toBe(CEO_INITIAL_SHARES);
    const expectedNpcShares = Math.floor(CEO_INITIAL_SHARES * NPC_FOUNDER_SHARE_FRACTION);
    expect(corp.shareholders).toEqual([{ holder: "npc", shares: expectedNpcShares }]);
    expect(corp.publicFloat).toBe(CEO_INITIAL_SHARES - expectedNpcShares);
    expect(corp.tickerSymbol).toBe(tickerForSector("US", "manufacturing"));
    expect(corp.earningsHistory).toEqual([]);
    const expectedPrice = Math.max(DEFAULT_SHARE_PRICE, Math.round((corp.liquidCapital / corp.totalShares) * 100) / 100);
    expect(corp.sharePrice).toBe(expectedPrice);
    expect(corp.fundamentalSharePrice).toBe(expectedPrice);
  });

  it("is a no-op for corps that already carry market fields (idempotent, does not clobber live trading state)", () => {
    const w = createWorld(OPTS);
    // Simulate an in-progress W10 game: player already owns shares.
    const corp = w.corporations["US-manufacturing"]!;
    corp.shareholders.push({ holder: "player", shares: 42, avgCostPerShare: 3.14 });
    corp.publicFloat -= 42;
    const v25World = { ...w, meta: { ...w.meta, schemaVersion: 25 } };
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 25, savedAt: "2026-01-01T00:00:00Z", world: v25World });

    const migrated = deserializeSave(raw);
    expect(migrated.meta.schemaVersion).toBe(30);
    const migratedCorp = migrated.corporations["US-manufacturing"]!;
    expect(migratedCorp.shareholders.find((sh) => sh.holder === "player")).toEqual({
      holder: "player",
      shares: 42,
      avgCostPerShare: 3.14,
    });
  });

  it("migration is deterministic given the same input", () => {
    const w = createWorld(OPTS);
    const strippedCorporations: Record<string, unknown> = {};
    for (const [id, corp] of Object.entries(w.corporations)) {
      const c = { ...corp } as Record<string, unknown>;
      delete c["totalShares"];
      strippedCorporations[id] = c;
    }
    const v25World = { ...w, corporations: strippedCorporations, meta: { ...w.meta, schemaVersion: 25 } };
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 25, savedAt: "2026-01-01T00:00:00Z", world: v25World });
    const a = deserializeSave(raw);
    const b = deserializeSave(raw);
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
  });
});
