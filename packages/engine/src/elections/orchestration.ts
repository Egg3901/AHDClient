import type { WorldRng } from "../rng.js";
import type { Politician, WorldState } from "../types.js";
import type { ElectionCandidate, ElectionRecord } from "./types.js";
import {
  planNextElectionForType,
  planNextHouseElection,
  type ElectionPlan,
} from "../electionEngine/resolution/electionSpawning.js";
import type { CycleAnchorContext } from "../electionEngine/resolution/cycleAnchorContext.js";
import { eraToPreset, getStartingYearForPreset } from "../electionEngine/resolution/constants.js";
import {
  resolveGeneralElectionPure,
  type CandidateInput,
  type GeneralResolutionInput,
} from "../electionEngine/resolution/generalResolution.js";
import { generateNpcNameAndGender } from "../npp/nameGenerator.js";
import { realAccumulate } from "./tallyAdapter.js";
import { ensureCampaignsForElection, archiveCampaignsForElection } from "../campaigns/lifecycle.js";
import { applyPresidentialResolution } from "./presidentialResolution.js";
import { declareCandidacy } from "./candidacy.js";
import { GOVERNOR_COUNTRIES, LOWER_CHAMBER_PER_REGION, SUBNATIONAL_CHAMBER_PER_REGION, JP_SANGIIN_SEATS } from "../government/constants.js";

/**
 * W21c orchestration: turns the pure election library into live world behavior.
 * Solo mapping notes:
 * - Mainline "every real hour is a game week": DEFAULT_DURATIONS hours map 1:1
 *   onto solo turns; canonical cycle anchors are used unchanged.
 * - `now` for wall-clock fields is derived from world.meta.date so results are
 *   deterministic (no Date.now anywhere).
 * - Seat truth lives on politicians (chamberKey + electedState); chamber
 *   compositions are recomputed from them after every resolution, so seat-sum
 *   invariants hold by construction.
 */

/**
 * Was hardcoded to always return the 1953-default preset regardless of the
 * world's actual era (a leftover from before 1979/1991/2019 packs existed).
 * A 1979/1991/2019 world now correctly gets its own preset's real-election-
 * year anchors (see cycleAnchorContext.ts CANONICAL_REAL_ELECTION_YEARS_BY_PRESET)
 * instead of silently running on 1953's. Solo has no pre-iteration/founding
 * phase concept, so those two fields stay their identity defaults for every
 * era.
 */
export function cycleContextForWorld(world: WorldState): CycleAnchorContext {
  const preset = eraToPreset(world.meta.era);
  return {
    startingYear: getStartingYearForPreset(preset),
    preset,
    preIterationTurns: 0,
    preIterationActive: false,
  } as CycleAnchorContext;
}

export function electionRecordId(plan: ElectionPlan, senateClass?: number): string {
  const cls = senateClass ? `:cl${senateClass}` : "";
  return `${plan.electionType}:${plan.countryId}:${plan.state ?? "-"}${cls}:c${plan.cycle}`;
}

function worldNow(world: WorldState): Date {
  return new Date(`${world.meta.date}T00:00:00Z`);
}


/** Election series solo currently schedules, per playable country. */
interface SeriesSpec {
  electionType: string;
  countryId: string;
  chamberKey: string;
  state?: string;
  senateClass?: 1 | 2 | 3;
  /** JP Sangiin class (1|2); rides the record's senateClass slot for ids and seat matching. */
  chamberClass?: 1 | 2;
  totalSeats: number;
}

