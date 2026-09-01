/**
 * NPP ballot logic for intra-party elections.
 * Where mainline gates on human ballots, NPCs vote by mainline's NPP ballot logic.
 * Cited source: src/lib/turn/nppVoteLogic.ts calculateBaseVote / calculateWhippedVote.
 * That module models NPP bill voting via loyalty -> abstain chance, then
 * ideology-biased support chance. For party elections we adapt the pattern:
 * candidates are ranked by ideological proximity (economic/social distance)
 * to the voter, with loyalty-derived abstention chance and deterministic
 * tie-breaking via rng. The formulas are ported verbatim from nppVoteLogic.ts
 * where applicable; candidate-choice ranking is the party-election analogue.
 */

import type { WorldRng } from "../rng.js";
import type { Politician } from "../types.js";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Port of nppVoteLogic.ts abstainChance: loyalty in [0,100] -> [0.05,0.25].
 */
export function abstainChanceFromLoyalty(loyalty: number): number {
  const normalized = clamp(loyalty, 0, 100) / 100;
  return Math.max(0.05, (1 - normalized) * 0.25);
}

/**
 * Choose a candidate for a voter using NPP-style ballot.
 * - With probability abstainChance (from loyalty) the voter abstains (null).
 * - Otherwise pick the candidate with minimal ideological distance (euclidean in
 *   economic/social space), jittered by a small rng draw to break ties
 *   deterministically, mirroring calculateBaseVote's random factor.
 * Cited: src/lib/turn/nppVoteLogic.ts calculateBaseVote loyalty + random
 */
export function pickCandidateForVoter(
  voter: Pick<Politician, "ideology" | "personality">,
  candidates: Array<Pick<Politician, "id" | "ideology">>,
  rng: WorldRng,
): string | null {
  if (candidates.length === 0) return null;
  const loyalty = voter.personality?.loyalty ?? 50;
  const abstainChance = abstainChanceFromLoyalty(loyalty);
  if (rng.next() < abstainChance) return null;
  // Rank by ideological distance + tiny rng jitter to avoid deterministic ties
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const cand of candidates) {
    const de = voter.ideology.economic - cand.ideology.economic;
    const ds = voter.ideology.social - cand.ideology.social;
    const dist = Math.sqrt(de * de + ds * ds);
    const jitter = (rng.next() - 0.5) * 0.2; // +/-0.1 jitter like nppVoteLogic's random factor
    const score = dist + jitter;
    if (score < bestScore || (score === bestScore && bestId !== null && cand.id < bestId)) {
      bestScore = score;
      bestId = cand.id;
    } else if (score === bestScore && bestId === null) {
      bestId = cand.id;
    }
  }
  return bestId;
}

/**
 * Committee ballot: voter picks up to 6 candidates closest ideologically.
 * Mirrors nationalCommitteeElections MAX_VOTES_PER_VOTER =6 and dedupe logic.
 * Abstention same as single-choice; if not abstaining, return 1..6 nearest.
 */
export function pickCommitteeCandidatesForVoter(
  voter: Pick<Politician, "ideology" | "personality">,
  candidates: Array<Pick<Politician, "id" | "ideology">>,
  rng: WorldRng,
  maxVotes: number,
): string[] {
  if (candidates.length === 0) return [];
  const loyalty = voter.personality?.loyalty ?? 50;
  const abstainChance = abstainChanceFromLoyalty(loyalty);
  if (rng.next() < abstainChance) return [];
  const scored = candidates.map((cand) => {
    const de = voter.ideology.economic - cand.ideology.economic;
    const ds = voter.ideology.social - cand.ideology.social;
    const dist = Math.sqrt(de * de + ds * ds);
    const jitter = (rng.next() - 0.5) * 0.2;
    return { id: cand.id, score: dist + jitter };
  });
  scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return scored.slice(0, Math.min(maxVotes, scored.length)).map((s) => s.id);
}
