/**
 * W28 (enactment depth) + W32 (cold war / world politics) — goldens,
 * wiring, determinism, and migration.
 *
 * Every golden cites its mainline source (file:line as verified against
 * <mainline-checkout> at port time); PORT-STUB blockers are named in the
 * per-module file docs (policyEffects/*, ministerialOrders/*, coldWar/*,
 * wars/*, alignment/*, internationalOrgs/* — search for "B0"/"B1" prefixed
 * blocker ids).
 */
import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "./world.js";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import {
  applyHalfLifeDecay,
  applyPolicyDecay,
  calculatePolicyContribution,
  effectiveIntensity,
  getFederalMultiplier,
  getPolicyDecayFactor,
  MAX_EFFECT_PER_LAW,
  metricRangeScale,
  nationalDecayScope,
  NATIONAL_LAW_DECAY_MULTIPLIER,
  POLICY_TAU,
  UK_FEDERAL_MULTIPLIER,
  US_FEDERAL_MULTIPLIER,
} from "./policyEffects/constants.js";
import { computeMetricTarget, runPolicyEffects } from "./policyEffects/phases.js";
import {
  CABINET_EFFECT_STRENGTH,
  clampCabinetModifier,
  MAX_PER_METRIC_MODIFIER_PER_TURN,
  modifierSpanScale,
} from "./ministerialOrders/constants.js";
import { runMinisterialOrders } from "./ministerialOrders/phases.js";
import {
  clampTension,
  stepTension,
  tensionBand,
  tensionFloor,
  tensionPressureBreakdown,
  warAcclimationMultiplier,
  warPressures,
} from "./coldWar/tension.js";
import { TENSION_BASELINE, TENSION_RELAXATION } from "./coldWar/constants.js";
import {
  accrueWarheads,
  deterrenceScore,
  NUCLEAR_CAPABLE,
  NUCLEAR_NODES,
  productionCapFor,
  warheadUnitCost,
} from "./coldWar/nuclear.js";
import { contestRank, mostContested, normalizeShares, tugOfWarCandidate } from "./alignment/alignment.js";
import { ALIGNMENT_GATES, CRISIS_WINDOW_TURNS } from "./alignment/constants.js";
import { gdpMargin, occupationShift, stepConflictControl, TRUCE_TURNS } from "./wars/settlement.js";
import { seedInternationalOrgs } from "./internationalOrgs/seed.js";
import { applyBillEffects } from "./legislation/billLifecycle.js";
import { computeActiveShiftsForCountry, runDemographicEffects } from "./demographics/demographicEffects.js";
import type { Bill } from "./legislation/types.js";
import type { CatalogEntry } from "./legislation/catalog.js";

function makeBill(overrides: Partial<Bill> & Pick<Bill, "id" | "countryId">): Bill {
  return {
    title: "Test Bill",
    summary: "",
    category: "economy",
    provisions: [],
    originChamber: "house",
    currentChamber: "house",
    status: "enrolled",
    sponsorId: null,
    sponsorName: "NPC",
    sponsorPartyId: null,
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: 0,
    filibusterInvocations: [],
    updatedAtTurn: 0,
    ...overrides,
  };
}

