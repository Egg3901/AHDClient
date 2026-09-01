/**
 * Cold War bloc alignment — solo substitute for src/lib/world/blocMembership.ts.
 *
 * Mainline derives a country's bloc colour from LIVE organisation-membership
 * rows against the era's alignment channels (`resolveAlignmentEra` +
 * `BLOC_BY_POLE`: WEST/WASHINGTON → west, EAST/MOSCOW → east — the map reads
 * the treaty, not a hardcoded judgment table). Rotunda has no
 * organizationMemberships/alignmentEras/INTERNATIONAL_ORGANIZATIONS system
 * ported, so there is no live NATO/Warsaw-Pact roll to read.
 *
 * What DOES exist is W7's command-economy dial: RU and DD are the two
 * playable countries running the planned-economy machinery in 1953 (Warsaw
 * Pact / Comecon satellites — MARKETIZATION_SCHEDULE), which is the exact
 * real-world fact `blocMembership.ts` would resolve to "east" for a 1953
 * preset via the Warsaw Pact's accession channel. This substitutes that one
 * fact: a planned economy is "east"; every other playable country is "west"
 * (in 1953 that's US/UK — no non-aligned band, matching the era's two-bloc
 * shape). PORT-STUB: does not track NATO accession, non-alignment, or a bloc
 * changing after 1953 (no alliance-accession system to move it).
 */
import type { WorldState } from "../types.js";
import { isPlannedEconomy } from "../commandEconomy/constants.js";

export type WorldBloc = "west" | "east";

/** Which side of the 1953 divide a country sits on. */
export function worldBlocOf(world: WorldState, countryId: string): WorldBloc {
  const ce = world.commandEconomy[countryId];
  return ce && isPlannedEconomy(ce.marketizationLevel) ? "east" : "west";
}

/**
 * Mainline's `tradeGrowthNode` reads `blocMember` from `ECONOMIC_BLOC_ORG_IDS`
 * (EU only — metricEngine/providers.ts) which is empty for every 1953 country
 * (the EU does not exist until 1993) and would silently contribute the
 * BLOC_MEMBER_BONUS to nobody if ported literally. This substitutes the
 * era-real Cold War bloc concept above: a country is credited with bloc
 * membership when at least one OTHER playable country shares its bloc (there
 * is a trade partnership to benefit from) — the real economic effect
 * (Comecon / Marshall-Plan-adjacent trade preference) the EU term stands in
 * for once it exists.
 */
export function isTradeBlocMember(world: WorldState, countryId: string): boolean {
  const bloc = worldBlocOf(world, countryId);
  for (const otherId of Object.keys(world.budgets)) {
    if (otherId === countryId) continue;
    if (worldBlocOf(world, otherId) === bloc) return true;
  }
  return false;
}
