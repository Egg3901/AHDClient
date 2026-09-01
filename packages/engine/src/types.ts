import type { RngState } from "./rng.js";
import type { Bill, Committee, EnactedLaw } from "./legislation/types.js";
import type { CountryBudget, RegionalBudget } from "./budget/types.js";
import type { CentralBank } from "./centralBank/types.js";
import type { Corporation, CorpRevenueSnapshot } from "./corporation/types.js";
import type { GovernmentState } from "./government/types.js";
import type { ExecutiveState } from "./executive/types.js";
import type { ImpeachmentCase } from "./impeachment/types.js";

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
  /** Live election records (W21c). Maintained by the election phases. */
  elections: import("./elections/types.js").ElectionRecord[];
  /**
   * Presidential (and other head-of-state) executive offices, keyed by
   * country id. W24 port. Vacant (absent key, or presidentId null) until a
   * "president"-type election first resolves — Rotunda's content packs carry
   * no authored incumbent seed (mainline itself has the same gap on several
   * worlds per the 1953-preset audit), so a fresh world starts with no sitting
   * president, exactly like a chamber with no pre-seeded winner.
   */
  executives: Record<string, ExecutiveState>;
  /** Open and resolved presidential impeachment cases (W24 port, US only). */
  impeachments: ImpeachmentCase[];
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
  /** Regions per playable country. W38: US 48 real states (AK/HI absent); UK/RU/DD retain 3 opaque each until W39. */
  regions: Record<string, Region>;
  /** Per-region per-party org/reg. Key `${regionId}:${partyId}`. Ports StatePartyOrg. */
  partyRegions: Record<string, PartyRegion>;
  /** Per-region non-party registration buckets. Key regionId. Ports StateRegistrationPool. */
  electoratePools: Record<string, ElectoratePool>;
  /** Per-region turnout modifiers. Key regionId. Ports StateDemographicTurnout. */
  regionTurnouts: Record<string, RegionTurnout>;
  /** Per-party per-region PS pressure. Key `${partyId}:${regionId}`. Ports PartyStrengthPressure. */
  partyPressures: Record<string, PartyPressure>;
  /** Candidate support mood per politician. Key candidate id. Ports ElectionCandidate support fields. */
  candidateSupports: Record<string, CandidateSupport>;
  /**
   * Player and politician endorsements.
   * Ports PlayerEndorsement + NPPEndorsement (src/lib/db/types PlayerEndorsement,
   * src/lib/nppEndorsements.ts). Active rows grant support/favorability effects;
   * party switches sweep misaligned primary-phase endorsements per
   * src/lib/elections/playerEndorsements.ts withdrawPlayerEndorsementsOnPartyChange
   * and sweepPartyMismatchedPlayerEndorsements.
   */
  endorsements: Endorsement[];
  /** Legislation: bills, committees, enacted laws. Ports src/lib/db/types/legislation + billLifecycle. Schema v12. */
  bills: Bill[];
  committees: Committee[];
  enactedLaws: EnactedLaw[];
  /** Regional bills (stateBills) per src/lib/db/types/stateBill. Schema v12 stateBillTimers. */
  stateBills: Bill[];
  /** State demographics per region for tally. Ports src/lib/db/types/demographics.ts StateDemographics. Schema v14. */
  stateDemographics: Record<string, import("./demographics/stateDemographics.js").StateDemographics>;
  /** Baseline demographics (seeded, never mutated) for decay-to-baseline. Schema v14. */
  baselineDemographics: Record<string, import("./demographics/stateDemographics.js").StateDemographics>;
  /** Demographic categories per country. Ports src/lib/db/types/demographics.ts DemographicCategory. Schema v14. */
  demographicCategories: Record<string, import("./demographics/categories.js").DemographicCategory[]>;
  /** Census reapportionment state. Ports src/lib/turn/census.ts GameState.lastCensusYear/lastCensus. Schema v14. */
  census: { lastCensusYear?: number; lastCensus?: { year: number; deltas: import("./demographics/census.js").SeatDelta[] } };
  /** Per-region labor force headcount (civilian). Computed from workingAge + conscription + participation. Schema v14. */
  laborForces: Record<string, number>;
  /** National budgets per country (fiscal system). Ports FederalBudget shape. Schema v15. */
  budgets: Record<string, CountryBudget>;
  /** Regional budgets per region (generic; JP/DE variants deferred). Schema v15. */
  regionalBudgets: Record<string, RegionalBudget>;
  /**
   * NPC relationship state (W37). Ports NPPRelationship (src/lib/db/types/npp.ts)
   * relationshipScore per politician↔third-party pair. Key `${sourceId}:${targetId}`
   * (e.g. "US-1:US-2" for politician-to-politician, "player:US-1" for player
   * interactions). Score in [-100,100]; decays toward 0 per turn.
   * Source: src/lib/turn/partyOrg/caucusRelationshipMaintenance.ts
   */
  nppRelationships: Record<string, NppRelationship>;
  /**
   * Per-politician last NPP bill sponsorship turn, for cooldown tracking.
   * Key politician id. Source: src/lib/turn/npp/billSponsorship.ts
   * NPP_SPONSOR_TYPE_REPEAT_COOLDOWN_TURNS throttling.
   */
  nppSponsorLastTurn: Record<string, number>;
  /**
   * Central banks, one per playable country (US/UK/RU/DD). Ports src/lib/db/types/centralBank.ts
   * CentralBank (subset — see centralBank/types.ts file doc for what's cut and why). Schema v17.
   */
  centralBanks: Record<string, CentralBank>;
  /**
   * NPC corporations, one national corp per (playable country, nonzero-weight
   * 1953 sector) pair. Ports mainline's Corporation+CorporateSector (merged,
   * single-sector — see corporation/types.ts file doc). Schema v19.
   */
  corporations: Record<string, Corporation>;
  /**
   * Per-country aggregate corporate revenue, one turn apart, feeding the
   * macroCountryTurn growth signal. Maintained by corporationTurn.ts. Schema v19.
   */
  corpRevenueSnapshots: Record<string, CorpRevenueSnapshot>;
  /**
   * Per-candidate campaign state for campaign-eligible elections (W26).
   * Ports src/lib/db/types/campaign.ts Campaign, restricted to the live
   * branch-tree ("Strategic Operations v2") model — mainline's legacy
   * linear-level fields exist only for pre-migration Mongo rows, which have
   * no solo equivalent (every solo world is created fresh), so they are not
   * ported. Keyed by `${electionId}:${candidateId}` (see campaigns/lifecycle.ts
   * campaignKey). Created on candidate entry, archived on election resolution
   * or withdrawal. Only exists for elections where isCampaignEligibleElection
   * is true (ports src/lib/campaigns/isCampaignEligible.ts): US house/senate
   * this wave (president/governor/stateSenate absent from solo's election
   * types; UK/RU/DD non-presidential campaign finance never enabled in
   * mainline either).
   */
  campaigns: Record<string, Campaign>;
  /** Intra-party elections (W20). Ports statePartyElections, nationalPartyElections, nationalCommitteeElections. Schema v21. */
  statePartyElections: import("./intraparty/types.js").StatePartyElectionRecord[];
  nationalPartyElections: import("./intraparty/types.js").NationalPartyElectionRecord[];
  nationalCommitteeElections: import("./intraparty/types.js").NationalCommitteeElectionRecord[];
  /** Coalitions (W20). Ports src/lib/coalitions + src/lib/turn/coalitionDisbandCheck.ts. Schema v21. */
  coalitions: import("./intraparty/types.js").CoalitionRecord[];
  /**
   * Parliamentary government-formation state (W23), one entry per country in
   * government/constants.ts GOVERNMENT_CHAMBER_BY_COUNTRY (UK/RU/DD). Ports
   * mainline's `governmentFormations` collection (src/lib/db/types/
   * governmentFormation.ts GovernmentFormation, `_id` = countryId).
   * Maintained by government/phases.ts. Schema v22.
   */
  governments: Record<string, GovernmentState>;
  /**
   * Cabinet (W29). Ports cabinetMembers + cabinetNominations
   * (src/lib/db/types/cabinet.ts, src/lib/cabinetNominationLifecycle.ts,
   *  src/lib/cabinetTransition.ts). Two systems: US (presidential Senate
   *  confirmation via nppCabinetVote) and UK/others (parliamentary direct
   *  appointment). NPCs fill all seats; player may be nominated per
   *  mainline eligibility (no invented shortcuts). Schema v25.
   */
  cabinetMembers: import("./cabinet/types.js").CabinetMember[];
  cabinetNominations: import("./cabinet/types.js").CabinetNomination[];
  /**
   * SCOTUS (W29). Ports supremeCourtSeats + scotusNominations + docketCases
   * (src/lib/db/types/scotus.ts, src/lib/turn/scotusTurn.ts and its
   * sub-phases). Seats are politician-like records; vacancies filled via
   * presidential nomination + Senate confirmation. Schema v25.
   */
  supremeCourtSeats: import("./judiciary/types.js").SupremeCourtSeat[];
  scotusNominations: import("./judiciary/types.js").ScotusNomination[];
  docketCases: import("./judiciary/types.js").DocketCase[];
  /**
   * UK judicial review surprise cases (W29). Ports
   * src/lib/turn/ukJrSurpriseTurn.ts + src/lib/uk/judicialReview.
   * Small per-turn hazard producing a ruling from proxy court lean. Schema v25.
   */
  ukJudicialReviewCases: import("./judiciary/types.js").UkJudicialReviewCase[];
  /**
   * W31 events cluster: world events + player random events + crises.
   * Ports src/lib/events/worldEvents/definitions.ts WORLD_EVENT_SEED_DEFINITIONS
   * (20 kinds), src/lib/events/worldEvents/scheduler.ts windowGapTurns cadence,
   * src/lib/events/pree/seedDefinitions.ts PREE events (12), src/lib/crises/templates.ts
   * (8 crisis templates), src/lib/turn/crisisTurn.ts tickDecayFactor lifecycle,
   * and src/lib/events/substrate/countryModifiers.ts modifiers.
   * Schema v27 (main v25; v26 reserved for parallel wave — see save.ts resolver note).
   * All randomness via WorldRng; news items use mainline headline copy verbatim.
   */
  worldEventLedger: Record<string, Record<string, number>>;
  activeWorldModifiers: WorldModifier[];
  crises: CrisisRecord[];
  playerEventLog: PlayerEventLogEntry[];
}

