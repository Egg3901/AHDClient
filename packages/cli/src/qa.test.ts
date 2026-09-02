import { describe, expect, it } from "vitest";
import { listEras, listPlayableCountries } from "@rotunda/engine";
import { runQa, runQaForCountry, FULL_QA_OPTIONS, QUICK_QA_OPTIONS } from "./qa.js";

// Keep turn counts tiny — this exercises the real engine (no mocks, per
// FRAMEWORK.md determinism doctrine: no reason to fake it, and a real short
// run catches wiring bugs a mock would hide), just far fewer of them than
// the actual QA gate. FULL_QA_OPTIONS/QUICK_QA_OPTIONS themselves are
// exercised for shape only, never run to completion in a unit test.

describe("runQaForCountry", () => {
  it("passes every check for a short US 1953 run", () => {
    const r = runQaForCountry("1953", "US", "United States", { turns: 20, checkpointInterval: 10, seedPrefix: "test" });
    expect(r.era).toBe("1953");
    expect(r.countryId).toBe("US");
    expect(r.determinismOk).toBe(true);
    expect(r.invariantOk).toBe(true);
    expect(r.economyBandViolations).toEqual([]);
    expect(r.seatSumViolations).toEqual([]);
    expect(r.electionsOk).toBe(true);
    expect(r.governmentApplicable).toBe(false); // US has no parliamentary formation
    expect(r.politicianPopulationOk).toBe(true);
    expect(r.treasuryBoundsOk).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("is deterministic: two identical calls (same seed derivation) agree on final state shape", () => {
    const a = runQaForCountry("1953", "UK", "United Kingdom", { turns: 15, checkpointInterval: 5, seedPrefix: "test-uk" });
    const b = runQaForCountry("1953", "UK", "United Kingdom", { turns: 15, checkpointInterval: 5, seedPrefix: "test-uk" });
    expect(a.determinismOk).toBe(true);
    expect(b.determinismOk).toBe(true);
    expect(a.politicianCountFinal).toBe(b.politicianCountFinal);
    expect(a.treasuryBalanceFinal).toBe(b.treasuryBalanceFinal);
  });

  it("handles a country whose chamber seeds all-vacant (UK) without a zero-width population band", () => {
    const r = runQaForCountry("1953", "UK", "United Kingdom", { turns: 10, checkpointInterval: 5, seedPrefix: "test-vacant" });
    expect(r.politicianCountInitial).toBe(0); // UK commons seeds all-vacant per content/packs/1953.ts
    expect(r.politicianPopulationOk).toBe(true);
  });

  it("checks invariants and seat sums at the turn-0 baseline but skips economy bands there", () => {
    // RU 1953 seeds unemploymentRate 0.5% (planned-economy doctrine), below
    // the engine's own UNEMPLOYMENT_MIN=1% clamp floor that only applies
    // from turn 1 onward — this must not be reported as a violation.
    const r = runQaForCountry("1953", "RU", "Russia", { turns: 1, checkpointInterval: 1, seedPrefix: "test-ru-t0" });
    expect(r.invariantReports[0]!.turn).toBe(0);
    expect(r.economyBandViolations.some((v) => v.turn === 0)).toBe(false);
  });
});

describe("runQa", () => {
  it("iterates every listEras() x listPlayableCountries() pair", () => {
    const opts = { turns: 5, checkpointInterval: 5, seedPrefix: "test-sweep" };
    const results = runQa(opts);
    const expectedCount = listEras().reduce((n, e) => n + listPlayableCountries(e.id).length, 0);
    expect(results.length).toBe(expectedCount);
  });

  it("filters to one era/country pair when given", () => {
    const opts = { turns: 5, checkpointInterval: 5, seedPrefix: "test-filter" };
    const results = runQa(opts, { era: "1953", country: "DD" });
    expect(results.length).toBe(1);
    expect(results[0]!.era).toBe("1953");
    expect(results[0]!.countryId).toBe("DD");
  });
});

describe("QA option presets", () => {
  it("full mode is 2080 turns / 260-turn checkpoints (40 in-game years, P4 spec)", () => {
    expect(FULL_QA_OPTIONS.turns).toBe(2080);
    expect(FULL_QA_OPTIONS.checkpointInterval).toBe(260);
  });

  it("quick mode is 400 turns for verify:qa", () => {
    expect(QUICK_QA_OPTIONS.turns).toBe(400);
  });
});
