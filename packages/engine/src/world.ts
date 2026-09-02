import { rngFromSeed } from "./rng.js";
import { assignUsSeatGeography } from "./elections/seatGeography.js";
import type { WorldState } from "./types.js";
import { getPackByEra, PACKS_BY_DATE } from "@rotunda/content";
import { createPoliticiansForWorld } from "./politician.js";
import { CATEGORIES_BY_COUNTRY_1953 } from "./demographics/categories.js";
import { US_STATE_DEMOGRAPHICS_1953 } from "./demographics/usStateDemographics1953.js";
import { UK_DEMOGRAPHICS_1953 } from "./demographics/ukDemographics1953.js";
import { RU_DEMOGRAPHICS_1953 } from "./demographics/ruDemographics1953.js";
import { DD_DEMOGRAPHICS_1953 } from "./demographics/ddDemographics1953.js";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  getEraCommodityBasePrice,
} from "./commodity/constants.js";
import { CENTRAL_BANK_COUNTRY_ANCHORS, CHAIR_TERM_TURNS } from "./centralBank/constants.js";
import type { CentralBank } from "./centralBank/types.js";
import { seedCorporations } from "./corporation/founding.js";
import { seedNpcBanks } from "./banking/npcBanks.js";
import { seedUnions } from "./unions/founding.js";
import { seedExchangeRates } from "./forex/founding.js";
import { MARKETIZATION_SCHEDULE, scheduledMarketizationLevel, NPP_DEFAULT_BUDGET_SOFTNESS, NPP_DEFAULT_INTERNAL_REPRESSION, NPP_DEFAULT_REFORMISM } from "./commandEconomy/constants.js";
import type { CommandEconomyState } from "./commandEconomy/types.js";
import { seedCapitalStock } from "./economy/capitalStock.js";
import type { UnownedSectorState } from "./economy/types.js";

// v29: W30 governors (governors/governorAddresses/governorOrders). This wave
// was pre-allocated v29 back when main was v27; the W12 banking wave landed
// v28 first, and mainline's own v28->v29 chain slot was left as a deliberate
// no-op stub reserved for this wave (see save.ts comment history + resolver
// note) while unions/bonds/forex/metric-engine chained on top as v30-v33.
// Reconciliation filled that reserved v29 stub with the real governor
// migration in place - no renumbering. v34 (W7+W8+W14 command economy/trade/
// capital stock) landed on top after that, unaffected by the governor fill
// (no field-name collision - confirmed in save.ts v33->v34 migration). This
// second W30 reconciliation pass (bringing the branch from v33 up through
// v34) introduces no new WorldState fields of its own - governor state was
// already complete at the v29 slot - so the top of chain stays v34, no new
// migration block appended.
import { emptyWorldHistory } from "./history/types.js";

// Pre-allocated v38 for W41 WorldHistory. Main (this worktree) is v33 as of
// this wave's branch point; parallel waves hold v29, v35, v36, and v37 (each
// still stubs here — see save.ts). This migration jumps from latest known
// (v33) straight to v38, inserting v34->v35->v36->v37 as reserved stubs
// along the way so the chain stays strictly ascending with no gaps. RESOLVER
// NOTE: on merge, replace each stub whose version number a landed wave
// actually claims with that wave's real migration block, verify strict
// ascending order (v33 -> v34 -> v35 -> v36 -> v37 -> v38), and confirm no
// other wave introduces a field named `history` (W41 is authoritative for
// that name — see types.ts WorldState.history file doc).
import { NUCLEAR_CAPABLE } from "./coldWar/nuclear.js";
import { TENSION_BASELINE } from "./coldWar/constants.js";
import type { ColdWarTensionState, NuclearProgramState } from "./coldWar/types.js";
import type { AlignmentRecord, AlignmentPoleId } from "./alignment/types.js";
import { normalizeShares } from "./alignment/alignment.js";
import { seedInternationalOrgs } from "./internationalOrgs/seed.js";

// Pre-allocated v37 for the W28 (enactment depth) + W32 (cold war / world
// politics) batch. Main is v33 as of this wave's branch point; parallel
// waves hold v29 (already merged, earlier in the chain), v35 and v36
// (in-flight elsewhere, not yet on this branch). This wave writes a single
// migration block jumping latest (33) -> 37 directly (save.ts), since v34-36
// do not exist on THIS branch's history — a merge resolver reconciling with
// the v35/v36 waves will need to split that block into a proper
// v33->v34->35->36->37 chain depending on merge order, same pattern as every
// prior multi-wave resolver note in save.ts (see v16->v17, v27->v28, etc.).
export const SCHEMA_VERSION = 38;

/** Treasury overrides per party id where mainline diverges from the 1M default. */
const TREASURY_BY_PARTY: Record<string, number> = {
  // Source: src/lib/seeds/ru/ruParties.ts
  RU_CPSU: 2_000_000,
  // Source: src/lib/seeds/dd/ddParties.ts
  DD_SED: 1_000_000,
  DD_CDU: 300_000,
  DD_LDPD: 250_000,
  DD_NDPD: 220_000,
  DD_DBD: 250_000,
};

const DEFAULT_TREASURY = 1_000_000; // Source: src/lib/seeds/reference/politicalParties.ts

/**
 * PROVISIONAL — flagged for user review (see seedCentralBanks
 * externalBroadMoney seeding). Share of nominal GDP seeded into the W12
 * household money pool at world creation.
 */
export const EXTERNAL_BROAD_MONEY_GDP_SHARE = 0.02;

/** Major defaults for 1953 preset per src/lib/seeds/defaultPartyTiers.ts MAJOR_DEFAULT_PARTIES. */
function isMajor1953(partyId: string): boolean {
  // US DEM/REP, UK LAB/CON, RU CPSU, DD SED are majors in 1953-default.
  return (
    partyId === "US_DEM" ||
    partyId === "US_REP" ||
    partyId === "UK_LAB" ||
    partyId === "UK_CON" ||
    partyId === "RU_CPSU" ||
    partyId === "DD_SED"
  );
}

export interface EraInfo {
  id: string;
  label: string;
  startDate: string;
}

export interface PlayableCountryInfo {
  id: string;
  name: string;
}

export interface CountryEconomyOverride {
  gdp?: number;
  growthRate?: number;
  inflationRate?: number;
  unemploymentRate?: number;
}

export interface WorldOverrides {
  playerCash?: number;
  countries?: Record<string, CountryEconomyOverride>;
}

export interface NewWorldOptions {
  seed: string;
  playerName: string;
  countryId: string;
  /**
   * Era id from listEras(). Required per contract; optional at the type
   * level only for backward compat with the pre-pack desktop shell which
   * calls newGame without an era. When omitted, defaults to the earliest
   * shipped era ("1953").
   */
  era?: string;
  overrides?: WorldOverrides;
}

export function listEras(): EraInfo[] {
  return PACKS_BY_DATE.map((p) => ({
    id: p.era.id,
    label: p.era.label,
    startDate: p.era.startDate,
  }));
}

export function listPlayableCountries(era: string): PlayableCountryInfo[] {
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);
  return pack.countries.filter((c) => c.playable).map((c) => ({ id: c.id, name: c.name }));
}

