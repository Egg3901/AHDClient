/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, readSettings, writeSettings } from "./settings.js";
afterEach(() => localStorage.clear());
describe("client preferences", () => {
  it("defaults to same-window gameplay", () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
    expect(readSettings().separateWindow).toBe(false);
  });
  it("persists an explicit statistics opt-out across reloads", () => {
    writeSettings({ ...DEFAULT_SETTINGS, shareStatistics: false });
    expect(readSettings().shareStatistics).toBe(false);
  });
  it("does not accept string booleans or unknown persisted fields", () => {
    localStorage.setItem("ahdclient.settings.v1", '{"separateWindow":"false","accountToken":"secret","animations":false}');
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS, animations: false });
  });
});
