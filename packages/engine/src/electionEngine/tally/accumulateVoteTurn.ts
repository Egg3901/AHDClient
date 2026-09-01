/**
 * Pure `accumulateVoteTurn` — ported from `src/lib/electionEngine/tallyManagement.ts`.
 *
 * Mainline mapping (every Mongo field the original read):
 *   `election` = `Election` document (countryId, electionType, state,
 *     startTime/endTime, startTurn/endTurn, primaryEndTurn/primaryEndTime,
 *     totalSeats, createdAt, parentRegionId)
 *   `candidates` = `ElectionCandidate[]` active rows (characterId/nppId,
 *     characterName, party, support)
 *   `tally` = `ElectionVoteTally` document (totalVotes, candidateNames,
 *     candidateParties, turnSnapshots, createdAt)
 *   `state` = `State` document (population, votingEligiblePopulation,
 *     votingSystem, parentRegionId)
 *   `demographics` = `StateDemographics` (categoryWeights, groups)
 *   `categories` = `DemographicCategory[]`
 *   `statePartyOrgs` = `StatePartyOrg[]` (partyId, organization, registration,
 *     registrationShare)
 *   `turnout` = resolved `StateDemographicTurnout` live turnouts via
 *     `resolveTurnout` — caller supplies `{ totalPool, byGroup }`.
 *   `registrationPool` = `StateRegistrationPool` (unregistered %)
 *   `enriched` = `EnrichedCandidate[]` via `fetchEnrichedCandidates`
 *   `approvalPct` / `partyGroupFavorabilityByKey` / `fundsByParty` /
 *     `incumbentSeatShareByParty` / `govExecutive` / `president` /
 *     `governingPartyIds` / `executiveEndorsedCandidateIds` — gated driver
 *     lookups that mainline fetched in two Promise.all round-trips.
 *
 * PORT-STUBs (system solo lacks, neutral value + blocking system named):
 *   `granularSubstrate` — null → use archetype inputs. Blocking: Layer-1
 *     census/granular electorate (`src/lib/demographics/granularElectorate`
 *     + `stateCensusData`). When solo gains Layer-1, wire substrate here.
 *   `manifestoMultipliers` — undefined → no-op. Blocking: UK manifesto
 *     resolver (`src/lib/uk/manifesto/electionManifestoResolver`).
 *   `demographicDefaults` — not separately carried; era lean-drift fold is
 *     no-op until solo ports `stateDemographicsPure`.
 *
 * RNG: tally path is deterministic; `rng` param is reserved for future
 * stochastic drivers (none in mainline tally today).
 *
 * No WorldState import, no Mongo, no I/O. Synchronous, pure.
 */

import type { AccumulateVoteTurnInput, AccumulateVoteTurnResult } from "./types.js";
import { resolveTurnWindow, turnVoteWeight } from "./voteCalculations.js";
import {
  capTurnSliceToElectorate,
  capTurnSliceToRemainingElectorate,
  scalePoolToRegistered,
} from "./turnout.js";
import { estimateSeats } from "./seatEstimation.js";

// Minimal country config for pure layer — byte-identical to mainline's
// COUNTRY_CONFIGS for fields tally reads.
const PARTY_STRENGTH_BY_OFFICE: Record<string, Record<string, number>> = {
  US: { governor: 1.0, house: 0.9, senate: 0.8, stateSenate: 0.85, president: 1.0 },
  UK: { commons: 0.85, primeMinister: 1.0, regionalCouncil: 0.8 },
  RU: { president: 1.0, republicSupremeSoviet: 0.85 },
  DD: { volkskammerDeputy: 0.85, landAssembly: 0.8 },
};

const REGIONAL_EXEC_BY_COUNTRY: Record<string, string> = {
  US: "governor",
  RU: "governor",
  DD: "governor",
};

const HEAD_OF_GOVERNMENT_BY_COUNTRY: Record<string, string> = {
  US: "president",
  UK: "primeMinister",
  RU: "president",
  DD: "chairman",
};

function getPartyStrengthWeight(countryId: string, officeKey: string): number {
  return PARTY_STRENGTH_BY_OFFICE[countryId]?.[officeKey] ?? 0.85;
}

function getRegionalExecutiveOfficeKey(countryId: string): string | null {
  return REGIONAL_EXEC_BY_COUNTRY[countryId] ?? null;
}

function officeKeyForElectionType(electionType: string, countryId: string): string {
  if (electionType === "snap_commons") return "commons";
  if (electionType.startsWith("snap_")) return electionType.slice(5);
  void countryId;
  return electionType;
}

function isHeadOfGovernmentRace(electionType: string, countryId: string): boolean {
  return HEAD_OF_GOVERNMENT_BY_COUNTRY[countryId] === electionType;
}

