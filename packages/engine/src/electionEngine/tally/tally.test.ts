// @ts-nocheck
/**
 * Tests for tally pure module — ported from `src/lib/electionEngine/tallyManagement.test.ts`.
 *
 * Byte-identical assertions where inputs allow. Changed assertions are annotated
 * with `// PORT-CHANGED:` and documented at the top.
 *
 * Changed assertions / omissions:
 * - DB `updateOne` / `replaceOne` assertions are replaced by return-value checks
 *   (pure layer returns new tally; caller persists). The document shape is identical.
 * - `MockDb` / `getDb` wiring removed — plain inputs supplied directly.
 * - `resolveTurnout` / `getStateApprovalForElection` mocks replaced by direct
 *   `turnout` + `approvalPct` fields on the input.
 * - `fetchEnrichedCandidates` mock replaced by direct `enriched` array.
 * - `loadPartyGroupFavorability` / `resolveTurnout` cap tests use injected
 *   distributor or direct cap helper calls; the cap algebra itself is pinned
 *   in `turnout.test` style assertions below.
 * - `removeWithdrawnCandidateFromTally` (tallyCleaner) is NOT ported — that
 *   helper is a DB `$unset` mutation, not part of the accumulation tally.
 *   Its logic is covered by the withdrawn-candidate cleanup in `accumulateVoteTurn`.
 * - `preload` / `approvalMap` / `executiveEndorsements` DB paths are replaced
 *   by plain `derived` fields.
 * - `granularElectorateEnabled` flag tests now assert the PORT-STUB substrate
 *   (pass `granularSubstrate` vs null) instead of `gameState` DB row.
 * - Query-shape parallel-dispatch tests (`tallyManagement.queryShape.test.ts`)
 *   are not ported — pure layer has no async dispatches to test.
 */
import { describe, it, expect } from "vitest";
import { accumulateVoteTurn } from "./accumulateVoteTurn.js";
import { initElectionVoteTally } from "./initElectionVoteTally.js";
import type { EnrichedCandidate, StateDemographics, DemographicCategory } from "../types.js";
import type {
  TallyElectionInput,
  TallyCandidateInput,
  TallyInput,
  TallyStateInput,
} from "./types.js";

const FIXED_NOW = new Date("2024-01-01T00:00:00Z");

