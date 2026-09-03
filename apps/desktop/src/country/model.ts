/**
 * Transport-free country-overview view contract.
 *
 * Pure data shapes only. No fetch, Tauri, React, mutation, or RNG here:
 * a reader builds a CountryOverviewModel from already-loaded state and the
 * view renders it without knowing WorldState, the network, or the platform.
 *
 * Every multiplayer overview category the local engine cannot back is
 * reported as an explicit MissingRecord in `unavailable`, never silently
 * omitted. A null inside a backed section (e.g. a vacant office) is engine
 * state, not a gap, and is recorded as an explicit null. Concepts that do
 * not apply (no ceremonial head of state separate from the executive, no
 * parliamentary formation in a presidential system) are omitted entirely,
 * never listed as gaps.
 */

/** One multiplayer category with no engine backing. Never omit: list it. */
export interface MissingRecord {
  /** Stable multiplayer category key, e.g. "nationalApproval". */
  category: string;
  /** What the viewer would show if the data existed. */
  detail: string;
  /** The engine-side reason the value cannot be supplied. */
  engineGap: string;
}

export interface CountryIdentity {
  id: string;
  name: string;
  descriptor: string;
  regionLabel: string;
  governmentType: string;
  playable: boolean;
}

export interface OverviewWorld {
  era: string;
  date: string;
  turn: number;
  seed: string;
}

export interface OverviewPlayer {
  name: string;
  actions: number;
  cash: number;
  funds: number;
  party: string;
}

export interface OverviewRegistration {
  label: string;
  tone: "active" | "beta";
}

/** One office lookup. Null name/party means the office is vacant, not unknown. */
export interface OverviewLeader {
  office: string;
  name: string | null;
  party: string | null;
}

/** One national approval sample, oldest-first in OverviewApproval.history. */
export interface OverviewApprovalSample {
  turn: number;
  approval: number;
}

/**
 * National approval 0-100 backed by the engine countryPolitics record.
 * Null on CountryOverviewModel when no record is seeded (non-playable
 * countries); then "nationalApproval" appears in `unavailable` instead.
 */
export interface OverviewApproval {
  value: number;
  history: OverviewApprovalSample[];
  updatedTurn: number;
}

/**
 * Regime classification backed by the engine countryPolitics record.
 * Null when no record is seeded; then "regime" appears in `unavailable`.
 */
export interface OverviewRegime {
  id: string;
  label: string;
  governmentType: string;
}

/**
 * Presiding + majority officers for one chamber. Null names/parties mean
 * the office is vacant (chamber seats nobody), not unknown.
 */
export interface OverviewChamberOfficer {
  chamberKey: string;
  chamberName: string;
  speakerName: string | null;
  speakerParty: string | null;
  majorityLeaderName: string | null;
  majorityLeaderParty: string | null;
}

export interface OverviewPartySeat {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  seats: number;
  organization: number;
  memberCount: number;
}

export interface OverviewChamber {
  key: string;
  name: string;
  elected: boolean;
  seats: number;
  vacancies: number;
  parties: OverviewPartySeat[];
}

export interface OverviewLegislature {
  name: string;
  chambers: OverviewChamber[];
  totalSeats: number;
  totalVacancies: number;
}

export interface OverviewElection {
  id: string;
  electionType: string;
  status: string;
}

export interface OverviewElections {
  activeCount: number;
  items: OverviewElection[];
}

/**
 * Parliamentary formation state. Null when the country seats no
 * parliamentary government: presidential systems have no formation to
 * report (concept not applicable, not a gap), and some parliamentary
 * countries seat none yet. Never a MissingRecord.
 */
export interface OverviewGovernment {
  status: string;
  formationType: string | null;
  governingPartyId: string | null;
  coalitionPartyIds: string[] | null;
  headName: string | null;
  headParty: string | null;
  totalSeatsSupporting: number;
  majorityThreshold: number;
}

export interface OverviewEconomy {
  gdp: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  outputGap: number;
}

/**
 * Named economic-model classification from the engine economicModels
 * record. Null when unclassified (fresh worlds classify on the first
 * turn); rendered as an empty state, not a gap.
 */
export interface OverviewEconomicModel {
  id: string;
  name: string;
  intensity: number;
}

export interface OverviewBudget {
  revenueTotal: number;
  spendingTotal: number;
  surplus: number;
  debtPrincipal: number;
  creditRating: string;
}

/**
 * Sovereign-debt view derived from existing budget, bond, and crisis
 * state. Null when the country carries no national budget (macro-only):
 * debt, revenue, and rating are then unknown, not zero. Bond and crisis
 * rows read the live bond book and active crisis list for the country.
 */
