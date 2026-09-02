import { describe, expect, it } from "vitest";
import { advanceTaxRatePhaseIn, needsPhaseIn, phaseInTurns, stepTaxRate, TAX_RATE_PHASE_IN_MAX_STEP_PP } from "./taxRatePhaseIn.js";

describe("tax-rate phase-in (ticket #1102, verbatim port)", () => {
  it("steps at most one point per turn and lands exactly", () => {
    expect(TAX_RATE_PHASE_IN_MAX_STEP_PP).toBe(1);
    expect(stepTaxRate(35, 45)).toBe(36);
    expect(stepTaxRate(35, 35.5)).toBe(35.5);
    expect(stepTaxRate(45, 35)).toBe(44);
    expect(needsPhaseIn(35, 45)).toBe(true);
    expect(needsPhaseIn(35, 36)).toBe(false);
    expect(phaseInTurns(35, 45)).toBe(10);
  });

  it("advances pending ramps and clears reached targets", () => {
    const r1 = advanceTaxRatePhaseIn({ incomeTax: 35, payrollTax: 3 }, { incomeTax: 45, payrollTax: 3.5 });
    expect(r1.rates).toEqual({ incomeTax: 36, payrollTax: 3.5 });
    expect(r1.pending).toEqual({ incomeTax: 45 });
    expect(r1.changed).toBe(true);
    const r2 = advanceTaxRatePhaseIn({ incomeTax: 45 }, { incomeTax: 45 });
    expect(r2.pending).toEqual({});
    expect(r2.changed).toBe(true);
  });
});
