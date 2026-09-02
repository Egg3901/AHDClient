// @ts-nocheck
/**
 * Contingent election data loading — pure planning layer.
 *
 * Ported from `src/lib/turn/election/loadContingentElectionData.ts`.
 * DB reads (characters, npps, electedOfficials, parties) are replaced with
 * plain input interfaces. Field names mirror the Mongo documents they replace.
 *
 * Plain input mapping to WorldState:
 *   characters -> CharacterInput[] (WorldState politicians)
 *   npps -> NppInput[] (WorldState npps)
 *   electedOfficials -> ElectedOfficialInput[] (WorldState politicians currentOffice)
 *   party economicPosition/socialPosition -> PartyInput
 *   electionCandidates runningMateId -> candidateInputs
 */

import {
  CONTINGENT_EXCLUDED_HOUSE_STATE,
  CONTINGENT_HOUSE_STATE_IDS,
  getTopContingentPresidentCandidates,
  getTopContingentVicePresidentCandidateIds,
  type ContingentCandidateProfile,
  type ContingentHouseDelegation,
  type ContingentVoterProfile,
} from "./contingentElection.js";

export interface CharacterInput {
  _id: string;
  party?: string;
  policies?: { economic: number; social: number };
  currentOffice?: { type: string } | null;
}

export interface NppInput {
  _id: string;
  party?: string;
  policies?: { economic: number; social: number };
  politicalInfluence?: number;
}

export interface ElectedOfficialInput {
  _id: string;
  state?: string;
  party?: string;
  characterId?: string;
  nppId?: string;
  isNPP?: boolean;
  seatsHeld?: number;
}

export interface PartyInput {
  economicPosition: number;
  socialPosition: number;
}

export interface CandidateInput {
  _id: string;
  party: string;
  isNPP?: boolean;
  nppId?: string;
  characterId?: string;
  runningMateId?: string;
}

function partyKey(countryId: string, partyId: string): string {
  return `${countryId}:${partyId}`;
}

function buildCandidateProfile(
  id: string,
  party: string,
  policies: { economic: number; social: number } | undefined,
  partyFallback: PartyInput | undefined,
): ContingentCandidateProfile {
  return {
    id,
    party,
    economic: policies?.economic ?? partyFallback?.economicPosition ?? 0,
    social: policies?.social ?? partyFallback?.socialPosition ?? 0,
  };
}

function buildVoterProfile(
  id: string,
  party: string,
  policies: { economic: number; social: number } | undefined,
  partyFallback: PartyInput | undefined,
  weight?: number,
): ContingentVoterProfile {
  return {
    id,
    party,
    economic: policies?.economic ?? partyFallback?.economicPosition ?? 0,
    social: policies?.social ?? partyFallback?.socialPosition ?? 0,
    weight,
  };
}

export interface ChamberSnapshot {
  capturedAt: Date;
  houseDelegations: Array<{ stateId: string; voters: ContingentVoterProfile[] }>;
  senators: ContingentVoterProfile[];
}

export interface LoadContingentDataInput {
  countryId: string;
  candidates: CandidateInput[];
  electoralVotesByCandidate: Record<string, number>;
  characters: CharacterInput[];
  npps: NppInput[];
  partyMap: Map<string, PartyInput>;
  houseOfficials: ElectedOfficialInput[];
  senateOfficials: ElectedOfficialInput[];
  frozenChamber?: ChamberSnapshot | null;
  capturedAt: Date;
}

export interface LoadContingentDataResult {
  presidentCandidates: ContingentCandidateProfile[];
  vicePresidentCandidates: ContingentCandidateProfile[];
  houseDelegations: ContingentHouseDelegation[];
  senators: ContingentVoterProfile[];
  evByEligibleId: Record<string, number>;
  chamberSnapshot?: ChamberSnapshot;
}

function padHouseDelegationsToAllStates(delegations: ContingentHouseDelegation[]): ContingentHouseDelegation[] {
  const byState = new Map(delegations.map((d) => [d.stateId, d.voters]));
  return CONTINGENT_HOUSE_STATE_IDS.map((stateId) => ({ stateId, voters: byState.get(stateId) ?? [] }));
}

function chamberSnapshotFromChamberData(
  houseDelegations: ContingentHouseDelegation[],
  senators: ContingentVoterProfile[],
  capturedAt: Date,
): ChamberSnapshot {
  return {
    capturedAt,
    houseDelegations: houseDelegations.map((d) => ({
      stateId: d.stateId,
      voters: d.voters.map((v) => ({ ...v })),
    })),
    senators: senators.map((v) => ({ ...v })),
  };
}

