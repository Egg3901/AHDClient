import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { SaveFile } from "../save.js";
import {
  CENTRAL_BANK_COUNTRY_ANCHORS,
  CHAIR_TERM_TURNS,
  capScrutinyGain,
  computeMonetaryTerm,
  computeNppChairRateStep,
  computeNppChairRateTarget,
  computeScrutinyDelta,
  resolveRecoveryDelta,
  snapToPrimeRateGrid,
  stanceIsCorrect,
} from "./constants.js";

const OPTS = { seed: "cb-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("Taylor rule (nppChairAutoRate.ts)", () => {
  it("neutral alignment: hand-computed target/step", () => {
    // target = 3.0 + 1.0*(5.0-2.0) + 0.5*(2.0-2.0) = 6.0
    const target = computeNppChairRateTarget({
      neutralRate: 3.0,
      inflationRate: 5.0,
      targetInflation: 2.0,
      gdpGrowth: 2.0,
      alignment: null,
    });
    expect(target).toBeCloseTo(6.0, 10);
    // desired = 6.0-3.0=3.0; step=0.5*3.0=1.5; clamped to MAX_RATE_CHANGE_DELTA=0.75
    const step = computeNppChairRateStep({ currentRate: 3.0, targetRate: target, alignment: null });
    expect(step).toBeCloseTo(0.75, 10);
    expect(snapToPrimeRateGrid(3.0 + step)).toBeCloseTo(3.75, 10);
  });

  it("hawk alignment: heavier inflation weight, lower tolerance, faster hikes", () => {
    // effectiveTarget = 2.0 + (-0.5) = 1.5
    // target = 3.0 + 1.0*1.5*(5.0-1.5) + 0.5*0.5*(2.0-2.0) = 3.0 + 5.25 = 8.25
    const target = computeNppChairRateTarget({
      neutralRate: 3.0,
      inflationRate: 5.0,
      targetInflation: 2.0,
      gdpGrowth: 2.0,
      alignment: "hawk",
    });
    expect(target).toBeCloseTo(8.25, 10);
    // desired=5.25; step=0.5*5.25=2.625; *hikeStepMult(1.25)=3.28125; clamped to 0.75
    const step = computeNppChairRateStep({ currentRate: 3.0, targetRate: target, alignment: "hawk" });
    expect(step).toBeCloseTo(0.75, 10);
  });

  it("dove alignment: lighter inflation weight, higher tolerance, faster cuts", () => {
    // effectiveTarget = 2.0 + 0.5 = 2.5
    // target = 3.0 + 1.0*0.6*(0.0-2.5) + 0.5*1.5*(1.0-2.0) = 3.0 - 1.5 - 0.75 = 0.75
    const target = computeNppChairRateTarget({
      neutralRate: 3.0,
      inflationRate: 0.0,
      targetInflation: 2.0,
      gdpGrowth: 1.0,
      alignment: "dove",
    });
    expect(target).toBeCloseTo(0.75, 10);
    // desired=0.75-3.0=-2.25; step=0.5*-2.25=-1.125; *cutStepMult(1.25)=-1.40625 (within [-1.75,0.75])
    const step = computeNppChairRateStep({ currentRate: 3.0, targetRate: target, alignment: "dove" });
    expect(step).toBeCloseTo(-1.40625, 10);
    // snap(3.0 - 1.40625) = snap(1.59375) = 1.5 (nearest quarter-point)
    expect(snapToPrimeRateGrid(3.0 + step)).toBeCloseTo(1.5, 10);
  });

  it("cut clamps at MAX_RATE_CUT_DELTA (1.75)", () => {
    const step = computeNppChairRateStep({ currentRate: 10.0, targetRate: 0.0, alignment: null });
    // desired=-10; step=-5; clamped to -1.75
    expect(step).toBeCloseTo(-1.75, 10);
  });
});

