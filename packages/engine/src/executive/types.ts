/**
 * Executive (head-of-state/government) office state — W24 port.
 *
 * Mainline mapping: `ElectedOfficial` rows with `officeType: "president" |
 * "vicePresident"` (src/lib/db/types/electedOfficial.ts), read/written via
 * `getExecutiveOfficialFilter` (src/lib/elections/executiveOfficeFilters.ts).
 * Solo collapses the two office-typed rows into one record per country: an
 * executive is either vacant or held by exactly one president (+ optional
 * VP), so there is no benefit to Mongo's two-document shape here.
 *
 * Scope (W24): US only. Other presidential systems (BR, FR, NG, ...) are not
 * wired into `electionSeriesForWorld` this wave — PORT-STUB, same boundary
 * mainline's contingent-election machinery already draws (12th Amendment is
 * US-specific; other presidential countries have no contingent path modeled
 * here either).
 */
export interface ExecutiveState {
  countryId: string;
  /** "player", a politician id, or null when the office is vacant. */
  presidentId: string | null;
  presidentParty: string | null;
  /** Turn the current president's term began (election win or succession). */
  termStartTurn: number | null;
  /** "player", a politician id, or null when the office is vacant. */
  vicePresidentId: string | null;
  vicePresidentParty: string | null;
}