function makeElection(overrides: Partial<TallyElectionInput> = {}): TallyElectionInput {
  const now = new Date("2024-01-01T00:00:00Z");
  return {
    _id: "election1",
    countryId: "US",
    electionType: "senate",
    state: "PA",
    startTime: new Date(now.getTime() - 24 * 3_600_000),
    endTime: new Date(now.getTime() + 24 * 3_600_000),
    createdAt: now,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<TallyCandidateInput> = {}): TallyCandidateInput {
  return {
    _id: "cand1",
    electionId: "election1",
    characterId: "char1",
    characterName: "Test Candidate",
    party: "democrat",
    status: "active",
    ...overrides,
  };
}

function makeTally(
  electionId: string,
  overrides: Partial<TallyInput> = {},
): TallyInput {
  return {
    _id: electionId,
    electionId,
    state: "PA",
    totalVotes: {},
    candidateNames: {},
    candidateParties: {},
    turnSnapshots: [],
    finalized: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEnriched(
  candidateId: string,
  overrides: Partial<EnrichedCandidate> = {},
): EnrichedCandidate {
  return {
    candidateId,
    characterId: candidateId,
    characterName: "Test",
    party: "democrat",
    isNPP: false,
    charEP: 0,
    charSP: 0,
    favorability: 50,
    politicalInfluence: 100,
    nationalInfluence: 0,
    ...overrides,
  };
}

function makeDemographics(): StateDemographics {
  return {
    _id: "PA",
    countryId: "US",
    categoryWeights: { ideology: 100 },
    groups: {
      liberal: { population: 50, turnout: 60, economicLean: -3, socialLean: -3 },
      conservative: { population: 50, turnout: 60, economicLean: 3, socialLean: 3 },
    },
    lastUpdated: new Date(),
  };
}

function makeState(): TallyStateInput {
  return {
    _id: "PA",
    name: "Pennsylvania",
    countryId: "US",
    population: 1_000_000,
    votingSystem: "fptp",
  };
}

function makeCategory(): DemographicCategory {
  return {
    _id: "ideology",
    name: "Ideology",
    defaultWeight: 100,
    groups: [
      { id: "liberal", name: "Liberals", defaultEconomicLean: -3, defaultSocialLean: -3, defaultTurnout: 60 },
      { id: "conservative", name: "Conservatives", defaultEconomicLean: 3, defaultSocialLean: 3, defaultTurnout: 60 },
    ],
  };
}

// ─── initElectionVoteTally ───────────────────────────────────────────────

describe("initElectionVoteTally", () => {
  it("rejects initialization without a caller-supplied deterministic timestamp", () => {
    expect(() => initElectionVoteTally({
      electionId: "e1",
      candidates: [],
      state: "PA",
    })).toThrow("deterministic timestamp");
  });

  it("creates zeroed tally document for each candidate", () => {
    const c1 = makeCandidate({ _id: "c1", characterName: "Alice", party: "democrat" });
    const c2 = makeCandidate({ _id: "c2", characterName: "Bob", party: "republican" });
    const { tally } = initElectionVoteTally({ electionId: "e1", candidates: [c1, c2], state: "PA", now: FIXED_NOW });
    expect(tally.electionId).toBe("e1");
    expect(tally.totalVotes["c1"]).toBe(0);
    expect(tally.totalVotes["c2"]).toBe(0);
    expect(tally.candidateNames["c1"]).toBe("Alice");
    expect(tally.candidateParties["c2"]).toBe("republican");
    expect(tally.state).toBe("PA");
    expect(tally.finalized).toBe(false);
    expect(tally.turnSnapshots).toEqual([]);
  });

  it("includes primaryResults when provided", () => {
    const c = makeCandidate();
    const primaryResults = { byParty: { democrat: [{ candidateId: "x", won: true }] }, recordedAt: new Date() };
    const { tally } = initElectionVoteTally({ electionId: "e1", candidates: [c], state: "PA", primaryResults, now: FIXED_NOW });
    expect(tally.primaryResults).toEqual(primaryResults);
  });

  it("works with empty candidate list", () => {
    const { tally } = initElectionVoteTally({ electionId: "e1", candidates: [], state: "NY", now: FIXED_NOW });
    expect(tally.totalVotes).toEqual({});
    expect(tally.candidateNames).toEqual({});
  });

  it("preserves existingId and existingPrimaryVotes", () => {
    const c = makeCandidate({ _id: "c1" });
    const { tally } = initElectionVoteTally({
      electionId: "e1",
      candidates: [c],
      state: "PA",
      existingId: "oldId",
      existingPrimaryVotes: { foo: 1 },
      now: FIXED_NOW,
    });
    expect(tally._id).toBe("oldId");
    expect(tally.primaryVotes).toEqual({ foo: 1 });
  });
});

// ─── accumulateVoteTurn — early exits ─────────────────────────────────────

describe("accumulateVoteTurn — early exits", () => {
  const baseState = makeState();
  const baseDemographics = makeDemographics();
  const baseCategories = [makeCategory()];
  const baseCandidate = makeCandidate({ _id: "c1" });
  const baseEnriched = [makeEnriched("c1")];
  const baseDistribute = () => ({ votesPerCandidate: { c1: 1000 }, sharesPct: { c1: 100 } });

  it("returns null when no active candidates", () => {
    const election = makeElection();
    const tally = makeTally("e1");
    const result = accumulateVoteTurn({
      election, candidates: [], tally, state: baseState,
      demographics: baseDemographics, categories: baseCategories,
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched: [], turnNumber: 1, now: new Date(),
      distributeFn: baseDistribute,
    });
    expect(result).toBeNull();
  });

  it("returns null when election has no endTime", () => {
    const election = makeElection({ endTime: null });
    const tally = makeTally("e1");
    const result = accumulateVoteTurn({
      election, candidates: [baseCandidate], tally, state: baseState,
      demographics: baseDemographics, categories: baseCategories,
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched: baseEnriched, turnNumber: 1, now: new Date(),
      distributeFn: baseDistribute,
    });
    expect(result).toBeNull();
  });

  it("returns alreadyCounted when turn snapshot exists", () => {
    const election = makeElection();
    const tally = makeTally("e1", {
      turnSnapshots: [{ turn: 5, recordedAt: new Date(), cumulativeVotes: { c1: 1000 }, sharesPct: { c1: 100 } }],
      totalVotes: { c1: 1000 },
    });
    const result = accumulateVoteTurn({
      election, candidates: [baseCandidate], tally, state: baseState,
      demographics: baseDemographics, categories: baseCategories,
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched: baseEnriched, turnNumber: 5, now: new Date(),
      distributeFn: baseDistribute,
    });
    expect(result?.alreadyCounted).toBe(true);
  });
});

// ─── accumulateVoteTurn — core vote accumulation ──────────────────────────

describe("accumulateVoteTurn — vote accumulation", () => {
  function baseInput(overrides: Record<string, unknown> = {}) {
    const c = makeCandidate({ _id: "c1" });
    const election = makeElection();
    return {
      election, candidates: [c], tally: makeTally("e1"),
      state: makeState(), demographics: makeDemographics(),
      categories: [makeCategory()], statePartyOrgs: [] as never[],
      turnout: { totalPool: 100_000, byGroup: {} },
      enriched: [makeEnriched("c1")],
      turnNumber: 7, now: new Date("2024-01-01T12:00:00Z"),
      derived: { approvalPct: 50 },
      distributeFn: (() => ({ votesPerCandidate: { c1: 5000 }, sharesPct: { c1: 50 } })) as never,
      ...overrides,
    };
  }

  it("appends a VoteTurnSnapshot", () => {
    const input = baseInput() as never;
    const result = accumulateVoteTurn(input)!;
    expect(result.snapshot.turn).toBe(7);
    expect(result.snapshot.recordedAt).toEqual(new Date("2024-01-01T12:00:00Z"));
    expect(result.tally.turnSnapshots).toHaveLength(1);
  });

  it("accumulates votes on top of existing totals", () => {
    const c = makeCandidate({ _id: "c1" });
    const result = accumulateVoteTurn(baseInput({
      tally: makeTally("e1", { totalVotes: { c1: 10_000 }, candidateNames: { c1: "Test" }, candidateParties: { c1: "democrat" } }),
      distributeFn: (() => ({ votesPerCandidate: { c1: 3000 }, sharesPct: { c1: 100 } })) as never,
    }) as never)!;
    expect(result.newTotals["c1"]).toBe(13_000);
  });

  it("excludes withdrawn candidates from newTotals", () => {
    const active = makeCandidate({ _id: "c1", status: "active" });
    const enriched = [makeEnriched("c1")];
    const result = accumulateVoteTurn(baseInput({
      candidates: [active],
      tally: makeTally("e1", {
        totalVotes: { c1: 5000, c2: 2000 },
        candidateNames: { c1: "Active", c2: "Withdrawn" },
        candidateParties: { c1: "democrat", c2: "republican" },
      }),
      enriched,
      distributeFn: (() => ({ votesPerCandidate: { c1: 1000 }, sharesPct: { c1: 100 } })) as never,
    }) as never)!;
    expect(result.newTotals["c1"]).toBe(6000);
    expect(result.newTotals["c2"]).toBeUndefined();
    expect(result.tally.candidateNames["c2"]).toBeUndefined();
  });

  it("snapshot cumulativeVotes reflects newTotals", () => {
    const result = accumulateVoteTurn(baseInput({
      tally: makeTally("e1", { totalVotes: { c1: 8000 }, candidateNames: { c1: "Test" }, candidateParties: { c1: "democrat" } }),
      distributeFn: (() => ({ votesPerCandidate: { c1: 2000 }, sharesPct: { c1: 100 } })) as never,
    }) as never)!;
    expect(result.snapshot.cumulativeVotes["c1"]).toBe(10_000);
  });

  it("passes sharesPct into snapshot", () => {
    const result = accumulateVoteTurn(baseInput({
      distributeFn: (() => ({ votesPerCandidate: { c1: 1000 }, sharesPct: { c1: 73.5 } })) as never,
    }) as never)!;
    expect(result.snapshot.sharesPct["c1"]).toBe(73.5);
  });

  it("turn-first: final-4 surge is larger than early pool even with drifted clock", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const election = makeElection({
      _id: "e1", startTurn: 100, endTurn: 148,
      startTime: start, endTime: new Date(start.getTime() + 48 * 3_600_000),
    });
    const now = new Date(start.getTime() + 10 * 3_600_000);
    let earlyPool = 0, surgePool = 0;
    const makeDistribute = (capture: (v: number) => void) => (
      _enriched: EnrichedCandidate[], pool: number) => {
      capture(pool);
      return { votesPerCandidate: { c1: 1000 }, sharesPct: { c1: 100 } };
    };

    const base = {
      election, candidates: [makeCandidate({ _id: "c1" })],
      tally: makeTally("e1"), state: makeState(),
      demographics: makeDemographics(), categories: [makeCategory()],
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched: [makeEnriched("c1")], now,
      derived: { approvalPct: 50 },
    };
    accumulateVoteTurn({ ...base, turnNumber: 110, distributeFn: makeDistribute((v) => { earlyPool = v; }) } as never);
    accumulateVoteTurn({ ...base, turnNumber: 146, distributeFn: makeDistribute((v) => { surgePool = v; }) } as never);
    expect(surgePool).toBeGreaterThan(earlyPool * 2);
  });

  it("counts inclusive endTurn window (conservation)", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const election = makeElection({
      _id: "e1", startTurn: 100, endTurn: 148,
      startTime: start, endTime: new Date(start.getTime() + 48 * 3_600_000),
    });
    const base = {
      election, candidates: [makeCandidate({ _id: "c1" })],
      tally: makeTally("e1"), state: makeState(),
      demographics: makeDemographics(), categories: [makeCategory()],
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched: [makeEnriched("c1")], now: start,
      derived: { approvalPct: 50 },
    };
    let released = 0; let firstSlice = 0;
    for (let turn = 100; turn <= 148; turn++) {
      let slice = 0;
      accumulateVoteTurn({ ...base, turnNumber: turn, distributeFn: ((_e, p) => { slice = p; return { votesPerCandidate: { c1: 1000 }, sharesPct: { c1: 100 } }; }) as never } as never);
      if (turn === 100) firstSlice = slice;
      released += slice;
    }
    expect(released / firstSlice).toBeCloseTo(74, 5);
  });

  it("never carries cumulative ballots past electorate", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const election = makeElection({ _id: "e1", startTurn: 100, endTurn: 148, startTime: start, endTime: new Date(start.getTime() + 48 * 3_600_000) });
    let slice = 0;
    accumulateVoteTurn({
      election, candidates: [makeCandidate({ _id: "c1" })],
      tally: makeTally("e1", { totalVotes: { c1: 999_500 } }),
      state: makeState(), demographics: makeDemographics(),
      categories: [makeCategory()], statePartyOrgs: [],
      turnout: { totalPool: 1_000_000, byGroup: {} },
      enriched: [makeEnriched("c1")], turnNumber: 146, now: start,
      derived: { approvalPct: 50 },
      distributeFn: ((_e, p) => { slice = p; return { votesPerCandidate: { c1: p }, sharesPct: { c1: 100 } }; }) as never,
    } as never);
    expect(slice).toBeGreaterThan(0);
    expect(slice).toBeLessThanOrEqual(500);
  });
});

