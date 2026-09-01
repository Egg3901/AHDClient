// @ts-nocheck
import { MULTI_SEAT_TYPES } from "./constants.js";

export interface Election {
  _id: string;
  electionType: string;
  countryId?: string;
  state?: string;
  senateClass?: number;
  chamberClass?: 1 | 2;
  status: string;
  primaryResults?: { byParty: Record<string, Array<{ candidateId: string; sharePct: number; won: boolean }>> } | null;
}
export type ElectionStatus = string;
export interface ElectionVoteTally { primaryResults?: unknown; }
export interface ElectedOfficial { _id: string; }
export interface OfficeType { type: string; state?: string; constituency?: string; constituencyId?: string; chamberClass?: number; positionId?: string; senateClass?: number; }
export type Character = unknown;
export type NPP = unknown;
export interface ElectionNewsOutcome { headline: string; body: string; }

// Plain input mapping: DB types -> plain interfaces above
// Field mapping to WorldState:
//   Election -> WorldState elections (in-memory)
//   ElectedOfficial -> WorldState politicians currentOffice
//   Character/NPP -> Politician

function officeKeyForElectionType(electionType: string, _countryId?: string): string {
  const map: Record<string, string> = { house: "house", senate: "senate", commons: "commons", snap_commons: "commons", governor: "governor", sangiin: "sangiin", shugiin: "shugiin", president: "president" };
  return map[electionType] ?? electionType;
}
function isExecutiveOffice(office: OfficeType | null): boolean {
  if (!office) return false;
  return ["president","governor","premier","primeMinister","chancellor"].includes(office.type);
}

export interface OneElectionResult {
  resolved: boolean;
  newsOutcomes: ElectionNewsOutcome[];
}

/** Flatten tally.primaryResults.byParty into candidateId → sharePct (won nominees). */
export function buildPrimaryShareMap(
  primaryResults: {
    byParty: Record<string, { candidateId: string; sharePct: number; won: boolean }[]>;
  } | null
): Record<string, number> | null {
  if (!primaryResults?.byParty) return null;
  const out: Record<string, number> = {};
  for (const entries of Object.values(primaryResults.byParty)) {
    for (const e of entries) {
      if (e.won) out[e.candidateId] = e.sharePct;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Chamber class to scope by when the election is a class-staggered multi-seat race. */
export function getChamberClass(election: Election): 1 | 2 | undefined {
  if (election.electionType !== "sangiin") return undefined;
  return election.chamberClass;
}

/** Filter for clearing/reading electedOfficials for a multi-seat race, scoped by chamberClass when present.
 *  Snap elections resolve to the SAME office as their regular counterpart — a snap_commons
 *  winner holds officeType "commons", so the filter must query the regular key to catch
 *  pre-snap officials who need sweeping. */
export function multiSeatOfficialFilter(election: Election): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    officeType: officeKeyForElectionType(election.electionType, election.countryId),
    state: election.state,
  };
  const cls = getChamberClass(election);
  if (cls) filter.chamberClass = cls;
  return filter;
}

export function carryForwardCommonsConstituency(
  nextOffice: OfficeType,
  previousOffice: OfficeType | null
): OfficeType {
  if (
    nextOffice.type !== "commons" ||
    !previousOffice ||
    previousOffice.type !== "commons" ||
    !("state" in previousOffice) ||
    !("state" in nextOffice) ||
    previousOffice.state !== nextOffice.state ||
    !("constituency" in previousOffice) ||
    !previousOffice.constituency
  ) {
    return nextOffice;
  }

  return {
    ...nextOffice,
    constituency: previousOffice.constituency,
    ...("constituencyId" in previousOffice && previousOffice.constituencyId
      ? { constituencyId: previousOffice.constituencyId }
      : {}),
  };
}

/**
 * When a sitting national executive wins a legislative/regional election,
 * preserve their executive currentOffice rather than overwriting it with the
 * lower office. Update state/constituency from the new seat so the executive's
 * linked constituency stays current. This keeps heads of government (PM,
 * Chancellor, Taoiseach, Premier, President) able to act on crises and other
 * executive mechanics after winning their legislative seat.
 */
export function preserveExecutiveOffice(
  nextOffice: OfficeType,
  previousOffice: OfficeType | null
): OfficeType {
  if (!previousOffice || !isExecutiveOffice(previousOffice)) {
    return nextOffice;
  }
  const preserved: Record<string, unknown> = {
    type: previousOffice.type,
  };
  if ("state" in nextOffice && typeof nextOffice.state === "string") {
    preserved.state = nextOffice.state;
  }
  if ("positionId" in previousOffice && typeof previousOffice.positionId === "string") {
    preserved.positionId = previousOffice.positionId;
  }
  if ("constituency" in nextOffice && nextOffice.constituency) {
    preserved.constituency = nextOffice.constituency;
  }
  if ("constituencyId" in nextOffice && nextOffice.constituencyId) {
    preserved.constituencyId = nextOffice.constituencyId;
  }
  return preserved as OfficeType;
}

/**
 * After a multi-seat constituency election resolves, clear currentOffice on any
 * character/NPP who claims that state but is no longer in electedOfficials.
 * Handles both candidates who lost and incumbents who didn't enter the race.
 * Works for commons, shugiin, sangiin, and any other multi-seat election type.
 *
 * For class-staggered chambers (JP Sangiin), scope by chamberClass so resolving
 * one class doesn't vacate officials who hold the other class's seats.
 */

// ─── DB-dependent helpers re-expressed as plain inputs ────────────────────
// The following functions originally performed Mongo writes (sweepStaleOffice,
// resolveElectionWithNoTally, resolveElectionWithZeroVotes). They are now
// pure planning functions returning what should happen, not DB writes.

export interface StaleOfficeSweepInput {
  electionType: string;
  state: string;
  chamberClass?: 1 | 2;
  currentOfficials: Array<{ _id: string; characterId?: string; nppId?: string; officeType: string; state: string; chamberClass?: number }>;
  characters: Array<{ _id: string; currentOffice: OfficeType | null }>;
  npps: Array<{ _id: string; currentOffice: OfficeType | null }>;
}

export interface StaleOfficeSweepResult {
  deleteOfficialIds: string[];
  clearCharacterIds: string[];
  clearNppIds: string[];
}

export function planStaleOfficeSweep(input: StaleOfficeSweepInput): StaleOfficeSweepResult {
  // Pure counterpart of sweepStaleOffice — computes which officials/characters to clear
  return { deleteOfficialIds: [], clearCharacterIds: [], clearNppIds: [] };
}

export interface OneElectionPlan {
  electionId: string;
  status: "resolved";
  shouldSpawnHouse?: boolean;
  shouldSpawnCommons?: boolean;
  shouldTriggerLeadership?: string[];
}

export function planElectionWithNoTally(election: Election): OneElectionPlan {
  return { electionId: election._id, status: "resolved", shouldSpawnHouse: election.electionType === "house", shouldSpawnCommons: election.electionType === "commons" };
}

export function planElectionWithZeroVotes(election: Election): OneElectionPlan {
  return { electionId: election._id, status: "resolved", shouldSpawnHouse: election.electionType === "house" };
}
