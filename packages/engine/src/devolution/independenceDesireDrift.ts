import type { WorldState } from "../types.js";

/**
 * W25: independenceDesireDrift. Ports mainline's pure compute
 * `computeIndependenceDesireDriftSnapshot` and its constants verbatim
 * (src/lib/governorOffice/devolution/independenceDesireDrift.ts:56-83,
 * src/lib/constants/devolution.ts) — the DB-wired driver
 * (src/lib/turn/independenceDesireDrift.ts:141) is live every turn via
 * `independenceDesireDrift` (turnPhaseNames.ts:123,
 * src/simulation/phases/stateEffectsPhase.ts:509-516), immediately before
 * `referendumLifecycle` "so a settled No-vote dampens the just-updated
 * desire value" (mainline comment, preserved by this file's own
 * ordering relative to referendum/phases.ts in registry.ts).
 *
 * "Independence desire" is a property of exactly three UK devolved regions
 * — SCO, WAL, NIR (`UK_DEVOLUTION_REGIONS`, devolution.ts:16; LON is
 * explicitly excluded, "the Mayor of London has no devolution axis") — no
 * other country/region has this field, mainline or here.
 *
 * PORT-STUB inputs (Rotunda has no producer for these yet):
 *  - `policy` (the seated First Minister's `DevolutionPolicy`: anti/pro/
 *    independence): Rotunda has no devolved-FM office at all (government/
 *    types.ts models one national government per country, no per-region
 *    executive). Defaults to "pro" — mainline's own neutral middle stance,
 *    "Pro-Devolution: neutral on the national question" (devolution.ts:105)
 *    — so the policy and regional-approval-mandate drivers below are
 *    deliberately inert until a future wave adds a devolved-FM system.
 *  - `regionalApproval` / `nationalApproval`: Rotunda has no approval-rating
 *    system (grepped: no government/politician "approval" concept beyond
 *    per-politician `favorability`, which is not the same thing mainline
 *    means by devolved-government/PM approval). Both default to 50 (the
 *    formulas' own neutral point — `linearApprovalDrift`/
 *    `regionalApprovalDrift` both return exactly 0 at 50).
 * Real, live input:
 *  - `inflationPercent`: `world.countries["UK"].economy.inflationRate * 100`
 *    (Rotunda's inflationRate is a fraction, mainline's constant expects an
 *    annualised percent) — genuinely available and wired, so independence
 *    desire is NOT fully inert: it responds to real UK inflation plus the
 *    mean-reversion floor every turn, exactly as mainline computes it.
 *
 * Not ported this wave: mainline's separate `independenceDesireHook.ts`
 * (src/lib/turn/election/independenceDesireHook.ts), a soft nudge on UK
 * devolved-region election vote shares driven by the same desire value —
 * a distinct mechanism from drift/referendum, cited here only so it is not
 * confused with this file; PORT-STUB, out of scope.
 */

export type DevolutionPolicy = "anti" | "pro" | "independence";

/** UK regions with a devolution axis. Ports UK_DEVOLUTION_REGIONS (devolution.ts:16). */
export const UK_DEVOLUTION_REGIONS: ReadonlySet<string> = new Set(["SCO", "WAL", "NIR"]);

// ─── Constants, ported verbatim (src/lib/constants/devolution.ts) ─────────

export const DEVOLUTION_POLICY_DRIFT: Record<DevolutionPolicy, number> = {
  anti: -0.04,
  pro: 0,
  independence: 0.05,
};

export const DEVOLUTION_POLICY_APPROVAL_DIRECTION: Record<DevolutionPolicy, number> = {
  anti: -1,
  pro: 0,
  independence: 1,
};

export const APPROVAL_DRIFT_PER_POINT = 0.001;

export const MEAN_REVERSION_TARGET = 25;
export const MEAN_REVERSION_RATE = 0.003;

function linearApprovalDrift(approval: number): number {
  const distance = Math.floor(Math.abs(approval - 50));
  if (distance === 0) return 0;
  const sign = approval < 50 ? 1 : -1;
  return sign * distance * APPROVAL_DRIFT_PER_POINT;
}

export function regionalApprovalDrift(approval: number, policy: DevolutionPolicy): number {
  const direction = DEVOLUTION_POLICY_APPROVAL_DIRECTION[policy];
  if (direction === 0) return 0;
  const distance = Math.floor(Math.abs(approval - 50));
  if (distance === 0) return 0;
  const mandateSign = approval >= 50 ? 1 : -1;
  return mandateSign * distance * APPROVAL_DRIFT_PER_POINT * direction;
}

export function nationalApprovalDrift(approval: number): number {
  return linearApprovalDrift(approval);
}

export function inflationDrift(inflationPercent: number): number {
  if (inflationPercent > 5) return 0.02;
  if (inflationPercent >= 2) return 0;
  return -0.01;
}

export function meanReversionDrift(current: number): number {
  if (current > MEAN_REVERSION_TARGET) return -MEAN_REVERSION_RATE;
  if (current < MEAN_REVERSION_TARGET) return MEAN_REVERSION_RATE;
  return 0;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export interface IndependenceDesireDriftDrivers {
  policy: number;
  regionalApproval: number;
  nationalApproval: number;
  inflation: number;
  meanReversion: number;
}

/**
 * Pure compute — verbatim port of `computeIndependenceDesireDriftSnapshot`
 * (independenceDesireDrift.ts:56-83). No WorldState, no RNG.
 */
export function computeIndependenceDesireDriftSnapshot(args: {
  previous: number;
  policy: DevolutionPolicy;
  regionalApproval: number;
  nationalApproval: number;
  inflationPercent: number;
}): { drivers: IndependenceDesireDriftDrivers; delta: number; next: number } {
  const { previous, policy, regionalApproval, nationalApproval, inflationPercent } = args;
  const drivers: IndependenceDesireDriftDrivers = {
    policy: DEVOLUTION_POLICY_DRIFT[policy],
    regionalApproval: regionalApprovalDrift(regionalApproval, policy),
    nationalApproval: nationalApprovalDrift(nationalApproval),
    inflation: inflationDrift(inflationPercent),
    meanReversion: meanReversionDrift(previous),
  };
  const delta =
    drivers.policy + drivers.regionalApproval + drivers.nationalApproval + drivers.inflation + drivers.meanReversion;
  const next = round2(clamp(previous + delta, 0, 100));
  return { drivers, delta: round2(delta), next };
}

/**
 * WorldState-wired driver (solo analogue of src/lib/turn/independenceDesireDrift.ts).
 * Runs the drift for each of SCO/WAL/NIR against Rotunda's live UK inflation
 * rate and the PORT-STUB neutral defaults documented in this file's header.
 * RNG-free (mainline's own drift compute is RNG-free too).
 */
export function runIndependenceDesireDrift(world: WorldState): void {
  const uk = world.countries["UK"];
  const inflationPercent = (uk?.economy.inflationRate ?? 0) * 100;
  for (const regionId of UK_DEVOLUTION_REGIONS) {
    const region = world.regions[regionId];
    if (!region) continue;
    const previous = region.independenceDesire ?? MEAN_REVERSION_TARGET;
    const { next } = computeIndependenceDesireDriftSnapshot({
      previous,
      policy: "pro",
      regionalApproval: 50,
      nationalApproval: 50,
      inflationPercent,
    });
    region.independenceDesire = next;
  }
}
