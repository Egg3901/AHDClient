import { rngFromSeed } from "./rng.js";
import type { WorldState } from "./types.js";
import { getPackByEra, PACKS_BY_DATE } from "@rotunda/content";
import { createPoliticiansForWorld } from "./politician.js";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  getEraCommodityBasePrice,
} from "./commodity/constants.js";

export const SCHEMA_VERSION = 10;

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
    charters: [],
    caucuses: [],
    commodityPrices,
    extractionContracts: [],
    regions,
    partyRegions,
    electoratePools,
    regionTurnouts,
    partyPressures,
    candidateSupports,
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
    },
    news: [{ turn: 0, date: pack.era.startDate, headline: "A new game begins." }],
  };
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
