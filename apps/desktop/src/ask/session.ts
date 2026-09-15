import type { AskMe, AskUsage } from "./api.js";
import { usageIn } from "./api.js";

/**
 * Account-scoped, non-sensitive snapshot of the last validated Ask session.
 * Only the entitlement summary (username, quota numbers, plan label) is
 * cached so the shell can paint before the authoritative refresh. Raw
 * cookies, tokens, and bearer [REDACTED] are never stored here.
 */
export interface AskSessionSnapshot {
  username: string | null;
  usage: AskUsage | null;
  tier: string | null;
  updatedAt: number;
}

export const ASK_SESSION_CACHE_KEY = "ahdclient.ask.session.v1";

/** Stored payload keys that must never survive in the cache. */
const SECRET_KEYS = ["ask_session", "cookie", "token", "bearer", "authorization", "session"];

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Keep only the known quota numbers and drop everything else, so a wider
 * service response can never carry secrets into the cache or the UI.
 */
export function sanitizeAskUsage(value: unknown): AskUsage | null {
  if (!value || typeof value !== "object") return null;
  return usageIn({ usage: value });
}

function hasSecretKey(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => SECRET_KEYS.includes(key.toLowerCase()));
}

/** Identity username off `/api/me`, or null when signed out/unknown. */
export function usernameOf(me: AskMe | null | undefined): string | null {
  const name = me?.identity?.username;
  return typeof name === "string" && name ? name : null;
}

export function loadCachedAskSession(now: number = Date.now()): AskSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(ASK_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (hasSecretKey(record)) {
      localStorage.removeItem(ASK_SESSION_CACHE_KEY);
      return null;
    }
    const username = record.username === null || record.username === undefined ? null : str(record.username);
    if (record.username !== null && record.username !== undefined && username === null) return null;
    if (
      record.usage !== null &&
      record.usage !== undefined &&
      typeof record.usage === "object" &&
      hasSecretKey(record.usage as Record<string, unknown>)
    ) {
      localStorage.removeItem(ASK_SESSION_CACHE_KEY);
      return null;
    }
    const usage = record.usage === null || record.usage === undefined ? null : sanitizeAskUsage(record.usage);
    if (record.usage !== null && record.usage !== undefined && usage === null) {
      localStorage.removeItem(ASK_SESSION_CACHE_KEY);
      return null;
    }
    const tier = record.tier === null || record.tier === undefined ? null : str(record.tier);
    if (record.tier !== null && record.tier !== undefined && tier === null) return null;
    const updatedAt = num(record.updatedAt);
    if (updatedAt === null) return null;
    void now;
    return { username, usage, tier, updatedAt };
  } catch {
    return null;
  }
}

export function saveCachedAskSession(snapshot: {
  username: string | null;
  usage: AskUsage | null;
  tier: string | null;
}): void {
  try {
    const usage = snapshot.usage === null ? null : sanitizeAskUsage(snapshot.usage);
    if (snapshot.usage !== null && usage === null) {
      localStorage.removeItem(ASK_SESSION_CACHE_KEY);
      return;
    }
    localStorage.setItem(
      ASK_SESSION_CACHE_KEY,
      JSON.stringify({ username: snapshot.username, usage, tier: snapshot.tier, updatedAt: Date.now() }),
    );
  } catch {
    // Private browsing: the shell still works for this session.
  }
}

export function clearCachedAskSession(): void {
  try {
    localStorage.removeItem(ASK_SESSION_CACHE_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * True when the cached snapshot belongs to `username`. A mismatch means the
 * account changed and the cached quota must not be shown.
 */
export function isSameAskAccount(cached: AskSessionSnapshot | null, username: string | null): boolean {
  if (!cached) return false;
  return cached.username === username;
}
