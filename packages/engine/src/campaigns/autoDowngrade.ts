import type { Campaign, CampaignOpsTree } from "../types.js";
import { OPS_TREES, getTreeMaintenanceCost, type UpgradeCategory, type OpsBranchKey } from "./upgradeCosts.js";

export interface DowngradeEntry {
  category: UpgradeCategory;
  branch?: OpsBranchKey;
  fromLevel: number;
  toLevel: number;
}

export interface AutoDowngradeResult {
  /** Maintenance (anchor $, aggregate) after demotions. */
  newMaintenance: number;
  /** Per-category tree patches to apply (mirrors mainline's Mongo $set fields). */
  patches: Partial<Record<UpgradeCategory, CampaignOpsTree>>;
  downgrades: DowngradeEntry[];
}

/**
 * Compute the minimal set of single-step demotions to keep a campaign
 * solvent this turn (`funds + income >= maintenance`). Ported from
 * src/lib/campaigns/autoDowngrade.ts computeAutoDowngrade, tree-only (see
 * upgradeCosts.ts file doc — mainline's legacy-level demotion path has no
 * solo campaign to act on, since every campaign is tree-model from creation).
 *
 * Demotes the maintenance-bearing branch tier with the highest incremental
 * upkeep across every started lever, repeating until solvent or nothing
 * left to cut; once every maintenance-bearing branch on a lever is at 0, the
 * lever's own starter upkeep can still be shed by dropping the whole lever.
 */
export function computeAutoDowngrade(
  campaign: Pick<Campaign, "fundraisingTree" | "oppositionResearchTree" | "groundGameTree" | "mediaSpendingTree">,
  input: { funds: number; income: number; electionType?: string },
): AutoDowngradeResult {
  const { funds, income, electionType } = input;
  const projected = funds + income;

  const trees: Record<UpgradeCategory, CampaignOpsTree> = {
    fundraising: { ...campaign.fundraisingTree },
    groundGame: { ...campaign.groundGameTree },
    mediaSpending: { ...campaign.mediaSpendingTree },
    oppositionResearch: { ...campaign.oppositionResearchTree },
  };

  const patches: Partial<Record<UpgradeCategory, CampaignOpsTree>> = {};
  const downgrades: DowngradeEntry[] = [];

  const total = () => {
    let sum = 0;
    for (const category of Object.keys(trees) as UpgradeCategory[]) {
      sum += getTreeMaintenanceCost(category, trees[category], electionType);
    }
    return sum;
  };
  let maintenance = total();

  let guard = 0;
  while (maintenance > projected && guard++ < 64) {
    let best: { delta: number; apply: () => void } | null = null;

    for (const category of Object.keys(trees) as UpgradeCategory[]) {
      const tree = trees[category];
      if (tree.starter) {
        for (const branchDef of OPS_TREES[category].branches) {
          const level = tree[branchDef.key];
          if (level <= 0) continue;
          if (!branchDef.tiers.some((t) => (t.maintenance ?? 0) > 0)) continue;
          const before = maintenance;
          tree[branchDef.key] = level - 1;
          const after = total();
          tree[branchDef.key] = level; // restore
          const delta = before - after;
          if (delta > 0 && (!best || delta > best.delta)) {
            best = {
              delta,
              apply: () => {
                tree[branchDef.key] = level - 1;
                patches[category] = { ...tree, [branchDef.key]: level - 1 };
                downgrades.push({ category, branch: branchDef.key, fromLevel: level, toLevel: level - 1 });
              },
            };
          }
        }
        const upkeepBranchesZero = OPS_TREES[category].branches.every(
          (bd) => tree[bd.key] === 0 || !bd.tiers.some((t) => (t.maintenance ?? 0) > 0),
        );
        if (upkeepBranchesZero && (OPS_TREES[category].starter.maintenance ?? 0) > 0) {
          const before = maintenance;
          const saved = { a: tree.a, b: tree.b, c: tree.c };
          tree.starter = false;
          tree.a = 0;
          tree.b = 0;
          tree.c = 0;
          const after = total();
          tree.starter = true; // restore
          tree.a = saved.a;
          tree.b = saved.b;
          tree.c = saved.c;
          const delta = before - after;
          if (delta > 0 && (!best || delta > best.delta)) {
            best = {
              delta,
              apply: () => {
                tree.starter = false;
                tree.a = 0;
                tree.b = 0;
                tree.c = 0;
                patches[category] = { starter: false, a: 0, b: 0, c: 0 };
                downgrades.push({ category, fromLevel: 1, toLevel: 0 });
              },
            };
          }
        }
      }
    }

    if (!best) break;
    best.apply();
    maintenance = total();
  }

  return { newMaintenance: maintenance, patches, downgrades };
}
