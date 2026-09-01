/**
 * Strategic Operations v2 branch-tree costs and effect magnitudes (W26).
 *
 * Ported from src/lib/campaigns/upgradeCosts.ts. Mainline keeps BOTH a
 * legacy linear-level model (fundraisingLevel etc.) and the current
 * branch-tree model, the former retained only so pre-migration Mongo rows
 * keep working. Solo has no pre-migration rows — every Campaign is created
 * fresh via campaigns/lifecycle.ts with `{ starter: false, a: 0, b: 0, c: 0 }`
 * on all four trees — so only the tree model and the "unstarted tree" base
 * case are ported. The one legacy number that DOES matter is
 * FUNDRAISING_INCOME[0] = $20k/turn: mainline pays this to every campaign
 * regardless of tree state (see income.ts), so it is kept as
 * FUNDRAISING_BASE_INCOME rather than the full 11-entry table.
 */

/**
 * Per-race-family budget scalar applied to fundraising income, upgrade
 * costs, and ongoing maintenance. Verbatim
 * CAMPAIGN_FAMILY_SCALAR_BY_ELECTION_TYPE. Solo currently only spawns
 * "house" and "senate" elections (electionSeriesForWorld in
 * elections/orchestration.ts) among the eligible types, so those two
 * entries are load-bearing; the rest are ported for fidelity and are
 * PORT-STUB-dormant until solo grows president/governor/stateSenate/
 * non-US-national election types.
 */
export const CAMPAIGN_FAMILY_SCALAR_BY_ELECTION_TYPE: Readonly<Record<string, number>> = {
  president: 1.0,
  senate: 0.5,
  governor: 0.5,
  commons: 0.5,
  shugiin: 0.5,
  sangiin: 0.5,
  bundestag: 0.5,
  ministerPresident: 0.4,
  landtag: 0.4,
  house: 0.3,
  regionalCouncil: 0.3,
  stateSenate: 0.2,
  npcDelegate: 0.5,
  peoplesCongress: 0.3,
};

export function getCampaignFamilyScalar(electionType: string | undefined): number {
  if (!electionType) return 1.0;
  return CAMPAIGN_FAMILY_SCALAR_BY_ELECTION_TYPE[electionType] ?? 1.0;
}

/** L0 base fundraising income ($20k/turn at scalar 1.0) — every campaign earns this with no upgrade. */
export const FUNDRAISING_BASE_INCOME = 20_000;

export const OPS_MAX_BRANCH_LEVEL = 3;

export type UpgradeCategory = "fundraising" | "oppositionResearch" | "groundGame" | "mediaSpending";
export type OpsBranchKey = "a" | "b" | "c";

export type OpsEffectType =
  | "incomeFlat"
  | "incomeLumpOnPurchase"
  | "incomeMultiplier"
  | "swingPct"
  | "gotvPct"
  | "maintReductionPct"
  | "favPerTurn"
  | "oppoShieldPct"
  | "oppoFavPerTurn"
  | "oppoLumpOnPurchase"
  | "oppoAmpPct";

export interface OpsBranchTier {
  level: number;
  funds: number;
  actions: number;
  effect: string;
  magnitude: number;
  lumpSum?: number;
  maintenance?: number;
}

export interface OpsBranchDef {
  key: OpsBranchKey;
  label: string;
  effectType: OpsEffectType;
  description: string;
  tiers: OpsBranchTier[];
}

export interface OpsStarterDef {
  funds: number;
  actions: number;
  effect: string;
  magnitude: number;
  maintenance?: number;
}

export interface OpsTreeDef {
  starter: OpsStarterDef;
  branches: [OpsBranchDef, OpsBranchDef, OpsBranchDef];
}

