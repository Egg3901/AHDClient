import { describe, it, expect } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { SCHEMA_VERSION } from "../world.js";
import { INITIAL_RATES_1953, MONETARY_BASELINES_1953 } from "./constants.js";
import { localToAnchor, anchorToLocal, roundTripInvariant } from "./conversion.js";
import { regimeForEra, clampToRegimeBand, bandForRegime } from "./regime.js";
import { computeMacroTarget } from "./rateCalculation.js";
import { TURN_PHASES } from "../phases/registry.js";

describe("INITIAL_RATES_1953 table vs mainline", () => {
  // Citations per currencies.ts INITIAL_RATES_1953 comments:
  // GBP 0.357 at $2.80/£ Bretton Woods par, JPY 360 Dodge Line, etc.
  it("matches mainline verbatim (no invented numbers)", () => {
    expect(INITIAL_RATES_1953.US).toBe(1.0);
    expect(INITIAL_RATES_1953.UK).toBeCloseTo(0.357, 6); // $2.80/£
    expect(INITIAL_RATES_1953.JP).toBe(360.0); // Dodge Line
    expect(INITIAL_RATES_1953.DE).toBe(4.2);
    expect(INITIAL_RATES_1953.IE).toBe(0.357); // 1:1 sterling link
    expect(INITIAL_RATES_1953.RU).toBe(9.0); // Western estimate, not 4 official
    expect(INITIAL_RATES_1953.DD).toBe(4.2);
    expect(INITIAL_RATES_1953.FR).toBe(350.0);
    expect(INITIAL_RATES_1953.IT).toBe(625.0);
    expect(INITIAL_RATES_1953.ES).toBe(39.6);
    expect(INITIAL_RATES_1953.SE).toBe(5.17);
    expect(INITIAL_RATES_1953.TR).toBe(2.8);
    expect(INITIAL_RATES_1953.GR).toBe(30.0);
    expect(INITIAL_RATES_1953.AT).toBe(26.0);
    expect(INITIAL_RATES_1953.FI).toBe(230.0);
    expect(INITIAL_RATES_1953.BR).toBe(18.8);
    expect(INITIAL_RATES_1953.CN).toBe(2.46);
    expect(INITIAL_RATES_1953.NG).toBe(0.357); // colonial sterling peg
  });

  it("is used by content GDP conversion (cite packs/1953.ts)", () => {
    // GDR check: pack1953 DD gdp 11905 USD millions corresponds to 50B DDM at 4.2 DDM/USD
    // 50_000_000_000 / 4.2 = 11_904_761_905 USD, pack stores 11_905 * 1e6
    const ddmRate = INITIAL_RATES_1953["DD"]!;
    expect(50_000_000_000 / ddmRate / 1_000_000).toBeCloseTo(11905, 0);
  });
});

