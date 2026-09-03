/**
 * Union world entity — W15.
 *
 * Ports mainline's Union shape (src/lib/db/types/union.ts) collapsed to the
 * subset W15's turn actually reads/writes. See dues.ts file doc for the
 * field-level mapping and what is PORT-STUB.
 *
 * One union per (countryId, sectorType) for every playable country's
 * nonzero-weight 1953 sector, same granularity as Corporation (see
 * corporation/types.ts file doc for the single-sector collapse rationale).
 * Keyed by `${countryId}-${sectorType}` (mirrors Union._id = country+sector).
 *
 * Source: src/lib/db/types/union.ts Union + src/lib/db/types/corporation.ts
 * CORPORATION_TYPES ordering.
 */
import type { CorporationType } from "../corporation/types.js";

export type UnionServiceId = "strikeFund" | "healthFund" | "legalAid" | "training";

/**
 * Persisted union. JSON-safe, no ObjectId/Date/Map.
 * Mirrors mainline Union fields that unionsTurn and nppUnionBehavior touch;
 * strength/ownerId/ownerType are PORT-STUB deferred until player-vs-NPP
 * leadership contest lands (mainline src/lib/unions/unionEconomy.ts strength
 * decay + src/lib/turn/unions/nppUnionBehavior.ts election). Treating the
 * union as always NPC-led for W15 keeps membership/dues real while leaving
 * the contest wiring to a later wave.
 */
export interface Union {
  /** `${countryId}-${sectorType}`. Unique, deterministic. */
  id: string;
  countryId: string;
  sectorType: CorporationType;
  /** Display name. Seeded from unionNames.ts historical table where authored, else generic. */
  name: string;
  /** Spendable balance (home-currency units, absolute). Trickles via duesIncome/services. */
  treasury: number;
  /** 0-100 membership approval of the bargain. Dues push down, services push up. */
  approval: number;
  /** Annual dues per member, home-currency units. Set by head; clamped to 10% of wage. */
  duesPerWorkerAnnual: number;
  /** Active service programmes, paid per turn out of treasury. */
  activeServices: UnionServiceId[];
  /** Share of free cash flow (0-0.5) sent to organizers as political contributions. */
  politicalContributionPct: number;
  /**
   * Worker-weighted unionization across represented sectors, 0-100.
   * In mainline this is CorporateSector.unionization per sector; AHDClient
   * collapses to one density per union (the worktree has no per-sector
   * unionization table yet — see phases.ts membership bridge).
   */
  unionization: number;
  /**
   * Union ban suspension (player suggestion #93). True while the union's
   * country has a union-banning law enacted. Suspended unions are frozen:
   * processUnionsTurn skips dues/services/approval for them.
   * PORT-STUB until legislation/unionLawProvision lands; kept so the field
   * round-trips through saves.
   */
  suspended?: boolean;
  /** Whether this union is NPC-led (mainline ownerType "npp") or vacant. W15 NPP behavior fills this. */
  ownerType?: "npp" | null;
  /** Politician id of the NPP leader, or null if vacant. */
  ownerId?: string | null;
  createdAtTurn: number;
  updatedAtTurn: number;
}

/**
 * Totally invented sector helpers would break determinism tests; reuse the
 * same TURNS_PER_YEAR/TURNS_PER_DAY constants mainline uses (see dues.ts).
 */
export const UNION_DEFAULT_TREASURY = 500;
export const UNION_DEFAULT_APPROVAL = 55;
export const UNION_DEFAULT_DUES = 0;
export const UNION_DEFAULT_UNIONIZATION = 25;
/** W15 seeds all services OFF; players/NPPs toggle them via future actions. */
export const UNION_DEFAULT_SERVICES: UnionServiceId[] = [];
export const UNION_DEFAULT_POLITICAL_PCT = 0;
