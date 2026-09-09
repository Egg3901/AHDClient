/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

import { UpdateNotice } from "./UpdateNotice.js";
import { resetUpdaterForTests } from "./updater.js";

describe("UpdateNotice", () => {
  afterEach(() => {
    cleanup();
    resetUpdaterForTests();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("does not invoke the desktop updater when updates are disabled", async () => {
    vi.useFakeTimers();
    render(<UpdateNotice enabled={false} />);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(check).not.toHaveBeenCalled();
  });

  it("shows a dismissable download bar then Restart to update after download", async () => {
    vi.useFakeTimers();
    let finishDownload: () => void = () => {};
    download.mockImplementation(
      async (
        onEvent?: (event: {
          event: string;
          data?: { contentLength?: number; chunkLength?: number };
        }) => void,
      ) => {
        onEvent?.({ event: "Started", data: { contentLength: 50 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 25 } });
        await new Promise<void>((resolve) => {
          finishDownload = resolve;
        });
        onEvent?.({ event: "Progress", data: { chunkLength: 25 } });
      },
    );
    install.mockResolvedValue(undefined);
    check.mockResolvedValue({
      version: "2.3.1",
      body: "- First improvement\n- Second improvement with much more detail",
      download,
      install,
      downloadAndInstall,
    });

    render(<UpdateNotice />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      await Promise.resolve();
    });

    expect(screen.getByRole("status").textContent).toContain("Downloading AHDClient 2.3.1");
    expect(screen.getByRole("progressbar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();

    await act(async () => {
      finishDownload();
      await Promise.resolve();
    });
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("AHDClient 2.3.1 is ready");
    expect(screen.getByRole("button", { name: "Restart to update" })).toBeTruthy();
    const details = screen.getByText("What's new").closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).toContain("First improvement");

    const css = readFileSync(join(process.cwd(), "src/update.css"), "utf8");
    expect(css).toMatch(/\.client-update-notice\s*\{[^}]*position:\s*fixed/s);
    expect(css).toMatch(/\.client-update-progress\s*\{/s);

    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(relaunch).not.toHaveBeenCalled();
  });
});
