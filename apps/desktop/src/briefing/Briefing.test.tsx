/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Briefing } from "./Briefing.js";
import { briefing, changeDelta, changeValue, freshness, money, nextTurn, number, readSection } from "./briefingApi.js";
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
  vi.spyOn(briefing, "openPage").mockResolvedValue();
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

  it("offers keyboard tab navigation with focus and an empty turn briefing", async () => {
    render(<Briefing />);
    await screen.findByText("Example character");
    const profileTab = screen.getByRole("tab", { name: "Profile" });
    profileTab.focus();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Turns" }));
    expect(screen.getByText("No material player changes were recorded in the latest turn.")).toBeDefined();
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

  it("shows the turn clock and inbox counts, and opens the inbox", async () => {
    vi.mocked(briefing.read).mockResolvedValue({ ...ready,
      turn: { current: 50, date: "March 1953, Week 2", nextAt: new Date(Date.now() + 23 * 60_000 - 1000).toISOString(), active: true },
      inbox: { unread: 3, mail: 1 } });
    render(<Briefing />);
    await screen.findByText("Turn 50");
    expect(screen.getByText("March 1953, Week 2")).toBeDefined();
    expect(screen.getByText("Next turn in 23m")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Inbox: 3 unread, 1 mail" }));
    expect(briefing.open).toHaveBeenCalledWith("inbox");
    expect(nextTurn({ current: 1, nextAt: new Date(95 * 60_000).toISOString(), active: true }, 0)).toBe("Next turn in 1h 35m");
    expect(nextTurn({ current: 1, nextAt: null, active: false }, 0)).toBe("Turns paused");
    expect(nextTurn({ current: 1, nextAt: new Date(0).toISOString(), active: true }, 1)).toBe("Next turn running");
    expect(nextTurn(null, 0)).toBeNull();
  });

  it("writes turn changes in their own units and opens their page", async () => {
    const share = { category: "markets", label: "Share price", value: 12.5, delta: -0.5, unit: "currency" as const, href: "/corporation/7" };
    const vote = { category: "election", label: "Vote share", value: 45.2, delta: 1.4, unit: "percent" as const, href: "/elections/x" };
    vi.mocked(briefing.read).mockResolvedValue({ ...ready, turnBriefing: [share, vote],
      corporation: { name: "Acme", sequentialId: 7, sharePrice: 12.5, priceChange1h: 1, liquidCapital: 1, liquidCurrencyCode: "USD", marketingStrength: 1 } });
    localStorage.setItem("ahdclient.briefing.section", "turns");
    render(<Briefing />);
    await screen.findByText("Share price");
    expect(screen.getByText("-0.5 USD")).toBeDefined();
    expect(screen.getByText("Now 12.5 USD")).toBeDefined();
    expect(screen.getByText("+1.4 pp")).toBeDefined();
    expect(screen.queryByText(/currency|percent/)).toBeNull();
    await userEvent.click(screen.getByText("Vote share"));
    expect(briefing.openPage).toHaveBeenCalledWith("/elections/x");
    expect(changeValue(vote, null)).toBe("45.2%");
    expect(changeDelta({ ...share, unit: "points", delta: 3 }, null)).toBe("+3");
  });

  it("opens a watched stock's corporation", async () => {
    vi.mocked(briefing.read).mockResolvedValue({ ...ready, marketWatch: [
      { sequentialId: 9, name: "Example Steel", tickerSymbol: "EXS", sharePrice: 3, liquidCurrencyCode: "GBP", ownedShares: 200 }] });
    localStorage.setItem("ahdclient.briefing.section", "stocks");
    render(<Briefing />);
    await userEvent.click(await screen.findByRole("button", { name: /\$EXS/ }));
    expect(briefing.openPage).toHaveBeenCalledWith("/corporation/9");
  });
});
