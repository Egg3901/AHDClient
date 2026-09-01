import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";
import {
  loadContingentElectionDataPlain,
  type CandidateInput as ContingentCandidateInput,
  type CharacterInput as ContingentCharacterInput,
  type ElectedOfficialInput,
  type PartyInput as ContingentPartyInput,
} from "../electionEngine/resolution/contingentData.js";
import { resolveContingentElection, type ContingentElectionResult } from "../electionEngine/resolution/contingentElection.js";
import { archiveCampaignsForElection } from "../campaigns/lifecycle.js";

/**
 * Presidential general-election resolution — W24 port.
 *
 * DESIGN DECISION (documented per the FRAMEWORK determinism/port doctrine):
 * mainline's live presidential general (`src/lib/presidentialElectionEngine.ts`
 * + `src/lib/turn/election/presidentResolution.ts`) is a per-STATE Electoral
 * College accumulation — ~1000 lines of bespoke per-unit logic (VP home-state
 * bonus, governor endorsements, granular per-unit electorate) entirely
 * separate from the general-purpose per-state tally every other race uses.
 * Porting that wholesale is out of scope for one wave. Rotunda instead
 * resolves the president as ONE nationwide race — the same "aggregate every
 * state into a single uniform electorate" shape mainline's own
 * `nationwideElectorate.ts` already uses for the presidential PRIMARY (see
 * `electionEngine/tallyAdapter.ts` for the accumulation side of this) — and
 * treats the 12th Amendment contingent-election path as: no candidate clears
 * an outright MAJORITY of the national vote. This is a deliberate
 * simplification, not a mainline behavior change: mainline's real general
 * remains state-by-state EV accumulation with the classic 270-elector
 * majority test. (Note for anyone tracing this against ops-knowledge memory
 * `ahd-presidential-uniform-national-vote`: that entry documents a mainline
 * BUG post-mortem — flat national multipliers washing out geographic
 * appeal — not an actual conversion away from the Electoral College. No such
 * conversion exists in mainline; "ruleset v3" is the unrelated September 2026
 * presidential-campaign-mechanics rework version number.)
 *
 * The 12th Amendment machinery itself — `contingentElection.ts` (House
 * state-delegation ballot for President, Senate ballot for VP) — IS ported
 * verbatim and reused unmodified here via `loadContingentElectionDataPlain`,
 * which already builds house-delegation/senator voter profiles from plain
 * inputs. Raw national vote counts stand in for "electoral votes" as the
 * ranking/tiebreak score — the pure function only needs a per-candidate
 * score to rank the top 3, not real electors.
 *
 * Scope: US only (see executive/types.ts file doc).
 */

function targetOffice(world: WorldState, id: string): { partyId: string } | undefined {
  if (id === "player") return world.player.partyId ? { partyId: world.player.partyId } : undefined;
  const pol = world.politicians.find((p) => p.id === id);
  return pol ? { partyId: pol.partyId } : undefined;
}

function buildContingentInputs(world: WorldState, rec: ElectionRecord) {
  const countryId = rec.countryId;

  const characters: ContingentCharacterInput[] = world.politicians.map((p) => ({
    _id: p.id,
    party: p.partyId,
    policies: { economic: p.ideology.economic, social: p.ideology.social },
    currentOffice: null,
  }));
  characters.push({
    _id: "player",
    // "independent" fallback (never bare `undefined` — exactOptionalPropertyTypes).
    party: world.player.partyId ?? "independent",
    currentOffice: null,
  });

  const partyMap = new Map<string, ContingentPartyInput>();
  for (const p of Object.values(world.parties)) {
    if (p.countryId !== countryId) continue;
    partyMap.set(`${countryId}:${p.id}`, { economicPosition: p.economicPosition, socialPosition: p.socialPosition });
  }

  const houseOfficials: ElectedOfficialInput[] = world.politicians
    .filter((p) => p.countryId === countryId && p.chamberKey === "house")
    .map((p) => ({
      _id: p.id,
      ...(p.electedState !== undefined ? { state: p.electedState } : {}),
      party: p.partyId,
      characterId: p.id,
      isNPP: false,
    }));
  // NOTE: a player-held House seat is intentionally excluded from the
  // contingent House delegation ballot — `player.legislativeSeat` records
  // chamberKey/countryId but not the held state (pre-existing gap, out of
  // scope here), so there is no delegation to place the player's vote in.

  const senateOfficials: ElectedOfficialInput[] = world.politicians
    .filter((p) => p.countryId === countryId && p.chamberKey === "senate")
    .map((p) => ({
      _id: p.id,
      ...(p.electedState !== undefined ? { state: p.electedState } : {}),
      party: p.partyId,
      characterId: p.id,
      isNPP: false,
    }));
  if (
    world.player.legislativeSeat != null &&
    world.player.legislativeSeat.countryId === countryId &&
    world.player.legislativeSeat.chamberKey === "senate"
  ) {
    senateOfficials.push({
      _id: "player",
      party: world.player.partyId ?? "independent",
      characterId: "player",
      isNPP: false,
    });
  }

  const candidates: ContingentCandidateInput[] = rec.candidates.map((c) => ({
    _id: c.id,
    party: c.partyId,
    isNPP: false,
    characterId: c.id,
    ...(c.runningMateId !== undefined ? { runningMateId: c.runningMateId } : {}),
  }));

  return { countryId, candidates, characters, partyMap, houseOfficials, senateOfficials };
}

