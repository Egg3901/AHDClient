import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";

const OPTS = { seed: "banking-longrun", playerName: "P", countryId: "US", era: "1953" };

describe("banking — 200-turn bounds (full advanceTurn path)", () => {
  it("every bank charter stays finite and non-negative for 200 turns", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 200; i++) {
      advanceTurn(world);
      for (const corp of Object.values(world.corporations)) {
        const charter = corp.bankCharter;
        if (!charter) continue;
        expect(Number.isFinite(charter.cashReserves)).toBe(true);
        expect(charter.cashReserves).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(charter.npcDeposits)).toBe(true);
        expect(charter.npcDeposits).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(charter.totalLoans)).toBe(true);
        expect(charter.totalLoans).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(charter.postedCapital)).toBe(true);
        expect(charter.postedCapital).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(charter.confidence)).toBe(true);
        expect(charter.confidence).toBeGreaterThanOrEqual(0);
        expect(charter.confidence).toBeLessThanOrEqual(1);
        expect(["green", "amber", "red"]).toContain(charter.warningBand);
        expect(["active", "failed"]).toContain(charter.status);
        expect(Number.isFinite(charter.depositCeiling)).toBe(true);
        expect(charter.depositCeiling).toBeGreaterThanOrEqual(0);
      }
      for (const bank of Object.values(world.centralBanks)) {
        expect(Number.isFinite(bank.externalBroadMoney)).toBe(true);
        expect(bank.externalBroadMoney).toBeGreaterThanOrEqual(0);
      }
      for (const fund of Object.values(world.depositInsurance)) {
        expect(Number.isFinite(fund.balance)).toBe(true);
        expect(fund.balance).toBeGreaterThanOrEqual(0);
      }
      for (const loan of world.bankLoans) {
        expect(Number.isFinite(loan.outstanding)).toBe(true);
        expect(loan.outstanding).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(loan.ratePercent)).toBe(true);
      }
    }
  });

  it("determinism: same seed 100 turns produces byte-identical banking state", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 100; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    const bankFields = (w: typeof a) => ({
      corporations: Object.fromEntries(Object.entries(w.corporations).map(([id, c]) => [id, c.bankCharter])),
      centralBanks: w.centralBanks,
      bankLoans: w.bankLoans,
      depositInsurance: w.depositInsurance,
      player: { savings: w.player.savings, savingsHolder: w.player.savingsHolder },
    });
    expect(JSON.stringify(bankFields(a))).toBe(JSON.stringify(bankFields(b)));
  });
});