export function electionSeriesForWorld(world: WorldState): SeriesSpec[] {
  const specs: SeriesSpec[] = [];
  const regions = world.regions ?? {};
  // US: house per state (apportioned seats), senate per state per class.
  // Governor per state - Source: src/lib/elections/canonicalCycle.ts governor case
  // uses anchors.governorStateSenate (shared with stateSenate). Duration 192
  // (src/lib/constants/electionDurations.ts DEFAULT_DURATIONS.governor).
  for (const region of Object.values(regions)) {
    const r = region as unknown as {
      id: string; countryId: string; houseSeats?: number;
      senateClasses?: [number, number]; senateSeats?: number;
    };
    if (r.countryId !== "US") continue;
    if (typeof r.houseSeats === "number" && r.houseSeats > 0) {
      specs.push({ electionType: "house", countryId: "US", chamberKey: "house", state: r.id, totalSeats: r.houseSeats });
    }
    for (const cls of r.senateClasses ?? []) {
      specs.push({ electionType: "senate", countryId: "US", chamberKey: "senate", state: r.id, senateClass: cls as 1 | 2 | 3, totalSeats: 1 });
    }
  }
  // US governor per state - must wire same way house/senate do, using canonical
  // cycle anchors already ported in electionEngine/resolution (governorStateSenate).
  for (const region of Object.values(regions)) {
    const r = region as unknown as { id: string; countryId: string };
    if (!GOVERNOR_COUNTRIES.has(r.countryId)) continue;
    specs.push({ electionType: "governor", countryId: r.countryId, chamberKey: "governor", state: r.id, totalSeats: 1 });
  }
  // W61 post-Cold-War roster (1991: JP/DE/CN/BR/IE; 2019: JP/DE/CN/IE). Every
  // lower chamber is contested per region with totalSeats = the region's
  // houseSeats, exactly as mainline's per-country spawners size them:
  //   JP shugiin      perpetualElections.ts ensureJPElections (jpRegions houseDistricts)
  //   DE bundestag    ensureDEElections (DE_WAHLKREIS_SEATS per Land)
  //   CN npcDelegate  ensureCNElections (getCnNpcSeats per macro-region)
  //   BR chamber      ensureBRElections (brRegions houseDistricts)
  //   IE dail         ensureIEElections (ieRegions houseDistricts, PR-STV)
  // BR senate: ensureBRSenateElections per region (senateSeats). JP sangiin:
  // ensureJPCouncillorElections, two classes per region, class 1 = ceil,
  // class 2 = floor of the region's JP_SANGIIN_SEATS. IE uachtaran:
  // ensureIEUachtaranElections, one nationwide single-winner race.
  const LOWER_PER_REGION = LOWER_CHAMBER_PER_REGION;
  for (const region of Object.values(regions)) {
    const r = region as unknown as { id: string; countryId: string; houseSeats?: number; senateSeats?: number };
    const lower = LOWER_PER_REGION[r.countryId];
    if (!lower) continue;
    const leg = world.legislatures[r.countryId];
    if (!leg) continue;
    const chamber = leg.chambers.find((c) => c.key === lower.chamberKey);
    if (chamber && chamber.elected && typeof r.houseSeats === "number" && r.houseSeats > 0) {
      specs.push({ electionType: lower.electionType, countryId: r.countryId, chamberKey: lower.chamberKey, state: r.id, totalSeats: r.houseSeats });
    }
    if (r.countryId === "BR" && typeof r.senateSeats === "number" && r.senateSeats > 0) {
      const senate = leg.chambers.find((c) => c.key === "senate");
      if (senate && senate.elected) specs.push({ electionType: "senate", countryId: "BR", chamberKey: "senate", state: r.id, totalSeats: r.senateSeats });
    }
    if (r.countryId === "JP") {
      const sangiin = leg.chambers.find((c) => c.key === "sangiin");
      const n = JP_SANGIIN_SEATS[r.id];
      if (sangiin && sangiin.elected && n) {
        specs.push({ electionType: "sangiin", countryId: "JP", chamberKey: "sangiin", state: r.id, chamberClass: 1, totalSeats: Math.ceil(n / 2) });
        specs.push({ electionType: "sangiin", countryId: "JP", chamberKey: "sangiin", state: r.id, chamberClass: 2, totalSeats: Math.floor(n / 2) });
      }
    }
  }
  if (world.legislatures["IE"]) {
    specs.push({ electionType: "uachtaran", countryId: "IE", chamberKey: "president", totalSeats: 1 });
  }
  // US president (W24): one nationwide record, no `state`. Scope is US only -
  // see executive/types.ts file doc for why other presidential countries are
  // PORT-STUB this wave.
  if (world.legislatures["US"]) {
    specs.push({ electionType: "president", countryId: "US", chamberKey: "president", totalSeats: 1 });
  }
  // UK: commons, national list over constituencies-to-come (W39); single national record.
  if (world.legislatures["UK"]) {
    const commons = world.legislatures["UK"].chambers.find((c) => c.key === "commons");
    if (commons) specs.push({ electionType: "commons", countryId: "UK", chamberKey: "commons", totalSeats: commons.seats });
  }
  // RU: supreme soviet chambers; DD: volkskammer. Single-list national races.
  if (world.legislatures["RU"]) {
    for (const [type, key] of [["supremeSovietDeputy", "sovietOfTheUnion"], ["nationalitiesDeputy", "sovietOfNationalities"]] as const) {
      const ch = world.legislatures["RU"].chambers.find((c) => c.key === key);
      if (ch && ch.elected) specs.push({ electionType: type, countryId: "RU", chamberKey: ch.key, totalSeats: ch.seats });
    }
  }
  if (world.legislatures["DD"]) {
    const vk = world.legislatures["DD"].chambers.find((c) => c.key === "volkskammer");
    if (vk && vk.elected) specs.push({ electionType: "volkskammerDeputy", countryId: "DD", chamberKey: "volkskammer", totalSeats: vk.seats });
  }
  // W40: subnational/regional chambers, per-region records mirroring the US
  // house loop above — mainline confirms all four run real per-region races
  // (perpetualElections.ts: ensurePerpetualElections for US stateSenate,
  // ensureUKRegionalCouncilElections for UK regionalCouncil,
  // ensureRegionalDelegateElections for RU republicSupremeSoviet / DD
  // landAssembly), each seeded from the same per-region seat count
  // (`stateSenateSeats` in mainline's state docs) that AHDClient already carries
  // as `region.senateSeats` (see usStates1953.ts / ukRegions1953.ts /
  // ruRegions1953.ts / ddRegions1953.ts header comments). electionType and
  // chamberKey both already match the content-pack chamber `key` (stateSenate
  // / regionalCouncil / republicSupremeSoviet / landAssembly), and
  // `resolution/constants.ts` DEFAULT_DURATIONS + MULTI_SEAT_TYPES already
  // carry entries for exactly these four keys (pre-provisioned by an earlier
  // wave for this hookup) — regionalCouncil's per-region seat table is
  // resolved by `seatAllocation.ts` from the hardcoded UK_REGIONAL_COUNCIL_SEATS
  // constant (ignoring `apportionment.houseSeats`), matching mainline's own
  // separate `UK_REGIONAL_COUNCIL_SEATS` table — no change needed there.
  const SUBNATIONAL_CHAMBERS = SUBNATIONAL_CHAMBER_PER_REGION;
  for (const region of Object.values(regions)) {
    const r = region as unknown as { id: string; countryId: string; senateSeats?: number };
    const spec = SUBNATIONAL_CHAMBERS[r.countryId];
    if (!spec) continue;
    if (typeof r.senateSeats !== "number" || r.senateSeats <= 0) continue;
    const leg = world.legislatures[r.countryId];
    const chamber = leg?.chambers.find((c) => c.key === spec.chamberKey);
    if (!chamber || !chamber.elected) continue;
    specs.push({
      electionType: spec.electionType,
      countryId: r.countryId,
      chamberKey: spec.chamberKey,
      state: r.id,
      totalSeats: r.senateSeats,
    });
  }
  return specs;
}

