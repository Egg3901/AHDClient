import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { applyBillEffects } from "./billLifecycle.js";
import { fiscalBaseGrowthPhase } from "../budget/phases.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { Bill } from "./types.js";

function taxBill(countryId: string, selectedRate: number): Bill {
  return {
    id: "bill-tax-1",
    title: "Income Tax Rate Act",
    summary: "",
    countryId,
    category: "economy",
    legislationTypeId: "us.tax.incomeTax",
    effectDirection: 1,
    selectedRate,
    provisions: [{ type: "policy", legislationTypeId: "us.tax.incomeTax", effectDirection: 1, economic: 0, social: 0 }],
    originChamber: "house",
    currentChamber: "house",
    status: "signed",
    sponsorId: "player",
    sponsorName: "P",
    sponsorPartyId: null,
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: 1,
    filibusterInvocations: [],
    updatedAtTurn: 1,
    committeeId: null,
  } as unknown as Bill;
}

describe("tax-rate ladder enactment (billEnactment.ts applyTaxRateChange port)", () => {
  it("enacts one step immediately, queues the remainder, and the fiscal phase walks it to the target", () => {
    const w = createWorld({ seed: "tax", playerName: "P", countryId: "US", era: "1953" });
    const budget = w.budgets["US"]!;
    const start = budget.taxRates.incomeTax;
    applyBillEffects(w, taxBill("US", start + 10));
    expect(budget.taxRates.incomeTax).toBe(start + 1);
    expect(budget.taxRatePhaseIn?.incomeTax).toBe(start + 10);
    const revenueAfterStep = budget.revenue.total;
    for (let i = 0; i < 12; i++) fiscalBaseGrowthPhase.run(w, w.meta.rng as never);
    expect(budget.taxRates.incomeTax).toBe(start + 10);
    expect(budget.taxRatePhaseIn?.incomeTax).toBeUndefined();
    expect(budget.revenue.total).toBeGreaterThan(revenueAfterStep);
  });

  it("a small move lands whole; a fresh enactment replaces a running ramp", () => {
    const w = createWorld({ seed: "tax2", playerName: "P", countryId: "US", era: "1953" });
    const budget = w.budgets["US"]!;
    const start = budget.taxRates.incomeTax;
    applyBillEffects(w, taxBill("US", start + 20));
    expect(budget.taxRatePhaseIn?.incomeTax).toBe(start + 20);
    applyBillEffects(w, taxBill("US", start + 2));
    expect(budget.taxRatePhaseIn?.incomeTax).toBeUndefined();
    expect(budget.taxRates.incomeTax).toBe(start + 2);
  });

  it("v41 migration backfills taxRatePhaseIn on every budget", () => {
    const w = createWorld({ seed: "tax3", playerName: "P", countryId: "US", era: "1953" });
    const raw = JSON.parse(serializeSave(w, "2026-09-02T00:00:00.000Z")) as { schemaVersion: number; world: { meta: { schemaVersion: number }; budgets: Record<string, Record<string, unknown>> } };
    raw.schemaVersion = 40; raw.world.meta.schemaVersion = 40;
    for (const b of Object.values(raw.world.budgets)) delete b["taxRatePhaseIn"];
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    for (const b of Object.values(loaded.budgets)) expect(b.taxRatePhaseIn).toEqual({});
  });
});