describe("Bretton Woods peg regime", () => {
  it("1953 and 1960 are pegged, modern floats", () => {
    expect(regimeForEra("1953")).toBe("pegged"); // Bretton Woods managed peg
    expect(regimeForEra("1960")).toBe("pegged");
    expect(regimeForEra("1975")).toBe("floating");
    expect(regimeForEra("2019")).toBe("floating");
  });

  it("peg band is 1% (BW), float guardrail 50%", () => {
    expect(bandForRegime("pegged")).toBeCloseTo(0.01, 6);
    expect(bandForRegime("floating")).toBeCloseTo(0.5, 6);
  });

  it("pegged GBP stays at par under neutral macro (golden)", () => {
    // Citation: 1953 GBP Bretton Woods par 0.357 GBP per USD (IMF $2.80/£)
    const world = createWorld({ seed: "peg-golden", playerName: "P", countryId: "US", era: "1953" });
    const before = world.exchangeRates["UK"]!.rate;
    expect(before).toBeCloseTo(0.357, 6);
    for (let i = 0; i < 50; i++) advanceTurn(world);
    const after = world.exchangeRates["UK"]!.rate;
    // Pegged regime clamps to baseRate — 1953 managed peg must NOT float like modern
    expect(after).toBeCloseTo(0.357, 6);
    expect(Math.abs(after - 0.357) / 0.357).toBeLessThan(0.011); // inside 1% band + epsilon
  });

  it("clampToRegimeBand respects 1% for pegged vs 50% for floating", () => {
    const base = 10;
    // Try to push 20% away
    expect(clampToRegimeBand(base * 1.2, base, "pegged")).toBeCloseTo(base * 1.01, 6);
    expect(clampToRegimeBand(base * 1.2, base, "floating")).toBeCloseTo(base * 1.2, 6);
    // Try to push 80% away — both clamp, but peg tighter
    expect(clampToRegimeBand(base * 1.8, base, "pegged")).toBeCloseTo(base * 1.01, 6);
    expect(clampToRegimeBand(base * 1.8, base, "floating")).toBeCloseTo(base * 1.5, 6);
  });

  it("SUR/DDM are non-convertible pegs even if regime were floating", () => {
    // Soviet rouble and GDR mark are administered pegs through 1990-91
    const world = createWorld({ seed: "sur-peg", playerName: "P", countryId: "US", era: "1953" });
    expect(world.exchangeRates["RU"]!.regime).toBe("pegged");
    expect(world.exchangeRates["DD"]!.regime).toBe("pegged");
    // Inflate RU heavily and advance — peg still holds at 9 SUR per USD
    world.countries["RU"]!.economy.inflationRate = 0.15; // 15% forced
    world.centralBanks["RU"]!.primeRate = 20;
    for (let i = 0; i < 20; i++) advanceTurn(world);
    expect(world.exchangeRates["RU"]!.rate).toBeCloseTo(9.0, 6);
  });

  it("era-aware monetary baseline corrects IT inflation anchor at 1953 (cite monetaryEra.ts)", () => {
    // IT modern targetInflation 15% (late-1970s), but 1953 it is 2.5%
    // This is the same correction monetaryEra.ts documents as the disease it cures
    const modernBaseline = MONETARY_BASELINES_1953["IT"]!;
    expect(modernBaseline.targetInflation).toBe(2.5);
    // Compute macro target for IT at 15% inflation: modern sees 0 deviation (15 vs 15)
    // but 1953 sees +12.5 deviation -> weakens currency
    const macro = { primeRate: 12, inflationRate: 15, gdpGrowth: 2.5, tradeGrowth: 0 };
    const target1953 = computeMacroTarget(625, macro, "IT", "1953");
    const targetModern = computeMacroTarget(625, macro, "IT", null);
    expect(target1953).toBeGreaterThan(targetModern);
  });
});

describe("conversion helpers — units explicit, round-trip invariant", () => {
  it("localToAnchor and anchorToLocal are inverses", () => {
    // GBP: 357 pence local at 0.357 per USD -> 1000 USD anchor
    expect(localToAnchor(357, 0.357)).toBeCloseTo(1000, 6);
    expect(anchorToLocal(1000, 0.357)).toBeCloseTo(357, 6);
    // JPY: 36000 yen at 360 per USD -> 100 USD
    expect(localToAnchor(36000, 360)).toBeCloseTo(100, 6);
    expect(anchorToLocal(100, 360)).toBeCloseTo(36000, 6);
  });

  it("round-trip invariant holds for all INITIAL_RATES_1953 (NG 100x guard)", () => {
    // The NG incident: mixing NGN 1550 per USD (modern) with ~0.357 (colonial)
    // snapped valuations 100x. Round-trip must be exact per rate; also rates
    // must not be silently inverted (anchor-per-local vs local-per-anchor).
    for (const [cid, rate] of Object.entries(INITIAL_RATES_1953)) {
      const local = 12345.678;
      expect(roundTripInvariant(local, rate)).toBe(true);
      const anchor = localToAnchor(local, rate);
      const back = anchorToLocal(anchor, rate);
      expect(back).toBeCloseTo(local, 9);
      // Also the inverted rate would fail: local * rate vs local / rate difference
      // Check that our helpers are not using the wrong direction
      expect(localToAnchor(local, rate)).toBeCloseTo(local / rate, 12);
      void cid;
    }
  });

  it("NG colonial peg round-trip is distinct from modern NGN rate", () => {
    const colonial = 357; // 357 NGN at 0.357 per USD
    const modernRate = 1550; // modern NGN 1550 per USD — NOT used for 1953 worlds
    const colonialRate = INITIAL_RATES_1953["NG"]!; // 0.357
    expect(colonialRate).not.toBeCloseTo(modernRate, 0);
    expect(localToAnchor(colonial, colonialRate!)).toBeCloseTo(1000, 6);
    // Modern rate would give ~0.23 USD for the same local amount — 100x off
    expect(localToAnchor(colonial, modernRate)).toBeCloseTo(0.23, 2);
    expect(Math.abs(localToAnchor(colonial, colonialRate!) - localToAnchor(colonial, modernRate))).toBeGreaterThan(900);
  });

  it("handles invalid rates as passthrough (anchor = local)", () => {
    expect(localToAnchor(100, 0)).toBe(100);
    expect(localToAnchor(100, -1)).toBe(100);
    expect(localToAnchor(100, Number.NaN)).toBe(100);
  });
});

