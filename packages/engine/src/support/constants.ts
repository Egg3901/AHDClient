/**
 * Support/electorate constants for W19 party support model cluster.
 * Every constant cites its mainline source file and value.
 */

// supportDecay / supportAccrual
// Source: src/lib/electionEngine/electionFormulaFactors.ts
export const DEFAULT_CANDIDATE_SUPPORT = 50 as const;
export const SUPPORT_DECAY_PER_TURN = 0.5 as const;
export const SUPPORT_RALLY_FULL_VALUE = 10 as const;
export const RALLY_IMMEDIATE_SHARE = 0.6 as const;
export const RALLY_SPREAD_TURNS = 4 as const;

// turnoutDecay
// Source: src/lib/utils/turnoutDecay.ts
export const TURNOUT_DECAY_RATE = 0.02 as const; // 2% per turn
export const TURNOUT_ZERO_THRESHOLD = 0.01 as const;
export const TURNOUT_MAX_MODIFIER = 20 as const;
export const TURNOUT_MIN_MODIFIER = -20 as const;

// diminishing returns for GOTV
// Source: src/lib/utils/diminishingReturns.ts
export const DIMINISHING_MAX = 20 as const;

// GOTV
// Source: src/lib/utils/demographicAlignment.ts
export const DOLLARS_PER_TURNOUT_POINT = 5000 as const;
// Source: src/lib/demographics/countryDemographics.ts alignment helpers
export const GOTV_WITHIN_TWO_POINTS = 2 as const; // both axes within 2

// regDriftDecay
// Source: src/lib/turn/partyOrg/pacingConstants.ts
export const PASSIVE_REG_DRIFT_RATE = 0.06 as const;
export const PASSIVE_REG_DECAY_RATE = 0.004 as const;
export const REG_DRIFT_CATCH_ELIGIBILITY_ORG_PCT = 10 as const;
export const NON_PARTY_BUCKET_INDEPENDENT_BIAS = 1.5 as const;
export const REG_LAG_BELOW_ORG_PCT = 0 as const; // solo neutral; mainline per-country map currently empty

// pressureDecay
// Source: src/lib/politicalStrength/strengthConstants.ts
export const PRESSURE_DECAY_PER_TURN = 3 as const;
export const PRESSURE_LADDER_MAX_VALUE = 8 as const;

// priorityRegion
// Source: src/lib/turn/politicalStrength/priorityRegionDecay.ts comment D6
// Ineligible when organization == 0 or region row missing; cooldown 168 turns is
// enforced at action time, not in decay — decay only evicts.
