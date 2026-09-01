import { BaseDirectory } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  rename,
  readDir,
  remove,
} from "@tauri-apps/plugin-fs";
import { serializeSave, deserializeSave } from "@rotunda/engine";
import type { WorldState } from "@rotunda/engine";

export const SAVES_DIR = "saves";
export const INDEX_FILE = "saves/index.json";
export const AUTOSAVE_A = "autosave-a";
export const AUTOSAVE_B = "autosave-b";
export const AUTOSAVE_SLOTS = [AUTOSAVE_A, AUTOSAVE_B] as const;

export interface SaveSlotMeta {
  slot: string;
  savedAt: string;
  turn: number;
  date: string;
  era: string;
  country: string;
  playerName: string;
  cheatsUsed: boolean;
}

export interface SaveIndex {
  version: 1;
  slots: SaveSlotMeta[];
}

const SLOT_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const RESERVED_RE = /^autosave-[ab]$/;

export function isValidSlotName(slot: string): boolean {
  if (RESERVED_RE.test(slot)) return true;
  return SLOT_RE.test(slot);
}

export function isAutosaveSlot(slot: string): boolean {
  return RESERVED_RE.test(slot);
}

function slotPath(slot: string): string {
  return `${SAVES_DIR}/${slot}.json`;
}

function tmpPath(slot: string): string {
  return `${SAVES_DIR}/${slot}.json.tmp`;
}

function buildMeta(slot: string, world: WorldState, savedAt: string): SaveSlotMeta {
  const meta = world.meta as unknown as Record<string, unknown>;
  const player = world.player as unknown as Record<string, unknown>;
  return {
    slot,
    savedAt,
    turn: typeof meta["turn"] === "number" ? (meta["turn"] as number) : 0,
    date: typeof meta["date"] === "string" ? (meta["date"] as string) : "",
    era: typeof meta["era"] === "string" ? (meta["era"] as string) : "",
    country: typeof player["countryId"] === "string" ? (player["countryId"] as string) : "",
    playerName: typeof player["name"] === "string" ? (player["name"] as string) : "",
    cheatsUsed: typeof meta["cheatsUsed"] === "boolean" ? (meta["cheatsUsed"] as boolean) : false,
  };
}

