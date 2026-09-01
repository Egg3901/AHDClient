/**
 * Governor coattail pure helpers.
 *
 * Ported from `src/lib/electionEngine/govCoattail.ts`.
 * Pure functions `isCoattailEligibleRace`, `isOwnRegionalExecutiveRace`,
 * `buildGovModifierByParty`, `govModifierToPct` are verbatim.
 *
 * Mainline mapping for the DB-dependent `resolveGovExecutiveApproval`:
 * it read the sitting regional executive from `electedOfficials` /
 * `stateApprovalHistory` / merged metrics + `gameState`. In this pure layer
 * the caller supplies the resolved executive directly as plain input
 * (`GovExecutiveInput`) to `buildGovModifierByParty`. A PORT-STUB helper
 * `resolveGovExecutiveApprovalInput` documents the plain shape.
 */

import { approvalCoattailMultiplier, coattailMultiplierMapToPct } from "./coattailMagnitude.js";

export function isCoattailEligibleRace(args: {
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

export function isOwnRegionalExecutiveRace(args: {
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

export function buildGovModifierByParty(
  governor: { partyId: string; approval: number } | null,
  partyIdsInState: Set<string>
): Map<string, number> {
  const map = new Map<string, number>();
  if (!governor) return map;
  if (!partyIdsInState.has(governor.partyId)) return map;
  map.set(governor.partyId, approvalCoattailMultiplier(governor.approval));
  return map;
}

export function govModifierToPct(modifier: Map<string, number>): Record<string, number> {
  return coattailMultiplierMapToPct(modifier);
}

/**
 * Plain input that replaces DB resolver `resolveGovExecutiveApproval(db, countryId, stateId)`.
 *
 * Mainline mapping:
 *   `partyId` = `ElectedOfficial.party` via `getRegionalExecutive`
 *   `approval` = `StateApprovalHistory.approvalRating` or live `calculateStateApproval`
 * Null means vacant / no metrics (neutral).
 */
export type GovExecutiveInput = { partyId: string; approval: number } | null;

export function resolveGovExecutiveApprovalInput(input: GovExecutiveInput): GovExecutiveInput {
  return input ?? null;
}
