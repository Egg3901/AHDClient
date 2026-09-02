/**
 * Legislation types for solo Rotunda.
 * Ports mainline Bill shape + legislation stages faithfully, simplified for
 * single-process determinism (turn-based timers, not Date).
 */

export type BillStatus =
  | "proposed"
  | "active"
  | "active_other"
  | "active_both"
  | "enrolled"
  | "vetoed"
  | "veto_override"
  | "override_failed"
  | "signed"
  | "failed"
  | "withdrawn";

export type BillChamber = string;

export interface BillVoteRecord {
  for: number;
  against: number;
  abstain: number;
  votes: Record<string, "for" | "against" | "abstain">;
}

/**
 * Core bill document. Mirrors mainline Bill fields needed by lifecycle:
 * sponsor, chamber routing, stage timers (turns), vote maps, cloture.
 */
export interface Bill {
  id: string;
  title: string;
  summary: string;
  countryId: string;
  category: string;
  legislationTypeId?: string;
  effectDirection?: number;
  /** Tax bills: the target rate (%) the sponsor selected from the catalog's taxPolicy ladder. Schema v41. */
  selectedRate?: number;
  provisions: BillProvision[];
  originChamber: BillChamber;
  currentChamber: BillChamber;
  status: BillStatus;
  sponsorId: string | null;
  sponsorName: string;
  sponsorPartyId: string | null;
  adminProposed?: boolean;
  nppSponsored?: boolean;
  // Vote maps per chamber phase
  votes: Record<string, "for" | "against" | "abstain">;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  otherChamberVotes?: Record<string, "for" | "against" | "abstain">;
  otherChamberVotesFor?: number;
  otherChamberVotesAgainst?: number;
  otherChamberVotesAbstain?: number;
  vetoOverrideVotes?: Record<string, "for" | "against">;
  vetoOverrideVotesFor?: number;
  vetoOverrideVotesAgainst?: number;
  // Timers (turn-based)
  proposedAtTurn: number;
  votingEndsOnTurn?: number;
  otherChamberVotingEndsOnTurn?: number;
  presidentActionDeadlineOnTurn?: number;
  overrideVotingEndsOnTurn?: number;
  // Cloture / filibuster
  filibusterInvocations: Array<{ characterId: string; characterName: string; invokedAtTurn: number }>;
  preFilibusterStatus?: "active" | "active_other";
  // Committee assignment (depth billLifecycle requires)
  committeeId?: string | null;
  committeeReferralTurn?: number;
  // Snapshots (frozen tally for display)
  voteSnapshot?: BillVoteRecord | null;
  otherChamberVoteSnapshot?: BillVoteRecord | null;
  overrideDisplaySnapshot?: { for: number; against: number; seats: number } | null;
  enactedAtTurn?: number;
  failedAtTurn?: number;
  updatedAtTurn: number;
  // Effect tracking
  enactedLevel?: number;
  repealedAtTurn?: number;
  expiresAtTurn?: number | null;
}

export type BillProvisionType =
  | "policy"
  | "taxRate"
  | "economy"
  | "partySupport"
  | "tariff"
  | "subsidy"
  | "nationalize"
  | "privatize"
  // W28: currency union accession. Source: src/lib/billEnactment.ts
  // applyEuroAdoptionProvision "euro_adoption" provision type, generalized —
  // see finance/currencyUnion.ts file doc.
  | "currency_union";

export interface BillProvision {
  type: BillProvisionType;
  legislationTypeId: string;
  policyOptionId?: string;
  effectDirection: number;
  economic?: number;
  social?: number;
  proposedRate?: number;
  /** Target union id for type "currency_union". Source: finance/currencyUnion.ts. */
  currencyUnionId?: string;
  // For economy/partySupport provisions, carry delta payload via catalog
}

/**
 * Committee model to the depth billLifecycle requires.
 * In mainline committees are not yet gating bill flow (wiki: not live),
 * but assignments exist. Solo mirrors that: committees hold members and
 * bills may be referred, but lifecycle does not block on committee vote.
 */
export interface Committee {
  id: string;
  countryId: string;
  chamberKey: string;
  name: string;
  /** Member politician ids (subset of chamber) */
  memberIds: string[];
  /** Chair politician id */
  chairId: string | null;
  /** Jurisdiction categories this committee covers */
  jurisdiction: string[];
  createdAtTurn: number;
}

/**
 * Enacted law record: tracks which catalog entry is currently law, level, and
 * when it was enacted/repealed. Supports repeal/expiry model.
 */
export interface EnactedLaw {
  id: string; // catalog id
  countryId: string;
  billId: string;
  enactedAtTurn: number;
  level: number;
  repealedAtTurn?: number;
  expiresAtTurn?: number | null;
  scope: "national" | "regional";
  regionId?: string;
}

// Bill lifecycle config per legislature
export interface LegislatureBillConfig {
  countryId: string;
  chambers: Array<{ key: string; elected: boolean; seats: number }>;
  bicameral: boolean;
}
