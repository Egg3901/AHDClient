// @ts-nocheck
/**
 * Sainte-Laguë (divisor) method for proportional seat allocation.
 *
 * Ported from `src/lib/turn/election/sainteLagueAllocation.ts`.
 * Pure, no I/O, no WorldState.
 */

export interface VoteShare {
  partyId: string;
  votes: number;
}

export interface SeatAllocationResult {
  partySeats: Record<string, number>;
  totalAllocated: number;
}

export function allocateViaSainteLague(
  voteShares: VoteShare[],
  totalSeats: number,
  options: {
    minVoteShare?: number;
    minDirectMandates?: Record<string, number>;
  } = {},
): SeatAllocationResult {
  const { minVoteShare = 0.05, minDirectMandates = {} } = options;
  const totalVotes = voteShares.reduce((sum, v) => sum + v.votes, 0);
  const threshold = minVoteShare * totalVotes;
  const eligible = voteShares.filter((v) => {
    const hasEnoughVotes = v.votes >= threshold;
    const hasEnoughDirectMandates = (minDirectMandates[v.partyId] ?? 0) >= 3;
    return hasEnoughVotes || hasEnoughDirectMandates;
  });
  if (eligible.length === 0) return { partySeats: {}, totalAllocated: 0 };
  const allocation: Record<string, number> = {};
  for (const { partyId } of eligible) allocation[partyId] = 0;
  for (let seatIdx = 0; seatIdx < totalSeats; seatIdx++) {
    let bestPartyId: string | null = null;
    let bestQuotient = 0;
    for (const { partyId, votes } of eligible) {
      const divisor = 2 * allocation[partyId] + 1;
      const quotient = votes / divisor;
      if (quotient > bestQuotient) {
        bestQuotient = quotient;
        bestPartyId = partyId;
      }
    }
    if (bestPartyId === null) break;
    allocation[bestPartyId]++;
  }
  const totalAllocated = Object.values(allocation).reduce((sum, s) => sum + s, 0);
  return { partySeats: allocation, totalAllocated };
}

export function validateAllocation(result: SeatAllocationResult, expectedTotal: number): boolean {
  return result.totalAllocated === expectedTotal;
}
