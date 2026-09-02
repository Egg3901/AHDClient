/**
 * Industrial relations balance — W15 diagnostic helper.
 *
 * Ports src/simulation/industrialRelationsBalance.ts (diagnostic simulation).
 * This module is NOT wired to unionsTurn; it is a standalone balance
 * scenarios runner used to verify grievance/mandate calibration.
 * The turn itself uses the same bargaining mandate math via
 * src/lib/unions/bargaining.ts buildBargainingMandate — but that mandate
 * system is not yet ported (blocked on bargaining/wage floor work), so the
 * helper is kept as a diagnostic PORT-STUB that exercises the dues/services
 * inputs in isolation.
 *
 * Mainline's industrialRelationsBalance.ts imports:
 *  - BARGAINING_ESCALATION_SUPPORT, OVERTIME_BAN_OUTPUT_FACTOR,
 *    buildBargainingMandate, laborTightnessFromUnemployment, lawSupportFromBias
 *    from "@/lib/unions/bargaining"
 *  - STRIKE_REVENUE_THROTTLE from "@/lib/labour/strikes"
 *  - strikeCallCost from "@/lib/unions/unionEconomy"
 *
 * Rotunda BLOCKER: bargaining mandate not yet ported (needs
 * src/lib/unions/bargaining.ts buildBargainingMandate + mandate scoring).
 * This file therefore preserves the scenario SHAPE from mainline but computes
 * support/leverage from a simplified local formula cited as a placeholder
 * until the full mandate land. The scenario list and output fields are
 * verbatim from the mainline file so tests can golden the shape.
 *
 * Source: <mainline-checkout>/src/simulation/industrialRelationsBalance.ts
 */

export interface IndustrialRelationsBalanceScenario {
  name: string;
  workers: number;
  unionization: number;
  wageLevel: number;
  workerExpectationIndex: number;
  costOfLivingIndex?: number;
  unemploymentRate: number;
  unionLawBias: number;
  treasury: number;
  organizedLocals: number;
}

export interface IndustrialRelationsBalanceResult {
  name: string;
  /** Simplified support = coverage*0.6 + grievance*0.3 + lawSupport*0.1 (see file doc). */
  support: number;
  /** Simplified leverage = support * (1 + treasury-runway factor). */
  leverage: number;
  /** How many scoped strike calls treasury can fund. */
  strikeFundRunway: number;
  canOvertimeBan: boolean;
  canSelectiveStrike: boolean;
  canIndustryStrike: boolean;
  selectiveStrikeCost: number;
  industryStrikeCost: number;
  overtimeBanOutputLossPercent: number;
  selectiveStrikeScopeOutputLossPercent: number;
  industryStrikeOutputLossPercent: number;
}

/**
 * Scenario list verbatim from mainline industrialRelationsBalance.ts.
 * Source: src/simulation/industrialRelationsBalance.ts INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS
 */
export const INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS: readonly IndustrialRelationsBalanceScenario[] = [
  {
    name: "weak fragmented local",
    workers: 1000,
    unionization: 15,
    wageLevel: 1,
    workerExpectationIndex: 1,
    unemploymentRate: 12,
    unionLawBias: -30,
    treasury: 400,
    organizedLocals: 1,
  },
  {
    name: "viable bargaining union",
    workers: 3000,
    unionization: 45,
    wageLevel: 1,
    workerExpectationIndex: 1.03,
    unemploymentRate: 6,
    unionLawBias: 0,
    treasury: 2400,
    organizedLocals: 4,
  },
  {
    name: "strong tight-market union",
    workers: 8000,
    unionization: 75,
    wageLevel: 1,
    workerExpectationIndex: 1.1,
    unemploymentRate: 3,
    unionLawBias: 30,
    treasury: 8000,
    organizedLocals: 8,
  },
  {
    name: "viable union in an expensive state",
    workers: 3000,
    unionization: 45,
    wageLevel: 1,
    workerExpectationIndex: 1.03,
    costOfLivingIndex: 112,
    unemploymentRate: 6,
    unionLawBias: 0,
    treasury: 2400,
    organizedLocals: 4,
  },
  {
    name: "rung 1: modest local, shallow grievance",
    workers: 2000,
    unionization: 40,
    wageLevel: 1,
    workerExpectationIndex: 1.05,
    unemploymentRate: 5,
    unionLawBias: 0,
    treasury: 1200,
    organizedLocals: 2,
  },
  {
    name: "rung 2: organized local, real wage gap",
    workers: 4000,
    unionization: 60,
    wageLevel: 1,
    workerExpectationIndex: 1.12,
    unemploymentRate: 5,
    unionLawBias: 0,
    treasury: 3200,
    organizedLocals: 5,
  },
  {
    name: "rung 3: mass-organized local, deep grievance",
    workers: 9000,
    unionization: 85,
    wageLevel: 1,
    workerExpectationIndex: 1.2,
    unemploymentRate: 5,
    unionLawBias: 0,
    treasury: 9000,
    organizedLocals: 9,
  },
];

