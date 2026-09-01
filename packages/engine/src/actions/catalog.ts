/**
 * Action catalog.
 * Ports src/lib/actions.ts ActionDefinition + costs + fundraise quote logic
 * (actions.fundraiseQuote) at mainline-neutral values. Each entry lists cost,
 * cooldown, fund cost, and target system. Entries whose blocking system is not
 * yet ported get PORT-STUB unavailable status so UI can gray them out honestly.
 *
 * Deterministic pure definitions; no RNG.
 */

import { fundraiseYield } from "./fundGeneration.js";

export type ActionId =
  | "fundraise"
  | "campaign"
  | "advertise"
  | "buildDonorBase"
  | "poll"
  | "pollLarge"
  | "convertCash"
  | "rest"
  | "canvass"
  | "organize"
  | "pressureBoost"
  | "investInfluence";

// Costs mirror mainline's dynamic tier functions but collapsed to neutral
// goldens for solo's simpler state (no per-state GDP tier). Cited.
export interface ActionCatalogEntry {
  id: ActionId;
  name: string;
  description: string;
  /** Action-point cost (before influence/favorability tier overrides) */
  baseCost: number;
  /** Cooldown in turns after execution before next available */
  cooldown: number;
  /** Fund cost flat (before scaling); 0 means no treasury check */
  fundCost: number;
  /** Target system(s) this action touches */
  systems: string[];
  /** Whether the action is available given ported systems */
  status: "available" | "unavailable";
  /** When unavailable, which blocking system is named */
  blockingSystem?: string;
  /** Compute dynamic cost for an actor's current stats (for UI quote) */
  quotedActionCost?: (donorBaseLevel: number, politicalInfluence: number, favorability: number) => number;
  /** Fundraise quote helper: actions.fundraiseQuote per brief */
  fundraiseQuote?: (donorBaseLevel: number, politicalInfluence: number) => number;
}

// Dynamic helpers ported from src/lib/actions.ts (neutral values)
function campaignActionCost(politicalInfluence: number): number {
  const v = Math.max(0, Math.min(100, politicalInfluence));
  if (v >= 80) return 5;
  if (v >= 60) return 4;
  if (v >= 40) return 3;
  if (v >= 20) return 2;
  return 1;
}

function advertiseActionCost(favorability: number): number {
  const v = Math.max(0, Math.min(100, favorability));
  if (v >= 85) return 9;
  if (v >= 70) return 8;
  if (v >= 50) return 7;
  if (v >= 30) return 6;
  return 5;
}

function donorActionCost(donorBaseLevel: number, action: "fundraise" | "buildDonorBase"): number {
  if (action === "fundraise") return 3;
  return Math.min(20, Math.round(4 + Math.pow(donorBaseLevel / 75, 1.4) * 16));
}

export const ACTION_CATALOG: Record<ActionId, ActionCatalogEntry> = {
  fundraise: {
    id: "fundraise",
    name: "Fundraise",
    description: "Raise campaign funds from your donor base. Yield scales with donor base and influence per actions.fundraiseQuote.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["funds"],
    status: "available",
    quotedActionCost: (donor: number) => donorActionCost(donor, "fundraise"),
    fundraiseQuote: (donor, influence) => fundraiseYield(donor, influence),
  },
  campaign: {
    id: "campaign",
    name: "Campaign",
    description: "Increase political influence and candidate support. Cost scales with influence tier.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 20000,
    systems: ["support", "partyInfluence"],
    status: "available",
    quotedActionCost: (_donor, influence) => campaignActionCost(influence),
  },
  advertise: {
    id: "advertise",
    name: "Run Advertisements",
    description: "Boost favorability via ads. Fund cost scales with favorability tier.",
    baseCost: 5,
    cooldown: 1,
    fundCost: 100_000,
    systems: ["favorability"],
    status: "available",
    quotedActionCost: (_donor, _inf, fav) => advertiseActionCost(fav),
  },
  buildDonorBase: {
    id: "buildDonorBase",
    name: "Build Donor Network",
    description: "Expand donor base; increases future fundraise yield and generation.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 3000,
    systems: ["donorBase"],
    status: "available",
    quotedActionCost: (donor) => donorActionCost(donor, "buildDonorBase"),
  },
  poll: {
    id: "poll",
    name: "Quick Poll",
    description: "Commission a quick poll. No persistent world effect in solo yet.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 25_000,
    systems: ["polling"],
    status: "unavailable",
    blockingSystem: "polling/election polling",
  },
  pollLarge: {
    id: "pollLarge",
    name: "Full Demographic Poll",
    description: "Comprehensive poll with full breakdown. No persistent effect yet.",
    baseCost: 6,
    cooldown: 1,
    fundCost: 75_000,
    systems: ["polling"],
    status: "unavailable",
    blockingSystem: "polling/election polling",
  },
  convertCash: {
    id: "convertCash",
    name: "Personal Campaign Donation",
    description: "Convert personal cash to campaign funds at 50% (infamy scales with amount).",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["cash", "funds", "infamy"],
    status: "available",
  },
  rest: {
    id: "rest",
    name: "Rest",
    description: "Take a break. No effect.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: [],
    status: "available",
  },
  canvass: {
    id: "canvass",
    name: "Canvass",
    description: "GOTV canvass: boost turnout modifiers in a target region.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 15000,
    systems: ["GOTV/turnout"],
    status: "available",
  },
  organize: {
    id: "organize",
    name: "Organize",
    description: "Build regional organization for your party in a target region.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 10000,
    systems: ["org/partyRegions"],
    status: "available",
  },
  pressureBoost: {
    id: "pressureBoost",
    name: "Apply Pressure",
    description: "Increase political pressure for your party in a region.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 8000,
    systems: ["pressure/partyPressures"],
    status: "available",
  },
  investInfluence: {
    id: "investInfluence",
    name: "Invest Party Influence",
    description: "Spend accumulated party influence to gain bonus actions.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["partyInfluence"],
    status: "available",
  },
};

export function getActionCost(entry: ActionCatalogEntry, donorBaseLevel: number, politicalInfluence: number, favorability: number): number {
  if (entry.quotedActionCost) return entry.quotedActionCost(donorBaseLevel, politicalInfluence, favorability);
  return entry.baseCost;
}

// For tests: actions.fundraiseQuote
export function fundraiseQuote(donorBaseLevel: number, politicalInfluence: number): number {
  return fundraiseYield(donorBaseLevel, politicalInfluence);
}
