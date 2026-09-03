/**
 * National party leadership elections.
 * Ports src/lib/nationalPartyElections.ts createMissing + processCompleted.
 */

import type { WorldState, Politician } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { NationalPartyElectionRecord } from "./types.js";
import {
  NATIONAL_PARTY_ELECTION_DURATION_TURNS,
  FOUNDING_CHAIR_ELECTION_DURATION_TURNS,
  NATIONAL_PARTY_POSITIONS,
} from "./constants.js";
import { pickCandidateForVoter } from "./ballot.js";

function electionId(countryId: string, partyId: string, position: string, cycle: number): string {
  return `${countryId}:${partyId}:${position}:c${cycle}`;
}

export function createMissingNationalPartyElections(world: WorldState, rng: WorldRng): number {
  const turn = world.meta.turn;
  // PORT-STUB: founding phase not modeled; effective duration is default 72, but party.customElectionDurationTurns may override
  const parties = Object.values(world.parties);
  const activeKeys = new Set(
    world.nationalPartyElections.filter((e) => e.status === "voting").map((e) => `${e.countryId}:${e.partyId}:${e.position}`),
  );
  let created = 0;
  for (const party of parties) {
    const effectiveDuration = (party as unknown as { customElectionDurationTurns?: number }).customElectionDurationTurns ?? NATIONAL_PARTY_ELECTION_DURATION_TURNS;
    for (const position of NATIONAL_PARTY_POSITIONS) {
      const key = `${party.countryId}:${party.id}:${position}`;
      if (activeKeys.has(key)) continue;
      const existingMax = Math.max(
        0,
        ...world.nationalPartyElections
          .filter((e) => e.partyId === party.id && e.countryId === party.countryId && e.position === position)
          .map((e) => e.cycle),
      );
      const cycle = existingMax + 1;
      const rec: NationalPartyElectionRecord = {
        id: electionId(party.countryId, party.id, position, cycle),
        partyId: party.id,
        countryId: party.countryId,
        position,
        status: "voting",
        startTurn: turn,
        endTurn: turn + effectiveDuration,
        durationTurns: effectiveDuration,
        cycle,
        winnerId: null,
        candidateIds: [],
        votes: {},
        createdAt: world.meta.date,
        updatedAt: world.meta.date,
      };
      const pool = world.politicians.filter((p) => p.partyId === party.id);
      const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
      const numCandidates = Math.min(sorted.length, 1 + rng.int(1, 2));
      const shuffled = [...sorted];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const tmp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = tmp;
      }
      rec.candidateIds = shuffled.slice(0, Math.min(numCandidates, shuffled.length)).map((c) => c.id);
      if (world.player.partyId === party.id && !rec.candidateIds.includes("player") && rng.next() < 0.3) {
        rec.candidateIds.push("player");
      }
      world.nationalPartyElections.push(rec);
      created++;
    }
  }
  if (created > 0) world.nationalPartyElections.sort((a, b) => a.id.localeCompare(b.id));
  return created;
}

