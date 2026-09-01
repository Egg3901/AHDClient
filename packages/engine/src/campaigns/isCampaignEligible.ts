/**
 * Campaign Manager eligibility (W26).
 * Ported from src/lib/campaigns/isCampaignEligible.ts isCampaignEligibleElection.
 *
 * Mainline's presidential path is future-proofed via
 * isDirectElection(getCountryConfig(countryId)); solo has no "president"
 * electionType yet (elections/orchestration.ts electionSeriesForWorld only
 * spawns house/senate/commons/supremeSovietDeputy/nationalitiesDeputy/
 * volkskammerDeputy), so that branch is dead code today and is not ported —
 * PORT-STUB, reinstate when a presidential election type lands.
 *
 * The non-presidential path is gated in mainline by each country's
 * `CountryConfig.campaignManagerNonPresidentialEnabled` flag, which is only
 * ever true for US (Phase 5.5). Solo has no CountryConfig registry, so that
 * flag is inlined as the single hardcoded `electionType === "US"` check
 * below rather than porting a whole config system for one boolean.
 */

const NON_PRESIDENTIAL_RACE_FAMILIES = new Set<string>(["senate", "governor", "house", "stateSenate"]);

export function isCampaignEligibleElection(election: { countryId: string; electionType: string }): boolean {
  if (election.countryId === "US" && NON_PRESIDENTIAL_RACE_FAMILIES.has(election.electionType)) {
    return true;
  }
  // Non-US races (UK commons, RU/DD legislature seats) never enabled
  // campaignManagerNonPresidentialEnabled in mainline either — deferred per
  // Phase 5.5 D4 (country-specific campaign-finance models need a separate
  // audit). Falling through to false is intentional.
  return false;
}
