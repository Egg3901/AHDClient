export { advanceTurn } from "./engine.js";
export type { AdvanceTurnOptions } from "./engine.js";
export { createWorld, listEras, listPlayableCountries, listCountries, rulingPartyIdForCountry, rulingPartyForCountry, SCHEMA_VERSION } from "./world.js";
export type { NewWorldOptions, EraInfo, PlayableCountryInfo, WorldOverrides, CountryEconomyOverride } from "./world.js";
export { applyCheat } from "./cheats.js";
export type { CheatOp, PartyNumericField, PlayerNumericField, PoliticianNumericField } from "./cheats.js";
export {
  DEFAULT_WORLD_FEATURE_FLAGS,
  WORLD_FEATURE_FLAG_DEFINITIONS,
  featureFlagForPhase,
  isTurnPhaseEnabled,
  isWorldFeatureFlag,
} from "./featureFlags.js";
export type { WorldFeatureFlag, WorldFeatureFlags } from "./featureFlags.js";
export { serializeSave, deserializeSave } from "./save.js";
export type { SaveFile } from "./save.js";
export { rngFromSeed, rngFromState } from "./rng.js";
export type { WorldRng, RngState } from "./rng.js";
export { dateForTurn, eraForDate, nextEraForDate, addDaysIso, START_DATE, DAYS_PER_TURN } from "./calendar.js";
export type { TurnPhase, TurnReport, PhaseTiming } from "./phases/types.js";
export * from "./npp/nameGenerator.js";
export * from "./npp/nameEra.js";
export * from "./politician.js";
export * from "./support/index.js";
export * from "./actions/catalog.js";
export * from "./actions/execute.js";
export * from "./actions/fundGeneration.js";
export { getCatalog, getLaw } from "./legislation/catalog.js";
export type { Bill, Committee } from "./legislation/types.js";
export * from "./membership.js";
export * from "./caucus.js";
export * from "./endorsement.js";
export type * from "./types.js";
export * as electionEngine from "./electionEngine/index.js";
export { declareCandidacy, withdrawCandidacy } from "./elections/candidacy.js";
export { electionSeriesForWorld, recomputeComposition, seatHolders } from "./elections/orchestration.js";
export type { ElectionRecord, ElectionCandidate, ElectionStatus } from "./elections/types.js";
export * from "./cabinet/types.js";
export * from "./cabinet/constants.js";
export * from "./cabinet/nominationLifecycle.js";
export * from "./cabinet/transition.js";
export * from "./judiciary/types.js";
export * from "./judiciary/divergence.js";
export * from "./judiciary/scotusTurn.js";
export * from "./judiciary/ukJrSurpriseTurn.js";
export * from "./history/types.js";
export { recordWorldHistory, computePlayerBondsValue, computePlayerSharesValue } from "./history/phases.js";
export { checkInvariants } from "./history/invariants.js";
export type { InvariantReport, InvariantFinding, InvariantSeverity } from "./history/invariants.js";
// W42 QA gate: engine-side clamp bounds, exposed so the CLI's economy
// sanity bands check against the real enforced ranges (macroCountryTurn.ts,
// metrics/inflationRecalc.ts) rather than a duplicated set of magic numbers.
export {
  GROWTH_RATE_MIN,
  GROWTH_RATE_MAX,
  UNEMPLOYMENT_MIN,
  UNEMPLOYMENT_MAX,
  INFLATION_MIN,
  INFLATION_MAX,
  OUTPUT_GAP_BOUND,
} from "./economy/macroConstants.js";
export { GOVERNMENT_CHAMBER_BY_COUNTRY } from "./government/constants.js";
export * from "./countryPolitics/index.js";