describe("chair scrutiny/credibility (centralBankChairTurn.ts + credibility.ts)", () => {
  it("positive miss (inflation hot, growth weak) raises scrutiny uncapped below the ceiling", () => {
    // inflationDelta=(5-2)*0.5=1.5; growthDelta=(2-1)*0.5=0.5; total=2.0 (no dampening, positive)
    const delta = computeScrutinyDelta(5.0, 1.0, 0, 2.0);
    expect(delta).toBeCloseTo(2.0, 10);
    expect(capScrutinyGain(delta)).toBeCloseTo(2.0, 10);
  });

  it("scrutiny gain caps at MAX_SCRUTINY_GAIN_PER_TURN (8)", () => {
    // inflationDelta=(20-2)*0.5=9; growthDelta=(2-(-10))*0.5=6; total=15 -> capped to 8
    const delta = computeScrutinyDelta(20.0, -10.0, 0, 2.0);
    expect(delta).toBeCloseTo(15.0, 10);
    expect(capScrutinyGain(delta)).toBe(8);
  });

  it("improvement (negative delta) is dampened by current infamy, never capped", () => {
    // inflationDelta=(1-2)*0.5=-0.5; growthDelta=(2-3)*0.5=-0.5; total=-1.0
    // dampener = max(0.1, 1-50/150) = 2/3; total *= 2/3
    const delta = computeScrutinyDelta(1.0, 3.0, 50, 2.0);
    expect(delta).toBeCloseTo(-1.0 * (2 / 3), 10);
    expect(capScrutinyGain(delta)).toBeCloseTo(delta, 10);
  });

  it("resolve streak matures at RESOLVE_TURNS_REQUIRED (3) and pays RESOLVE_SCRUTINY_RELIEF (6)", () => {
    expect(resolveRecoveryDelta({ correctStance: true, previousStreak: 0 })).toEqual({ resolveStreak: 1, relief: 0 });
    expect(resolveRecoveryDelta({ correctStance: true, previousStreak: 1 })).toEqual({ resolveStreak: 2, relief: 0 });
    expect(resolveRecoveryDelta({ correctStance: true, previousStreak: 2 })).toEqual({ resolveStreak: 0, relief: 6 });
    expect(resolveRecoveryDelta({ correctStance: false, previousStreak: 5 })).toEqual({ resolveStreak: 0, relief: 0 });
  });

  it("stanceIsCorrect matches the corridor verdict against the inflation zone", () => {
    // Hot inflation (>target+0.5) wants restrictive.
    expect(stanceIsCorrect(6.0, 5.0, 2.0)).toBe(true); // delta=1.0 -> restrictive, correct
    expect(stanceIsCorrect(5.2, 5.0, 2.0)).toBe(false); // delta=0.2 -> neutral, wanted restrictive
    // Cold inflation (<target-0.5) wants accommodative.
    expect(stanceIsCorrect(-0.5, 0.5, 2.0)).toBe(true); // delta=-1.0 -> accommodative, correct
    // In-band inflation wants neutral.
    expect(stanceIsCorrect(2.3, 2.0, 2.0)).toBe(true); // delta=0.3 -> neutral, correct
  });
});

describe("monetary term (inflation.ts MONETARY_COEFF_* + lag)", () => {
  it("no history falls back to the spot rate", () => {
    // effectiveRate=5 (spot); rateGap=3-5=-2 (below neutral -> COEFF_HIGH=1.2); raw=-2.4
    // scrutiny=0 -> transmissionMultiplier=1.0
    const term = computeMonetaryTerm(5.0, undefined, 3.0, 0);
    expect(term).toBeCloseTo(-2.4, 10);
  });

  it("high scrutiny dampens the term toward the transmission floor (0.6)", () => {
    // transmissionMultiplier(100) = 0.6 + 0.4*0 = 0.6
    const term = computeMonetaryTerm(5.0, undefined, 3.0, 100);
    expect(term).toBeCloseTo(-2.4 * 0.6, 10);
  });

  it("trailing history blends 30% spot / 70% weighted average", () => {
    // window=[4,4,5] (n=3); weights 2/12,1/12,1/12; weightedSum=17/12; totalWeight=4/12
    // trailingAvg=17/4=4.25; effective=0.3*5+0.7*4.25=4.475
    // rateGap=3-4.475=-1.475 (below neutral -> *1.2) = -1.77; scrutiny 0 -> x1.0
    const term = computeMonetaryTerm(5.0, [4, 4, 5], 3.0, 0);
    expect(term).toBeCloseTo(-1.77, 10);
  });
});

