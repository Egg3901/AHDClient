/**
 * Cold War tension constants — verbatim port of src/lib/coldwar/tension.ts
 * top-level exports. See tension.ts (this package) for the formulas that
 * consume them.
 */
export const TENSION_BASELINE = 12;
export const NUCLEAR_WAR_MINIMUM_TENSION = 60;
export const WAR_ACCLIMATION_GRACE_TURNS = 12;
export const WAR_ACCLIMATION_MAX_REDUCTION = 0.4;
export const WAR_ACCLIMATION_TURNS_TO_MAX = 40;
export const WAR_ACCLIMATION_FULL_INTENSITY = 70;
export const WAR_ACCLIMATION_HOT_INTENSITY = 85;
export const NUCLEAR_WAR_RESIDUAL_PRESSURE = 30;
/** Fraction of the gap to the floor closed each turn. */
export const TENSION_RELAXATION = 0.08;
/** Discrete-event ledger cap kept on ColdWarTensionState.events. */
export const LEDGER_CAP = 24;
