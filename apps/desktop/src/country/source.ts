import type { CountryOverviewModel } from "./model.js";

/**
 * Platform-neutral country-overview reader. Transport-free by contract:
 * implementations project already-loaded state, they never fetch.
 */
export interface CountryOverviewSource {
  load(countryId: string): Promise<CountryOverviewModel>;
}