function isCoattailEligibleRace(args: {
  isGeneralElection: boolean;
  electionType: string;
  regionalExecOfficeType: string | null;
  isOwnHeadOfGovernmentRace: boolean;
}): boolean {
  if (!args.isGeneralElection) return false;
  if (args.isOwnHeadOfGovernmentRace) return false;
  if (args.regionalExecOfficeType && args.electionType === args.regionalExecOfficeType)
    return false;
  return true;
}

function isOwnRegionalExecutiveRace(args: {
  isGeneralElection: boolean;
  electionType: string;
  regionalExecOfficeType: string | null;
  hasState: boolean;
}): boolean {
  if (!args.isGeneralElection) return false;
  return (
    args.hasState &&
    args.regionalExecOfficeType != null &&
    args.electionType === args.regionalExecOfficeType
  );
}

function isSingleSeatLegislativeRace(election: { electionType: string }): boolean {
  return election.electionType === "senate";
}

function isPrimaryEnded(
  election: { primaryEndTurn?: number | null; primaryEndTime?: Date | string | null },
  currentTurn: number,
  now: Date,
): boolean {
  if (typeof election.primaryEndTurn === "number") return currentTurn >= election.primaryEndTurn;
  if (election.primaryEndTime) return now >= new Date(election.primaryEndTime);
  return true;
}

// Neutral coattail magnitude — mirrors `coattailMagnitude.approvalCoattailMultiplier`
function approvalCoattailMultiplier(approval: number): number {
  const clamped = Math.min(100, Math.max(0, approval));
  return 1 + (clamped - 50) * 0.002;
}

function buildModifierByParty(
  holder: { partyId: string; approval: number } | null | undefined,
  partyIdsInRace: Set<string>,
): Map<string, number> | undefined {
  if (!holder) return undefined;
  if (!partyIdsInRace.has(holder.partyId)) return undefined;
  const m = new Map<string, number>();
  m.set(holder.partyId, approvalCoattailMultiplier(holder.approval));
  return m;
}

const EXECUTIVE_ENDORSEMENT_VOTE_BONUS = 1.015;

