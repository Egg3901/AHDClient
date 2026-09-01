import { SCHEMA_VERSION } from "./world.js";
import { assignUsSeatGeography } from "./elections/seatGeography.js";
import { CENTRAL_BANK_COUNTRY_ANCHORS, CHAIR_TERM_TURNS } from "./centralBank/constants.js";
import { seedCorporations } from "./corporation/founding.js";
import { rngFromSeed } from "./rng.js";
import type { WorldState } from "./types.js";

/**
 * Save file = versioned JSON envelope around the full WorldState. Older
 * schema versions migrate forward at load; loading a newer version than the
 * engine understands is an error, never a silent best-effort.
 */
export interface SaveFile {
  format: "ahdsolo-save";
  schemaVersion: number;
  savedAt: string;
  world: WorldState;
}

export function serializeSave(world: WorldState, savedAt: string): string {
  const save: SaveFile = {
    format: "ahdsolo-save",
    schemaVersion: world.meta.schemaVersion,
    savedAt,
    world,
  };
  return JSON.stringify(save);
}

export function deserializeSave(raw: string): WorldState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Not a valid save file: unparseable JSON");
  }
  if (
    typeof parsed !== "object" || parsed === null ||
    (parsed as SaveFile).format !== "ahdsolo-save"
  ) {
    throw new Error("Not a valid save file: wrong format marker");
  }
  const save = parsed as SaveFile;
  if (save.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Save is from a newer version (schema ${save.schemaVersion} > ${SCHEMA_VERSION}); update the game to load it`,
    );
  }
  // v1 -> v2: add outputGap to each country economy
  if (save.schemaVersion < 2) {
    for (const country of Object.values((save.world as WorldState).countries)) {
      const econ = country.economy as unknown as Record<string, unknown>;
      if (!Number.isFinite(econ["outputGap"] as number)) {
        econ["outputGap"] = 0;
      }
    }
    save.world.meta.schemaVersion = 2;
  }
  // v2 -> v3: add parties and legislatures (empty for old saves)
  if (save.schemaVersion < 3) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["parties"] !== "object" || w["parties"] === null || Array.isArray(w["parties"])) {
      w["parties"] = {};
    }
    if (typeof w["legislatures"] !== "object" || w["legislatures"] === null || Array.isArray(w["legislatures"])) {
      w["legislatures"] = {};
    }
    save.world.meta.schemaVersion = 3;
  }
  // v3 -> v4: add politicians (empty for old saves)
  if (save.schemaVersion < 4) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["politicians"])) {
      w["politicians"] = [];
    }
    save.world.meta.schemaVersion = 4;
  }
  // v4 -> v5: add cheatsUsed flag (false for old saves)
  if (save.schemaVersion < 5) {
    const w = save.world as unknown as Record<string, unknown>;
    const meta = w["meta"] as Record<string, unknown> | undefined;
    if (meta && typeof meta["cheatsUsed"] !== "boolean") {
      meta["cheatsUsed"] = false;
    }
    save.world.meta.schemaVersion = 5;
  }
  // v5 -> v6: party organization cluster (treasury, PS, org, tier, memberCount, charters, caucuses, politician influence)
  if (save.schemaVersion < 6) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["charters"])) w["charters"] = [];
    if (!Array.isArray(w["caucuses"])) w["caucuses"] = [];
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    if (parties && typeof parties === "object") {
      for (const p of Object.values(parties)) {
        if (typeof p["treasury"] !== "number") p["treasury"] = 1_000_000;
        if (typeof p["politicalStrength"] !== "number") p["politicalStrength"] = 0;
        if (typeof p["organization"] !== "number") p["organization"] = 0;
        if (p["tier"] !== "major" && p["tier"] !== "minor") p["tier"] = "minor";
        if (!Array.isArray(p["psCapEarnedRegions"])) p["psCapEarnedRegions"] = [];
        if (typeof p["memberCount"] !== "number") p["memberCount"] = 0;
        if (typeof p["isDefault"] !== "boolean") p["isDefault"] = true;
      }
    }
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(politicians)) {
      for (const pol of politicians) {
        if (typeof pol["partyInfluence"] !== "number") pol["partyInfluence"] = 0;
        if (typeof pol["bonusActions"] !== "number") pol["bonusActions"] = 0;
      }
    }
    save.world.meta.schemaVersion = 6;
  }
  // v6 -> v7: commodity prices and extraction contracts (seed with era-neutral defaults)
  if (save.schemaVersion < 7) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["commodityPrices"] !== "object" || w["commodityPrices"] === null || Array.isArray(w["commodityPrices"])) {
      const fallback: Record<string, unknown> = {};
      // Use modern base prices as fallback basePrice where era unknown (scale 1).
      // WorldState era is available for a better seed but content import would
      // be circular here; keep the migration deterministic and era-agnostic.
      const modernBase: Record<string, number> = {
        steel: 800, electronics: 500, energy: 60, chemicals: 220, pharmaceuticals: 1200,
        fertilizers: 180, food: 200, building_materials: 400, construction_services: 3500,
        healthcare_services: 2500, real_estate_services: 2200, software: 1000,
        financial_services: 2000, advertising: 150, vehicles: 25000, retail: 150,
        freight: 3000, consulting_services: 5000, iron: 120, coal: 150, oil: 80,
        rare_earth: 21000, timber: 400, natural_gas: 25, ordnance: 4500, plastics: 1000,
        network_services: 1200, entertainment_services: 600,
      };
      for (const [k, v] of Object.entries(modernBase)) {
        fallback[k] = { commodity: k, basePrice: v, globalPrice: v, globalSupply: 0, globalDemand: 0, turn: (w["meta"] as Record<string, unknown>)?.["turn"] ?? 0 };
      }
      w["commodityPrices"] = fallback;
    }
    if (!Array.isArray(w["extractionContracts"])) w["extractionContracts"] = [];
    save.world.meta.schemaVersion = 7;
  }
  // v7 -> v8: W19 support/electorate cluster (opaque regions per playable country)
  if (save.schemaVersion < 8) {
    const w = save.world as unknown as Record<string, unknown>;
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    // Build regions deterministically from parties' countryIds (playable set implied)
    const playableCountries = new Set<string>();
    if (parties) for (const p of Object.values(parties)) if (typeof p["countryId"] === "string") playableCountries.add(p["countryId"] as string);
    const regions: Record<string, unknown> = {};
    const electoratePools: Record<string, unknown> = {};
    const regionTurnouts: Record<string, unknown> = {};
    const partyRegions: Record<string, unknown> = {};
    const partyPressures: Record<string, unknown> = {};
    const candidateSupports: Record<string, unknown> = {};

    if (typeof w["regions"] !== "object" || w["regions"] === null || Array.isArray(w["regions"])) w["regions"] = regions;
    else Object.assign(regions, w["regions"] as Record<string, unknown>);
    if (typeof w["electoratePools"] !== "object" || w["electoratePools"] === null || Array.isArray(w["electoratePools"])) w["electoratePools"] = electoratePools;
    else Object.assign(electoratePools, w["electoratePools"] as Record<string, unknown>);
    if (typeof w["regionTurnouts"] !== "object" || w["regionTurnouts"] === null || Array.isArray(w["regionTurnouts"])) w["regionTurnouts"] = regionTurnouts;
    else Object.assign(regionTurnouts, w["regionTurnouts"] as Record<string, unknown>);
    if (typeof w["partyRegions"] !== "object" || w["partyRegions"] === null || Array.isArray(w["partyRegions"])) w["partyRegions"] = partyRegions;
    else Object.assign(partyRegions, w["partyRegions"] as Record<string, unknown>);
    if (typeof w["partyPressures"] !== "object" || w["partyPressures"] === null || Array.isArray(w["partyPressures"])) w["partyPressures"] = partyPressures;
    else Object.assign(partyPressures, w["partyPressures"] as Record<string, unknown>);
    if (typeof w["candidateSupports"] !== "object" || w["candidateSupports"] === null || Array.isArray(w["candidateSupports"])) w["candidateSupports"] = candidateSupports;
    else Object.assign(candidateSupports, w["candidateSupports"] as Record<string, unknown>);

    // If regions empty, seed 3 opaque per country as in world.ts seedW19Support
    const existingRegionCount = Object.keys(regions).length;
    if (existingRegionCount === 0 && playableCountries.size > 0) {
      for (const countryId of playableCountries) {
        for (let i = 1; i <= 3; i++) {
          const rid = `${countryId}-R${i}`;
          if (!regions[rid]) regions[rid] = { id: rid, countryId, name: `${countryId} Region ${i}` };
          if (!electoratePools[rid]) {
            const isSouth = countryId === "US" && rid.endsWith("-R2");
            electoratePools[rid] = {
              regionId: rid,
              countryId,
              independent: countryId === "RU" ? 3 : countryId === "DD" ? 5 : isSouth ? 3 : 8,
              unregistered: countryId === "RU" ? 2 : countryId === "DD" ? 3 : isSouth ? 22 : 7,
            };
          }
          if (!regionTurnouts[rid]) {
            const groups: string[] =
              countryId === "US" ? ["urban_progressives", "rural_conservatives", "suburban_moderates"]
              : countryId === "UK" ? ["urban_progressives", "rural_traditionalists", "suburban_centrists"]
              : countryId === "RU" ? ["workers", "urban_progressives"]
              : countryId === "DD" ? ["workers", "bloc_centrists"]
              : ["general"];
            const mods: Record<string, number> = {};
            for (const g of groups) mods[g] = 0;
            regionTurnouts[rid] = { regionId: rid, countryId, modifiers: { voterGroups: mods }, lastDecayAppliedTurn: 0 };
          }
        }
      }
      if (parties) {
        for (const [partyId, party] of Object.entries(parties)) {
          const countryId = party["countryId"] as string | undefined;
          if (!countryId) continue;
          for (let i = 1; i <= 3; i++) {
            const rid = `${countryId}-R${i}`;
            const key = `${rid}:${partyId}`;
            if (partyRegions[key]) continue;
            let org = 10, reg = 10;
            if (countryId === "US") {
              if (partyId === "US_DEM") org = rid.endsWith("-R1") ? 34 : rid.endsWith("-R2") ? 38 : 24, reg = rid.endsWith("-R1") ? 50 : rid.endsWith("-R2") ? 66 : 35;
              else if (partyId === "US_REP") org = rid.endsWith("-R1") ? 24 : rid.endsWith("-R2") ? 8 : 34, reg = rid.endsWith("-R1") ? 35 : rid.endsWith("-R2") ? 6 : 50;
            } else if (countryId === "UK") {
              if (partyId === "UK_LAB") org = rid.endsWith("-R1") ? 32 : rid.endsWith("-R2") ? 24 : 28, reg = rid.endsWith("-R1") ? 38 : rid.endsWith("-R2") ? 30 : 34;
              else if (partyId === "UK_CON") org = rid.endsWith("-R1") ? 28 : rid.endsWith("-R2") ? 36 : 30, reg = rid.endsWith("-R1") ? 34 : rid.endsWith("-R2") ? 42 : 36;
              else if (partyId === "UK_LIB") org = 8, reg = 5;
              else org = 2, reg = 1;
            } else if (countryId === "RU") org = partyId === "RU_CPSU" ? 96 : 0, reg = partyId === "RU_CPSU" ? 92 : 0;
            else if (countryId === "DD") {
              if (partyId === "DD_SED") org = 82, reg = 78;
              else if (partyId === "DD_CDU") org = 22, reg = 18;
              else if (partyId === "DD_LDPD") org = 18, reg = 15;
              else if (partyId === "DD_NDPD") org = 18, reg = 15;
              else if (partyId === "DD_DBD") org = 20, reg = 16;
            }
            partyRegions[key] = { regionId: rid, partyId, countryId, organization: org, registration: reg };
            const pkey = `${partyId}:${rid}`;
            if (!partyPressures[pkey]) partyPressures[pkey] = { partyId, regionId: rid, countryId, value: 0 };
          }
        }
      }
      if (politicians && Array.isArray(politicians)) {
        for (const pol of politicians) {
          const id = pol["id"] as string | undefined;
          const partyId = pol["partyId"] as string | undefined;
          const countryId = pol["countryId"] as string | undefined;
          if (!id || !partyId || !countryId) continue;
          if (!candidateSupports[id]) candidateSupports[id] = { id, partyId, countryId, support: 50, supportAccrual: [], status: "active" };
        }
      }
    }
    // Ensure priorityRegion field exists (optional) — no migration needed, leave undefined

    w["regions"] = regions;
    w["electoratePools"] = electoratePools;
    w["regionTurnouts"] = regionTurnouts;
    w["partyRegions"] = partyRegions;
    w["partyPressures"] = partyPressures;
    w["candidateSupports"] = candidateSupports;
    save.world.meta.schemaVersion = 8;
  }
  // v8 -> v9: W34 action economy (actions, funds, donorBase, influence, favorability, infamy, cooldowns)
  if (save.schemaVersion < 9) {
    const w = save.world as unknown as Record<string, unknown>;
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(politicians)) {
      for (const pol of politicians) {
        if (typeof pol["actions"] !== "number") pol["actions"] = 25;
        if (typeof pol["funds"] !== "number") pol["funds"] = 0;
        if (typeof pol["donorBaseLevel"] !== "number") pol["donorBaseLevel"] = 0;
        if (typeof pol["politicalInfluence"] !== "number") pol["politicalInfluence"] = 0;
        if (typeof pol["favorability"] !== "number") pol["favorability"] = 50;
        if (typeof pol["infamy"] !== "number") pol["infamy"] = 0;
        if (typeof pol["actionCooldowns"] !== "object" || pol["actionCooldowns"] === null || Array.isArray(pol["actionCooldowns"])) pol["actionCooldowns"] = {};
      }
    }
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player === "object") {
      if (typeof player["actions"] !== "number") player["actions"] = 25;
      if (typeof player["funds"] !== "number") player["funds"] = 0;
      if (typeof player["donorBaseLevel"] !== "number") player["donorBaseLevel"] = 0;
      if (typeof player["politicalInfluence"] !== "number") player["politicalInfluence"] = 0;
      if (typeof player["favorability"] !== "number") player["favorability"] = 50;
      if (typeof player["infamy"] !== "number") player["infamy"] = 0;
      if (typeof player["actionCooldowns"] !== "object" || player["actionCooldowns"] === null || Array.isArray(player["actionCooldowns"])) player["actionCooldowns"] = {};
    }
    save.world.meta.schemaVersion = 9;
  }
  // v9 -> v10: W38 US states — replace US opaque US-R1..R3 with 48 real states.
  // UK/RU/DD retain opaque until W39 per docs/support/W19_BRIDGE.md.
  // Bridge decision: mainline has no explicit opaque-to-state mapping, so we use
  // a deterministic population-weighted split. Pooled org/reg from the 3 opaque US
  // regions (averaged) is assigned uniformly to all 48 new states (population
  // weighting yields the same uniform result for percentage metrics; totals are
  // preserved proportionally via population weight; see world.ts seedSupport).
  // This is deterministic (sorted state tables, no RNG) and preserves aggregate
  // support investment. PriorityRegion ids referencing US-Rx are dropped (no table).
  // Turnout modifiers are neutral 0, so copy is safe. UK/RU/DD untouched.
  if (save.schemaVersion < 10) {
    const w = save.world as unknown as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    const partyRegions = w["partyRegions"] as Record<string, Record<string, unknown>> | undefined;
    const electoratePools = w["electoratePools"] as Record<string, Record<string, unknown>> | undefined;
    const regionTurnouts = w["regionTurnouts"] as Record<string, Record<string, unknown>> | undefined;
    const partyPressures = w["partyPressures"] as Record<string, Record<string, unknown>> | undefined;
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;

    // Detect opaque US regions
    const opaqueUsIds = ["US-R1", "US-R2", "US-R3"];
    const hasOpaqueUs = regions ? opaqueUsIds.some((id) => id in regions) : false;

    if (hasOpaqueUs && regions && partyRegions && electoratePools && regionTurnouts && partyPressures) {
      // Import state list for population weighting and region seeding
      // Inline minimal US states metadata (id, name, population) to avoid circular import
      // Source: packages/content/src/packs/usStates1953.ts — sorted for determinism
      const US_STATES_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
        { id: "AL", name: "Alabama", population: 3061743, houseSeats: 9, senateSeats: 35, senateClasses: [2, 3], region: "Southeast", gdp: 4500 },
        { id: "AR", name: "Arkansas", population: 1909511, houseSeats: 6, senateSeats: 35, senateClasses: [2, 3], region: "Southeast", gdp: 2300 },
        { id: "AZ", name: "Arizona", population: 749587, houseSeats: 2, senateSeats: 30, senateClasses: [1, 3], region: "Southwest", gdp: 1700 },
        { id: "CA", name: "California", population: 10586223, houseSeats: 30, senateSeats: 40, senateClasses: [1, 3], region: "West", gdp: 38000 },
        { id: "CO", name: "Colorado", population: 1325089, houseSeats: 4, senateSeats: 35, senateClasses: [2, 3], region: "West", gdp: 3200 },
        { id: "CT", name: "Connecticut", population: 2007280, houseSeats: 6, senateSeats: 36, senateClasses: [1, 3], region: "Northeast", gdp: 6500 },
        { id: "DE", name: "Delaware", population: 318085, houseSeats: 1, senateSeats: 21, senateClasses: [1, 2], region: "Northeast", gdp: 1000 },
        { id: "FL", name: "Florida", population: 2771305, houseSeats: 8, senateSeats: 40, senateClasses: [1, 3], region: "Southeast", gdp: 4500 },
        { id: "GA", name: "Georgia", population: 3444578, houseSeats: 10, senateSeats: 56, senateClasses: [2, 3], region: "Southeast", gdp: 5500 },
        { id: "IA", name: "Iowa", population: 2621073, houseSeats: 8, senateSeats: 50, senateClasses: [2, 3], region: "Midwest", gdp: 5500 },
        { id: "ID", name: "Idaho", population: 588637, houseSeats: 2, senateSeats: 35, senateClasses: [2, 3], region: "West", gdp: 1300 },
        { id: "IL", name: "Illinois", population: 8712176, houseSeats: 25, senateSeats: 59, senateClasses: [2, 3], region: "Midwest", gdp: 30000 },
        { id: "IN", name: "Indiana", population: 3934224, houseSeats: 11, senateSeats: 50, senateClasses: [1, 3], region: "Midwest", gdp: 10000 },
        { id: "KS", name: "Kansas", population: 1905299, houseSeats: 6, senateSeats: 40, senateClasses: [2, 3], region: "Midwest", gdp: 4000 },
        { id: "KY", name: "Kentucky", population: 2944806, houseSeats: 8, senateSeats: 38, senateClasses: [2, 3], region: "Southeast", gdp: 4500 },
        { id: "LA", name: "Louisiana", population: 2683516, houseSeats: 8, senateSeats: 39, senateClasses: [2, 3], region: "Southeast", gdp: 5500 },
        { id: "MA", name: "Massachusetts", population: 4690514, houseSeats: 14, senateSeats: 40, senateClasses: [1, 2], region: "Northeast", gdp: 14000 },
        { id: "MD", name: "Maryland", population: 2343001, houseSeats: 7, senateSeats: 47, senateClasses: [1, 3], region: "Northeast", gdp: 6500 },
        { id: "ME", name: "Maine", population: 913774, houseSeats: 3, senateSeats: 35, senateClasses: [1, 2], region: "Northeast", gdp: 1800 },
        { id: "MI", name: "Michigan", population: 6371766, houseSeats: 18, senateSeats: 38, senateClasses: [1, 2], region: "Midwest", gdp: 20000 },
        { id: "MN", name: "Minnesota", population: 2982483, houseSeats: 9, senateSeats: 67, senateClasses: [1, 2], region: "Midwest", gdp: 7500 },
        { id: "MO", name: "Missouri", population: 3954653, houseSeats: 11, senateSeats: 34, senateClasses: [1, 3], region: "Midwest", gdp: 11000 },
        { id: "MS", name: "Mississippi", population: 2178914, houseSeats: 6, senateSeats: 52, senateClasses: [1, 2], region: "Southeast", gdp: 2300 },
        { id: "MT", name: "Montana", population: 591024, houseSeats: 2, senateSeats: 50, senateClasses: [1, 2], region: "West", gdp: 1400 },
        { id: "NC", name: "North Carolina", population: 4061929, houseSeats: 12, senateSeats: 50, senateClasses: [2, 3], region: "Southeast", gdp: 6500 },
        { id: "ND", name: "North Dakota", population: 619636, houseSeats: 2, senateSeats: 47, senateClasses: [1, 3], region: "Midwest", gdp: 1300 },
        { id: "NE", name: "Nebraska", population: 1325510, houseSeats: 4, senateSeats: 49, senateClasses: [1, 2], region: "Midwest", gdp: 3200 },
        { id: "NH", name: "New Hampshire", population: 533242, houseSeats: 2, senateSeats: 24, senateClasses: [2, 3], region: "Northeast", gdp: 1300 },
        { id: "NJ", name: "New Jersey", population: 4835329, houseSeats: 14, senateSeats: 40, senateClasses: [1, 2], region: "Northeast", gdp: 16000 },
        { id: "NM", name: "New Mexico", population: 681187, houseSeats: 2, senateSeats: 42, senateClasses: [1, 2], region: "Southwest", gdp: 1200 },
        { id: "NV", name: "Nevada", population: 160083, houseSeats: 1, senateSeats: 21, senateClasses: [1, 3], region: "Southwest", gdp: 450 },
        { id: "NY", name: "New York", population: 14830192, houseSeats: 43, senateSeats: 61, senateClasses: [1, 3], region: "Northeast", gdp: 50000 },
        { id: "OH", name: "Ohio", population: 7946627, houseSeats: 23, senateSeats: 33, senateClasses: [1, 3], region: "Midwest", gdp: 24000 },
        { id: "OK", name: "Oklahoma", population: 2233351, houseSeats: 6, senateSeats: 48, senateClasses: [2, 3], region: "Southwest", gdp: 4000 },
        { id: "OR", name: "Oregon", population: 1521341, houseSeats: 4, senateSeats: 30, senateClasses: [2, 3], region: "West", gdp: 3600 },
        { id: "PA", name: "Pennsylvania", population: 10498012, houseSeats: 30, senateSeats: 50, senateClasses: [1, 3], region: "Northeast", gdp: 30000 },
        { id: "RI", name: "Rhode Island", population: 791896, houseSeats: 2, senateSeats: 38, senateClasses: [1, 2], region: "Northeast", gdp: 2300 },
        { id: "SC", name: "South Carolina", population: 2117027, houseSeats: 6, senateSeats: 46, senateClasses: [2, 3], region: "Southeast", gdp: 2800 },
        { id: "SD", name: "South Dakota", population: 652740, houseSeats: 2, senateSeats: 35, senateClasses: [2, 3], region: "Midwest", gdp: 1300 },
        { id: "TN", name: "Tennessee", population: 3291718, houseSeats: 9, senateSeats: 33, senateClasses: [1, 2], region: "Southeast", gdp: 5500 },
        { id: "TX", name: "Texas", population: 7711194, houseSeats: 22, senateSeats: 31, senateClasses: [1, 2], region: "Southwest", gdp: 18000 },
        { id: "UT", name: "Utah", population: 688862, houseSeats: 2, senateSeats: 29, senateClasses: [1, 3], region: "Southwest", gdp: 1400 },
        { id: "VA", name: "Virginia", population: 3318680, houseSeats: 10, senateSeats: 40, senateClasses: [1, 2], region: "Southeast", gdp: 6500 },
        { id: "VT", name: "Vermont", population: 377747, houseSeats: 1, senateSeats: 30, senateClasses: [1, 3], region: "Northeast", gdp: 750 },
        { id: "WA", name: "Washington", population: 2378963, houseSeats: 7, senateSeats: 49, senateClasses: [1, 3], region: "West", gdp: 6500 },
        { id: "WI", name: "Wisconsin", population: 3434575, houseSeats: 10, senateSeats: 33, senateClasses: [1, 3], region: "Midwest", gdp: 8500 },
        { id: "WV", name: "West Virginia", population: 2005552, houseSeats: 6, senateSeats: 34, senateClasses: [1, 2], region: "Southeast", gdp: 3500 },
        { id: "WY", name: "Wyoming", population: 290529, houseSeats: 1, senateSeats: 30, senateClasses: [1, 2], region: "West", gdp: 650 },
      ];

      // Compute per-party average org/reg and per-region electorate averages across opaque US regions
      const usPartyIds = parties ? Object.keys(parties).filter((pid) => (parties[pid] as Record<string, unknown>)["countryId"] === "US") : [];
      const avgOrgByParty = new Map<string, number>();
      const avgRegByParty = new Map<string, number>();
      for (const pid of usPartyIds) {
        let sumOrg = 0, sumReg = 0, count = 0;
        for (const rid of opaqueUsIds) {
          const key = `${rid}:${pid}`;
          const pr = partyRegions[key] as Record<string, unknown> | undefined;
          if (pr && typeof pr["organization"] === "number" && typeof pr["registration"] === "number") {
            sumOrg += pr["organization"] as number;
            sumReg += pr["registration"] as number;
            count++;
          }
        }
        avgOrgByParty.set(pid, count ? Math.round(sumOrg / count) : 0);
        avgRegByParty.set(pid, count ? Math.round(sumReg / count) : 0);
      }
      // Electorate averages
      let sumInd = 0, sumUnreg = 0, countPools = 0;
      for (const rid of opaqueUsIds) {
        const pool = electoratePools[rid] as Record<string, unknown> | undefined;
        if (pool && typeof pool["independent"] === "number" && typeof pool["unregistered"] === "number") {
          sumInd += pool["independent"] as number;
          sumUnreg += pool["unregistered"] as number;
          countPools++;
        }
      }
      const avgInd = countPools ? Math.round(sumInd / countPools) : 8;
      const avgUnreg = countPools ? Math.round(sumUnreg / countPools) : 7;

      // Turnout modifiers are neutral 0; copy from first opaque if present
      let turnoutMods: Record<string, Record<string, number>> | null = null;
      for (const rid of opaqueUsIds) {
        const rt = regionTurnouts[rid] as Record<string, unknown> | undefined;
        if (rt && typeof rt["modifiers"] === "object" && rt["modifiers"] !== null) {
          turnoutMods = rt["modifiers"] as Record<string, Record<string, number>>;
          break;
        }
      }
      if (!turnoutMods) turnoutMods = { voterGroups: { urban_progressives: 0, rural_conservatives: 0, suburban_moderates: 0 } };

      // Remove opaque US entries
      for (const rid of opaqueUsIds) {
        delete regions[rid];
        delete electoratePools[rid];
        delete regionTurnouts[rid];
      }
      // Remove old partyRegions/pressures for US opaque
      for (const key of Object.keys(partyRegions)) {
        if (opaqueUsIds.some((rid) => key.startsWith(`${rid}:`))) delete partyRegions[key];
      }
      for (const key of Object.keys(partyPressures)) {
        if (opaqueUsIds.some((rid) => key.endsWith(`:${rid}`))) delete partyPressures[key];
      }

      // Create new US state regions and support rows
      for (const st of US_STATES_1953) {
        const rid = st.id;
        regions[rid] = { id: rid, countryId: "US", name: st.name, population: st.population, houseSeats: st.houseSeats, senateSeats: st.senateSeats, senateClasses: st.senateClasses, censusRegion: st.region, gdp: st.gdp };
        electoratePools[rid] = { regionId: rid, countryId: "US", independent: avgInd, unregistered: avgUnreg };
        regionTurnouts[rid] = { regionId: rid, countryId: "US", modifiers: JSON.parse(JSON.stringify(turnoutMods)), lastDecayAppliedTurn: 0 };
        for (const pid of usPartyIds) {
          const org = avgOrgByParty.get(pid) ?? 0;
          const reg = avgRegByParty.get(pid) ?? 0;
          const key = `${rid}:${pid}`;
          partyRegions[key] = { regionId: rid, partyId: pid, countryId: "US", organization: org, registration: reg };
          const pkey = `${pid}:${rid}`;
          partyPressures[pkey] = { partyId: pid, regionId: rid, countryId: "US", value: 0 };
        }
      }

      // PriorityRegion remap: drop US-Rx ids (no table); keep others
      if (parties) {
        for (const p of Object.values(parties)) {
          const pr = (p as Record<string, unknown>)["priorityRegion"] as Record<string, unknown> | undefined;
          if (pr && Array.isArray(pr["regionIds"])) {
            const ids = pr["regionIds"] as string[];
            const filtered = ids.filter((id) => !opaqueUsIds.includes(id));
            // If any US opaque was present, drop them; if empty after filter, keep empty
            if (filtered.length !== ids.length) {
              pr["regionIds"] = filtered;
            }
          }
        }
      }
    }
    save.world.meta.schemaVersion = 10;
  }
  // v10 -> v11: W36 membership, caucuses, endorsements
  if (save.schemaVersion < 11) {
    const w = save.world as unknown as Record<string, unknown>;
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player === "object") {
      if (!("partyId" in player) || (player["partyId"] !== null && typeof player["partyId"] !== "string")) {
        if (player["partyId"] === undefined) player["partyId"] = null;
      }
      if (typeof player["partyJoinedTurn"] !== "number" && player["partyJoinedTurn"] !== null) player["partyJoinedTurn"] = null;
      if (typeof player["lastPartySwitchTurn"] !== "number" && player["lastPartySwitchTurn"] !== null) player["lastPartySwitchTurn"] = null;
      if (!Array.isArray(player["purgeRejoinBlocks"])) player["purgeRejoinBlocks"] = [];
      if (!("caucusId" in player) || (player["caucusId"] !== null && typeof player["caucusId"] !== "string")) {
        if (player["caucusId"] === undefined) player["caucusId"] = null;
      }
      // Backfill missing membership fields for pre-v11 saves where player had no partyId
      if (player["partyId"] === undefined) player["partyId"] = null;
    }
    if (!Array.isArray(w["endorsements"])) w["endorsements"] = [];
    // Ensure caucuses memberIds exists (already in v6 but enforce)
    const caucuses = w["caucuses"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(caucuses)) {
      for (const c of caucuses) {
        if (!Array.isArray(c["memberIds"])) c["memberIds"] = [];
        if (typeof c["taxRate"] !== "number") c["taxRate"] = 0;
        if (typeof c["treasury"] !== "number") c["treasury"] = 0;
      }
    }
    save.world.meta.schemaVersion = 11;
  }
  // v11 -> v12: W27 legislation core — bills, committees, enactedLaws, stateBills, player seat/mode
  if (save.schemaVersion < 12) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["bills"])) w["bills"] = [];
    if (!Array.isArray(w["committees"])) w["committees"] = [];
    if (!Array.isArray(w["enactedLaws"])) w["enactedLaws"] = [];
    if (!Array.isArray(w["stateBills"])) w["stateBills"] = [];
    const player = w["player"] as Record<string, unknown> | undefined;
    if (player && typeof player === "object") {
      if (!("legislativeSeat" in player) || (player["legislativeSeat"] !== null && typeof player["legislativeSeat"] !== "object")) {
        if (player["legislativeSeat"] === undefined) player["legislativeSeat"] = null;
      }
      if (player["legislativeSeat"] === undefined) player["legislativeSeat"] = null;
      if (player["mode"] !== "hos" && player["mode"] !== "career") player["mode"] = "career";
    }
    // Ensure every bill has filibusterInvocations and vote maps
    const bills = w["bills"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(bills)) {
      for (const b of bills) {
        if (!Array.isArray(b["filibusterInvocations"])) b["filibusterInvocations"] = [];
        if (typeof b["votes"] !== "object" || b["votes"] === null || Array.isArray(b["votes"])) b["votes"] = {};
      }
    }
    const committees = w["committees"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(committees)) {
      for (const c of committees) {
        if (!Array.isArray(c["memberIds"])) c["memberIds"] = [];
        if (!Array.isArray(c["jurisdiction"])) c["jurisdiction"] = [];
      }
    }
    save.world.meta.schemaVersion = 12;
  }
  // v12 -> v13: W21c live elections. Empty election list; US seated politicians
  // gain deterministic state/class geography (sorted fill, see seatGeography.ts).
  if (save.schemaVersion < 13) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["elections"])) w["elections"] = [];
    assignUsSeatGeography(save.world);
    save.world.meta.schemaVersion = 13;
  }
  // v13 -> v14: W16 demographics (categories, stateDemographics, census, laborForces).
  // Note: if W37 takes v14 in parallel, merge resolver renumbers this to next free.
  if (save.schemaVersion < 14) {
    const w = save.world as unknown as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    if (typeof w["stateDemographics"] !== "object" || w["stateDemographics"] === null || Array.isArray(w["stateDemographics"])) w["stateDemographics"] = {};
    if (typeof w["baselineDemographics"] !== "object" || w["baselineDemographics"] === null || Array.isArray(w["baselineDemographics"])) w["baselineDemographics"] = {};
    if (typeof w["demographicCategories"] !== "object" || w["demographicCategories"] === null || Array.isArray(w["demographicCategories"])) w["demographicCategories"] = {};
    if (typeof w["census"] !== "object" || w["census"] === null || Array.isArray(w["census"])) w["census"] = {};
    if (typeof w["laborForces"] !== "object" || w["laborForces"] === null || Array.isArray(w["laborForces"])) w["laborForces"] = {};

    // If regions exist but demographics are empty, seed uniform stubs so old saves are tally-ready.
    const sd = w["stateDemographics"] as Record<string, unknown>;
    const bd = w["baselineDemographics"] as Record<string, unknown>;
    const lf = w["laborForces"] as Record<string, unknown>;
    const dc = w["demographicCategories"] as Record<string, unknown>;
    if (Object.keys(sd).length === 0 && regions && Object.keys(regions).length > 0) {
      for (const [rid, reg] of Object.entries(regions)) {
        const cid = (reg as { countryId?: string }).countryId ?? "US";
        // Minimal voterGroups stub (two groups) so tally has input; real US data seeded via createWorld on new worlds
        const stubGroups: Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }> = {
          young_renters: { population: 50, economicLean: -1.5, socialLean: -1.5, turnout: 36 },
          evangelicals: { population: 50, economicLean: 2.0, socialLean: 3.5, turnout: 55 },
        };
        sd[rid] = { _id: rid, countryId: cid, categoryWeights: { voterGroups: 100 }, groups: stubGroups, lastUpdated: "1953-01-06T00:00:00.000Z" };
        bd[rid] = JSON.parse(JSON.stringify(sd[rid]));
        const pop = typeof (reg as { population?: number }).population === "number" ? (reg as { population: number }).population : 1_000_000;
        lf[rid] = Math.round(pop * 0.58 * 0.625);
      }
      // Minimal categories
      if (Object.keys(dc).length === 0) {
        dc["US"] = [{ _id: "voterGroups", name: "Voter Groups", defaultWeight: 100, groups: [{ id: "young_renters", name: "Young Renters", defaultEconomicLean: -1.5, defaultSocialLean: -1.5, defaultTurnout: 36 }, { id: "evangelicals", name: "Evangelicals", defaultEconomicLean: 2.0, defaultSocialLean: 3.5, defaultTurnout: 55 }] }];
      }
    }
    // Ensure laborForces and region demographics stocks exist for existing regions
    if (regions) {
      for (const [rid, reg] of Object.entries(regions)) {
        if (typeof (reg as { workingAgePopulation?: number }).workingAgePopulation !== "number") {
          const pop = typeof (reg as { population?: number }).population === "number" ? (reg as { population: number }).population : 1_000_000;
          (reg as Record<string, unknown>)["workingAgePopulation"] = Math.round(pop * 0.58);
          (reg as Record<string, unknown>)["votingEligiblePopulation"] = Math.round(pop * 0.70);
          (reg as Record<string, unknown>)["militaryServicePopulation"] = 0;
        }
        if (typeof lf[rid] !== "number") {
          const pop = typeof (reg as { population?: number }).population === "number" ? (reg as { population: number }).population : 1_000_000;
          lf[rid] = Math.round(pop * 0.58 * 0.625);
        }
      }
    }
    save.world.meta.schemaVersion = 14;
  }
  // v14 -> v15: W2 budgets (national budgets + regional budgets).
  // If W37 races for v14/v15, merge resolver renumbers — note collision for resolver.
  // Seed minimal budgets/regionalBudgets so old saves have fiscal state.
  if (save.schemaVersion < 15) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["budgets"] !== "object" || w["budgets"] === null || Array.isArray(w["budgets"])) w["budgets"] = {};
    if (typeof w["regionalBudgets"] !== "object" || w["regionalBudgets"] === null || Array.isArray(w["regionalBudgets"])) w["regionalBudgets"] = {};
    const budgets = w["budgets"] as Record<string, unknown>;
    const regionalBudgets = w["regionalBudgets"] as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    // If budgets empty but regions exist, synthesize minimal entries per country/region
    if (Object.keys(budgets).length === 0 && regions && Object.keys(regions).length > 0) {
      const countryIds = new Set<string>();
      for (const reg of Object.values(regions)) {
        const cid = (reg as { countryId?: string }).countryId;
        if (typeof cid === "string") countryIds.add(cid);
      }
      for (const cid of countryIds) {
        const gdp = 10_000_000_000;
        budgets[cid] = {
          countryId: cid,
          fiscalYear: 1953,
          gdp,
          population: 1_000_000,
          currencyCode: "USD",
          taxRates: { incomeTax: 25, domesticCorporateTax: 30, foreignCorporateTax: 30, payrollTax: 5, tariffs: 2, salesTax: 5 },
          taxBases: {
            taxableIncome: gdp * 0.3,
            domesticCorporateProfits: gdp * 0.06,
            foreignCorporateProfits: gdp * 0.02,
            wagesAndSalaries: gdp * 0.35,
            importValue: gdp * 0.15,
            taxableSales: gdp * 0.4,
          },
          revenue: { incomeTax: 0, domesticCorporateTax: 0, foreignCorporateTax: 0, payrollTax: 0, tariffs: 0, salesTax: 0, other: 200_000_000, total: 200_000_000 },
          spending: { byCategory: { other: 100_000_000 }, stateGrants: 50_000_000, debtInterest: 10_000_000, total: 160_000_000 },
          debt: { principal: 3_000_000_000, interestRate: 0.03, ceiling: 6_000_000_000 },
          surplus: 40_000_000,
          treasuryBalance: -3_000_000_000,
          creditRating: "BBB",
          economicFactors: { gdpGrowth: 2.5, wageGrowth: 3.0, inflationRate: 2.0, tradeGrowth: 3.0 },
          baselineSpendingByCategory: { other: 100_000_000 },
          baselineStateGrants: 50_000_000,
        };
        // Recompute revenue total correctly
        const b = budgets[cid] as Record<string, unknown> & { revenue: { incomeTax: number; domesticCorporateTax: number; foreignCorporateTax: number; payrollTax: number; tariffs: number; salesTax: number; other: number; total: number }; taxBases: Record<string, number>; taxRates: Record<string, number> };
        b.revenue.incomeTax = Math.round((b.taxBases["taxableIncome"] ?? 0) * ((b.taxRates["incomeTax"] ?? 0) / 100));
        b.revenue.domesticCorporateTax = Math.round((b.taxBases["domesticCorporateProfits"] ?? 0) * ((b.taxRates["domesticCorporateTax"] ?? 0) / 100));
        b.revenue.foreignCorporateTax = Math.round((b.taxBases["foreignCorporateProfits"] ?? 0) * ((b.taxRates["foreignCorporateTax"] ?? 0) / 100));
        b.revenue.payrollTax = Math.round((b.taxBases["wagesAndSalaries"] ?? 0) * ((b.taxRates["payrollTax"] ?? 0) / 100));
        b.revenue.tariffs = Math.round((b.taxBases["importValue"] ?? 0) * ((b.taxRates["tariffs"] ?? 0) / 100));
        b.revenue.salesTax = Math.round((b.taxBases["taxableSales"] ?? 0) * ((b.taxRates["salesTax"] ?? 0) / 100));
        b.revenue.total = b.revenue.incomeTax + b.revenue.domesticCorporateTax + b.revenue.foreignCorporateTax + b.revenue.payrollTax + b.revenue.tariffs + b.revenue.salesTax + b.revenue.other;
        const spending = b["spending"] as { byCategory: Record<string, number>; stateGrants: number; debtInterest: number; total: number };
        (b as Record<string, unknown>)["surplus"] = b.revenue.total - spending.total;
      }
      for (const [rid, reg] of Object.entries(regions)) {
        const cid = (reg as { countryId?: string }).countryId ?? "US";
        if (!regionalBudgets[rid]) {
          regionalBudgets[rid] = {
            regionId: rid,
            countryId: cid,
            revenue: { councilTax: 10_000_000, businessRates: 5_000_000, grant: 5_000_000, total: 20_000_000 },
            spending: { byCategory: { other: 15_000_000 }, total: 15_000_000 },
            balance: 5_000_000,
            consecutiveDeficits: 0,
          };
        }
      }
    }
    save.world.meta.schemaVersion = 15;
  }
  // v15 -> v16: W37 NPC behavior cluster — personality, relationships, sponsor cooldown, stance drift support
  if (save.schemaVersion < 16) {
    const w = save.world as unknown as Record<string, unknown>;
    const politicians = w["politicians"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(politicians)) {
      for (const pol of politicians) {
        if (typeof pol["personality"] !== "object" || pol["personality"] === null || Array.isArray(pol["personality"])) {
          // Deterministic legacy personality from id hash (FNV-1a style) so migrated saves are deterministic
          const id = String(pol["id"] ?? "");
          let h = 0x811c9dc5;
          for (let i = 0; i < id.length; i++) {
            h ^= id.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
          }
          const r = (h >>> 0) / 0xffffffff;
          // Derive three traits from spaced hashes
          const hash2 = (s: string): number => {
            let hh = 0x811c9dc5;
            for (let i = 0; i < s.length; i++) {
              hh ^= s.charCodeAt(i);
              hh = Math.imul(hh, 0x01000193);
            }
            return (hh >>> 0) / 0xffffffff;
          };
          pol["personality"] = {
            loyalty: Math.round(hash2(`${id}:loyalty`) * 100),
            ambition: Math.round(hash2(`${id}:ambition`) * 100),
            stubbornness: Math.round(r * 100),
          };
        } else {
          const p = pol["personality"] as Record<string, unknown>;
          if (typeof p["loyalty"] !== "number") p["loyalty"] = 50;
          if (typeof p["ambition"] !== "number") p["ambition"] = 50;
          if (typeof p["stubbornness"] !== "number") p["stubbornness"] = 50;
        }
      }
    }
    if (typeof w["nppRelationships"] !== "object" || w["nppRelationships"] === null || Array.isArray(w["nppRelationships"])) {
      w["nppRelationships"] = {};
    }
    if (typeof w["nppSponsorLastTurn"] !== "object" || w["nppSponsorLastTurn"] === null || Array.isArray(w["nppSponsorLastTurn"])) {
      w["nppSponsorLastTurn"] = {};
    }
    save.world.meta.schemaVersion = 16;
  }
  // v16 -> v17: W3 central banks (this worktree branched at v15; v16 is another
  // wave's pre-allocated slot merging in parallel. Written as a direct jump to
  // the target v17 per the wave brief — the merge resolver may need to split
  // this into a proper v15->v16 (whatever v16's wave adds) -> v16->v17 (this
  // block, renumbered) chain depending on merge order. Seeds one central bank
  // per playable country (mirrors world.ts seedCentralBanks): bootstrapped
  // directly in autonomous "npp" chair mode at that country's defaultPrimeRate
  // anchor, term expiring at CHAIR_TERM_TURNS from now (not from turn 0 — an
  // in-progress save should not immediately roll the chair on load).
  if (save.schemaVersion < 17) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["centralBanks"] !== "object" || w["centralBanks"] === null || Array.isArray(w["centralBanks"])) {
      w["centralBanks"] = {};
    }
    const centralBanks = w["centralBanks"] as Record<string, unknown>;
    const countries = w["countries"] as Record<string, Record<string, unknown>> | undefined;
    const meta = w["meta"] as Record<string, unknown> | undefined;
    const currentTurn = typeof meta?.["turn"] === "number" ? (meta["turn"] as number) : 0;
    if (countries) {
      for (const [countryId, country] of Object.entries(countries)) {
        if (country["playable"] !== true) continue;
        if (centralBanks[countryId]) continue;
        const anchor = CENTRAL_BANK_COUNTRY_ANCHORS[countryId];
        if (!anchor) continue;
        centralBanks[countryId] = {
          countryId,
          primeRate: anchor.defaultPrimeRate,
          chairMode: "npp",
          chairAlignment: null,
          chairInfamy: 0,
          resolveStreak: 0,
          lastRateChangeTurn: null,
          chairTermExpiresAtTurn: currentTurn + CHAIR_TERM_TURNS,
          interestRateHistory: [],
        };
      }
    }
    save.world.meta.schemaVersion = 17;
  }
  // v17 -> v18: W39 UK/RU/DD subdivisions — replace opaque UK-R1..R3, RU-R1..R3, DD-R1..R3 with real tables.
  // Pre-allocated v18 for this wave; parallel waves hold 16 and 17. Note for merge resolver: renumber to next free if collision.
  // Bridge decision: same deterministic averaged-split approach as W38's US bridge (docs/support/W19_BRIDGE.md): pooled org/reg totals across 3 opaque regions are averaged and assigned uniformly to new subdivisions. Sorted tables ensure determinism. UK 12 regions (1951 Census, 625 commons), RU 14 (1939/1950 Census, 526 Union seats), DD 6 Laender (18.4M, 500 Volkskammer). Demographics for new regions are seeded as uniform stubs here; new worlds use Layer1-derived tables via seedDemographics.
  if (save.schemaVersion < 18) {
    const w = save.world as unknown as Record<string, unknown>;
    const regions = w["regions"] as Record<string, Record<string, unknown>> | undefined;
    const partyRegions = w["partyRegions"] as Record<string, Record<string, unknown>> | undefined;
    const electoratePools = w["electoratePools"] as Record<string, Record<string, unknown>> | undefined;
    const regionTurnouts = w["regionTurnouts"] as Record<string, Record<string, unknown>> | undefined;
    const partyPressures = w["partyPressures"] as Record<string, Record<string, unknown>> | undefined;
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    const stateDemographics = w["stateDemographics"] as Record<string, unknown> | undefined;
    const baselineDemographics = w["baselineDemographics"] as Record<string, unknown> | undefined;
    const laborForces = w["laborForces"] as Record<string, unknown> | undefined;
    const demographicCategories = w["demographicCategories"] as Record<string, unknown> | undefined;

    // Inline real region metadata for migration (sorted for determinism). Sources: ukRegions1953.ts, ruRegions1953.ts, ddRegions1953.ts
    const UK_REGIONS_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
      { id: "EAE", name: "East of England", population: 3700000, houseSeats: 47, senateSeats: 39, senateClasses: [1, 2], region: "East of England", gdp: 1300 },
      { id: "EMI", name: "East Midlands", population: 3200000, houseSeats: 37, senateSeats: 39, senateClasses: [1, 2], region: "East Midlands", gdp: 1100 },
      { id: "LON", name: "London", population: 8200000, houseSeats: 91, senateSeats: 32, senateClasses: [1, 2], region: "London", gdp: 3800 },
      { id: "NEE", name: "North East England", population: 3100000, houseSeats: 27, senateSeats: 17, senateClasses: [1, 2], region: "North East", gdp: 1000 },
      { id: "NIR", name: "Northern Ireland", population: 1400000, houseSeats: 12, senateSeats: 90, senateClasses: [1, 2], region: "Northern Ireland", gdp: 370 },
      { id: "NWE", name: "North West England", population: 6500000, houseSeats: 75, senateSeats: 27, senateClasses: [1, 2], region: "North West", gdp: 2400 },
      { id: "SCO", name: "Scotland", population: 5100000, houseSeats: 71, senateSeats: 129, senateClasses: [1, 2], region: "Scotland", gdp: 1500 },
      { id: "SEE", name: "South East England", population: 6100000, houseSeats: 81, senateSeats: 67, senateClasses: [1, 2], region: "South East", gdp: 2800 },
      { id: "SWE", name: "South West England", population: 3400000, houseSeats: 43, senateSeats: 39, senateClasses: [1, 2], region: "South West", gdp: 1200 },
      { id: "WAL", name: "Wales", population: 2600000, houseSeats: 36, senateSeats: 60, senateClasses: [1, 2], region: "Wales", gdp: 630 },
      { id: "WMI", name: "West Midlands", population: 4700000, houseSeats: 53, senateSeats: 18, senateClasses: [1, 2], region: "West Midlands", gdp: 1900 },
      { id: "YHU", name: "Yorkshire & the Humber", population: 4600000, houseSeats: 52, senateSeats: 21, senateClasses: [1, 2], region: "Yorkshire", gdp: 1800 },
    ];
    const RU_REGIONS_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
      { id: "CAS", name: "Central Asia", population: 14000000, houseSeats: 50, senateSeats: 500, senateClasses: [1, 2], region: "Central Asia", gdp: 58333 },
      { id: "CBE", name: "Central Black Earth", population: 8500000, houseSeats: 30, senateSeats: 164, senateClasses: [1, 2], region: "Russia", gdp: 37500 },
      { id: "CEN", name: "Central Russia", population: 22500000, houseSeats: 80, senateSeats: 575, senateClasses: [1, 2], region: "Russia", gdp: 179167 },
      { id: "ESB", name: "East Siberia", population: 6000000, houseSeats: 21, senateSeats: 164, senateClasses: [1, 2], region: "Russia", gdp: 45833 },
      { id: "FEA", name: "Russian Far East", population: 5200000, houseSeats: 18, senateSeats: 143, senateClasses: [1, 2], region: "Russia", gdp: 41667 },
      { id: "KAZ", name: "Kazakhstan", population: 8500000, houseSeats: 30, senateSeats: 510, senateClasses: [1, 2], region: "Kazakhstan", gdp: 45833 },
      { id: "MOL", name: "Moldova", population: 2500000, houseSeats: 9, senateSeats: 350, senateClasses: [1, 2], region: "Moldova", gdp: 12500 },
      { id: "NCA", name: "North Caucasus", population: 13000000, houseSeats: 46, senateSeats: 307, senateClasses: [1, 2], region: "Russia", gdp: 66667 },
      { id: "NOR", name: "European North", population: 4800000, houseSeats: 17, senateSeats: 123, senateClasses: [1, 2], region: "Russia", gdp: 33333 },
      { id: "NWR", name: "Northwest Russia", population: 10500000, houseSeats: 37, senateSeats: 266, senateClasses: [1, 2], region: "Russia", gdp: 91667 },
      { id: "TRA", name: "Transcaucasia", population: 11000000, houseSeats: 39, senateSeats: 440, senateClasses: [1, 2], region: "Caucasus", gdp: 58333 },
      { id: "URA", name: "Urals", population: 15500000, houseSeats: 55, senateSeats: 389, senateClasses: [1, 2], region: "Russia", gdp: 158333 },
      { id: "VOL", name: "Volga", population: 17000000, houseSeats: 60, senateSeats: 410, senateClasses: [1, 2], region: "Russia", gdp: 116667 },
      { id: "WSB", name: "West Siberia", population: 9500000, houseSeats: 34, senateSeats: 246, senateClasses: [1, 2], region: "Russia", gdp: 83333 },
    ];
    const DD_REGIONS_1953: Array<{ id: string; name: string; population: number; houseSeats: number; senateSeats: number; senateClasses: [1 | 2 | 3, 1 | 2 | 3]; region: string; gdp: number }> = [
      { id: "BB", name: "Brandenburg", population: 2620000, houseSeats: 71, senateSeats: 11, senateClasses: [1, 2], region: "North", gdp: 5600 },
      { id: "BEO", name: "Berlin (Ost)", population: 1190000, houseSeats: 32, senateSeats: 5, senateClasses: [1, 2], region: "Berlin", gdp: 5200 },
      { id: "MV", name: "Mecklenburg-Vorpommern", population: 2120000, houseSeats: 58, senateSeats: 9, senateClasses: [1, 2], region: "North", gdp: 3900 },
      { id: "SN", name: "Sachsen", population: 5560000, houseSeats: 151, senateSeats: 24, senateClasses: [1, 2], region: "South", gdp: 13900 },
      { id: "ST", name: "Sachsen-Anhalt", population: 4120000, houseSeats: 112, senateSeats: 18, senateClasses: [1, 2], region: "North", gdp: 9900 },
      { id: "TH", name: "Thüringen", population: 2790000, houseSeats: 76, senateSeats: 13, senateClasses: [1, 2], region: "South", gdp: 5500 },
    ];

    function migrateCountry(countryId: string, opaqueIds: string[], realRegions: typeof UK_REGIONS_1953) {
      if (!regions || !partyRegions || !electoratePools || !regionTurnouts || !partyPressures) return;
      const hasOpaque = opaqueIds.some((id) => id in regions);
      if (!hasOpaque) return;
      const countryPartyIds = parties ? Object.keys(parties).filter((pid) => (parties[pid] as Record<string, unknown>)["countryId"] === countryId) : [];
      const avgOrgByParty = new Map<string, number>();
      const avgRegByParty = new Map<string, number>();
      for (const pid of countryPartyIds) {
        let sumOrg = 0, sumReg = 0, count = 0;
        for (const rid of opaqueIds) {
          const key = `${rid}:${pid}`;
          const pr = partyRegions[key] as Record<string, unknown> | undefined;
          if (pr && typeof pr["organization"] === "number" && typeof pr["registration"] === "number") {
            sumOrg += pr["organization"] as number;
            sumReg += pr["registration"] as number;
            count++;
          }
        }
        avgOrgByParty.set(pid, count ? Math.round(sumOrg / count) : 0);
        avgRegByParty.set(pid, count ? Math.round(sumReg / count) : 0);
      }
      let sumInd = 0, sumUnreg = 0, countPools = 0;
      for (const rid of opaqueIds) {
        const pool = electoratePools[rid] as Record<string, unknown> | undefined;
        if (pool && typeof pool["independent"] === "number" && typeof pool["unregistered"] === "number") {
          sumInd += pool["independent"] as number;
          sumUnreg += pool["unregistered"] as number;
          countPools++;
        }
      }
      const avgInd = countPools ? Math.round(sumInd / countPools) : (countryId === "UK" ? 8 : countryId === "RU" ? 3 : 5);
      const avgUnreg = countPools ? Math.round(sumUnreg / countPools) : (countryId === "UK" ? 8 : countryId === "RU" ? 2 : 3);
      let turnoutMods: Record<string, Record<string, number>> | null = null;
      for (const rid of opaqueIds) {
        const rt = regionTurnouts[rid] as Record<string, unknown> | undefined;
        if (rt && typeof rt["modifiers"] === "object" && rt["modifiers"] !== null) {
          turnoutMods = rt["modifiers"] as Record<string, Record<string, number>>;
          break;
        }
      }
      if (!turnoutMods) {
        const groups: string[] = countryId === "UK" ? ["urban_progressives", "rural_traditionalists", "suburban_centrists"] : countryId === "RU" ? ["workers", "urban_progressives"] : ["workers", "bloc_centrists"];
        const mods: Record<string, number> = {};
        for (const g of groups) mods[g] = 0;
        turnoutMods = { voterGroups: mods } as unknown as Record<string, Record<string, number>>;
      }
      for (const rid of opaqueIds) {
        delete regions[rid];
        delete electoratePools[rid];
        delete regionTurnouts[rid];
      }
      for (const key of Object.keys(partyRegions)) {
        if (opaqueIds.some((rid) => key.startsWith(`${rid}:`))) delete partyRegions[key];
      }
      for (const key of Object.keys(partyPressures)) {
        if (opaqueIds.some((rid) => key.endsWith(`:${rid}`))) delete partyPressures[key];
      }
      for (const st of realRegions) {
        const rid = st.id;
        regions[rid] = { id: rid, countryId, name: st.name, population: st.population, houseSeats: st.houseSeats, senateSeats: st.senateSeats, senateClasses: st.senateClasses, censusRegion: st.region, gdp: st.gdp };
        electoratePools[rid] = { regionId: rid, countryId, independent: avgInd, unregistered: avgUnreg };
        regionTurnouts[rid] = { regionId: rid, countryId, modifiers: JSON.parse(JSON.stringify(turnoutMods)), lastDecayAppliedTurn: 0 };
        for (const pid of countryPartyIds) {
          const org = avgOrgByParty.get(pid) ?? 0;
          const reg = avgRegByParty.get(pid) ?? 0;
          const key = `${rid}:${pid}`;
          partyRegions[key] = { regionId: rid, partyId: pid, countryId, organization: org, registration: reg };
          const pkey = `${pid}:${rid}`;
          partyPressures[pkey] = { partyId: pid, regionId: rid, countryId, value: 0 };
        }
      }
      if (parties) {
        for (const p of Object.values(parties)) {
          const pr = (p as Record<string, unknown>)["priorityRegion"] as Record<string, unknown> | undefined;
          if (pr && Array.isArray(pr["regionIds"])) {
            const ids = pr["regionIds"] as string[];
            const filtered = ids.filter((id) => !opaqueIds.includes(id));
            if (filtered.length !== ids.length) pr["regionIds"] = filtered;
          }
        }
      }
      // Seed demographics stubs for new regions if missing (so tally has input; real tables used for new worlds via seedDemographics)
      if (stateDemographics && baselineDemographics && laborForces && demographicCategories) {
        for (const st of realRegions) {
          const rid = st.id;
          if (typeof stateDemographics[rid] === "undefined") {
            const catList = (demographicCategories as Record<string, unknown>)[countryId] as Array<{ _id: string; defaultWeight: number; groups: Array<{ id: string; defaultEconomicLean: number; defaultSocialLean: number; defaultTurnout?: number }> }> | undefined;
            const catsFor = Array.isArray(catList) ? catList : [];
            const groups: Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }> = {};
            for (const cat of catsFor) {
              const share = 100 / cat.groups.length;
              for (const g of cat.groups) groups[g.id] = { population: Math.round(share*100)/100, economicLean: g.defaultEconomicLean, socialLean: g.defaultSocialLean, turnout: g.defaultTurnout ?? 50 };
            }
            const total = Object.values(groups).reduce((s,v)=>s+v.population,0);
            const diff = Math.round((100-total)*100)/100;
            if (Math.abs(diff)>0.001) {
              const first = Object.keys(groups)[0];
              if (first) groups[first]!.population = Math.round((groups[first]!.population+diff)*100)/100;
            }
            const weights: Record<string, number> = {};
            for (const c of catsFor) weights[c._id]=c.defaultWeight;
            const nowIso = (w["meta"] as Record<string, unknown>)?.["date"] as string ?? "1953-01-06T00:00:00.000Z";
            const demo = { _id: rid, countryId, categoryWeights: weights, groups, lastUpdated: nowIso };
            stateDemographics[rid] = demo;
            baselineDemographics[rid] = JSON.parse(JSON.stringify(demo));
            const pop = st.population;
            const workingAge = Math.round(pop*0.58);
            laborForces[rid] = Math.round(workingAge*0.625);
            (regions[rid] as Record<string, unknown>)["workingAgePopulation"] = workingAge;
            (regions[rid] as Record<string, unknown>)["votingEligiblePopulation"] = Math.round(pop*0.70);
            (regions[rid] as Record<string, unknown>)["militaryServicePopulation"] = 0;
          }
        }
      }
    }

    migrateCountry("UK", ["UK-R1", "UK-R2", "UK-R3"], UK_REGIONS_1953);
    migrateCountry("RU", ["RU-R1", "RU-R2", "RU-R3"], RU_REGIONS_1953);
    migrateCountry("DD", ["DD-R1", "DD-R2", "DD-R3"], DD_REGIONS_1953);

    save.world.meta.schemaVersion = 18;
  }
  // v18 -> v19: W9 corporations. This worktree branched at v17; v18 is another
  // wave's pre-allocated slot merging in parallel. Written as a direct jump to
  // the target v19 per the wave brief — the merge resolver may need to split
  // this into a proper v17->v18 (whatever v18's wave adds) -> v18->v19 (this
  // block, renumbered) chain depending on merge order.
  //
  // Seeds corporations for every playable country with authored 1953 sector
  // weights, exactly as world.ts createWorld does — but from a migration-only
  // rng derived from the save's own seed (never the save's live meta.rng
  // state: that stream must stay untouched so future turns continue exactly
  // where an in-progress campaign left off). A save loaded mid-campaign gets
  // corporations "founded" at the save's current turn rather than turn 0 —
  // there is no way to reconstruct what turn-0 founding would have produced
  // without replaying the whole campaign, and founding-at-load is the same
  // shape as a fresh createWorld seed step, just later.
  if (save.schemaVersion < 19) {
    const w = save.world as unknown as Record<string, unknown>;
    if (typeof w["corporations"] !== "object" || w["corporations"] === null || Array.isArray(w["corporations"])) {
      const countries = w["countries"] as Record<string, { id: string; playable: boolean; economy: { gdp: number; growthRate: number } }> | undefined;
      const turn = typeof (w["meta"] as Record<string, unknown> | undefined)?.["turn"] === "number" ? ((w["meta"] as Record<string, unknown>)["turn"] as number) : 0;
      const seed = typeof (w["meta"] as Record<string, unknown> | undefined)?.["seed"] === "string" ? ((w["meta"] as Record<string, unknown>)["seed"] as string) : "migration";
      const migrationRng = rngFromSeed(`${seed}:corp-migration-v19`);
      const corporations = countries
        ? seedCorporations(
            Object.values(countries).map((c) => ({ id: c.id, playable: c.playable, gdp: c.economy.gdp, growthRate: c.economy.growthRate })),
            migrationRng,
            turn,
          )
        : {};
      w["corporations"] = corporations;
      const corpRevenueSnapshots: Record<string, { current: number; previous: number; turn: number }> = {};
      for (const corp of Object.values(corporations)) {
        const existing = corpRevenueSnapshots[corp.countryId];
        const total = (existing?.current ?? 0) + corp.revenue;
        corpRevenueSnapshots[corp.countryId] = { current: total, previous: total, turn };
      }
      w["corpRevenueSnapshots"] = corpRevenueSnapshots;
    }
    if (typeof w["corpRevenueSnapshots"] !== "object" || w["corpRevenueSnapshots"] === null || Array.isArray(w["corpRevenueSnapshots"])) {
      w["corpRevenueSnapshots"] = {};
    }
    save.world.meta.schemaVersion = 19;
  }
  // v19 -> v20: W26 campaigns — add the new `campaigns` map (empty for
  // every pre-existing save; campaigns are created going forward by
  // elections/orchestration.ts + elections/candidacy.ts as candidates enter
  // campaign-eligible races). Pre-allocated v20 for this wave; v19 and v21
  // are held by parallel waves. RESOLVER NOTE: this block only touches the
  // `campaigns` field and is safe to run in either order relative to
  // whatever v19 adds — on merge, chain the blocks in strict ascending
  // schemaVersion order (v18 -> v19 -> v20) and confirm v19 does not also
  // introduce a field named `campaigns` (it should not; W26 is authoritative
  // for that name).
  if (save.schemaVersion < 20) {
    const w = save.world as unknown as Record<string, unknown>;
    if (w["campaigns"] == null || typeof w["campaigns"] !== "object") {
      w["campaigns"] = {};
    }
    save.world.meta.schemaVersion = 20;
  }
  // v20 -> v21: W20 intra-party democracy (state/national/committee elections + coalitions).
  // Pre-allocated v21: mainline is v18; parallel waves hold v19 and v20. This migration jumps
  // from latest known (v18) to v21. Merge resolver note: if v19/v20 land before this, split this
  // block into chained v18->v19 (their wave) ->v19->v20 (their wave) ->v20->v21 (this block renumbered)
  // and adjust SCHEMA_VERSION sequencing accordingly. Splitting is mechanical: rename the version guard
  // below and preserve ordering.
  // Seeds empty coalition array and empty intra-party election arrays; backfills Party leadership fields
  // (chairId/viceChairId/treasurerId/committeeIds) and PartyRegion chair fields so older saves load.
  if (save.schemaVersion < 21) {
    const w = save.world as unknown as Record<string, unknown>;
    if (!Array.isArray(w["statePartyElections"])) w["statePartyElections"] = [];
    if (!Array.isArray(w["nationalPartyElections"])) w["nationalPartyElections"] = [];
    if (!Array.isArray(w["nationalCommitteeElections"])) w["nationalCommitteeElections"] = [];
    if (!Array.isArray(w["coalitions"])) w["coalitions"] = [];
    const parties = w["parties"] as Record<string, Record<string, unknown>> | undefined;
    if (parties) {
      for (const p of Object.values(parties)) {
        if (!("chairId" in p) || p["chairId"] === undefined) p["chairId"] = null;
        if (!("viceChairId" in p) || p["viceChairId"] === undefined) p["viceChairId"] = null;
        if (!("treasurerId" in p) || p["treasurerId"] === undefined) p["treasurerId"] = null;
        if (!Array.isArray(p["committeeIds"])) p["committeeIds"] = [];
      }
    }
    const partyRegions = w["partyRegions"] as Record<string, Record<string, unknown>> | undefined;
    if (partyRegions) {
      for (const pr of Object.values(partyRegions)) {
        if (!("chairId" in pr) || pr["chairId"] === undefined) pr["chairId"] = null;
        if (!("viceChairId" in pr) || pr["viceChairId"] === undefined) pr["viceChairId"] = null;
        if (!("treasurerId" in pr) || pr["treasurerId"] === undefined) pr["treasurerId"] = null;
      }
    }
    // Ensure v19/v20 gaps are marked as passed through for chained migration tests
    save.world.meta.schemaVersion = 21;
  }
  return save.world;
}
