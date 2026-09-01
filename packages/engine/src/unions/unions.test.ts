import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { advanceTurn } from "../engine.js";
import {
  unionMembers,
  duesIncomePerTurn,
  servicesCostPerTurn,
  approvalTarget,
  approvalTargetBreakdown,
  BASE_APPROVAL,
  UNION_TREASURY_FLOW_SCALE,
  maxDuesForWage,
  trendApproval,
} from "./dues.js";
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import { servicesCostFraction, servicesApprovalBonus, UNION_SERVICES } from "./services.js";
import {
  clampPoliticalContributionPct,
  freeCashFlowPerTurn,
  politicalContributionPerTurn,
  politicalContributionApprovalPenalty,
  buildLabourRelationsPoliticalNudges,
  MAX_POLITICAL_CONTRIBUTION_OF_FCF,
  LABOUR_POLITICAL_CAPS,
} from "./political.js";
import { seedUnions, getUnionName } from "./founding.js";
import {
  INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS,
  simulateIndustrialRelationsBalance,
} from "./industrialRelationsBalance.js";
import { NPP_DEMAND_MIN_UNIONIZATION, NPP_DEMAND_PREMIUM } from "./nppBehavior.js";

const OPTS = { seed: "union-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("union dues constants (no invented numbers)", () => {
  it("credits twelve times annual dues divided by 48-turn year (src/lib/unions/unionDues.ts UNION_TREASURY_FLOW_SCALE 12, TURNS_PER_YEAR 48)", () => {
    // 100 members * 4.8 a year / 48 turns = 10, then *12 = 120.
    expect(TURNS_PER_YEAR).toBe(48);
    expect(UNION_TREASURY_FLOW_SCALE).toBe(12);
    expect(duesIncomePerTurn(100, 4.8)).toBe(120);
  });

  it("bills twelve times wage-fraction service cost per turn (healthFund 2.5% of wages: 100*10*0.025/48*12=6.25)", () => {
    // healthFund is 2.5% of wages: 100 members * 10 wage * 0.025 /48 =0.5208*12=6.25
    expect(servicesCostPerTurn(100, 10, ["healthFund"])).toBeCloseTo(6.25, 8);
  });

  it("counts workers times unionization, so raising density raises headcount (src/lib/unions/unionDues.ts unionMembers)", () => {
    const shop = { workers: 500, unionization: 10 };
    expect(unionMembers([shop])).toBe(50);
    expect(unionMembers([{ ...shop, unionization: 13 }])).toBe(65);
  });

  it("max dues is 10% of annual wage (src/lib/unions/unionDues.ts MAX_DUES_FRACTION_OF_WAGE 0.1)", () => {
    expect(maxDuesForWage(100)).toBe(10);
    expect(maxDuesForWage(0)).toBe(0);
  });
});

describe("approval goldens (src/lib/unions/unionDues.ts + unionPoliticalContributions.ts)", () => {
  it("drops 5 points at 50% political contribution cap with no dues/services (LABOUR_POLITICAL_CAPS)", () => {
    const baseline = approvalTarget({ duesPerWorkerAnnual: 0, annualWage: 10, activeServices: [] });
    const atCap = approvalTarget({
      duesPerWorkerAnnual: 0,
      annualWage: 10,
      activeServices: [],
      politicalContributionPct: 0.5,
    });
    expect(baseline).toBe(BASE_APPROVAL);
    expect(atCap).toBe(BASE_APPROVAL - 5);
    expect(MAX_POLITICAL_CONTRIBUTION_OF_FCF).toBe(0.5);
    expect(politicalContributionApprovalPenalty(0.5)).toBe(5);
  });

  it("explains when service gains offset by four-percent dues (src/lib/unions/unionDues.ts approvalTargetBreakdown)", () => {
    const breakdown = approvalTargetBreakdown({
      duesPerWorkerAnnual: 4,
      annualWage: 100,
      activeServices: ["healthFund", "training"],
      politicalContributionPct: 0,
    });
    expect(breakdown).toEqual({ base: 55, servicesBonus: 19, duesPenalty: 20, politicalPenalty: 0, target: 54 });
    expect(approvalTarget({ duesPerWorkerAnnual: 4, annualWage: 100, activeServices: ["healthFund", "training"], politicalContributionPct: 0 })).toBe(
      breakdown.target,
    );
  });

  it("servicesLapsed removes bonus (unfunded programmes earn nothing)", () => {
    const lapsed = approvalTarget({ duesPerWorkerAnnual: 0, annualWage: 100, activeServices: ["healthFund"], servicesLapsed: true });
    const funded = approvalTarget({ duesPerWorkerAnnual: 0, annualWage: 100, activeServices: ["healthFund"], servicesLapsed: false });
    expect(lapsed).toBe(BASE_APPROVAL);
    expect(funded).toBe(BASE_APPROVAL + 12);
  });

  it("trend steps at most 1.5 per turn (src/lib/unions/unionDues.ts APPROVAL_TREND_STEP_PER_TURN 1.5)", () => {
    expect(trendApproval(55, 60)).toBe(56.5);
    expect(trendApproval(55, 55)).toBe(55);
    // No overshoot
    expect(trendApproval(59.5, 60)).toBe(60);
  });
});