export function listCountries(era: string): { id: string; name: string; playable: boolean; economy: WorldState["countries"][string]["economy"] }[] {
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);
  return pack.countries.map((c) => ({
    id: c.id,
    name: c.name,
    playable: c.playable,
    economy: { ...c.economy, outputGap: 0 },
  }));
}

export function createWorld(options: NewWorldOptions): WorldState {
  const era = options.era ?? PACKS_BY_DATE[0]!.era.id;
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);

  const countries: WorldState["countries"] = {};
  for (const c of pack.countries) {
    countries[c.id] = {
      id: c.id,
      name: c.name,
      playable: c.playable,
      economy: { ...c.economy, outputGap: 0 },
    };
  }

  const country = countries[options.countryId];
  if (!country) {
    throw new Error(`Unknown country: ${options.countryId} for era ${era}`);
  }
  if (!country.playable) {
    throw new Error(`Country ${options.countryId} is not playable in era ${era}`);
  }

  // Validate and apply overrides after pack load, before politician generation.
  // Validation: finite numbers, gdp > 0, fractional rates within same bounds validatePack uses.
  // Unknown country id throws.
  let playerCashOverride: number | undefined;
  if (options.overrides !== undefined) {
    const overrides = options.overrides;
    if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
      throw new Error("Invalid overrides: must be an object");
    }
    if (overrides.playerCash !== undefined) {
      if (!Number.isFinite(overrides.playerCash)) {
        throw new Error(`Invalid overrides.playerCash: must be a finite number, got ${String(overrides.playerCash)}`);
      }
      playerCashOverride = overrides.playerCash;
    }
    if (overrides.countries !== undefined) {
      if (overrides.countries === null || typeof overrides.countries !== "object" || Array.isArray(overrides.countries)) {
        throw new Error("Invalid overrides.countries: must be an object");
      }
      for (const [cid, economyOverride] of Object.entries(overrides.countries)) {
        if (!countries[cid]) {
          throw new Error(`Unknown country: ${cid}`);
        }
        if (economyOverride === null || typeof economyOverride !== "object" || Array.isArray(economyOverride)) {
          throw new Error(`Invalid overrides.countries["${cid}"]: must be an object`);
        }
        const eo = economyOverride as Record<string, unknown>;
        if (eo["gdp"] !== undefined) {
          const v = eo["gdp"] as number;
          if (!Number.isFinite(v) || v <= 0) {
            throw new Error(`Invalid overrides.countries["${cid}"].gdp: must be a finite number > 0, got ${String(v)}`);
          }
        }
        if (eo["growthRate"] !== undefined) {
          const v = eo["growthRate"] as number;
          if (!Number.isFinite(v)) {
            throw new Error(`Invalid overrides.countries["${cid}"].growthRate: must be a finite number, got ${String(v)}`);
          }
        }
        if (eo["inflationRate"] !== undefined) {
          const v = eo["inflationRate"] as number;
          if (!Number.isFinite(v)) {
            throw new Error(`Invalid overrides.countries["${cid}"].inflationRate: must be a finite number, got ${String(v)}`);
          }
        }
        if (eo["unemploymentRate"] !== undefined) {
          const v = eo["unemploymentRate"] as number;
          if (!Number.isFinite(v) || v < 0 || v > 1) {
            throw new Error(`Invalid overrides.countries["${cid}"].unemploymentRate: must be a finite number in [0,1], got ${String(v)}`);
          }
        }
      }
      // Apply after validation
      for (const [cid, economyOverride] of Object.entries(overrides.countries)) {
        const c = countries[cid]!;
        const eo = economyOverride as CountryEconomyOverride;
        if (eo.gdp !== undefined) c.economy.gdp = eo.gdp;
        if (eo.growthRate !== undefined) c.economy.growthRate = eo.growthRate;
        if (eo.inflationRate !== undefined) c.economy.inflationRate = eo.inflationRate;
        if (eo.unemploymentRate !== undefined) c.economy.unemploymentRate = eo.unemploymentRate;
      }
    }
  }

  const rng = rngFromSeed(options.seed);

  const parties: WorldState["parties"] = {};
  for (const p of pack.parties ?? []) {
    parties[p.id] = {
      ...p,
      treasury: TREASURY_BY_PARTY[p.id] ?? DEFAULT_TREASURY,
      politicalStrength: 0,
      organization: 0,
      tier: isMajor1953(p.id) ? "major" : "minor",
      psCapEarnedRegions: [],
      memberCount: 0,
      isDefault: true,
      chairId: null,
      viceChairId: null,
      treasurerId: null,
      committeeIds: [],
    };
  }

  const legislatures: WorldState["legislatures"] = {};
  for (const leg of pack.legislatures ?? []) {
    legislatures[leg.countryId] = {
      countryId: leg.countryId,
      name: leg.name,
      bicameral: leg.bicameral,
      chambers: leg.chambers.map((c) => {
        const chamber: WorldState["legislatures"][string]["chambers"][number] = {
          key: c.key,
          name: c.name,
          shortName: c.shortName,
          seats: c.seats,
          elected: c.elected,
          composition: { seatsByParty: { ...c.composition.seatsByParty }, vacancies: c.composition.vacancies },
        };
        if (c.description !== undefined) chamber.description = c.description;
        return chamber;
      }),
    };
  }

  // Populate politicians for elected chambers of playable countries.
  // Uses the same world rng, in deterministic order, so identical options
  // give identical casts. Capture rng state AFTER generation so save/load
  // resumes the sequence correctly.
  const playableIds = new Set(pack.countries.filter((c) => c.playable).map((c) => c.id));
  const politicians = createPoliticiansForWorld(rng, {
    legislatures,
    parties,
    playableCountryIds: playableIds,
    era: pack.era.id,
  });

  // Reconcile memberCount from politicians (NPC-only; PORT-STUB mainline also counts NPPs).
  for (const pol of politicians) {
    const party = parties[pol.partyId];
    if (party) party.memberCount++;
  }

  const commodityPrices: WorldState["commodityPrices"] = {};
  for (const commodity of COMMODITY_TYPES) {
    const basePrice = getEraCommodityBasePrice(
      COMMODITY_BASE_PRICES[commodity as keyof typeof COMMODITY_BASE_PRICES],
      pack.era.id,
    );
    commodityPrices[commodity] = {
      commodity,
      basePrice,
      globalPrice: basePrice,
      globalSupply: 0,
      globalDemand: 0,
      turn: 0,
    };
  }
  // W6: commodity price history for annualized commodity pressure (inflationRecalc)
  const commodityPriceHistory: WorldState["commodityPriceHistory"] = {};
  for (const commodity of COMMODITY_TYPES) {
    const basePrice = getEraCommodityBasePrice(
      COMMODITY_BASE_PRICES[commodity as keyof typeof COMMODITY_BASE_PRICES],
      pack.era.id,
    );
    commodityPriceHistory[commodity] = [{ turn: 0, price: basePrice }];
  }

  const { regions, electoratePools, regionTurnouts, partyRegions, partyPressures, candidateSupports } =
    seedSupport(pack, parties, politicians);

  // Seed committees to the depth billLifecycle requires (not live gating)
  const bills: WorldState["bills"] = [];
  const committees: WorldState["committees"] = [];
  for (const countryId of playableIds) {
    const leg = legislatures[countryId];
    if (!leg) continue;
    // Create committees via legislation/committees helper (import lazily to avoid cycle)
    // Inline seeding to avoid import at top-level: simple 2 per elected chamber
    for (const chamber of leg.chambers) {
      if (!chamber.elected) continue;
      const members = politicians.filter((p) => p.countryId === countryId && p.chamberKey === chamber.key).map((p) => p.id);
      if (members.length === 0) continue;
      const chair = members[0] ?? null;
      committees.push({
        id: `com-${countryId}-${chamber.key}-finance`,
        countryId,
        chamberKey: chamber.key,
        name: `${chamber.name} Finance`,
        memberIds: members.slice(0, Math.ceil(members.length / 2)),
        chairId: chair,
        jurisdiction: ["economy", "infrastructure"],
        createdAtTurn: 0,
      });
      committees.push({
        id: `com-${countryId}-${chamber.key}-judiciary`,
        countryId,
        chamberKey: chamber.key,
        name: `${chamber.name} Judiciary`,
        memberIds: members.slice(Math.ceil(members.length / 2)),
        chairId: chair,
        jurisdiction: ["governance", "order"],
        createdAtTurn: 0,
      });
    }
  }

  // ── Demographics (W16) ──────────────────────────────────────────
  const { demographicCategories, stateDemographics, baselineDemographics, laborForces, census } =
    seedDemographics(pack, regions, worldSeedDate(pack.era.startDate));

  // ── Budgets (W2) ───────────────────────────────────────────
  const { budgets, regionalBudgets } = seedBudgets(pack, regions);

  // ── Central banks (W3) ────────────────────────────────────────
  const centralBanks = seedCentralBanks(countries);

  // ── Corporations (W9) ──────────────────────────────────────────
  // Uses the same world rng, after every other rng-consuming seed step, so
  // capturing rng.state() below for meta.rng includes corp personality draws.
  const corporations = seedCorporations(
    Object.values(countries).map((c) => ({ id: c.id, playable: c.playable, gdp: c.economy.gdp, growthRate: c.economy.growthRate })),
    rng,
    0,
  );
  const corpRevenueSnapshots: WorldState["corpRevenueSnapshots"] = {};
  for (const corp of Object.values(corporations)) {
    const existing = corpRevenueSnapshots[corp.countryId];
    const total = (existing?.current ?? 0) + corp.revenue;
    corpRevenueSnapshots[corp.countryId] = { current: total, previous: total, turn: 0 };
  }

  const unions = seedUnions(
    Object.values(countries).map((c) => ({ id: c.id, playable: c.playable })),
    pack.era.id,
  );

  const exchangeRates = seedExchangeRates(
    Object.values(countries).map((c) => ({ id: c.id })),
    pack.era.id,
  );

  // ── Command economy (W7) ────────────────────────────────────────
  // One entry per country carrying a MARKETIZATION_SCHEDULE (RU/DD in the
  // 1953 pack). Seeded at the era-schedule level for the world's start year;
  // commandEconomyPhase drifts it every turn.
  const startYear = Number(pack.era.startDate.slice(0, 4));
  const commandEconomy: WorldState["commandEconomy"] = {};
  for (const countryId of Object.keys(MARKETIZATION_SCHEDULE)) {
    if (!countries[countryId]?.playable) continue;
    const state: CommandEconomyState = {
      countryId,
      marketizationLevel: scheduledMarketizationLevel(countryId, startYear),
      monetaryOverhang: 0,
      shortageIndex: 0,
      blackMarketPremium: 0,
      secondEconomyShare: 0,
      blackMarketPressureBase: 0,
      blackMarketPressureEffective: 0,
      governmentReformism: NPP_DEFAULT_REFORMISM,
      internalRepression: NPP_DEFAULT_INTERNAL_REPRESSION,
      budgetSoftness: NPP_DEFAULT_BUDGET_SOFTNESS,
    };
    commandEconomy[countryId] = state;
  }

  // ── Capital stock (W14) ─────────────────────────────────────────
  // Seed every region's Solow capital stock at CAPITAL_OUTPUT_RATIO_TARGET ×
  // its GDP (capitalStock.ts seedCapitalStock — same steady-state seed
  // mainline uses). capitalGrowth starts empty: macroCountryTurn.ts's gK read
  // falls back to 0 until advanceCapitalStockPhase runs at least once (same
  // cold-start shape as corpRevenueSnapshots).
  const capitalStock: WorldState["capitalStock"] = {};
  for (const [regionId, region] of Object.entries(regions)) {
    capitalStock[regionId] = seedCapitalStock(region.gdp ?? 0);
  }
  const capitalGrowth: WorldState["capitalGrowth"] = {};

  // ── Unowned sector pools (W14) ───────────────────────────────────
  // One pool per founded corp, seeded at parity with the corp's own founding
  // revenue (PROVISIONAL multiple — flagged for user review, same doctrine as
  // centralBank/types.ts externalBroadMoney: Rotunda has no per-state
  // corporate-sector market-size figure to seed the real headroom from, so
  // the pool starts sized to the corp that already exists in its sector).
  const unownedSectors: WorldState["unownedSectors"] = {};
  for (const corp of Object.values(corporations)) {
    const key = `${corp.countryId}:${corp.sectorType}`;
    const state: UnownedSectorState = {
      countryId: corp.countryId,
      sectorType: corp.sectorType,
      revenue: corp.foundingRevenue,
    };
    unownedSectors[key] = state;
  }

  // ── W32: nuclear programs, one per NUCLEAR_CAPABLE playable country ────
  // No production order is placed at seed (no defence-seat action/AI issues
  // one yet — see coldWar/nuclear.ts B11); nuclearProductionPhase is a no-op
  // until something sets productionRate > 0.
  const nuclearPrograms: Record<string, NuclearProgramState> = {};
  for (const countryId of NUCLEAR_CAPABLE) {
    if (!countries[countryId]?.playable) continue;
    nuclearPrograms[countryId] = { countryId, adopted: {}, warheads: 0, productionRate: 0 };
  }

  const coldWarTension: ColdWarTensionState = { value: TENSION_BASELINE, pressureFloor: TENSION_BASELINE, updatedTurn: 0, events: [] };

  // ── W32: alignment shares, playable countries only (B13: bipolar 1953
  // pack; non-playable countries carry no alignment record this wave). US/UK
  // seed 100% WEST, RU/DD 100% EAST — the historical bloc split at game
  // start, before any play/channel drift mechanic exists to move it (see
  // alignment/alignment.ts file doc, B14).
  const WEST_ALIGNED = new Set(["US", "UK"]);
  const EAST_ALIGNED = new Set(["RU", "DD"]);
  const alignments: Record<string, AlignmentRecord> = {};
  for (const countryId of Object.keys(countries)) {
    if (!countries[countryId]?.playable) continue;
    const pole: AlignmentPoleId | null = WEST_ALIGNED.has(countryId) ? "WEST" : EAST_ALIGNED.has(countryId) ? "EAST" : null;
    const raw: Partial<Record<AlignmentPoleId, number>> = pole ? { [pole]: 100 } : {};
    const shares = normalizeShares(raw, ["WEST", "EAST"]);
    alignments[countryId] = { countryId, shares: shares.shares, nonAligned: shares.nonAligned, updatedTurn: 0 };
  }

  const internationalOrgs = seedInternationalOrgs(Object.keys(countries));

  const world: WorldState = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      seed: options.seed,
      rng: rng.state(),
      turn: 0,
      date: pack.era.startDate,
      era: pack.era.id,
      cheatsUsed: false,
    },
    countries,
    parties,
    legislatures,
    politicians,
    elections: [],
    // W24: no authored incumbent seed exists in packages/content (see
    // types.ts WorldState.executives file doc) - every fresh world starts
    // with a vacant presidency, exactly like an un-elected chamber seat.
    executives: {},
    impeachments: [],
    charters: [],
    caucuses: [],
    endorsements: [],
    commodityPrices,
    extractionContracts: [],
    regions,
    partyRegions,
    electoratePools,
    regionTurnouts,
    partyPressures,
    candidateSupports,
    stateDemographics,
    baselineDemographics,
    demographicCategories,
    census,
    laborForces,
    budgets,
    regionalBudgets,
    nppRelationships: {},
    nppSponsorLastTurn: {},
    centralBanks,
    corporations,
    corpRevenueSnapshots,
    campaigns: {},
    statePartyElections: [],
    nationalPartyElections: [],
    nationalCommitteeElections: [],
    coalitions: [],
    // W23: parliamentary government state is lazily created by
    // government/phases.ts governmentFormationPhase on its first run per
    // country, not seeded here - mirrors how elections/orchestration.ts
    // lazily spawns the first ElectionRecord rather than world.ts hardcoding
    // one, so the formation logic has exactly one code path (no
    // seed-vs-runtime duplication) for both a fresh world and a country that
    // is created without a legislature this era.
    governments: {},
    cabinetMembers: [],
    cabinetNominations: [],
    supremeCourtSeats: [],
    scotusNominations: [],
    docketCases: [],
    ukJudicialReviewCases: [],
    worldEventLedger: {},
    activeWorldModifiers: [],
    crises: [],
    playerEventLog: [],
    // W30 governors: one record per US state, vacant until first governor
    // election resolves (mirrors executives vacuity - no authored incumbent seed
    // in packages/content). Seeded here with office AP capped so powers are
    // immediately usable once a holder seats.
    governors: seedGovernors(regions),
    governorAddresses: [],
    governorOrders: [],
    player: {
      name: options.playerName,
      countryId: options.countryId,
      cash: playerCashOverride !== undefined ? playerCashOverride : 10_000,
      actions: 25,
      funds: 0,
      donorBaseLevel: 0,
      politicalInfluence: 0,
      favorability: 50,
      infamy: 0,
      actionCooldowns: {},
      partyId: null,
      partyJoinedTurn: null,
      lastPartySwitchTurn: null,
      purgeRejoinBlocks: [],
      caucusId: null,
      legislativeSeat: null,
      mode: "career",
      savings: 0,
      savingsHolder: "centralBank",
    },
    bills,
    committees,
    enactedLaws: [],
    stateBills: [],
    news: [{ turn: 0, date: pack.era.startDate, headline: "A new game begins." }],
    bankLoans: [],
    depositInsurance: {},
    unions,
    bonds: {},
    exchangeRates,
    ledgerPreForexSnapshot: null,
    // W6 metric engine cluster
    nationalMetrics: {},
    economicModels: {},
    commodityPriceHistory,
    economicVitalSigns: null,
    vitalSignsHistory: [],
    commandEconomy,
    capitalStock,
    capitalGrowth,
    unownedSectors,
    history: emptyWorldHistory(),
    // W28
    policyLedger: {},
    ministerialOrders: [],
    enactmentGates: { debtCeilingCrisis: {} },
    currencyUnions: {},
    // W32
    coldWarTension,
    nuclearPrograms,
    conflicts: [],
    alignments,
    settlements: [],
    internationalOrgs,
  };
  assignUsSeatGeography(world);
  // W12: charter the financial-sector NPC corp of every playable country as
  // a retail bank. Mutates world.corporations in place, same post-
  // construction-mutation pattern as assignUsSeatGeography above.
  seedNpcBanks(world);
  return world;
}