describe("central bank world state (W3)", () => {
  it("seeds one bank per playable country from the authored 1953 anchors", () => {
    const world = createWorld(OPTS);
    for (const [countryId, anchor] of Object.entries(CENTRAL_BANK_COUNTRY_ANCHORS)) {
      const bank = world.centralBanks[countryId];
      expect(bank, `expected a bank for ${countryId}`).toBeDefined();
      expect(bank!.primeRate).toBe(anchor.defaultPrimeRate);
      expect(bank!.chairMode).toBe("npp");
      expect(bank!.chairAlignment).toBeNull();
      expect(bank!.chairInfamy).toBe(0);
      expect(bank!.chairTermExpiresAtTurn).toBe(CHAIR_TERM_TURNS);
    }
  });

  it("advancing turns moves the prime rate via the autonomous Taylor rule and appends history", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 10; i++) advanceTurn(world);
    for (const bank of Object.values(world.centralBanks)) {
      expect(bank.interestRateHistory.length).toBe(10);
      expect(bank.interestRateHistory[bank.interestRateHistory.length - 1]!.turn).toBe(world.meta.turn);
    }
  });

  it("chair term rotates at CHAIR_TERM_TURNS: alignment flips, scrutiny partially retained", () => {
    const world = createWorld(OPTS);
    const bank = world.centralBanks["US"]!;
    bank.chairInfamy = 40;
    bank.chairAlignment = "hawk";
    // Force expiry on the very next turn.
    bank.chairTermExpiresAtTurn = world.meta.turn + 1;
    advanceTurn(world);
    const rotated = world.centralBanks["US"]!;
    expect(rotated.chairAlignment).toBe("dove");
    // Scrutiny retained fraction (0.75) applies to the PRE-turn infamy (40); the
    // chair-turn phase runs first and may itself adjust infamy before rotation,
    // so assert monotonic shrinkage from the forced 40 rather than an exact value.
    expect(rotated.chairInfamy).toBeLessThan(40);
    expect(rotated.chairTermExpiresAtTurn).toBe(world.meta.turn + CHAIR_TERM_TURNS);
  });
});

describe("determinism (W3)", () => {
  it("same seed, 50 turns, identical central bank state", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.centralBanks)).toBe(JSON.stringify(b.centralBanks));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Sanity: the cluster actually does something over 50 turns (not a silent no-op).
    const anyMoved = Object.values(a.centralBanks).some((bank) => bank.lastRateChangeTurn !== null);
    expect(anyMoved).toBe(true);
  });
});

describe("migration (v<17 -> v17)", () => {
  it("backfills centralBanks for playable countries on an old save", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, "2026-01-01T00:00:00.000Z")) as SaveFile;
    raw.schemaVersion = 15;
    (raw.world.meta as unknown as Record<string, unknown>)["schemaVersion"] = 15;
    delete (raw.world as unknown as Record<string, unknown>)["centralBanks"];

    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(21);
    for (const [countryId, anchor] of Object.entries(CENTRAL_BANK_COUNTRY_ANCHORS)) {
      const bank = migrated.centralBanks[countryId];
      expect(bank, `expected a migrated bank for ${countryId}`).toBeDefined();
      expect(bank!.primeRate).toBe(anchor.defaultPrimeRate);
      expect(bank!.chairMode).toBe("npp");
      expect(bank!.chairTermExpiresAtTurn).toBe(migrated.meta.turn + CHAIR_TERM_TURNS);
    }
  });

  it("is a no-op for a save that already carries centralBanks", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 5; i++) advanceTurn(world);
    const raw = serializeSave(world, "2026-01-01T00:00:00.000Z");
    const reloaded = deserializeSave(raw);
    expect(JSON.stringify(reloaded.centralBanks)).toBe(JSON.stringify(world.centralBanks));
  });
});
