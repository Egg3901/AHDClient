import type { Campaign } from "../types.js";
import { FUNDRAISING_BASE_INCOME, OPS_TREES, getCampaignFamilyScalar, getOpsBranchMagnitude } from "./upgradeCosts.js";

/**
 * Per-turn passive campaign income (anchor $ scaled by race family).
 * Ported from src/lib/campaigns/income.ts calculateCampaignIncome, tree-only
 * (see upgradeCosts.ts file doc for the dropped legacy-level branch).
 *
 *   started:   (starter base + Grassroots(a) recurring) × (1 + Direct Mail(c) multiplier)
 *   unstarted: FUNDRAISING_BASE_INCOME ($20k) × scalar
 */
export function calculateCampaignIncome(campaign: Pick<Campaign, "fundraisingTree">, electionType?: string): number {
  const scalar = getCampaignFamilyScalar(electionType);
  const tree = campaign.fundraisingTree;
  if (tree.starter) {
    const base = OPS_TREES.fundraising.starter.magnitude + getOpsBranchMagnitude("fundraising", "a", tree.a);
    const multiplier = 1 + getOpsBranchMagnitude("fundraising", "c", tree.c);
    return Math.round(base * multiplier * scalar);
  }
  return Math.round(FUNDRAISING_BASE_INCOME * scalar);
}
