import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { calculateCampaignIncome } from "./income.js";
import { calculateMaintenanceCosts } from "./maintenance.js";
import { computeAutoDowngrade } from "./autoDowngrade.js";
import { getMediaFavPerTurn } from "./opsEffects.js";
import { campaignAnchorToLocal, campaignLocalToAnchor } from "./campaignCurrency.js";
import { applyCampaignPartySubsidies } from "./partySubsidy.js";
import { investCampaign } from "./npcInvestment.js";

/**
 * Campaign turn cluster (W26). Ports src/lib/turn/campaignTurn.ts
 * processCampaignTurn's core loop — income, maintenance, auto-downgrade,
 * spendThisTurn accrual, media favorability passive — applied uniformly to
 * every active campaign (player and NPP alike, exactly as mainline does;
 * mainline never branches income/maintenance math on candidateIsNPP, only
 * the action-generation baseline). See campaigns/npcInvestment.ts and
 * campaigns/partySubsidy.ts file docs for the two genuinely new (non-port)
 * mechanics this wave adds so the loop has real NPC money to work with.
 *
 * PORT-STUB (not ported from campaignTurn.ts — all gated behind unported
 * systems, named per system):
 *   - Opposition-research passive drain: needs Campaign.oppositionTargetId /
 *     targeting UI (opsEffects.ts getOppoDrainPerTurn is ported and callable,
 *     just never invoked here since no campaign ever sets a target).
 *   - Travel-presence bonus, primary in-state bonus, rally tours,
 *     player/governor/executive endorsement campaign-action boosts beyond
 *     the plain endorsement count below: all keyed off presidential-only
 *     systems (travel state, primary delegate math, rally UI) solo does not
 *     have (no "president" election type yet).
 *   - Diminishing returns on stacked passive favorability gain
 *     (diminishPassiveFavorabilityGain, src/lib/actions.ts): solo's
 *     candidateSupports.support is a simpler single mood scalar without the
 *     same saturation-curve infrastructure; the season multiplier below is
 *     the one passive-effect nuance ported since it is self-contained.
 *
 * Registry placement: mainline runs campaignTurn BEFORE voteAccumulation and
 * campaignSpendReset AFTER it, same turn (turnPhaseNames.ts). Per this
 * repo's established tail-placement rule (registry.ts: elections/
 * demographics/budget/centralBank clusters), this whole cluster instead
 * runs at the END of the turn, after voteAccumulationPhase/
 * electionResolutionPhase have already executed for THIS turn — so a
 * one-turn lag applies: spend recorded here becomes visible to the tally's
 * fundsByParty (elections/tallyAdapter.ts) and media favorability becomes
 * visible to the tally's support read starting NEXT turn, not this one.
 * campaignSpendResetPhase therefore runs FIRST in this cluster (clearing
 * what THIS turn's earlier voteAccumulation just read) before
 * campaignTurnPhase re-accrues for the next read.
 */

const PLAYER_BASE_CAMPAIGN_ACTIONS = 4;
const NPP_BASE_CAMPAIGN_ACTIONS = 2;

function clamp01to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function seasonMultiplier(world: WorldState, electionId: string): number {
  const rec = world.elections.find((e) => e.id === electionId);
  if (!rec) return 1;
  return rec.endTurn - world.meta.turn <= 4 ? 2 : 1;
}

export const campaignSpendResetPhase: TurnPhase = {
  name: "campaignSpendReset",
  run(world: WorldState) {
    for (const campaign of Object.values(world.campaigns)) {
      if (campaign.spendThisTurn !== 0) campaign.spendThisTurn = 0;
    }
  },
};

export const campaignTurnPhase: TurnPhase = {
  name: "campaignTurn",
  run(world: WorldState) {
    for (const campaign of Object.values(world.campaigns)) {
      if (campaign.status !== "active") continue;

      const electionType = campaign.electionType;
      const countryId = campaign.countryId;
      const income = calculateCampaignIncome(campaign, electionType);
      const preDowngradeMaintenance = calculateMaintenanceCosts(campaign, electionType);
      const fundsAnchor = campaignLocalToAnchor(campaign.funds, countryId);
      const downgrade = computeAutoDowngrade(campaign, { funds: fundsAnchor, income, electionType });
      const effectiveMaintenance =
        downgrade.downgrades.length > 0 ? downgrade.newMaintenance : preDowngradeMaintenance;
      if (downgrade.patches.fundraising) campaign.fundraisingTree = downgrade.patches.fundraising;
      if (downgrade.patches.oppositionResearch) campaign.oppositionResearchTree = downgrade.patches.oppositionResearch;
      if (downgrade.patches.groundGame) campaign.groundGameTree = downgrade.patches.groundGame;
      if (downgrade.patches.mediaSpending) campaign.mediaSpendingTree = downgrade.patches.mediaSpending;

      const incomeLocal = campaignAnchorToLocal(income, countryId);
      const maintenanceLocal = campaignAnchorToLocal(effectiveMaintenance, countryId);
      campaign.funds += incomeLocal - maintenanceLocal;
      campaign.totalFundsGenerated += incomeLocal;
      campaign.totalFundsSpent += maintenanceLocal;
      campaign.spendThisTurn += maintenanceLocal;

      // Campaign action-pool generation: baseline + endorsement boost.
      // Ports calculateCampaignActions(endorsementCount, baseline) verbatim
      // formula (src/lib/campaigns/actions.ts); endorsement counting is
      // simplified to "active politician-endorsements of this candidate"
      // (world.endorsements) since solo has no separate governor/executive
      // endorsement tiers to weight differently (PORT-STUB, named above).
      const endorsementCount = world.endorsements.filter(
        (e) => e.active && e.endorsedType === "politician" && e.endorsedId === campaign.candidateId,
      ).length;
      const baseline = campaign.candidateIsNPP ? NPP_BASE_CAMPAIGN_ACTIONS : PLAYER_BASE_CAMPAIGN_ACTIONS;
      const actionsGained = baseline + Math.floor(Math.sqrt(Math.max(0, endorsementCount)) * 3);
      campaign.actions += actionsGained;
      campaign.totalActionsGenerated += actionsGained;

      // Media favorability passive -> candidateSupports.support (solo's
      // analog of mainline's Character/NPP.favorability field — tallyAdapter.ts
      // reads candidateSupports[id].support as the tally's support input,
      // the same slot mainline's favorability feeds via ElectionCandidate.support).
      const mediaFav = getMediaFavPerTurn(campaign);
      if (mediaFav > 0) {
        const boost = mediaFav * seasonMultiplier(world, campaign.electionId);
        const support = world.candidateSupports[campaign.candidateId];
        if (support) support.support = clamp01to100(support.support + boost);
      }
    }
  },
};

export const campaignPartySubsidyPhase: TurnPhase = {
  name: "campaignPartySubsidy",
  run(world: WorldState) {
    applyCampaignPartySubsidies(world);
  },
};

export const campaignNpcInvestmentPhase: TurnPhase = {
  name: "campaignNpcInvestment",
  run(world: WorldState) {
    for (const campaign of Object.values(world.campaigns)) {
      investCampaign(campaign);
    }
  },
};
