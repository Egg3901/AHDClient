/**
 * Prior-cycle seat-share lookup for the swing-flow incumbency driver.
 *
 * Ported from `src/lib/electionEngine/incumbentSeatShare.ts`.
 * Mainline mapping:
 *   - Pure function `computeSeatShareFromTally` is verbatim.
 *   - DB-dependent `getIncumbentSeatShareByParty` relied on `elections` /
 *     `electionVoteTallies` collections and `getElectionSeatKey`. In this
 *     pure layer it is PORT-STUB: callers supply the prior tally directly as
 *     plain inputs (`IncumbentSeatShareInput`). The resolution pipeline wave
 *     will call `computeSeatShareFromTally` with those plain inputs.
 *   - No WorldState reads, no Mongo dependency.
 */

export function computeSeatShareFromTally(
  totalVotes: Record<string, number>,
  candidateParties: Record<string, string>
): Map<string, number> {
  const partyVotes = new Map<string, number>();
  let grandTotal = 0;
  for (const [candidateId, votes] of Object.entries(totalVotes)) {
    if (!Number.isFinite(votes) || votes <= 0) continue;
    const party = candidateParties[candidateId];
    if (!party) continue;
    partyVotes.set(party, (partyVotes.get(party) ?? 0) + votes);
    grandTotal += votes;
  }
  if (grandTotal <= 0) return new Map();
  const shares = new Map<string, number>();
  for (const [party, votes] of partyVotes) {
    shares.set(party, votes / grandTotal);
  }
  return shares;
}

/**
 * Plain input replacing the DB lookup `getIncumbentSeatShareByParty(election, db)`.
 *
 * Mainline mapping:
 *   `totalVotes` = `ElectionVoteTally.totalVotes`
 *   `candidateParties` = `ElectionVoteTally.candidateParties`
 * An empty map is the neutral "no prior cycle" shape the driver expects.
 */
export interface IncumbentSeatShareInput {
  totalVotes: Record<string, number>;
  candidateParties: Record<string, string>;
}

export function getIncumbentSeatShareFromInput(
  input: IncumbentSeatShareInput | null | undefined
): Map<string, number> {
  if (!input) return new Map();
  return computeSeatShareFromTally(input.totalVotes, input.candidateParties);
}
