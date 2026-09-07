/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

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
});
