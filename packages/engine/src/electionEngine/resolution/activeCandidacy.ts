// @ts-nocheck
/**
 * Active candidacy checks — pure planning layer.
 *
 * Ported from `src/lib/elections/activeCandidacy.ts`.
 * DB reads (electionCandidates, elections collections) are replaced with plain
 * input interfaces. Field names mirror the Mongo documents they replace so call
 * sites can pass WorldState slices or direct rows without renaming.
 *
 * Plain input mapping to WorldState:
 *   WorldState.candidateSupports / elections table -> CandidateInput[]
 *   WorldState.elections / elections table -> ElectionInput[]
 * Operator wires them; no WorldState import.
 */

export type ElectionStatus = "upcoming" | "active" | "completed" | "resolved" | "cancelled";

export interface CandidateInput {
  _id: string;
  electionId: string;
  characterId: string;
  status: "active" | "withdrawn" | "won" | "lost";
}

export interface ElectionInput {
  _id: string;
  status: ElectionStatus;
  countryId?: string;
}

const BLOCKING_ELECTION_STATUSES = new Set<ElectionStatus>(["upcoming", "active", "completed"]);

export function electionStatusBlocksFurtherEntry(status: ElectionStatus): boolean {
  return BLOCKING_ELECTION_STATUSES.has(status);
}

/**
 * Pure version of findBlockingActiveCandidacy — scans plain inputs instead
 * of Mongo collections.
 *
 * @param candidates - all candidates for the character (already filtered to status=active by caller in pure mode)
 * @param elections - election rows matching candidate.electionId
 * @param characterId - character to check
 * @param excludeElectionId - optionally exclude one election (e.g. the race being entered)
 */
export function findBlockingActiveCandidacy(
  candidates: CandidateInput[],
  elections: ElectionInput[],
  characterId: string,
  excludeElectionId?: string,
): { candidate: CandidateInput; election: ElectionInput } | null {
  const relevant = excludeElectionId
    ? candidates.filter((c) => c.characterId === characterId && c.status === "active" && c.electionId !== excludeElectionId)
    : candidates.filter((c) => c.characterId === characterId && c.status === "active");
  if (relevant.length === 0) return null;
  const electionById = new Map(elections.map((e) => [e._id, e]));
  for (const cand of relevant) {
    const election = electionById.get(cand.electionId);
    if (election && electionStatusBlocksFurtherEntry(election.status)) {
      return { candidate: cand, election };
    }
  }
  return null;
}

/**
 * Async wrapper preserving original signature shape for callers that still
 * provide DB-like access via plain inputs. Provided for test compatibility;
 * prefer the sync overload above for pure usage.
 */
export async function findBlockingActiveCandidacyAsync(
  candidates: CandidateInput[],
  elections: ElectionInput[],
  characterId: string,
  excludeElectionId?: string,
): Promise<{ candidate: CandidateInput; election: ElectionInput } | null> {
  return findBlockingActiveCandidacy(candidates, elections, characterId, excludeElectionId);
}
