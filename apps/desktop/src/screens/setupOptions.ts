import { FEATURE_OPTIONS, type FeatureFlagKey } from "./featureOptions.js";

/** Values accepted by the singleplayer setup route. */
export type SetupMode = "normal" | "head-of-state" | "worldsim";
export type SetupDifficulty = "easy" | "normal" | "hard";
export type SetupAutonomy = "off" | "v0" | "v1" | "v2" | "v3" | "v4";

export interface SetupOptions {
  mode: SetupMode;
  difficulty: SetupDifficulty;
  autonomyLevel: SetupAutonomy;
  featureFlags: Record<FeatureFlagKey, boolean>;
}

export const SETUP_OPTIONS_STORAGE_KEY = "ahdclient.lastSetup.v1";

export function defaultFeatureFlags(): Record<FeatureFlagKey, boolean> {
  return Object.fromEntries(FEATURE_OPTIONS.map((option) => [option.key, option.defaultValue])) as Record<FeatureFlagKey, boolean>;
}

export function defaultSetupOptions(): SetupOptions {
  return { mode: "normal", difficulty: "normal", autonomyLevel: "v4", featureFlags: defaultFeatureFlags() };
}

/** Read the last setup safely. Invalid or stale local storage falls back per field. */
export function readSetupOptions(): SetupOptions {
  const fallback = defaultSetupOptions();
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETUP_OPTIONS_STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return fallback;
    const value = raw as Record<string, unknown>;
    const mode: SetupMode = value.mode === "normal" || value.mode === "head-of-state" || value.mode === "worldsim" ? value.mode : fallback.mode;
    const difficulty: SetupDifficulty = value.difficulty === "easy" || value.difficulty === "normal" || value.difficulty === "hard" ? value.difficulty : fallback.difficulty;
    const autonomyLevel: SetupAutonomy = value.autonomyLevel === "off" || /^v[0-4]$/.test(String(value.autonomyLevel)) ? value.autonomyLevel as SetupAutonomy : fallback.autonomyLevel;
    const flags = { ...fallback.featureFlags };
    if (value.featureFlags && typeof value.featureFlags === "object") {
      for (const option of FEATURE_OPTIONS) {
        const flag = (value.featureFlags as Record<string, unknown>)[option.key];
        if (typeof flag === "boolean") flags[option.key] = flag;
      }
    }
    return { mode, difficulty, autonomyLevel, featureFlags: flags };
  } catch {
    return fallback;
  }
}

export function writeSetupOptions(options: SetupOptions): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(SETUP_OPTIONS_STORAGE_KEY, JSON.stringify(options)); } catch { /* Storage is optional. */ }
}
