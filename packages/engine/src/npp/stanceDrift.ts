/**
 * NPP stance drift — nudges each politician's economic/social ideology toward
 * a per-NPP TARGET each interval, gated by stubbornness.
 *
 * Port of src/lib/turn/nppStanceDrift.ts (mainline) adapted to WorldState.
 * Source: src/lib/turn/nppStanceDrift.ts processNppStanceDrift
 * Fix source: src/lib/npp/stanceTarget.ts (NPP_LEAN_PULL, NPP_STANCE_SPREAD,
 * nppStanceTarget, nppIdiosyncrasy) — the stance-mimicry fix.
 *
 * Drift-only by design: reads each politician's CURRENT ideology and nudges
 * toward the party-anchored target (not raw state lean). The target is
 * party-anchored and only pulled part-way toward the state lean, with a
 * stable per-NPP offset. See stanceTarget.ts.
 *
 * Determinism: all randomness via hash of politician id (deterministic offset),
 * no WorldRng draw. But we accept rng param for future symmetry; not used for
 * now to keep RNG stream unused so determinism tests stay focused.
 *
 * State lean source: in mainline, lean comes from State.cachedEconomicLean /
 * cachedSocialLean per homeState. In solo, we derive lean from partyRegions
 * aggregate or from party position when region lean unavailable. We use a
 * lightweight heuristic: per-country average of party economicPosition weighted
 * by registration, but clamped to [-2,2] to avoid extreme. For determinism we
 * use party position directly when region lean unavailable. The key property
 * preserved is party-anchored target + idiosyncrasy prevents mimicry.
 */

import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import { nppStanceTarget } from "./stanceTarget.js";

/** Run the drift once every N turns to keep it slow and bounded. */
export const NPP_STANCE_DRIFT_INTERVAL = 6;
/** Max stance movement per drift on the −5…+5 axis (before stubbornness gate). */
export const NPP_STANCE_DRIFT_MAX_STEP = 0.3;

const STANCE_MIN = -5;
const STANCE_MAX = 5;
const STUBBORNNESS_MAX = 100;

/** Per-drift step for a politician: fully mobile at stubbornness 0, immovable at 100. */
export function nppDriftStep(stubbornness: number): number {
  const mobility = 1 - Math.max(0, Math.min(1, stubbornness / STUBBORNNESS_MAX));
  return NPP_STANCE_DRIFT_MAX_STEP * mobility;
}

/** Nudge one stance axis toward the target by at most `step`, clamped to [−5, 5]. */
export function driftStanceAxis(current: number, target: number, step: number): number {
  const delta = Math.max(-step, Math.min(step, target - current));
  const next = Math.max(STANCE_MIN, Math.min(STANCE_MAX, current + delta));
  return Math.round(next * 10) / 10;
}

/**
 * Derive a state's lean for drift target when we lack mainline's cached lean.
 * In solo, use the per-region registration-weighted party lean: average of
 * party positions weighted by registration share in that region. Falls back to 0
 * when no data.
 */
function deriveRegionLean(
  world: WorldState,
  regionId: string,
): { economic: number; social: number } | null {
  // Find all partyRegions for this region
  const entries = Object.entries(world.partyRegions).filter(([k]) => k.startsWith(`${regionId}:`));
  if (entries.length === 0) return null;
  let totalReg = 0;
  let econSum = 0;
  let socialSum = 0;
  for (const [, pr] of entries) {
    const party = world.parties[pr.partyId];
    if (!party) continue;
    const reg = pr.registration ?? 0;
    totalReg += reg;
    econSum += party.economicPosition * reg;
    socialSum += party.socialPosition * reg;
  }
  if (totalReg === 0) return null;
  const econLean = econSum / totalReg;
  const socialLean = socialSum / totalReg;
  return { economic: econLean, social: socialLean };
}

/**
 * Turn phase: drift every seated politician's ideology toward its region lean.
 * No-op except every NPP_STANCE_DRIFT_INTERVAL turns.
 *
 * Source: src/lib/turn/nppStanceDrift.ts processNppStanceDrift
 */
export const nppStanceDriftPhase: import("../phases/types.js").TurnPhase = {
  name: "nppStanceDrift",
  run(world: WorldState, rng: WorldRng) {
    processNppStanceDrift(world, rng);
  },
};

export function processNppStanceDrift(world: WorldState, _rng: WorldRng): { drifted: number } {
  if (world.meta.turn % NPP_STANCE_DRIFT_INTERVAL !== 0) return { drifted: 0 };
  if (world.politicians.length === 0) return { drifted: 0 };

  let drifted = 0;
  for (const pol of world.politicians) {
    const personality = (pol as unknown as { personality?: { stubbornness?: number } }).personality;
    const stubbornness = personality?.stubbornness ?? 50;
    const step = nppDriftStep(stubbornness);
    if (step <= 0) continue;

    // Home region: for US politicians, derive from electedState if present;
    // otherwise pick a region from partyRegions for that politician's country.
    let regionId: string | null = null;
    if (pol.electedState) {
      regionId = pol.electedState;
      if (!world.regions[regionId]) regionId = null;
    }
    if (!regionId) {
      // Pick first region of this politician's country deterministically
      const regions = Object.values(world.regions)
        .filter((r) => r.countryId === pol.countryId)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (regions.length > 0) regionId = regions[0]!.id;
    }

    let lean: { economic: number; social: number } | null = null;
    if (regionId) lean = deriveRegionLean(world, regionId);

    const stateLeanEcon = lean?.economic ?? 0;
    const stateLeanSocial = lean?.social ?? 0;

    const party = world.parties[pol.partyId];
    const partyEcon = party?.economicPosition ?? 0;
    const partySocial = party?.socialPosition ?? 0;

    const targetEcon = nppStanceTarget(partyEcon, stateLeanEcon, pol.id, "economic");
    const targetSocial = nppStanceTarget(partySocial, stateLeanSocial, pol.id, "social");

    const curEcon = pol.ideology.economic;
    const curSocial = pol.ideology.social;

    const nextEcon = driftStanceAxis(curEcon, targetEcon, step);
    const nextSocial = driftStanceAxis(curSocial, targetSocial, step);
    if (nextEcon === curEcon && nextSocial === curSocial) continue;

    pol.ideology.economic = nextEcon;
    pol.ideology.social = nextSocial;
    drifted++;
  }
  return { drifted };
}