function seriesKey(s: SeriesSpec): string {
  const cls = s.senateClass ?? s.chamberClass;
  return `${s.electionType}:${s.countryId}:${s.state ?? "-"}${cls ? `:cl${cls}` : ""}`;
}

function recordSeriesKey(r: ElectionRecord): string {
  return `${r.electionType}:${r.countryId}:${r.state ?? "-"}${r.senateClass ? `:cl${r.senateClass}` : ""}`;
}

/** Politicians currently holding the contested seats. */
export function seatHolders(world: WorldState, rec: ElectionRecord): Politician[] {
  return world.politicians.filter(
    (p) =>
      p.countryId === rec.countryId &&
      p.chamberKey === rec.chamberKey &&
      (rec.state === undefined || p.electedState === rec.state) &&
      (rec.senateClass === undefined || p.senateClass === rec.senateClass),
  );
}

/**
 * W22 staleCandidateCleanup analogue. Source: src/lib/turn/perpetualElections.ts
 * cleanupStaleElectionCandidates (registered in
 * src/simulation/phases/turnPhaseRegistry.ts), which drops generated NPC
 * candidates who neither won nor hold anything. AHDClient's equivalent runs at every election resolution:
 * a generated ("-CH") politician is culled when they hold no chamber seat,
 * no governorship, no executive/cabinet/court office, and are not a
 * candidate in any unresolved election. This covers BOTH losers of the race
 * just resolved AND ex-holders displaced by a later race they were not a
 * candidate in (the W40 subnational chambers made that second class explode:
 * 3.8k orphans at t700 before this cull existed). Seeded politicians (no
 * "-CH" in the id) are never touched.
 */
export function cullOrphanedGenerated(world: WorldState): void {
  const protectedIds = new Set<string>();
  for (const g of Object.values(world.governors)) if (g.governorId) protectedIds.add(g.governorId);
  const collect = (v: unknown): void => {
    if (typeof v === "string") protectedIds.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(collect);
  };
  collect(world.executives);
  collect(world.cabinetMembers);
  collect(world.cabinetNominations);
  collect(world.supremeCourtSeats);
  collect(world.scotusNominations);
  for (const e of world.elections) {
    if (e.status === "resolved") continue;
    for (const c of e.candidates) protectedIds.add(c.id);
  }
  world.politicians = world.politicians.filter(
    (p) => !(p.id.includes("-CH") && p.chamberKey === "" && !protectedIds.has(p.id)),
  );
}

function makeChallenger(world: WorldState, rng: WorldRng, rec: ElectionRecord, partyId: string, slateIndex: number): Politician {
  const party = world.parties[partyId];
  const { name, gender } = generateNpcNameAndGender(rng, rec.countryId, world.meta.era);
  // Ideology jitter mirrors politician generation (generator.ts quality 0, +-1.2).
  const jitter = () => Math.round((rng.next() * 2.4 - 1.2) * 10) / 10;
  const clamp5 = (v: number) => Math.max(-5, Math.min(5, Math.round(v * 10) / 10));
  // Deterministic per world: election record id + party + slate position.
  const id = `${rec.countryId}-CH:${rec.id}:${partyId}:${slateIndex}`;
  return {
    id,
    name,
    gender,
    countryId: rec.countryId,
    partyId,
    chamberKey: "",
    electedState: undefined,
    senateClass: undefined,
    ideology: {
      economic: clamp5((party?.economicPosition ?? 0) + jitter()),
      social: clamp5((party?.socialPosition ?? 0) + jitter()),
    },
    age: 30 + rng.int(0, 42),
    partyInfluence: 0,
    bonusActions: 0,
    actions: 25,
    funds: 0,
    donorBaseLevel: 0,
    politicalInfluence: 0,
    favorability: 50,
    infamy: 0,
    actionCooldowns: {},
  } as unknown as Politician;
}

