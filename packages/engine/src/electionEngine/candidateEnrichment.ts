/**
 * Candidate enrichment — pure transformation of plain inputs into `EnrichedCandidate`.
 *
 * Ported from `src/lib/electionEngine/candidateEnrichment.ts`.
 * Mainline mapping: DB reads (characters, npps, politicalParties, statePartyOrg,
 * nppEndorsements, countryState) are replaced with plain input interfaces
 * mirroring the fields the original read. The enrichment logic (clamping,
 * endorsement favorability boost, NPP nationalInfluence proxy, party positions,
 * regime multiplier, chair roles) is preserved verbatim where possible; OPS
 * regime multiplier is now supplied via plain `RegimeInputs` rather than DB.
 *
 * No WorldState reads, no Mongo, no I/O.
 */

import type { EnrichedCandidate } from "./types.js";

export const NPP_ENDORSEMENT_DIRECT_FAVORABILITY_CAP = 10 as const;
export const NPP_ENDORSEMENT_DIRECT_FAVORABILITY_PER_ENDORSEMENT = 2 as const;

function clampPercentStat(value: number, fallback: number): number {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.min(100, Math.max(0, safeValue));
}

/** Plain party row mirroring `politicalParties` fields read. */
export interface PartyInput {
  sequentialId: number;
  countryId?: string;
  abbreviation?: string;
  economicPosition: number;
  socialPosition: number;
  regimeStatus?: "ruling" | "approved" | "banned" | null;
  chairId?: string | null;
}

/** Plain character row mirroring `Character` fields read. */
export interface CharacterInput {
  _id: string;
  policies: { economic: number; social: number };
  favorability: number;
  politicalInfluence: number;
  nationalInfluence?: number;
  partyInfluence?: number;
  archetypeApprovals?: Record<string, number>;
  infamy?: number;
}

/** Plain NPP row mirroring `NPP` fields read. */
export interface NPPInput {
  _id: string;
  policies: { economic: number; social: number };
  favorability: number;
  politicalInfluence: number;
  archetypeApprovals?: Record<string, number>;
}

/** Plain endorsement count by election+character. */
export interface EndorsementCountInput {
  electionId: string;
  candidateId: string;
  count: number;
}

/** OPS regime multiplier inputs (replaces countryState runtime lookup). */
export interface RegimeInputs {
  governmentType?: string;
  opsVoteMultipliers?: { ruling: number; approved: number; independent: number; banned: number };
  pendingHonestByElection?: { atMultiplier: number } | null;
  isBlocListCountry?: boolean;
}

function resolveRegimeMultiplier(
  config: { governmentType?: string; opsVoteMultipliers?: RegimeInputs["opsVoteMultipliers"] },
  party: { regimeStatus?: "ruling" | "approved" | "banned" | null } | null
): number {
  if (config.governmentType !== "onePartyState") return 1.0;
  const mults = config.opsVoteMultipliers ?? { ruling: 8, approved: 2, independent: 0, banned: 0 };
  if (!party || party.regimeStatus == null) return mults.independent ?? 0;
  switch (party.regimeStatus) {
    case "ruling":
      return mults.ruling ?? 8;
    case "approved":
      return mults.approved ?? 2;
    case "banned":
      return mults.banned ?? 0;
    default:
      return 1.0;
  }
}

/** Plain candidate row mirroring `ElectionCandidate` fields consumed. */
export interface CandidateInput {
  _id: string;
  electionId: string;
  characterId: string;
  characterName: string;
  party: string;
  isNPP?: boolean;
  nppId?: string | null;
  support?: number;
}

/** Options mirroring original `fetchEnrichedCandidates` options plus plain inputs. */
export interface EnrichOptions {
  includePartyPositions?: boolean;
  countryId?: string;
  parties?: PartyInput[];
  characters?: CharacterInput[];
  npps?: NPPInput[];
  /** Chair mapping: characterId -> { role, stateIds } */
  chairByCharacterId?: Map<string, { role: "national" | "state"; stateIds?: string[] }>;
  endorsementCounts?: EndorsementCountInput[];
  regimeInputs?: RegimeInputs | null;
}

