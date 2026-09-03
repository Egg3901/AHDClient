import type { WorldState } from "../types.js";
import type { CountryPoliticalOverview } from "./types.js";

/** Overview for one country, or null when none is seeded (non-playable). */
export function getCountryPolitics(
  world: WorldState,
  countryId: string,
): CountryPoliticalOverview | null {
  return world.countryPolitics[countryId] ?? null;
}

/** Current national approval 0-100, or null when none is seeded. */
export function getNationalApproval(world: WorldState, countryId: string): number | null {
  return world.countryPolitics[countryId]?.approval ?? null;
}
