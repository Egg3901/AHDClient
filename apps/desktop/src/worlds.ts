import { invoke } from "@tauri-apps/api/core";
import type { SetupOptions } from "./screens/setupOptions.js";

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
  setup?: SetupOptions | null;
}

export interface GameInfo {
  running: boolean;
  port: number | null;
  slot: string | null;
  url: string | null;
}

export interface LinkedAccount {
  linked: boolean;
  displayName: string;
  supporter: boolean;
  singleplayer: { entitled: boolean; expiresAt: string | null };
}

export interface GameVersion {
  version: string;
  installed: boolean;
  selected: boolean;
}

export const gameVersions = {
  list: () => invoke<GameVersion[]>("list_game_versions"),
  install: (version: string) =>
    invoke<void>("install_game_version", { version }),
  select: (version: string | null) =>
    invoke<void>("select_game_version", { version }),
};

/** What the game reports about a world once its server is up. */
export interface SingleplayerStatus {
  hasWorld: boolean;
  mode?: "normal" | "head-of-state" | "worldsim" | null;
  turn: number | null;
  preset: string | null;
  hasCharacter: boolean;
  characterName: string | null;
}

export interface SetupProgress {
  active: boolean;
  phase: string;
  label: string;
  detail: string;
  progress: number;
  updatedAt: string;
  stalled: boolean;
}

export interface Era {
  /** Year, which is also the key CommandGlobe themes by. */
  id: string;
  /** The AHDGame reset preset that builds this world. */
  preset: string;
  label: string;
  subtitle: string;
  startDate: string;
  description?: string;
  playableNations?: readonly string[];
}

/** Every era the game can seed, oldest first. Mirrors AHDGame's presets. */
export const ERAS: readonly Era[] = [
  {
    description:
      "The Cold War hardens after Stalin. Compete for power in a world divided between rival blocs.",
    playableNations: [
      "United States",
      "United Kingdom",
      "Soviet Union",
      "East Germany",
    ],
    id: "1953",
    preset: "1953-default",
    label: "1953",
    subtitle: "Cold War dawn",
    startDate: "January 1953",
  },
  {
    description:
      "Oil shocks, revolution and renewed Cold War tensions challenge the postwar settlement.",
    playableNations: [
      "United States",
      "United Kingdom",
      "Soviet Union",
      "East Germany",
    ],
    id: "1979",
    preset: "1979-default",
    label: "1979",
    subtitle: "Late Cold War",
    startDate: "January 1979",
  },
  {
    description:
      "The Cold War order unravels. Shape the political choices of a new international era.",
    playableNations: ["United States", "United Kingdom"],
    id: "1991",
    preset: "1991-default",
    label: "1991",
    subtitle: "New world order",
    startDate: "January 1991",
  },
  {
    description:
      "Globalisation accelerates as the internet boom and a new European currency reshape politics.",
    playableNations: ["United States", "United Kingdom"],
    id: "1999",
    preset: "1999-default",
    label: "1999",
    subtitle: "Peak globalisation",
    startDate: "January 1999",
  },
  {
    description:
      "Credit and confidence run high on the eve of the global financial crisis.",
    playableNations: ["United States", "United Kingdom"],
    id: "2007",
    preset: "2007-default",
    label: "2007",
    subtitle: "Before the crash",
    startDate: "January 2007",
  },
  {
    description:
      "Polarisation, shifting alliances and contested institutions define an interconnected world.",
    playableNations: [
      "United States",
      "United Kingdom",
      "Germany",
      "Japan",
      "Ireland",
      "China",
    ],
    id: "2019",
    preset: "2019-default",
    label: "2019",
    subtitle: "Contemporary politics",
    startDate: "January 2019",
  },
  {
    description:
      "Inflation, war and renewed great-power competition put governments under pressure.",
    playableNations: [
      "United States",
      "United Kingdom",
      "Japan",
      "Germany",
      "Ireland",
      "China",
    ],
    id: "2023",
    preset: "2023-default",
    label: "2023",
    subtitle: "Realignment",
    startDate: "January 2023",
  },
];

export function eraById(id: string): Era | undefined {
  return ERAS.find((era) => era.id === id);
}

export function eraForPreset(
  preset: string | null | undefined,
): Era | undefined {
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
  create: (slot: string, name: string, preset: string, setup?: SetupOptions) =>
    invoke<WorldMeta>("create_world", {
      slot,
      name,
      preset,
      setup: setup ?? null,
    }),
  touch: (slot: string, turn?: number | null, character?: string | null) =>
    invoke<WorldMeta>("touch_world", {
      slot,
      turn: turn ?? null,
      character: character ?? null,
    }),
  remove: (slot: string) => invoke<void>("delete_world", { slot }),
};

export const game = {
  start: (slot: string) => invoke<GameInfo>("game_start", { slot }),
  stop: () => invoke<GameInfo>("game_stop"),
  status: () => invoke<GameInfo>("game_status"),
  request: <T>(method: string, path: string, body?: unknown) =>
    invoke<T>("game_request", { method, path, body: body ?? null }),
  openWindow: (path = "/", separateWindow = false) =>
    invoke<void>("open_game_window", { path, separateWindow }),
  closeEmbedded: () => invoke<void>("close_embedded_game"),
  singleplayerStatus: () =>
    game.request<SingleplayerStatus>("GET", "/api/singleplayer/status"),
  setup: (preset: string, setup: SetupOptions, displayName?: string) =>
    game.request<{ ok: boolean }>("POST", "/api/singleplayer/setup", {
      preset,
      ...setup,
      ...(displayName ? { displayName } : {}),
    }),
  setupProgress: () =>
    game.request<SetupProgress>("GET", "/api/singleplayer/setup/progress"),
  newGame: (preset: string, displayName?: string) =>
    game.request<{ ok: boolean }>("POST", "/api/singleplayer/new-game", {
      preset,
      ...(displayName ? { displayName } : {}),
    }),
};

export type OnlineTarget = "live" | "sandbox";

export const online = {
  open: (target: OnlineTarget = "live", separateWindow = false) =>
    invoke<void>("open_online_window", { target, separateWindow }),
  link: (separateWindow = false) =>
    invoke<void>("link_account", { separateWindow }),
  account: () => invoke<LinkedAccount | null>("linked_account"),
  help: (routeId: string) => invoke<void>("open_help_destination", { routeId }),
};
