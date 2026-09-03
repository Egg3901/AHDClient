/**
 * Union membership, dues and approval — W15.
 *
 * Ports src/lib/unions/unionDues.ts verbatim constants and pure helpers.
 * No invented numbers: MAX_DUES_FRACTION_OF_WAGE 0.1, UNION_TREASURY_FLOW_SCALE 12,
 * BASE_APPROVAL 55, APPROVAL_DUES_PENALTY_PER_UNIT 500, APPROVAL_TREND_STEP_PER_TURN 1.5
 * are taken directly from the source file.
 *
 * Membership bridge (see phases.ts file doc): mainline's unionMembers(sectors)
 * counts workers * unionization/100 per CorporateSector. AHDClient has no
 * per-sector workers table yet (see corporation/types.ts single-sector collapse),
 * so this module keeps the same signature — unionMembers(UnionMemberSector[]) —
 * and the turn phase translates laborForces+sectorWeights into the
 * UnionMemberSector[] shape before calling it. That keeps this file's arithmetic
 * identical to mainline (and therefore test-golden-identical) while the
 * demographic bridge lives in one place (phases.ts) instead of being baked
 * into every formula.
 *
 * Source: <mainline-checkout>/src/lib/unions/unionDues.ts
 *         <mainline-checkout>/src/lib/unions/unionServices.ts (annualWageFromDaily, services*)
 *         <mainline-checkout>/src/lib/constants/turnTime.ts TURNS_PER_YEAR 48
 */

import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import {
  annualWageFromDaily,
  servicesApprovalBonus,
  servicesCostFraction,
  type UnionServiceId,
} from "./services.js";
import { politicalContributionApprovalPenalty } from "./political.js";

/** The slice of a sector's payroll a union may charge, as a fraction of annual wage. Source: unionDues.ts MAX_DUES_FRACTION_OF_WAGE 0.1 */
export const MAX_DUES_FRACTION_OF_WAGE = 0.1;

/** Multiplier on per-turn treasury credits. Source: unionDues.ts UNION_TREASURY_FLOW_SCALE 12 */
export const UNION_TREASURY_FLOW_SCALE = 12;

/** Approval with no dues and no services. Source: unionDues.ts BASE_APPROVAL 55 */
export const BASE_APPROVAL = 55;

/** Approval points lost per unit of dues burden. Source: unionDues.ts APPROVAL_DUES_PENALTY_PER_UNIT 500 */
export const APPROVAL_DUES_PENALTY_PER_UNIT = 500;

/** Most approval can move in one turn. Source: unionDues.ts APPROVAL_TREND_STEP_PER_TURN 1.5 */
export const APPROVAL_TREND_STEP_PER_TURN = 1.5;

/** Sector fields needed to count members and price dues against local wages. Source: unionDues.ts UnionMemberSector */
export interface UnionMemberSector {
  workers?: number;
  unionization?: number;
  wagePerWorker?: number;
}