// ─── Hamilton seat allocation ─────────────────────────────────────────────

describe("accumulateVoteTurn — Hamilton seat allocation", () => {
  function multiSeatInput(electionType: string, totalSeats: number, candidateVotes: Record<string, number>) {
    const labels = Object.keys(candidateVotes);
    const candidates = labels.map((label) => makeCandidate({ _id: `id_${label}`, characterName: label }));
    const enriched = labels.map((label) => makeEnriched(`id_${label}`, { characterName: label }));
    const voteResult: Record<string, number> = {};
    for (const label of labels) voteResult[`id_${label}`] = candidateVotes[label];
    const election = makeElection({ _id: "e1", electionType, totalSeats });
    return {
      election, candidates,
      tally: makeTally("e1"), state: makeState(),
      demographics: makeDemographics(), categories: [makeCategory()],
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched, turnNumber: 1, now: new Date(),
      derived: { approvalPct: 50 },
      distributeFn: (() => ({ votesPerCandidate: voteResult, sharesPct: {} })) as never,
      labels, enrichedIds: labels.map((l) => `id_${l}`),
    };
  }

  it("sums exactly to totalSeats", () => {
    const { election, candidates, tally, state, demographics, categories, enriched, turnNumber, now, derived, distributeFn } = multiSeatInput("stateSenate", 5, { Alice: 40_000, Bob: 30_000, Carol: 20_000, Dave: 10_000 });
    const result = accumulateVoteTurn({ election, candidates, tally, state, demographics, categories, statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} }, enriched, turnNumber, now, derived, distributeFn } as never)!;
    const total = Object.values(result.seatsEstimate!).reduce((s, n) => s + n, 0);
    expect(total).toBe(5);
    expect(result.snapshot.seatsEstimate).toEqual(result.seatsEstimate);
  });

  it("gives most votes most seats", () => {
    const input = multiSeatInput("stateSenate", 5, { Leader: 75_000, Runner: 25_000 });
    const result = accumulateVoteTurn({ ...input, tally: makeTally("e1"), state: makeState(), demographics: makeDemographics(), categories: [makeCategory()], turnout: { totalPool: 100_000, byGroup: {} } } as never)!;
    expect(result.seatsEstimate!["id_Leader"]).toBeGreaterThan(result.seatsEstimate!["id_Runner"]);
  });

  it("excludes below-threshold fringe from house", () => {
    const input = multiSeatInput("house", 3, { Major1: 50_000, Major2: 45_000, Fringe: 5_000 });
    const result = accumulateVoteTurn({ ...input, tally: makeTally("e1"), state: makeState(), demographics: makeDemographics(), categories: [makeCategory()], turnout: { totalPool: 100_000, byGroup: {} } } as never)!;
    expect(result.seatsEstimate!["id_Fringe"]).toBe(0);
    expect(result.seatsEstimate!["id_Major1"] + result.seatsEstimate!["id_Major2"]).toBe(3);
  });

  it("does not produce seatsEstimate for single-seat senate", () => {
    const input = multiSeatInput("senate", 1, { Alice: 60_000, Bob: 40_000 });
    const result = accumulateVoteTurn({ ...input, tally: makeTally("e1"), state: makeState(), demographics: makeDemographics(), categories: [makeCategory()], turnout: { totalPool: 100_000, byGroup: {} } } as never)!;
    expect(result.seatsEstimate).toBeUndefined();
  });

  it("executive endorsement adds 1.5% bonus", () => {
    const c = makeCandidate({ _id: "c1" });
    const result = accumulateVoteTurn({
      election: makeElection(), candidates: [c], tally: makeTally("e1"),
      state: makeState(), demographics: makeDemographics(), categories: [makeCategory()],
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched: [makeEnriched("c1")], turnNumber: 1, now: new Date(),
      derived: { approvalPct: 50, executiveEndorsedCandidateIds: new Set(["c1"]) },
      distributeFn: (() => ({ votesPerCandidate: { c1: 10_000 }, sharesPct: { c1: 100 } })) as never,
    } as never)!;
    // 10_000 * 1.015 = 10150 after rounding
    expect(result.newTotals["c1"]).toBe(10_150);
  });

  it("caps at electorate and registered pool (isolated helpers)", () => {
    // Directly pin the cap helpers via the turn pool argument.
    // This mirrors the mainline test that pinned capTurnSliceToElectorate.
    const start = new Date("2024-01-01T00:00:00Z");
    const election = makeElection({ _id: "e1", startTurn: 100, endTurn: 148, startTime: start, endTime: new Date(start.getTime() + 48 * 3_600_000) });
    const base = {
      election, candidates: [makeCandidate({ _id: "c1" })],
      tally: makeTally("e1"), state: makeState(),
      demographics: makeDemographics(), categories: [makeCategory()],
      statePartyOrgs: [], enriched: [makeEnriched("c1")],
      derived: { approvalPct: 50 }, now: new Date(start.getTime() + 10 * 3_600_000),
    };
    let poolAtCeiling = 0, poolInflated = 0;
    const cap = (fn: (v: number) => void) => ((_e: EnrichedCandidate[], p: number) => { fn(p); return { votesPerCandidate: { c1: p }, sharesPct: { c1: 100 } }; }) as never;
    accumulateVoteTurn({ ...base, turnNumber: 110, turnout: { totalPool: 1_000_000, byGroup: {} }, distributeFn: cap((v) => { poolAtCeiling = v; }) } as never);
    accumulateVoteTurn({ ...base, turnNumber: 110, turnout: { totalPool: 3_300_000, byGroup: {} }, distributeFn: cap((v) => { poolInflated = v; }) } as never);
    // PORT-CHANGED: with pure inputs the cap IS active (totalPool directly controls electorate ratio),
    // so inflated must be capped to ceiling. Mainline comment said cap was inert due to granular rebuild.
    expect(poolInflated).toBeCloseTo(poolAtCeiling, 5);
  });
});

