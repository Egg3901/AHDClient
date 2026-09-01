/**
 * Pure bill voting calculations — deterministic via WorldRng.
 * Ports src/lib/billVoteLogic.ts ideologyVote and src/lib/billLifecycleHelpers
 * didPass/didPassWithFilibusterCheck with the quorum (votes cast) rule.
 */

import type { Politician } from "../types.js";
import type { Bill } from "./types.js";
import type { WorldRng } from "../rng.js";

// Re-export helpers from mainline billLifecycleHelpers
export function didPass(votesFor: number, votesAgainst: number): boolean {
  return votesFor > votesAgainst;
}

export function otherChamber(chamber: string): string {
  const pairs: Record<string, string> = {
    house: "senate",
    senate: "house",
    shugiin: "sangiin",
    sangiin: "shugiin",
    commons: "lords",
    lords: "commons",
  };
  return pairs[chamber] ?? chamber;
}

/**
 * Cloture quorum rule: when filibusterInvocations is non-empty and no
 * disabling policy is active, bill needs 3/5 of votes CAST (for+against+abstain)
 * to be "for". Quorum-based: non-voters don't count, abstains raise bar.
 *
 * Mirrors mainline src/lib/turn/billLifecycle/lifecycleHelpers.ts
 * didPassWithFilibusterCheck, sans DB policy check (solo has no
 * statePolicies collection, so we model the disabling policy as a flag on the
 * bill itself: filibusterDisabledForTest).
 */
export function didPassWithFilibusterCheck(
  bill: Pick<Bill, "filibusterInvocations"> & { filibusterDisabled?: boolean },
  votesFor: number,
  votesAgainst: number,
  votesAbstain: number = 0
): boolean {
  if (!bill.filibusterInvocations?.length) return didPass(votesFor, votesAgainst);
  if (bill.filibusterDisabled) return didPass(votesFor, votesAgainst);
  const votesCast = votesFor + votesAgainst + votesAbstain;
  if (votesCast === 0) return false;
  const clotureThreshold = Math.ceil((3 / 5) * votesCast);
  return votesFor >= clotureThreshold;
}

/**
 * Determine a politician's vote based on ideology distance, party-line, and
 * endorsement inputs as mainline wires them.
 *
 * - Ideology distance drives base support chance
 * - Same-party as sponsor boosts support
 * - Endorsed party/sponsor alignment boosts support
 * - Deterministic via provided rng (no Math.random)
 */
export function ideologyVote(
  politician: Politician,
  bill: Bill,
  options: {
    sponsorPartyId: string | null;
    endorsedPartyIds?: Set<string> | undefined;
    rng: WorldRng;
  }
): "for" | "against" | "abstain" {
  const { sponsorPartyId, endorsedPartyIds, rng } = options;

  // Abstain chance: fixed 8% base, lower if same party (party discipline)
  let abstainChance = 0.08;
  if (sponsorPartyId && politician.partyId === sponsorPartyId) abstainChance = 0.04;

  const r = rng.next();
  if (r < abstainChance) return "abstain";

  // Ideology distance: bill's economic/social from provisions or catalog
  // Bill's ideological lean is derived from its provisions' economic/social
  // or from catalog default. Fall back to sponsor party position if needed.
  const billEconomic = bill.provisions.find((p) => p.economic !== undefined)?.economic ?? 0;
  const billSocial = bill.provisions.find((p) => p.social !== undefined)?.social ?? 0;

  // If bill has no explicit economic/social, infer from effectDirection
  // For testing, provisions will carry economic/social.
  const dist = Math.hypot(politician.ideology.economic - billEconomic, politician.ideology.social - billSocial);
  // dist 0..~14, normalize
  const normalized = Math.min(1, dist / 7.07); // 5*sqrt2 ≈7.07 for corner distance
  let supportChance = 0.85 - normalized * 0.6; // 0.85 at dist 0, 0.25 at max dist

  // Party-line: same party as sponsor strongly favors
  if (sponsorPartyId && politician.partyId === sponsorPartyId) {
    supportChance = Math.min(0.95, supportChance + 0.25);
  }

  // Endorsement: if politician's party is in endorsed set, boost
  if (endorsedPartyIds && endorsedPartyIds.has(politician.partyId)) {
    supportChance = Math.min(0.92, supportChance + 0.12);
  }

  // Clamp
  supportChance = Math.max(0.05, Math.min(0.95, supportChance));

  const r2 = (r - abstainChance) / (1 - abstainChance);
  return r2 < supportChance ? "for" : "against";
}

/**
 * Tally votes for a given vote map into for/against/abstain counts with seat weighting.
 * Each vote key maps to seat weight (default 1).
 */
export function tallyVotes(
  votes: Record<string, "for" | "against" | "abstain">,
  weightMap?: Map<string, number>
): { for: number; against: number; abstain: number } {
  let f = 0, a = 0, ab = 0;
  for (const [k, v] of Object.entries(votes)) {
    const w = weightMap?.get(k) ?? 1;
    if (v === "for") f += w;
    else if (v === "against") a += w;
    else ab += w;
  }
  return { for: f, against: a, abstain: ab };
}
