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
import { allocateElectoralVotes, electoralMajorityFor } from "./presidentialElectoralCollege.js";

/**
 * Presidential general-election resolution — W24 port, W24b real Electoral
 * College replacement.
 *
 * W24b: replaces the W24 nationwide-majority simplification with mainline's
 * real per-state Electoral College — `presidentialElectoralCollege.ts`
 * allocates each state's electors winner-take-all from the per-state
 * cumulative tallies `tallyAdapter.ts`'s `realAccumulatePresident` now
 * writes to `rec.stateTallyStates` (see that file for the EV-source
 * citation and the ME/NE-district / DC non-applicability rationale). The
 * majority test below is against the era's ACTUAL college size (531 for the
 * 1953 pack: 435 house seats + 2×48 senators, AK/HI/DC absent — never a
 * hardcoded 270), computed fresh each resolution from
 * `electoralMajorityFor(totalEv)`.
 *
 * FALLBACK (documented, defensive): when `rec.stateTallyStates` is absent —
 * either the accumulation phase never actually ran against per-state
 * tallies (e.g. `presidentialResolution.test.ts`'s pure-formula unit tests,
 * which hand-build an `ElectionRecord` and call this function directly), or
 * a world's states carry no demographic tables at all so
 * `realAccumulatePresident` fell back to `nationwideSliceFor` — resolution
 * falls back to the W24 shape: raw national vote counts in `rec.tally`
 * stand in for the ranking/majority score, majority is of the national vote
 * total. This mirrors `tallyAdapter.ts`'s own stub-accumulator fallback
 * pattern (real math where data exists, a documented simplification where
 * it does not) rather than being a second bespoke design.
 *
 * The 12th Amendment machinery itself — `contingentElection.ts` (House
 * state-delegation ballot for President, Senate ballot for VP) — IS ported
 * verbatim and reused unmodified here via `loadContingentElectionDataPlain`.
 * It now receives REAL electoral votes as `electoralVotesByCandidate` on the
 * EC path (previously raw national vote counts stood in for EVs on the
 * only path that existed; the fallback path still uses that stand-in, same
 * as before).
 *
 * Not ported this wave (out of scope, per the FRAMEWORK "changing a
 * contract requires updating it" doctrine — flagged here so it isn't lost):
 * mainline's presidentialElectionEngine.ts VP home-state bonus, governor
 * endorsements, and granular per-unit electorate substrate. Those are
 * presidential-specific vote-multiplier factors layered ON TOP OF the
 * general per-state tally `accumulateVoteTurn.ts` already runs identically
 * for house/senate; the Electoral College STRUCTURE (per-state
 * winner-take-all, real EV apportionment, real majority test, 12th
 * Amendment fallback) is what this wave replaces, matching the wave brief.
 * `presidentialCoattail.ts`'s self-exclusion (`isHeadOfGovernmentRace`) and
 * the sitting president's coattail into down-ballot races (already wired,
 * W24 `derivedInputs.president` in tallyAdapter.ts) now apply symmetrically
 * per state to the president's own race too, for free, as soon as it runs
 * through the same per-state `accumulateVoteTurn` every other US race uses.
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

  // Real per-state Electoral College when per-state tallies ran (W24b);
  // documented nationwide-vote fallback otherwise (see file doc).
  const ec = allocateElectoralVotes(world, rec);
  const scoreTally = ec ? ec.evByCandidate : rec.tally;
  const majorityThreshold = ec ? electoralMajorityFor(ec.totalEv) : Math.floor(totalVotes / 2) + 1;

  const ranked = Object.entries(scoreTally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

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
      electoralVotesByCandidate: scoreTally,
      characters,
      npps: [],
      partyMap,
      houseOfficials,
      senateOfficials,
      frozenChamber: null,
      capturedAt: new Date(`${world.meta.date}T00:00:00Z`),
    });
    contingentResult = resolveContingentElection({
      electionId: rec.id,
      electoralVotesByCandidate: scoreTally,
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
  const modeLabel =
    resolutionMode !== "majority" ? "House contingent election" : ec ? "electoral college majority" : "national majority";
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline:
      winnerId === "player"
        ? `You win the ${rec.countryId} presidency (${modeLabel})`
        : `${winnerName} (${winnerParty}) wins the ${rec.countryId} presidency (${modeLabel})`,
  });
}