describe("W28 policyEffects/constants (source: shared/constants/formulas.ts)", () => {
  it("getFederalMultiplier: US 1/50, UK 1/12, default (incl. RU) falls back to 1/50 — NOT 1", () => {
    expect(US_FEDERAL_MULTIPLIER).toBeCloseTo(0.02, 10);
    expect(UK_FEDERAL_MULTIPLIER).toBeCloseTo(1 / 12, 10);
    expect(getFederalMultiplier("US")).toBeCloseTo(0.02, 10);
    expect(getFederalMultiplier("UK")).toBeCloseTo(1 / 12, 10);
    // formulas.ts getFederalMultiplier: `FEDERAL_MULTIPLIER_BY_COUNTRY[countryId] ?? FEDERAL_MULTIPLIER`
    // — the default IS the federal (1/50) split, not "no split" (1).
    expect(getFederalMultiplier("RU")).toBeCloseTo(0.02, 10);
    expect(getFederalMultiplier("DD")).toBeCloseTo(0.02, 10);
  });

  it("nationalDecayScope: diluted (<1) scope normalizes to 0.21; full (>=1) scope passes through", () => {
    expect(nationalDecayScope(getFederalMultiplier("US"))).toBe(NATIONAL_LAW_DECAY_MULTIPLIER);
    expect(nationalDecayScope(1)).toBe(1);
  });

  it("applyPolicyDecay: exponential approach at rate 1-e^(-1/tau) (source: formulas.ts applyPolicyDecay, POLICY_TAU=139)", () => {
    expect(POLICY_TAU).toBe(139);
    const factor = 1 - Math.exp(-1 / POLICY_TAU);
    expect(getPolicyDecayFactor()).toBeCloseTo(factor, 12);
    expect(applyPolicyDecay(50, 70, POLICY_TAU)).toBeCloseTo(50 + 20 * factor, 10);
    expect(applyPolicyDecay(50, 50, POLICY_TAU)).toBe(50);
    // tau=1: decayFactor = 1 - 1/e
    expect(applyPolicyDecay(0, 100, 1)).toBeCloseTo(100 * (1 - Math.exp(-1)), 10);
  });

  it("applyHalfLifeDecay: initial*0.5^(turnsSince/halfLife) (source: formulas.ts applyHalfLifeDecay)", () => {
    expect(applyHalfLifeDecay(100, 52, 52)).toBeCloseTo(50, 10);
    expect(applyHalfLifeDecay(100, 0, 52)).toBe(100);
    expect(applyHalfLifeDecay(100, 104, 52)).toBeCloseTo(25, 10);
  });

  it("effectiveIntensity: sign-preserving gamma=0.8 reshape, exact at 0/+-1 (source: formulas.ts POLICY_INTENSITY_GAMMA)", () => {
    expect(effectiveIntensity(1)).toBe(1);
    expect(effectiveIntensity(-1)).toBe(-1);
    expect(effectiveIntensity(0)).toBe(0);
    expect(effectiveIntensity(0.5)).toBeCloseTo(0.5 ** 0.8, 10);
  });

  it("metricRangeScale: 1.0 for span<=100, |reference|/100 for larger spans (source: formulas.ts metricRangeScale)", () => {
    expect(metricRangeScale(0, 100, 50)).toBe(1);
    expect(metricRangeScale(0, 10_000_000, 40000)).toBeCloseTo(400, 10);
  });

  it("calculatePolicyContribution: normalizedStrength * weight * MAX_EFFECT_PER_LAW * scope * sign (source: formulas.ts)", () => {
    expect(MAX_EFFECT_PER_LAW).toBe(12);
    expect(calculatePolicyContribution(3, 1, 1, true)).toBeCloseTo(12, 10);
    expect(calculatePolicyContribution(3, 1, 1, false)).toBeCloseTo(-12, 10);
    expect(calculatePolicyContribution(3, 0.5, 1, true)).toBeCloseTo(6, 10);
  });
});

describe("W28 computeMetricTarget (source: src/lib/policyEffects.ts calculateMetricTarget, lines 157-282)", () => {
  it("national-scope US policy: contribution = 12 * NATIONAL_LAW_DECAY_MULTIPLIER (0.21)", () => {
    const t = computeMetricTarget(50, [{ effectDirection: 1, countryId: "US", scope: "national" }], true);
    expect(t).toBeCloseTo(50 + 12 * NATIONAL_LAW_DECAY_MULTIPLIER, 10); // 52.52
    const tDown = computeMetricTarget(50, [{ effectDirection: 1, countryId: "US", scope: "national" }], false);
    expect(tDown).toBeCloseTo(50 - 12 * NATIONAL_LAW_DECAY_MULTIPLIER, 10); // 47.48
  });

  it("regional-scope policy keeps full (scope=1) strength: contribution = 12", () => {
    const t = computeMetricTarget(50, [{ effectDirection: 1, countryId: "US", scope: "regional" }], true);
    expect(t).toBeCloseTo(62, 10);
  });

  it("effectDirection 0 contributes nothing; opposing-direction policies partially cancel", () => {
    expect(computeMetricTarget(50, [{ effectDirection: 0, countryId: "US", scope: "national" }], true)).toBe(50);
    const t = computeMetricTarget(
      50,
      [
        { effectDirection: 1, countryId: "US", scope: "regional" },
        { effectDirection: -1, countryId: "US", scope: "regional" },
      ],
      true,
    );
    expect(t).toBeCloseTo(50, 10);
  });

  it("range clamps the target to [min,max]", () => {
    const t = computeMetricTarget(95, [{ effectDirection: 1, countryId: "US", scope: "regional" }], true, { min: 0, max: 100 });
    expect(t).toBe(100);
  });
});

