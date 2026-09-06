export interface ClientSettings {
  separateWindow: boolean;
  animations: boolean;
  shareStatistics: boolean;
  showBootLogs: boolean;
}
export const DEFAULT_SETTINGS: ClientSettings = {
  separateWindow: false,
  animations: true,
  shareStatistics: true,
  showBootLogs: false,
};
const KEY = "ahdclient.settings.v1";
export function readSettings(): ClientSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };
    const result = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(result) as (keyof ClientSettings)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "boolean") result[key] = value;
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
  document.documentElement.dataset.animations = settings.animations
    ? "on"
    : "off";
  window.dispatchEvent(new CustomEvent("ahdclient:settings"));
}
