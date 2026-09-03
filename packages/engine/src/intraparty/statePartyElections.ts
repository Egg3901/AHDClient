/**
 * State party elections (per-region leadership).
 * Ports src/lib/statePartyElections.ts createMissingElections + processCompletedElections
 * with solo adaptations: pure WorldState mutations, rng-deterministic candidacy and NPP ballots.
 */

import type { WorldState, Politician } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { StatePartyElectionRecord } from "./types.js";
import {
  STATE_PARTY_ELECTION_DURATION_TURNS,
  FOUNDING_STATE_ELECTION_DURATION_TURNS,
  STATE_PARTY_POSITIONS,
} from "./constants.js";
import { pickCandidateForVoter } from "./ballot.js";

function electionId(regionId: string, partyId: string, position: string, cycle: number): string {
  return `${regionId}:${partyId}:${position}:c${cycle}`;
}

function eligibleCandidatesForStateParty(
  world: WorldState,
  regionId: string,
  partyId: string,
): Politician[] {
  // Candidates must be members of this party. For state scope, prefer those whose
  // electedState or party membership indicates regional presence, but don't gate strictly
  // since solo politicians may not have electedState set. Include all party members.
  return world.politicians.filter((p) => p.partyId === partyId);
}

function votersForStateParty(world: WorldState, regionId: string, partyId: string): Array<Politician | { id: string; ideology: Politician["ideology"]; personality: Politician["personality"] }> {
  // Eligible voters are party members in this state/region (mirrors StatePartyVote voter being a character in that state party).
  // For solo, use all party members as voters; if none, fall back to empty (rare).
  const polityVoters = world.politicians.filter((p) => p.partyId === partyId);
  const result: Array<Politician | { id: string; ideology: Politician["ideology"]; personality: Politician["personality"] }> = [...polityVoters];
  // Player may vote if member of this party and eligible via ballot action (recorded in votes map).
  return result;
}

export function createMissingStatePartyElections(world: WorldState, rng: WorldRng): number {
  const duration = STATE_PARTY_ELECTION_DURATION_TURNS;
  const foundingDuration = FOUNDING_STATE_ELECTION_DURATION_TURNS;
  const turn = world.meta.turn;
  const isFounding = false; // PORT-STUB: mainline founding phase via gameState.preIteration.active — no preIteration in solo
  const effectiveDuration = isFounding ? foundingDuration : duration;

  const activeKeys = new Set(
    world.statePartyElections.filter((e) => e.status === "voting").map((e) => `${e.regionId}:${e.partyId}:${e.position}`),
  );
  let created = 0;
  const regions = Object.values(world.regions);
  const parties = Object.values(world.parties);
  for (const region of regions) {
    for (const party of parties) {
      if (party.countryId !== region.countryId) continue;
      for (const position of STATE_PARTY_POSITIONS) {
        const key = `${region.id}:${party.id}:${position}`;
        if (activeKeys.has(key)) continue;
        const existingMaxCycle = Math.max(
          0,
          ...world.statePartyElections
            .filter((e) => e.regionId === region.id && e.partyId === party.id && e.position === position)
            .map((e) => e.cycle),
        );
        const cycle = existingMaxCycle + 1;
        const rec: StatePartyElectionRecord = {
          id: electionId(region.id, party.id, position, cycle),
          regionId: region.id,
          partyId: party.id,
          countryId: region.countryId,
          position,
          status: "voting",
          startTurn: turn,
          endTurn: turn + effectiveDuration,
          durationTurns: effectiveDuration,
          cycle,
          winnerId: null,
          ...(isFounding ? { founding: true } : {}),
          candidateIds: [],
          votes: {},
          createdAt: world.meta.date,
          updatedAt: world.meta.date,
        };
        // Seed candidacies deterministically: pick 2-3 eligible politicians via rng
        const pool = eligibleCandidatesForStateParty(world, region.id, party.id);
        // Sort for determinism before sampling
        const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
        const numCandidates = Math.min(sorted.length, 1 + rng.int(1, 2)); // 2 or 3 if enough pool, 1-2 otherwise
        const shuffled = [...sorted];
        // Fisher-Yates via rng
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          const tmp = shuffled[i]!;
          shuffled[i] = shuffled[j]!;
          shuffled[j] = tmp;
        }
        const chosen = shuffled.slice(0, Math.min(numCandidates, shuffled.length));
        rec.candidateIds = chosen.map((c) => c.id);
        // Include player if member of this party and not already candidate
        if (world.player.partyId === party.id && !rec.candidateIds.includes("player") && rng.next() < 0.3) {
          // Player contests 30% of races where eligible, deterministic via rng
          rec.candidateIds.push("player");
        }
        // If still empty (e.g. no party members), leave empty — resolution will handle vacancy.
        world.statePartyElections.push(rec);
        created++;
      }
    }
  }
  if (created > 0) {
    // Keep sorted for deterministic iteration elsewhere
    world.statePartyElections.sort((a, b) => a.id.localeCompare(b.id));
  }
  return created;
}