describe("W28 ministerialOrders/constants (source: src/lib/turn/ministerialOrderProcessing.ts)", () => {
  it("MAX_PER_METRIC_MODIFIER_PER_TURN=0.08 and CABINET_EFFECT_STRENGTH=1.25", () => {
    expect(MAX_PER_METRIC_MODIFIER_PER_TURN).toBe(0.08);
    expect(CABINET_EFFECT_STRENGTH).toBe(1.25);
  });

  it("clampCabinetModifier: boost by 1.25 then cap at +-0.08", () => {
    expect(clampCabinetModifier(0.08)).toBeCloseTo(0.08, 10); // 0.08*1.25=0.1 -> capped
    expect(clampCabinetModifier(0.05)).toBeCloseTo(0.0625, 10); // 0.05*1.25=0.0625 -> under cap
    expect(clampCabinetModifier(0)).toBe(0);
    expect(clampCabinetModifier(-0.08)).toBeCloseTo(-0.08, 10);
  });

  it("modifierSpanScale: large-range metrics scale up, unknown/small-range metrics scale 1 (source: metricScoring.ts THRESHOLDS)", () => {
    expect(modifierSpanScale("economic.gdpGrowth")).toBe(1); // span 8 -> max(1, 0.08) = 1
    expect(modifierSpanScale("economic.medianIncome")).toBeCloseTo(750, 10); // span 75000 -> 750
    expect(modifierSpanScale("unknown.metric")).toBe(1);
  });
});

