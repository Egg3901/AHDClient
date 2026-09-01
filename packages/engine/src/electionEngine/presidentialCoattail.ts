/**
 * Presidential coattail pure helpers.
 *
 * Ported from `src/lib/electionEngine/presidentialCoattail.ts`.
 * Pure functions `isHeadOfGovernmentRace`, `buildPresidentialModifierByParty`,
 * `presidentialModifierToPct` are verbatim.
 *
 * Mainline mapping for DB-dependent `resolvePresidentApproval`:
 * it read `electedOfficials` + `governmentApprovals`. In this pure layer callers
 * supply the resolved president directly as plain input (`PresidentInput`).
 */

import type { CountryId } from "./types.js";
import { approvalCoattailMultiplier, coattailMultiplierMapToPct } from "./coattailMagnitude.js";

const HEAD_OF_GOVERNMENT_TYPE_BY_COUNTRY: Readonly<Partial<Record<CountryId, string>>> = {
  US: "president",
};

export function isHeadOfGovernmentRace(electionType: string, countryId: CountryId): boolean {
  return HEAD_OF_GOVERNMENT_TYPE_BY_COUNTRY[countryId] === electionType;
}

export function buildPresidentialModifierByParty(
  president: { partyId: string; approval: number } | null,
  partyIdsInRace: Set<string>
): Map<string, number> {
  const map = new Map<string, number>();
  if (!president) return map;
  if (!partyIdsInRace.has(president.partyId)) return map;
  map.set(president.partyId, approvalCoattailMultiplier(president.approval));
  return map;
}

export function presidentialModifierToPct(modifier: Map<string, number>): Record<string, number> {
  return coattailMultiplierMapToPct(modifier);
}

/**
 * Plain input replacing DB resolver `resolvePresidentApproval(db, countryId)`.
 *
 * Mainline mapping:
 *   `partyId` = `ElectedOfficial.party` (latest `electedAt` for head type)
 *   `approval` = `GovernmentApproval.approvalRating` or `BASE_APPROVAL` (50)
 * Null means no head-of-government office or vacant presidency.
 */
export type PresidentInput = { partyId: string; approval: number } | null;

export function resolvePresidentApprovalInput(input: PresidentInput): PresidentInput {
  return input ?? null;
}
