/**
 * Pure `initElectionVoteTally` — ported from `src/lib/electionEngine/tallyManagement.ts`.
 *
 * Mainline mapping:
 *   `electionId` = `Election._id` (ObjectId hex string)
 *   `candidates` = `ElectionCandidate[]` rows for the election
 *   `state` = `Election.state`
 *   `primaryResults` = `PrimaryResults` passthrough (opaque)
 *   DB `replaceOne({ electionId }, doc, { upsert: true })` is replaced by
 *   returning the document; caller persists it.
 *   `existingPrimaryVotes` / `existingId` carry the cross-init preservation
 *   that mainline read via `findOne({ electionId }, { projection: { primaryVotes: 1 } })`.
 */

import type {
  InitElectionVoteTallyInput,
  InitElectionVoteTallyResult,
  TallyInput,
} from "./types.js";

export function initElectionVoteTally(
  input: InitElectionVoteTallyInput,
): InitElectionVoteTallyResult {
  if (!(input.now instanceof Date)) {
    throw new Error("initElectionVoteTally requires a deterministic timestamp");
  }
  const now = input.now;

  const totalVotes: Record<string, number> = {};
  const candidateNames: Record<string, string> = {};
  const candidateParties: Record<string, string> = {};

  for (const c of input.candidates) {
    totalVotes[c._id] = 0;
    candidateNames[c._id] = c.characterName;
    candidateParties[c._id] = c.party;
  }

  const doc: TallyInput = {
    _id: input.existingId ?? input.electionId,
    electionId: input.electionId,
    state: input.state,
    totalVotes,
    candidateNames,
    candidateParties,
    turnSnapshots: [],
    finalized: false,
    ...(input.primaryResults !== undefined ? { primaryResults: input.primaryResults } : {}),
    ...(input.existingPrimaryVotes !== undefined
      ? { primaryVotes: input.existingPrimaryVotes }
      : {}),
    createdAt: now,
    updatedAt: now,
  };

  return { tally: doc };
}