export function loadContingentElectionDataPlain(input: LoadContingentDataInput): LoadContingentDataResult {
  const { countryId, candidates, electoralVotesByCandidate, characters, npps, partyMap, houseOfficials, senateOfficials, frozenChamber, capturedAt } = input;
  const eligiblePresidentIds = new Set(getTopContingentPresidentCandidates(electoralVotesByCandidate, 3));
  const runningMateByPresidentId: Record<string, string | undefined> = {};
  for (const c of candidates) {
    const cid = c._id;
    if (!eligiblePresidentIds.has(cid)) continue;
    if (c.runningMateId) runningMateByPresidentId[cid] = c.runningMateId;
  }
  // Auto-pick for NPP missing running mate: highest PI same-party NPP
  for (const c of candidates) {
    const cid = c._id;
    if (!eligiblePresidentIds.has(cid)) continue;
    if (runningMateByPresidentId[cid]) continue;
    if (!c.isNPP || !c.nppId) continue;
    const sameParty = npps.filter((n) => n.party === c.party && n._id !== c.nppId).sort((a, b) => (b.politicalInfluence ?? 0) - (a.politicalInfluence ?? 0));
    if (sameParty[0]) runningMateByPresidentId[cid] = `npp_${sameParty[0]._id}`;
  }
  const eligibleVpIds = new Set(getTopContingentVicePresidentCandidateIds(electoralVotesByCandidate, runningMateByPresidentId, 2));
  const charMap = new Map(characters.map((c) => [c._id, c]));
  const nppMap = new Map(npps.map((n) => [n._id, n]));

  function policiesForOfficial(official: ElectedOfficialInput): ContingentVoterProfile | null {
    const weight = official.seatsHeld ?? 1;
    if (official.characterId) {
      const char = charMap.get(official.characterId);
      const executiveType = char?.currentOffice?.type;
      if (executiveType === "president" || executiveType === "vicePresident") return null;
      const party = char?.party ?? official.party ?? "independent";
      return buildVoterProfile(official.characterId, party, char?.policies, partyMap.get(partyKey(countryId, party)), weight);
    }
    if (official.isNPP && official.nppId) {
      const npp = nppMap.get(official.nppId);
      const party = npp?.party ?? official.party ?? "independent";
      return buildVoterProfile(`npp_${official.nppId}`, party, npp?.policies, partyMap.get(partyKey(countryId, party)), weight);
    }
    return null;
  }

  let houseDelegations: ContingentHouseDelegation[];
  let senators: ContingentVoterProfile[];
  if (frozenChamber) {
    houseDelegations = padHouseDelegationsToAllStates(frozenChamber.houseDelegations.map((d) => ({ stateId: d.stateId, voters: d.voters.map((v) => ({ ...v, weight: v.weight ?? 1 })) })));
    senators = frozenChamber.senators.map((v) => ({ ...v, weight: v.weight ?? 1 }));
  } else {
    const delegationsByState = new Map<string, ContingentVoterProfile[]>();
    for (const official of houseOfficials) {
      const stateId = official.state;
      if (!stateId || stateId === CONTINGENT_EXCLUDED_HOUSE_STATE) continue;
      const voter = policiesForOfficial(official);
      if (!voter) continue;
      const list = delegationsByState.get(stateId) ?? [];
      list.push(voter);
      delegationsByState.set(stateId, list);
    }
    houseDelegations = padHouseDelegationsToAllStates([...delegationsByState.entries()].map(([stateId, voters]) => ({ stateId, voters })));
    senators = [];
    for (const official of senateOfficials) {
      const voter = policiesForOfficial(official);
      if (voter) senators.push({ ...voter, weight: 1 });
    }
  }

  const presidentCandidates: ContingentCandidateProfile[] = [];
  for (const c of candidates) {
    const cid = c._id;
    if (!eligiblePresidentIds.has(cid)) continue;
    if (c.isNPP && c.nppId) {
      const npp = nppMap.get(c.nppId);
      presidentCandidates.push(buildCandidateProfile(cid, c.party, npp?.policies, partyMap.get(partyKey(countryId, c.party))));
    } else if (c.characterId) {
      const char = charMap.get(c.characterId);
      presidentCandidates.push(buildCandidateProfile(cid, c.party, char?.policies, partyMap.get(partyKey(countryId, c.party))));
    }
  }

  const vicePresidentCandidates: ContingentCandidateProfile[] = [];
  for (const vpId of eligibleVpIds) {
    if (vpId.startsWith("npp_")) {
      const npp = nppMap.get(vpId.slice(4));
      if (!npp) continue;
      const party = npp.party ?? "independent";
      vicePresidentCandidates.push(buildCandidateProfile(vpId, party, npp.policies, partyMap.get(partyKey(countryId, party))));
      continue;
    }
    const char = charMap.get(vpId);
    if (!char) continue;
    const party = char.party ?? "independent";
    vicePresidentCandidates.push(buildCandidateProfile(vpId, party, char.policies, partyMap.get(partyKey(countryId, party))));
  }

  const evByEligibleId: Record<string, number> = {};
  for (const cid of eligiblePresidentIds) evByEligibleId[cid] = electoralVotesByCandidate[cid] ?? 0;
  for (const [presId, vpId] of Object.entries(runningMateByPresidentId)) {
    if (vpId && eligibleVpIds.has(vpId)) evByEligibleId[vpId] = electoralVotesByCandidate[presId] ?? 0;
  }

  return {
    presidentCandidates,
    vicePresidentCandidates,
    houseDelegations,
    senators,
    evByEligibleId,
    ...(frozenChamber ? {} : { chamberSnapshot: chamberSnapshotFromChamberData(houseDelegations, senators, capturedAt) }),
  };
}
