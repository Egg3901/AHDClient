import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  EXTRACTABLE_RESOURCES,
  computeMarketPrice,
  getEraCommodityBasePrice,
  getPriceSoftKnee,
  royaltyDueAnchor,
} from "./constants.js";
import { settleContractsForTurn } from "./contractSettlement.js";

const OPTS_1953 = { seed: "golden-seed-42", playerName: "Tester", countryId: "US", era: "1953" } as const;
const OPTS_1960 = { seed: "golden-seed-42", playerName: "Tester", countryId: "US", era: "1960" } as const;

describe("commodity era scaling", () => {
  it("seeds 1953 commodities at era-scaled base prices (base == global at turn 0)", () => {
    const w = createWorld(OPTS_1953);
    // Era scale: 387B/27T ≈0.014333
    const scale = getEraCommodityBasePrice(800, "1953") / 800;
    expect(scale).toBeCloseTo(0.014333, 3);
    // Spot-check a few commodities: basePrice era-scaled, globalPrice == basePrice at seed
    expect(w.commodityPrices["steel"]!.basePrice).toBeCloseTo(800 * scale, 2);
    expect(w.commodityPrices["steel"]!.globalPrice).toBe(w.commodityPrices["steel"]!.basePrice);
    expect(w.commodityPrices["oil"]!.basePrice).toBeCloseTo(80 * scale, 2);
    expect(w.commodityPrices["oil"]!.globalPrice).toBe(w.commodityPrices["oil"]!.basePrice);
    expect(w.commodityPrices["rare_earth"]!.basePrice).toBeCloseTo(21000 * scale, 0);
    // All 28 commodities present
    expect(Object.keys(w.commodityPrices)).toHaveLength(COMMODITY_TYPES.length);
    for (const c of COMMODITY_TYPES) {
      const state = w.commodityPrices[c]!;
      expect(state.commodity).toBe(c);
      expect(state.basePrice).toBeGreaterThan(0);
      expect(state.globalPrice).toBe(state.basePrice);
      expect(state.globalSupply).toBe(0);
      expect(state.globalDemand).toBe(0);
      expect(state.turn).toBe(0);
    }
  });

  it("seeds 1960 commodities at era-scaled prices (same regime as 1953)", () => {
    const w = createWorld(OPTS_1960);
    expect(Object.keys(w.commodityPrices)).toHaveLength(COMMODITY_TYPES.length);
    // 1960 shares 1953 nominal regime (no authored 1960 GDP anchor in EraId map)
    expect(w.commodityPrices["steel"]!.basePrice).toBe(w.commodityPrices["steel"]!.globalPrice);
    expect(w.commodityPrices["oil"]!.basePrice).toBeCloseTo(getEraCommodityBasePrice(80, "1960"), 2);
  });

  it("all EXTRACTABLE_RESOURCES are subset of COMMODITY_TYPES", () => {
    for (const r of EXTRACTABLE_RESOURCES) {
      expect((COMMODITY_TYPES as readonly string[]).includes(r)).toBe(true);
    }
  });
});

describe("computeMarketPrice", () => {
  it("returns base when supply==demand==0", () => {
    expect(computeMarketPrice(100, 0, 0)).toBe(100);
  });

  it("shortage raises price above base, surplus lowers below base", () => {
    const high = computeMarketPrice(100, 500, 2000); // demand >> supply
    expect(high).toBeGreaterThan(100);
    const low = computeMarketPrice(100, 2000, 500); // supply >> demand
    expect(low).toBeLessThan(100);
  });

  it("extractable knee (8) vs standard knee (3) affects price magnitude", () => {
    // At high shortage ratio, wider knee keeps price higher (less compression)
    const steelKnee = getPriceSoftKnee("oil"); // 8
    const electronicsKnee = getPriceSoftKnee("electronics"); // 3
    expect(steelKnee).toBe(8);
    expect(electronicsKnee).toBe(3);
    const priceWithWideKnee = computeMarketPrice(100, 100, 1000, steelKnee);
    const priceWithNarrowKnee = computeMarketPrice(100, 100, 1000, electronicsKnee);
    // Wide knee compresses less, so shortage signal is stronger
    expect(priceWithWideKnee).toBeGreaterThan(priceWithNarrowKnee);
  });

  it("is bounded and deterministic", () => {
    const p = computeMarketPrice(80, 10000, 500);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(800); // 10x base bound
    expect(computeMarketPrice(80, 10000, 500)).toBe(p);
  });
});

describe("royaltyDueAnchor", () => {
  it("computes rate × share × capacity × price", () => {
    expect(royaltyDueAnchor(0.01, 0.5, 10_000, 100)).toBe(5_000);
  });

  it("returns 0 when any factor is non-positive", () => {
    expect(royaltyDueAnchor(0, 0.5, 10_000, 100)).toBe(0);
    expect(royaltyDueAnchor(0.01, 0, 10_000, 100)).toBe(0);
    expect(royaltyDueAnchor(0.01, 0.5, 0, 100)).toBe(0);
    expect(royaltyDueAnchor(0.01, 0.5, 10_000, 0)).toBe(0);
  });
});