/**
 * One lever's Strategic Operations v2 branch-tree state.
 * Ports CampaignOpsTree (src/lib/db/types/campaign.ts): a boolean starter
 * unlock plus three independently-levelled branches (a/b/c), each 0..
 * OPS_MAX_BRANCH_LEVEL (see campaigns/upgradeCosts.ts).
 */
export interface CampaignOpsTree {
  starter: boolean;
  a: number;
  b: number;
  c: number;
}

/**
 * Per-candidate campaign (W26). Ports src/lib/db/types/campaign.ts Campaign,
 * trimmed to the fields the ported turn loop and tally integration need:
 * treasury (funds/actions), the four ops-lever trees, and per-turn spend
 * accounting. Cut vs mainline: managerId (no Campaign Manager NPC-hire UI
 * this wave), donationLog/activityHistory/fogOfWar (UI-facing history, no
 * consumer in solo), oppositionTargetId (opposition-research targeting is
 * PORT-STUB — see campaigns/opsEffects.ts), campaignStrength (player
 * contribution mechanic — PORT-STUB, see campaigns/README note in
 * campaigns/lifecycle.ts).
 */
export interface Campaign {
  /** `${electionId}:${candidateId}` — see campaigns/lifecycle.ts campaignKey. */
  id: string;
  electionId: string;
  /** "player" or a politician id. */
  candidateId: string;
  candidateIsNPP: boolean;
  partyId: string;
  countryId: string;
  /** Election.electionType at creation — drives the family scalar (upgradeCosts.ts). */
  electionType: string;
  status: "active" | "archived";
  /** Local currency (campaignCurrency.ts — decoupled from live forex). */
  funds: number;
  /** Campaign's own action pool, separate from the candidate's politician/player actions. */
  actions: number;
  fundraisingTree: CampaignOpsTree;
  oppositionResearchTree: CampaignOpsTree;
  groundGameTree: CampaignOpsTree;
  mediaSpendingTree: CampaignOpsTree;
  /**
   * Per-turn spend accumulator (local currency) — the swing-flow money
   * driver's input (electionEngine/fundsByParty.ts, tallyAdapter.ts).
   * Ports Campaign.spendThisTurn. Reset each turn by campaigns/phases.ts
   * campaignSpendResetPhase; accrued by campaignTurnPhase (maintenance) and
   * campaignNpcInvestmentPhase (upgrade purchases).
   */
  spendThisTurn: number;
  totalFundsGenerated: number;
  totalFundsSpent: number;
  totalActionsGenerated: number;
  totalActionsSpent: number;
  createdAtTurn: number;
}