describe("W28 integration: billEnactment -> policyLedger -> policyEffects/ministerialOrders/demographics", () => {
  it("applyBillEffects writes a policyLedger entry keyed by bill id", () => {
    const world = createWorld({ seed: "w28-ledger", playerName: "P", countryId: "US", era: "1953" });
    const bill = makeBill({ id: "bill-1", countryId: "US", legislationTypeId: "us.economy.workerSecurity.primary", effectDirection: 1, enactedLevel: 2 });
    applyBillEffects(world, bill);
    expect(world.policyLedger["bill-1"]).toEqual({
      id: "bill-1",
      legislationTypeId: "us.economy.workerSecurity.primary",
      policyOptionId: "2",
      effectDirection: 1,
      scope: "national",
      countryId: "US",
      enactedTurn: 0,
      enactedAt: world.meta.date,
    });
  });

  it("budget gate fires triggerDebtCeilingCrisis into enactmentGates when debt exceeds ceiling (source: src/lib/budget/debt.ts triggerDebtCeilingCrisis)", () => {
    const world = createWorld({ seed: "w28-debt", playerName: "P", countryId: "US", era: "1953" });
    world.budgets["US"]!.debt.principal = world.budgets["US"]!.debt.ceiling + 1;
    const bill = makeBill({ id: "bill-2", countryId: "US" });
    applyBillEffects(world, bill);
    expect(world.enactmentGates.debtCeilingCrisis["US"]).toEqual({ active: true, triggeredAtTurn: 0, turnsElapsed: 0, resolved: false });
  });

  it("currency_union provision joins a member and activates the union once every member has joined (source: src/lib/billEnactment.ts applyEuroAdoptionProvision, generalized)", () => {
    const world = createWorld({ seed: "w28-union", playerName: "P", countryId: "US", era: "1953" });
    world.currencyUnions["TEST_UNION"] = { id: "TEST_UNION", members: ["US", "UK"], joined: [], active: false };
    applyBillEffects(world, makeBill({ id: "bill-3a", countryId: "US", provisions: [{ type: "currency_union", legislationTypeId: "x", effectDirection: 1, currencyUnionId: "TEST_UNION" }] }));
    expect(world.currencyUnions["TEST_UNION"]!.active).toBe(false);
    expect(world.currencyUnions["TEST_UNION"]!.joined).toEqual(["US"]);
    applyBillEffects(world, makeBill({ id: "bill-3b", countryId: "UK", provisions: [{ type: "currency_union", legislationTypeId: "x", effectDirection: 1, currencyUnionId: "TEST_UNION" }] }));
    expect(world.currencyUnions["TEST_UNION"]!.active).toBe(true);
  });

  it("runPolicyEffects decays a metric toward the target derived from active policyLedger entries", () => {
    const world = createWorld({ seed: "w28-effects", playerName: "P", countryId: "US", era: "1953" });
    applyBillEffects(world, makeBill({ id: "bill-4", countryId: "US", legislationTypeId: "us.economy.workerSecurity.primary", effectDirection: 1 }));
    const before = world.nationalMetrics["US"]?.["economy.workerSecurity"]?.value ?? 50;
    runPolicyEffects(world);
    const after = world.nationalMetrics["US"]!["economy.workerSecurity"]!.value;
    expect(after).toBeGreaterThan(before); // higherBetter defaults true, effectDirection +1 pulls target up
  });

  it("runMinisterialOrders caps combined active order modifiers per metric", () => {
    const world = createWorld({ seed: "w28-orders", playerName: "P", countryId: "US", era: "1953" });
    world.ministerialOrders.push(
      { id: "o1", countryId: "US", characterId: "player", active: true, effects: [{ metric: "economic.gdpGrowth", modifier: 0.5, scope: "national" }], issuedAtTurn: 0 },
      { id: "o2", countryId: "US", characterId: "npc-1", active: false, effects: [{ metric: "economic.gdpGrowth", modifier: 99, scope: "national" }], issuedAtTurn: 0 },
    );
    runMinisterialOrders(world);
    // combined active total = 0.5 (inactive order excluded) -> clampCabinetModifier(0.5) = 0.08 cap -> * modifierSpanScale(1) = 0.08
    expect(world.nationalMetrics["US"]!["economic.gdpGrowth"]!.value).toBeCloseTo(50.08, 10);
  });

  it("demographicEffects wires an active policy's demographicEffects[] via computeActiveShiftsForCountry (B01: no real catalog entry authors this yet, so the lookup is injected)", () => {
    const world = createWorld({ seed: "w28-demo", playerName: "P", countryId: "US", era: "1953" });
    const stateId = Object.keys(world.stateDemographics).find((id) => world.stateDemographics[id]!.countryId === "US")!;
    const groupId = Object.keys(world.stateDemographics[stateId]!.groups)[0]!;
    world.policyLedger["law-1"] = { id: "law-1", legislationTypeId: "synthetic.law", policyOptionId: "1", effectDirection: 1, scope: "regional", countryId: "US", enactedTurn: 0, enactedAt: world.meta.date };
    const synthetic: CatalogEntry = {
      id: "synthetic.law", countryId: "US", kind: "primary", title: "t", description: "d", category: "test",
      allowedScope: "regional", targets: [], status: "available",
      demographicEffects: [{ groupId, target: "population", direction: 1 }],
    };
    const lookup = (id: string) => (id === "synthetic.law" ? synthetic : null);
    const shifts = computeActiveShiftsForCountry(world, "US", lookup);
    expect(shifts.get(groupId)?.population).toBeCloseTo(0.1, 10); // scope=regional -> multiplier 1; strength 1 * SHIFT_RATE_PER_TURN 0.1

    const before = world.stateDemographics[stateId]!.groups[groupId]!.population;
    runDemographicEffects(world, lookup);
    expect(world.stateDemographics[stateId]!.groups[groupId]!.population).toBeCloseTo(before + 0.1, 6);
  });
});

