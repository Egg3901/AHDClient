import { invoke } from "@tauri-apps/api/core";

/**
 * A world is a directory under the app's data folder holding a MongoDB data
 * directory, the mirrored art and a small metadata file. The Rust side owns
 * the directory; this module is the typed edge of those commands.
 */
export interface WorldMeta {
  slot: string;
  name: string;
  preset: string;
  createdAt: string;
  lastPlayedAt: string;
  turn: number | null;
  character: string | null;
}

export interface GameInfo {
  running: boolean;
  port: number | null;
  slot: string | null;
  url: string | null;
}

/** What the game reports about a world once its server is up. */
export interface SingleplayerStatus {
  hasWorld: boolean;
  turn: number | null;
  preset: string | null;
  hasCharacter: boolean;
  characterName: string | null;
}

export interface Era {
  /** Year, which is also the key CommandGlobe themes by. */
  id: string;
  /** The AHDGame reset preset that builds this world. */
  preset: string;
  label: string;
  subtitle: string;
  startDate: string;
}

/** Every era the game can seed, oldest first. Mirrors AHDGame's presets. */
export const ERAS: readonly Era[] = [
  { id: "1953", preset: "1953-default", label: "1953", subtitle: "Cold War dawn", startDate: "January 1953" },
  { id: "1979", preset: "1979-default", label: "1979", subtitle: "Late Cold War", startDate: "January 1979" },
  { id: "1991", preset: "1991-default", label: "1991", subtitle: "New world order", startDate: "January 1991" },
  { id: "1999", preset: "1999-default", label: "1999", subtitle: "Peak globalisation", startDate: "January 1999" },
  { id: "2007", preset: "2007-default", label: "2007", subtitle: "Before the crash", startDate: "January 2007" },
  { id: "2019", preset: "2019-default", label: "2019", subtitle: "Contemporary politics", startDate: "January 2019" },
  { id: "2023", preset: "2023-default", label: "2023", subtitle: "Realignment", startDate: "January 2023" },
];

export function eraById(id: string): Era | undefined {
  return ERAS.find((era) => era.id === id);
}

export function eraForPreset(preset: string | null | undefined): Era | undefined {
  return ERAS.find((era) => era.preset === preset);
}

/**
 * Directory-safe slot from a display name, unique among the slots taken.
 * "Cold War, 1953" becomes "cold-war-1953", then "cold-war-1953-2" if needed.
 */
export function slugForWorld(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "world";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

export const worlds = {
  list: () => invoke<WorldMeta[]>("list_worlds"),
  create: (slot: string, name: string, preset: string) => invoke<WorldMeta>("create_world", { slot, name, preset }),
  touch: (slot: string, turn?: number | null, character?: string | null) =>
    invoke<WorldMeta>("touch_world", { slot, turn: turn ?? null, character: character ?? null }),
  remove: (slot: string) => invoke<void>("delete_world", { slot }),
};

export const game = {
  start: (slot: string) => invoke<GameInfo>("game_start", { slot }),
  stop: () => invoke<GameInfo>("game_stop"),
  status: () => invoke<GameInfo>("game_status"),
  request: <T>(method: string, path: string, body?: unknown) =>
    invoke<T>("game_request", { method, path, body: body ?? null }),
  openWindow: (path = "/") => invoke<void>("open_game_window", { path }),
  singleplayerStatus: () => game.request<SingleplayerStatus>("GET", "/api/singleplayer/status"),
  newGame: (preset: string, displayName?: string) =>
    game.request<{ ok: boolean }>("POST", "/api/singleplayer/new-game", {
      preset,
      ...(displayName ? { displayName } : {}),
    }),
};

export const online = {
  open: () => invoke<void>("open_online_window"),
  help: (routeId: string) => invoke<void>("open_help_destination", { routeId }),
};
