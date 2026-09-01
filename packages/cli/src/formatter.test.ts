import { describe, expect, it } from "vitest";
import { formatProgressTable, formatSummaryTable } from "./formatter.js";
import type { ProgressRow } from "./formatter.js";
import type { WorldState } from "@rotunda/engine";

function makeWorld(): WorldState {
  return {
    meta: { schemaVersion: 6, seed: "s", rng: [1, 2, 3, 4], turn: 5, date: "1953-02-10", era: "1953", cheatsUsed: false },
    countries: {
      US: { id: "US", name: "United States", playable: true, economy: { gdp: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: 0.5 } },
      UK: { id: "UK", name: "United Kingdom", playable: true, economy: { gdp: 40336, growthRate: 0.04, inflationRate: 0.03, unemploymentRate: 0.018, outputGap: -0.2 } },
    },
    player: { name: "P", countryId: "US", cash: 10000 },
    parties: {},
    legislatures: {},
    politicians: [],
    charters: [],
    caucuses: [],
    news: [],
  };
}

describe("formatProgressTable", () => {
  it("renders header and rows", () => {
    const rows: ProgressRow[] = [
      { turn: 0, date: "1953-01-06", era: "1953", gdp: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: 0 },
      { turn: 52, date: "1954-01-05", era: "1953", gdp: 400000, growthRate: 0.03, inflationRate: 0.02, unemploymentRate: 0.04, outputGap: 1.2 },
    ];
    const out = formatProgressTable(rows);
    expect(out).toContain("Turn");
    expect(out).toContain("Date");
    expect(out).toContain("1953-01-06");
    expect(out).toContain("1954-01-05");
    expect(out).toContain("387000");
    expect(out).toContain("4.60");
    expect(out).toContain("0.75");
  });

  it("handles empty rows", () => {
    const out = formatProgressTable([]);
    expect(out).toContain("(no turns)");
  });

  it("formats growth as percent with 2 decimals", () => {
    const rows: ProgressRow[] = [
      { turn: 1, date: "1953-01-13", era: "1953", gdp: 100, growthRate: 0.01234, inflationRate: 0, unemploymentRate: 0, outputGap: 0 },
    ];
    const out = formatProgressTable(rows);
    expect(out).toContain("1.23");
  });
});

describe("formatSummaryTable", () => {
  it("renders per-country summary sorted by id", () => {
    const world = makeWorld();
    const out = formatSummaryTable(world);
    expect(out).toContain("Country");
    expect(out).toContain("GDP");
    expect(out).toContain("US");
    expect(out).toContain("UK");
    // sorted: UK before US
    const ukIdx = out.indexOf("UK");
    const usIdx = out.indexOf("US");
    expect(ukIdx).toBeLessThan(usIdx);
  });

  it("renders numeric columns", () => {
    const world = makeWorld();
    const out = formatSummaryTable(world);
    expect(out).toContain("387000");
    expect(out).toContain("40336");
    expect(out).toContain("4.60");
    expect(out).toContain("3.00");
  });

  it("includes outputGap", () => {
    const world = makeWorld();
    const out = formatSummaryTable(world);
    expect(out).toContain("0.50");
    expect(out).toContain("-0.20");
  });
});