describe("W32 coldWar/tension (source: src/lib/coldwar/tension.ts)", () => {
  it("TENSION_BASELINE=12, TENSION_RELAXATION=0.08", () => {
    expect(TENSION_BASELINE).toBe(12);
    expect(TENSION_RELAXATION).toBe(0.08);
  });

  it("tensionBand thresholds: <15 DETENTE, <35 CALM, <60 ELEVATED, <80 CRISIS, else BRINK", () => {
    expect(tensionBand(10)).toBe("DETENTE");
    expect(tensionBand(20)).toBe("CALM");
    expect(tensionBand(40)).toBe("ELEVATED");
    expect(tensionBand(65)).toBe("CRISIS");
    expect(tensionBand(85)).toBe("BRINK");
  });

  it("clampTension rounds to 0.1 and clamps [0,100]", () => {
    expect(clampTension(12.345)).toBe(12.3);
    expect(clampTension(-5)).toBe(0);
    expect(clampTension(150)).toBe(100);
  });

  it("tensionPressureBreakdown: baseline + escalation + crises + arsenal + wars (hand-verified)", () => {
    const p = { escalationLevel: 2, activeCrises: 1, totalWarheads: 100, nuclearWarIntensity: 0, nuclearWarCount: 0, nuclearWarMinimumPressure: 0, otherWarIntensity: 0 };
    // escalation=min(30,8)=8, activeCrises=min(12,3)=3, arsenal=min(18,sqrt(100)*1.2=12)=12, wars=min(45,0)=0
    expect(tensionPressureBreakdown(p)).toEqual({ baseline: 12, escalation: 8, activeCrises: 3, arsenal: 12, wars: 0, floor: 35 });
    expect(tensionFloor(p)).toBe(35);
  });

  it("stepTension relaxes 8% of the gap toward the floor per turn, snaps up to floor from below", () => {
    const p = { escalationLevel: 0, activeCrises: 0, totalWarheads: 0, nuclearWarIntensity: 0, nuclearWarCount: 0, nuclearWarMinimumPressure: 0, otherWarIntensity: 0 };
    expect(tensionFloor(p)).toBe(12);
    expect(stepTension(20, p)).toBeCloseTo(19.4, 1); // 20 + (12-20)*0.08 = 19.36 -> round 19.4
    expect(stepTension(12, p)).toBe(12);
    expect(stepTension(10, p)).toBe(12);
  });

  it("warAcclimationMultiplier: hot wars never acclimate; limited wars ease after a 12-turn grace, capped at 40% reduction", () => {
    expect(warAcclimationMultiplier({ intensity: 90 }, 100)).toBe(1);
    expect(warAcclimationMultiplier({ intensity: 50, limitedWarSinceTurn: 10 }, 15)).toBe(1); // age 5 < grace 12
    expect(warAcclimationMultiplier({ intensity: 50, limitedWarSinceTurn: 10 }, 60)).toBeCloseTo(0.62, 10); // age 50, acclimationTurns 38, coolness 1, ageReduction .38 -> 1-.38=0.62
  });

  it("warPressures folds nuclear vs conventional wars into the two intensity sums", () => {
    const nuclearCountries = new Set(["US", "RU"]);
    const summary = warPressures([{ sideACountries: ["US"], sideBCountries: ["RU"], intensity: 40 }, { sideACountries: ["UK"], sideBCountries: ["DD"], intensity: 20 }], nuclearCountries);
    expect(summary.nuclearWarCount).toBe(1);
    expect(summary.nuclearWarIntensity).toBeCloseTo(40, 10);
    expect(summary.otherWarIntensity).toBeCloseTo(20, 10);
  });
});