/**
 * Seed support/electorate state.
 * W38: US 48 real states (AK/HI absent until statehood); W39: UK 12, RU 14, DD 6 replace opaque UK-R1..R3/RU-R1..R3/DD-R1..R3.
 * See docs/support/W19_BRIDGE.md for bridge plan and population-weighted split rationale.
 *
 * Registration/org seeding:
 * - US: per-state from pack.states[].registration (src/lib/seeds/registration/registrationLanes1953.ts lanes + per-state overrides)
 * - UK: per-region from pack.states[].registration derived from UK_REGION_POLLING_1951 via registrationLanes1953.ts buildUKSeeds1953 (org = max(3, round(voteShare*0.6)), reg = voteShare)
 * - RU: per-region from ruStatePartyOrgCalculations.ts RU_REGION_ORG_1953 (CPSU 91-98) via registrationLanes1953.ts buildRUSeeds1953
 * - DD: per-region from ddStatePartyOrgCalculations.ts DD_REGION_ORG_1953 via buildDDSeeds1953 (SED/CDU/LDPD/NDPD/DBD)
 * Turnout modifiers start at 0. House apportionment and Senate classes are carried on Region but not consumed by support phases.
 * Fallback: eras without a states table (e.g. 1960) retain 3 opaque per country as in W19.
 */
