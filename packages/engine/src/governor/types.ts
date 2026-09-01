/**
 * Governor office state - W30 port.
 *
 * Mainline mapping:
 * - ElectedOfficial rows with officeType "governor" per state
 *   (src/lib/db/types/electedOfficial.ts, src/lib/governorOffice/queries.ts)
 * - GovernorOfficeState AP pool per state
 *   (src/lib/db/types/governorOfficeState.ts, src/lib/constants/governorOffice.ts)
 * - GovernorAddress / GovernorExecutiveOrder / GovernorEndorsement docs
 *   (src/lib/db/types/governorAddresses.ts, governorExecutiveOrders.ts, etc.)
 *
 * Solo collapse: one record per US state keyed by stateId (e.g. "CA") stores
 * both holder and office AP. Vacant when governorId is null (tombstone left by
 * impeachment/resignation analogue - triggers special_governor watcher).
 *
 * Scope: US only. Other regional executives (DE ministerPresident etc.) are
 * PORT-STUB - see src/lib/constants/countries.ts getRegionalExecutiveOfficeKey.
 */

export interface GovernorState {
  stateId: string;
  countryId: string;
  /** Winner id: "player", a politician id, or null when vacant (triggers special). */
  governorId: string | null;
  governorParty: string | null;
  governorName: string | null;
  /** Turn the current term began (election win or succession). Null when vacant. */
  termStartTurn: number | null;
  /** Office AP pool (cap GUBERNATORIAL_ACTION_CAP). Source: governorOfficeState.gubernatorialActions */
  gubernatorialActions: number;
  /** Turn when AP last regenerated. Source: governorOfficeState.lastActionGrantedTurn */
  lastActionGrantedTurn: number;
  /** Last delivered State of the State address turn (cooldown). */
  lastAddressTurn: number | null;
}

export interface GovernorAddress {
  id: string;
  stateId: string;
  countryId: string;
  title: string;
  body?: string;
  deliveredBy: string;
  deliveredAtTurn: number;
  /** When approval bump expires (read-side). Source: ADDRESS_APPROVAL_DURATION_TURNS */
  approvalExpiresAtTurn: number;
  /** When agenda effect expires. Source: ADDRESS_AGENDA_DURATION_TURNS */
  agendaExpiresAtTurn: number;
  /** When demographic turnout boost expires. Source: ADDRESS_DEMOGRAPHIC_DURATION_TURNS */
  demographicExpiresAtTurn: number;
  approvalBump: number;
  demographicDelta: number;
  emphasizedCategories: string[];
  /** Demographic group targeted for turnout boost, if any. */
  targetGroupId?: string;
  expired?: boolean;
}

export interface GovernorOrder {
  id: string;
  stateId: string;
  countryId: string;
  issuedBy: string;
  /** Which regional budget / policy this order targets - label only. */
  legislationTypeId: string;
  effectDirection: 1 | -1;
  steps: 1 | 2;
  policyOptionIndexBefore: number;
  policyOptionIndexAfter: number;
  issuedAtTurn: number;
  expiresAtTurn: number;
  status: "active" | "expired" | "superseded";
}

/**
 * Totally stubbed governor endorsement - solo has no active office endorsement ledger.
 * Kept as a typed marker so queueBill-style future wiring has a named blocker.
 */
export interface GovernorEndorsement {
  id: string;
  stateId: string;
  electionId: string;
  candidateId: string;
  endorsedBy: string;
  createdAtTurn: number;
  isActive: boolean;
}
