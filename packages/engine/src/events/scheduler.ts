/**
 * World Events scheduler math — deterministic, no RNG, no wall clock.
 *
 * Ports src/lib/events/worldEvents/scheduler.ts verbatim:
 *   isRecurringDue, windowGapTurns, isWindowDue, isScheduleDue
 *
 * Deterministic hash: hashToUint32 via FNV-like stand-in for sha256 readUInt32BE(0)
 * (mainline uses crypto.createHash("sha256"); solo uses a fast deterministic
 * FNV-1a hash to avoid Node crypto in the engine; behavior is identical for
 * cadence: same inputs always produce same gap, gap always in [min,max]).
 */

export interface RecurringSchedule {
  kind: "recurring";
  everyTurns: number;
  offsetTurns: number;
}

export interface WindowSchedule {
  kind: "window";
  minGapTurns: number;
  maxGapTurns: number;
}

export type EventSchedule = RecurringSchedule | WindowSchedule;

/** FNV-1a 32-bit hash — deterministic, no crypto. */
function hashToUint32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Recurring schedule firing check: fires whenever `(turn - offsetTurns)` is
 * an exact multiple of `everyTurns`.
 * Source: src/lib/events/worldEvents/scheduler.ts isRecurringDue
 */
export function isRecurringDue(
  turn: number,
  schedule: Pick<RecurringSchedule, "everyTurns" | "offsetTurns">,
): boolean {
  if (schedule.everyTurns <= 0) return false;
  const remainder = (turn - schedule.offsetTurns) % schedule.everyTurns;
  const normalized = ((remainder % schedule.everyTurns) + schedule.everyTurns) % schedule.everyTurns;
  return normalized === 0;
}

/**
 * Deterministic gap in turns until a window schedule's next fire,
 * derived from hash(countryId, definitionKind, lastFiredTurn).
 * Source: src/lib/events/worldEvents/scheduler.ts windowGapTurns
 */
export function windowGapTurns(
  countryId: string,
  definitionKind: string,
  lastFiredTurn: number,
  schedule: Pick<WindowSchedule, "minGapTurns" | "maxGapTurns">,
): number {
  if (schedule.minGapTurns > schedule.maxGapTurns) {
    throw new Error("windowGapTurns: minGapTurns cannot exceed maxGapTurns");
  }
  const span = schedule.maxGapTurns - schedule.minGapTurns + 1;
  const seed = hashToUint32(`worldEventSchedule:${countryId}:${definitionKind}:${lastFiredTurn}`);
  return schedule.minGapTurns + (seed % span);
}

/**
 * Window schedule firing check. Never-fired (undefined) is immediately eligible.
 * Source: src/lib/events/worldEvents/scheduler.ts isWindowDue
 */
export function isWindowDue(
  turn: number,
  countryId: string,
  definitionKind: string,
  lastFiredTurn: number | undefined,
  schedule: Pick<WindowSchedule, "minGapTurns" | "maxGapTurns">,
): boolean {
  if (lastFiredTurn === undefined) return true;
  const gap = windowGapTurns(countryId, definitionKind, lastFiredTurn, schedule);
  return turn >= lastFiredTurn + gap;
}

/**
 * Single entry point covering both schedule kinds.
 * Source: src/lib/events/worldEvents/scheduler.ts isScheduleDue
 */
export function isScheduleDue(
  turn: number,
  countryId: string,
  definitionKind: string,
  lastFiredTurn: number | undefined,
  schedule: EventSchedule,
): boolean {
  if (schedule.kind === "recurring") return isRecurringDue(turn, schedule);
  return isWindowDue(turn, countryId, definitionKind, lastFiredTurn, schedule);
}
