/**
 * National committee elections.
 * Ports src/lib/nationalCommitteeElections.ts createMissing + processCompleted.
 * Committee size 6, each voter may vote up to 6 (MAX_VOTES_PER_VOTER).
 */

import type { WorldState, Politician } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { NationalCommitteeElectionRecord } from "./types.js";
import { COMMITTEE_ELECTION_DURATION_TURNS, COMMITTEE_SIZE, MAX_VOTES_PER_VOTER } from "./constants.js";
import { pickCommitteeCandidatesForVoter } from "./ballot.js";

function electionId(countryId: string, partyId: string, cycle: number): string {
  return `${countryId}:${partyId}:c${cycle}`;
}

export function createMissingCommitteeElections(world: WorldState, rng: WorldRng): number {
  const turn = world.meta.turn;
  const parties = Object.values(world.parties);
  const activeKeys = new Set(
    world.nationalCommitteeElections.filter((e) => e.status === "voting").map((e) => `${e.countryId}:${e.partyId}`),
  );
  let created = 0;
  for (const party of parties) {
    const key = `${party.countryId}:${party.id}`;
    if (activeKeys.has(key)) continue;
    const effectiveDuration = (party as unknown as { customElectionDurationTurns?: number }).customElectionDurationTurns ?? COMMITTEE_ELECTION_DURATION_TURNS;
    const existingMax = Math.max(
      0,
      ...world.nationalCommitteeElections
        .filter((e) => e.partyId === party.id && e.countryId === party.countryId)
        .map((e) => e.cycle),
    );
    const cycle = existingMax + 1;
    const rec: NationalCommitteeElectionRecord = {
      id: electionId(party.countryId, party.id, cycle),
      partyId: party.id,
      countryId: party.countryId,
      status: "voting",
      startTurn: turn,
      endTurn: turn + effectiveDuration,
      durationTurns: effectiveDuration,
      cycle,
      winnerIds: [],
      candidateIds: [],
      votes: {},
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    const pool = world.politicians.filter((p) => p.partyId === party.id);
    const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
    // Committee races want more candidates (up to 10 or pool size)
    const maxCandidates = Math.min(sorted.length, 10);
    const numCandidates = maxCandidates <= 6 ? maxCandidates : 6 + rng.int(0, Math.min(4, maxCandidates - 6));
    const shuffled = [...sorted];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    rec.candidateIds = shuffled.slice(0, Math.min(numCandidates, shuffled.length)).map((c) => c.id);
    if (world.player.partyId === party.id && !rec.candidateIds.includes("player") && sorted.length > 0 && rng.next() < 0.3) {
      rec.candidateIds.push("player");
    }
    world.nationalCommitteeElections.push(rec);
    created++;
  }
  if (created > 0) world.nationalCommitteeElections.sort((a, b) => a.id.localeCompare(b.id));
  return created;
}

export function resolveCommitteeElections(world: WorldState, rng: WorldRng): number {
  const turn = world.meta.turn;
  const due = world.nationalCommitteeElections.filter((e) => e.status === "voting" && e.endTurn <= turn);
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
    const voters = world.politicians.filter((p) => p.partyId === election.partyId);
    // Auto-ballot gaps
    for (const voter of voters) {
      if (election.votes[voter.id] !== undefined) continue;
      if (candidatePols.length === 0) break;
      const picks = pickCommitteeCandidatesForVoter(voter, candidatePols, rng, MAX_VOTES_PER_VOTER);
      if (picks.length > 0) election.votes[voter.id] = picks;
    }
    // Tally
    const counts = new Map<string, number>();
    for (const cid of election.candidateIds) counts.set(cid, 0);
    for (const picks of Object.values(election.votes)) {
      for (const cid of picks) {
        if (counts.has(cid)) counts.set(cid, (counts.get(cid) ?? 0) + 1);
      }
    }
    const sorted = election.candidateIds
      .map((cid) => ({ cid, votes: counts.get(cid) ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.cid.localeCompare(b.cid));
    const winners = sorted.slice(0, COMMITTEE_SIZE).filter((s) => s.votes > 0 || candidatePols.length <= COMMITTEE_SIZE).map((s) => s.cid);
    // If fewer candidates than seats, all are winners (even with 0 votes) mirrors mainline.
    const finalWinners = candidatePols.length <= COMMITTEE_SIZE ? election.candidateIds.slice() : winners;
    election.status = "completed";
    election.winnerIds = finalWinners;
    election.updatedAt = world.meta.date;
    // Apply to party committeeIds
    const party = world.parties[election.partyId] as unknown as Record<string, unknown> | undefined;
    if (party) {
      party["committeeIds"] = finalWinners.slice();
    }
    resolved++;
    const partyName = world.parties[election.partyId]?.name ?? election.partyId;
    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline: `Committee election: ${partyName} committee elected (${finalWinners.length} members)`,
    });
  }
  return resolved;
}
