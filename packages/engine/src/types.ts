import type { RngState } from "./rng.js";

/**
 * The entire game world is one serializable document. No database: the world
 * lives in memory while playing and round-trips losslessly through save files.
 *
 * Systems ported from mainline A House Divided (Egg3901/AHDGame) become pure
 * functions over this document, one turn phase at a time. Keep every field
 * JSON-safe: no Date, Map, Set, class instances, or undefined-vs-missing
 * ambiguity in persisted state.
 */

export interface WorldState {
  meta: WorldMeta;
  countries: Record<string, Country>;
  /** The human player. Solo has exactly one; everyone else is an NPC. */
  player: PlayerCharacter;
  /** Append-only feed of notable events, newest last. Trimmed by maintenance. */
  news: NewsItem[];
  /** Parties seeded from mainline party seeds. Keyed by party id. */
  parties: Record<string, Party>;
  /** Legislatures seeded from mainline country configs. Keyed by country id. */
  legislatures: Record<string, Legislature>;
  /** Politicians holding legislature seats. Populated at world creation. */
  politicians: Politician[];
  /** Party charters (charter lifecycle). Ports src/lib/db/types/partyCharter.ts. */
  charters: PartyCharter[];
  /** Caucuses (faction sub-groups). Ports src/lib/db/types/caucus.ts. */
  caucuses: Caucus[];
  /**
   * Commodity market state. One entry per CommodityType.
   * Ports src/lib/db/types/commodityPrice.ts (global side only).
   * Per-state and per-country price maps are PORT-STUB until state scope lands.
   */
  commodityPrices: Record<string, CommodityState>;
  /** Extraction contracts. Ports src/lib/db/types/extractionContract.ts. */
  extractionContracts: ExtractionContract[];
}

export interface Politician {
  /** Deterministic id sequential per country, e.g. "US-1" */
  id: string;
  name: string;
  gender: "male" | "female";
  countryId: string;
  partyId: string;
  /** Chamber key this politician holds (e.g. "house", "volkskammer") */
  chamberKey: string;
  ideology: PoliticianIdeology;
  age: number;
  /**
   * Accumulated party influence (per-politician).
   * Ports Character.partyInfluence (src/lib/turn/partyInfluenceTurn.ts).
   * Seeded 0; updated by partyInfluenceTurn each turn.
   */
  partyInfluence: number;
  /**
   * Per-turn bonus actions granted by influence share.
   * Ports the bonus-actions side effect of partyInfluenceTurn.
   * PORT-STUB: Solo has no action economy yet; stored as a counter.
   */
  bonusActions: number;
}

export interface PoliticianIdeology {
  economic: number;
  social: number;
}

export interface WorldMeta {
  /** Bump on any breaking WorldState shape change; save loader checks it. */
  schemaVersion: number;
  seed: string;
  rng: RngState;
  /** Completed turns. 0 = freshly created world. */
  turn: number;
  /** In-game date as ISO day, e.g. "1953-01-06". One turn = one week. */
  date: string;
  era: EraId;
  cheatsUsed: boolean;
}

/**
 * Era id sourced from seed packs, not a hardcoded union.
 * Historical values include "1953", "1960", "1968", "1976";
 * new eras come from shipped packs.
 */
export type EraId = string;

export interface Country {
  id: string;
  name: string;
  /** Playable countries have full political depth; others are macro-only. */
  playable: boolean;
  economy: CountryEconomy;
}

export interface CountryEconomy {
  /** Nominal GDP in millions of in-game dollars. */
  gdp: number;
  /** Annualized rates as fractions, e.g. 0.031 = 3.1%. */
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  /** Output gap level (percent) — cyclical deviation of output from potential. */
  outputGap: number;
}

export interface PlayerCharacter {
  name: string;
  countryId: string;
  cash: number;
}

export interface NewsItem {
  turn: number;
  date: string;
  headline: string;
}

/**
 * Political party. Ports mainline's PoliticalParty ideological axis:
 * economicPosition and socialPosition on -5..+5 (left/libertarian negative,
 * right/authoritarian positive) as authored in src/lib/seeds/*Parties.ts and
 * src/lib/seeds/reference/politicalParties.ts. No new axis invented.
 *
 * Organization, tier, treasury, and member-count fields port
 * src/lib/turn/partyOrg, src/lib/parties/partyTier, and
 * src/lib/politicalStrength/strengthConstants. See per-field citations.
 */
export interface Party {
  /** Party id — the abbreviation uppercased (e.g. "DEM", "LAB", "CPSU", "SED"). */
  id: string;
  name: string;
  countryId: string;
  abbreviation: string;
  color: string;
  /** Economic left (-5) to right (+5). */
  economicPosition: number;
  /** Social libertarian (-5) to authoritarian (+5). */
  socialPosition: number;
  /**
   * Treasury in local currency units. Seeded from
   * src/lib/seeds/reference/politicalParties.ts and per-country
   * *Parties.ts (e.g. 1_000_000 for US/UK majors, 2_000_000 for RU CPSU,
   * 220k-1_000_000 for DD bloc). Neutral default 1_000_000 where seed not
   * in content pack (pack carries no treasury; world.ts seeds from a
   * looked-up table).
   */
  treasury: number;
  /**
   * Political Strength reserve (renamed from actionPool).
   * Seeded 0 per all PartySeed definitions
   * (src/lib/seeds/reference/politicalParties.ts). Gains via
   * partyActionGeneration passive + treasury-driven investment (see
   * src/lib/politicalStrength/strengthConstants.ts).
   */
  politicalStrength: number;
  /**
   * Single national organization level 0-100.
   * PORT-STUB: mainline stores per-state `StatePartyOrg.organization`
   * per state (src/lib/turn/partyOrg/turnProcessing.ts). Solo collapses
   * to one national value; decay semantics mirror mainline
   * ORG_DECAY_RATE / MIN_PRESENCE_ORG.
   */
  organization: number;
  /**
   * Major/Minor tier driving PS cap.
   * Seeded via MAJOR_DEFAULT_PARTIES logic (src/lib/seeds/defaultPartyTiers.ts):
   * e.g. 1953 majors US DEM/REP, UK LAB/CON, RU CPSU, DD SED.
   */
  tier: "major" | "minor";
  /** Regions earned for Minor cap hysteresis (Tiers 20%/10%). PORT-STUB empty until regional org lands. */
  psCapEarnedRegions: string[];
  /** Active Major→Minor demotion warning countdown. */
  majorDemotionWarning?: { startedTurn: number };
  /**
   * Denormalized member count — politicians + (future) NPP population.
   * PORT-STUB: mainline counts characters + active NPPs
   * (src/lib/turn/partyOrg/reconcileMemberCounts.ts); Solo counts
   * politicians (seat-holders) until NPP population exists.
   */
  memberCount: number;
  /** True for seeded default parties; custom parties are non-default. */
  isDefault: boolean;
}

