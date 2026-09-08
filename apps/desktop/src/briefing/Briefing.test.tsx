/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Briefing } from "./Briefing.js";
import { briefing, freshness, money, number, readSection } from "./briefingApi.js";
import type { Snapshot } from "./briefingApi.js";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const ready: Snapshot = {
  status: "ready", updatedAt: Date.now(),
  profile: { name: "Example character", actions: 0, actionCap: 15, funds: 5000, personalHomeLiquid: 42,
    homeCurrency: "GBP", politicalInfluence: null, favorability: 49, isImperial: false },
  election: { electionId: "0123456789abcdef01234567", myVotePct: 45, marginPct: -5, seatsProjected: null, totalSeats: null, isMultiSeat: false },
  corporation: null,
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(briefing, "read").mockResolvedValue(ready);
  vi.spyOn(briefing, "open").mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("briefing", () => {
  it("uses local currencies and distinguishes missing stats from zero", async () => {
    render(<Briefing />);
    await screen.findByText("Example character");
    expect(screen.getByText("0 / 15")).toBeDefined();
    expect(screen.getByText("5K GBP")).toBeDefined();
    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(money(null, "GBP")).toBe("Unavailable");
    expect(money(45, null)).toBe("45");
    expect(number(Infinity)).toBe("Unavailable");
  });

  it("supports horizontal swipe and ignores vertical scroll, then remembers the card", async () => {
    render(<Briefing />);
    await screen.findByText("Example character");
    const panel = screen.getByRole("tabpanel");
    fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 50 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 100, clientY: 55 }] });
    expect(screen.getByText("45%")).toBeDefined();
    expect(readSection()).toBe("election");
    fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 180, clientY: 50 }] });
    expect(readSection()).toBe("election");
    await userEvent.click(screen.getByRole("button", { name: "Open election" }));
    expect(briefing.open).toHaveBeenCalledWith("election");
  });

  it("offers keyboard tab navigation with focus and empty corporation state", async () => {
    render(<Briefing />);
    await screen.findByText("Example character");
    const profileTab = screen.getByRole("tab", { name: "Profile" });
    profileTab.focus();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Corporation" }));
    expect(screen.getByText("Your active character does not lead a corporation.")).toBeDefined();
  });

  it("retains timestamped stats on network failure and clears them on logout", async () => {
    render(<Briefing />);
    await screen.findByText("Example character");
    vi.mocked(briefing.read).mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/Cannot refresh/);
    expect(screen.getByText("Example character")).toBeDefined();
    expect(screen.getByText(/Saved data/)).toBeDefined();
    vi.mocked(briefing.read).mockResolvedValueOnce({ ...ready, status: "signed-out", profile: null, election: null });
    fireEvent(window, new Event("online"));
    await screen.findByText("Sign in to see your stats");
    expect(screen.queryByText("Example character")).toBeNull();
  });

  it("clears the old account even if a new session cannot be fetched", async () => {
    render(<Briefing />);
    await screen.findByText("Example character");
    vi.mocked(briefing.read).mockRejectedValueOnce("session-changed");
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.queryByText("Example character")).toBeNull());
  });

  it("prevents overlapping refresh requests and does not refresh after unmount", async () => {
    let resolve!: (value: Snapshot) => void;
    vi.mocked(briefing.read).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = render(<Briefing />);
    fireEvent(window, new Event("focus"));
    expect(briefing.read).toHaveBeenCalledTimes(1);
    resolve(ready);
    await screen.findByText("Example character");
    view.unmount();
    fireEvent(window, new Event("focus"));
    expect(briefing.read).toHaveBeenCalledTimes(1);
  });

  it("uses truthful ages and does not display expired personal data", async () => {
    vi.mocked(briefing.read).mockResolvedValueOnce({ ...ready, updatedAt: Date.now() - 25 * 60 * 60_000 });
    render(<Briefing />);
    await screen.findByText(/saved briefing has expired/);
    expect(screen.queryByText("Example character")).toBeNull();
    expect(freshness(0, 121000)).toBe("Updated 2m ago");
  });
});