export async function ensureSavesDir(): Promise<void> {
  try {
    const ok = await exists(SAVES_DIR, { baseDir: BaseDirectory.AppData });
    if (!ok) {
      await mkdir(SAVES_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }
  } catch {
    // mkdir with recursive should succeed even if already exists
    try {
      await mkdir(SAVES_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    } catch {
      // ignore
    }
  }
}

async function readIndex(): Promise<SaveIndex | null> {
  try {
    const raw = await readTextFile(INDEX_FILE, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw) as SaveIndex;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.slots)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeIndex(index: SaveIndex): Promise<void> {
  await ensureSavesDir();
  const raw = JSON.stringify(index);
  const tmp = `${INDEX_FILE}.tmp`;
  await writeTextFile(tmp, raw, { baseDir: BaseDirectory.AppData });
  await rename(tmp, INDEX_FILE, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

async function updateIndexEntry(meta: SaveSlotMeta): Promise<void> {
  await ensureSavesDir();
  const idx = (await readIndex()) ?? { version: 1 as const, slots: [] };
  const pos = idx.slots.findIndex((s) => s.slot === meta.slot);
  if (pos >= 0) idx.slots[pos] = meta;
  else idx.slots.push(meta);
  idx.slots.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  await writeIndex(idx);
}

async function removeIndexEntry(slot: string): Promise<void> {
  const idx = await readIndex();
  if (!idx) return;
  const filtered = idx.slots.filter((s) => s.slot !== slot);
  if (filtered.length === idx.slots.length) return;
  idx.slots = filtered;
  await writeIndex(idx);
}

export async function saveToSlot(slot: string, world: WorldState): Promise<SaveSlotMeta> {
  if (!isValidSlotName(slot)) {
    throw new Error(`Invalid slot name "${slot}": use letters, numbers, dash or underscore, 1-64 chars`);
  }
  await ensureSavesDir();
  const savedAt = new Date().toISOString();
  const payload = serializeSave(world, savedAt);
  const tmp = tmpPath(slot);
  const target = slotPath(slot);
  // Crash-safe: write to tmp, then rename atomically. Never truncate target first.
  await writeTextFile(tmp, payload, { baseDir: BaseDirectory.AppData });
  await rename(tmp, target, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
  const meta = buildMeta(slot, world, savedAt);
  await updateIndexEntry(meta);
  return meta;
}

export async function loadFromSlot(slot: string): Promise<WorldState> {
  if (!isValidSlotName(slot)) throw new Error(`Invalid slot name "${slot}"`);
  const target = slotPath(slot);
  const raw = await readTextFile(target, { baseDir: BaseDirectory.AppData });
  return deserializeSave(raw);
}

export async function deleteSlot(slot: string): Promise<void> {
  if (!isValidSlotName(slot)) throw new Error(`Invalid slot name "${slot}"`);
  const target = slotPath(slot);
  try {
    await remove(target, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    // if file doesn't exist, treat as success but still clean index
    const msg = e instanceof Error ? e.message : String(e);
    // check existence first to decide
    try {
      const ok = await exists(target, { baseDir: BaseDirectory.AppData });
      if (ok) throw new Error(msg);
    } catch {
      throw e;
    }
  }
  await removeIndexEntry(slot);
  // also clean tmp if left behind
  try {
    const t = tmpPath(slot);
    const ok = await exists(t, { baseDir: BaseDirectory.AppData });
    if (ok) await remove(t, { baseDir: BaseDirectory.AppData });
  } catch {
    // ignore
  }
}

export async function listSlots(): Promise<SaveSlotMeta[]> {
  await ensureSavesDir();
  const idx = await readIndex();
  if (idx && idx.slots.length > 0) {
    // Verify files still exist; filter stale entries
    const verified: SaveSlotMeta[] = [];
    for (const m of idx.slots) {
      try {
        const ok = await exists(slotPath(m.slot), { baseDir: BaseDirectory.AppData });
        if (ok) verified.push(m);
      } catch {
        // ignore
      }
    }
    // If stale entries found, rewrite index
    if (verified.length !== idx.slots.length) {
      await writeIndex({ version: 1, slots: verified });
    }
    // Include any files not in index (recovery)
    try {
      const entries = await readDir(SAVES_DIR, { baseDir: BaseDirectory.AppData });
      for (const e of entries) {
        if (!e.isFile) continue;
        if (!e.name.endsWith(".json")) continue;
        if (e.name === "index.json") continue;
        if (e.name.endsWith(".tmp")) continue;
        const slot = e.name.slice(0, -5);
        if (!isValidSlotName(slot)) continue;
        if (verified.some((v) => v.slot === slot)) continue;
        // Try to read meta from file
        try {
          const raw = await readTextFile(slotPath(slot), { baseDir: BaseDirectory.AppData });
          const world = deserializeSave(raw);
          // Derive savedAt from file mtime fallback? Use now
          const meta = buildMeta(slot, world, new Date().toISOString());
          verified.push(meta);
        } catch {
          // unreadable file skip
        }
      }
      if (verified.length !== idx.slots.length) {
        verified.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
        await writeIndex({ version: 1, slots: verified });
      }
    } catch {
      // ignore dir read failure
    }
    return verified.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }
  // No index: scan directory
  try {
    const entries = await readDir(SAVES_DIR, { baseDir: BaseDirectory.AppData });
    const out: SaveSlotMeta[] = [];
    for (const e of entries) {
      if (!e.isFile) continue;
      if (e.name === "index.json") continue;
      if (e.name.endsWith(".tmp")) continue;
      if (!e.name.endsWith(".json")) continue;
      const slot = e.name.slice(0, -5);
      if (!isValidSlotName(slot)) continue;
      try {
        const raw = await readTextFile(slotPath(slot), { baseDir: BaseDirectory.AppData });
        const world = deserializeSave(raw);
        // Try to parse savedAt from envelope
        let savedAt = new Date().toISOString();
        try {
          const parsed = JSON.parse(raw) as { savedAt?: string };
          if (typeof parsed.savedAt === "string") savedAt = parsed.savedAt;
        } catch {
          // ignore
        }
        out.push(buildMeta(slot, world, savedAt));
      } catch {
        // skip unreadable
      }
    }
    out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    if (out.length > 0) {
      await writeIndex({ version: 1, slots: out });
    }
    return out;
  } catch {
    return [];
  }
}

export async function readSlotRaw(slot: string): Promise<string> {
  if (!isValidSlotName(slot)) throw new Error(`Invalid slot name "${slot}"`);
  return readTextFile(slotPath(slot), { baseDir: BaseDirectory.AppData });
}

// -------------------------------------------------------------------
// Autosave helpers (persisted in localStorage)
// -------------------------------------------------------------------

export type AutosaveInterval = 2 | 4 | 8;
export interface AutosaveConfig {
  enabled: boolean;
  interval: AutosaveInterval;
  nextSlotIndex: 0 | 1;
}

const LS_KEY = "rotunda.autosave.config";

export function getAutosaveConfig(): AutosaveConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutosaveConfig>;
      const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : true;
      const intervalRaw = parsed.interval;
      const interval: AutosaveInterval = intervalRaw === 2 || intervalRaw === 8 ? intervalRaw : 4;
      const nextSlotIndex: 0 | 1 = parsed.nextSlotIndex === 1 ? 1 : 0;
      return { enabled, interval, nextSlotIndex };
    }
  } catch {
    // ignore
  }
  return { enabled: true, interval: 4, nextSlotIndex: 0 };
}

export function setAutosaveConfig(cfg: AutosaveConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function getNextAutosaveSlot(): string {
  const cfg = getAutosaveConfig();
  const slot = cfg.nextSlotIndex === 0 ? AUTOSAVE_A : AUTOSAVE_B;
  cfg.nextSlotIndex = cfg.nextSlotIndex === 0 ? 1 : 0;
  setAutosaveConfig(cfg);
  return slot;
}

export function peekNextAutosaveSlot(): string {
  const cfg = getAutosaveConfig();
  return cfg.nextSlotIndex === 0 ? AUTOSAVE_A : AUTOSAVE_B;
}

function shouldTriggerAutosave(prevTurn: number, newTurn: number, interval: AutosaveInterval): boolean {
  if (!Number.isFinite(prevTurn) || !Number.isFinite(newTurn)) return false;
  if (newTurn <= prevTurn) return false;
  return Math.floor(newTurn / interval) > Math.floor(prevTurn / interval);
}

/**
 * Maybe autosave after turn advancement.
 * prevTurn is turn before advance, world is after.
 * Returns saved slot name if autosaved, else null.
 */
export async function maybeAutosave(prevTurn: number, world: WorldState): Promise<string | null> {
  const cfg = getAutosaveConfig();
  if (!cfg.enabled) return null;
  const newTurn = world.meta.turn;
  if (!shouldTriggerAutosave(prevTurn, newTurn, cfg.interval)) return null;
  const slot = getNextAutosaveSlot();
  await saveToSlot(slot, world);
  return slot;
}