/**
 * Governor-specific candidate fill (W30): incumbent comes from
 * world.governors[state], not seatHolders (governor is a per-state
 * executive record, not a chamberKey seat - mirrors mainline's
 * ElectedOfficial officeType "governor" per state). Sources:
 * src/lib/governorOffice/queries.ts getCurrentOfficeHolder,
 * src/lib/elections/canonicalCycle.ts governor case (governorStateSenate
 * anchor), src/lib/constants/electionDurations.ts DEFAULT_DURATIONS.governor.
 * Campaign eligibility per mainline isDirectElection (US presidential
 * governmentType) + NON_PRESIDENTIAL_RACE_FAMILIES includes "governor" -
 * see src/lib/campaigns/isCampaignEligible.ts; solo's
 * campaigns/isCampaignEligible.ts already includes governor for US.
 */
function fillGovernorCandidates(world: WorldState, rng: WorldRng, rec: ElectionRecord): void {
  const seen = new Set(rec.candidates.map((c) => c.id));
  const gov = rec.state ? world.governors[rec.state] : undefined;
  if (gov?.governorId && !seen.has(gov.governorId)) {
    const id = gov.governorId;
    const name = id === "player" ? world.player.name : (world.politicians.find((p) => p.id === id)?.name ?? gov.governorName ?? id);
    rec.candidates.push({
      id,
      name,
      partyId: gov.governorParty ?? "independent",
      isNPP: id !== "player",
      incumbent: true,
    });
    seen.add(id);
  }
  const incumbentPartyId = gov?.governorId ? gov.governorParty : null;
  const majorParties = Object.values(world.parties).filter(
    (p) => p.countryId === rec.countryId && (p.tier === "major" || p.id === incumbentPartyId),
  );
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.candidates.some((c) => c.partyId === party.id)) continue;
    const ch = makeChallenger(world, rng, rec, party.id, 0);
    world.politicians.push(ch);
    rec.candidates.push({
      id: ch.id,
      name: ch.name,
      partyId: party.id,
      isNPP: true,
      incumbent: false,
    });
  }
  ensureCampaignsForElection(world, rec);
}

/**
 * President-specific candidate fill (W24): the incumbent comes from
 * `world.executives`, not `seatHolders` (the presidency is not a
 * `Politician.chamberKey` seat), and each ticket carries a generated running
 * mate - reuses `makeChallenger`'s exact generation logic (name/ideology/age)
 * with the id's "-CH:" marker swapped for "-VP:" so the running mate is
 * distinguishable in NPC-population cleanup (applyPresidentialResolution).
 */
function fillPresidentialCandidates(world: WorldState, rng: WorldRng, rec: ElectionRecord): void {
  const seen = new Set(rec.candidates.map((c) => c.id));
  const exec = world.executives[rec.countryId];

  if (exec?.presidentId && !seen.has(exec.presidentId)) {
    const id = exec.presidentId;
    const name = id === "player" ? world.player.name : (world.politicians.find((p) => p.id === id)?.name ?? id);
    rec.candidates.push({
      id,
      name,
      partyId: exec.presidentParty ?? "independent",
      isNPP: id !== "player",
      incumbent: true,
      runningMateId: exec.vicePresidentId ?? undefined,
    });
    seen.add(id);
  }

  const incumbentPartyId = exec?.presidentId ? exec.presidentParty : null;
  const majorParties = Object.values(world.parties).filter(
    (p) => p.countryId === rec.countryId && (p.tier === "major" || p.id === incumbentPartyId),
  );
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.candidates.some((c) => c.partyId === party.id)) continue;
    const ch = makeChallenger(world, rng, rec, party.id, 0);
    world.politicians.push(ch);
    const vp = makeChallenger(world, rng, rec, party.id, 1);
    vp.id = vp.id.replace(`${rec.countryId}-CH:`, `${rec.countryId}-VP:`);
    world.politicians.push(vp);
    rec.candidates.push({
      id: ch.id,
      name: ch.name,
      partyId: party.id,
      isNPP: true,
      incumbent: false,
      runningMateId: vp.id,
    });
  }
  ensureCampaignsForElection(world, rec);
}

/** Fill candidacies: incumbents re-enter, majors field challengers, player joins if declared. */
/**
 * IE Uachtarán na hÉireann (W61): one nationwide single-winner race
 * (mainline perpetualElections.ts ensureIEUachtaranElections, canonicalCycle
 * "uachtaran" 7-year cycle, electionMethod.ts uachtaran: "headOfState" fptp).
 * The incumbent comes from `world.executives.IE` like the US president; no
 * running mate (the office has none). Winner seats as executives.IE.presidentId.
 */
function fillUachtaranCandidates(world: WorldState, rng: WorldRng, rec: ElectionRecord): void {
  const seen = new Set(rec.candidates.map((c) => c.id));
  const exec = world.executives[rec.countryId];
  if (exec?.presidentId && !seen.has(exec.presidentId)) {
    const id = exec.presidentId;
    const name = id === "player" ? world.player.name : (world.politicians.find((p) => p.id === id)?.name ?? id);
    rec.candidates.push({ id, name, partyId: exec.presidentParty ?? "independent", isNPP: id !== "player", incumbent: true });
    seen.add(id);
  }
  const incumbentPartyId = exec?.presidentId ? exec.presidentParty : null;
  const majorParties = Object.values(world.parties).filter(
    (p) => p.countryId === rec.countryId && (p.tier === "major" || p.id === incumbentPartyId),
  );
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.candidates.some((c) => c.partyId === party.id)) continue;
    const ch = makeChallenger(world, rng, rec, party.id, 0);
    world.politicians.push(ch);
    rec.candidates.push({ id: ch.id, name: ch.name, partyId: party.id, isNPP: true, incumbent: false });
  }
  ensureCampaignsForElection(world, rec);
}

