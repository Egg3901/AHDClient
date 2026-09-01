import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { bankSolvencyTurnPhase } from "./bankSolvencyTurn.js";
import { CONTAGION_PANIC_TURNS, FLIGHT_RATE_BY_BAND, RUN_FAILURE_COVER_FRACTION } from "./constants.js";

const OPTS = { seed: "solvency-test", playerName: "P", countryId: "US", era: "1953" };
const RNG = rngFromSeed("solvency-rng");

function run(world: ReturnType<typeof createWorld>): void {
  bankSolvencyTurnPhase.run(world, RNG);
}

describe("bankSolvencyTurnPhase — confidence scoring", () => {
  it("a healthy, fully-reserved bank scores green", () => {
    const world = createWorld(OPTS);
    const charter = world.corporations["US-financial"]!.bankCharter!;
    charter.npcDeposits = 100_000;
    charter.cashReserves = 100_000; // well above the 20% requirement
    world.meta.turn = 1;
    run(world);
    expect(charter.warningBand).toBe("green");
    expect(charter.confidence).toBeGreaterThanOrEqual(0.7);
    expect(charter.lastSolvencyTurn).toBe(1);
  });

  it("a thinly-reserved bank with arrears scores lower", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000; // far below the reserve requirement
    charter.totalLoans = 500_000;
    world.bankLoans.push({
      id: "arrears-1",
      bankCorpId: corp.id,
      borrowerType: "corporation",
      borrowerId: "X",
      principal: 200_000,
      outstanding: 200_000,
      ratePercent: 8,
      originatedTurn: 0,
      termTurns: 48,
      status: "arrears",
      arrearsTurns: 3,
      lastProcessedTurn: null,
    });
    world.meta.turn = 1;
    run(world);
    expect(charter.confidence).toBeLessThan(0.7);
  });
});

describe("bankSolvencyTurnPhase — deposit flight", () => {
  it("amber band leaks 10% of NPC deposits back to the household pool", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "amber"; // prior band drives THIS turn's flight
    charter.npcDeposits = 100_000;
    charter.cashReserves = 100_000;
    const bank = world.centralBanks["US"]!;
    const poolBefore = bank.externalBroadMoney;
    world.meta.turn = 1;
    run(world);
    expect(charter.npcDeposits).toBeCloseTo(100_000 * (1 - FLIGHT_RATE_BY_BAND.amber), 2);
    expect(bank.externalBroadMoney).toBeCloseTo(poolBefore + 100_000 * FLIGHT_RATE_BY_BAND.amber, 2);
  });

  it("red band leaks 30%, capped at available cash — and a full drain also fails the run-failure test in the same pass", () => {
    // A red-banded bank whose cash cannot even cover the capped flight (let
    // alone RUN_FAILURE_COVER_FRACTION of what is left) fails in the SAME
    // evaluateOneBank call — flight and failure are not separable turns here,
    // exactly mirroring mainline's evaluateOneBank ordering (flight, then the
    // failure test, in one pass). This test asserts what actually happens:
    // the pool recovers exactly the capped flight amount, and the rest of
    // the (now-uninsured, no fund seeded) NPC book is written off on failure.
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 100_000;
    charter.cashReserves = 5_000; // far less than 30,000 the full flight rate implies
    charter.postedCapital = 5_000;
    const bank = world.centralBanks["US"]!;
    const poolBefore = bank.externalBroadMoney;
    world.meta.turn = 1;
    run(world);
    // Flight capped at the 5,000 cash on hand (not the uncapped 30,000).
    expect(bank.externalBroadMoney).toBeCloseTo(poolBefore + 5_000, 2);
    // Cash fully drained by the capped flight, which then fails the bank
    // (RUN_FAILURE_COVER_FRACTION test: 0 cash < 50% of required liquidity).
    expect(charter.status).toBe("failed");
    expect(charter.npcDeposits).toBe(0);
    expect(charter.cashReserves).toBe(0);
  });

  it("isolated flight (no failure) when post-flight cash still clears the run-failure bar", () => {
    // Small npcDeposits base keeps required liquidity tiny, so even the
    // reduced post-flight cash comfortably clears RUN_FAILURE_COVER_FRACTION.
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 100;
    charter.cashReserves = 1_000_000; // far more than the uncapped 30 flight amount
    world.meta.turn = 1;
    run(world);
    expect(charter.npcDeposits).toBeCloseTo(100 * (1 - FLIGHT_RATE_BY_BAND.red), 6);
    expect(charter.cashReserves).toBeCloseTo(1_000_000 - 100 * FLIGHT_RATE_BY_BAND.red, 6);
    expect(charter.status).toBe("active");
  });
});

