import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import {
  AskError,
  askApi,
  askApiJson,
  isSignedOutError,
  usageFromError,
  usageIn,
  quotaLabel,
  resetIn,
} from "./api.js";

beforeEach(() => {
  invoke.mockReset();
});

describe("askApi", () => {
  it("returns the body text on success", async () => {
    invoke.mockResolvedValue({ status: 200, body: "{\"usage\":null}" });
    const result = await askApi("GET", "/api/me");
    expect(result).toEqual({ status: 200, text: "{\"usage\":null}" });
    expect(invoke).toHaveBeenCalledWith("ask_api", { method: "GET", path: "/api/me", body: null });
  });

  it("marks 401 as signed out", async () => {
    invoke.mockResolvedValue({ status: 401, body: "{\"error\":\"Signed in elsewhere\"}" });
    const failure = await askApiJson("GET", "/api/me").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AskError);
    expect((failure as AskError).signedOut).toBe(true);
    expect((failure as AskError).message).toBe("Signed in elsewhere");
  });

  it("marks 429 as quota with the usage attached", async () => {
    invoke.mockResolvedValue({
      status: 429,
      body: "{\"error\":\"No questions left\",\"usage\":{\"used\":5,\"limit\":5,\"remaining\":0}}",
    });
    const failure = await askApiJson("GET", "/api/me").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AskError);
    expect((failure as AskError).quota).toBe(true);
    expect((failure as AskError).usage).toMatchObject({ remaining: 0 });
  });

  it("falls back to a generic message on unreadable errors", async () => {
    invoke.mockResolvedValue({ status: 500, body: "<html>down</html>" });
    const failure = await askApiJson("GET", "/api/me").catch((error: unknown) => error);
    expect((failure as AskError).message).toBe("Something went wrong. Try again.");
    expect((failure as AskError).signedOut).toBe(false);
  });
});

describe("usage extraction", () => {
  it("sanitizes quota off any usage-shaped payload", () => {
    const usage = usageIn({
      usage: {
        used: 3,
        limit: 10,
        remaining: 7,
        mcpUsed: 0,
        mcpLimit: 2,
        mcpRemaining: 2,
        resetAt: 123,
        cookie: "must-not-survive",
      },
    });
    expect(usage).toMatchObject({ used: 3, remaining: 7 });
    expect(usage).not.toHaveProperty("cookie");
  });

  it("keeps headline quota from a sparse 429 body", () => {
    expect(usageIn({ usage: { used: 5, limit: 5, remaining: 0 } })).toMatchObject({
      remaining: 0,
      mcpRemaining: 0,
      resetAt: 0,
    });
    expect(usageIn({ usage: { remaining: "many", limit: 10 } })).toBeNull();
    expect(usageIn(null)).toBeNull();
  });

  it("reads sign-out and quota off failures", () => {
    expect(isSignedOutError(new AskError(401, "Signed out", null))).toBe(true);
    expect(isSignedOutError(new AskError(429, "Spent", null))).toBe(false);
    expect(isSignedOutError("Please sign in to Ask first.")).toBe(true);
    expect(isSignedOutError(new Error("Cannot reach Ask."))).toBe(false);
    const quota = new AskError(429, "Spent", {
      used: 5,
      limit: 5,
      remaining: 0,
      mcpUsed: 0,
      mcpLimit: 0,
      mcpRemaining: 0,
      resetAt: 0,
    });
    expect(usageFromError(quota)).toMatchObject({ remaining: 0 });
    expect(usageFromError(new Error("down"))).toBeNull();
  });
});

describe("quota copy", () => {
  it("labels the remaining allowance", () => {
    expect(
      quotaLabel({ used: 3, limit: 10, remaining: 7, mcpUsed: 0, mcpLimit: 2, mcpRemaining: 2, resetAt: 0 }),
    ).toBe("7 of 10 left");
    expect(quotaLabel(null)).toBe("");
  });

  it("counts down to the reset", () => {
    const now = Date.UTC(2026, 8, 11, 12, 0, 0);
    expect(resetIn(now + 134 * 60000, now)).toBe("2h 14m");
    expect(resetIn(now + 38 * 60000, now)).toBe("38m");
    expect(resetIn(now - 60000, now)).toBe("0m");
  });
});