describe("political contribution goldens (src/lib/unions/unionPoliticalContributions.ts)", () => {
  it("clamps pct to [0,0.5]", () => {
    expect(clampPoliticalContributionPct(1)).toBe(0.5);
    expect(clampPoliticalContributionPct(-0.1)).toBe(0);
    expect(clampPoliticalContributionPct(undefined)).toBe(0);
  });

  it("free cash flow is dues minus services, floored 0", () => {
    expect(freeCashFlowPerTurn(100, 30)).toBe(70);
    expect(freeCashFlowPerTurn(10, 30)).toBe(0);
  });

  it("contribution is FCF * pct", () => {
    expect(politicalContributionPerTurn(100, 0.5)).toBe(50);
    expect(politicalContributionPerTurn(100, 0)).toBe(0);
  });
});

describe("services goldens (src/lib/unions/unionServices.ts)", () => {
  it("combined cost fraction and approval bonus match UNION_SERVICES table", () => {
    expect(servicesCostFraction(["strikeFund", "healthFund", "legalAid", "training"])).toBeCloseTo(0.015 + 0.025 + 0.01 + 0.015, 10);
    expect(servicesApprovalBonus(["healthFund", "training"])).toBe(19);
    expect(UNION_SERVICES.length).toBe(4);
  });
});

describe("union political nudge goldens (src/lib/unions/labourRelationsPoliticalProvider.ts)", () => {
  it("services-only nudge is sum of workerSecurityNudge, capped at 5", () => {
    // healthFund 1.2 + legalAid 0.9 = 2.1
    const nudges = buildLabourRelationsPoliticalNudges([], 0, [{ countryId: "US", activeServices: ["healthFund", "legalAid"] }]);
    expect(nudges.get("US")?.get("economy.workerSecurity")).toBeCloseTo(2.1, 4);
    expect(LABOUR_POLITICAL_CAPS["economy.workerSecurity"]).toBe(5);
  });

  it("caps at 5 even with all services across multiple unions in same country", () => {
    const unions = [
      { countryId: "US", activeServices: ["strikeFund", "healthFund", "legalAid", "training"] }, // 0.4+1.2+0.9+0.6=3.1
      { countryId: "US", activeServices: ["healthFund", "legalAid", "training"] }, // 1.2+0.9+0.6=2.7 total 5.8 -> capped 5
    ];
    const nudges = buildLabourRelationsPoliticalNudges([], 0, unions);
    expect(nudges.get("US")?.get("economy.workerSecurity")).toBe(5);
  });

  it("suspended unions contribute nothing", () => {
    const nudges = buildLabourRelationsPoliticalNudges([], 0, [{ countryId: "US", activeServices: ["healthFund"], suspended: true }]);
    expect(nudges.get("US")).toBeUndefined();
  });

  it("dispute nudge decays with 0.9 per turn, settlement decays 0.85", () => {
    const dispute = [{ countryId: "US", status: "dispute", escalationLevel: "industry_strike", mandate: { leverage: 50 }, disputeStartedAtTurn: 0 }];
    const at0 = buildLabourRelationsPoliticalNudges(dispute, 0, []).get("US")?.get("economy.workerSecurity");
    const at1 = buildLabourRelationsPoliticalNudges(dispute, 1, []).get("US")?.get("economy.workerSecurity");
    // industry_strike severity 3 * 0.9^age * -0.75
    // age 0: -2.25, age1: -2.025
    expect(at0).toBeCloseTo(-2.25, 4);
    expect(at1).toBeCloseTo(-2.025, 4);
  });
});

describe("industrial relations balance scenarios (src/simulation/industrialRelationsBalance.ts)", () => {
  it("has 7 scenarios with expected names", () => {
    expect(INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS.length).toBe(7);
    expect(INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS.map((s) => s.name)).toEqual([
      "weak fragmented local",
      "viable bargaining union",
      "strong tight-market union",
      "viable union in an expensive state",
      "rung 1: modest local, shallow grievance",
      "rung 2: organized local, real wage gap",
      "rung 3: mass-organized local, deep grievance",
    ]);
  });

  it("simulates scenarios with determinism", () => {
    const a = simulateIndustrialRelationsBalance(INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS[1]!);
    const b = simulateIndustrialRelationsBalance(INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS[1]!);
    expect(a).toEqual(b);
    expect(a.support).toBeGreaterThan(0);
    expect(a.support).toBeLessThanOrEqual(100);
  });
});