function seedSupport(
  pack: { countries: Array<{ id: string; playable: boolean }>; states?: Array<{ id: string; name: string; countryId: string; population: number; gdp: number; houseSeats: number; senateSeats: number; region: string; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; registration: { parties: Array<{ abbr: string; org: number; reg: number }>; independent: number; unregistered: number; unaffiliatedOrg: number } }> },
  parties: WorldState["parties"],
  politicians: WorldState["politicians"],
): {
  regions: WorldState["regions"];
  partyRegions: WorldState["partyRegions"];
  electoratePools: WorldState["electoratePools"];
  regionTurnouts: WorldState["regionTurnouts"];
  partyPressures: WorldState["partyPressures"];
  candidateSupports: WorldState["candidateSupports"];
} {
  const playable = pack.countries.filter((c) => c.playable).map((c) => c.id);
  const regions: WorldState["regions"] = {};
  const electoratePools: WorldState["electoratePools"] = {};
  const regionTurnouts: WorldState["regionTurnouts"] = {};
  const partyRegions: WorldState["partyRegions"] = {};
  const partyPressures: WorldState["partyPressures"] = {};

  const regionIdsByCountry = new Map<string, string[]>();

  // Generic per-playable-country handling: if pack has real states for that country, use them (W38 US, W39 UK/RU/DD); else fallback to 3 opaque (e.g. 1960 era)
  for (const countryId of playable) {
    const statesFor = (pack.states ?? []).filter((s) => s.countryId === countryId);
    if (statesFor.length > 0) {
      const ids: string[] = [];
      const sorted = [...statesFor].sort((a, b) => a.id.localeCompare(b.id));
      for (const st of sorted) {
        const rid = st.id;
        ids.push(rid);
        regions[rid] = {
          id: rid,
          countryId,
          name: st.name,
          population: st.population,
          houseSeats: st.houseSeats,
          senateSeats: st.senateSeats,
          senateClasses: st.senateClasses,
          censusRegion: st.region,
          gdp: st.gdp,
        };
      }
      regionIdsByCountry.set(countryId, ids);
      for (const st of sorted) {
        const rid = st.id;
        electoratePools[rid] = {
          regionId: rid,
          countryId,
          independent: st.registration.independent,
          unregistered: st.registration.unregistered,
        };
        regionTurnouts[rid] = {
          regionId: rid,
          countryId,
          modifiers: seedTurnoutModifiers(countryId),
          lastDecayAppliedTurn: 0,
        };
      }
      const countryParties = Object.values(parties).filter((p) => p.countryId === countryId);
      const abbrToPartyId = new Map<string, string>();
      for (const p of countryParties) abbrToPartyId.set(p.abbreviation, p.id);
      for (const st of sorted) {
        const rid = st.id;
        for (const entry of st.registration.parties) {
          const partyId = abbrToPartyId.get(entry.abbr);
          if (!partyId) continue;
          const party = parties[partyId];
          if (!party) continue;
          const key = `${rid}:${partyId}`;
          partyRegions[key] = {
            regionId: rid,
            partyId,
            countryId,
            organization: entry.org,
            registration: entry.reg,
          };
          const pkey = `${partyId}:${rid}`;
          partyPressures[pkey] = { partyId, regionId: rid, countryId, value: 0 };
        }
        for (const p of countryParties) {
          const key = `${rid}:${p.id}`;
          if (!partyRegions[key]) {
            partyRegions[key] = { regionId: rid, partyId: p.id, countryId, organization: 0, registration: 0 };
            const pkey = `${p.id}:${rid}`;
            if (!partyPressures[pkey]) partyPressures[pkey] = { partyId: p.id, regionId: rid, countryId, value: 0 };
          }
        }
      }
    } else {
      // Fallback: 3 opaque per country (pre-W39 saves or 1960 era which carries no states table)
      const ids: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const rid = `${countryId}-R${i}`;
        ids.push(rid);
        regions[rid] = { id: rid, countryId, name: `${countryId} Region ${i}` };
      }
      regionIdsByCountry.set(countryId, ids);
      for (const rid of ids) {
        electoratePools[rid] = seedPool(countryId, rid);
        regionTurnouts[rid] = { regionId: rid, countryId, modifiers: seedTurnoutModifiers(countryId), lastDecayAppliedTurn: 0 };
      }
      for (const party of Object.values(parties).filter((p) => p.countryId === countryId)) {
        for (const rid of ids) {
          const key = `${rid}:${party.id}`;
          const { organization, registration } = seedPartyRegion(party, rid);
          partyRegions[key] = { regionId: rid, partyId: party.id, countryId: party.countryId, organization, registration };
          const pkey = `${party.id}:${rid}`;
          partyPressures[pkey] = { partyId: party.id, regionId: rid, countryId: party.countryId, value: 0 };
        }
      }
    }
  }

  const candidateSupports: WorldState["candidateSupports"] = {};
  for (const pol of politicians) {
    candidateSupports[pol.id] = {
      id: pol.id,
      partyId: pol.partyId,
      countryId: pol.countryId,
      support: 50,
      supportAccrual: [],
      status: "active",
    };
  }

  return { regions, electoratePools, regionTurnouts, partyRegions, partyPressures, candidateSupports };
}