export function resolveNationalPartyElections(world: WorldState, rng: WorldRng): number {
  const turn = world.meta.turn;
  const due = world.nationalPartyElections.filter((e) => e.status === "voting" && e.endTurn <= turn);
  if (due.length === 0) return 0;
  let resolved = 0;
  for (const election of due.sort((a, b) => a.id.localeCompare(b.id))) {
    const candidatePols: Array<Pick<Politician, "id" | "ideology">> = [];
    for (const cid of election.candidateIds) {
      if (cid === "player") {
        const party = world.parties[election.partyId];
        candidatePols.push({ id: "player", ideology: { economic: party?.economicPosition ?? 0, social: party?.socialPosition ?? 0 } });
      } else {
        const pol = world.politicians.find((p) => p.id === cid);
        if (pol) candidatePols.push({ id: pol.id, ideology: pol.ideology });
      }
    }
    // Eligible voters: all party members (mirrors mainline getEligibleVoterSet or player members)
    // For "committee" method, voters would be committee+leadership; we PORT-STUB to full party since eligibility calc is pure but membership method not yet in world.
    const voters = world.politicians.filter((p) => p.partyId === election.partyId);
    // Weighted scoring if leadershipElectionMethod === "influence": tally uses partyInfluenceSum
    const party = world.parties[election.partyId] as unknown as { leadershipElectionMethod?: string; chairId?: string | null; viceChairId?: string | null; treasurerId?: string | null; committeeIds?: string[] } | undefined;
    const useInfluence = party?.leadershipElectionMethod === "influence";
    const counts = new Map<string, number>();
    for (const cid of election.candidateIds) counts.set(cid, 0);

    // Accept persisted player ballots and the NPC ballots found in older
    // saves. New NPC decisions are tallied below without bloating the save.
    for (const [voterId, votedFor] of Object.entries(election.votes)) {
      const voter = voters.find((candidate) => candidate.id === voterId);
      const weight = useInfluence && voter ? Math.max(0, voter.partyInfluence ?? 0) : 1;
      const effectiveWeight = useInfluence ? weight : 1;
      if (counts.has(votedFor)) counts.set(votedFor, (counts.get(votedFor) ?? 0) + effectiveWeight);
    }

    for (const voter of voters) {
      if (election.votes[voter.id] !== undefined) continue;
      if (candidatePols.length === 0) break;
      const pick = pickCandidateForVoter(voter, candidatePols, rng);
      if (pick) {
        // For influence method, weight by voter.partyInfluence; else 1 vote.
        // Citing src/lib/nationalPartyElections.ts partyInfluenceSum aggregation.
        const weight = useInfluence ? Math.max(0, (voter.partyInfluence ?? 0)) : 1;
        // If influence is 0 for all, still count as 1? Mainline sums; solo: ensure at least 1 if abstain not triggered but pick existed
        const effectiveWeight = useInfluence && weight === 0 ? 0 : (useInfluence ? weight : 1);
        if (effectiveWeight > 0 && counts.has(pick)) {
          counts.set(pick, (counts.get(pick) ?? 0) + effectiveWeight);
        }
      }
    }
    let winnerId: string | null = null;
    let max = -1;
    for (const cid of [...election.candidateIds].sort((a, b) => a.localeCompare(b))) {
      const c = counts.get(cid) ?? 0;
      if (c > max) {
        max = c;
        winnerId = cid;
      }
    }
    if (candidatePols.length === 0 || max <= 0) winnerId = null;
    if (winnerId === null) {
      // No winner: check incumbent vacate logic per src/lib/nationalPartyElections.ts ticket #1100
      // incumbent who did not stand loses seat; who stood keeps it.
      const field = election.position === "chair" ? "chairId" : election.position === "viceChair" ? "viceChairId" : "treasurerId";
      const holderId = (party as Record<string, unknown> | undefined)?.[field] as string | null | undefined ?? null;
      const incumbentStood = holderId != null && election.candidateIds.includes(holderId);
      if (holderId && !incumbentStood && party) {
        (party as Record<string, unknown>)[field] = null;
        if (election.position === "chair") {
          // coalition sync stubbed; news will note vacancy
        }
        world.news.push({
          turn: world.meta.turn,
          date: world.meta.date,
          headline: `National party election: ${partyIdLabel(election.partyId, world)} ${election.position} vacated (incumbent did not stand)`,
        });
      }
      election.status = "completed";
      election.winnerId = null;
      election.updatedAt = world.meta.date;
      resolved++;
      continue;
    }
    election.status = "completed";
    election.winnerId = winnerId;
    election.updatedAt = world.meta.date;
    // Apply to party leadership
    const field = election.position === "chair" ? "chairId" : election.position === "viceChair" ? "viceChairId" : "treasurerId";
    const prior = (party as Record<string, unknown> | undefined)?.[field] as string | null | undefined ?? null;
    if (party) {
      (party as Record<string, unknown>)[field] = winnerId;
      // Auto-vacate other offices held by same winner (src/lib/nationalPartyElections.ts cross-position vacate)
      for (const pos of NATIONAL_PARTY_POSITIONS) {
        if (pos === election.position) continue;
        const otherField = pos === "chair" ? "chairId" : pos === "viceChair" ? "viceChairId" : "treasurerId";
        if ((party as Record<string, unknown>)[otherField] === winnerId) {
          (party as Record<string, unknown>)[otherField] = null;
        }
      }
      // Sync coalition chairCharacterId if this was chair election
      if (election.position === "chair") {
        for (const co of world.coalitions) {
          if (co.chairPartyId === election.partyId) {
            co.chairCharacterId = winnerId === "player" ? "player" : winnerId;
            co.updatedAtTurn = world.meta.turn;
          }
        }
      }
    }
    resolved++;
    const winnerName = winnerId === "player" ? world.player.name : (world.politicians.find((p) => p.id === winnerId)?.name ?? winnerId);
    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline: `National party election: ${partyIdLabel(election.partyId, world)} ${election.position} won by ${winnerName}`,
    });
    void prior;
  }
  return resolved;
}

function partyIdLabel(partyId: string, world: WorldState): string {
  return world.parties[partyId]?.name ?? partyId;
}

void FOUNDING_CHAIR_ELECTION_DURATION_TURNS;
