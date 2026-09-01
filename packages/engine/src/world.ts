import { rngFromSeed } from "./rng.js";
import { assignUsSeatGeography } from "./elections/seatGeography.js";
import type { WorldState } from "./types.js";
import { getPackByEra, PACKS_BY_DATE } from "@rotunda/content";
import { createPoliticiansForWorld } from "./politician.js";
import { CATEGORIES_BY_COUNTRY_1953 } from "./demographics/categories.js";
import { US_STATE_DEMOGRAPHICS_1953 } from "./demographics/usStateDemographics1953.js";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  getEraCommodityBasePrice,
} from "./commodity/constants.js";

export const SCHEMA_VERSION = 16;

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
    },
    bills,
    committees,
    enactedLaws: [],
    stateBills: [],
    news: [{ turn: 0, date: pack.era.startDate, headline: "A new game begins." }],
  };
  assignUsSeatGeography(world);
  return world;
}

/**
 * Seed support/electorate state.
 * W38: US 48 real states (AK/HI absent until statehood), UK/RU/DD 3 opaque each.
 * See docs/support/W19_BRIDGE.md for bridge plan and population-weighted split rationale.
 *
 * Registration/org seeding:
 * - US: per-state from pack.states[].registration (src/lib/seeds/registration/registrationLanes1953.ts
 *   lanes + per-state overrides; disenfranchisement via unregistered pool, e.g. MS 25). Maps abbr DEM/REP to party ids US_DEM/US_REP.
 *   Turnout modifiers start at 0. House apportionment and Senate classes are carried on Region but not consumed by support phases.
 * - UK/RU/DD: retained opaque 3-region PORT-STUB as in W19 until W39 (UK polling 1951, RU/DD org tables).
 *   Cited as PORT-STUB with mainline-neutral equivalent.
 * - UK: PORT-STUB neutral/historical-lean from UK_REGION_POLLING_1951 averages (Craig 1951).
 * - RU/DD: PORT-STUB one-party dominant from RU_REGION_ORG_1953 / DD org calculations (CPSU ~95-98, SED ~80-85).
 * Turnout modifiers start at 0. Candidate supports start at 50 (DEFAULT).
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

  // US: real 48 states from pack.states if present; else fallback to 3 opaque (pre-W38 saves)
  const usStates = (pack.states ?? []).filter((s) => s.countryId === "US");
  if (usStates.length > 0) {
    const ids: string[] = [];
    const sorted = [...usStates].sort((a, b) => a.id.localeCompare(b.id));
    for (const st of sorted) {
      const rid = st.id;
      ids.push(rid);
      regions[rid] = {
        id: rid,
        countryId: "US",
        name: st.name,
        population: st.population,
        houseSeats: st.houseSeats,
        senateSeats: st.senateSeats,
        senateClasses: st.senateClasses,
        censusRegion: st.region,
        gdp: st.gdp,
      };
    }
    regionIdsByCountry.set("US", ids);
    // Populate per-state electorate/turnout/partyRegions for US
    for (const st of sorted) {
      const rid = st.id;
      electoratePools[rid] = {
        regionId: rid,
        countryId: "US",
        independent: st.registration.independent,
        unregistered: st.registration.unregistered,
      };
      regionTurnouts[rid] = {
        regionId: rid,
        countryId: "US",
        modifiers: seedTurnoutModifiers("US"),
        lastDecayAppliedTurn: 0,
      };
    }
    // Map abbr -> partyId for US
    const usParties = Object.values(parties).filter((p) => p.countryId === "US");
    const abbrToPartyId = new Map<string, string>();
    for (const p of usParties) abbrToPartyId.set(p.abbreviation, p.id);
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
          countryId: "US",
          organization: entry.org,
          registration: entry.reg,
        };
        const pkey = `${partyId}:${rid}`;
        partyPressures[pkey] = { partyId, regionId: rid, countryId: "US", value: 0 };
      }
      // Ensure every US party has a row even if not in registration (e.g. future third parties) with 0
      for (const p of usParties) {
        const key = `${rid}:${p.id}`;
        if (!partyRegions[key]) {
          partyRegions[key] = { regionId: rid, partyId: p.id, countryId: "US", organization: 0, registration: 0 };
          const pkey = `${p.id}:${rid}`;
          if (!partyPressures[pkey]) partyPressures[pkey] = { partyId: p.id, regionId: rid, countryId: "US", value: 0 };
        }
      }
    }
  } else {
    // Fallback: 3 opaque US regions (for 1960 era which carries no states table)
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const rid = `US-R${i}`;
      ids.push(rid);
      regions[rid] = { id: rid, countryId: "US", name: `US Region ${i}` };
    }
    regionIdsByCountry.set("US", ids);
    for (const rid of ids) {
      electoratePools[rid] = seedPool("US", rid);
      regionTurnouts[rid] = { regionId: rid, countryId: "US", modifiers: seedTurnoutModifiers("US"), lastDecayAppliedTurn: 0 };
    }
    for (const party of Object.values(parties).filter((p) => p.countryId === "US")) {
      for (const rid of ids) {
        const key = `${rid}:${party.id}`;
        const { organization, registration } = seedPartyRegion(party, rid);
        partyRegions[key] = { regionId: rid, partyId: party.id, countryId: party.countryId, organization, registration };
        const pkey = `${party.id}:${rid}`;
        partyPressures[pkey] = { partyId: party.id, regionId: rid, countryId: party.countryId, value: 0 };
      }
    }
  }

  // UK/RU/DD retain 3 opaque each until W39 (or if US already handled, handle remaining playable)
  for (const countryId of playable) {
    if (countryId === "US") continue;
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const rid = `${countryId}-R${i}`;
      ids.push(rid);
      regions[rid] = { id: rid, countryId, name: `${countryId} Region ${i}` };
      regionIdsByCountry.set(countryId, ids);
    }
  }
  for (const countryId of playable) {
    if (countryId === "US") continue;
    const rids = regionIdsByCountry.get(countryId)!;
    for (const rid of rids) {
      if (!electoratePools[rid]) electoratePools[rid] = seedPool(countryId, rid);
      if (!regionTurnouts[rid]) regionTurnouts[rid] = { regionId: rid, countryId, modifiers: seedTurnoutModifiers(countryId), lastDecayAppliedTurn: 0 };
    }
  }
  for (const party of Object.values(parties)) {
    if (party.countryId === "US") continue;
    const rids = regionIdsByCountry.get(party.countryId);
    if (!rids) continue;
    for (const rid of rids) {
      const key = `${rid}:${party.id}`;
      if (partyRegions[key]) continue;
      const { organization, registration } = seedPartyRegion(party, rid);
      partyRegions[key] = { regionId: rid, partyId: party.id, countryId: party.countryId, organization, registration };
      const pkey = `${party.id}:${rid}`;
      if (!partyPressures[pkey]) partyPressures[pkey] = { partyId: party.id, regionId: rid, countryId: party.countryId, value: 0 };
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
  const usMap = new Map<string, (typeof US_STATE_DEMOGRAPHICS_1953)[number]>();
  if (usSeeds) for (const s of usSeeds) usMap.set(s.stateId, s);

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
  // src/lib/seeds/reference/budgets.ts buildTaxBases — 75/25 corporate split).
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
    };
  }

  // For countries without an authored budget, synthesize a minimal placeholder
  // so every country's fiscal term has a balance (prevents undefined fiscal path).
  // These adopt neutral tax rates/bases that yield a near-balanced budget.
  const authored = new Set(Object.keys(budgets));
  // Need full country list — derive from regions' countryIds plus pack.budgets countries
  const allCountryIds = new Set<string>([...Object.values(regions).map((r) => r.countryId), ...authored]);
  // Also include any country not represented via regions yet (fallback: use pack countries)
  // We cannot import pack countries here without the full pack — regions covers playable set.
  for (const cid of allCountryIds) {
    if (authored.has(cid)) continue;
    // Find a region for gdp hint — first region of this country
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
