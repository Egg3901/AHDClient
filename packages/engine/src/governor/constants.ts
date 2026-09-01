/**
 * Governor constants - W30 port.
 *
 * Source: src/lib/constants/governorOffice.ts (mainline AHDGame)
 * Every value is byte-identical to mainline so goldens cite correctly.
 */

// Source: src/lib/constants/governorOffice.ts GUBERNATORIAL_ACTION_CAP
export const GUBERNATORIAL_ACTION_CAP = 3;
// Source: src/lib/constants/governorOffice.ts GUBERNATORIAL_ACTION_REGEN_INTERVAL
export const GUBERNATORIAL_ACTION_REGEN_INTERVAL = 18;

// Executive orders - Source: src/lib/constants/governorOffice.ts
export const EXEC_ORDER_DURATION_TURNS = 24;
export const EXEC_ORDER_SLOT_CAP = 2;
export const EXEC_ORDER_AP_COST_PER_STEP = 1;
export const EXEC_ORDER_MAX_STEPS = 2;
/**
 * Solo-only interim regional-budget effect for an active executive order:
 * mainline writes a StatePolicy.policyOptionIndex ladder step (see
 * powers.ts issueGovernorOrder PORT-STUB note) which solo has no ladder to
 * receive; the depth-real stand-in is a per-step grant bump applied to the
 * order's state regionalBudget every turn the order is active (see
 * phases.ts governorOrdersPhase). Not a mainline-cited number - flagged as
 * a solo-only tuning scalar until StatePolicy exists to drive a real delta.
 */
export const EXEC_ORDER_GRANT_BUMP_PER_STEP = 50_000;

// State of the State address - Source: src/lib/constants/governorOffice.ts
export const ADDRESS_COOLDOWN_TURNS = 8;
export const ADDRESS_APPROVAL_BUMP = 3;
export const ADDRESS_APPROVAL_DURATION_TURNS = 24;
export const ADDRESS_DEMOGRAPHIC_DELTA = 5;
export const ADDRESS_PARTY_GROUP_FAVORABILITY_DELTA = 5;
export const ADDRESS_AGENDA_DURATION_TURNS = 24;
export const ADDRESS_DEMOGRAPHIC_DURATION_TURNS = 24;
export const ADDRESS_AGENDA_FORCE_BIAS = 8;
export const ADDRESS_ACTION_COST = 1;
export const ADDRESS_NPI_COST = 5;
export const ADDRESS_EMPHASIS_MIN = 1;
export const ADDRESS_EMPHASIS_MAX = 2;
export const ADDRESS_TITLE_MIN_LENGTH = 10;
export const ADDRESS_TITLE_MAX_LENGTH = 200;
export const ADDRESS_BODY_MAX_LENGTH = 2000;

// Endorsements - Source: src/lib/constants/governorOffice.ts
export const GOVERNOR_ENDORSEMENT_CAMPAIGN_ACTIONS = 1.5;
export const GOVERNOR_ENDORSEMENT_ACTION_COST = 1;

// Special governor by-election - Source: src/lib/turn/byElections.ts + src/lib/constants/electionDurations.ts
export const SPECIAL_GOVERNOR_FILING_TURNS = 24;
export const SPECIAL_GOVERNOR_GENERAL_TURNS = 24;
export const BY_ELECTION_RETRY_COOLDOWN_TURNS = 48;
export const SPECIAL_GOVERNOR_DURATION_TURNS =
  SPECIAL_GOVERNOR_FILING_TURNS + SPECIAL_GOVERNOR_GENERAL_TURNS;
