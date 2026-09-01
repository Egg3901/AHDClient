import { SCHEMA_VERSION } from "./world.js";
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
  return save.world;
}