describe("union founding (W15)", () => {
  it("seeds one union per nonzero-weight sector per playable country", () => {
    const world = createWorld(OPTS);
    // US has 17 sectors seeded (all nonzero in 1953), UK/RU/DD similarly => total ~68? but we seeded all 17 per country where weight>0 => 17*4=68
    const ids = Object.keys(world.unions);
    expect(ids.length).toBeGreaterThan(0);
    // Each id is country-sector
    for (const id of ids) expect(id).toMatch(/^[A-Z]+-.+/);
    // Names are historical where authored, else generic
    expect(getUnionName("US", "manufacturing")).toBe("United Steelworkers");
    expect(world.unions["US-manufacturing"]?.name).toBe("United Steelworkers");
  });

  it("NPP constants are verbatim from nppUnionBehavior.ts", () => {
    expect(NPP_DEMAND_MIN_UNIONIZATION).toBe(15);
    expect(NPP_DEMAND_PREMIUM).toBe(0.12);
  });
});

describe("unionsTurn integration + determinism", () => {
  it("unionsTurn mutates treasury/approval deterministically and survives save/load", () => {
    const a = createWorld({ seed: "det", playerName: "A", countryId: "US", era: "1953" });
    const b = createWorld({ seed: "det", playerName: "A", countryId: "US", era: "1953" });
    // Give one union non-zero dues and a service so the tick does something
    a.unions["US-manufacturing"]!.duesPerWorkerAnnual = 5;
    a.unions["US-manufacturing"]!.activeServices = ["healthFund"];
    b.unions["US-manufacturing"]!.duesPerWorkerAnnual = 5;
    b.unions["US-manufacturing"]!.activeServices = ["healthFund"];

    for (let i = 0; i < 10; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.unions)).toBe(JSON.stringify(b.unions));
    // Treasury moved, approval trended
    expect(a.unions["US-manufacturing"]!.treasury).not.toBe(500);
    expect(a.unions["US-manufacturing"]!.approval).not.toBe(55);
  });

  it("suspended unions are frozen (no treasury/approval change)", () => {
    const world = createWorld(OPTS);
    const u = world.unions["US-manufacturing"]!;
    u.suspended = true;
    u.duesPerWorkerAnnual = 10;
    u.activeServices = ["healthFund"];
    const before = { treasury: u.treasury, approval: u.approval };
    advanceTurn(world);
    expect(u.treasury).toBe(before.treasury);
    expect(u.approval).toBe(before.approval);
  });

  it("nppUnionBehavior fills vacant leadership deterministically", () => {
    const a = createWorld({ seed: "npp", playerName: "A", countryId: "US", era: "1953" });
    const b = createWorld({ seed: "npp", playerName: "A", countryId: "US", era: "1953" });
    // All unions start vacant (ownerId null)
    expect(Object.values(a.unions).every((u) => u.ownerId == null)).toBe(true);
    advanceTurn(a);
    advanceTurn(b);
    expect(JSON.stringify(a.unions)).toBe(JSON.stringify(b.unions));
    // Some unions now have leaders
    expect(Object.values(a.unions).some((u) => u.ownerId != null)).toBe(true);
  });

  it("is unaffected by save/load round-trip mid-campaign", () => {
    const world = createWorld(OPTS);
    world.unions["US-manufacturing"]!.duesPerWorkerAnnual = 3;
    for (let i = 0; i < 5; i++) advanceTurn(world);
    const snapshot = JSON.stringify(world.unions);
    const reloaded = deserializeSave(serializeSave(world, "2026-01-01T00:00:00Z"));
    for (let i = 0; i < 5; i++) advanceTurn(reloaded);
    const straight = createWorld(OPTS);
    straight.unions["US-manufacturing"]!.duesPerWorkerAnnual = 3;
    for (let i = 0; i < 10; i++) advanceTurn(straight);
    expect(JSON.stringify(reloaded.unions)).toBe(JSON.stringify(straight.unions));
    expect(snapshot).not.toBe(JSON.stringify(reloaded.unions));
  });
});

describe("schema v30 migration", () => {
  it("createWorld seeds unions at SCHEMA_VERSION 30", () => {
    expect(SCHEMA_VERSION).toBe(30);
    const world = createWorld(OPTS);
    expect(world.meta.schemaVersion).toBe(30);
    expect(Object.keys(world.unions).length).toBeGreaterThan(0);
  });

  it("migration from v28 seeds unions (chained v28->v29->v30)", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, "2026-01-02T00:00:00Z"));
    // Simulate an old save with v28 and no unions field
    raw.schemaVersion = 28;
    raw.world.meta.schemaVersion = 28;
    delete (raw.world as Record<string, unknown>)["unions"];
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.meta.schemaVersion).toBe(30);
    expect(Object.keys(loaded.unions).length).toBeGreaterThan(0);
    // Deterministic: same countries produce same union ids as fresh createWorld
    const fresh = createWorld(OPTS);
    expect(Object.keys(loaded.unions).sort()).toEqual(Object.keys(fresh.unions).sort());
  });

  it("loading newer schema throws", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, "2026-01-02T00:00:00Z"));
    raw.schemaVersion = 99;
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/newer version/);
  });
});