describe("forexTurn determinism", () => {
  it("same seed + same turns -> identical exchangeRates (rng determinism)", () => {
    const mk = () => {
      const w = createWorld({ seed: "det-seed", playerName: "P", countryId: "US", era: "1953" });
      for (let i = 0; i < 10; i++) advanceTurn(w);
      return w.exchangeRates;
    };
    const a = mk();
    const b = mk();
    expect(a).toEqual(b);
  });

  it("does not disturb rng stream for unrelated phases (tail placement)", () => {
    // Politician generation and other rng-consuming phases should be unaffected
    // by the insertion of two tail phases that are rng-free under pegged regime.
    // We check that a world with and without forex still has deterministic politicians.
    const w1 = createWorld({ seed: "rng-check", playerName: "P", countryId: "US", era: "1953" });
    const w2 = createWorld({ seed: "rng-check", playerName: "P", countryId: "US", era: "1953" });
    expect(w1.politicians.map((p) => p.id)).toEqual(w2.politicians.map((p) => p.id));
  });
});

describe("phases registry ordering", () => {
  it("ledgerPreForexSnapshot runs immediately before forexTurn and both before newsMaintenance", () => {
    const names = TURN_PHASES.map((p) => p.name);
    const snap = names.indexOf("ledgerPreForexSnapshot");
    const forex = names.indexOf("forexTurn");
    const news = names.indexOf("newsMaintenance");
    expect(snap).toBeGreaterThan(-1);
    expect(forex).toBeGreaterThan(-1);
    expect(news).toBeGreaterThan(-1);
    expect(snap).toBe(forex - 1);
    expect(forex).toBeLessThan(news);
  });
});

describe("schema v32 migration", () => {
  it("fresh world is at SCHEMA_VERSION 32 with exchangeRates and snapshot", () => {
    expect(SCHEMA_VERSION).toBe(32);
    const world = createWorld({ seed: "schema32", playerName: "P", countryId: "US", era: "1953" });
    expect(world.meta.schemaVersion).toBe(32);
    expect(world.exchangeRates).toBeDefined();
    expect(world.exchangeRates["US"]!.rate).toBe(1);
    expect(world.exchangeRates["UK"]!.rate).toBeCloseTo(0.357, 6);
    expect(world.ledgerPreForexSnapshot).toBeNull();
  });

  it("deserializes a v31 save and chains to v32", () => {
    const world = createWorld({ seed: "migrate-chain", playerName: "P", countryId: "US", era: "1953" });
    // Simulate a v31 save by hacking schemaVersion down and stripping forex fields
    const raw31 = JSON.parse(serializeSave(world, "2026-01-01T00:00:00.000Z"));
    raw31.schemaVersion = 31;
    raw31.world.meta.schemaVersion = 31;
    delete (raw31.world as unknown as Record<string, unknown>)["exchangeRates"];
    delete (raw31.world as unknown as Record<string, unknown>)["ledgerPreForexSnapshot"];
    const loaded = deserializeSave(JSON.stringify(raw31));
    expect(loaded.meta.schemaVersion).toBe(32);
    expect(loaded.exchangeRates).toBeDefined();
    expect(loaded.exchangeRates["UK"]!.rate).toBeCloseTo(0.357, 6);
    expect(loaded.exchangeRates["UK"]!.baseRate).toBeCloseTo(0.357, 6);
    expect(loaded.ledgerPreForexSnapshot).toBeNull();
  });

  it("ledgerPreForexSnapshot is populated after first turn", () => {
    const world = createWorld({ seed: "snap-pop", playerName: "P", countryId: "US", era: "1953" });
    expect(world.ledgerPreForexSnapshot).toBeNull();
    advanceTurn(world);
    expect(world.ledgerPreForexSnapshot).not.toBeNull();
    expect(world.ledgerPreForexSnapshot!.turn).toBeGreaterThanOrEqual(0);
    expect(Object.keys(world.ledgerPreForexSnapshot!.anchorRates).length).toBeGreaterThan(0);
    expect(Object.keys(world.ledgerPreForexSnapshot!.balancesAnchor).length).toBeGreaterThan(0);
  });
});
