import { describe, expect, it } from "vitest";
import { formatProgressTable, formatSummaryTable, formatQaReport } from "./formatter.js";
import type { ProgressRow } from "./formatter.js";
import { DEFAULT_WORLD_FEATURE_FLAGS, type WorldState } from "@ahdclient/engine";
import type { QaCountryResult } from "./qa.js";

function makeWorld(): WorldState {
  return {
    meta: { schemaVersion: 16, seed: "s", rng: [1, 2, 3, 4], turn: 5, date: "1953-02-10", era: "1953", lastEra: "1953", cheatsUsed: false },
    featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS },
    countries: {
      US: { id: "US", name: "United States", playable: true, economy: { gdp: 387000, growthRate: 0.046, inflationRate: 0.0075, unemploymentRate: 0.029, outputGap: 0.5 } },
      UK: { id: "UK", name: "United Kingdom", playable: true, economy: { gdp: 40336, growthRate: 0.04, inflationRate: 0.03, unemploymentRate: 0.018, outputGap: -0.2 } },
    },
    player: { name: "P", countryId: "US", cash: 10000, actions: 25, funds: 0, donorBaseLevel: 0, politicalInfluence: 0, favorability: 50, infamy: 0, actionCooldowns: {}, partyId: null, partyJoinedTurn: null, lastPartySwitchTurn: null, purgeRejoinBlocks: [], caucusId: null, legislativeSeat: null, mode: "career", hosPartyId: null, savings: 0, savingsHolder: "centralBank", actionCounts: {}, wireQuotaUsedAnchor: 0, wireQuotaWindowStartTurn: null },
    parties: {},
    legislatures: {},
    politicians: [],
    elections: [],
    referendums: [],
    executives: {},
    impeachments: [],
    charters: [],
    caucuses: [],
    endorsements: [],
    commodityPrices: {},
    extractionContracts: [],
    regions: {},
    partyRegions: {},
    electoratePools: {},
    regionTurnouts: {},
    partyPressures: {},
    candidateSupports: {},
    stateDemographics: {},
    baselineDemographics: {},
    demographicCategories: {},
    census: {},
    laborForces: {},
    budgets: {},
    regionalBudgets: {},
    centralBanks: {},
    bills: [],
    committees: [],
    enactedLaws: [],
    stateBills: [],
    nppRelationships: {},
    nppSponsorLastTurn: {},
    corporations: {},
    corpRevenueSnapshots: {},
    campaigns: {},
    statePartyElections: [],
    nationalPartyElections: [],
    nationalCommitteeElections: [],
    coalitions: [],
    governments: {},
    cabinetMembers: [],
    cabinetNominations: [],
    supremeCourtSeats: [],
    scotusNominations: [],
    docketCases: [],
    ukJudicialReviewCases: [],
    worldEventLedger: {},
    activeWorldModifiers: [],
    crises: [],
    playerEventLog: [],
    governors: {},
    governorAddresses: [],
    governorOrders: [],
    news: [],
    bankLoans: [],
    depositInsurance: {},
    unions: {},
    bonds: {},
    exchangeRates: {
      US: { countryId: "US", currencyCode: "USD", rate: 1, baseRate: 1, macroTarget: 1, rateHistory: [{ turn: 5, rate: 1 }], regime: "pegged", updatedTurn: 5 },
      UK: { countryId: "UK", currencyCode: "GBP", rate: 0.357, baseRate: 0.357, macroTarget: 0.357, rateHistory: [{ turn: 5, rate: 0.357 }], regime: "pegged", updatedTurn: 5 },
    },
    ledgerPreForexSnapshot: null,
    nationalMetrics: {},
    economicModels: {},
    commodityPriceHistory: {},
    economicVitalSigns: null,
    vitalSignsHistory: [],
    commandEconomy: {},
    capitalStock: {},
    capitalGrowth: {},
    unownedSectors: {},
    history: { macro: {}, primeRate: {}, partyStrength: {}, playerWealth: [], moneySupply: {} },
    policyLedger: {},
    ministerialOrders: [],
    enactmentGates: { debtCeilingCrisis: {} },
    currencyUnions: {},
    coldWarTension: { value: 50, pressureFloor: 50, updatedTurn: 5, events: [] },
    nuclearPrograms: {},
    conflicts: [],
    alignments: {
      US: { countryId: "US", shares: { WEST: 100 }, nonAligned: 0, updatedTurn: 5 },
      UK: { countryId: "UK", shares: { WEST: 100 }, nonAligned: 0, updatedTurn: 5 },
    },
    settlements: [],
    internationalOrgs: {},
    prospectingSurveys: [],
    stateResourceCapacities: {},
    achievementsEarned: [],
    countryPolitics: {},
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

function makeQaResult(overrides: Partial<QaCountryResult> = {}): QaCountryResult {
  return {
    era: "1953",
    countryId: "US",
    countryName: "United States",
    turns: 2080,
    seed: "qa-1953-US",
    determinismOk: true,
    determinismDiffCount: 0,
    invariantReports: [{ turn: 0, status: "green", checksRun: 10, findings: [] }],
    invariantOk: true,
    economyBandViolations: [],
    seatSumViolations: [],
    electionsSeen: 5,
    electionsResolved: 3,
    electionsOk: true,
    governmentApplicable: false,
    governmentFormed: false,
    governmentStuckPending: false,
    politicianCountInitial: 500,
    politicianCountFinal: 520,
    politicianPopulationOk: true,
    treasuryBalanceFinal: -1000,
    treasuryBoundsOk: true,
    ok: true,
    ...overrides,
  };
}

describe("formatQaReport", () => {
  it("renders an all-pass summary line when every result is ok", () => {
    const out = formatQaReport([makeQaResult()]);
    expect(out).toContain("OK");
    expect(out).toContain("All 1 era/country combinations passed.");
  });

  it("marks government n/a for countries without formation and formed/pending otherwise", () => {
    const out = formatQaReport([
      makeQaResult({ countryId: "US", governmentApplicable: false }),
      makeQaResult({ countryId: "UK", governmentApplicable: true, governmentFormed: true }),
    ]);
    expect(out).toContain("n/a");
    expect(out).toContain("formed");
  });

  it("dumps per-check violation detail for a failing result", () => {
    const failing = makeQaResult({
      countryId: "RU",
      ok: false,
      determinismOk: false,
      determinismDiffCount: 3,
      economyBandViolations: [{ metric: "growthRate", value: 5, min: -0.15, max: 0.15, turn: 260 }],
      seatSumViolations: [{ chamberKey: "sovietOfTheUnion", turn: 260, seatsByPartySum: 400, vacancies: 10, expectedSeats: 526 }],
    });
    const out = formatQaReport([failing]);
    expect(out).toContain("FAILED");
    expect(out).toContain("3 diffs between twin runs");
    expect(out).toContain("growthRate=5");
    expect(out).toContain("sovietOfTheUnion");
  });

  it("explains unresolved elections and an unformed applicable government", () => {
    const out = formatQaReport([
      makeQaResult({
        countryId: "UK",
        ok: false,
        electionsSeen: 4,
        electionsResolved: 0,
        electionsOk: false,
        governmentApplicable: true,
        governmentFormed: false,
      }),
    ]);

    expect(out).toContain("0 elections resolved (4 seen)");
    expect(out).toContain("government: not formed");
  });
});
