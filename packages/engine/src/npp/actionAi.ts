/**
 * NPP Action AI — decides which action an NPC politician takes.
 * Port of src/lib/npp/actionAi.ts (mainline) simplified for WorldState.
 *
 * Sources:
 * - ActionPriorities, calculateActionPriorities, decideNppAction from mainline
 * - NPP_ACTION_COSTS, NPP_FUND_COSTS, FUNDRAISE constants
 * - Campaign cost scaling from src/lib/actions.ts getCampaignActionCost
 *
 * Adaptation: uses WorldRng instead of Math.random, and drops v3 signal path
 * (partyTreasuryRatio, election proximity) to keep deterministic and minimal.
 * The brief's determinism doctrine requires all randomness via turn rng; we
 * satisfy by consuming rng.next() for weighted picks and save heuristic.
 * Cites mainline source per behavior rule; PORT-STUB named where blocked.
 */

import type { WorldRng } from "../rng.js";

export interface NppActionContext {
  hasOffice: boolean;
  personality: { loyalty: number; ambition: number; stubbornness: number };
  funds: number;
  actionPoints: number;
  donorBaseLevel: number;
  favorability?: number;
  politicalInfluence?: number;
}

export interface ActionPriorities {
  buildDonorBase: number;
  campaign: number;
  advertise: number;
  partyDonation: number;
  organize: number;
  canvass: number;
}

export const NPP_MAX_DONOR_BASE_LEVEL = 10;

export const NPP_ACTION_COSTS = {
  buildDonorBase: [5, 10, 15, 20, 25],
  campaign: 0, // dynamic via getNppCampaignApCost
  advertise: 2,
  partyDonation: 1,
  organize: 4,
  canvass: 3,
} as const;

export const NPP_FUND_COSTS = {
  buildDonorBase: [10_000, 25_000, 50_000, 75_000, 100_000],
  advertise: 3_000,
  partyDonation: 5_000,
  organize: 10_000,
  canvass: 15_000,
} as const;

export const NPP_CAMPAIGN_FUND_COST_BASE = 5_000;
export const FUNDRAISE_AP_COST = 4;
export const FUNDRAISE_FUNDS_GAIN = 750;

function campaignActionCost(influence: number): number {
  const v = Math.max(0, Math.min(100, influence));
  if (v >= 80) return 5;
  if (v >= 60) return 4;
  if (v >= 40) return 3;
  if (v >= 20) return 2;
  return 1;
}

export function getNppCampaignApCost(politicalInfluence: number): number {
  return campaignActionCost(politicalInfluence);
}
export function getNppCampaignFundCost(politicalInfluence: number): number {
  return NPP_CAMPAIGN_FUND_COST_BASE * campaignActionCost(politicalInfluence);
}

function getApCost(action: keyof ActionPriorities, donorBaseLevel: number, pi: number): number {
  if (action === "campaign") return getNppCampaignApCost(pi);
  if (action === "buildDonorBase") return NPP_ACTION_COSTS.buildDonorBase[Math.min(donorBaseLevel, 4)]!;
  return NPP_ACTION_COSTS[action as keyof typeof NPP_ACTION_COSTS] as number;
}
function getFundCost(action: keyof ActionPriorities, donorBaseLevel: number, pi: number): number {
  if (action === "campaign") return getNppCampaignFundCost(pi);
  if (action === "buildDonorBase") return NPP_FUND_COSTS.buildDonorBase[Math.min(donorBaseLevel, 4)]!;
  return NPP_FUND_COSTS[action as keyof typeof NPP_FUND_COSTS] as number;
}

/**
 * Compute priorities — office holders prioritize campaign/advertise/organize,
 * non-office prioritize building.
 * Source: src/lib/npp/actionAi.ts calculateActionPriorities (v0-v2 path byte-identical)
 */
