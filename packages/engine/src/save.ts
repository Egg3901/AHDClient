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
  return save.world;
}
