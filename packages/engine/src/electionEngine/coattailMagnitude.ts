/**
 * Shared approval -> coattail magnitude math.
 *
 * Ported from `src/lib/electionEngine/coattailMagnitude.ts`.
 * Mainline mapping: `BASE_APPROVAL` from `src/lib/utils/governmentApproval.ts`
 * is 50 (re-exported here as local constant to avoid cross-module dependency).
 * Constants `COATTAIL_MAX_BONUS` / `COATTAIL_APPROVAL_SATURATION` come from
 * local `constants.ts`.
 */

import { COATTAIL_MAX_BONUS, COATTAIL_APPROVAL_SATURATION } from "./constants.js";

export const BASE_APPROVAL = 50 as const;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function approvalCoattailMultiplier(approval: number): number {
  const swing = clamp((approval - BASE_APPROVAL) / COATTAIL_APPROVAL_SATURATION, -1, 1);
  return 1 + swing * COATTAIL_MAX_BONUS;
}

export function coattailMultiplierMapToPct(modifier: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [party, mult] of modifier) {
    out[party] = (mult - 1) * 100;
  }
  return out;
}