export function enrichCandidates(
  candidates: CandidateInput[],
  options?: EnrichOptions
): EnrichedCandidate[] {
  if (candidates.length === 0) return [];

  const parties = options?.parties ?? [];
  const characters = options?.characters ?? [];
  const npps = options?.npps ?? [];

  const partyAbbrById = new Map(
    parties
      .filter((p) => typeof p.abbreviation === "string" && p.abbreviation.length > 0)
      .map((p) => [String(p.sequentialId), p.abbreviation as string])
  );

  const partyPositions = options?.includePartyPositions
    ? new Map(parties.map((p) => [String(p.sequentialId), { econ: p.economicPosition, social: p.socialPosition }]))
    : new Map<string, { econ: number; social: number }>();

  // OPS regime config from plain inputs (default non-OPS = 1.0)
  let electionConfig: { governmentType?: string; opsVoteMultipliers?: RegimeInputs["opsVoteMultipliers"] } | null = null;
  let isOps = false;
  const partyRegimes = new Map<string, "ruling" | "approved" | "banned" | null>();
  if (options?.regimeInputs) {
    const r = options.regimeInputs;
    let effectiveMultipliers = r.opsVoteMultipliers ?? undefined;
    if (r.isBlocListCountry) {
      effectiveMultipliers = { ruling: 1, approved: 1, independent: 1, banned: 0 };
    }
    if (r.pendingHonestByElection) {
      const m = r.pendingHonestByElection.atMultiplier;
      effectiveMultipliers = { ruling: m, approved: m, independent: m, banned: m };
    }
    const govType: string | undefined = r.governmentType;
    electionConfig = {
      ...(govType !== undefined ? { governmentType: govType } : {}),
      ...(effectiveMultipliers !== undefined ? { opsVoteMultipliers: effectiveMultipliers } : {}),
    };
    isOps = govType === "onePartyState";
    if (isOps) {
      for (const p of parties) {
        partyRegimes.set(String(p.sequentialId), p.regimeStatus ?? null);
      }
    }
  }

  const charMap = new Map(characters.map((c) => [c._id, c]));
  const nppMap = new Map(npps.map((n) => [n._id, n]));

  const endorsementCountByKey = new Map<string, number>();
  for (const ec of options?.endorsementCounts ?? []) {
    const key = `${ec.electionId}:${ec.candidateId}`;
    endorsementCountByKey.set(key, (endorsementCountByKey.get(key) ?? 0) + ec.count);
  }

  return candidates.map((c) => {
    let charEP = 0,
      charSP = 0,
      favorability = 50,
      politicalInfluence = 10,
      nationalInfluence = 0,
      partyInfluence = 0,
      archetypeApprovals: Record<string, number> | undefined,
      candidateInfamy: number | undefined;

    if (c.isNPP && c.nppId) {
      const npp = nppMap.get(c.nppId);
      if (npp) {
        charEP = npp.policies.economic;
        charSP = npp.policies.social;
        favorability = npp.favorability;
        politicalInfluence = npp.politicalInfluence;
        nationalInfluence = npp.politicalInfluence;
        archetypeApprovals = npp.archetypeApprovals;
      }
    } else {
      const char = charMap.get(c.characterId);
      if (char) {
        charEP = char.policies.economic;
        charSP = char.policies.social;
        favorability = char.favorability;
        politicalInfluence = char.politicalInfluence;
        nationalInfluence = char.nationalInfluence ?? 0;
        partyInfluence = char.partyInfluence ?? 0;
        archetypeApprovals = char.archetypeApprovals;
        candidateInfamy = char.infamy;
      }
    }

    const clampedFavorability = clampPercentStat(favorability, 50);
    const endorsementBoost = Math.min(
      NPP_ENDORSEMENT_DIRECT_FAVORABILITY_CAP,
      (endorsementCountByKey.get(`${c.electionId}:${c.characterId}`) ?? 0) *
        NPP_ENDORSEMENT_DIRECT_FAVORABILITY_PER_ENDORSEMENT
    );
    const clampedPoliticalInfluence = clampPercentStat(politicalInfluence, 10);
    const hasResolvedNpp = Boolean(c.isNPP && c.nppId && nppMap.has(c.nppId ?? ""));
    const resolvedNationalInfluence = hasResolvedNpp
      ? clampedPoliticalInfluence
      : Math.max(0, nationalInfluence);
    const partyPos = partyPositions.get(c.party);

    const regimeStatus = isOps ? (partyRegimes.get(c.party) ?? null) : undefined;
    const regimeMult = electionConfig
      ? resolveRegimeMultiplier(
          electionConfig,
          regimeStatus !== undefined ? { regimeStatus } : null
        )
      : 1.0;

    const chairInfo = options?.chairByCharacterId?.get(c.characterId);
    const partyChairRole = c.isNPP ? null : (chairInfo?.role ?? null);
    const stateChairStateIds =
      partyChairRole === "state" ? (chairInfo?.stateIds ?? undefined) : undefined;

    const out: EnrichedCandidate = {
      candidateId: c._id,
      characterId: c.characterId,
      characterName: c.characterName,
      party: c.party,
      isNPP: c.isNPP ?? false,
      charEP,
      charSP,
      favorability: clampPercentStat(clampedFavorability + endorsementBoost, 50),
      politicalInfluence: clampedPoliticalInfluence,
      nationalInfluence: resolvedNationalInfluence,
      regimeMult,
    };
    const abbr = partyAbbrById.get(c.party);
    if (abbr) out.partyAbbr = abbr;
    if (partyInfluence !== 0) out.partyInfluence = Math.max(0, partyInfluence);
    if (partyChairRole) out.partyChairRole = partyChairRole;
    else if (partyChairRole === null) out.partyChairRole = null;
    if (stateChairStateIds) out.stateChairStateIds = stateChairStateIds;
    if (candidateInfamy !== undefined) out.infamy = candidateInfamy;
    if (archetypeApprovals !== undefined) out.archetypeApprovals = archetypeApprovals;
    if (typeof c.support === "number") out.support = c.support;
    if (partyPos) {
      out.partyEcon = partyPos.econ;
      out.partySocial = partyPos.social;
    }
    if (regimeStatus !== undefined) out.regimeStatus = regimeStatus;
    return out;
  });
}

/** Alias preserving mainline name for call sites that will pass plain inputs. */
export const fetchEnrichedCandidates = enrichCandidates;
