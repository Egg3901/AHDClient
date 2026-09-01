/**
 * Priority region decay (auto-eviction of ineligible regions).
 * Ports src/lib/turn/politicalStrength/priorityRegionDecay.ts
 * Ineligible when region row missing or organization == 0.
 */

/**
 * Pure helper: filter priority region ids to those still eligible.
 * regionOrg map is `${regionId}` -> organization for the party.
 */
export function filterEligiblePriorityRegions(
  regionIds: string[],
  regionOrgById: Map<string, number>,
): { eligible: string[]; evicted: number } {
  const eligible = regionIds.filter((id) => (regionOrgById.get(id) ?? 0) > 0);
  return { eligible, evicted: regionIds.length - eligible.length };
}
