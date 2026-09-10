import { defaultLanguage, type ClientLanguage } from "./i18n.js";

export interface ClientSettings {
  language: ClientLanguage;
  separateWindow: boolean;
  animations: boolean;
  shareStatistics: boolean;
  showBootLogs: boolean;
}
export const DEFAULT_SETTINGS: ClientSettings = {
  language: "en",
  separateWindow: false,
  animations: true,
  shareStatistics: true,
  showBootLogs: false,
};
const KEY = "ahdclient.settings.v1";
export function readSettings(): ClientSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS, language: defaultLanguage() };
    const result = { ...DEFAULT_SETTINGS, language: defaultLanguage() };
    for (const key of Object.keys(result) as (keyof ClientSettings)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (key === "language" && (value === "de" || value === "en")) result.language = value;
      else if (typeof value === "boolean") result[key] = value as never;
    }
    return result;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function writeSettings(settings: ClientSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* Keep current-session settings when storage is unavailable. */
  }
}
export function applySettings(settings: ClientSettings): void {
  document.documentElement.lang = settings.language;
  document.documentElement.dataset.animations = settings.animations
    ? "on"
    : "off";
  window.dispatchEvent(new CustomEvent("ahdclient:settings"));
}
