/**
 * Country political overview state — AHDClient-native national-mood model.
 *
 * There is no mainline counterpart: mainline tracks regional support/turnout
 * inputs, per-politician favorability, and crisis "approval" ticks that nudge
 * player favorability as a proxy (see events/crisis.ts `case "approval"`),
 * but no persistent national approval metric, no regime classification field,
 * and no chamber-officer records (committees track chairs; chambers track
 * only composition). This module gives the country overview a serializable
 * home for those values without inventing history: every number derives from
 * live world data (macro economy, budgets, chamber composition, vacancies,
 * active crises/conflicts) through the provisional weights in constants.ts.
 */
export type RegimeClassification =
  | "presidential-republic"
  | "parliamentary"
  | "one-party"
  | "national-government";

/** Presiding + majority officers for one chamber, by politician id. Null = vacant office. */
export interface ChamberOfficers {
  chamberKey: string;
  speakerId: string | null;
  speakerPartyId: string | null;
  majorityLeaderId: string | null;
  majorityLeaderPartyId: string | null;
}

export interface ApprovalSample {
  turn: number;
  approval: number;
}

export interface CountryPoliticalOverview {
  countryId: string;
  /** National approval 0-100 (1-decimal). */
  approval: number;
  /** Oldest-first approval samples, capped at APPROVAL_HISTORY_CAP. Seed entry is turn 0. */
  approvalHistory: ApprovalSample[];
  regime: RegimeClassification;
  /** Display label (engine-canonical form of the desktop derivation). */
  governmentType: string;
  /** Regime legitimacy 0-100 (1-decimal). */
  legitimacy: number;
  /** Civil unrest 0-100 (1-decimal). */
  unrest: number;
  /** Keyed by chamber key; covers every chamber of the country's legislature. */
  officersByChamber: Record<string, ChamberOfficers>;
  /** Last turn any field above changed. */
  updatedTurn: number;
}
