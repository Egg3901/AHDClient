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
    sandboxGate: null,
    ...overrides,
  };
  render(<Launcher {...props} />);
  return props;
}

describe("Launcher", () => {
  afterEach(cleanup);

  it("keeps singleplayer actions together until New Game opens era selection", async () => {
    const props = renderLauncher();
    expect(screen.getByRole("button", { name: "New Game" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load Game" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next era" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New Game" }));
    expect(screen.getByText("Cold War dawn")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Next era" }));
    expect(screen.getByText("Late Cold War")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Previous era" }));
    await userEvent.click(screen.getByRole("button", { name: /Start new game/ }));
    expect(props.onNewWorld).toHaveBeenCalledWith("1953");
  });

  it("starts a new world in the selected era", async () => {
    const props = renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "New Game" }));
    await userEvent.click(screen.getByRole("button", { name: "Next era" }));
    await userEvent.click(screen.getByRole("button", { name: /Start new game/ }));
    expect(props.onNewWorld).toHaveBeenCalledWith("1979");
  });

  it("keeps era photography hidden until New Game and delegates source opening", async () => {
    localStorage.removeItem("ahdclient.launcher.era");
    const onPhotoSource = vi.fn();
    renderLauncher({ onPhotoSource });
    expect(screen.queryByAltText(/Eisenhower's 1953/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New Game" }));
    expect(screen.getByAltText(/Eisenhower's 1953/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Photo source" }));
    expect(onPhotoSource).toHaveBeenCalledWith("1953");
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
    expect(props.onPlayOnline).toHaveBeenCalledWith("live");
  });

  it("offers the sandbox server as a third mode", async () => {
    const props = renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "Sandbox" }));
    await userEvent.click(screen.getByRole("button", { name: /Enter sandbox/ }));
    expect(props.onPlayOnline).toHaveBeenCalledWith("sandbox");
  });
});