function seedPool(countryId: string, _regionId: string): WorldState["electoratePools"][string] {
  if (countryId === "US") {
    // Mix of leanD/competitive/southern override independent/unregistered
    // Southern region (R2) gets higher unregistered from disenfranchisement (MS-like 25)
    // Others use lane defaults 7-8.
    const isSouth = _regionId.endsWith("-R2");
    return { regionId: _regionId, countryId, independent: isSouth ? 3 : 8, unregistered: isSouth ? 22 : 7 };
  }
  if (countryId === "UK") return { regionId: _regionId, countryId, independent: 8, unregistered: 8 };
  if (countryId === "RU") return { regionId: _regionId, countryId, independent: 3, unregistered: 2 };
  if (countryId === "DD") return { regionId: _regionId, countryId, independent: 5, unregistered: 3 };
  return { regionId: _regionId, countryId, independent: 8, unregistered: 8 };
}

function seedTurnoutModifiers(countryId: string): Record<string, Record<string, number>> {
  // Single category voterGroups, groups per support/turnout.ts VOTER_GROUPS_BY_COUNTRY
  const groups: string[] =
    countryId === "US"
      ? ["urban_progressives", "rural_conservatives", "suburban_moderates"]
      : countryId === "UK"
        ? ["urban_progressives", "rural_traditionalists", "suburban_centrists"]
        : countryId === "RU"
          ? ["workers", "urban_progressives"]
          : countryId === "DD"
            ? ["workers", "bloc_centrists"]
            : ["general"];
  const mods: Record<string, number> = {};
  for (const g of groups) mods[g] = 0;
  return { voterGroups: mods };
}

function seedPartyRegion(party: { id: string; countryId: string }, regionId: string): { organization: number; registration: number } {
  const suffix = regionId.slice(-2); // -R1, -R2, -R3
  if (party.countryId === "US") {
    if (party.id === "US_DEM") {
      if (suffix === "R1") return { organization: 34, registration: 50 }; // leanD (MI/MN lane 1953)
      if (suffix === "R2") return { organization: 38, registration: 66 }; // southern strong-D (MS-like override)
      return { organization: 24, registration: 35 }; // leanR
    }
    if (party.id === "US_REP") {
      if (suffix === "R1") return { organization: 24, registration: 35 };
      if (suffix === "R2") return { organization: 8, registration: 6 };
      return { organization: 34, registration: 50 };
    }
  }
  if (party.countryId === "UK") {
    // PORT-STUB historical lean: LAB stronger in R1 (London/YHU-like 51), CON in R2 (SEE 58), R3 mixed
    // Values sourced as registrationShare-like lean from UK_REGION_POLLING_1951 averages
    if (party.id === "UK_LAB") {
      if (suffix === "R1") return { organization: 32, registration: 38 };
      if (suffix === "R2") return { organization: 24, registration: 30 };
      return { organization: 28, registration: 34 };
    }
    if (party.id === "UK_CON") {
      if (suffix === "R1") return { organization: 28, registration: 34 };
      if (suffix === "R2") return { organization: 36, registration: 42 };
      return { organization: 30, registration: 36 };
    }
    if (party.id === "UK_LIB") {
      return { organization: 8, registration: 5 };
    }
    return { organization: 2, registration: 1 }; // SNP/PC/SF: PORT-STUB minimal in 1953
  }
  if (party.countryId === "RU") {
    if (party.id === "RU_CPSU") return { organization: 96, registration: 92 };
    return { organization: 0, registration: 0 };
  }
  if (party.countryId === "DD") {
    if (party.id === "DD_SED") return { organization: 82, registration: 78 };
    if (party.id === "DD_CDU") return { organization: 22, registration: 18 };
    if (party.id === "DD_LDPD") return { organization: 18, registration: 15 };
    if (party.id === "DD_NDPD") return { organization: 18, registration: 15 };
    if (party.id === "DD_DBD") return { organization: 20, registration: 16 };
  }
  return { organization: 10, registration: 10 };
}

