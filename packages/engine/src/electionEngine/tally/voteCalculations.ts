/**
 * Pure vote-calculation helpers ported from `src/lib/electionEngine/voteCalculations.ts`.
 *
 * No DB, no I/O. Byte-identical to mainline so numeric assertions remain valid.
 */

const MS_PER_TURN_LOCAL = 3_600_000;

export const ELECTION_DAY_TURNS = 4 as const;
export const RAMP_TURNS = 8 as const;
export const EARLY_POOL_SHARE = 0.5 as const;
export const RAMP_POOL_SHARE = 0.2 as const;
export const FINAL_POOL_SHARE = 0.3 as const;

export function resolveTurnWindow(args: {
  startTurn?: number | null;
  endTurn?: number | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  createdAt?: Date | string | null;
  currentTurn: number;
  now: Date;
  inclusiveEnd?: boolean;
}): { totalTurns: number; turnIndex: number } {
  const { startTurn, endTurn, startTime, endTime, createdAt, currentTurn, now } = args;
  const extra = args.inclusiveEnd ? 1 : 0;

  if (typeof startTurn === "number" && typeof endTurn === "number") {
    const totalTurns = Math.max(4, endTurn - startTurn + extra);
    const turnIndex = Math.max(0, Math.min(currentTurn - startTurn, totalTurns - 1));
    return { totalTurns, turnIndex };
  }

  const effectiveStart = startTime ? new Date(startTime) : createdAt ? new Date(createdAt) : now;
  const endMs = endTime ? new Date(endTime).getTime() : now.getTime();
  const totalTurns = Math.max(
    4,
    Math.round((endMs - effectiveStart.getTime()) / MS_PER_TURN_LOCAL) + extra,
  );
  const elapsed = Math.max(
    0,
    Math.round((now.getTime() - effectiveStart.getTime()) / MS_PER_TURN_LOCAL),
  );
  const turnIndex = Math.min(elapsed, totalTurns - 1);
  return { totalTurns, turnIndex };
}

export function turnVoteWeight(
  totalTurns: number,
  turnIndex: number,
  totalPool: number,
): number {
  if (totalTurns <= 0) return 0;
  if (totalTurns <= ELECTION_DAY_TURNS) return totalPool / totalTurns;

  const finalCount = ELECTION_DAY_TURNS;
  const rampCount = Math.min(RAMP_TURNS, totalTurns - finalCount);
  const earlyCount = totalTurns - finalCount - rampCount;

  let earlyShare: number = EARLY_POOL_SHARE;
  let rampShare: number = RAMP_POOL_SHARE;
  if (earlyCount === 0) {
    rampShare += earlyShare;
    earlyShare = 0;
  }

  const finalStart = totalTurns - finalCount;
  const rampStart = finalStart - rampCount;

  if (turnIndex >= finalStart) return (FINAL_POOL_SHARE * totalPool) / finalCount;
  if (turnIndex >= rampStart) return (rampShare * totalPool) / rampCount;
  return (earlyShare * totalPool) / earlyCount;
}
