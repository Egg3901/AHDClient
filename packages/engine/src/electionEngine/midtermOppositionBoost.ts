/**
 * Midterm opposition boost pure helpers.
 *
 * Ported from `src/lib/electionEngine/midtermOppositionBoost.ts`.
 * Pure functions `buildMidtermOppositionModifierByParty`,
 * `midtermOppositionModifierToPct` are verbatim.
 * `isMidtermOppositionBoostEligible` wraps `isUKRegionalCouncilMidterm` which
 * is inlined below to avoid cross-module dependency (see mapping).
 *
 * Mainline mapping for DB-dependent `resolveMidtermOppositionModifierByParty`:
 * it resolved governing party ids via `resolveGoverningPartyIds(db)`. In this
 * pure layer callers supply `governingPartyIds` directly as a plain set.
 */

export const MIDTERM_OPPOSITION_MULTIPLIER = 1.05 as const;

// Inlined from `src/lib/elections/ukRegionalCouncilStagger.ts` — pure logic.
const UK_REGIONAL_COUNCIL_COHORT_BY_REGION: Readonly<Record<string, number>> = {
  SCO: 1,
  NIR: 2,
  NEE: 2,
  SEE: 3,
  WAL: 3,
  SWE: 4,
  EAE: 4,
  LON: 4,
  EMI: 5,
  NWE: 5,
  YHU: 5,
  WMI: 5,
};
const UK_REGIONAL_COUNCIL_COHORT_COUNT = 5;

function isUKRegionalCouncilMidterm(input: {
  countryId: string | null | undefined;
  electionType: string;
  state: string | null | undefined;
  cycle: number;
}): boolean {
  if (input.countryId !== "UK" || input.electionType !== "regionalCouncil") return false;
  if (input.cycle <= 0) return false;
  const cohort = input.state
    ? UK_REGIONAL_COUNCIL_COHORT_BY_REGION[input.state.toUpperCase()]
    : undefined;
  return cohort != null && cohort < UK_REGIONAL_COUNCIL_COHORT_COUNT;
}

/** Plain election shape mirroring `Election` fields used for eligibility. */
export interface MidtermElectionInput {
  countryId?: string | null;
  electionType: string;
  state?: string | null;
  cycle: number;
}

/** Alias for test compatibility — mirrors mainline `Election` shape used in tests. */
export type Election = MidtermElectionInput & {
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export function isMidtermOppositionBoostEligible(election: MidtermElectionInput): boolean {
  return isUKRegionalCouncilMidterm({
    countryId: election.countryId ?? null,
    electionType: election.electionType,
    state: election.state ?? null,
    cycle: election.cycle,
  });
}

export function buildMidtermOppositionModifierByParty(
  governingPartyIds: ReadonlySet<string>,
  partyIdsInRace: ReadonlySet<string>
): Map<string, number> {
  const modifiers = new Map<string, number>();
  if (governingPartyIds.size === 0) return modifiers;
  for (const partyId of partyIdsInRace) {
    if (!governingPartyIds.has(partyId)) {
      modifiers.set(partyId, MIDTERM_OPPOSITION_MULTIPLIER);
    }
  }
  return modifiers;
}

export function midtermOppositionModifierToPct(
  modifier: ReadonlyMap<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [partyId, multiplier] of modifier) {
    out[partyId] = (multiplier - 1) * 100;
  }
  return out;
}

/**
 * Plain resolver replacing `resolveMidtermOppositionModifierByParty(db, countryId, partyIds)`.
 * Caller supplies `governingPartyIds` (e.g. from `WorldState` government composition).
 */
export function resolveMidtermOppositionModifierByPartyInput(
  governingPartyIds: ReadonlySet<string>,
  partyIdsInRace: ReadonlySet<string>
): Map<string, number> {
  return buildMidtermOppositionModifierByParty(governingPartyIds, partyIdsInRace);
}