function worldSeedDate(startDate: string): string {
  return startDate;
}

function seedDemographics(
  pack: { era: { id: string } },
  regions: WorldState["regions"],
  _startDate: string,
): {
  demographicCategories: WorldState["demographicCategories"];
  stateDemographics: WorldState["stateDemographics"];
  baselineDemographics: WorldState["baselineDemographics"];
  laborForces: WorldState["laborForces"];
  census: WorldState["census"];
} {
  const demographicCategories: WorldState["demographicCategories"] = {};
  for (const [cid, list] of Object.entries(CATEGORIES_BY_COUNTRY_1953)) {
    demographicCategories[cid] = list.map((c) => ({ ...c, groups: c.groups.map((g) => ({ ...g })) }));
  }

  const stateDemographics: WorldState["stateDemographics"] = {};
  const baselineDemographics: WorldState["baselineDemographics"] = {};
  const laborForces: WorldState["laborForces"] = {};

  const is1953 = pack.era.id === "1953";
  const usSeeds: typeof US_STATE_DEMOGRAPHICS_1953 | null = is1953 ? US_STATE_DEMOGRAPHICS_1953 : null;
  const ukSeeds: typeof UK_DEMOGRAPHICS_1953 | null = is1953 ? UK_DEMOGRAPHICS_1953 : null;
  const ruSeeds: typeof RU_DEMOGRAPHICS_1953 | null = is1953 ? RU_DEMOGRAPHICS_1953 : null;
  const ddSeeds: typeof DD_DEMOGRAPHICS_1953 | null = is1953 ? DD_DEMOGRAPHICS_1953 : null;
  const usMap = new Map<string, (typeof US_STATE_DEMOGRAPHICS_1953)[number]>();
  if (usSeeds) for (const s of usSeeds) usMap.set(s.stateId, s);
  const ukMap = new Map<string, (typeof UK_DEMOGRAPHICS_1953)[number]>();
  if (ukSeeds) for (const s of ukSeeds) ukMap.set(s.stateId, s);
  const ruMap = new Map<string, (typeof RU_DEMOGRAPHICS_1953)[number]>();
  if (ruSeeds) for (const s of ruSeeds) ruMap.set(s.stateId, s);
  const ddMap = new Map<string, (typeof DD_DEMOGRAPHICS_1953)[number]>();
  if (ddSeeds) for (const s of ddSeeds) ddMap.set(s.stateId, s);

  const nowIso = `${_startDate}T00:00:00.000Z`;
  for (const [rid, region] of Object.entries(regions)) {
    const cid = region.countryId;
    const catsFor = (CATEGORIES_BY_COUNTRY_1953[cid] ?? []) as import("./demographics/categories.js").DemographicCategory[];
    let demo: import("./demographics/stateDemographics.js").StateDemographics | null = null;
    if (cid === "US" && usMap.has(rid)) {
      const seed = usMap.get(rid)!;
      const groups: Record<string, import("./demographics/stateDemographics.js").StateDemographicGroup> = {};
      for (const [gid, g] of Object.entries(seed.groups as Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }>)) {
        const gg = g as { population: number; economicLean: number; socialLean: number; turnout: number };
        groups[gid] = { population: gg.population, economicLean: gg.economicLean, socialLean: gg.socialLean, turnout: gg.turnout };
      }
      demo = {
        _id: rid,
        countryId: cid,
        categoryWeights: { ...seed.categoryWeights },
        groups,
        lastUpdated: nowIso,
      };
    } else if (cid === "UK" && ukMap.has(rid)) {
      const seed = ukMap.get(rid)!;
      const groups: Record<string, import("./demographics/stateDemographics.js").StateDemographicGroup> = {};
      for (const [gid, g] of Object.entries(seed.groups as Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }>)) {
        const gg = g as { population: number; economicLean: number; socialLean: number; turnout: number };
        groups[gid] = { population: gg.population, economicLean: gg.economicLean, socialLean: gg.socialLean, turnout: gg.turnout };
      }
      demo = { _id: rid, countryId: cid, categoryWeights: { ...seed.categoryWeights }, groups, lastUpdated: nowIso };
    } else if (cid === "RU" && ruMap.has(rid)) {
      const seed = ruMap.get(rid)!;
      const groups: Record<string, import("./demographics/stateDemographics.js").StateDemographicGroup> = {};
      for (const [gid, g] of Object.entries(seed.groups as Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }>)) {
        const gg = g as { population: number; economicLean: number; socialLean: number; turnout: number };
        groups[gid] = { population: gg.population, economicLean: gg.economicLean, socialLean: gg.socialLean, turnout: gg.turnout };
      }
      demo = { _id: rid, countryId: cid, categoryWeights: { ...seed.categoryWeights }, groups, lastUpdated: nowIso };
    } else if (cid === "DD" && ddMap.has(rid)) {
      const seed = ddMap.get(rid)!;
      const groups: Record<string, import("./demographics/stateDemographics.js").StateDemographicGroup> = {};
      for (const [gid, g] of Object.entries(seed.groups as Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }>)) {
        const gg = g as { population: number; economicLean: number; socialLean: number; turnout: number };
        groups[gid] = { population: gg.population, economicLean: gg.economicLean, socialLean: gg.socialLean, turnout: gg.turnout };
      }
      demo = { _id: rid, countryId: cid, categoryWeights: { ...seed.categoryWeights }, groups, lastUpdated: nowIso };
    } else {
      // Opaque or non-1953: uniform stub per category
      // Source: uniform split so tally has complete input; W39 replaces with real Layer 1 region tables
      const groups: Record<string, import("./demographics/stateDemographics.js").StateDemographicGroup> = {};
      for (const cat of catsFor) {
        const share = 100 / cat.groups.length;
        for (const g of cat.groups) {
          groups[g.id] = { population: Math.round(share * 100) / 100, economicLean: g.defaultEconomicLean, socialLean: g.defaultSocialLean, turnout: g.defaultTurnout ?? 50 };
        }
      }
      const total = Object.values(groups).reduce((s, v) => s + v.population, 0);
      const diff = Math.round((100 - total) * 100) / 100;
      if (Math.abs(diff) > 0.001) {
        const first = Object.keys(groups)[0];
        if (first) groups[first]!.population = Math.round((groups[first]!.population + diff) * 100) / 100;
      }
      const weights: Record<string, number> = {};
      for (const c of catsFor) weights[c._id] = c.defaultWeight;
      demo = { _id: rid, countryId: cid, categoryWeights: weights, groups, lastUpdated: nowIso };
    }
    if (demo) {
      stateDemographics[rid] = demo;
      // Baseline is a deep clone of the seeded demo (never mutated by effects except via decay)
      baselineDemographics[rid] = JSON.parse(JSON.stringify(demo)) as typeof demo;
      // Labor force: workingAge ~58% of population, no conscription, 62.5% participation
      const pop = region.population ?? 0;
      const workingAge = Math.round(pop * 0.58);
      const laborForce = Math.round(workingAge * 0.625);
      laborForces[rid] = laborForce;
      // Also stamp workingAge onto region for macro wiring
      (region as unknown as { workingAgePopulation?: number }).workingAgePopulation = workingAge;
      (region as unknown as { votingEligiblePopulation?: number }).votingEligiblePopulation = Math.round(pop * 0.70);
      (region as unknown as { militaryServicePopulation?: number }).militaryServicePopulation = 0;
    }
  }

  const census: WorldState["census"] = {};
  return { demographicCategories, stateDemographics, baselineDemographics, laborForces, census };
}