// Verbatim OPS_TREES from src/lib/campaigns/upgradeCosts.ts.
export const OPS_TREES: Record<UpgradeCategory, OpsTreeDef> = {
  fundraising: {
    starter: { funds: 50_000, actions: 10, effect: "+$35k/turn base income", magnitude: 35_000 },
    branches: [
      {
        key: "a",
        label: "Grassroots",
        effectType: "incomeFlat",
        description: "Small-dollar donor network — steady recurring income each turn.",
        tiers: [
          { level: 1, funds: 150_000, actions: 15, effect: "+$200k/turn", magnitude: 200_000 },
          { level: 2, funds: 500_000, actions: 22, effect: "+$700k/turn", magnitude: 700_000 },
          { level: 3, funds: 1_500_000, actions: 30, effect: "+$1.8M/turn", magnitude: 1_800_000 },
        ],
      },
      {
        key: "b",
        label: "Bundlers",
        effectType: "incomeLumpOnPurchase",
        description: "Major-donor bundling — a large one-time cash infusion when purchased.",
        tiers: [
          { level: 1, funds: 120_000, actions: 18, effect: "+$250k now", magnitude: 0, lumpSum: 250_000 },
          { level: 2, funds: 320_000, actions: 24, effect: "+$700k now", magnitude: 0, lumpSum: 700_000 },
          { level: 3, funds: 700_000, actions: 32, effect: "+$1.5M now", magnitude: 0, lumpSum: 1_500_000 },
        ],
      },
      {
        key: "c",
        label: "Direct Mail",
        effectType: "incomeMultiplier",
        description: "Mail-order donor drive that multiplies ALL campaign income.",
        tiers: [
          { level: 1, funds: 200_000, actions: 16, effect: "+15% income", magnitude: 0.15, maintenance: 8_000 },
          { level: 2, funds: 500_000, actions: 22, effect: "+35% income", magnitude: 0.35, maintenance: 20_000 },
          { level: 3, funds: 1_100_000, actions: 30, effect: "+60% income", magnitude: 0.6, maintenance: 40_000 },
        ],
      },
    ],
  },

  groundGame: {
    starter: { funds: 55_000, actions: 10, effect: "+3% in swing areas", magnitude: 3, maintenance: 5_500 },
    branches: [
      {
        key: "a",
        label: "Field Offices",
        effectType: "swingPct",
        description: "Boots on the ground where the race is decided — swing-area performance.",
        tiers: [
          { level: 1, funds: 110_000, actions: 15, effect: "+4% swing", magnitude: 4, maintenance: 12_000 },
          { level: 2, funds: 240_000, actions: 20, effect: "+8% swing", magnitude: 8, maintenance: 30_000 },
          { level: 3, funds: 500_000, actions: 26, effect: "+12% swing", magnitude: 12, maintenance: 60_000 },
        ],
      },
      {
        key: "b",
        label: "Get-Out-The-Vote",
        effectType: "gotvPct",
        description: "Turnout machine — a smaller boost across ALL areas, not just swing.",
        tiers: [
          { level: 1, funds: 130_000, actions: 16, effect: "+1.5% everywhere", magnitude: 1.5, maintenance: 10_000 },
          { level: 2, funds: 300_000, actions: 22, effect: "+3% everywhere", magnitude: 3, maintenance: 24_000 },
          { level: 3, funds: 650_000, actions: 30, effect: "+5% everywhere", magnitude: 5, maintenance: 50_000 },
        ],
      },
      {
        key: "c",
        label: "Volunteer Corps",
        effectType: "maintReductionPct",
        description: "Unpaid volunteers cut the ground game's ongoing upkeep.",
        tiers: [
          { level: 1, funds: 90_000, actions: 12, effect: "-15% upkeep", magnitude: 0.15 },
          { level: 2, funds: 200_000, actions: 16, effect: "-30% upkeep", magnitude: 0.3 },
          { level: 3, funds: 420_000, actions: 22, effect: "-50% upkeep", magnitude: 0.5 },
        ],
      },
    ],
  },

  mediaSpending: {
    starter: { funds: 60_000, actions: 12, effect: "+0.5%/turn favorability", magnitude: 0.5, maintenance: 6_000 },
    branches: [
      {
        key: "a",
        label: "Broadcast",
        effectType: "favPerTurn",
        description: "Radio, newsreel and press buys. The strongest favorability driver, higher upkeep.",
        tiers: [
          { level: 1, funds: 120_000, actions: 16, effect: "+0.5%/turn", magnitude: 0.5, maintenance: 14_000 },
          { level: 2, funds: 280_000, actions: 20, effect: "+1.0%/turn", magnitude: 1.0, maintenance: 34_000 },
          { level: 3, funds: 600_000, actions: 26, effect: "+1.5%/turn", magnitude: 1.5, maintenance: 70_000 },
        ],
      },
      {
        key: "b",
        label: "Television",
        effectType: "favPerTurn",
        description: "Televised spots and appearances. Cheaper favorability with lower upkeep.",
        tiers: [
          { level: 1, funds: 80_000, actions: 12, effect: "+0.3%/turn", magnitude: 0.3, maintenance: 5_000 },
          { level: 2, funds: 180_000, actions: 16, effect: "+0.6%/turn", magnitude: 0.6, maintenance: 12_000 },
          { level: 3, funds: 380_000, actions: 22, effect: "+1.0%/turn", magnitude: 1.0, maintenance: 26_000 },
        ],
      },
      {
        key: "c",
        label: "Rapid Response",
        effectType: "oppoShieldPct",
        description: "War room that blunts opponents' opposition research against you.",
        tiers: [
          { level: 1, funds: 100_000, actions: 14, effect: "-25% incoming oppo", magnitude: 0.25, maintenance: 8_000 },
          { level: 2, funds: 220_000, actions: 18, effect: "-50% incoming oppo", magnitude: 0.5, maintenance: 18_000 },
          { level: 3, funds: 460_000, actions: 24, effect: "-75% incoming oppo", magnitude: 0.75, maintenance: 38_000 },
        ],
      },
    ],
  },

  oppositionResearch: {
    starter: { funds: 40_000, actions: 8, effect: "-0.5%/turn to target", magnitude: 0.5 },
    branches: [
      {
        key: "a",
        label: "Dossier",
        effectType: "oppoFavPerTurn",
        description: "Sustained research — recurring favorability drain on your target.",
        tiers: [
          { level: 1, funds: 80_000, actions: 12, effect: "-0.5%/turn", magnitude: 0.5 },
          { level: 2, funds: 180_000, actions: 16, effect: "-1.0%/turn", magnitude: 1.0 },
          { level: 3, funds: 400_000, actions: 22, effect: "-1.5%/turn", magnitude: 1.5 },
        ],
      },
      {
        key: "b",
        label: "Scandal Leak",
        effectType: "oppoLumpOnPurchase",
        description: "Drop the story now — a one-time favorability hit to your current target.",
        tiers: [
          { level: 1, funds: 120_000, actions: 18, effect: "-2% now", magnitude: 0, lumpSum: 2 },
          { level: 2, funds: 300_000, actions: 26, effect: "-4% now", magnitude: 0, lumpSum: 4 },
          { level: 3, funds: 650_000, actions: 36, effect: "-7% now", magnitude: 0, lumpSum: 7 },
        ],
      },
      {
        key: "c",
        label: "Counter-Intel",
        effectType: "oppoAmpPct",
        description: "Sharper tradecraft — amplifies your recurring research drain.",
        tiers: [
          { level: 1, funds: 90_000, actions: 12, effect: "+20% research", magnitude: 0.2 },
          { level: 2, funds: 200_000, actions: 16, effect: "+40% research", magnitude: 0.4 },
          { level: 3, funds: 420_000, actions: 22, effect: "+70% research", magnitude: 0.7 },
        ],
      },
    ],
  },
};

