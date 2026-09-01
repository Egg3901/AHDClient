import type { WorldState } from "../types.js";
import { campaignAnchorToLocal } from "./campaignCurrency.js";
import { getCampaignFamilyScalar } from "./upgradeCosts.js";

/**
 * Party-treasury campaign subsidy (W26 — NOT a mainline port; new mechanic).
 *
 * Mainline lets a party treasury fund a candidate's campaign only via a
 * player-initiated donation (POST /api/campaigns/[id]/donate, party-treasury
 * branch — src/lib/campaigns/commands/campaignCommands.ts donateToCampaign).
 * There is no automated equivalent for NPC candidates.
 *
 * The wave's CRITICAL GOAL is an actual treasury sink: NPC candidates
 * spending funds on campaigns has to draw from somewhere real, or the
 * ported income/maintenance/upgrade loop (phases.ts, npcInvestment.ts) is
 * just moving numbers between a campaign's own accounts. This phase is the
 * funding source: each party with active NPP campaigns hands them a bounded
 * weekly subsidy out of its treasury, split evenly across that party's
 * campaigns this turn. It is capped two ways so it can never overdraw or
 * dominate a treasury:
 *
 *   - CAMPAIGN_PARTY_SUBSIDY_RATE (5% of current treasury, split across the
 *     party's active campaigns) bounds the AGGREGATE payout per party per
 *     turn to <= 5% of treasury — the sum can never exceed treasury.
 *   - CAMPAIGN_PARTY_SUBSIDY_CAP_ANCHOR ($100k anchor at president scale,
 *     scaled down by the same race-family scalar as everything else in
 *     upgradeCosts.ts) bounds the PER-CAMPAIGN payout so one cash-flush
 *     party with few candidates can't instantly max out a single campaign.
 *
 * Both are first-pass constants (no worldsim calibration pass this wave);
 * flagged for balance review alongside the rest of the campaign cluster.
 */

export const CAMPAIGN_PARTY_SUBSIDY_RATE = 0.05;
export const CAMPAIGN_PARTY_SUBSIDY_CAP_ANCHOR = 100_000;

export function applyCampaignPartySubsidies(world: WorldState): void {
  const byParty = new Map<string, string[]>();
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.status !== "active" || !campaign.candidateIsNPP) continue;
    const list = byParty.get(campaign.partyId);
    if (list) list.push(campaign.id);
    else byParty.set(campaign.partyId, [campaign.id]);
  }

  for (const partyId of [...byParty.keys()].sort()) {
    const party = world.parties[partyId];
    if (!party || party.treasury <= 0) continue;
    const campaignIds = byParty.get(partyId)!.sort();
    const perCampaignShare = (party.treasury * CAMPAIGN_PARTY_SUBSIDY_RATE) / campaignIds.length;
    for (const id of campaignIds) {
      const campaign = world.campaigns[id]!;
      const capLocal = campaignAnchorToLocal(
        CAMPAIGN_PARTY_SUBSIDY_CAP_ANCHOR * getCampaignFamilyScalar(campaign.electionType),
        campaign.countryId,
      );
      const amount = Math.max(0, Math.min(perCampaignShare, capLocal));
      if (amount <= 0) continue;
      party.treasury -= amount;
      campaign.funds += amount;
    }
  }
}
