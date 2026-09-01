import type { Campaign, CampaignOpsTree } from "../types.js";
import { campaignAnchorToLocal } from "./campaignCurrency.js";
import {
  OPS_MAX_BRANCH_LEVEL,
  getEffectiveBranchCost,
  type OpsBranchKey,
  type UpgradeCategory,
} from "./upgradeCosts.js";

/**
 * NPC campaign investment (W26 — NOT a mainline port).
 *
 * Mainline has no automated NPC campaign-upgrade purchasing: Campaign docs
 * for NPP candidates are created at createInitialCampaign's zero state
 * (src/lib/campaigns/createInitialCampaign.ts) and upgradeCampaign
 * (src/lib/campaigns/commands/campaignCommands.ts) is only ever called from
 * an authenticated player API route (verified: no caller of
 * upgradeCampaign/campaignCommands outside src/app/api/campaigns/**). An NPP
 * campaign in mainline therefore sits inert forever unless a human manager
 * (or a future mainline feature) spends on its behalf.
 *
 * That is precisely the gap the wave's CRITICAL GOAL calls out: NPC
 * candidates need to actually spend campaign funds for the ported
 * income/maintenance loop (phases.ts campaignTurnPhase, verbatim mainline
 * formulas) and the party-treasury subsidy (partySubsidy.ts, this wave's
 * sink) to mean anything. This module is the deterministic NPC AI that
 * fills that gap: each active NPP campaign, once per turn, greedily buys
 * the cheapest next affordable tier using mainline's EXACT cost table
 * (upgradeCosts.ts getEffectiveBranchCost — no invented pricing), repeating
 * until nothing affordable remains.
 *
 * Restricted to fundraising + mediaSpending: those are the two levers wired
 * to a real effect this wave (fundraising grows the campaign's own income;
 * mediaSpending feeds candidateSupports via phases.ts). groundGame
 * (swing/GOTV) and oppositionResearch (needs a target) have no wired effect
 * yet (see opsEffects.ts doc) — auto-investing in them would be pure waste
 * for an AI that cannot see the effect, so the NPC picker does not consider
 * them. A player using a future upgrade UI can still buy any of the four;
 * maintenance.ts costs all four correctly regardless of who bought what.
 */

const NPC_INVESTABLE_CATEGORIES: UpgradeCategory[] = ["fundraising", "mediaSpending"];
const BRANCH_ORDER: OpsBranchKey[] = ["a", "b", "c"];
/** Hard cap on purchases per campaign per turn — guards against runaway loops, never binds in practice (funds run out first). */
const MAX_PURCHASES_PER_TURN = 8;

interface Candidate {
  category: UpgradeCategory;
  branch: OpsBranchKey | null;
  nextLevel: number;
  fundsLocal: number;
  actions: number;
  lumpSumLocal: number;
}

function treeFor(campaign: Campaign, category: UpgradeCategory): CampaignOpsTree {
  switch (category) {
    case "fundraising":
      return campaign.fundraisingTree;
    case "oppositionResearch":
      return campaign.oppositionResearchTree;
    case "groundGame":
      return campaign.groundGameTree;
    case "mediaSpending":
      return campaign.mediaSpendingTree;
  }
}

function nextSteps(campaign: Campaign): Candidate[] {
  const out: Candidate[] = [];
  for (const category of NPC_INVESTABLE_CATEGORIES) {
    const tree = treeFor(campaign, category);
    if (!tree.starter) {
      const cost = getEffectiveBranchCost(category, null, 0, campaign.electionType);
      if (cost) {
        out.push({
          category,
          branch: null,
          nextLevel: 0,
          fundsLocal: campaignAnchorToLocal(cost.funds, campaign.countryId),
          actions: cost.actions,
          lumpSumLocal: 0,
        });
      }
      continue; // starter must be bought before any branch on this lever
    }
    for (const branch of BRANCH_ORDER) {
      const level = tree[branch];
      if (level >= OPS_MAX_BRANCH_LEVEL) continue;
      const cost = getEffectiveBranchCost(category, branch, level + 1, campaign.electionType);
      if (!cost) continue;
      out.push({
        category,
        branch,
        nextLevel: level + 1,
        fundsLocal: campaignAnchorToLocal(cost.funds, campaign.countryId),
        actions: cost.actions,
        lumpSumLocal: cost.lumpSum != null ? campaignAnchorToLocal(cost.lumpSum, campaign.countryId) : 0,
      });
    }
  }
  return out;
}

function cheapestAffordable(campaign: Campaign): Candidate | null {
  const affordable = nextSteps(campaign).filter(
    (s) => campaign.funds >= s.fundsLocal && campaign.actions >= s.actions,
  );
  if (affordable.length === 0) return null;
  affordable.sort(
    (a, b) =>
      a.fundsLocal - b.fundsLocal ||
      a.category.localeCompare(b.category) ||
      (a.branch ?? "").localeCompare(b.branch ?? ""),
  );
  return affordable[0]!;
}

function applyPurchase(campaign: Campaign, step: Candidate): void {
  campaign.funds -= step.fundsLocal;
  campaign.actions -= step.actions;
  campaign.totalFundsSpent += step.fundsLocal;
  campaign.totalActionsSpent += step.actions;
  campaign.spendThisTurn += step.fundsLocal;
  const tree = treeFor(campaign, step.category);
  if (step.branch === null) {
    tree.starter = true;
  } else {
    tree[step.branch] = step.nextLevel;
  }
  // Bundlers (fundraising branch b) is incomeLumpOnPurchase — a one-time
  // cash infusion applied immediately (income.ts does not recur it).
  if (step.lumpSumLocal > 0) {
    campaign.funds += step.lumpSumLocal;
    campaign.totalFundsGenerated += step.lumpSumLocal;
  }
}

/** Runs NPC investment for one campaign in place. No-op for player campaigns. */
export function investCampaign(campaign: Campaign): void {
  if (!campaign.candidateIsNPP || campaign.status !== "active") return;
  for (let i = 0; i < MAX_PURCHASES_PER_TURN; i++) {
    const step = cheapestAffordable(campaign);
    if (!step) break;
    applyPurchase(campaign, step);
  }
}
