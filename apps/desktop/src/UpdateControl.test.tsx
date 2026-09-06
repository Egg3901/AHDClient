/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateControl } from "./UpdateControl.js";

const downloadAndInstall = vi.fn();
const relaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(async () => ({ version: "2.0.4", downloadAndInstall })),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("desktop updates", () => {
  it("reports an installation failure and lets the user retry", async () => {
    downloadAndInstall.mockRejectedValueOnce(new Error("signature rejected"));
    render(<UpdateControl />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    const install = await screen.findByRole("button", {
      name: "Update and restart",
    });
    fireEvent.click(install);

    await waitFor(() =>
      expect(screen.getByText("signature rejected")).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: "Check for updates" }),
    ).toBeTruthy();
    expect(relaunch).not.toHaveBeenCalled();
  });
});