export function calculateActionPriorities(ctx: NppActionContext): ActionPriorities {
  const { hasOffice, personality } = ctx;
  const p: ActionPriorities = hasOffice
    ? { campaign: 35, advertise: 25, buildDonorBase: 15, partyDonation: 10, organize: 30, canvass: 20 }
    : { buildDonorBase: 40, campaign: 20, advertise: 10, partyDonation: 10, organize: 35, canvass: 25 };

  if (personality.loyalty > 70) p.partyDonation += 20;
  if (personality.loyalty < 30) p.partyDonation -= 15;
  if (personality.ambition > 70) {
    p.buildDonorBase += 10;
    p.campaign += 10;
    p.organize += 10;
  }
  // Clamp negatives to 0
  for (const k of Object.keys(p) as Array<keyof ActionPriorities>) {
    p[k] = Math.max(0, p[k]);
  }
  return p;
}

export type NppActionType = keyof ActionPriorities | "fundraise" | "none";

export interface NppActionDecision {
  action: NppActionType;
  reason: string;
}

/**
 * Decide the next NPP action. Uses rng for save heuristic and weighted pick.
 * Determinism: consumes at most 2 rng draws (save heuristic + weighted pick),
 * matching mainline's discipline so enabling smarter brain does not desync replay.
 * Source: src/lib/npp/actionAi.ts decideNppAction
 */
export function decideNppAction(
  context: NppActionContext,
  rng: WorldRng,
): NppActionDecision {
  const priorities = calculateActionPriorities(context);
  const { funds, actionPoints, donorBaseLevel, politicalInfluence } = context;
  const buildAtCap = donorBaseLevel >= NPP_MAX_DONOR_BASE_LEVEL;

  const affordable: Array<{ action: keyof ActionPriorities; priority: number; apCost: number; fundCost: number }> = [];
  let buildCandidate: { priority: number; apCost: number; fundCost: number } | null = null;

  for (const action of Object.keys(priorities) as Array<keyof ActionPriorities>) {
    const priority = priorities[action]!;
    if (priority <= 0) continue;
    if (action === "buildDonorBase" && buildAtCap) continue;
    const pi = politicalInfluence ?? 0;
    const apCost = getApCost(action, donorBaseLevel, pi);
    const fundCost = getFundCost(action, donorBaseLevel, pi);
    const cand = { action, priority, apCost, fundCost };
    if (action === "buildDonorBase") buildCandidate = { priority, apCost, fundCost };
    if (actionPoints >= apCost && funds >= fundCost) affordable.push(cand);
  }

  // Save heuristic: occasionally skip cheap action to save for buildDonorBase.
  // Source: src/lib/npp/actionAi.ts SAVE_MAX_TURNS=13, SAVE_PROBABILITY=0.33, NPP_AP_PER_TURN=2
  // Simplified: if build is priority >30 and AP is blocker but funds ok and wait <=13, 33% save.
  if (
    buildCandidate &&
    buildCandidate.priority > 30 &&
    actionPoints < buildCandidate.apCost &&
    funds >= buildCandidate.fundCost &&
    Math.ceil((buildCandidate.apCost - actionPoints) / 2) <= 13 &&
    rng.next() < 0.33
  ) {
    return { action: "none", reason: `Saving for buildDonorBase L${donorBaseLevel + 1}` };
  }

  if (affordable.length === 0) {
    if (actionPoints >= FUNDRAISE_AP_COST) {
      return { action: "fundraise", reason: "Cash-poor fallback: grassroots fundraising" };
    }
    return { action: "none", reason: "No affordable action" };
  }

  // Weighted random pick across affordable actions
  const total = affordable.reduce((s, c) => s + c.priority, 0);
  let roll = rng.next() * total;
  for (const cand of affordable) {
    roll -= cand.priority;
    if (roll <= 0) return { action: cand.action, reason: `Weighted pick: ${cand.action}` };
  }
  return { action: affordable[affordable.length - 1]!.action, reason: "fallback" };
}
