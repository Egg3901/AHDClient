/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  ASK_SESSION_CACHE_KEY,
  clearCachedAskSession,
  isSameAskAccount,
  loadCachedAskSession,
  sanitizeAskUsage,
  saveCachedAskSession,
  usernameOf,
} from "./session.js";

const usage = {
  used: 3,
  limit: 10,
  remaining: 7,
  mcpUsed: 1,
  mcpLimit: 2,
  mcpRemaining: 1,
  resetAt: Date.now() + 3600_000,
};

afterEach(() => localStorage.clear());

describe("ask session cache", () => {
  it("round-trips the non-sensitive entitlement summary", () => {
    saveCachedAskSession({ username: "marshall", usage, tier: "Player" });
    const cached = loadCachedAskSession();
    expect(cached?.username).toBe("marshall");
    expect(cached?.usage).toMatchObject({ used: 3, limit: 10, remaining: 7 });
    expect(cached?.tier).toBe("Player");
  });

  it("never persists cookies, tokens, or bearer [REDACTED]", () => {
    saveCachedAskSession({
      username: "marshall",
      usage: {
        ...usage,
        ask_session: "secret-cookie",
        cookie: "secret-cookie",
        token: "secret-token",
        bearer: "[REDACTED]",
        authorization: "Bearer [REDACTED]",
      } as unknown as typeof usage,
      tier: "Player",
    });
    const raw = localStorage.getItem(ASK_SESSION_CACHE_KEY) ?? "";
    expect(raw).not.toContain("secret-cookie");
    expect(raw).not.toContain("secret-token");
    expect(raw).not.toContain("Bearer");
    expect(loadCachedAskSession()?.usage).toMatchObject({ remaining: 7 });
  });

  it("rejects a stored payload that smuggles secrets", () => {
    localStorage.setItem(
      ASK_SESSION_CACHE_KEY,
      JSON.stringify({ username: "marshall", usage, ask_session: "abc", updatedAt: Date.now() }),
    );
    expect(loadCachedAskSession()).toBeNull();
  });

  it("rejects a cached usage block that smuggles secrets", () => {
    localStorage.setItem(
      ASK_SESSION_CACHE_KEY,
      JSON.stringify({ username: "marshall", usage: { ...usage, token: "abc" }, updatedAt: Date.now() }),
    );
    expect(loadCachedAskSession()).toBeNull();
    expect(localStorage.getItem(ASK_SESSION_CACHE_KEY)).toBeNull();
  });

  it("rejects malformed or non-numeric quota shapes", () => {
    expect(sanitizeAskUsage({ remaining: "many", limit: 10 })).toBeNull();
    expect(sanitizeAskUsage(null)).toBeNull();
    localStorage.setItem(ASK_SESSION_CACHE_KEY, "not-json");
    expect(loadCachedAskSession()).toBeNull();
  });

  it("scopes cached quota to its account", () => {
    saveCachedAskSession({ username: "marshall", usage, tier: null });
    expect(isSameAskAccount(loadCachedAskSession(), "marshall")).toBe(true);
    expect(isSameAskAccount(loadCachedAskSession(), "delegate")).toBe(false);
    expect(isSameAskAccount(loadCachedAskSession(), null)).toBe(false);
  });

  it("clears cached quota on sign-out", () => {
    saveCachedAskSession({ username: "marshall", usage, tier: null });
    clearCachedAskSession();
    expect(loadCachedAskSession()).toBeNull();
  });

  it("reads the identity username off /api/me", () => {
    expect(usernameOf({ usage: null, identity: { username: "marshall" } })).toBe("marshall");
    expect(usernameOf({ usage: null, identity: null })).toBeNull();
    expect(usernameOf({ usage: null })).toBeNull();
  });
});