function applyUachtaranResolution(world: WorldState, rec: ElectionRecord): void {
  const candidates: CandidateInput[] = rec.candidates.map((c) => ({
    _id: c.id,
    electionId: rec.id,
    ...(c.id === "player" ? { characterId: "player" } : {}),
    characterName: c.name,
    party: c.partyId,
    isNPP: c.isNPP,
  }));
  const input: GeneralResolutionInput = {
    election: { _id: rec.id, electionType: rec.electionType, countryId: rec.countryId, state: rec.state, cycle: rec.cycle, status: rec.status } as GeneralResolutionInput["election"],
    tally: { electionId: rec.id, totalVotes: rec.tally, finalized: true },
    candidates,
    totalSeats: 1,
    currentYear: Number(world.meta.date.slice(0, 4)),
  };
  const result = resolveGeneralElectionPure(input);
  let winnerId: string | null = null;
  let maxSeats = 0;
  for (const [candId, seats] of Object.entries(result?.seatsEstimate ?? {})) {
    if (seats > maxSeats) { maxSeats = seats; winnerId = candId; }
  }
  if (!winnerId) {
    let best = -1;
    for (const c of rec.candidates) { const v = rec.tally[c.id] ?? 0; if (v > best) { best = v; winnerId = c.id; } }
  }
  const winner = winnerId ? rec.candidates.find((c) => c.id === winnerId) : undefined;
  if (winner) {
    world.executives[rec.countryId] = {
      countryId: rec.countryId,
      presidentId: winner.id,
      presidentParty: winner.partyId,
      termStartTurn: world.meta.turn,
      vicePresidentId: null,
      vicePresidentParty: null,
    };
    rec.winners = [winner.id];
  }
  rec.status = "resolved";
  rec.resolvedTurn = world.meta.turn;
  cullOrphanedGenerated(world);
}

export function fillCandidates(world: WorldState, rng: WorldRng, rec: ElectionRecord): void {
  if (rec.electionType === "president") {
    fillPresidentialCandidates(world, rng, rec);
    return;
  }
  if (rec.electionType === "governor" || rec.electionType === "special_governor") {
    fillGovernorCandidates(world, rng, rec);
    return;
  }
  if (rec.electionType === "uachtaran") {
    fillUachtaranCandidates(world, rng, rec);
    return;
  }
  const holders = seatHolders(world, rec);
  const seen = new Set(rec.candidates.map((c) => c.id));
  for (const h of holders) {
    if (!seen.has(h.id)) {
      rec.candidates.push({ id: h.id, name: h.name, partyId: h.partyId, isNPP: true, incumbent: true });
      seen.add(h.id);
    }
  }
  const majorParties = Object.values(world.parties).filter(
    (p) => p.countryId === rec.countryId && (p.tier === "major" || holders.some((h) => h.partyId === p.id)),
  );
  // Full slates: each fielding party runs enough candidates to take every
  // contested seat (mainline pads slates; short slates caused phantom
  // vacancies, cf the multiseat slate-size artifact).
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    let have = rec.candidates.filter((c) => c.partyId === party.id).length;
    while (have < rec.totalSeats) {
      const ch = makeChallenger(world, rng, rec, party.id, have);
      world.politicians.push(ch);
      rec.candidates.push({ id: ch.id, name: ch.name, partyId: party.id, isNPP: true, incumbent: false });
      have++;
    }
  }
  // W26: campaign creation on candidate entry (createInitialCampaign port).
  // No-op for non-campaign-eligible races (isCampaignEligible.ts).
  ensureCampaignsForElection(world, rec);
}

/**
 * PORT-STUB tally step until the W21c-a tallyManagement port merges: votes
 * accrue proportional to party regional registration/organization plus
 * candidate favorability, scaled by electorate size, deterministic via rng
 * for sub-point noise. Replaced wholesale by accumulateVoteTurn.
 */
export function stubAccumulate(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
  politicianById?: Map<string, Politician>,
): void {
  const byId = politicianById ?? new Map(world.politicians.map((p) => [p.id, p]));
  const regionKey = rec.state ?? Object.values(world.regions ?? {}).find((r) => (r as { countryId: string }).countryId === rec.countryId);
  for (const cand of rec.candidates) {
    const party = world.parties[cand.partyId];
    const pr = rec.state ? world.partyRegions?.[`${rec.state}:${cand.partyId}`] : undefined;
    const reg = (pr as { registration?: number } | undefined)?.registration ?? 20;
    const org = (pr as { organization?: number } | undefined)?.organization ?? party?.organization ?? 10;
    const pol = byId.get(cand.id);
    const fav = pol?.favorability ?? (cand.id === "player" ? world.player.favorability ?? 50 : 50);
    const base = reg * 3 + org + (fav - 50) / 5 + (cand.incumbent ? 5 : 0);
    const votes = Math.max(0, base * 100 + Math.floor(rng.next() * 100));
    rec.tally[cand.id] = (rec.tally[cand.id] ?? 0) + votes;
  }
  void regionKey;
}