export interface Politician {
  /** Deterministic id sequential per country, e.g. "US-1" */
  id: string;
  name: string;
  gender: "male" | "female";
  countryId: string;
  partyId: string;
  /** Chamber key this politician holds (e.g. "house", "volkskammer"); "" = unseated. */
  chamberKey: string;
  /** US state whose seat is held (house/senate). */
  electedState?: string | undefined;
  /** US senate class of the held seat. */
  senateClass?: 1 | 2 | 3 | undefined;
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
   * Now consumed by actionRefresh into `actions`.
   */
  bonusActions: number;
  /**
   * Action points available this turn.
   * Ports Character.actions per src/lib/turn/actionRefresh.ts:
   * base 4 per turn, office bonus, hoard penalty 4 over 100, cap 200.
   * Cited as mainline-neutral values; energy-scaled caps (200-250, 100-125)
   * are PORT-STUB at neutral (energy 1) since solo has no stat system.
   */
  actions: number;
  /** Campaign funds (local currency) for this politician. Port of Character.funds/campaign. */
  funds: number;
  /** Donor base level 0-75 driving fundGeneration and fundraise yield. */
  donorBaseLevel: number;
  /** State political influence 0-100 for fund generation and campaign actions. */
  politicalInfluence: number;
  /** Favorability 0-100 (for advertise costs). */
  favorability: number;
  /** Infamy 0-100 (for decay during actionRefresh). */
  infamy: number;
  /** Action cooldowns: actionId -> turn when next available. */
  actionCooldowns: Record<string, number>;
  /**
   * Personality traits steering NPP action AI (W37).
   * Ports NPPPersonality (src/lib/db/types/npp.ts, src/lib/npp/actionAi.ts).
   * Deterministic per-politician via rng at creation (uniform 0-100).
   * Source: src/lib/npp/actionAi.ts actionTemperature, applySignalScaling.
   */
  personality: PoliticianPersonality;
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

export interface PurgeRejoinBlock {
  partyId: string;
  countryId: string;
  purgedAtTurn: number;
}

export interface PlayerCharacter {
  name: string;
  countryId: string;
  cash: number;
  /**
   * Action points mirroring mainline Character.actions refresh cadence.
   * Cites src/lib/turn/actionRefresh.ts MIN_BASE_ACTIONS_PER_TURN=4,
   * ACTION_HOARD_PENALTY=4, threshold 100, cap 200 at PORT-STUB neutral.
   */
  actions: number;
  /** Campaign funds (local) for player. */
  funds: number;
  donorBaseLevel: number;
  politicalInfluence: number;
  favorability: number;
  infamy: number;
  /** Action cooldowns: actionId -> turn when next available. */
  actionCooldowns: Record<string, number>;
  /**
   * Party membership. Ports Character.party ("independent" sentinel in mainline).
   * Null = independent (no party). Non-null = sequentialId string matching
   * PoliticalParty.id. Cites src/lib/db/types/character.ts Character.party
   * and src/app/api/country/[code]/parties/[id]/join+leave routes.
   * Solo stores as nullable rather than "independent" sentinel for type safety.
   */
  partyId: string | null;
  /**
   * Turn when the player joined their current party. Null when independent.
   * Ports Character.partyJoinedTurn (src/lib/db/types/character.ts) for the
   * leadership tenure gate (src/lib/parties/leadershipTenure.ts) and the
   * 24h switch cooldown (src/lib/parties/antiAbuseGuards.ts PARTY_SWITCH_COOLDOWN_MS).
   * Solo tracks as turn count (24 turns = 24h at 1 turn/hour) rather than Date.
   */
  partyJoinedTurn: number | null;
  /**
   * Turn of the last party switch (join/leave/found). Survives independent
   * stint so leave->rejoin hop does not dodge cooldown. Ports
   * Character.lastPartySwitchAt (Date) as turn count; same 24-turn window.
   */
  lastPartySwitchTurn: number | null;
  /**
   * Per-party rejoin blocks from purges. Ports Character.purgeRejoinBlocks
   * (src/lib/db/types/character.ts) with PURGE_REJOIN_COOLDOWN_TURNS = 24
   * (src/lib/constants/partyActions.ts).
   */
  purgeRejoinBlocks: PurgeRejoinBlock[];
  /**
   * Caucus this player is currently affiliated with. Null = unaffiliated.
   * Ports Character.factionId (src/lib/db/types/character.ts) denormalized
   * cache of single active CaucusMembership. At most one active caucus at a time.
   */
  caucusId: string | null;
  /**
   * Legislative seat held by the player, if any. Ports ElectedOfficial
   * membership: player has no seat in career mode until elected, gating
   * bill sponsorship per src/lib/congress/billProposal.ts seat check.
   * Null means no seat. When set, chamberKey identifies the held chamber.
   */
  legislativeSeat: { chamberKey: string; countryId: string } | null;
  /**
   * Mode (career vs head of state). Career (default): player is a politician;
   * HoS: player is government. HoS mode later grants government sponsorship as
   * noted in the brief; this field gates sponsorship bypass per mode rule.
   */
  mode: "career" | "hos";
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
  /**
   * Priority region cluster (W19). Ports PoliticalParty.priorityRegion.
   * Opaque region ids; evicted by priorityRegionDecay when org drops to 0.
   * W38 will migrate to real state ids.
   */
  priorityRegion?: PartyPriorityRegion;
  /**
   * Intra-party leadership (W20). Ports PoliticalParty chair/viceChair/treasurer +
   * committeeIds per src/lib/db/types/party.ts and statePartyOrg national layer.
   * Custom election duration mirrors customElectionDurationTurns used by
   * createMissingNational/Committee elections (168-420).
   */
  chairId?: string | null;
  viceChairId?: string | null;
  treasurerId?: string | null;
  committeeIds?: string[];
  customElectionDurationTurns?: number;
  leadershipElectionMethod?: "party" | "influence" | "committee";
  coalitionId?: string | null;
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

/**
 * State/region for party-support modeling. W19 used 3 opaque regions per
 * playable country (US/UK/RU/DD = 12 total). W38 replaces US opaque ids with
 * real 48 state ids (AK/HI absent until statehood, per mainline's 1950 Census
 * apportionment; see packages/content/src/packs/usStates1953.ts). UK/RU/DD
 * retain opaque ids until W39 per docs/support/W19_BRIDGE.md.
 *
 * Mainline source: State collection (src/lib/db/types/state.ts) per-state rows
 * and StatePartyOrg per (state,party) rows. Solo collapses to this flat map.
 *
 * For US states, the region doubles as the state row: additional state metadata
 * (population, houseSeats, senateSeats, senateClasses, region, gdp, registration)
 * is available via the content pack's StateSeed, keyed by the same id.
 * House districts stay counts-per-state (district geometry not needed per
 * election model); Senate classes drive election timing later.
 */
export interface Region {
  id: string;
  countryId: string;
  name: string;
  /** Optional enriched state metadata for US states (W38+). Mirrors StateSeed fields. */
  population?: number;
  houseSeats?: number;
  senateSeats?: number;
  senateClasses?: [1 | 2 | 3, 1 | 2 | 3];
  /** Census region (Northeast/Southeast/Midwest/Southwest/West). Only for US states. */
  censusRegion?: string;
  /** Nominal GSP in millions USD (estimated 1953). Only for US states. */
  gdp?: number;
  /** Voting-eligible population (derived from demographics). */
  votingEligiblePopulation?: number;
  /** Working-age population (derived from demographics). */
  workingAgePopulation?: number;
  /** Military service population (conscription withdrawal). */
  militaryServicePopulation?: number;
}

/**
 * Per-region per-party organization and registration.
 * Ports StatePartyOrg organization/registration pair
 * (src/lib/db/types/statePartyOrg.ts, src/lib/turn/partyOrg/regDriftDecay.ts).
 * Solo keys by `${regionId}:${partyId}` in WorldState.partyRegions.
 * W20 adds per-state leadership chairId/viceChairId/treasurerId per StatePartyOrg.
 */
export interface PartyRegion {
  regionId: string;
  partyId: string;
  countryId: string;
  organization: number;
  registration: number;
  chairId?: string | null;
  viceChairId?: string | null;
  treasurerId?: string | null;
  campaignerId?: string | null;
}

/**
 * Per-region non-party registration buckets.
 * Ports StateRegistrationPool (src/lib/db/types/stateRegistrationPool.ts).
 * Solo keys by regionId in WorldState.electoratePools.
 */
export interface ElectoratePool {
  regionId: string;
  countryId: string;
  independent: number;
  unregistered: number;
}

/**
 * Per-region turnout modifiers.
 * Ports StateDemographicTurnout (src/lib/db/types/stateDemographicTurnout.ts).
 * Solo keys by regionId. Modifiers are DemographicModifiers as in mainline:
 * Record<category, Record<group, number>> clamped to [-20, +20].
 */
export interface RegionTurnout {
  regionId: string;
  countryId: string;
  modifiers: Record<string, Record<string, number>>;
  lastDecayAppliedTurn: number;
}

/**
 * Per-region per-party PS pressure.
 * Ports PartyStrengthPressure (src/lib/db/types/partyStrengthPressure.ts).
 * Solo keys by `${partyId}:${regionId}` in WorldState.partyPressures.
 */
export interface PartyPressure {
  partyId: string;
  regionId: string;
  countryId: string;
  value: number;
}

/**
 * Candidate support (short-term mood) with queued accruals.
 * Ports ElectionCandidate.support + supportAccrual
 * (src/lib/db/types/election.ts, src/lib/turn/elections/supportDecay.ts,
 *  src/lib/turn/elections/supportAccrual.ts).
 * Solo keys by candidate id (politician id) in WorldState.candidateSupports.
 */
export interface CandidateSupport {
  id: string;
  partyId: string;
  countryId: string;
  regionId?: string;
  /** Election grouping, optional until elections land. */
  electionId?: string;
  support: number;
  supportAccrual: Array<{ amountPerTurn: number; turnsRemaining: number }>;
  status: "active" | "withdrawn";
}

/**
 * Party priority region cluster (per-party per-country prioritized region ids).
 * Ports PoliticalParty.priorityRegion (src/lib/db/types/politicalParties.ts,
 * src/lib/turn/politicalStrength/priorityRegionDecay.ts).
 * Solo stores on Party.priorityRegion; ids are opaque region ids until W38.
 */
export interface PartyPriorityRegion {
  regionIds: string[];
  setAtTurn: number;
}

/**
 * Endorsement record.
 * Ports PlayerEndorsement (src/lib/db/types) + NPPEndorsement support bump:
 * - endorserId: "player" or politician id
 * - endorsedId: partyId or politician id
 * - active rows contribute SUPPORT_ENDORSEMENT_BUMP = 3 (src/lib/electionEngine/electionFormulaFactors.ts)
 *   to candidateSupports[endorsedId].support when endorsedType="politician"
 *   and to favorability when needed.
 * Sweep behavior: withdrawPlayerEndorsementsOnPartyChange and sweep
 * handle cross-party primary misaligned endorsements.
 */
export interface Endorsement {
  id: string;
  /** "player" or politician id */
  endorserId: string;
  /** Endorsed party id or politician id */
  endorsedId: string;
  endorsedType: "party" | "politician";
  countryId: string;
  /** Turn when created */
  turn: number;
  /** Active flag; withdrawn rows stay for history */
  active: boolean;
  /** Support bump contributed while active (3 per SUPPORT_ENDORSEMENT_BUMP) */
  supportBump: number;
  /** Party of endorsed target at creation (for sweep diff) */
  endorsedPartyId: string | null;
  /** Party of endorser at creation (for sweep diff) */
  endorserPartyId: string | null;
}

export interface PoliticianPersonality {
  /** Loyalty 0-100: high donates to party, low hoards */
  loyalty: number;
  /** Ambition 0-100: high builds donor base and campaigns */
  ambition: number;
  /** Stubbornness 0-100: high resists stance drift, low drifts fast */
  stubbornness: number;
}

export interface NppRelationship {
  /** Score in [-100, 100]; decays toward 0 */
  score: number;
  updatedAtTurn: number;
}

export interface WorldModifier {
  countryId: string;
  kind: string;
  sectorType?: string;
  pct: number;
  expiresAtTurn: number;
}

export interface CrisisRecord {
  id: string;
  kind: string;
  name: string;
  description: string;
  scope: "country" | "global";
  countryIds: string[];
  startTurn: number;
  durationTurns: number | null;
  effects: Array<{ type: string; value: number; effectType: "flat" | "tick" | "decay" }>;
  status: "active" | "resolved";
  endTurn?: number;
  wireMessageOnStart: string;
  wireMessageOnEnd: string;
  playerResponse?: string | null;
}

export interface PlayerEventLogEntry {
  turn: number;
  kind: string;
  headline: string;
}