// ─── Granular substrate PORT-STUB ────────────────────────────────────────

describe("accumulateVoteTurn — granular substrate PORT-STUB", () => {
  it("uses enriched substrate when provided", () => {
    const election = makeElection();
    const tally = makeTally("e1");
    const state = makeState();
    const demographics = makeDemographics();
    const categories = [makeCategory()];
    // Granular substrate with a distinct category id
    const granularDemographics: StateDemographics = {
      _id: "PA", countryId: "US",
      categoryWeights: { granularCells: 100 },
      groups: { cell1: { population: 50, turnout: 60, economicLean: 0, socialLean: 0 }, cell2: { population: 50, turnout: 60, economicLean: 0, socialLean: 0 } },
      lastUpdated: new Date(),
    };
    const granularCategories: DemographicCategory[] = [{
      _id: "granularCells", name: "Granular Cells", defaultWeight: 100,
      groups: [
        { id: "cell1", name: "Cell 1", defaultEconomicLean: 0, defaultSocialLean: 0, defaultTurnout: 60 },
        { id: "cell2", name: "Cell 2", defaultEconomicLean: 0, defaultSocialLean: 0, defaultTurnout: 60 },
      ],
    }];
    let sawGranular = false;
    accumulateVoteTurn({
      election, candidates: [makeCandidate({ _id: "c1" })], tally, state,
      demographics, categories,
      statePartyOrgs: [], turnout: { totalPool: 100_000, byGroup: {} },
      enriched: [makeEnriched("c1")], turnNumber: 1, now: new Date(),
      derived: {
        approvalPct: 50,
        granularSubstrate: {
          demographics: granularDemographics as never, categories: granularCategories as never,
          liveTurnouts: {}, totalPool: 100_000, enriched: [makeEnriched("c1")],
        },
      },
      distributeFn: ((_e, _pool, _total, _elect, demo, cats) => {
        if ((cats as DemographicCategory[])[0]?._id === "granularCells") sawGranular = true;
        void demo;
        return { votesPerCandidate: { c1: 1000 }, sharesPct: { c1: 100 } };
      }) as never,
    } as never);
    expect(sawGranular).toBe(true);
  });

  it("passes fixtures through when substrate is null", () => {
    const election = makeElection();
    const tally = makeTally("e1");
    let sawIdeology = false;
    accumulateVoteTurn({
      election, candidates: [makeCandidate({ _id: "c1" })], tally,
      state: makeState(), demographics: makeDemographics(),
      categories: [makeCategory()], statePartyOrgs: [],
      turnout: { totalPool: 100_000, byGroup: {} },
      enriched: [makeEnriched("c1")], turnNumber: 1, now: new Date(),
      derived: { approvalPct: 50, granularSubstrate: null },
      distributeFn: ((_e, _pool, _total, _elect, _demo, cats) => {
        if ((cats as DemographicCategory[])[0]?._id === "ideology") sawIdeology = true;
        return { votesPerCandidate: { c1: 1000 }, sharesPct: { c1: 100 } };
      }) as never,
    } as never);
    expect(sawIdeology).toBe(true);
  });
});