export function recomputeComposition(world: WorldState, countryId: string, chamberKey: string): void {
  const leg = world.legislatures[countryId];
  if (!leg) return;
  const chamber = leg.chambers.find((c) => c.key === chamberKey);
  if (!chamber) return;
  const seatsByParty: Record<string, number> = {};
  let held = 0;
  for (const p of world.politicians) {
    if (p.countryId === countryId && p.chamberKey === chamberKey) {
      seatsByParty[p.partyId] = (seatsByParty[p.partyId] ?? 0) + 1;
      held++;
    }
  }
  const playerSeat = world.player.legislativeSeat;
  if (playerSeat && playerSeat.countryId === countryId && playerSeat.chamberKey === chamberKey && world.player.partyId) {
    seatsByParty[world.player.partyId] = (seatsByParty[world.player.partyId] ?? 0) + 1;
    held++;
  }
  chamber.composition = { seatsByParty, vacancies: Math.max(0, chamber.seats - held) };
}

function applyGovernorResolution(world: WorldState, rec: ElectionRecord): void {
  // Single-seat per-state executive - reuses generalResolutionPure with totalSeats 1.
  // Winner seats as governor of rec.state; loser incumbents are displaced.
  // Source: src/lib/elections/canonicalCycle.ts governor case,
  //         src/lib/turn/byElections.ts special_governor -> officeType governor,
  //         src/lib/governorOffice/queries.ts per-state holder.
  const candidates: CandidateInput[] = rec.candidates.map((c) => ({
    _id: c.id,
    electionId: rec.id,
    ...(c.id === "player" ? { characterId: "player" } : {}),
    characterName: c.name,
    party: c.partyId,
    isNPP: c.isNPP,
  }));
  const input: GeneralResolutionInput = {
    election: {
      _id: rec.id,
      electionType: rec.electionType,
      countryId: rec.countryId,
      state: rec.state,
      cycle: rec.cycle,
      status: rec.status,
    } as GeneralResolutionInput["election"],
    tally: { electionId: rec.id, totalVotes: rec.tally, finalized: true },
    candidates,
    totalSeats: 1,
    currentYear: Number(world.meta.date.slice(0, 4)),
  };
  const result = resolveGeneralElectionPure(input);
  if (!result) return;
  // seatsEstimate may assign the single seat to a candidate id; winner is the one with >0 seats.
  let winnerId: string | null = null;
  let maxSeats = 0;
  for (const [candId, seats] of Object.entries(result.seatsEstimate)) {
    if (seats > maxSeats) {
      maxSeats = seats;
      winnerId = candId;
    }
  }
  // Fallback to tally leader if resolution produces no estimate (should not happen)
  if (!winnerId) {
    let best = -1;
    for (const c of rec.candidates) {
      const v = rec.tally[c.id] ?? 0;
      if (v > best) { best = v; winnerId = c.id; }
    }
  }
  if (!winnerId) return;
  const winner = rec.candidates.find((c) => c.id === winnerId);
  if (!winner || !rec.state) return;
  const gov = world.governors[rec.state];
  if (!gov) return;
  gov.governorId = winnerId;
  gov.governorParty = winner.partyId;
  gov.governorName = winner.name;
  gov.termStartTurn = world.meta.turn;
  // Reset office AP on new term (fresh mandate) - capped.
  gov.gubernatorialActions = 3;
  gov.lastActionGrantedTurn = world.meta.turn;
  gov.lastAddressTurn = null;


  rec.status = "resolved";
  cullOrphanedGenerated(world);
  rec.winners = [winnerId];
  rec.resolvedTurn = world.meta.turn;
  archiveCampaignsForElection(world, rec.id);
  const label = `${rec.state} governor`;
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `${label} election resolved: ${winner.name} (${winner.partyId}) wins`,
  });
}