describe("W32 coldWar/nuclear (source: src/lib/military/nuclearProgram.ts)", () => {
  it("NUCLEAR_NODES: 8 entries, 4 device + 4 delivery", () => {
    expect(NUCLEAR_NODES.length).toBe(8);
    expect(NUCLEAR_NODES.filter((n) => n.kind === "device").length).toBe(4);
    expect(NUCLEAR_NODES.filter((n) => n.kind === "delivery").length).toBe(4);
  });

  it("NUCLEAR_CAPABLE = US, RU, UK", () => {
    expect([...NUCLEAR_CAPABLE].sort()).toEqual(["RU", "UK", "US"]);
  });

  it("productionCapFor: fission 2, +boosted 4, +thermo 6, +mirv(+icbm) 8", () => {
    expect(productionCapFor({})).toBe(0);
    expect(productionCapFor({ "device-fission": 0 })).toBe(2);
    expect(productionCapFor({ "device-fission": 0, "device-boosted": 1 })).toBe(4);
    expect(productionCapFor({ "device-fission": 0, "device-boosted": 1, "device-thermo": 2 })).toBe(6);
    expect(productionCapFor({ "device-fission": 0, "device-boosted": 1, "device-thermo": 2, "delivery-icbm": 3, "device-mirv": 4 })).toBe(8);
  });

  it("warheadUnitCost: 800 - (cap-2)*75, so 800 at fission, 650 once boosted", () => {
    expect(warheadUnitCost({})).toBe(0);
    expect(warheadUnitCost({ "device-fission": 0 })).toBe(800);
    expect(warheadUnitCost({ "device-fission": 0, "device-boosted": 1 })).toBe(650);
  });

  it("accrueWarheads: cap first, then affordability", () => {
    const adopted = { "device-fission": 0 };
    expect(accrueWarheads(adopted, 5, 10_000)).toEqual({ built: 2, cost: 1600 });
    expect(accrueWarheads(adopted, 1, 500)).toEqual({ built: 0, cost: 0 });
  });

  it("deterrenceScore: 0 with no delivery leg even with warheads; positive once a leg is adopted", () => {
    expect(deterrenceScore({ "device-fission": 0 }, 100)).toBe(0);
    expect(deterrenceScore({ "device-fission": 0, "delivery-bombers": 1 }, 100)).toBe(55); // legFactor 0.55, sqrt(100)*10*0.55=55
  });
});

describe("W32 alignment (source: src/lib/alignment/crisis.ts, normalize.ts)", () => {
  it("contestRank: second*2 - gap", () => {
    expect(contestRank({ shares: { WEST: 40, EAST: 35 }, nonAligned: 25 }, ["WEST", "EAST"])).toBe(65);
  });

  it("mostContested picks the highest-rank row", () => {
    const rows = [
      { entityId: "a", shares: { shares: { WEST: 90, EAST: 5 }, nonAligned: 5 } },
      { entityId: "b", shares: { shares: { WEST: 40, EAST: 35 }, nonAligned: 25 } },
    ];
    expect(mostContested(rows, ["WEST", "EAST"])).toBe("b");
  });

  it("tugOfWarCandidate: second >= 25 AND gap <= ALIGNMENT_GATES.nonAligned (20)", () => {
    expect(ALIGNMENT_GATES.nonAligned).toBe(20);
    expect(tugOfWarCandidate({ shares: { WEST: 40, EAST: 35 }, nonAligned: 25 }, ["WEST", "EAST"])).toBe(true);
    expect(tugOfWarCandidate({ shares: { WEST: 80, EAST: 10 }, nonAligned: 10 }, ["WEST", "EAST"])).toBe(false); // second<25
    expect(tugOfWarCandidate({ shares: { WEST: 70, EAST: 30 }, nonAligned: 0 }, ["WEST", "EAST"])).toBe(false); // gap 40 > 20
  });

  it("CRISIS_WINDOW_TURNS = 12", () => {
    expect(CRISIS_WINDOW_TURNS).toBe(12);
  });

  it("normalizeShares preserves the sum(shares)+nonAligned===100 invariant, scaling proportionally when over 100", () => {
    const under = normalizeShares({ WEST: 40, EAST: 30 }, ["WEST", "EAST"]);
    expect((under.shares.WEST ?? 0) + (under.shares.EAST ?? 0) + under.nonAligned).toBeCloseTo(100, 6);
    expect(under.nonAligned).toBeCloseTo(30, 6);

    const over = normalizeShares({ WEST: 80, EAST: 60 }, ["WEST", "EAST"]);
    expect((over.shares.WEST ?? 0) + (over.shares.EAST ?? 0) + over.nonAligned).toBeCloseTo(100, 6);
    expect(over.nonAligned).toBe(0);
    expect(over.shares.WEST!).toBeGreaterThan(over.shares.EAST!); // ordering preserved
  });
});