/**
 * Constants cited from mainline bargaining module (see bargaining.ts).
 * No invented numbers: thresholds and costs are verbatim from source.
 */
export const BARGAINING_ESCALATION_SUPPORT = {
  overtime_ban: 40,
  selective_strike: 55,
  industry_strike: 70,
} as const;

export const OVERTIME_BAN_OUTPUT_FACTOR = 0.85;
export const STRIKE_REVENUE_THROTTLE = 0.35;
export const STRIKE_CALL_COST_PER_SECTOR = 400;

/** Treasury cost per matched sector when a union calls a strike. Source: unionEconomy.ts STRIKE_CALL_COST_PER_SECTOR 400 */
export function strikeCallCost(sectorCount: number): number {
  return Math.max(0, Math.round(sectorCount)) * STRIKE_CALL_COST_PER_SECTOR;
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function simulateIndustrialRelationsBalance(
  scenario: IndustrialRelationsBalanceScenario,
): IndustrialRelationsBalanceResult {
  // Simplified mandate math (PORT-STUB for bargaining mandate not yet ported):
  // coverage = unionization, grievance = expectation gap * 100 (capped), lawSupport = 50+bias, laborTightness = 100-unemployment*5
  const coverage = clampScore(scenario.unionization);
  const realWageGap = (scenario.workerExpectationIndex - scenario.wageLevel) / Math.max(0.01, (scenario.costOfLivingIndex ?? 100) / 100);
  const grievance = clampScore(realWageGap * 100);
  const lawSupport = clampScore(50 + scenario.unionLawBias);
  // Simplified support scoring mirrors bargaining.ts coverage*0.6 + grievance*0.3 + lawSupport*0.1
  const support = clampScore(Math.round(coverage * 0.6 + grievance * 0.3 + lawSupport * 0.1));
  const runway = Math.floor(scenario.treasury / Math.max(1, strikeCallCost(1)));
  const strikeFundRunway = Math.min(10, runway);
  const leverage = clampScore(Math.round(support * (0.5 + 0.5 * Math.min(1, strikeFundRunway / 5))));

  const industryStrikeCost = strikeCallCost(scenario.organizedLocals);
  const selectiveLocals = Math.max(1, Math.ceil(scenario.organizedLocals / 2));

  return {
    name: scenario.name,
    support,
    leverage,
    strikeFundRunway,
    canOvertimeBan: support >= BARGAINING_ESCALATION_SUPPORT.overtime_ban,
    canSelectiveStrike: support >= BARGAINING_ESCALATION_SUPPORT.selective_strike,
    canIndustryStrike: support >= BARGAINING_ESCALATION_SUPPORT.industry_strike,
    selectiveStrikeCost: strikeCallCost(selectiveLocals),
    industryStrikeCost,
    overtimeBanOutputLossPercent: Math.round((1 - OVERTIME_BAN_OUTPUT_FACTOR) * 10_000) / 100,
    selectiveStrikeScopeOutputLossPercent: STRIKE_REVENUE_THROTTLE * (selectiveLocals / scenario.organizedLocals) * 100,
    industryStrikeOutputLossPercent: STRIKE_REVENUE_THROTTLE * 100,
  };
}

export function runIndustrialRelationsBalanceScenarios(): IndustrialRelationsBalanceResult[] {
  return INDUSTRIAL_RELATIONS_BALANCE_SCENARIOS.map(simulateIndustrialRelationsBalance);
}