export function accumulateVoteTurn(
  input: AccumulateVoteTurnInput,
): AccumulateVoteTurnResult | null {
  const { election, candidates, tally, state, turnNumber, now } = input;

  if (!tally || candidates.length === 0) return null;
  if (tally.turnSnapshots.some((s) => s.turn === turnNumber)) {
    return { tally, snapshot: tally.turnSnapshots.find((s) => s.turn === turnNumber)!, newTotals: tally.totalVotes, sharesPct: {}, alreadyCounted: true };
  }
  if (!election.endTime) return null;
  if (!state) return null;

  const demographics = input.demographics;
  const categories = input.categories;
  if (!demographics) return null;

  const derived = input.derived ?? { approvalPct: 50 };
  const approvalPct = derived.approvalPct ?? 50;
  const enriched = input.enriched;
  if (!enriched || enriched.length === 0) return null;

  // Party org maps
  const partyOrgByParty = new Map<string, number>();
  for (const po of input.statePartyOrgs) {
    partyOrgByParty.set(po.partyId, po.organization);
  }

  // Turn window — anchor at general start (primaryEndTurn) not overall startTurn
  const { totalTurns, turnIndex } = resolveTurnWindow({
    startTurn: election.primaryEndTurn ?? election.startTurn ?? null,
    endTurn: election.endTurn ?? null,
    startTime: election.primaryEndTime ?? election.startTime ?? null,
    endTime: election.endTime ?? null,
    createdAt: tally.createdAt ?? null,
    currentTurn: turnNumber,
    now,
    inclusiveEnd: true,
  });

  const electorate = state.votingEligiblePopulation ?? state.population;

  // Effective turnout pool — caller supplies resolved totalPool
  const resolvedTotalPool = input.turnout.totalPool;
  const liveTurnouts = input.turnout.byGroup;

  let effTotalPool = resolvedTotalPool;
  let effDemographics: typeof demographics = demographics;
  let effCategories: typeof categories = categories;
  let effLiveTurnouts: Record<string, number> = liveTurnouts;
  let effEnriched: typeof enriched = enriched;
  let effPartyGroupFavorabilityByKey = derived.partyGroupFavorabilityByKey;

  // PORT-STUB: granular substrate — use when provided, else archetype
  if (derived.granularSubstrate) {
    const s = derived.granularSubstrate;
    effDemographics = s.demographics as typeof demographics;
    effCategories = s.categories as typeof categories;
    effLiveTurnouts = s.liveTurnouts;
    effTotalPool = s.totalPool;
    effEnriched = s.enriched as typeof enriched;
    effPartyGroupFavorabilityByKey = s.partyGroupFavorabilityByKey ?? effPartyGroupFavorabilityByKey;
  }

  // Strength multiplier
  const approvalDecimal = approvalPct / 100;
  const officeStrength = getPartyStrengthWeight(
    election.countryId,
    officeKeyForElectionType(election.electionType, election.countryId),
  );
  const strengthMultiplier = (1 + (approvalDecimal - 0.5) * 0.2) * officeStrength;

  let effectiveTurnPool = turnVoteWeight(totalTurns, turnIndex, effTotalPool) * strengthMultiplier;
  if (derived.granularSubstrate) {
    effectiveTurnPool = turnVoteWeight(totalTurns, turnIndex, derived.granularSubstrate.totalPool) * strengthMultiplier;
  }

  // Caps — byte-identical algebra (scale slice only, leave totalPool untouched)
  effectiveTurnPool = capTurnSliceToElectorate(effectiveTurnPool, effTotalPool, electorate);
  effectiveTurnPool = scalePoolToRegistered(effectiveTurnPool, input.registrationPool?.unregistered ?? null);
  const alreadyCast = candidates.reduce(
    (sum, c) => sum + (tally.totalVotes[c._id] ?? 0),
    0,
  );
  effectiveTurnPool = capTurnSliceToRemainingElectorate(
    effectiveTurnPool,
    alreadyCast,
    scalePoolToRegistered(electorate, input.registrationPool?.unregistered ?? null),
  );

  // General vs primary
  const isGeneral =
    input.isGeneralElection !== undefined && input.isGeneralElection !== null
      ? input.isGeneralElection
      : isPrimaryEnded(election, turnNumber, now);

  // Distribute
  const hasPlayerInRace = isGeneral && effEnriched.some((c) => !c.isNPP);
  const partyIdsInRace = new Set(effEnriched.map((ec) => ec.party));
  const regionalExecOfficeType = getRegionalExecutiveOfficeKey(election.countryId);
  const isOwnHeadGov = isHeadOfGovernmentRace(election.electionType, election.countryId);

  const govModifierByParty =
    isCoattailEligibleRace({
      isGeneralElection: isGeneral,
      electionType: election.electionType,
      regionalExecOfficeType,
      isOwnHeadOfGovernmentRace: isOwnHeadGov,
    })
      ? buildModifierByParty(derived.govExecutive ?? null, partyIdsInRace)
      : undefined;

  const presidentialModifierByParty =
    isGeneral && !isOwnHeadGov
      ? buildModifierByParty(derived.president ?? null, partyIdsInRace)
      : undefined;

  const wantsOwnExecIncumbency =
    Boolean(election.state) &&
    isOwnRegionalExecutiveRace({
      isGeneralElection: isGeneral,
      electionType: election.electionType,
      regionalExecOfficeType,
      hasState: Boolean(election.state),
    });
  const incumbentPartyId =
    wantsOwnExecIncumbency && derived.govExecutive ? derived.govExecutive.partyId : undefined;
  const incumbentApproval =
    wantsOwnExecIncumbency && derived.govExecutive ? derived.govExecutive.approval : undefined;

  const legislativeIncumbency = !isSingleSeatLegislativeRace(election)
    ? undefined
    : derived.legislativeIncumbency;

  // Median voter — compute from already-loaded demographics
  let medianVoter: { ep: number; sp: number } | undefined;
  if (isGeneral) {
    // Inline median voter to avoid extra import — deterministic weighted mean
    let weightSum = 0;
    let epWeighted = 0;
    let spWeighted = 0;
    for (const cat of effCategories) {
      const catWeight = effDemographics.categoryWeights[cat._id] ?? 0;
      if (!Number.isFinite(catWeight) || catWeight <= 0) continue;
      for (const group of cat.groups) {
        const sg = effDemographics.groups[group.id];
        const popPct = sg?.population;
        if (typeof popPct !== "number" || !Number.isFinite(popPct) || popPct <= 0) continue;
        const turnoutPct =
          effLiveTurnouts?.[group.id] ??
          (typeof sg?.turnout === "number" ? sg.turnout : group.defaultTurnout) ??
          55;
        if (!Number.isFinite(turnoutPct) || turnoutPct <= 0) continue;
        const ep = typeof sg?.economicLean === "number" ? sg.economicLean : group.defaultEconomicLean;
        const sp = typeof sg?.socialLean === "number" ? sg.socialLean : group.defaultSocialLean;
        const w = catWeight * popPct * turnoutPct;
        weightSum += w;
        epWeighted += w * ep;
        spWeighted += w * sp;
      }
    }
    medianVoter = weightSum > 0 ? { ep: epWeighted / weightSum, sp: spWeighted / weightSum } : { ep: 0, sp: 0 };
  }

  const regByParty = new Map<string, number>();
  const regShareByParty = new Map<string, number>();
  for (const po of input.statePartyOrgs) {
    if (typeof po.registration === "number") regByParty.set(po.partyId, po.registration);
    if (typeof po.registrationShare === "number") regShareByParty.set(po.partyId, po.registrationShare);
  }

  const distributeFn = input.distributeFn;
  let votesPerCandidate: Record<string, number> = {};
  let sharesPct: Record<string, number> = {};
  if (distributeFn) {
    const result = distributeFn(
      effEnriched,
      effectiveTurnPool,
      effTotalPool,
      electorate,
      effDemographics as unknown as import("../types.js").StateDemographics,
      effCategories as unknown as import("../types.js").DemographicCategory[],
      partyOrgByParty,
      {
        includeInfluenceInAppeal: false,
        useNationalInfluenceForReach: false,
        votingSystem: (state.votingSystem as string) ?? "fptp",
        isGeneralElection: isGeneral,
        countryId: election.countryId,
        currentStateId: state._id,
        parentRegionId: state.parentRegionId ?? undefined,
        manifestoMultipliers: derived.manifestoMultipliers,
        liveTurnouts: effLiveTurnouts,
        hasPlayerInRace,
        partyGroupFavorabilityByKey: effPartyGroupFavorabilityByKey,
        regByParty,
        regShareByParty,
        govModifierByParty,
        incumbentSeatShareByParty: derived.incumbentSeatShareByParty,
        incumbentPartyId,
        incumbentApproval,
        legislativeIncumbentPartyId: legislativeIncumbency?.incumbentPartyId,
        legislativeIncumbentTenureTerms: legislativeIncumbency?.tenureTerms,
        houseIncumbentTenureTermsByCandidateId: derived.houseIncumbentTenureTermsByCandidateId,
        fundsByParty: derived.fundsByParty,
        presidentialModifierByParty,
        medianVoter,
        useSwingFlowModel: true,
      },
    );
    votesPerCandidate = result.votesPerCandidate;
    sharesPct = result.sharesPct;
  } else {
    // Fallback: even split when no distributor supplied (tests that pin caps)
    const per = effEnriched.length > 0 ? effectiveTurnPool / effEnriched.length : 0;
    for (const ec of effEnriched) {
      votesPerCandidate[ec.candidateId] = per;
      sharesPct[ec.candidateId] = 100 / effEnriched.length;
    }
  }

  // Executive endorsement bonus
  const endorsedIds = derived.executiveEndorsedCandidateIds ?? new Set<string>();

  const activeCandidateIds = new Set(effEnriched.map((ec) => ec.candidateId));
  const newTotals: Record<string, number> = {};
  for (const ec of effEnriched) {
    const raw = votesPerCandidate[ec.candidateId] ?? 0;
    const multiplier = endorsedIds.has(ec.candidateId) ? EXECUTIVE_ENDORSEMENT_VOTE_BONUS : 1.0;
    newTotals[ec.candidateId] = (tally.totalVotes[ec.candidateId] ?? 0) + Math.round(raw * multiplier);
  }

  // Seat estimation (Hamilton)
  const seatsEstimate = estimateSeats({
    electionType: election.electionType,
    totalSeats: election.totalSeats ?? null,
    enriched: effEnriched,
    newTotals,
    currentYear: derived.currentYear ?? null,
    statePartyOrgs: input.statePartyOrgs.map((po) => ({ partyId: po.partyId, organization: po.organization })),
  });

  // Build snapshot
  const snapshot = {
    turn: turnNumber,
    recordedAt: now,
    cumulativeVotes: { ...newTotals },
    sharesPct,
    ...(seatsEstimate ? { seatsEstimate } : {}),
  };

  // Sync candidateNames/candidateParties: remove withdrawn, add new
  const cleanedNames = { ...tally.candidateNames };
  const cleanedParties = { ...tally.candidateParties };
  for (const key of Object.keys(tally.totalVotes)) {
    if (!activeCandidateIds.has(key)) {
      delete cleanedNames[key];
      delete cleanedParties[key];
    }
  }
  for (const ec of effEnriched) {
    if (!cleanedNames[ec.candidateId]) {
      cleanedNames[ec.candidateId] = ec.characterName;
      cleanedParties[ec.candidateId] = ec.party;
    }
  }

  const newTally = {
    ...tally,
    totalVotes: newTotals,
    candidateNames: cleanedNames,
    candidateParties: cleanedParties,
    ...(seatsEstimate ? { seatsEstimate } : {}),
    updatedAt: now,
    turnSnapshots: [...tally.turnSnapshots, snapshot],
  };

  return { tally: newTally, snapshot, newTotals, sharesPct, seatsEstimate: seatsEstimate ?? undefined };
}
