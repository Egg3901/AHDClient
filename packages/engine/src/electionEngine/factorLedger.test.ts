// @ts-nocheck
import { describe, expect, it } from "vitest";
import {
  createLedgerSink,
  assembleNationalLedger,
  assertLedgerReconstructs,
  FACTOR_ORDER,
  type FactorKey,
} from "./factorLedger.js";
import type { EnrichedCandidate } from "./types.js";
import type { DemographicCategory, StateDemographics } from "./types.js";

// Archetype ids the ledger must NEVER read or emit (buckets only).
const ARCHETYPE_IDS = [
  "urbanProfessionals",
  "ruralWorkers",
  "retirees",
  "youngVoters",
  "religiousConservatives",
  "suburbanFamilies",
];

/**
 * Drive the sink directly with known per-unit values, then run the full stage
 * pipeline the presidential engine records, so the waterfall math is tested in
 * isolation from the swing-flow.
 */
function feedUnit(
  sink: ReturnType<typeof createLedgerSink>,
  unitId: string,
  candidateId: string,
  cells: Array<{
    votes: number;
    demoEP: number;
    demoSP: number;
    base: number;
    reachDelta: number;
    fitDelta: number;
    restDelta: number;
    bucketWeights?: Record<string, number>;
  }>,
  finalize: { support: number; swingDelta: number; spoilerDelta: number },
  stages: {
    strengthMultiplier: number;
    referendum: number;
    independent: number;
    lean: number;
    campaign: number;
    finalVotes: number;
  }
) {
  for (const c of cells) {
    sink.recordCellAppeal(
      unitId,
      candidateId,
      c.votes,
      c.demoEP,
      c.demoSP,
      { base: c.base, reachDelta: c.reachDelta, fitDelta: c.fitDelta, restDelta: c.restDelta },
      c.bucketWeights
    );
  }
  sink.finalizeUnitCandidate(unitId, candidateId, finalize);
  sink.setUnitTurnout(unitId, stages.strengthMultiplier);
  sink.recordReferendum(unitId, candidateId, stages.referendum);
  sink.recordIndependentPenalty(unitId, candidateId, stages.independent);
  sink.recordLean(unitId, candidateId, stages.lean);
  sink.recordCampaign(unitId, candidateId, stages.campaign);
  sink.recordFinalVotes(unitId, candidateId, stages.finalVotes);
}

describe("factorLedger waterfall reconstruction", () => {
  it("reconstructs finalVotes: baseline + Σ voteDelta === finalVotes", () => {
    const sink = createLedgerSink();
    // Two cells, support 1.1, plus a referendum + lean + campaign stage.
    feedUnit(
      sink,
      "CA",
      "c1",
      [
        {
          votes: 1000,
          demoEP: -1,
          demoSP: 0,
          base: 700,
          reachDelta: 120,
          fitDelta: 100,
          restDelta: 80,
        },
        {
          votes: 500,
          demoEP: 1,
          demoSP: 0,
          base: 400,
          reachDelta: 40,
          fitDelta: 30,
          restDelta: 30,
        },
      ],
      { support: 1.1, swingDelta: 60, spoilerDelta: -20 },
      {
        strengthMultiplier: 1.2,
        referendum: 15,
        independent: 0,
        lean: 25,
        campaign: 40,
        finalVotes: 1893,
      }
    );

    const ledger = assembleNationalLedger(sink, 400);
    const cand = ledger.byCandidateNational.find((c) => c.candidateId === "c1")!;
    let sum = cand.nominalWeight;
    for (const f of cand.factors) sum += f.voteDelta;
    expect(sum).toBeCloseTo(cand.finalVotes, 6);
    expect(cand.finalVotes).toBe(1893);

    // The assertion helper must accept it against the engine total.
    expect(() => assertLedgerReconstructs(ledger, { c1: 1893 })).not.toThrow();
  });

  it("assertLedgerReconstructs throws when the engine total disagrees", () => {
    const sink = createLedgerSink();
    feedUnit(
      sink,
      "CA",
      "c1",
      [{ votes: 100, demoEP: 0, demoSP: 0, base: 100, reachDelta: 0, fitDelta: 0, restDelta: 0 }],
      { support: 1, swingDelta: 0, spoilerDelta: 0 },
      {
        strengthMultiplier: 1,
        referendum: 0,
        independent: 0,
        lean: 0,
        campaign: 0,
        finalVotes: 100,
      }
    );
    const ledger = assembleNationalLedger(sink, 1);
    expect(() => assertLedgerReconstructs(ledger, { c1: 999 })).toThrow(/drift/);
  });

  it("exposes exactly the nine ordered factor keys", () => {
    const sink = createLedgerSink();
    feedUnit(
      sink,
      "CA",
      "c1",
      [{ votes: 100, demoEP: 0, demoSP: 0, base: 100, reachDelta: 0, fitDelta: 0, restDelta: 0 }],
      { support: 1, swingDelta: 0, spoilerDelta: 0 },
      {
        strengthMultiplier: 1,
        referendum: 0,
        independent: 0,
        lean: 0,
        campaign: 0,
        finalVotes: 100,
      }
    );
    const ledger = assembleNationalLedger(sink, 1);
    const keys = ledger.byCandidateNational[0]!.factors.map((f) => f.key);
    expect(keys).toEqual(FACTOR_ORDER);
    const expected: FactorKey[] = [
      "stateBaseline",
      "candidateFit",
      "reach",
      "turnout",
      "swing",
      "spoiler",
      "nationalEnvironment",
      "campaign",
      "uncertainty",
    ];
    expect(new Set(keys)).toEqual(new Set(expected));
  });
});

