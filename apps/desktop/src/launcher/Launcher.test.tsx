/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Launcher } from "./Launcher.js";
import type { WorldMeta } from "../worlds.js";

vi.mock("./CommandGlobe.js", () => ({
  CommandGlobe: () => null,
  themeForEra: () => ({ phosphor: "#0f0" }),
}));

const world: WorldMeta = {
  slot: "cold-war-1953",
  name: "Cold War, 1953",
  preset: "1953-default",
  createdAt: "2026-09-05T00:00:00Z",
  lastPlayedAt: "2026-09-05T01:00:00Z",
  turn: 12,
  character: "Senator Example",
};

function renderLauncher(overrides: Partial<Parameters<typeof Launcher>[0]> = {}) {
  const props = {
    onNewWorld: vi.fn(),
    onContinue: vi.fn(),
    onLoad: vi.fn(),
    onPlayOnline: vi.fn(),
    error: null,
    onClearError: vi.fn(),
    latestWorld: null,
    runningSlot: null,
    continueBusy: false,
    ...overrides,
  };
  render(<Launcher {...props} />);
  return props;
}

describe("Launcher", () => {
  afterEach(cleanup);

  it("offers every era and starts a new world in the chosen one", async () => {
    const props = renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "2007" }));
    await userEvent.click(screen.getByRole("button", { name: /New world/ }));
    expect(props.onNewWorld).toHaveBeenCalledWith("2007");
  });

  it("continues the most recent world by slot", async () => {
    const props = renderLauncher({ latestWorld: world });
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(props.onContinue).toHaveBeenCalledWith("cold-war-1953");
    expect(screen.getByText(/turn 12/)).toBeTruthy();
  });

  it("says Resume when that world's server is already running", () => {
    renderLauncher({ latestWorld: world, runningSlot: world.slot });
    expect(screen.getByRole("button", { name: /Resume/ })).toBeTruthy();
  });

  it("hands multiplayer to the guarded online window", async () => {
    const props = renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "Multiplayer" }));
    await userEvent.click(screen.getByRole("button", { name: /Enter multiplayer/ }));
    expect(props.onPlayOnline).toHaveBeenCalled();
  });
});
