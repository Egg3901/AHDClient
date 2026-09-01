import type { Campaign } from "../types.js";
import { OPS_TREES, getTreeMaintenanceCost, type UpgradeCategory } from "./upgradeCosts.js";

/**
 * Per-turn maintenance for a campaign's Strategic Operations upkeep (anchor
 * $ scaled by race family). Ported from src/lib/campaigns/maintenance.ts
 * calculateMaintenanceCosts, tree-only (legacy-level fallback dropped, see
 * upgradeCosts.ts file doc — an unstarted tree costs 0 maintenance either way).
 */
export function calculateMaintenanceCosts(
  campaign: Pick<Campaign, "fundraisingTree" | "oppositionResearchTree" | "groundGameTree" | "mediaSpendingTree">,
  electionType?: string,
): number {
  const trees: Record<UpgradeCategory, Campaign["fundraisingTree"]> = {
    fundraising: campaign.fundraisingTree,
    oppositionResearch: campaign.oppositionResearchTree,
    groundGame: campaign.groundGameTree,
    mediaSpending: campaign.mediaSpendingTree,
  };
  let total = 0;
  for (const category of Object.keys(OPS_TREES) as UpgradeCategory[]) {
    total += getTreeMaintenanceCost(category, trees[category], electionType);
  }
  return total;
}
