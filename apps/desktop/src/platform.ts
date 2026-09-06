/**
 * Which shell the launcher is running in. Android and iOS run the launcher
 * and the live site in one webview with no local game; desktop runs the
 * game locally and opens the site in a second, capability-empty webview.
 * Detection is by user agent: the mobile builds set a WebKit or Chromium
 * agent that names the platform, and a desktop webview never does.
 */
export type ClientPlatform = "android" | "ios" | "desktop";

export function detectPlatform(userAgent: string): ClientPlatform {
  if (/\bAndroid\b/.test(userAgent)) return "android";
  if (/\b(?:iPhone|iPad|iPod)\b/.test(userAgent)) return "ios";
  return "desktop";
}

export const platform: ClientPlatform = detectPlatform(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

/** True on Android and iOS: no singleplayer, no worldsim, one webview. */
export const mobile = platform !== "desktop";
