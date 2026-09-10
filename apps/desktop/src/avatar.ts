/**
 * Launcher avatar URLs come from `GET /api/client/account` (`avatarUrl`,
 * owned by the game). The launcher has no image proxy, so the URL loads
 * directly in the webview: accept only the hosts the native briefing path
 * already trusts (briefing.rs `bounded_https_url`), anything else renders as
 * an initial. The game's CSP `img-src` is expanded to exactly these hosts.
 */
const TRUSTED_SUFFIXES = [".ahousedividedgame.com", ".public.blob.vercel-storage.com"];
const TRUSTED_HOSTS = new Set(["ahousedividedgame.com", "cdn.discordapp.com"]);

export function allowedAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (TRUSTED_HOSTS.has(host)) return trimmed;
  if (TRUSTED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return trimmed;
  return null;
}

export function initialsFor(name: string | null | undefined): string {
  const initials =
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  return initials || "A";
}
