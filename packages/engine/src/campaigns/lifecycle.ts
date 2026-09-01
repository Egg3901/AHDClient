import type { Campaign, WorldState } from "../types.js";
import { isCampaignEligibleElection } from "./isCampaignEligible.js";

/**
 * Campaign lifecycle (W26). Ported from src/lib/campaigns/createInitialCampaign.ts
 * createInitialCampaign / ensureCampaignForCandidate, adapted to WorldState:
 * no DB round-trip, no idempotency query (callers check world.campaigns
 * directly). Called from elections/orchestration.ts fillCandidates (NPP
 * entry) and elections/candidacy.ts declareCandidacy/withdrawCandidacy
 * (player entry/exit).
 *
 * PORT-STUB (not ported): Campaign.campaignStrength / the player
 * contribution-to-vote-multiplier mechanic (src/lib/campaigns/campaignStrength.ts).
 * That is a standalone player-spend-on-votes UI feature layered on top of the
 * Campaign doc, not part of the income/maintenance/spend loop this wave
 * wires into candidateSupports + fundsByParty — no consumer exists in solo's
 * tally (electionEngine/persuasionDrivers.ts never reads a strength
 * multiplier). Port when a player campaign-contribution action lands.
 */

export function campaignKey(electionId: string, candidateId: string): string {
  return `${electionId}:${candidateId}`;
}

function freshOpsTree() {
  return { starter: false, a: 0, b: 0, c: 0 };
}

export interface CreateCampaignArgs {
  electionId: string;
  candidateId: string;
  candidateIsNPP: boolean;
  partyId: string;
  countryId: string;
  electionType: string;
  turn: number;
}

/** Create (or reactivate an archived) campaign for a candidate. No-op if already active. */
export function ensureCampaign(world: WorldState, args: CreateCampaignArgs): void {
  const key = campaignKey(args.electionId, args.candidateId);
  const existing = world.campaigns[key];
  if (existing) {
    if (existing.status === "archived") existing.status = "active";
    return;
  }
  const campaign: Campaign = {
    id: key,
    electionId: args.electionId,
    candidateId: args.candidateId,
    candidateIsNPP: args.candidateIsNPP,
    partyId: args.partyId,
    countryId: args.countryId,
    electionType: args.electionType,
    status: "active",
    funds: 0,
    actions: 0,
    fundraisingTree: freshOpsTree(),
    oppositionResearchTree: freshOpsTree(),
    groundGameTree: freshOpsTree(),
    mediaSpendingTree: freshOpsTree(),
    spendThisTurn: 0,
    totalFundsGenerated: 0,
    totalFundsSpent: 0,
    totalActionsGenerated: 0,
    totalActionsSpent: 0,
    createdAtTurn: args.turn,
  };
  world.campaigns[key] = campaign;
}

/** Create campaigns for every candidate in `rec` that doesn't already have one, when the election is campaign-eligible. */
export function ensureCampaignsForElection(
  world: WorldState,
  rec: { id: string; countryId: string; electionType: string; candidates: { id: string; partyId: string; isNPP: boolean }[] },
): void {
  if (!isCampaignEligibleElection(rec)) return;
  for (const cand of rec.candidates) {
    ensureCampaign(world, {
      electionId: rec.id,
      candidateId: cand.id,
      candidateIsNPP: cand.isNPP,
      partyId: cand.partyId,
      countryId: rec.countryId,
      electionType: rec.electionType,
      turn: world.meta.turn,
    });
  }
}

/** Archive (never delete — history stays inspectable) every campaign tied to an election. */
export function archiveCampaignsForElection(world: WorldState, electionId: string): void {
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.electionId === electionId && campaign.status === "active") {
      campaign.status = "archived";
    }
  }
}

/** Archive a single candidate's campaign (withdrawal). */
export function archiveCampaign(world: WorldState, electionId: string, candidateId: string): void {
  const campaign = world.campaigns[campaignKey(electionId, candidateId)];
  if (campaign) campaign.status = "archived";
}
