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
  return save.world;
}