describe("commodity price evolution (golden values)", () => {
  it("golden: 1953 steel price after 10 turns", () => {
    const w = createWorld(OPTS_1953);
    for (let i = 0; i < 10; i++) advanceTurn(w);
    // Golden value derived from deterministic run with seed golden-seed-42
    // If commodity drift formula changes, update goldens deliberately.
    // Re-baselined for W37: new phases shift shared rng stream, values moved from 11.04/1.15.
    expect(w.commodityPrices["steel"]!.globalPrice).toBeCloseTo(11.09, 1);
    expect(w.commodityPrices["oil"]!.globalPrice).toBeCloseTo(1.16, 1);
  });

  it("golden: rare_earth premium persists (high base, demand drift)", () => {
    const w = createWorld(OPTS_1953);
    for (let i = 0; i < 50; i++) advanceTurn(w);
    // rare_earth has highest base price; stays premium after drift
    expect(w.commodityPrices["rare_earth"]!.globalPrice).toBeGreaterThan(
      w.commodityPrices["steel"]!.globalPrice,
    );
    // Golden after 50 turns (seed golden-seed-42) — re-baselined for W37 NPC-behavior rng shift from 336.13
    expect(w.commodityPrices["rare_earth"]!.globalPrice).toBeCloseTo(335.39, 0);
  });

  it("prices stay within 0.1x–10x base bounds even after 200 turns (bounds)", () => {
    const w = createWorld({ seed: "bounds-check", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 200; i++) advanceTurn(w);
    for (const c of COMMODITY_TYPES) {
      const cp = w.commodityPrices[c]!;
      expect(cp.globalPrice, `${c} price ${cp.globalPrice} vs base ${cp.basePrice}`).toBeGreaterThanOrEqual(
        cp.basePrice * 0.1 - 0.01,
      );
      expect(cp.globalPrice).toBeLessThanOrEqual(cp.basePrice * 10 + 0.01);
      expect(Number.isFinite(cp.globalPrice)).toBe(true);
      expect(Number.isFinite(cp.globalSupply)).toBe(true);
      expect(Number.isFinite(cp.globalDemand)).toBe(true);
      expect(cp.globalSupply).toBeGreaterThanOrEqual(0);
      expect(cp.globalDemand).toBeGreaterThanOrEqual(0);
    }
  });

  it("determinism: identical seeds produce identical commodity histories", () => {
    const a = createWorld(OPTS_1953);
    const b = createWorld(OPTS_1953);
    for (let i = 0; i < 30; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.commodityPrices).toEqual(b.commodityPrices);
  });

  it("is unaffected by save/load round trip mid-campaign", () => {
    const straight = createWorld(OPTS_1953);
    for (let i = 0; i < 10; i++) advanceTurn(straight);
    const straightPrices = JSON.parse(JSON.stringify(straight.commodityPrices));

    let reloaded = createWorld(OPTS_1953);
    for (let i = 0; i < 5; i++) advanceTurn(reloaded);
    reloaded = deserializeSave(serializeSave(reloaded, "2026-01-01T00:00:00Z"));
    for (let i = 0; i < 5; i++) advanceTurn(reloaded);

    expect(reloaded.commodityPrices).toEqual(straightPrices);
  });
});

describe("contract settlement", () => {
  it("credits stubbed corporation contracts each turn (no missed)", () => {
    const w = createWorld(OPTS_1953);
    w.extractionContracts.push({
      id: "c1",
      stateId: "TX",
      countryId: "US",
      resource: "oil",
      share: 0.5,
      royaltyRatePerTurn: 0.01,
      status: "active",
      grantedTurn: 0,
      grantedByLevel: "national",
      missedPayments: 0,
      lastSettlementTurn: null,
      corporationId: null, // stubbed
    });
    for (let i = 0; i < 3; i++) advanceTurn(w);
    const c = w.extractionContracts[0]!;
    expect(c.status).toBe("active");
    expect(c.lastSettlementTurn).toBe(3);
    expect(c.missedPayments).toBe(0);
  });

  it("expires offered contracts past offer window", () => {
    const w = createWorld(OPTS_1953);
    w.extractionContracts.push({
      id: "c2",
      stateId: "CA",
      countryId: "US",
      resource: "coal",
      share: 0.3,
      royaltyRatePerTurn: 0.015,
      status: "offered",
      grantedTurn: 0,
      grantedByLevel: "state",
      offerExpiresTurn: 2,
      missedPayments: 0,
      lastSettlementTurn: null,
      corporationId: null,
    });
    for (let i = 0; i < 3; i++) advanceTurn(w);
    expect(w.extractionContracts[0]!.status).toBe("expired");
  });

  it("expires active contracts past term", () => {
    const w = createWorld(OPTS_1953);
    w.extractionContracts.push({
      id: "c3",
      stateId: "TX",
      countryId: "US",
      resource: "iron",
      share: 0.4,
      royaltyRatePerTurn: 0.01,
      status: "active",
      grantedTurn: 0,
      grantedByLevel: "national",
      expiresTurn: 2,
      missedPayments: 0,
      lastSettlementTurn: null,
      corporationId: null,
    });
    for (let i = 0; i < 3; i++) advanceTurn(w);
    expect(w.extractionContracts[0]!.status).toBe("expired");
  });

  it("defaults after 3 missed payments (insolvent test hook)", () => {
    const w = createWorld(OPTS_1953);
    w.extractionContracts.push({
      id: "c4",
      stateId: "TX",
      countryId: "US",
      resource: "oil",
      share: 0.5,
      royaltyRatePerTurn: 0.01,
      status: "active",
      grantedTurn: 0,
      grantedByLevel: "national",
      missedPayments: 0,
      lastSettlementTurn: null,
      corporationId: "insolvent-test-corp", // hook: treated as always insufficient
    });
    for (let i = 0; i < 3; i++) advanceTurn(w);
    const c = w.extractionContracts[0]!;
    expect(c.status).toBe("defaulted");
    expect(c.missedPayments).toBe(3);
  });

  it("zero royalty rate settlements are no-ops but advance idempotency", () => {
    const w = createWorld(OPTS_1953);
    w.extractionContracts.push({
      id: "c5",
      stateId: "TX",
      countryId: "US",
      resource: "oil",
      share: 0.5,
      royaltyRatePerTurn: 0,
      status: "active",
      grantedTurn: 0,
      grantedByLevel: "national",
      missedPayments: 0,
      lastSettlementTurn: null,
      corporationId: null,
    });
    advanceTurn(w);
    expect(w.extractionContracts[0]!.lastSettlementTurn).toBe(1);
    expect(w.extractionContracts[0]!.status).toBe("active");
  });

  it("idempotency: re-settling same turn is no-op (pure helper)", () => {
    const w = createWorld(OPTS_1953);
    w.extractionContracts.push({
      id: "c6",
      stateId: "TX",
      countryId: "US",
      resource: "oil",
      share: 0.5,
      royaltyRatePerTurn: 0.01,
      status: "active",
      grantedTurn: 0,
      grantedByLevel: "national",
      missedPayments: 0,
      lastSettlementTurn: 5,
      corporationId: null,
    });
    const before = JSON.parse(JSON.stringify(w.extractionContracts[0]));
    settleContractsForTurn(w.extractionContracts, w.commodityPrices, 5);
    expect(w.extractionContracts[0]).toEqual(before);
    settleContractsForTurn(w.extractionContracts, w.commodityPrices, 4);
    expect(w.extractionContracts[0]).toEqual(before);
  });

  it("determinism: contract state is deterministic across identical runs", () => {
    const mk = () =>
      createWorld({ seed: "contract-det", playerName: "P", countryId: "US", era: "1953" });
    const a = mk();
    const b = mk();
    for (const w of [a, b]) {
      w.extractionContracts.push({
        id: "det1",
        stateId: "TX",
        countryId: "US",
        resource: "oil",
        share: 0.5,
        royaltyRatePerTurn: 0.01,
        status: "active",
        grantedTurn: 0,
        grantedByLevel: "national",
        missedPayments: 0,
        lastSettlementTurn: null,
        corporationId: null,
      });
    }
    for (let i = 0; i < 10; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.extractionContracts).toEqual(b.extractionContracts);
    expect(a.commodityPrices["oil"]!.globalPrice).toBe(b.commodityPrices["oil"]!.globalPrice);
  });
});

describe("schema migration v6->v7", () => {
  it("migrates old saves with missing commodity fields", () => {
    const raw = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 6,
      savedAt: "2026-01-01T00:00:00Z",
      world: {
        meta: { schemaVersion: 6, seed: "s", rng: [1, 2, 3, 4], turn: 5, date: "1953-01-06", era: "1953", cheatsUsed: false },
        countries: {},
        player: { name: "P", countryId: "US", cash: 10000 },
        parties: {},
        legislatures: {},
        politicians: [],
        charters: [],
        caucuses: [],
        news: [],
      },
    });
    const w = deserializeSave(raw);
    expect(w.meta.schemaVersion).toBe(17);
    expect(typeof w.commodityPrices).toBe("object");
    expect(Object.keys(w.commodityPrices).length).toBe(COMMODITY_TYPES.length);
    expect(Array.isArray(w.extractionContracts)).toBe(true);
    expect(w.extractionContracts.length).toBe(0);
    // migrated commodity has basePrice == globalPrice
    expect(w.commodityPrices["oil"]!.basePrice).toBe(w.commodityPrices["oil"]!.globalPrice);
  });
});
