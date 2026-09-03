import { describe, it, expect } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { depositToSavings, withdrawFromSavings, moveSavingsHolder } from "./savingsActions.js";

const OPTS = { seed: "w35-savings-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("depositToSavings / withdrawFromSavings", () => {
  it("moves cash into savings and back, 1:1, cited from the deposit/withdraw routes' core balance move", () => {
    const w = createWorld(OPTS);
    expect(w.player.cash).toBe(10_000);
    expect(w.player.savings).toBe(0);

    const dep = depositToSavings(w, 4000);
    expect(dep.ok).toBe(true);
    expect(w.player.cash).toBe(6000);
    expect(w.player.savings).toBe(4000);

    const wd = withdrawFromSavings(w, 1500);
    expect(wd.ok).toBe(true);
    expect(w.player.cash).toBe(7500);
    expect(w.player.savings).toBe(2500);
  });

  it("rejects a deposit exceeding cash on hand", () => {
    const w = createWorld(OPTS);
    const res = depositToSavings(w, 20_000);
    expect(res.ok).toBe(false);
    expect(w.player.cash).toBe(10_000); // unchanged on rejection
  });

  it("rejects a withdrawal exceeding savings balance", () => {
    const w = createWorld(OPTS);
    const res = withdrawFromSavings(w, 1);
    expect(res.ok).toBe(false);
    expect(w.player.savings).toBe(0);
  });

  it("rejects non-finite, zero, and negative amounts", () => {
    const w = createWorld(OPTS);
    for (const bad of [0, -100, NaN, Infinity]) {
      expect(depositToSavings(w, bad).ok).toBe(false);
      expect(withdrawFromSavings(w, bad).ok).toBe(false);
    }
  });

  it("wires through executeAction as depositSavings/withdrawSavings (per-action success counter increments)", () => {
    const w = createWorld(OPTS);
    const res = executeAction(w, "player", "depositSavings", { amount: 1000 });
    expect(res.ok).toBe(true);
    expect(w.player.savings).toBe(1000);
    expect(w.player.actionCounts["depositSavings"]).toBe(1);

    const res2 = executeAction(w, "player", "withdrawSavings", { amount: 500 });
    expect(res2.ok).toBe(true);
    expect(w.player.savings).toBe(500);
    expect(w.player.actionCounts["withdrawSavings"]).toBe(1);
  });
});

describe("moveSavingsHolder", () => {
  it("always allows moving to centralBank", () => {
    const w = createWorld(OPTS);
    const corp = w.corporations["US-financial"]!;
    expect(corp.bankCharter?.status).toBe("active");
    w.player.savingsHolder = "US-financial";
    const res = moveSavingsHolder(w, "centralBank");
    expect(res.ok).toBe(true);
    expect(w.player.savingsHolder).toBe("centralBank");
  });

  it("rejects moving into a bank with no active charter, and an unknown corp id", () => {
    const w = createWorld(OPTS);
    expect(moveSavingsHolder(w, "not-a-corp").ok).toBe(false);
    // seedNpcBanks charters US-financial by construction, so simulate an
    // uncharted corp by pointing at one whose charter was never issued: the
    // "extraction" corp (W9/W11) carries no bankCharter at all.
    if (w.corporations["US-extraction"]) {
      const res = moveSavingsHolder(w, "US-extraction");
      expect(res.ok).toBe(false);
    }
  });

  it("caps a move into a bank at its cached depositCeiling", () => {
    const w = createWorld(OPTS);
    const corp = w.corporations["US-financial"]!;
    corp.bankCharter!.depositCeiling = 100;
    corp.bankCharter!.totalDeposits = 0;
    w.player.savings = 50;
    expect(moveSavingsHolder(w, "US-financial").ok).toBe(true);
    expect(w.player.savingsHolder).toBe("US-financial");

    // Move away and back with savings now exceeding the ceiling headroom.
    moveSavingsHolder(w, "centralBank");
    w.player.savings = 200;
    const res = moveSavingsHolder(w, "US-financial");
    expect(res.ok).toBe(false);
  });

  it("moving away from a bank (including to centralBank) is always allowed regardless of ceiling", () => {
    const w = createWorld(OPTS);
    const corp = w.corporations["US-financial"]!;
    corp.bankCharter!.depositCeiling = 100;
    w.player.savings = 50;
    moveSavingsHolder(w, "US-financial");
    corp.bankCharter!.depositCeiling = 0; // ceiling drops below current savings
    const res = moveSavingsHolder(w, "centralBank");
    expect(res.ok).toBe(true);
  });
});

describe("W35 savings actions schema", () => {
  it("round-trips through save/load at SCHEMA_VERSION 36", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(36);
    const w = createWorld(OPTS);
    depositToSavings(w, 3000);
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.player.savings).toBe(3000);
    expect(loaded.player.cash).toBe(7000);
  });

  it("determinism: identical seeds, identical deposit/withdraw sequence, identical resulting state after turns", () => {
    const mk = () => {
      const w = createWorld(OPTS);
      depositToSavings(w, 2500);
      withdrawFromSavings(w, 500);
      return w;
    };
    const a = mk();
    const b = mk();
    for (let i = 0; i < 5; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.player.savings).toBe(b.player.savings);
    expect(a.player.cash).toBe(b.player.cash);
  });
});