describe("W32 wars/settlement (AHDClient-native — see wars/types.ts, wars/settlement.ts file docs)", () => {
  it("occupationShift: verbatim port of src/lib/military/occupation.ts", () => {
    expect(occupationShift(50, "B", 45, false)).toBeCloseTo(55, 10); // decisive margin -> full maxShift(5)
    expect(occupationShift(50, "A", 45, false)).toBeCloseTo(45, 10);
    expect(occupationShift(50, "B", 22.5, false)).toBeCloseTo(52.5, 10); // half margin -> half shift
    expect(occupationShift(50, "B", 45, true)).toBeCloseTo(53.5, 10); // retreatYield 0.7 -> shift 3.5
    expect(occupationShift(2, "A", 45, false)).toBe(0); // clamps at 0
  });

  it("gdpMargin and stepConflictControl move control toward the stronger side, deterministically", () => {
    expect(gdpMargin(50, 150)).toBeCloseTo(50, 10); // B twice A -> +50 margin
    const conflict = { id: "c1", type: "interstate" as const, status: "active" as const, sideA: { countries: ["A"] }, sideB: { countries: ["B"] }, intensity: 50, control: 50, startedAtTurn: 0 };
    const result = stepConflictControl(conflict, 50, 150);
    expect(result.winner).toBe("B");
    expect(result.control).toBeGreaterThan(50);
  });

  it("TRUCE_TURNS = 240 (source: db/types/peaceOffer.ts)", () => {
    expect(TRUCE_TURNS).toBe(240);
  });
});

describe("W32 internationalOrgs seeding (historical, not invented — see internationalOrgs/seed.ts file doc)", () => {
  it("seeds UN and NATO restricted to known country ids, DD absent from both", () => {
    const orgs = seedInternationalOrgs(["US", "UK", "RU", "DD"]);
    expect(orgs["UN"]!.members.sort()).toEqual(["RU", "UK", "US"]);
    expect(orgs["NATO"]!.members.sort()).toEqual(["UK", "US"]);
    expect(orgs["UN"]!.members).not.toContain("DD");
    expect(orgs["NATO"]!.members).not.toContain("DD");
  });
});

describe("W32 world seeding + determinism", () => {
  it("createWorld seeds coldWarTension, nuclearPrograms for NUCLEAR_CAPABLE playables, alignments (WEST/EAST), internationalOrgs", () => {
    const world = createWorld({ seed: "w32-seed", playerName: "P", countryId: "US", era: "1953" });
    expect(world.coldWarTension).toEqual({ value: 12, pressureFloor: 12, updatedTurn: 0, events: [] });
    expect(world.nuclearPrograms["US"]).toEqual({ countryId: "US", adopted: {}, warheads: 0, productionRate: 0 });
    expect(world.nuclearPrograms["RU"]).toBeDefined();
    expect(world.nuclearPrograms["UK"]).toBeDefined();
    expect(world.nuclearPrograms["DD"]).toBeUndefined(); // not nuclear-capable
    expect(world.alignments["US"]!.shares.WEST).toBe(100);
    expect(world.alignments["RU"]!.shares.EAST).toBe(100);
    expect(world.internationalOrgs["UN"]).toBeDefined();
  });

  it("wars/alignment/coldWar/settlement are fully deterministic across two identical seeds", () => {
    const w1 = createWorld({ seed: "w32-det", playerName: "P", countryId: "US", era: "1953" });
    const w2 = createWorld({ seed: "w32-det", playerName: "P", countryId: "US", era: "1953" });
    for (const w of [w1, w2]) {
      w.conflicts.push({ id: "war-1", type: "interstate", status: "active", sideA: { countries: ["US"] }, sideB: { countries: ["RU"] }, intensity: 40, startedAtTurn: 0 });
    }
    for (let i = 0; i < 10; i++) {
      advanceTurn(w1);
      advanceTurn(w2);
    }
    expect(JSON.stringify(w1.conflicts)).toBe(JSON.stringify(w2.conflicts));
    expect(JSON.stringify(w1.coldWarTension)).toBe(JSON.stringify(w2.coldWarTension));
    expect(JSON.stringify(w1.alignments)).toBe(JSON.stringify(w2.alignments));
    expect(JSON.stringify(w1.settlements)).toBe(JSON.stringify(w2.settlements));
    expect(JSON.stringify(w1.internationalOrgs)).toBe(JSON.stringify(w2.internationalOrgs));
    expect(JSON.stringify(w1.nuclearPrograms)).toBe(JSON.stringify(w2.nuclearPrograms));
  });
});