describe("factorLedger bucket aggregation", () => {
  it("aggregates per-cell appeal to census buckets and normalizes shares", () => {
    const sink = createLedgerSink();
    // Cell A is entirely white/senior; cell B is entirely nonwhite/young.
    feedUnit(
      sink,
      "CA",
      "c1",
      [
        {
          votes: 300,
          demoEP: -2,
          demoSP: -1,
          base: 300,
          reachDelta: 0,
          fitDelta: 0,
          restDelta: 0,
          bucketWeights: { "race:white": 1, "age:senior": 1 },
        },
        {
          votes: 100,
          demoEP: 2,
          demoSP: 1,
          base: 100,
          reachDelta: 0,
          fitDelta: 0,
          restDelta: 0,
          bucketWeights: { "race:nonwhite": 1, "age:young": 1 },
        },
      ],
      { support: 1, swingDelta: 0, spoilerDelta: 0 },
      {
        strengthMultiplier: 1,
        referendum: 0,
        independent: 0,
        lean: 0,
        campaign: 0,
        finalVotes: 400,
      }
    );
    const ledger = assembleNationalLedger(sink, 1);
    const cand = ledger.byCandidateNational[0]!;
    const buckets = cand!.bucketAppeal!;
    const totalShare = buckets.reduce((s, b) => s + b.appealShare, 0);
    // race:white + age:senior (300 each) + race:nonwhite + age:young (100 each)
    // total appeal-weighted votes = 800; each share is votes/800.
    expect(totalShare).toBeCloseTo(1, 6);
    const white = buckets.find((b) => b.bucket === "race:white")!;
    expect(white.appealShare).toBeCloseTo(300 / 800, 6);
    expect(white.demoEP).toBeCloseTo(-2, 6);
    expect(white.demoSP).toBeCloseTo(-1, 6);
  });

  it("emits no bucket appeal when the substrate provides no bucketWeights", () => {
    const sink = createLedgerSink();
    feedUnit(
      sink,
      "CA",
      "c1",
      [{ votes: 100, demoEP: 0, demoSP: 0, base: 100, reachDelta: 0, fitDelta: 0, restDelta: 0 }],
      { support: 1, swingDelta: 0, spoilerDelta: 0 },
      {
        strengthMultiplier: 1,
        referendum: 0,
        independent: 0,
        lean: 0,
        campaign: 0,
        finalVotes: 100,
      }
    );
    const ledger = assembleNationalLedger(sink, 1);
    expect(ledger.byCandidateNational[0]!.bucketAppeal).toBeUndefined();
  });
});
