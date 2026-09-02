/**
 * Hamilton seat estimation for tally snapshots.
 *
 * Ported verbatim from the inline `seatsEstimate` closure inside
 * `src/lib/electionEngine/tallyManagement.ts#accumulateVoteTurn`.
 *
 * This is NOT `resolution/seatAllocation.ts#allocateSeats` — that resolver
 * handles authoritative seat counts, Bloc lists, and era bundles. The tally
 * snapshot is a live projection using Largest Remainder (Hamilton) with the
 * same thresholds and majoritarian bonus the resolver uses, but scoped to
 * the running vote totals. Keep the two in sync when changing either.
 */

import type { EnrichedCandidate } from "../types.js";

// Shared with resolution/seatAllocation.ts: the two gates must agree or a
// race is multi-seat at resolution but single-seat in the live tally
// projection (this file previously carried a stale copy missing the soviet
// and snap types).
import { MULTI_SEAT_TYPES } from "../resolution/constants.js";

function getMultiSeatMinShare(
  electionType: string,
  opts?: { majoritarian?: boolean },
): number {
  if (opts?.majoritarian && (electionType === "commons" || electionType === "snap_commons"))
    return 0.1;
  if (
    electionType === "stateSenate" ||
    electionType === "regionalCouncil" ||
    electionType === "landtag" ||
    electionType === "peoplesCongress" ||
    electionType === "dail" ||
    electionType === "seanad" ||
    electionType === "localCouncil" ||
    electionType === "assembleeNationale" ||
    electionType === "cameraDeputati" ||
    electionType === "congresoDiputados" ||
    electionType === "riksdag" ||
    electionType === "milletMeclisi" ||
    electionType === "nationalrat" ||
    electionType === "eduskunta" ||
    electionType === "vouli" ||
    electionType === "volkskammerDeputy" ||
    electionType === "landAssembly"
  )
    return 0.1;
  return 0.2;
}

function getMajoritarianBonus(
  electionType: string,
  currentYear?: number | null,
): { exponent: number } | undefined {
  if (electionType !== "commons" && electionType !== "snap_commons") return undefined;
  if (currentYear == null) return undefined;
  if (currentYear >= 1999) return undefined;
  return { exponent: 3 };
}

function applyMajoritarianBonus(
  candidates: Array<{ id: string; votes: number; group: string }>,
  bonus: { exponent: number; orgRanking?: string[] },
): Map<string, number> {
  const groupVotes = new Map<string, number>();
  for (const c of candidates) {
    groupVotes.set(c.group, (groupVotes.get(c.group) ?? 0) + c.votes);
  }
  const sortedGroups = [...groupVotes.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedGroups.length < 2) return new Map(candidates.map((c) => [c.id, c.votes]));
  const total = sortedGroups.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return new Map(candidates.map((c) => [c.id, c.votes]));
  const topTwoGroups = new Set(sortedGroups.slice(0, 2).map(([g]) => g));
  const topTwoVotes = sortedGroups.slice(0, 2).reduce((s, [, v]) => s + v, 0);
  const result = new Map<string, number>();
  for (const c of candidates) {
    if (!topTwoGroups.has(c.group)) {
      result.set(c.id, c.votes);
      continue;
    }
    const share = c.votes / topTwoVotes;
    const g0 = sortedGroups[0]![1];
    const g1 = sortedGroups[1]![1];
    const boostedShare = Math.pow(share, bonus.exponent) / (
      Math.pow(g0 / topTwoVotes, bonus.exponent) +
      Math.pow(g1 / topTwoVotes, bonus.exponent)
    );
    const boostedTotal = topTwoVotes;
    result.set(c.id, boostedShare * boostedTotal);
  }
  return result;
}

function rankPartiesByOrganization(
  statePartyOrgs: Array<{ partyId: string; organization: number }>,
): string[] {
  return [...statePartyOrgs]
    .sort((a, b) => b.organization - a.organization)
    .map((po) => po.partyId);
}

export interface EstimateSeatsArgs {
  electionType: string;
  totalSeats?: number | null;
  enriched: EnrichedCandidate[];
  newTotals: Record<string, number>;
  currentYear?: number | null;
  statePartyOrgs?: Array<{ partyId: string; organization: number }>;
}

export function estimateSeats(args: EstimateSeatsArgs): Record<string, number> | undefined {
  const { electionType, totalSeats, enriched, newTotals, currentYear, statePartyOrgs } = args;
  if (!totalSeats || !MULTI_SEAT_TYPES.has(electionType)) return undefined;
  const totalVotesCast = enriched.reduce((s, ec) => s + (newTotals[ec.candidateId] ?? 0), 0);
  if (totalVotesCast === 0) return undefined;

  const minShare = getMultiSeatMinShare(electionType, {
    majoritarian: getMajoritarianBonus(electionType, currentYear) !== undefined,
  });
  const groupKey = (ec: EnrichedCandidate) =>
    ec.party && ec.party !== "independent" ? `party:${ec.party}` : `cand:${ec.candidateId}`;
  const votesByGroup = new Map<string, number>();
  for (const ec of enriched) {
    const k = groupKey(ec);
    votesByGroup.set(k, (votesByGroup.get(k) ?? 0) + (newTotals[ec.candidateId] ?? 0));
  }
  const eligible = enriched.filter(
    (ec) => (votesByGroup.get(groupKey(ec)) ?? 0) / totalVotesCast >= minShare,
  );

  const pool =
    eligible.length > 0
      ? eligible
      : [...enriched]
          .sort((a, b) => (newTotals[b.candidateId] ?? 0) - (newTotals[a.candidateId] ?? 0))
          .slice(0, Math.min(totalSeats, enriched.length));
  const poolVotes = pool.reduce((s, ec) => s + (newTotals[ec.candidateId] ?? 0), 0);
  if (poolVotes === 0) return undefined;

  const seats: Record<string, number> = {};
  for (const ec of enriched) seats[ec.candidateId] = 0;

  const baseBonus = getMajoritarianBonus(electionType, currentYear);
  const majoritarianBonus = baseBonus
    ? { ...baseBonus, orgRanking: rankPartiesByOrganization(statePartyOrgs ?? []) }
    : undefined;
  const effectiveVotes =
    majoritarianBonus && pool.length > 1
      ? applyMajoritarianBonus(
          pool.map((ec) => ({
            id: ec.candidateId,
            votes: newTotals[ec.candidateId] ?? 0,
            group: groupKey(ec),
          })),
          majoritarianBonus,
        )
      : undefined;

  const allocations = pool.map((ec) => {
    const votes = effectiveVotes?.get(ec.candidateId) ?? newTotals[ec.candidateId] ?? 0;
    const exactSeats = (votes / poolVotes) * totalSeats;
    return {
      candidateId: ec.candidateId,
      floor: Math.floor(exactSeats),
      remainder: exactSeats - Math.floor(exactSeats),
    };
  });

  let allocated = 0;
  for (const a of allocations) {
    seats[a.candidateId] = a.floor;
    allocated += a.floor;
  }

  const remaining = totalSeats - allocated;
  if (remaining > 0) {
    const sorted = [...allocations].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remaining && i < sorted.length; i++) {
      const sid = sorted[i]!.candidateId;
      seats[sid] = (seats[sid] ?? 0) + 1;
    }
  }

  return seats;
}

export { MULTI_SEAT_TYPES, getMultiSeatMinShare, getMajoritarianBonus, applyMajoritarianBonus, rankPartiesByOrganization };
