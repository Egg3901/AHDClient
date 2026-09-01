/**
 * Corporation core types — W9.
 *
 * Scope note (see FRAMEWORK.md determinism doctrine + docs/ROADMAP-1.0.md
 * Lane 2): this ports mainline's corporation TURN math (growth, margin,
 * costs, tax, NPC management, insolvency) at "market system off" defaults
 * (mainline's own default — see file docs in constants.ts). Share price,
 * stock exchange, IPO, order flow, M&A, subsidiaries, groups, tech tree,
 * bonds, and banking are separate future waves (W10/W12/W13/W14) and are
 * not modeled here.
 *
 * Simplification (cited, not invented): mainline's `Corporation` and
 * `CorporateSector` are separate collections (one corp owns many sectors).
 * W9 seeds exactly one single-sector NPC corporation per (playable country,
 * sector type) pair with nonzero 1953 weight, so `Corporation` here collapses
 * the two into one record. This sidesteps mainline's corp-level aggregation
 * machinery (overhead ceilings across sectors, consolidated-loss-offset tax
 * apportionment, sectorCalculations.ts:549-699) which only matters once a
 * corp can own more than one sector — deferred to a future wave alongside
 * multi-sector ownership / player-run corporations.
 *
 * Source: /root/projects/AHDGame/src/lib/db/types/corporation.ts (Corporation
 * lines 144-589, CorporateSector lines 622-1264) — fields kept are the subset
 * relevant to production/revenue/costs/NPC-management; market/M&A/subsidiary/
 * tech/governance fields are omitted (see constants.ts file doc for the full
 * cited scope list).
 */

/**
 * The 17 mainline industry sector types.
 * Source: /root/projects/AHDGame/src/lib/constants/corporations.ts:17-34
 * CORPORATION_TYPES (verbatim order).
 */
export const CORPORATION_TYPES = [
  "financial",
  "media",
  "manufacturing",
  "chemical_industries",
  "healthcare",
  "retail",
  "automobiles",
  "technology",
  "energy",
  "agriculture",
  "real_estate",
  "construction",
  "defense",
  "telecommunications",
  "entertainment",
  "logistics",
  "extraction",
] as const;

export type CorporationType = (typeof CORPORATION_TYPES)[number];

/**
 * CEO behavior archetype, derived deterministically from personality.
 * Source: /root/projects/AHDGame/src/lib/npp/ceoArchetype.ts CeoArchetype.
 */
export type CeoArchetype = "aggressive" | "cautious" | "innovator" | "costCutter";

/**
 * NPC CEO personality sliders driving archetype derivation.
 * Source: src/lib/db/types/npp.ts NPPPersonality (loyalty omitted: reserved
 * for the political-influence system per ceoArchetype.ts file doc; only
 * ambition/stubbornness feed the corporate archetype).
 */
export interface CorpCeoPersonality {
  ambition: number;
  stubbornness: number;
}

/**
 * One NPC corporation. Every W9-seeded corp is single-sector and NPC-run
 * (ceoType "npp" in mainline terms — there is no player-corporation surface
 * yet; that is a later UI wave, U3).
 */
export interface Corporation {
  id: string;
  countryId: string;
  sectorType: CorporationType;
  personality: CorpCeoPersonality;
  archetype: CeoArchetype;
  /** Per-turn revenue (local currency, absolute units). */
  revenue: number;
  /** CEO-set target annual growth rate (%), source sectorGrowthPolicy.ts brakedTargetRate. */
  targetGrowthRate: number;
  /** Current annual growth rate (%), trends toward target. */
  currentGrowthRate: number;
  /** Last turn's growth investment cost, used for next turn's affordability brake. */
  currentGrowthCost: number;
  /** CEO-set base margin (%). Source: corporations.ts DEFAULT_PROFIT_MARGIN. */
  profitMargin: number;
  /** Margin after the soft cap (no modifier stack in W9 — see constants.ts). */
  effectiveProfitMargin: number;
  /** Accumulated cash. */
  liquidCapital: number;
  /** Founding revenue (annualized) — used as the dissolution/reincorporation anchor. */
  foundingRevenue: number;
  foundedAtTurn: number;
  /** Turn persistent insolvency began; null when solvent. */
  insolventSinceTurn: number | null;
  /** How many times this corp id has been reincorporated after insolvency. */
  reincorporationCount: number;
}

/**
 * Per-country aggregate corporate revenue snapshot, feeding the macro growth
 * signal (macroCountryTurn.ts). `current`/`previous` are one-turn-apart totals
 * across every corp in the country, maintained entirely by corporationTurn
 * (see corporationTurn.ts file doc for the ordering rationale: corporationTurn
 * runs at the END of the phase list, so macroCountryTurn of turn N reads the
 * snapshot corporationTurn wrote during turn N-1).
 */
export interface CorpRevenueSnapshot {
  current: number;
  previous: number;
  turn: number;
}
