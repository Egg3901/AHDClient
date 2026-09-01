import type { WorldState } from "../types.js";
import { majorityThreshold, minorityThreshold } from "./constants.js";
import type { GovernmentFormationType } from "./types.js";

export interface FormationOutcome {
  formationType: GovernmentFormationType;
  governingPartyId: string | null;
  coalitionPartyIds: string[] | null;
  totalSeatsSupporting: number;
}

const NO_FORMATION: FormationOutcome = {
  formationType: null,
  governingPartyId: null,
  coalitionPartyIds: null,
  totalSeatsSupporting: 0,
};

/**
 * Pure seat-math formation decision for one chamber. Ports the threshold
 * logic mainline computes in `checkAppointmentEligibility`
 * (parliamentaryGovernment.ts:1388-1505): majority threshold
 * floor(totalSeats/2)+1 and the minority-bid floor
 * ceil(totalSeats*0.1538) (both in ./constants.ts).
 *
 * Mainline itself never auto-decides WHICH eligible bid wins — a party or
 * coalition chair proposes, the chamber votes, and any eligible bid
 * (including a minority bid while another party holds an outright majority)
 * can in principle be put forward. Solo has no chair-proposal/chamber-vote
 * interaction layer, so this function collapses that process to a
 * deterministic outcome for the common case, in this preference order:
 *
 *  1. A single party at/above the majority threshold governs alone
 *     ("majority") — the equilibrium outcome mainline's own auto-voting NPPs
 *     produce for a party-line vote when a real majority exists.
 *  2. Otherwise, try a coalition: sort parties by seats descending
 *     (tie-break party id), greedily add the largest remaining party until
 *     the combined total clears the majority threshold. This
 *     greedy-largest-first construction is a solo-only stand-in for the
 *     chair-proposal process — PORT-STUB, not a mainline algorithm (no
 *     coalition-partner-selection function exists in mainline to cite; it is
 *     an emergent result of whichever chair's proposal wins the chamber
 *     vote).
 *  3. Otherwise, the largest single party governs as a minority government
 *     if its seats clear the minority floor.
 *  4. Otherwise there is no eligible bid: the chamber stays hung (null).
 */
export function computeFormation(seatsByParty: Record<string, number>, totalSeats: number): FormationOutcome {
  const majority = majorityThreshold(totalSeats);
  const minFloor = minorityThreshold(totalSeats);
  const parties = Object.entries(seatsByParty)
    .filter(([, seats]) => seats > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (parties.length === 0) return NO_FORMATION;

  const [leadId, leadSeats] = parties[0]!;
  if (leadSeats >= majority) {
    return { formationType: "majority", governingPartyId: leadId, coalitionPartyIds: null, totalSeatsSupporting: leadSeats };
  }

  let sum = 0;
  const members: string[] = [];
  for (const [pid, seats] of parties) {
    members.push(pid);
    sum += seats;
    if (sum >= majority) break;
  }
  if (sum >= majority && members.length > 1) {
    const sorted = [...members].sort();
    return { formationType: "coalition", governingPartyId: members[0]!, coalitionPartyIds: sorted, totalSeatsSupporting: sum };
  }

  if (leadSeats >= minFloor) {
    return { formationType: "minority", governingPartyId: leadId, coalitionPartyIds: null, totalSeatsSupporting: leadSeats };
  }
  return NO_FORMATION;
}

/**
 * PM (or RU/DD equivalent head-of-government) selection from a governing
 * party's seat-holding politicians in the government chamber.
 *
 * Ports mainline's PM-nominator rule: the party's seated chair, falling back
 * to the vice-chair ("VC-acting-chair" rule — src/lib/db/types/party.ts:29-31,
 * checkAppointmentEligibility). Rotunda's Party type (types.ts) has no
 * chairId/viceChairId field yet — the W20 leadership wave that would add one
 * had not merged as of this wave. PORT-STUB: feature-detect an optional
 * `chairId`/`viceChairId`/`leaderId` string field on the party record (so
 * this starts working for free the moment a later wave adds one) and fall
 * back to the seat-holding politician of that party with the highest
 * accumulated `partyInfluence` (tie-break: lowest politician id) as a
 * deterministic stand-in for "the party's senior figure" — a reasonable
 * proxy since partyInfluence already exists in this repo as the per-politician
 * standing/seniority accumulator (party/partyInfluence.ts).
 *
 * The player is never returned: mainline's PM path runs through an
 * interactive nomination+chamber-vote flow this wave does not port (see
 * government/phases.ts file doc), so per operator instruction this does not
 * invent a player-PM shortcut — PM is always drawn from `world.politicians`.
 */
export function selectPm(world: WorldState, countryId: string, chamberKey: string, partyId: string): string | null {
  const party = world.parties[partyId] as unknown as Record<string, unknown> | undefined;
  const leaderId = party?.["chairId"] ?? party?.["viceChairId"] ?? party?.["leaderId"];
  if (typeof leaderId === "string" && leaderId.length > 0) {
    const held = world.politicians.find(
      (p) => p.id === leaderId && p.countryId === countryId && p.chamberKey === chamberKey && p.partyId === partyId,
    );
    if (held) return held.id;
  }
  const candidates = world.politicians.filter(
    (p) => p.countryId === countryId && p.chamberKey === chamberKey && p.partyId === partyId,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.partyInfluence - a.partyInfluence || a.id.localeCompare(b.id));
  return candidates[0]!.id;
}
