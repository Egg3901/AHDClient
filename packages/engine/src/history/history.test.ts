import { describe, it, expect } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { SCHEMA_VERSION } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { HISTORY_CAP } from "./types.js";
import { recordWorldHistory, computePlayerBondsValue, computePlayerSharesValue } from "./phases.js";
import { checkInvariants } from "./invariants.js";

describe("recordWorldHistory bounds/cadence", () => {
  it("is empty at world creation (turn 0) and gains one point per series per advanceTurn", () => {
    const w = createWorld({ seed: "history-cadence", playerName: "A", countryId: "US", era: "1953" });
    expect(w.history.macro["US"]).toBeUndefined();
    expect(w.history.playerWealth.length).toBe(0);

    advanceTurn(w);
    expect(w.meta.turn).toBe(1);
    expect(w.history.macro["US"]).toBeDefined();
    expect(w.history.macro["US"]!.length).toBe(1);
    expect(w.history.macro["US"]![0]!.turn).toBe(1);
    expect(w.history.playerWealth.length).toBe(1);
    expect(w.history.playerWealth[0]!.turn).toBe(1);

    advanceTurn(w);
    expect(w.history.macro["US"]!.length).toBe(2);
    expect(w.history.macro["US"]![1]!.turn).toBe(2);
    expect(w.history.playerWealth.length).toBe(2);
  });

  it("records prime rate and money supply per playable country, and party strength per party", () => {
    const w = createWorld({ seed: "history-families", playerName: "A", countryId: "US", era: "1953" });
    advanceTurn(w);
    for (const countryId of Object.keys(w.centralBanks)) {
      expect(w.history.primeRate[countryId]).toBeDefined();
      expect(w.history.primeRate[countryId]![0]).toEqual({ turn: 1, primeRate: w.centralBanks[countryId]!.primeRate });
      expect(w.history.moneySupply[countryId]).toBeDefined();
      expect(w.history.moneySupply[countryId]![0]!.externalBroadMoney).toBe(w.centralBanks[countryId]!.externalBroadMoney);
    }
    for (const partyId of Object.keys(w.parties)) {
      expect(w.history.partyStrength[partyId]).toBeDefined();
      expect(w.history.partyStrength[partyId]![0]!.politicalStrength).toBe(w.parties[partyId]!.politicalStrength);
    }
  });

  it("caps every series at HISTORY_CAP, evicting oldest first", () => {
    const w = createWorld({ seed: "history-cap", playerName: "A", countryId: "US", era: "1953" });
    // Directly exercise recordWorldHistory (bypassing the full turn pipeline
    // for speed) across HISTORY_CAP + 10 synthetic turns.
    for (let i = 1; i <= HISTORY_CAP + 10; i++) {
      w.meta.turn = i;
      recordWorldHistory(w);
    }
    expect(w.history.macro["US"]!.length).toBe(HISTORY_CAP);
    expect(w.history.playerWealth.length).toBe(HISTORY_CAP);
    // Oldest points evicted: first remaining turn is 11 (turns 1..10 evicted).
    expect(w.history.macro["US"]![0]!.turn).toBe(11);
    expect(w.history.macro["US"]![HISTORY_CAP - 1]!.turn).toBe(HISTORY_CAP + 10);
    expect(w.history.playerWealth[0]!.turn).toBe(11);
    for (const partyId of Object.keys(w.parties)) {
      expect(w.history.partyStrength[partyId]!.length).toBe(HISTORY_CAP);
    }
    for (const countryId of Object.keys(w.centralBanks)) {
      expect(w.history.primeRate[countryId]!.length).toBe(HISTORY_CAP);
      expect(w.history.moneySupply[countryId]!.length).toBe(HISTORY_CAP);
    }
  });
});