export function applyResolution(world: WorldState, rec: ElectionRecord): void {
  if (rec.electionType === "president") {
    applyPresidentialResolution(world, rec);
    return;
  }
  if (rec.electionType === "governor" || rec.electionType === "special_governor") {
    applyGovernorResolution(world, rec);
    return;
  }
  if (rec.electionType === "uachtaran") {
    applyUachtaranResolution(world, rec);
    return;
  }
  const candidates: CandidateInput[] = rec.candidates.map((c) => ({
    _id: c.id,
    electionId: rec.id,
    ...(c.id === "player" ? { characterId: "player" } : {}),
    characterName: c.name,
    party: c.partyId,
    isNPP: c.isNPP,
  }));
  const input: GeneralResolutionInput = {
    election: {
      _id: rec.id,
      electionType: rec.electionType,
      countryId: rec.countryId,
      state: rec.state,
      cycle: rec.cycle,
      status: rec.status,
    } as GeneralResolutionInput["election"],
    tally: { electionId: rec.id, totalVotes: rec.tally, finalized: true },
    candidates,
    totalSeats: rec.totalSeats,
    currentYear: Number(world.meta.date.slice(0, 4)),
    // Without this, house allocation falls back to mainline's 2020-census
    // HOUSE_SEATS table (TX 38, PA 17...); solo worlds carry era apportionment.
    ...(rec.state !== undefined
      ? { apportionment: { houseSeats: { [rec.state]: rec.totalSeats }, commonsSeats: {} } }
      : {}),
  };
  const result = resolveGeneralElectionPure(input);
  if (!result) return;

  // seatsEstimate is per-candidate but list-style: one candidate id may carry
  // several of its party's seats. Convert to per-party totals, then seat that
  // many of the party's slate in tally order (slates are full, so counts fit).
  const partyOf = new Map(rec.candidates.map((c) => [c.id, c.partyId]));
  const seatsByParty = new Map<string, number>();
  for (const [candId, seats] of Object.entries(result.seatsEstimate)) {
    if (seats <= 0) continue;
    const pid = partyOf.get(candId);
    if (pid) seatsByParty.set(pid, (seatsByParty.get(pid) ?? 0) + seats);
  }
  const winnerIds = new Set<string>();
  for (const [pid, seats] of [...seatsByParty.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const slate = rec.candidates
      .filter((c) => c.partyId === pid)
      .sort((a, b) => (rec.tally[b.id] ?? 0) - (rec.tally[a.id] ?? 0) || a.id.localeCompare(b.id));
    for (let k = 0; k < seats && k < slate.length; k++) {
      const cand = slate[k];
      if (cand) winnerIds.add(cand.id);
    }
  }
  // Unseat losing holders of the contested seats.
  for (const holder of seatHolders(world, rec)) {
    if (!winnerIds.has(holder.id)) {
      holder.chamberKey = "";
      holder.electedState = undefined;
      holder.senateClass = undefined;
    }
  }
  const playerWon = winnerIds.has("player");
  // Seat winners.
  for (const id of winnerIds) {
    if (id === "player") continue;
    const pol = world.politicians.find((p) => p.id === id);
    if (pol) {
      pol.chamberKey = rec.chamberKey;
      pol.electedState = rec.state;
      pol.senateClass = rec.senateClass;
    }
  }
  const seat = world.player.legislativeSeat;
  const playerContested =
    seat != null &&
    seat.countryId === rec.countryId &&
    seat.chamberKey === rec.chamberKey &&
    rec.candidates.some((c) => c.id === "player");
  if (playerWon) {
    world.player.legislativeSeat = { chamberKey: rec.chamberKey, countryId: rec.countryId };
  } else if (playerContested) {
    world.player.legislativeSeat = null;
  }

  rec.status = "resolved";
  cullOrphanedGenerated(world);
  rec.winners = [...winnerIds];
  rec.resolvedTurn = world.meta.turn;
  recomputeComposition(world, rec.countryId, rec.chamberKey);
  // W26: archive campaigns tied to a resolved election (mirrors mainline
  // deleting Campaign docs at resolution - solo archives instead of
  // deleting so history stays inspectable).
  archiveCampaignsForElection(world, rec.id);

  const label = rec.state ? `${rec.state} ${rec.electionType}` : `${rec.countryId} ${rec.electionType}`;
  const topWinner = rec.candidates.find((c) => winnerIds.has(c.id));
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: rec.candidates.some((c) => c.id === "player")
      ? playerWon
        ? `Election won: you take the ${label} seat`
        : `Election lost: the ${label} race goes against you`
      : `${label} election resolved${topWinner ? `: ${topWinner.name} (${topWinner.partyId}) leads the winners` : ""}`,
  });
}

/** Spawn missing series records and flip statuses by turn. */
export function runElectionTimers(world: WorldState, rng: WorldRng): void {
  const ctx = cycleContextForWorld(world);
  const now = worldNow(world);
  const turn = world.meta.turn;
  const unresolvedBySeries = new Map<string, ElectionRecord>();
  let lastCycleBySeries = new Map<string, number>();
  for (const rec of world.elections) {
    const key = recordSeriesKey(rec);
    if (rec.status !== "resolved") unresolvedBySeries.set(key, rec);
    const prev = lastCycleBySeries.get(key) ?? 0;
    if (rec.cycle > prev) lastCycleBySeries.set(key, rec.cycle);
  }

  for (const spec of electionSeriesForWorld(world)) {
    const key = seriesKey(spec);
    if (unresolvedBySeries.has(key)) continue;
    const prevCycle = lastCycleBySeries.get(key) ?? 0;
    const base = { _id: key, electionType: spec.electionType, countryId: spec.countryId, ...(spec.state !== undefined ? { state: spec.state } : {}), cycle: prevCycle };
    const plan =
      spec.electionType === "house"
        ? planNextHouseElection(base, { currentTurn: turn, ctx, now }, spec.state ? { [spec.state]: spec.totalSeats } : undefined)
        : planNextElectionForType({
            electionType: spec.electionType,
            prevCycle,
            currentTurn: turn,
            ctx,
            now,
            countryId: spec.countryId,
            state: spec.state,
            senateClass: spec.senateClass,
            chamberClass: spec.chamberClass,
          } as unknown as Parameters<typeof planNextElectionForType>[0]);
    if (!plan) continue;
    const rec: ElectionRecord = {
      id: electionRecordId(plan, spec.senateClass ?? spec.chamberClass),
      electionType: plan.electionType,
      countryId: plan.countryId,
      state: spec.state,
      // JP Sangiin class rides the senateClass slot: seat matching (seatHolders)
      // and record ids key on it exactly like US Senate classes.
      senateClass: (spec.senateClass ?? spec.chamberClass) as 1 | 2 | 3 | undefined,
      cycle: plan.cycle,
      status: plan.status,
      startTurn: plan.startTurn,
      primaryEndTurn: plan.primaryEndTurn,
      endTurn: plan.endTurn,
      totalSeats: spec.totalSeats,
      chamberKey: spec.chamberKey,
      candidates: [],
      tally: {},
    };
    world.elections.push(rec);
  }

  // Status transitions + candidate fill on activation (sorted for determinism).
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.status === "upcoming" && turn >= rec.startTurn) {
      rec.status = "active";
    }
    if (rec.status === "active" && rec.candidates.length === 0) {
      fillCandidates(world, rng, rec);
    }
  }
  runAutoReelectionEntry(world);
}

