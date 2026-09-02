/**
 * Union services — W15.
 *
 * Ports src/lib/unions/unionServices.ts verbatim constants and pure helpers.
 * No invented numbers: every costFraction/approvalBonus/strikeSoftening/
 * workerSecurityNudge comes from UNION_SERVICES below.
 *
 * Three effect channels (see unionServices.ts file doc):
 *  - approvalBonus -> union approval target (dues.ts)
 *  - strikeSoftening -> strike pressure damping (PORT-STUB: no strike system yet)
 *  - workerSecurityNudge -> political board via labourRelationsPoliticalProvider (political.ts)
 *
 * Source: <mainline-checkout>/src/lib/unions/unionServices.ts
 */

import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import { TURNS_PER_DAY } from "../corporation/constants.js";
import type { UnionServiceId } from "./types.js";

export type { UnionServiceId } from "./types.js";

export interface UnionService {
  id: UnionServiceId;
  name: string;
  description: string;
  costFractionOfAnnualWage: number;
  approvalBonus: number;
  strikeSoftening: number;
  workerSecurityNudge: number;
}

/**
 * Priced against the 1950s reality that dues ran a few percent of wages and a
 * welfare fund was the expensive one. Total cost with everything ON is ~6.5%
 * of payroll (see unionServices.ts file doc).
 * Source: src/lib/unions/unionServices.ts UNION_SERVICES (verbatim)
 */
export const UNION_SERVICES: readonly UnionService[] = [
  {
    id: "strikeFund",
    name: "Strike Fund",
    description: "Pays members a stipend while they are out, so a stoppage does not starve them.",
    costFractionOfAnnualWage: 0.015,
    approvalBonus: 8,
    strikeSoftening: 0,
    workerSecurityNudge: 0.4,
  },
  {
    id: "healthFund",
    name: "Health and Welfare Fund",
    description: "Sickness pay, medical cover and a death benefit for members and their families.",
    costFractionOfAnnualWage: 0.025,
    approvalBonus: 12,
    strikeSoftening: 0.18,
    workerSecurityNudge: 1.2,
  },
  {
    id: "legalAid",
    name: "Legal Representation",
    description: "Union lawyers fight dismissals, compensation claims and contract violations.",
    costFractionOfAnnualWage: 0.01,
    approvalBonus: 6,
    strikeSoftening: 0.12,
    workerSecurityNudge: 0.9,
  },
  {
    id: "training",
    name: "Training and Apprenticeship",
    description: "Apprenticeships and skills courses that move members up the wage ladder.",
    costFractionOfAnnualWage: 0.015,
    approvalBonus: 7,
    strikeSoftening: 0.06,
    workerSecurityNudge: 0.6,
  },
] as const;

const BY_ID = new Map<UnionServiceId, UnionService>(UNION_SERVICES.map((s) => [s.id, s]));

export function getUnionService(id: UnionServiceId): UnionService | undefined {
  return BY_ID.get(id);
}

/** Drops unknown ids and duplicates, so stale document cannot widen effect. Source: unionServices.ts normalizeServiceIds */
export function normalizeServiceIds(ids: readonly string[] | undefined | null): UnionServiceId[] {
  if (!ids) return [];
  const seen = new Set<UnionServiceId>();
  for (const id of ids) {
    if (BY_ID.has(id as UnionServiceId)) seen.add(id as UnionServiceId);
  }
  return [...seen];
}

/**
 * A game year is TURNS_PER_YEAR turns while wages are quoted per real
 * day (TURNS_PER_DAY turns), so annual = daily * (TURNS_PER_YEAR / TURNS_PER_DAY).
 * Source: src/lib/unions/unionServices.ts GAME_DAYS_PER_YEAR (verbatim)
 */
export const GAME_DAYS_PER_YEAR = TURNS_PER_YEAR / TURNS_PER_DAY;

export function annualWageFromDaily(wagePerWorkerDaily: number): number {
  const daily = Number.isFinite(wagePerWorkerDaily) ? Math.max(0, wagePerWorkerDaily) : 0;
  return daily * GAME_DAYS_PER_YEAR;
}

export function servicesCostFraction(active: readonly UnionServiceId[]): number {
  return active.reduce((sum, id) => sum + (BY_ID.get(id)?.costFractionOfAnnualWage ?? 0), 0);
}

export function servicesApprovalBonus(active: readonly UnionServiceId[]): number {
  return active.reduce((sum, id) => sum + (BY_ID.get(id)?.approvalBonus ?? 0), 0);
}

export const MAX_STRIKE_SOFTENING = 0.6;

export function servicesStrikeSoftening(active: readonly UnionServiceId[]): number {
  const raw = active.reduce((sum, id) => sum + (BY_ID.get(id)?.strikeSoftening ?? 0), 0);
  return Math.max(0, Math.min(MAX_STRIKE_SOFTENING, raw));
}

export function servicesWorkerSecurityNudge(active: readonly UnionServiceId[]): number {
  return active.reduce((sum, id) => sum + (BY_ID.get(id)?.workerSecurityNudge ?? 0), 0);
}