function vpPartyFor(world: WorldState, vpId: string | null): string | null {
  if (!vpId) return null;
  if (vpId === "player") return world.player.partyId;
  return world.politicians.find((p) => p.id === vpId)?.partyId ?? null;
}

/** Vacate the executive: no votes cast / no candidates (mirrors mainline `vacatePresidency`). */
function vacate(world: WorldState, rec: ElectionRecord): void {
  const exec = world.executives[rec.countryId] ?? {
    countryId: rec.countryId,
    presidentId: null,
    presidentParty: null,
    termStartTurn: null,
    vicePresidentId: null,
    vicePresidentParty: null,
  };
  exec.presidentId = null;
  exec.presidentParty = null;
  exec.termStartTurn = null;
  exec.vicePresidentId = null;
  exec.vicePresidentParty = null;
  world.executives[rec.countryId] = exec;
  rec.status = "resolved";
  rec.winners = [];
  rec.resolvedTurn = world.meta.turn;
  archiveCampaignsForElection(world, rec.id);
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `The ${rec.countryId} presidency stays vacant: the election resolved with no votes cast`,
  });
}

export function applyPresidentialResolution(world: WorldState, rec: ElectionRecord): void {
  const totalVotes = Object.values(rec.tally).reduce((a, b) => a + b, 0);
  if (totalVotes === 0 || rec.candidates.length === 0) {
    vacate(world, rec);
    return;
  }

  const ranked = Object.entries(rec.tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const majorityThreshold = Math.floor(totalVotes / 2) + 1;

  let winnerId: string;
  let vpWinnerId: string | null;
  let resolutionMode: ContingentElectionResult["resolutionMode"] | "majority" = "majority";
  let contingentResult: ContingentElectionResult | undefined;

  const topEntry = ranked[0];
  if (topEntry && topEntry[1] >= majorityThreshold) {
    winnerId = topEntry[0];
    const winnerCand = rec.candidates.find((c) => c.id === winnerId);
    vpWinnerId = winnerCand?.runningMateId ?? null;
  } else {
    const { countryId, candidates, characters, partyMap, houseOfficials, senateOfficials } = buildContingentInputs(
      world,
      rec,
    );
    const loaded = loadContingentElectionDataPlain({
      countryId,
      candidates,
      electoralVotesByCandidate: rec.tally,
      characters,
      npps: [],
      partyMap,
      houseOfficials,
      senateOfficials,
      frozenChamber: null,
    });
    contingentResult = resolveContingentElection({
      electionId: rec.id,
      electoralVotesByCandidate: rec.tally,
      presidentCandidates: loaded.presidentCandidates,
      vicePresidentCandidates: loaded.vicePresidentCandidates,
      houseDelegations: loaded.houseDelegations,
      senators: loaded.senators,
      evByEligibleId: loaded.evByEligibleId,
    });
    winnerId = contingentResult.presidentWinnerId;
    vpWinnerId = contingentResult.vicePresidentWinnerId;
    resolutionMode = contingentResult.resolutionMode;
  }

  const winnerCand = rec.candidates.find((c) => c.id === winnerId);
  const winnerParty = winnerCand?.partyId ?? targetOffice(world, winnerId)?.partyId ?? "independent";
  const vpParty = vpPartyFor(world, vpWinnerId);

  const exec = world.executives[rec.countryId] ?? {
    countryId: rec.countryId,
    presidentId: null,
    presidentParty: null,
    termStartTurn: null,
    vicePresidentId: null,
    vicePresidentParty: null,
  };
  exec.presidentId = winnerId;
  exec.presidentParty = winnerParty;
  exec.termStartTurn = world.meta.turn;
  exec.vicePresidentId = vpWinnerId;
  exec.vicePresidentParty = vpParty;
  world.executives[rec.countryId] = exec;

  // Retire losing generated challengers (and their VP running mates) that
  // hold no other seat — same NPC-population bound as the legislative path
  // (orchestration.ts applyResolution).
  const winnerRunningMateIds = new Set([vpWinnerId].filter((id): id is string => id != null));
  const losingGeneratedIds = new Set<string>();
  for (const c of rec.candidates) {
    if (c.id !== winnerId && c.id.includes("-CH")) losingGeneratedIds.add(c.id);
    if (c.runningMateId && !winnerRunningMateIds.has(c.runningMateId) && c.runningMateId.includes("-VP")) {
      losingGeneratedIds.add(c.runningMateId);
    }
  }
  if (losingGeneratedIds.size > 0) {
    world.politicians = world.politicians.filter(
      (p) => !(losingGeneratedIds.has(p.id) && p.chamberKey === ""),
    );
  }

  rec.status = "resolved";
  rec.winners = [winnerId];
  rec.resolvedTurn = world.meta.turn;
  archiveCampaignsForElection(world, rec.id);

  const winnerName = winnerId === "player" ? world.player.name : (winnerCand?.name ?? winnerId);
  const modeLabel = resolutionMode === "majority" ? "national majority" : "House contingent election";
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline:
      winnerId === "player"
        ? `You win the ${rec.countryId} presidency (${modeLabel})`
        : `${winnerName} (${winnerParty}) wins the ${rec.countryId} presidency (${modeLabel})`,
  });
}