describe("save migration v33 -> v37 (W28 + W32 batch)", () => {
  it("backfills every new field on a pre-batch save and is itself deterministic", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(37);
    const world = createWorld({ seed: "mig-w28w32", playerName: "P", countryId: "US", era: "1953" });
    const stripped = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    for (const key of ["policyLedger", "ministerialOrders", "enactmentGates", "currencyUnions", "coldWarTension", "nuclearPrograms", "conflicts", "alignments", "settlements", "internationalOrgs"]) {
      delete stripped[key];
    }
    (stripped["meta"] as Record<string, unknown>)["schemaVersion"] = 33;
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 33, savedAt: "2026-01-01T00:00:00Z", world: stripped });

    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.policyLedger).toEqual({});
    expect(loaded.ministerialOrders).toEqual([]);
    expect(loaded.enactmentGates).toEqual({ debtCeilingCrisis: {} });
    expect(loaded.currencyUnions).toEqual({});
    expect(loaded.coldWarTension.value).toBe(12);
    expect(loaded.nuclearPrograms["US"]).toBeDefined();
    expect(loaded.conflicts).toEqual([]);
    expect(loaded.alignments["US"]!.shares.WEST).toBe(100);
    expect(loaded.settlements).toEqual([]);
    expect(loaded.internationalOrgs["UN"]).toBeDefined();

    const loaded2 = deserializeSave(raw);
    expect(JSON.stringify(loaded.coldWarTension)).toBe(JSON.stringify(loaded2.coldWarTension));
    expect(JSON.stringify(loaded.alignments)).toBe(JSON.stringify(loaded2.alignments));
  });

  it("is idempotent on an already-current (v37) save", () => {
    const world = createWorld({ seed: "mig-w28w32-idem", playerName: "P", countryId: "RU", era: "1953" });
    world.coldWarTension.value = 42;
    world.coldWarTension.pressureFloor = 30;
    world.nuclearPrograms["RU"]!.warheads = 5;
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: SCHEMA_VERSION, savedAt: "2026-01-01T00:00:00Z", world });
    const loaded = deserializeSave(raw);
    expect(loaded.coldWarTension.value).toBe(42);
    expect(loaded.nuclearPrograms["RU"]!.warheads).toBe(5);
  });
});

describe("save via serializeSave round-trip carries the new fields intact", () => {
  it("serialize then deserialize is lossless for W28/W32 state", () => {
    const world = createWorld({ seed: "roundtrip", playerName: "P", countryId: "US", era: "1953" });
    world.policyLedger["x"] = { id: "x", legislationTypeId: "us.economy.workerSecurity.primary", policyOptionId: "1", effectDirection: 1, scope: "national", countryId: "US", enactedTurn: 0, enactedAt: world.meta.date };
    world.coldWarTension.value = 55.5;
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const loaded = deserializeSave(raw);
    expect(loaded.policyLedger["x"]).toEqual(world.policyLedger["x"]);
    expect(loaded.coldWarTension.value).toBe(55.5);
  });
});
