/**
 * Ported from mainline `src/lib/turn/socialAxisDrift.ts` to a pure,
 * deterministic function. All database reads are replaced by plain input
 * objects; the function returns updated country states instead of writing.
 *
 * The mainline used MongoDB and async/await; here we use synchronous pure
 * functions. The logic, constants, and formulas are preserved exactly.
 */

// source: src/lib/turn/socialAxisDrift.ts
export const SOCIAL_AXIS_DRIFT_RATE = 0.05;
// source: src/lib/turn/socialAxisDrift.ts
export const SOCIAL_AXIS_MAX_DRIFT_PER_TURN = 0.5;

// source: src/lib/turn/socialAxisDrift.ts
const AXIS_MIN = -5;
const AXIS_MAX = 5;

export interface SocialAxisDriftInput {
  /** Order of countries to consider (from COUNTRY_ORDER) */
  countryOrder: string[];
  /** IDs of currently registered countries (from getRegisteredCountryIds) */
  registeredCountryIds: string[];
  /** Country configs, keyed by country ID (from COUNTRY_CONFIGS) */
  countryConfigs: Record<string, { socialAxisBaseline?: number }>;
  /** Current country states, keyed by country ID (from getCountryState) */
  countryStates: Record<string, { socialAxisPosition?: number; socialAxisDriftTurn?: number }>;
  /** National policies per country, keyed by country ID (from statePolicies query) */
  nationalPolicies: Record<string, Array<{ legislationTypeId: string; social?: number; enactedTurn: number }>>;
  /** Legislation type options, keyed by type ID (from legislationTypes query) */
  legislationTypes: Record<string, { policyOptions?: Array<{ social?: number }> }>;
  /** The turn number in which laws were enacted (gameState.currentTurn) */
  enactmentTurn: number;
}

export interface SocialAxisDriftOutput {
  countriesProcessed: number;
  lawsCounted: number;
  /** Updated country states, keyed by country ID */
  updatedCountryStates: Record<string, { socialAxisPosition: number; socialAxisDriftTurn: number }>;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pure version of processSocialAxisDrift.
 * Returns the number of countries processed, laws counted, and the updated
 * country states. Does not mutate inputs.
 */
export function processSocialAxisDrift(input: SocialAxisDriftInput): SocialAxisDriftOutput {
  const {
    countryOrder,
    registeredCountryIds,
    countryConfigs,
    countryStates,
    nationalPolicies,
    legislationTypes,
    enactmentTurn,
  } = input;

  const registered = new Set(registeredCountryIds);
  const updatedCountryStates: SocialAxisDriftOutput['updatedCountryStates'] = {};
  let countriesProcessed = 0;
  let lawsCounted = 0;

  for (const countryId of countryOrder) {
    if (!registered.has(countryId)) continue;

    // Isolate each country: in mainline, a failure skips the country.
    // Here we assume all required data is present; if not, we skip.
    const cfg = countryConfigs[countryId];
    if (!cfg) continue; // PORT-STUB: mainline would have config; skip if missing.

    const state = countryStates[countryId] ?? {};
    const position = state.socialAxisPosition ?? cfg.socialAxisBaseline ?? 0;
    const watermark = state.socialAxisDriftTurn ?? enactmentTurn - 1;

    const rows = nationalPolicies[countryId] ?? [];
    let delta = 0;
    let counted = 0;

    if (rows.length > 0) {
      const typeIds = [...new Set(rows.map((r) => r.legislationTypeId))];
      // Mainline keys socially-differentiated types by document _id; solo keys
      // legislationTypes by typeId, so membership is checked per typeId directly.
      const sociallyDifferentiatedTypeIds = new Set<string>();
      for (const typeId of typeIds) {
        const type = legislationTypes[typeId];
        if (type && (type.policyOptions ?? []).some((o) => (o.social ?? 0) !== 0)) {
          sociallyDifferentiatedTypeIds.add(typeId);
        }
      }

      for (const row of rows) {
        if (!sociallyDifferentiatedTypeIds.has(row.legislationTypeId)) continue;
        delta += SOCIAL_AXIS_DRIFT_RATE * ((row.social ?? 0) - position);
        counted++;
      }
    }

    delta = clamp(delta, -SOCIAL_AXIS_MAX_DRIFT_PER_TURN, SOCIAL_AXIS_MAX_DRIFT_PER_TURN);
    const next = clamp(position + delta, AXIS_MIN, AXIS_MAX);

    updatedCountryStates[countryId] = {
      socialAxisPosition: Math.round(next * 100) / 100,
      socialAxisDriftTurn: enactmentTurn,
    };
    countriesProcessed++;
    lawsCounted += counted;
  }

  return { countriesProcessed, lawsCounted, updatedCountryStates };
}