function seedBudgets(
  pack: { era: { id: string }; budgets?: Array<{
    countryId: string;
    fiscalYear: number;
    population: number;
    gdp: number;
    currencyCode: string;
    taxBaseRatios: { taxableIncome: number; corporateProfits: number; wagesAndSalaries: number; importValue: number; taxableSales: number };
    taxRates: { incomeTax: number; domesticCorporateTax: number; foreignCorporateTax: number; payrollTax: number; tariffs: number; salesTax: number };
    otherRevenue: number;
    debt: { principal: number; interestRate: number; ceiling: number };
    creditRating: string;
    baselineSpendingByCategory: Record<string, number>;
    baselineStateGrants: number;
    economicFactors: { gdpGrowth: number; wageGrowth: number; inflationRate: number; tradeGrowth: number };
  }> },
  regions: WorldState["regions"],
): { budgets: WorldState["budgets"]; regionalBudgets: WorldState["regionalBudgets"] } {
  const budgets: WorldState["budgets"] = {};
  const regionalBudgets: WorldState["regionalBudgets"] = {};

  // Build national budgets from pack.budgets (US/UK/RU/DD 1953). Each country's
  // taxBases are derived from the authored taxBaseRatios × gdp (see
  // src/lib/seeds/reference/budgets.ts buildTaxBases - 75/25 corporate split).
  // Cited per line in packs/1953.ts.
  for (const b of pack.budgets ?? []) {
    const totalCorp = b.gdp * b.taxBaseRatios.corporateProfits;
    const taxBases = {
      taxableIncome: b.gdp * b.taxBaseRatios.taxableIncome,
      domesticCorporateProfits: totalCorp * 0.75,
      foreignCorporateProfits: totalCorp * 0.25,
      wagesAndSalaries: b.gdp * b.taxBaseRatios.wagesAndSalaries,
      importValue: b.gdp * b.taxBaseRatios.importValue,
      taxableSales: b.gdp * b.taxBaseRatios.taxableSales,
    };
    // Revenue = taxRate% × base + other (src/lib/budget/revenue.ts calculateFederalRevenue core)
    const rr = (rate: number, base: number): number => Math.round(base * (rate / 100));
    const revenue = {
      incomeTax: rr(b.taxRates.incomeTax, taxBases.taxableIncome),
      domesticCorporateTax: rr(b.taxRates.domesticCorporateTax, taxBases.domesticCorporateProfits),
      foreignCorporateTax: rr(b.taxRates.foreignCorporateTax, taxBases.foreignCorporateProfits),
      payrollTax: rr(b.taxRates.payrollTax, taxBases.wagesAndSalaries),
      tariffs: rr(b.taxRates.tariffs, taxBases.importValue),
      salesTax: rr(b.taxRates.salesTax, taxBases.taxableSales),
      other: Math.round(b.otherRevenue),
      total: 0,
    };
    revenue.total = revenue.incomeTax + revenue.domesticCorporateTax + revenue.foreignCorporateTax + revenue.payrollTax + revenue.tariffs + revenue.salesTax + revenue.other;

    const byCategory: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.baselineSpendingByCategory)) byCategory[k] = Math.round(v);
    const debtInterest = Math.round(b.debt.principal * b.debt.interestRate);
    const categorySum = Object.values(byCategory).reduce((s, v) => s + v, 0);
    const spending = {
      byCategory,
      stateGrants: Math.round(b.baselineStateGrants),
      debtInterest,
      total: categorySum + Math.round(b.baselineStateGrants) + debtInterest,
    };
    const surplus = revenue.total - spending.total;

    budgets[b.countryId] = {
      countryId: b.countryId,
      fiscalYear: b.fiscalYear,
      gdp: b.gdp,
      population: b.population,
      currencyCode: b.currencyCode,
      taxRates: { ...b.taxRates },
      taxBases,
      revenue,
      spending,
      debt: { ...b.debt },
      surplus,
      treasuryBalance: -b.debt.principal,
      creditRating: b.creditRating as import("./budget/types.js").CreditRating,
      economicFactors: { ...b.economicFactors },
      baselineSpendingByCategory: { ...b.baselineSpendingByCategory },
      baselineStateGrants: b.baselineStateGrants,
      stateOwnershipConcentration: 0, // W14: recomputed each turn by economy/phases.ts stateOwnershipConcentrationPhase
    };
  }

  // For countries without an authored budget, synthesize a minimal placeholder
  // so every country's fiscal term has a balance (prevents undefined fiscal path).
  // These adopt neutral tax rates/bases that yield a near-balanced budget.
  const authored = new Set(Object.keys(budgets));
  // Need full country list - derive from regions' countryIds plus pack.budgets countries
  const allCountryIds = new Set<string>([...Object.values(regions).map((r) => r.countryId), ...authored]);
  // Also include any country not represented via regions yet (fallback: use pack countries)
  // We cannot import pack countries here without the full pack - regions covers playable set.
  for (const cid of allCountryIds) {
    if (authored.has(cid)) continue;
    // Find a region for gdp hint - first region of this country
    const region = Object.values(regions).find((r) => r.countryId === cid);
    const gdpFallback = region?.gdp != null ? (region.gdp as number) * 1_000_000 * Object.values(regions).filter((r) => r.countryId === cid).length : 10_000_000_000;
    const gdp = Math.max(1_000_000_000, gdpFallback);
    const ratios = { taxableIncome: 0.3, corporateProfits: 0.08, wagesAndSalaries: 0.35, importValue: 0.15, taxableSales: 0.4 };
    const totalCorp = gdp * ratios.corporateProfits;
    const taxBases = {
      taxableIncome: gdp * ratios.taxableIncome,
      domesticCorporateProfits: totalCorp * 0.75,
      foreignCorporateProfits: totalCorp * 0.25,
      wagesAndSalaries: gdp * ratios.wagesAndSalaries,
      importValue: gdp * ratios.importValue,
      taxableSales: gdp * ratios.taxableSales,
    };
    const taxRates = { incomeTax: 25, domesticCorporateTax: 30, foreignCorporateTax: 30, payrollTax: 5, tariffs: 2, salesTax: 5 };
    const rr = (rate: number, base: number): number => Math.round(base * (rate / 100));
    const revenue = {
      incomeTax: rr(taxRates.incomeTax, taxBases.taxableIncome),
      domesticCorporateTax: rr(taxRates.domesticCorporateTax, taxBases.domesticCorporateProfits),
      foreignCorporateTax: rr(taxRates.foreignCorporateTax, taxBases.foreignCorporateProfits),
      payrollTax: rr(taxRates.payrollTax, taxBases.wagesAndSalaries),
      tariffs: rr(taxRates.tariffs, taxBases.importValue),
      salesTax: rr(taxRates.salesTax, taxBases.taxableSales),
      other: Math.round(gdp * 0.02),
      total: 0,
    };
    revenue.total = revenue.incomeTax + revenue.domesticCorporateTax + revenue.foreignCorporateTax + revenue.payrollTax + revenue.tariffs + revenue.salesTax + revenue.other;
    const cat: Record<string, number> = { other: Math.round(revenue.total * 0.6) };
    const debtInterest = Math.round(gdp * 0.005);
    const spending = { byCategory: cat, stateGrants: Math.round(gdp * 0.05), debtInterest, total: Object.values(cat).reduce((s, v) => s + v, 0) + Math.round(gdp * 0.05) + debtInterest };
    budgets[cid] = {
      countryId: cid,
      fiscalYear: 1953,
      gdp,
      population: region?.population ?? 1_000_000,
      currencyCode: "USD",
      taxRates,
      taxBases,
      revenue,
      spending,
      debt: { principal: Math.round(gdp * 0.3), interestRate: 0.03, ceiling: Math.round(gdp * 0.6) },
      surplus: revenue.total - spending.total,
      treasuryBalance: -Math.round(gdp * 0.3),
      creditRating: "BBB" as import("./budget/types.js").CreditRating,
      economicFactors: { gdpGrowth: 2.5, wageGrowth: 3.0, inflationRate: 2.0, tradeGrowth: 3.0 },
      baselineSpendingByCategory: { ...cat },
      baselineStateGrants: Math.round(gdp * 0.05),
      stateOwnershipConcentration: 0,
    };
  }

  // Regional budgets: generic per-region entry seeded from national grant pool
  // plus own-revenue share. Uses REGIONAL_OWN_REVENUE_GDP_SHARE pattern (regionalBudget.ts).
  for (const [rid, region] of Object.entries(regions)) {
    const countryBudget = budgets[region.countryId];
    if (!countryBudget) continue;
    const pop = region.population ?? 0;
    // Approximate region gdp: if region.gdp (GSP) exists, use it *1e6 else share national
    const regionGdpAbs = region.gdp != null ? (region.gdp as number) * 1_000_000 : countryBudget.gdp * (pop / countryBudget.population);
    const own = Math.round(regionGdpAbs * 0.026); // 0.016+0.01 generic
    const grant = countryBudget.population > 0 ? Math.round((countryBudget.spending.stateGrants * pop) / countryBudget.population) : 0;
    const revTotal = own + grant;
    // Simple spending: distribute national byCategory proportionally per region (population share)
    const byCat: Record<string, number> = {};
    for (const [k, v] of Object.entries(countryBudget.spending.byCategory)) {
      byCat[k] = Math.round((v * pop) / countryBudget.population);
    }
    const spendTotal = Object.values(byCat).reduce((s, v) => s + v, 0) + Math.round(grant * 0.5); // mimic local spend
    regionalBudgets[rid] = {
      regionId: rid,
      countryId: region.countryId,
      revenue: { councilTax: Math.round(regionGdpAbs * 0.016), businessRates: Math.round(regionGdpAbs * 0.01), grant, total: revTotal },
      spending: { byCategory: byCat, total: spendTotal },
      balance: revTotal - spendTotal,
      consecutiveDeficits: 0,
    };
  }

  return { budgets, regionalBudgets };
}

