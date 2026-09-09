/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const download = vi.fn();
const install = vi.fn();
const downloadAndInstall = vi.fn();
const check = vi.fn();
const relaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => check(...args),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => relaunch(...args),
}));

import {
  checkForUpdatesNow,
  confirmRestartToUpdate,
  getUpdaterSnapshot,
  resetUpdaterForTests,
  startBackgroundUpdateCheck,
  isWindowsUserAgent,
} from "./updater.js";

function updateMock(version = "2.3.1") {
  return {
    version,
    body: "- First improvement\n- Second improvement",
    download,
    install,
    downloadAndInstall,
  };
}

beforeEach(() => {
  resetUpdaterForTests();
  download.mockReset().mockImplementation(async (onEvent?: (event: unknown) => void) => {
    onEvent?.({ event: "Started", data: { contentLength: 100 } });
    onEvent?.({ event: "Progress", data: { chunkLength: 40 } });
    onEvent?.({ event: "Progress", data: { chunkLength: 60 } });
    onEvent?.({ event: "Finished" });
  });
  install.mockReset().mockResolvedValue(undefined);
  downloadAndInstall.mockReset();
  check.mockReset();
  relaunch.mockReset();
});

afterEach(() => {
  resetUpdaterForTests();
});

describe("silent updater", () => {
  it("recognises Windows user agents for install-exits-process", () => {
    expect(isWindowsUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(true);
    expect(isWindowsUserAgent("Mozilla/5.0 (X11; Linux x86_64)")).toBe(false);
  });

  it("downloads in the background without installing or relaunching", async () => {
    check.mockResolvedValue(updateMock());
    await startBackgroundUpdateCheck();
    expect(download).toHaveBeenCalledTimes(1);
    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
    expect(getUpdaterSnapshot()).toMatchObject({
      kind: "ready",
      version: "2.3.1",
    });
  });

  it("records download progress from Started and Progress events", async () => {
    const seen: string[] = [];
    const { subscribeUpdater } = await import("./updater.js");
    const stop = subscribeUpdater(() => seen.push(getUpdaterSnapshot().kind));
    check.mockResolvedValue(updateMock());
    await startBackgroundUpdateCheck();
    stop();
    expect(seen).toContain("checking");
    expect(seen).toContain("downloading");
    expect(seen).toContain("ready");
    expect(getUpdaterSnapshot()).toEqual({
      kind: "ready",
      version: "2.3.1",
      notes: "- First improvement\n- Second improvement",
    });
  });

  it("installs only after Restart to update and relaunches off Windows", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    });
    check.mockResolvedValue(updateMock());
    await startBackgroundUpdateCheck();
    await confirmRestartToUpdate();
    expect(install).toHaveBeenCalledWith({ restartAfterInstall: true });
    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("does not relaunch on Windows because install() exits the process", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    check.mockResolvedValue(updateMock());
    await startBackgroundUpdateCheck();
    await confirmRestartToUpdate();
    expect(install).toHaveBeenCalledWith({ restartAfterInstall: true });
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("does not start a second download while one is ready", async () => {
    check.mockResolvedValue(updateMock());
    await startBackgroundUpdateCheck();
    await checkForUpdatesNow();
    expect(check).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