export function resolveStatePartyElections(world: WorldState, rng: WorldRng): number {
  const turn = world.meta.turn;
  const due = world.statePartyElections.filter((e) => e.status === "voting" && e.endTurn <= turn);
  if (due.length === 0) return 0;
  let resolved = 0;
  for (const election of due.sort((a, b) => a.id.localeCompare(b.id))) {
    // Gather candidate politicians
    const candidatePols: Array<Pick<Politician, "id" | "ideology">> = [];
    for (const cid of election.candidateIds) {
      if (cid === "player") {
        // Player as candidate: use player's party position neutral; ideology from player's party or 0
        const party = world.parties[election.partyId];
        candidatePols.push({ id: "player", ideology: { economic: party?.economicPosition ?? 0, social: party?.socialPosition ?? 0 } });
      } else {
        const pol = world.politicians.find((p) => p.id === cid);
        if (pol) candidatePols.push({ id: pol.id, ideology: pol.ideology });
      }
    }
    // Count persisted ballots first. New saves only persist player ballots;
    // older saves may also contain NPC ballots, so accepting every existing
    // entry preserves their result across migration.
    const counts = new Map<string, number>();
    for (const candidateId of election.candidateIds) counts.set(candidateId, 0);
    for (const votedFor of Object.values(election.votes)) {
      if (counts.has(votedFor)) counts.set(votedFor, (counts.get(votedFor) ?? 0) + 1);
    }

    // Fill NPC ballot gaps transiently. Persisting one entry per politician in
    // every regional race made mature mobile saves hundreds of MiB while the
    // entries were never read again after this resolution pass.
    const voters = votersForStateParty(world, election.regionId, election.partyId);
    for (const voter of voters) {
      // Skip voters already present in an old save's ballot map.
      if (election.votes[voter.id] !== undefined) continue;
      if (candidatePols.length === 0) break;
      // Adapt voter to required shape
      const voterShape: Pick<Politician, "ideology" | "personality"> = {
        ideology: (voter as Politician).ideology ?? { economic: 0, social: 0 },
        personality: (voter as Politician).personality ?? { loyalty: 50, ambition: 50, stubbornness: 50 },
      };
      const pick = pickCandidateForVoter(voterShape, candidatePols, rng);
      if (pick && counts.has(pick)) counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
    // Determine winner: max votes, earliest candidate id tie break (mirrors mainline enteredAt tie break)
    let winnerId: string | null = null;
    let maxVotes = -1;
    const sortedCandidates = [...election.candidateIds].sort((a, b) => a.localeCompare(b));
    for (const cid of sortedCandidates) {
      const c = counts.get(cid) ?? 0;
      if (c > maxVotes) {
        maxVotes = c;
        winnerId = cid;
      }
    }
    // No winner if no votes cast or no candidates
    if (candidatePols.length === 0 || maxVotes <= 0) winnerId = null;
    // If still null but candidates exist, pick earliest (handles zero-vote case differently from mainline which vacates)
    // For state, mainline vacates on no-winner+incumbent not stood. Solo: keep current leadership if no winner.
    const priorHolder = getStatePartyLeadership(world, election.regionId, election.partyId, election.position);
    if (winnerId === null) {
      election.status = "completed";
      election.winnerId = null;
      election.updatedAt = world.meta.date;
      resolved++;
      // No news for vacated/no-winner to avoid spam, but record debug.
      continue;
    }
    election.status = "completed";
    election.winnerId = winnerId;
    election.updatedAt = world.meta.date;
    // Apply leadership to state party role
    setStatePartyLeadership(world, election.regionId, election.partyId, election.position, winnerId);
    resolved++;
    const regionName = world.regions[election.regionId]?.name ?? election.regionId;
    const partyName = world.parties[election.partyId]?.name ?? election.partyId;
    const winnerName = winnerId === "player" ? world.player.name : (world.politicians.find((p) => p.id === winnerId)?.name ?? winnerId);
    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline: `State party election: ${partyName} ${election.position} in ${regionName} won by ${winnerName}`,
    });
    // If winner was previous holder of another position in same state-party, vacate prior
    vacateOtherStatePositions(world, election.regionId, election.partyId, election.position, winnerId);
    void priorHolder;
  }
  return resolved;
}

function getStatePartyLeadership(world: WorldState, regionId: string, partyId: string, position: string): string | null {
  const pr = world.partyRegions[`${regionId}:${partyId}`] as Record<string, unknown> | undefined;
  if (!pr) return null;
  const field = position === "chair" ? "chairId" : position === "viceChair" ? "viceChairId" : "treasurerId";
  const v = pr[field] as string | null | undefined;
  return v ?? null;
}

function setStatePartyLeadership(world: WorldState, regionId: string, partyId: string, position: string, winnerId: string): void {
  const key = `${regionId}:${partyId}`;
  const pr = world.partyRegions[key] as Record<string, unknown> | undefined;
  if (!pr) return;
  const field = position === "chair" ? "chairId" : position === "viceChair" ? "viceChairId" : "treasurerId";
  pr[field] = winnerId === "player" ? "player" : winnerId;
}

function vacateOtherStatePositions(world: WorldState, regionId: string, partyId: string, wonPosition: string, winnerId: string): void {
  const key = `${regionId}:${partyId}`;
  const pr = world.partyRegions[key] as Record<string, unknown> | undefined;
  if (!pr) return;
  for (const pos of STATE_PARTY_POSITIONS) {
    if (pos === wonPosition) continue;
    const field = pos === "chair" ? "chairId" : pos === "viceChair" ? "viceChairId" : "treasurerId";
    if ((pr[field] as string | null) === winnerId) {
      pr[field] = null;
    }
  }
}