/**
 * Seed one central bank per playable country, bootstrapped directly in the
 * autonomous "npp" chair mode (see centralBank/types.ts file doc for why: no
 * president/player pool exists yet to seat a character or FOMC-nominated
 * chair). primeRate seeds from each country's authored defaultPrimeRate -
 * the same value mainline's real seeder writes (src/lib/centralBank/helpers.ts
 * getDefaultBank), not the era-graduated neutralPrimeRate (see conformance.test.ts
 * "uses seeder defaultPrimeRate, not era monetary baseline").
 * Term expiry seeds at turn 0 + CHAIR_TERM_TURNS, mirroring appointNppChair.ts's
 * `currentTurn + TERM_TURNS` at initial appointment (currentTurn = 0 here).
 */
function seedGovernors(regions: WorldState["regions"]): WorldState["governors"] {
  // Source: src/lib/db/types/electedOfficial.ts officeType "governor" per region
  // and GovernorOfficeState seeding (src/lib/governorOffice/seedOfficeStates.ts).
  // Solo creates one vacant governor office per US state so the office-AP system
  // has a spendable balance once a holder seats. Vacant = governorId null.
  // Citation constants: GUBERNATORIAL_ACTION_CAP = 3 (src/lib/constants/governorOffice.ts).
  const governors: WorldState["governors"] = {};
  for (const region of Object.values(regions)) {
    if (region.countryId !== "US") continue;
    governors[region.id] = {
      stateId: region.id,
      countryId: "US",
      governorId: null,
      governorParty: null,
      governorName: null,
      termStartTurn: null,
      gubernatorialActions: 3,
      lastActionGrantedTurn: 0,
      lastAddressTurn: null,
    };
  }
  return governors;
}

function seedCentralBanks(countries: WorldState["countries"]): WorldState["centralBanks"] {
  const banks: WorldState["centralBanks"] = {};
  for (const country of Object.values(countries)) {
    if (!country.playable) continue;
    const anchor = CENTRAL_BANK_COUNTRY_ANCHORS[country.id];
    if (!anchor) continue; // Playable country without an authored central-bank anchor (future era pack) - no bank until one is authored.
    const bank: CentralBank = {
      countryId: country.id,
      primeRate: anchor.defaultPrimeRate,
      chairMode: "npp",
      chairAlignment: null,
      chairInfamy: 0,
      resolveStreak: 0,
      lastRateChangeTurn: null,
      chairTermExpiresAtTurn: CHAIR_TERM_TURNS,
      interestRateHistory: [],
      chairAppointedBy: null,
      // W12: seed the NPC household money pool proportional to the country's
      // GDP. PROVISIONAL — flagged for user review; see centralBank/types.ts
      // externalBroadMoney file doc for why this has no mainline seed-path
      // equivalent (mainline's figure accrues from the live economy over
      // time; solo seeds it once and only the banking cluster moves it
      // afterward). Multiple chosen so a chartered bank's NPC deposit share
      // (~8% of the pool, deposits.ts NPC_DEPOSIT_BASE_SHARE) lands in the
      // same order of magnitude as its own posted capital.
      externalBroadMoney: Math.round(country.economy.gdp * 1_000_000 * EXTERNAL_BROAD_MONEY_GDP_SHARE),
      tradeGrowth: 0, // W8: mirrored each turn by trade/phases.ts tradeGrowthMirrorPhase
    };
    banks[country.id] = bank;
  }
  return banks;
}
