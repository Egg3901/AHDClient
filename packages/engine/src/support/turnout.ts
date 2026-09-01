/**
 * Turnout decay and GOTV helpers.
 * Ports src/lib/utils/turnoutDecay.ts, diminishingReturns.ts,
 * demographicTurnoutCalculations.ts, demographicAlignment.ts.
 * Deterministic pure helpers; modifiers clamped to [-20,+20].
 */

import {
  DIMINISHING_MAX,
  DOLLARS_PER_TURNOUT_POINT,
  TURNOUT_DECAY_RATE,
  TURNOUT_MAX_MODIFIER,
  TURNOUT_MIN_MODIFIER,
  TURNOUT_ZERO_THRESHOLD,
} from "./constants.js";

// Source: src/lib/utils/turnoutDecay.ts applyDecay
export function applyTurnoutDecay(modifier: number): number {
  const decayed = modifier * (1.0 - TURNOUT_DECAY_RATE);
  if (Math.abs(decayed) < TURNOUT_ZERO_THRESHOLD) return 0;
  return decayed;
}

// Source: src/lib/utils/diminishingReturns.ts
export function applyDiminishingReturns(currentModifier: number, boost: number): number {
  const factor = 1.0 - Math.abs(currentModifier) / DIMINISHING_MAX;
  return boost * Math.max(0, factor);
}

// Source: src/lib/utils/demographicAlignment.ts
export function isWithinTwoPoints(
  partyEcon: number,
  partySocial: number,
  demoEcon: number,
  demoSocial: number,
): boolean {
  return Math.abs(partyEcon - demoEcon) <= 2 && Math.abs(partySocial - demoSocial) <= 2;
}

export function calculateAlignmentMultiplier(
  partyEcon: number,
  partySocial: number,
  demoEcon: number,
  demoSocial: number,
): number {
  const distance = Math.abs(partyEcon - demoEcon) + Math.abs(partySocial - demoSocial);
  return Math.max(0.1, 1.0 - distance * 0.15);
}

// Source: src/lib/turn/demographicTurnoutCalculations.ts
export function calculateGOTVSpend(revenue: number, gotvPercent: number, flatPerTurn: number): number {
  if (gotvPercent > 0) return Math.floor(revenue * (gotvPercent / 100));
  if (flatPerTurn > 0) return flatPerTurn;
  return 0;
}

export function calculateNationalGOTVBoost(
  totalSpend: number,
  numStates: number,
  dollarsPerPoint: number,
  alignmentMultiplier: number,
): number {
  if (numStates === 0) return 0;
  const rawPerState = totalSpend / numStates;
  return (rawPerState / dollarsPerPoint) * alignmentMultiplier;
}

export function calculateStateGOTVBoost(spend: number, dollarsPerPoint: number, alignmentMultiplier: number): number {
  return (spend / dollarsPerPoint) * alignmentMultiplier;
}

export function applyBoost(
  modifiers: Record<string, Record<string, number>>,
  category: string,
  group: string,
  boost: number,
): void {
  const cat = modifiers[category];
  if (!cat) return;
  if (!(group in cat)) return;
  const current = cat[group] ?? 0;
  const adjusted = applyDiminishingReturns(current, boost);
  const next = Math.max(TURNOUT_MIN_MODIFIER, Math.min(TURNOUT_MAX_MODIFIER, current + adjusted));
  cat[group] = next;
}

/**
 * Voter-group leans per playable country for GOTV alignment.
 * PORT-STUB: mainline groups live in src/lib/demographics/countryDemographics.ts
 * per-country SSOT; Solo stubs with 2 groups per country whose leans match the
 * default parties so each party has at least one eligible group. Groups track
 * mainline's voterGroups-only shape (single category "voterGroups").
 * When W38 lands real demographics, replace this map with the content pack's
 * demographic categories.
 */
export interface VoterGroupLean {
  id: string;
  economicLean: number;
  socialLean: number;
}

export const VOTER_GROUPS_BY_COUNTRY: Record<string, VoterGroupLean[]> = {
  // US: urban progressives lean DEM (-2,-2), rural conservatives lean REP (2,2)
  US: [
    { id: "urban_progressives", economicLean: -2, socialLean: -2 },
    { id: "rural_conservatives", economicLean: 2, socialLean: 2 },
    { id: "suburban_moderates", economicLean: 0, socialLean: 0 },
  ],
  // UK: Labour vs Conservative leans matching UK_LAB (-2,-3) and UK_CON (2,2)
  UK: [
    { id: "urban_progressives", economicLean: -2, socialLean: -2 },
    { id: "rural_traditionalists", economicLean: 2, socialLean: 2 },
    { id: "suburban_centrists", economicLean: 0, socialLean: 0 },
  ],
  // RU: single-party state; CPSU -4/2 lean dominates; add neutral group
  RU: [
    { id: "workers", economicLean: -4, socialLean: 2 },
    { id: "urban_progressives", economicLean: -2, socialLean: -1 },
  ],
  // DD: SED -4/2 plus bloc parties; leaning groups similar to RU
  DD: [
    { id: "workers", economicLean: -4, socialLean: 2 },
    { id: "bloc_centrists", economicLean: -2, socialLean: 0 },
  ],
};

export function getVoterGroups(countryId: string): VoterGroupLean[] {
  return VOTER_GROUPS_BY_COUNTRY[countryId] ?? [{ id: "general", economicLean: 0, socialLean: 0 }];
}

export const DEFAULT_GOTV_CATEGORY = "voterGroups";
export const DOLLARS_PER_TURNOUT_POINT_DEFAULT = DOLLARS_PER_TURNOUT_POINT;

/**
 * PORT-STUB revenue for GOTV spend calculation.
 * Mainline: revenue = sum of tax income from fundGeneration per member (src/lib/turn/demographicTurnoutTurn.ts).
 * Solo: no fundGeneration; derive revenue from party-org fields per brief:
 *   revenue = organization (0-100) * 500 + politicalStrength (0-280) * 100
 * This keeps the door open to spend via organization and PS without a treasury
 * simulation. GOTV percent is applied on top via calculateGOTVSpend.
 * Cited as PORT-STUB at mainline-neutral scale (org 0 -> revenue 0, org 50 + PS 20 -> ~27k).
 */
export function stubRevenueFromOrgPs(organization: number, politicalStrength: number): number {
  const org = Math.max(0, Math.min(100, organization));
  const ps = Math.max(0, politicalStrength);
  return Math.floor(org * 500 + ps * 100);
}