describe("player wealth valuation", () => {
  it("values player bond and share holdings at current market price", () => {
    const w = createWorld({ seed: "wealth-valuation", playerName: "A", countryId: "US", era: "1953" });
    const bondId = Object.keys(w.bonds)[0];
    if (bondId) {
      w.bonds[bondId]!.holders = [{ holderId: "player", units: 10 }];
      w.bonds[bondId]!.marketPrice = 1.05;
      expect(computePlayerBondsValue(w)).toBeCloseTo(10 * 1000 * 1.05, 2);
    }
    const corpId = Object.keys(w.corporations)[0]!;
    w.corporations[corpId]!.shareholders.push({ holder: "player", shares: 100 });
    w.corporations[corpId]!.sharePrice = 2.5;
    expect(computePlayerSharesValue(w)).toBeCloseTo(100 * 2.5, 2);
  });
});

describe("determinism", () => {
  it("WorldHistory is identical across two independent runs with the same seed", () => {
    const mk = () => createWorld({ seed: "history-determinism", playerName: "A", countryId: "US", era: "1953" });
    const w1 = mk();
    const w2 = mk();
    for (let i = 0; i < 10; i++) {
      advanceTurn(w1);
      advanceTurn(w2);
    }
    expect(JSON.stringify(w1.history)).toBe(JSON.stringify(w2.history));
  });
});

describe("checkInvariants", () => {
  it("reports green on a freshly created and advanced world", () => {
    const w = createWorld({ seed: "invariants-green", playerName: "A", countryId: "US", era: "1953" });
    advanceTurn(w);
    const report = checkInvariants(w);
    expect(report.status).toBe("green");
    expect(report.findings).toEqual([]);
    expect(report.checksRun).toBeGreaterThan(0);
  });

  it("catches a constructed share-conservation violation", () => {
    const w = createWorld({ seed: "invariants-shares", playerName: "A", countryId: "US", era: "1953" });
    const corpId = Object.keys(w.corporations)[0]!;
    // Corrupt: bump publicFloat without removing shares elsewhere, breaking
    // shareholders + publicFloat === totalShares.
    w.corporations[corpId]!.publicFloat += 1000;
    const report = checkInvariants(w);
    expect(report.status).toBe("red");
    expect(report.findings.some((f) => f.check === "shareConservation")).toBe(true);
  });

  it("catches a constructed budget component-sum violation", () => {
    const w = createWorld({ seed: "invariants-budget", playerName: "A", countryId: "US", era: "1953" });
    w.budgets["US"]!.revenue.total += 999_999;
    const report = checkInvariants(w);
    expect(report.status).toBe("red");
    expect(report.findings.some((f) => f.check === "budgetRevenueSum")).toBe(true);
  });

  it("catches a constructed unbounded history series", () => {
    const w = createWorld({ seed: "invariants-history-bound", playerName: "A", countryId: "US", era: "1953" });
    advanceTurn(w);
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      w.history.playerWealth.push({ turn: i, cash: 0, savings: 0, funds: 0, bondsValue: 0, sharesValue: 0, netWorth: 0 });
    }
    const report = checkInvariants(w);
    expect(report.status).toBe("red");
    expect(report.findings.some((f) => f.check === "historyBounded")).toBe(true);
  });

  it("flags negative player cash as amber, not red on its own", () => {
    const w = createWorld({ seed: "invariants-cash", playerName: "A", countryId: "US", era: "1953" });
    w.player.cash = -50;
    const report = checkInvariants(w);
    const finding = report.findings.find((f) => f.check === "playerCashNonNegative");
    expect(finding?.severity).toBe("amber");
    expect(report.status).toBe("amber");
  });
});

describe("migration v33->v38", () => {
  it("migrates a v33 save to v38 with an empty history", () => {
    const w = createWorld({ seed: "migration-history", playerName: "A", countryId: "US", era: "1953" });
    const raw = JSON.parse(serializeSave(w, new Date().toISOString()));
    const worldAny = raw.world as Record<string, unknown>;
    delete worldAny["history"];
    raw.schemaVersion = 33;
    raw.world.meta.schemaVersion = 33;
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.history).toBeDefined();
    expect(migrated.history.macro).toEqual({});
    expect(migrated.history.primeRate).toEqual({});
    expect(migrated.history.partyStrength).toEqual({});
    expect(migrated.history.playerWealth).toEqual([]);
    expect(migrated.history.moneySupply).toEqual({});
  });

  it("SCHEMA_VERSION is 38", () => {
    expect(SCHEMA_VERSION).toBe(38);
  });
});
