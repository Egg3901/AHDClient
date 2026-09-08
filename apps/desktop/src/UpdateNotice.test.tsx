/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

import { UpdateNotice } from "./UpdateNotice.js";

describe("UpdateNotice", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("does not invoke the desktop updater when updates are disabled", async () => {
    vi.useFakeTimers();
    render(<UpdateNotice enabled={false} />);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("keeps long release notes in a collapsed fixed update card", async () => {
    vi.useFakeTimers();
    mocks.check.mockResolvedValue({
      version: "2.1.2",
      body: "- First improvement\n- Second improvement with much more detail",
      downloadAndInstall: vi.fn(),
    });

    render(<UpdateNotice />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
      await Promise.resolve();
    });

    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("AHDClient 2.1.2 is ready");
    const details = screen.getByText("What's new").closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).toContain("First improvement");
    expect(details?.textContent).toContain("Second improvement");

    const css = readFileSync(join(process.cwd(), "src/update.css"), "utf8");
    expect(css).toMatch(/\.client-update-notice\s*\{[^}]*position:\s*fixed/s);
    expect(css).toMatch(/\.client-update-notice\s*\{[^}]*max-width:/s);

    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
