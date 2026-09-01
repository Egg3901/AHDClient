import type { Campaign } from "../types.js";
import { OPS_TREES, getOpsBranchMagnitude } from "./upgradeCosts.js";

/**
 * Strategic Operations v2 per-turn effect readers.
 * Ported from src/lib/campaigns/opsEffects.ts, restricted to the two
 * channels this wave wires into WorldState.candidateSupports (see
 * campaigns/phases.ts campaignTurnPhase): media favorability and
 * opposition-research drain.
 *
 * PORT-STUB (not ported): getGroundGameSwingBonus / getGroundGameGotvBonus.
 * Mainline reads these from the vote-distribution engine
 * (presidentialElectionEngine.ts / persuasionDrivers.ts swing-state
 * weighting); solo's tally (electionEngine/persuasionDrivers.ts) has no
 * swing-state concept wired yet, so groundGame's swingPct/gotvPct branches
 * have no consumer. groundGame maintenance is still costed correctly
 * (maintenance.ts sums every tree including groundGame), and
 * campaigns/npcInvestment.ts deliberately does not auto-invest in it (see
 * that file's doc) so the game never charges for an effect that does
 * nothing. Port these two readers + wire them when swing-state persuasion
 * lands.
 */

/** Media favorability gained per turn (before the season/final-stretch multiplier). */
export function getMediaFavPerTurn(campaign: Pick<Campaign, "mediaSpendingTree">): number {
  const tree = campaign.mediaSpendingTree;
  if (!tree.starter) return 0;
  return (
    OPS_TREES.mediaSpending.starter.magnitude +
    getOpsBranchMagnitude("mediaSpending", "a", tree.a) +
    getOpsBranchMagnitude("mediaSpending", "b", tree.b)
  );
}

/**
 * Opposition-research favorability drain this campaign inflicts per turn
 * (positive magnitude; caller applies the sign and the target's shield).
 * PORT-STUB caveat: no campaign in solo ever sets an opposition target this
 * wave (targeting UI/AI not ported — mainline's oppositionTargetId flow is
 * player-driven via /api/campaigns/[id]/retarget), so this can be non-zero
 * (a campaign can still buy the oppositionResearch tree — it costs real
 * funds, which is the point) while never actually firing. See
 * campaigns/phases.ts campaignTurnPhase for the (currently unreachable)
 * application site, kept for when targeting lands.
 */
export function getOppoDrainPerTurn(campaign: Pick<Campaign, "oppositionResearchTree">): number {
  const tree = campaign.oppositionResearchTree;
  if (!tree.starter) return 0;
  const base = OPS_TREES.oppositionResearch.starter.magnitude + getOpsBranchMagnitude("oppositionResearch", "a", tree.a);
  const amp = 1 + getOpsBranchMagnitude("oppositionResearch", "c", tree.c);
  return base * amp;
}
