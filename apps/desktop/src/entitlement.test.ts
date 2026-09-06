/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  cacheSingleplayerEntitlement,
  hasCachedSingleplayerEntitlement,
} from "./entitlement.js";

afterEach(() => localStorage.clear());

describe("singleplayer entitlement cache", () => {
  it("permits a current server-issued entitlement while offline", () => {
    cacheSingleplayerEntitlement({
      entitled: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(hasCachedSingleplayerEntitlement()).toBe(true);
  });

  it("does not retain denied or expired access", () => {
    cacheSingleplayerEntitlement({ entitled: false, expiresAt: null });
    expect(hasCachedSingleplayerEntitlement()).toBe(false);
    cacheSingleplayerEntitlement({
      entitled: true,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
    expect(hasCachedSingleplayerEntitlement()).toBe(false);
  });
});