describe("bankSolvencyTurnPhase — run failure and depositor resolution", () => {
  it("fails a red-banded bank whose cash falls below RUN_FAILURE_COVER_FRACTION of required liquidity", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    // required liquidity = 0.2*1,000,000 = 200,000; failure needs cash < 0.5*200,000 = 100,000.
    // Flight already drains 30% (300,000) before the failure check, so seed
    // cash well below the post-flight threshold.
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.meta.turn = 1;
    run(world);
    expect(charter.status).toBe("failed");
    expect(charter.failedTurn).toBe(1);
    expect(charter.depositorsResolvedTurn).toBe(1);
    expect(RUN_FAILURE_COVER_FRACTION).toBe(0.5);
  });

  it("player savings survive a bank failure as a pointer flip, not a principal haircut", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.player.savings = 5_000;
    world.player.savingsHolder = corp.id;
    world.meta.turn = 1;
    run(world);
    expect(charter.status).toBe("failed");
    expect(world.player.savingsHolder).toBe("centralBank");
    expect(world.player.savings).toBe(5_000); // principal untouched
  });

  it("insured NPC deposits are paid from bank cash then the insurance fund", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.depositInsurance["US"] = {
      countryId: "US",
      balance: 2_000_000,
      insuredCap: 1_000_000,
      premiumsCollectedLifetime: 0,
      payoutsLifetime: 0,
    };
    const bank = world.centralBanks["US"]!;
    const poolBefore = bank.externalBroadMoney;
    world.meta.turn = 1;
    run(world);
    expect(charter.npcDeposits).toBe(0);
    expect(charter.cashReserves).toBe(0);
    expect(bank.externalBroadMoney).toBeGreaterThan(poolBefore); // pool got the recovered cash back
    expect(world.depositInsurance["US"]!.payoutsLifetime).toBeGreaterThan(0);
  });

  it("is idempotent: does not re-resolve depositors on a second pass", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.meta.turn = 1;
    run(world);
    const resolvedTurn = charter.depositorsResolvedTurn;
    world.meta.turn = 2;
    run(world); // failed charters are excluded from candidates going forward
    expect(charter.depositorsResolvedTurn).toBe(resolvedTurn);
  });
});

describe("bankSolvencyTurnPhase — contagion", () => {
  it("bumps panicTurns on a same-country peer when a bank fails this turn", () => {
    const world = createWorld(OPTS);
    const failing = world.corporations["US-financial"]!;
    // Synthetic second US bank to exercise contagion (solo seeds one bank per
    // country — see npcBanks.ts file doc — so this is a test-only scenario).
    const peer = { ...failing, id: "US-peer-bank", bankCharter: { ...failing.bankCharter! } };
    world.corporations["US-peer-bank"] = peer;
    failing.bankCharter!.warningBand = "red";
    failing.bankCharter!.npcDeposits = 1_000_000;
    failing.bankCharter!.cashReserves = 10_000;
    failing.bankCharter!.postedCapital = 50_000;
    peer.bankCharter!.warningBand = "green";
    peer.bankCharter!.npcDeposits = 50_000;
    peer.bankCharter!.cashReserves = 50_000;
    peer.bankCharter!.panicTurns = 0;
    world.meta.turn = 1;
    run(world);
    expect(peer.bankCharter!.panicTurns).toBe(CONTAGION_PANIC_TURNS);
  });
});

describe("bankSolvencyTurnPhase — determinism", () => {
  it("same seed and mutations produce byte-identical results", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (const world of [a, b]) {
      world.corporations["US-financial"]!.bankCharter!.npcDeposits = 500_000;
      world.corporations["US-financial"]!.bankCharter!.cashReserves = 60_000;
    }
    for (let i = 1; i <= 10; i++) {
      a.meta.turn = i;
      b.meta.turn = i;
      run(a);
      run(b);
    }
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
  });
});
