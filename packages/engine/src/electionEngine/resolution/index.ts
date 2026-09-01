// @ts-nocheck
/**
 * Resolution layer — pure election resolution modules.
 *
 * Ported from `src/lib/turn/election/` and `src/lib/elections/` for the
 * four playable countries (US, UK, RU, DD). Each module is pure with plain
 * input interfaces; the operator wires WorldState next wave. No WorldState
 * import, no Mongo, no I/O.
 */

export * from "./constants.js";
export * from "./seatAllocation.js";
export * from "./sainteLagueAllocation.js";
export * from "./blocListAllocation.js";
export * from "./cycleAnchorContext.js";
export * from "./canonicalCycle.js";
export * from "./apportionment.js";
export * from "./statehoodAdmission.js";
export * from "./conventionResolution.js";
export * from "./contingentElection.js";
export * from "./contingentData.js";
export * from "./activeCandidacy.js";
export * from "./buildPollingData.js";
export * from "./generalResolutionHelpers.js";
export * from "./generalResolution.js";
export * from "./electionSpawning.js";