/**
 * W22 leftover: opt-in automatic reelection filing. Ports mainline's
 * `runAutoReelectionEntry` (src/lib/turn/autoReelectionEntry.ts:51-235), live
 * every turn (turnPhaseRegistry.ts:1231-1233, after settlement). Mainline
 * scope kept here: only fires when the player has opted in
 * (`autoRunForReelection: true`, mainline line 58 — default false, so this
 * is a no-op for every world unless the player explicitly sets the flag),
 * player-characters only (never NPPs — matches solo's NPC incumbents, which
 * `fillCandidates` already re-enters unconditionally on every cycle
 * regardless of this flag), excludes president/VP (mainline `EXCLUDED_TYPES`),
 * and only files while the primary filing window is still open
 * (`primaryEndTurn`, mainline lines 179-183).
 *
 * PORT-STUB: mainline also has a non-incumbent fallback — for a character who
 * currently holds no seat, it looks up the most recent *resolved* race they
 * contested in their home country/state and re-enters that seat's next cycle
 * (mainline lines 76-143). Solo only auto-enters a seat the player currently
 * HOLDS; a player who lost their last race and wants to run again must still
 * declare by hand. Re-entering the held seat is the behavior every mainline
 * incumbent actually exercises this flag for; the lost-race fallback is a
 * secondary convenience left for a future pass if solo ever tracks "races
 * previously contested" the way mainline's electionCandidates history does.
 *
 * KNOWN IMPRECISION: `player.legislativeSeat` carries only `{chamberKey,
 * countryId}`, no per-state identity (see types.ts) — this is a pre-existing
 * gap, not introduced here: `declareCandidacy` itself has no state-of-
 * residence check either, so a player can already manually file in any
 * same-country/same-chamber race regardless of which state they actually
 * won. This function inherits that same looseness: for a state-scoped
 * chamber (house/senate/stateSenate/etc) it files the player into the
 * FIRST matching unresolved race in id-sorted order within the primary
 * window, which is not guaranteed to be the same state the player's held
 * seat is in. Tightening this would mean adding state identity to
 * `legislativeSeat` and to `declareCandidacy`'s own eligibility check — a
 * data-model change beyond this wave's scope.
 */
export function runAutoReelectionEntry(world: WorldState): void {
  if (!world.player.autoRunForReelection) return;
  const seat = world.player.legislativeSeat;
  if (!seat) return;
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.status === "resolved") continue;
    if (rec.electionType === "president" || rec.electionType === "uachtaran") continue;
    if (rec.countryId !== seat.countryId || rec.chamberKey !== seat.chamberKey) continue;
    if (world.meta.turn > rec.primaryEndTurn) continue;
    if (rec.candidates.some((c) => c.id === "player")) continue;
    declareCandidacy(world, rec.id);
  }
}

export function runVoteAccumulation(world: WorldState, rng: WorldRng): void {
  const inWindow = world.elections.filter(
    (rec) => rec.status === "active" && world.meta.turn > rec.primaryEndTurn && world.meta.turn <= rec.endTurn,
  );
  if (inWindow.length === 0) return;
  // One id index per turn: the per-candidate lookup made this phase 1000x
  // costlier than every other phase (bench finding).
  const byId = new Map(world.politicians.map((p) => [p.id, p]));
  for (const rec of inWindow.sort((a, b) => a.id.localeCompare(b.id))) {
    // Real mainline tally where demographics exist (US, W16); stub elsewhere
    // until W39 brings UK/RU/DD tables.
    if (!realAccumulate(world, rng, rec)) {
      stubAccumulate(world, rng, rec, byId);
    }
  }
}

export function runElectionResolution(world: WorldState): void {
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.status === "active" && world.meta.turn >= rec.endTurn) {
      applyResolution(world, rec);
    }
  }
  // Retention: keep the last 400 resolved records.
  const resolved = world.elections.filter((e) => e.status === "resolved");
  if (resolved.length > 400) {
    const cutoff = new Set(resolved.slice(0, resolved.length - 400).map((e) => e.id));
    world.elections = world.elections.filter((e) => !cutoff.has(e.id));
  }
}