export interface OverviewSovereignDebt {
  revenueTotal: number;
  spendingTotal: number;
  surplus: number;
  debtPrincipal: number;
  debtCeiling: number;
  /** Principal / ceiling, null when the ceiling is not positive. */
  debtToCeiling: number | null;
  interestRate: number;
  debtInterest: number;
  creditRating: string;
  /** Engine mirror when computed, otherwise null (never derived here). */
  debtToGdpRatio: number | null;
  /** Non-matured sovereign bonds issued by this country. */
  outstandingBondCount: number;
  /** Face value held (issued minus market-maker float), absolute units. */
  outstandingBondFaceValue: number;
  maturedBondCount: number;
  defaultedBondCount: number;
  debtCeilingCrisisActive: boolean;
  activeCrisisNames: string[];
}

export interface OverviewCorporation {
  id: string;
  sector: string;
}

export interface OverviewBill {
  id: string;
  title: string;
  status: string;
}

export interface OverviewLaw {
  id: string;
  level: number;
  enactedAtTurn: number;
}

export interface OverviewLaws {
  activeBillCount: number;
  enactedLawCount: number;
  activeBills: OverviewBill[];
  enactedLaws: OverviewLaw[];
}

/**
 * National ideological position, mainline semantics: equal-weight average
 * over current non-repealed national-scope enacted laws. Each law
 * contributes its enacting bill's raw provision economic/social values
 * (no multiplication by effectDirection); explicit zeros count, provisions
 * missing an axis are excluded from that axis, and each axis average is
 * clamped to [-5, 5]. Deliberately not seat-weighted party positions:
 * laws are what the state has done, seats are who holds office.
 */
export interface NationalAxes {
  economic: number;
  social: number;
  enactedLawCount: number;
  provisionCount: number;
  /** Enacted laws whose enacting bill is absent from state: counted, contribute 0. */
  unresolvableLawCount: number;
}

export interface OverviewCounts {
  parties: number;
  politicians: number;
  /** Elections with status "active". Upcoming races are counted separately. */
  activeElections: number;
  /** Elections with status "upcoming". */
  upcomingElections: number;
  activeBills: number;
  enactedLaws: number;
  corporations: number;
  /** Regions (states/subdivisions) seeded for this country. */
  regions: number;
  /** Unions chartered in this country. */
  unions: number;
  /** Every referendum record for this country, any status. */
  totalReferendums: number;
  /** Referendum records still live (campaigning, polling, or actuating). */
  activeReferendums: number;
  /** Policy rate of this country's central bank, null when it has none. */
  primeRate: number | null;
  /** True when this country runs a flag-on planned (command) economy. */
  commandEconomy: boolean;
  /**
   * Naval/air formations owned. Always zero: the engine carries no naval or
   * air unit rosters, so the Naval and Air Command row renders its gate
   * instead of a count until rosters land.
   */
  navairFormations: number;
  /** Conflicts involving this country with status other than "resolved". */
  activeConflicts: number;
  /** True for the Cold War principals (US, RU), mirroring AHDGame. */
  coldWarPrincipal: boolean;
  /** True while both the coldWar and conflicts subsystems run. */
  coldWarListed: boolean;
  /** Budget surplus as a share of GDP in percent, null without a budget. */
  budgetBalancePctGdp: number | null;
  /** Supreme Court seats for this country (US-only mechanic). */
  scotusSeats: number;
  /** Domestic corporations with a positive share price (exchange-listed). */
  stockListings: number;
  /** FX rate in local currency per 1 anchor, null for forex-off countries. */
  forexRate: number | null;
}

export interface CountryOverviewModel {
  country: CountryIdentity;
  world: OverviewWorld;
  registration: OverviewRegistration;
  player: OverviewPlayer;
  leaders: OverviewLeader[];
  /** Chamber presiding/majority officers; empty when no chamber seats any. */
  chamberOfficers: OverviewChamberOfficer[];
  /** Null when no political overview is seeded (non-playable countries). */
  approval: OverviewApproval | null;
  /** Null when no political overview is seeded (non-playable countries). */
  regime: OverviewRegime | null;
  /** Null when no political overview is seeded (non-playable countries). */
  legitimacy: number | null;
  /** Null when no political overview is seeded (non-playable countries). */
  unrest: number | null;
  legislature: OverviewLegislature;
  elections: OverviewElections;
  /** Null means no parliamentary government: not applicable, not a gap. */
  government: OverviewGovernment | null;
  nationalAxes: NationalAxes;
  economy: OverviewEconomy;
  economicModel: OverviewEconomicModel | null;
  budget: OverviewBudget | null;
  sovereignDebt: OverviewSovereignDebt | null;
  corporations: OverviewCorporation[];
  laws: OverviewLaws;
  latestNews: string[];
  counts: OverviewCounts;
  /** Every unbacked multiplayer category. Empty only if none are missing. */
  unavailable: MissingRecord[];
}
