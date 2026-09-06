export interface SingleplayerEntitlement {
  entitled: boolean;
  expiresAt: string | null;
}

const CACHE_KEY = "ahdclient.singleplayer-entitlement.v1";

/** Cache only the server's bounded capability window, never an auth cookie. */
export function cacheSingleplayerEntitlement(
  entitlement: SingleplayerEntitlement,
): void {
  if (
    !entitlement.entitled ||
    !entitlement.expiresAt ||
    Date.parse(entitlement.expiresAt) <= Date.now()
  ) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ expiresAt: entitlement.expiresAt }),
  );
}

export function hasCachedSingleplayerEntitlement(now = Date.now()): boolean {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(CACHE_KEY) ?? "null",
    );
    if (!value || typeof value !== "object") return false;
    const expiresAt = (value as Record<string, unknown>).expiresAt;
    return (
      typeof expiresAt === "string" &&
      Number.isFinite(Date.parse(expiresAt)) &&
      Date.parse(expiresAt) > now
    );
  } catch {
    return false;
  }
}
