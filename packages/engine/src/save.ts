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
  return save.world;
}