/**
 * Minimal party charter for the charter lifecycle.
 * Ports src/lib/db/types/partyCharter.ts PartyCharterStatus + expiry
 * fields needed by expireCharters (src/lib/turn/charters/expireCharters.ts).
 */
export type CharterStatus =
  | "draft"
  | "pending-signatures"
  | "ratified"
  | "founder-replacement"
  | "rejected"
  | "expired"
  | "migrated"
  | "migrated-incomplete";

export interface PartyCharter {
  id: string;
  countryId: string;
  partyId: string | null;
  status: CharterStatus;
  /** Turn-based expiry for draft/pending. Null for ratified/migrated. */
  expiresOnTurn: number | null;
  /** Legacy date mirror. Null for ratified/migrated. */
  expiresAt: string | null;
  founderReplacementDeadlineTurn: number | null;
  founderReplacementDeadline: string | null;
}

/**
 * Minimal caucus for the tax pass.
 * Ports src/lib/db/types/caucus.ts Caucus fields read by
 * src/lib/turn/caucusTax.ts (taxRate, treasury, disbandedAt).
 */
export interface Caucus {
  id: string;
  countryId: string;
  partyId: string;
  name: string;
  treasury: number;
  taxRate: number;
  disbandedAt: string | null;
  memberIds: string[];
}

/**
 * Legislature for a country. Chambers are derived from mainline
 * COUNTRY_CONFIGS and ERA_COUNTRY_CONFIG_OVERRIDES (src/lib/constants/countries.ts).
 * The `elected` flag mirrors mainline's ChamberConfig.elected (false means appointed).
 */
export interface Legislature {
  countryId: string;
  name: string;
  bicameral: boolean;
  chambers: Chamber[];
}

export interface Chamber {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  /** True for elected chambers; false for appointed (e.g. UK Lords, DD Staatsrat, DE Bundesrat). */
  elected: boolean;
  description?: string;
  composition: ChamberComposition;
}

export interface ChamberComposition {
  /** Seats held per party, keyed by party id. Sum plus vacancies equals chamber seats. */
  seatsByParty: Record<string, number>;
  vacancies: number;
}

/**
 * Commodity market state (global side).
 * Ports src/lib/db/types/commodityPrice.ts CommodityPrice global fields.
 * State/country breakdowns are PORT-STUB (empty) until state scope lands.
 */
export interface CommodityState {
  /** Commodity type (key from COMMODITY_TYPES). */
  commodity: string;
  /** Base price (era-scaled, constant). Source: commodities.ts COMMODITY_BASE_PRICES + sectorSeedEra.ts. */
  basePrice: number;
  /** Current global market price (evolved per turn via drift toward market equilibrium). */
  globalPrice: number;
  /** Global supply in units/day (stub: seeded 0, evolved via RNG drift). */
  globalSupply: number;
  /** Global demand in units/day (stub: seeded 0, evolved via RNG drift). */
  globalDemand: number;
  /** Game turn when last updated. */
  turn: number;
}

/**
 * Extraction contract.
 * Ports src/lib/db/types/extractionContract.ts ExtractionContract.
 * Counterparty corporationId is PORT-STUB (null) where corporations not yet ported;
 * settlement treats null as a stubbed counterparty that always pays (no treasury move).
 */
export interface ExtractionContract {
  id: string;
  stateId: string;
  countryId: string;
  /** Extractable resource (oil, coal, iron, natural_gas, timber, rare_earth). */
  resource: string;
  /** Fraction of state capacity reserved (0-1). */
  share: number;
  /** Per-turn royalty rate (fraction of contracted capacity market value). */
  royaltyRatePerTurn: number;
  /** Lifecycle status. */
  status: "offered" | "active" | "expired" | "defaulted" | "revoked";
  /** Granted turn. */
  grantedTurn: number;
  /** Grant level. */
  grantedByLevel: "national" | "state";
  /** Turn offer expires (offered only). */
  offerExpiresTurn?: number;
  /** Turn contract expires (term). */
  expiresTurn?: number;
  /** Consecutive missed payments. */
  missedPayments: number;
  /** Last turn a settlement outcome was recorded (idempotency). */
  lastSettlementTurn: number | null;
  /**
   * Counterparty corporation id.
   * PORT-STUB: corporations not yet ported, so null means a stubbed counterparty.
   * Settlement skips treasury movement for stubbed counterparties but still
   * computes royalties and advances lifecycle.
   */
  corporationId: string | null;
}
