/**
 * Party tier (Major/Minor) pure logic.
 * Port of src/lib/parties/partyTier.ts — same thresholds, same hysteresis.
 */

export type PartyTier = "major" | "minor";

import {
  MINOR_PARTY_BASE_PS_CAP,
  MINOR_PARTY_PS_CAP_PER_REGION,
  TIER_EARN_REGION_ORG_PCT,
  TIER_LOSE_REGION_ORG_PCT,
  TIER_GRADUATION_REGION_FRACTION,
  TIER_DEMOTION_REGION_FRACTION,
  MAJOR_DEMOTION_GRACE_TURNS,
  NATIONAL_PS_CAP,
} from "./constants.js";

export function graduationThreshold(regionCount: number): number {
  return Math.ceil(regionCount * TIER_GRADUATION_REGION_FRACTION);
}

export function demotionThreshold(regionCount: number): number {
  return Math.ceil(regionCount * TIER_DEMOTION_REGION_FRACTION);
}

export function updateEarnedRegions(
  prevEarned: Iterable<string>,
  orgByRegion: Map<string, number>,
): string[] {
  const prev = new Set(prevEarned);
  const next = new Set<string>();
  for (const [region, org] of orgByRegion) {
    if (org >= TIER_EARN_REGION_ORG_PCT) {
      next.add(region);
    } else if (prev.has(region) && org >= TIER_LOSE_REGION_ORG_PCT) {
      next.add(region);
    }
  }
  return [...next].sort();
}

export function minorPartyPsCap(earnedRegionCount: number, nationalCap: number): number {
  const raw = MINOR_PARTY_BASE_PS_CAP + MINOR_PARTY_PS_CAP_PER_REGION * Math.max(0, earnedRegionCount);
  return Math.min(nationalCap, raw);
}

export function resolvePartyPsCap(tier: PartyTier, earnedRegionCount: number, nationalCap: number): number {
  return tier === "major" ? nationalCap : minorPartyPsCap(earnedRegionCount, nationalCap);
}

export interface TierTransitionInput {
  currentTier: PartyTier;
  orgByRegion: Map<string, number>;
  regionCount: number;
  warningStartedTurn: number | null;
  currentTurn: number;
  graceTurns?: number;
  exemptFromDemotion?: boolean;
}

export interface TierTransitionResult {
  tier: PartyTier;
  warningStartedTurn: number | null;
  changed: boolean;
  reason: "graduated" | "demoted" | "warning-started" | "warning-cleared" | "none";
}

export function resolveTierTransition(input: TierTransitionInput): TierTransitionResult {
  const grace = input.graceTurns ?? MAJOR_DEMOTION_GRACE_TURNS;

  if (input.exemptFromDemotion) {
    return {
      tier: "major",
      warningStartedTurn: null,
      changed: input.currentTier !== "major",
      reason:
        input.currentTier !== "major"
          ? "graduated"
          : input.warningStartedTurn != null
            ? "warning-cleared"
            : "none",
    };
  }

  let atEarn = 0;
  let atLose = 0;
  for (const org of input.orgByRegion.values()) {
    if (org >= TIER_EARN_REGION_ORG_PCT) atEarn++;
    if (org >= TIER_LOSE_REGION_ORG_PCT) atLose++;
  }
  const meetsGraduation = atEarn >= graduationThreshold(input.regionCount);
  const belowLose = input.regionCount - atLose;
  const atRisk = belowLose >= demotionThreshold(input.regionCount);

  if (input.currentTier === "minor") {
    if (meetsGraduation) {
      return { tier: "major", warningStartedTurn: null, changed: true, reason: "graduated" };
    }
    return { tier: "minor", warningStartedTurn: null, changed: false, reason: "none" };
  }

  if (meetsGraduation) {
    return {
      tier: "major",
      warningStartedTurn: null,
      changed: false,
      reason: input.warningStartedTurn != null ? "warning-cleared" : "none",
    };
  }

  const warningActive = input.warningStartedTurn != null;
  if (atRisk && !warningActive) {
    return {
      tier: "major",
      warningStartedTurn: input.currentTurn,
      changed: false,
      reason: "warning-started",
    };
  }
  if (warningActive) {
    if (input.currentTurn - (input.warningStartedTurn as number) >= grace) {
      return { tier: "minor", warningStartedTurn: null, changed: true, reason: "demoted" };
    }
    return {
      tier: "major",
      warningStartedTurn: input.warningStartedTurn,
      changed: false,
      reason: "none",
    };
  }
  return { tier: "major", warningStartedTurn: null, changed: false, reason: "none" };
}

export function nationalCapForCountry(): number {
  return NATIONAL_PS_CAP;
}