function finitePositive(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Headcount across sectors this union represents: each sector's workers
 * scaled by how unionized it is.
 * Source: src/lib/unions/unionDues.ts unionMembers (verbatim)
 */
export function unionMembers(sectors: readonly UnionMemberSector[]): number {
  let total = 0;
  for (const sector of sectors) {
    const workers = finitePositive(sector.workers);
    const density = Math.max(0, Math.min(100, finitePositive(sector.unionization)));
    total += workers * (density / 100);
  }
  return Math.round(total);
}

/**
 * Member-weighted average annual wage across represented sectors.
 * Source: src/lib/unions/unionDues.ts averageAnnualWage (verbatim)
 */
export function averageAnnualWage(sectors: readonly UnionMemberSector[]): number {
  let weighted = 0;
  let weight = 0;
  for (const sector of sectors) {
    const workers = finitePositive(sector.workers);
    const density = Math.max(0, Math.min(100, finitePositive(sector.unionization)));
    const members = workers * (density / 100);
    if (members <= 0) continue;
    weighted += annualWageFromDaily(finitePositive(sector.wagePerWorker)) * members;
    weight += members;
  }
  return weight > 0 ? weighted / weight : 0;
}

/** Dues as a fraction of annual wage. Source: unionDues.ts duesBurdenRatio (verbatim) */
export function duesBurdenRatio(duesPerWorkerAnnual: number, annualWage: number): number {
  const dues = Math.max(0, finitePositive(duesPerWorkerAnnual));
  if (annualWage <= 0) return 0;
  return dues / annualWage;
}

/** Highest annual dues this union may charge, given local wages. Source: unionDues.ts maxDuesForWage (verbatim) */
export function maxDuesForWage(annualWage: number): number {
  return Math.max(0, annualWage * MAX_DUES_FRACTION_OF_WAGE);
}

/** Treasury gained this turn: annual per-member charge spread across the year. Source: unionDues.ts duesIncomePerTurn (verbatim) */
export function duesIncomePerTurn(members: number, duesPerWorkerAnnual: number): number {
  const m = Math.max(0, finitePositive(members));
  const rate = Math.max(0, finitePositive(duesPerWorkerAnnual));
  return (UNION_TREASURY_FLOW_SCALE * m * rate) / TURNS_PER_YEAR;
}

/** Treasury spent this turn running the active service slate. Source: unionDues.ts servicesCostPerTurn (verbatim) */
export function servicesCostPerTurn(
  members: number,
  annualWage: number,
  active: readonly UnionServiceId[],
): number {
  const m = Math.max(0, finitePositive(members));
  const wage = Math.max(0, finitePositive(annualWage));
  return (UNION_TREASURY_FLOW_SCALE * m * wage * servicesCostFraction(active)) / TURNS_PER_YEAR;
}

export interface ApprovalInputs {
  duesPerWorkerAnnual: number;
  annualWage: number;
  activeServices: readonly UnionServiceId[];
  servicesLapsed?: boolean;
  politicalContributionPct?: number;
}

export interface ApprovalTargetBreakdown {
  base: number;
  servicesBonus: number;
  duesPenalty: number;
  politicalPenalty: number;
  target: number;
}

/**
 * Every term in the approval target, exposed from the same authority the turn engine uses.
 * Source: src/lib/unions/unionDues.ts approvalTargetBreakdown (verbatim)
 */
export function approvalTargetBreakdown(inputs: ApprovalInputs): ApprovalTargetBreakdown {
  const burden = duesBurdenRatio(inputs.duesPerWorkerAnnual, inputs.annualWage);
  const duesPenalty = burden * APPROVAL_DUES_PENALTY_PER_UNIT;
  const politicalPenalty = politicalContributionApprovalPenalty(inputs.politicalContributionPct);
  const servicesBonus = inputs.servicesLapsed ? 0 : servicesApprovalBonus(inputs.activeServices);
  const target = Math.max(0, Math.min(100, BASE_APPROVAL + servicesBonus - duesPenalty - politicalPenalty));
  return { base: BASE_APPROVAL, servicesBonus, duesPenalty, politicalPenalty, target };
}

/** Where approval is heading. Source: unionDues.ts approvalTarget (verbatim) */
export function approvalTarget(inputs: ApprovalInputs): number {
  return approvalTargetBreakdown(inputs).target;
}

/** Steps approval toward its target. Source: unionDues.ts trendApproval (verbatim) */
export function trendApproval(current: number, target: number): number {
  const from = Math.max(0, Math.min(100, finitePositive(current, 0)));
  const to = Math.max(0, Math.min(100, target));
  if (from === to) return from;
  const step = Math.min(APPROVAL_TREND_STEP_PER_TURN, Math.abs(to - from));
  return Math.round((from + Math.sign(to - from) * step) * 100) / 100;
}

/** Approval as stored, treating missing field as base. Source: unionDues.ts unionApproval (verbatim) */
export function unionApproval(union: { approval?: number }): number {
  const a = union.approval;
  return typeof a === "number" && Number.isFinite(a)
    ? Math.max(0, Math.min(100, a))
    : BASE_APPROVAL;
}