export function getOpsBranch(category: UpgradeCategory, branch: OpsBranchKey): OpsBranchDef | null {
  return OPS_TREES[category].branches.find((b) => b.key === branch) ?? null;
}

/** Cumulative effect magnitude for a branch at a given level (0 at level 0). */
export function getOpsBranchMagnitude(category: UpgradeCategory, branch: OpsBranchKey, level: number): number {
  if (level <= 0) return 0;
  const def = getOpsBranch(category, branch);
  const tier = def?.tiers.find((t) => t.level === level);
  return tier?.magnitude ?? 0;
}

export interface CampaignOpsTreeState {
  starter: boolean;
  a: number;
  b: number;
  c: number;
}

/**
 * Total per-turn maintenance for a lever's current tree state, in anchor $
 * scaled by race family. Verbatim getTreeMaintenanceCost.
 */
export function getTreeMaintenanceCost(
  category: UpgradeCategory,
  tree: CampaignOpsTreeState | undefined,
  electionType?: string,
): number {
  if (!tree?.starter) return 0;
  const def = OPS_TREES[category];
  let total = def.starter.maintenance ?? 0;
  let reduction = 0;
  for (const branchDef of def.branches) {
    const level = tree[branchDef.key];
    for (let i = 0; i < level; i++) {
      total += branchDef.tiers[i]?.maintenance ?? 0;
    }
    if (branchDef.effectType === "maintReductionPct" && level > 0) {
      reduction = branchDef.tiers[level - 1]?.magnitude ?? 0;
    }
  }
  total = total * (1 - reduction);
  const scalar = getCampaignFamilyScalar(electionType);
  return Math.round(total * scalar);
}

/**
 * Fully-adjusted cost to buy the next tier of a branch (or the starter when
 * `branch` is null). Verbatim getEffectiveBranchCost minus the
 * general-phase surcharge (GENERAL_PHASE_UPGRADE_MULTIPLIER): that surcharge
 * gates PLAYER-initiated upgrade purchases made during a race's general
 * phase (src/lib/campaigns/commands/campaignCommands.ts upgradeCampaign) —
 * no player-facing upgrade action exists in solo this wave (PORT-STUB,
 * blocked: desktop Campaign Manager UI), and NPC investment
 * (campaigns/npcInvestment.ts) always buys at the base rate, so the surcharge
 * has no caller here. Reinstate it verbatim when a player upgrade action lands.
 */
export function getEffectiveBranchCost(
  category: UpgradeCategory,
  branch: OpsBranchKey | null,
  nextLevel: number,
  electionType: string | undefined,
): { funds: number; actions: number; effect: string; maintenance?: number; lumpSum?: number } | null {
  const scalar = getCampaignFamilyScalar(electionType);
  if (branch === null) {
    const s = OPS_TREES[category].starter;
    return {
      funds: Math.round(s.funds * scalar),
      actions: s.actions,
      effect: s.effect,
      ...(s.maintenance != null ? { maintenance: Math.round(s.maintenance * scalar) } : {}),
    };
  }
  const def = getOpsBranch(category, branch);
  const tier = def?.tiers.find((t) => t.level === nextLevel);
  if (!tier) return null;
  return {
    funds: Math.round(tier.funds * scalar),
    actions: tier.actions,
    effect: tier.effect,
    ...(tier.maintenance != null ? { maintenance: Math.round(tier.maintenance * scalar) } : {}),
    ...(tier.lumpSum != null ? { lumpSum: Math.round(tier.lumpSum * scalar) } : {}),
  };
}
