/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { PushControl } from "./PushControl.js";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const off = { enabled: false, available: true, registered: false, permissionGranted: false, message: "Push alerts are off." };
afterEach(cleanup);
beforeEach(() => { vi.mocked(invoke).mockReset(); vi.mocked(invoke).mockResolvedValue(off); });
describe("mobile push controls", () => {
  it("asks for permission only after the player turns alerts on", async () => {
    render(<PushControl />);
    await screen.findByText("Push alerts are off.");
    expect(invoke).toHaveBeenCalledWith("get_push_status");
    expect(invoke).not.toHaveBeenCalledWith("configure_push", expect.anything());
    vi.mocked(invoke).mockResolvedValue({ ...off, enabled: true, message: "Connecting push alerts..." });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByRole("button", { name: "Turn off" });
    expect(invoke).toHaveBeenCalledWith("configure_push", { enabled: true });
  });
  it("keeps the switch off when native configuration fails", async () => {
    render(<PushControl />);
    await screen.findByText("Push alerts are off.");
    vi.mocked(invoke).mockRejectedValue(new Error("unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByText("Could not change notification settings. Please try again.");
    expect(screen.getByRole("button", { name: "Turn on" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("lets a previously enabled installation revoke even if push is unavailable", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...off, enabled: true, available: false });
    render(<PushControl />);
    await screen.findByRole("button", { name: "Turn off" });
    vi.mocked(invoke).mockResolvedValue(off);
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("configure_push", { enabled: false }));
  });
});
