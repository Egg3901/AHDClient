/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../worlds.js", () => ({ game: { request } }));

import { WorldsimScreen } from "./WorldsimScreen.js";

const headline = { turn: 12, nppCount: 20, nppHeldPct: 0.4, activeCrises: 1, inflationIndex: 100, totalWealth: 1000, effectivePartyCount: 4 };

describe("WorldsimScreen", () => {
  afterEach(() => { cleanup(); request.mockReset(); });

  it("advances one turn per request and refreshes after each turn", async () => {
    request.mockImplementation(async (method: string, path: string) => {
      if (method === "GET" && path.endsWith("/stats")) return { headline };
      return { ok: true };
    });
    render(<WorldsimScreen name="Test world" onBack={vi.fn()} onView={vi.fn()} onStop={vi.fn(async () => {})} />);
    await waitFor(() => expect(request).toHaveBeenCalledWith("GET", "/api/singleplayer/worldsim/stats"));
    const turns = screen.getByLabelText("Turns to simulate");
    await userEvent.clear(turns);
    await userEvent.type(turns, "3");
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(7));
    expect(request.mock.calls.filter(([method, path]) => method === "POST" && path.endsWith("/advance"))).toEqual([
      ["POST", "/api/singleplayer/worldsim/advance", { turns: 1 }],
      ["POST", "/api/singleplayer/worldsim/advance", { turns: 1 }],
      ["POST", "/api/singleplayer/worldsim/advance", { turns: 1 }],
    ]);
  });

  it("stops after the current turn without starting another", async () => {
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    request.mockImplementation((method: string, path: string) => {
      if (method === "GET" && path.endsWith("/stats")) return Promise.resolve({ headline });
      return first.then(() => ({ ok: true }));
    });
    render(<WorldsimScreen name="Test world" onBack={vi.fn()} onView={vi.fn()} onStop={vi.fn(async () => {})} />);
    await waitFor(() => expect(request).toHaveBeenCalledWith("GET", "/api/singleplayer/worldsim/stats"));
    const turns = screen.getByLabelText("Turns to simulate");
    await userEvent.clear(turns);
    await userEvent.type(turns, "3");
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await screen.findByRole("button", { name: "Stop after this turn" });
    await userEvent.click(screen.getByRole("button", { name: "Stop after this turn" }));
    expect(screen.getByRole("status").textContent).toContain("Finishing the current turn");
    releaseFirst();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1 turns completed"));
    expect(request.mock.calls.filter(([method, path]) => method === "POST" && path.endsWith("/advance"))).toHaveLength(1);
  });

  it("surfaces a stats error", async () => {
    request.mockRejectedValue(new Error("stats unavailable"));
    render(<WorldsimScreen name="Test world" onBack={vi.fn()} onView={vi.fn()} onStop={vi.fn(async () => {})} />);
    expect((await screen.findByRole("alert")).textContent).toContain("stats unavailable");
  });
});
