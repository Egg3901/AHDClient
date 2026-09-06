/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  game: {
    start: vi.fn(),
    stop: vi.fn(),
    status: vi.fn(),
    setup: vi.fn(),
    setupProgress: vi.fn(),
    singleplayerStatus: vi.fn(),
    openWindow: vi.fn(),
    closeEmbedded: vi.fn(),
    request: vi.fn(),
  },
  worlds: { list: vi.fn(), create: vi.fn(), touch: vi.fn(), remove: vi.fn() },
  online: { account: vi.fn(), open: vi.fn(), link: vi.fn() },
  listen: vi.fn(),
  stats: {
    captureStatistics: vi.fn(),
    flushStatistics: vi.fn(),
    setStatisticsConsent: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("./worlds.js", () => ({
  game: mocks.game,
  worlds: mocks.worlds,
  online: mocks.online,
  eraById: (id: string) =>
    id === "1953"
      ? {
          id,
          preset: "1953-default",
          label: "1953",
          subtitle: "Cold War dawn",
          startDate: "January 1953",
        }
      : undefined,
  slugForWorld: () => "test-world",
}));
vi.mock("./statisticsDelivery.js", () => mocks.stats);
vi.mock("./SettingsMenu.js", () => ({ SettingsMenu: () => null }));
vi.mock("./launcher/Launcher.js", () => ({
  Launcher: ({
    onNewWorld,
    error,
  }: {
    onNewWorld: (era: string, worldsim?: boolean) => void;
    error: string | null;
  }) => (
    <main>
      <button onClick={() => onNewWorld("1953")}>New world</button>
      {error && <p role="alert">{error}</p>}
    </main>
  ),
}));
vi.mock("./screens/NewWorldScreen.js", () => ({
  NewWorldScreen: ({
    onCreate,
  }: {
    onCreate: (name: string, displayName: string, setup: unknown) => void;
  }) => (
    <main>
      <button
        onClick={() =>
          onCreate("Test world", "", {
            mode: "normal",
            difficulty: "normal",
            autonomyLevel: "v4",
            featureFlags: {},
          })
        }
      >
        Create
      </button>
    </main>
  ),
}));
vi.mock("./screens/WorldsScreen.js", () => ({ WorldsScreen: () => null }));
vi.mock("./screens/BootScreen.js", () => ({
  BootScreen: () => <p>Booting</p>,
}));
vi.mock("./screens/PlayingScreen.js", () => ({
  PlayingScreen: () => <p>Playing</p>,
}));
vi.mock("./screens/WorldsimScreen.js", () => ({
  WorldsimScreen: ({ onView }: { onView: () => void }) => (
    <main>
      <p>Worldsim</p>
      <button onClick={onView}>View all world</button>
    </main>
  ),
}));

import { App } from "./App.js";

const idle = { running: false, port: null, slot: null, url: null };
const running = {
  running: true,
  port: 3000,
  slot: "test-world",
  url: "http://127.0.0.1:3000",
};
const normalStatus = {
  hasWorld: true,
  turn: 1,
  preset: "1953-default",
  hasCharacter: false,
  characterName: null,
  mode: "normal",
};

function prepare(status = normalStatus) {
  mocks.listen.mockResolvedValue(vi.fn());
  mocks.worlds.list.mockResolvedValue([]);
  mocks.worlds.create.mockResolvedValue({
    slot: "test-world",
    name: "Test world",
    preset: "1953-default",
  });
  mocks.game.status.mockResolvedValue(idle);
  mocks.game.start.mockResolvedValue(running);
  mocks.game.stop.mockResolvedValue(idle);
  mocks.game.setup.mockResolvedValue({ ok: true });
  mocks.game.setupProgress.mockResolvedValue({
    active: true,
    phase: "building",
    label: "Building the world",
    detail: "Seeding institutions",
    progress: 42,
    updatedAt: new Date().toISOString(),
    stalled: false,
  });
  mocks.game.singleplayerStatus.mockResolvedValue(status);
  mocks.game.openWindow.mockResolvedValue(undefined);
  mocks.stats.captureStatistics.mockResolvedValue(undefined);
  mocks.stats.flushStatistics.mockResolvedValue(undefined);
  mocks.stats.setStatisticsConsent.mockResolvedValue(undefined);
  mocks.online.account.mockResolvedValue({
    linked: true,
    displayName: "Ada",
    supporter: false,
    singleplayer: {
      entitled: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
}

describe("App singleplayer integration", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("sends setup options and opens mandatory character creation in the default same window", async () => {
    prepare();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "New world" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(mocks.game.setup).toHaveBeenCalledWith(
        "1953-default",
        expect.objectContaining({
          mode: "normal",
          difficulty: "normal",
          autonomyLevel: "v4",
        }),
        undefined,
      ),
    );
    await waitFor(() =>
      expect(mocks.game.openWindow).toHaveBeenCalledWith(
        "/create-character",
        false,
      ),
    );
  });

  it("keeps worldsim in the launcher until the player requests the game viewport", async () => {
    prepare({ ...normalStatus, mode: "worldsim", hasCharacter: false });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "New world" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.getByText("Worldsim")).toBeTruthy());
    expect(mocks.game.openWindow).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "View all world" }),
    );
    await waitFor(() =>
      expect(mocks.game.openWindow).toHaveBeenCalledWith(
        "/singleplayer/worldsim",
        false,
      ),
    );
  });

  it("surfaces setup failures in the launcher", async () => {
    prepare();
    mocks.game.setup.mockRejectedValue(new Error("setup failed"));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "New world" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "setup failed",
    );
  });

  it("escapes a setup request when the game reports that setup stalled", async () => {
    prepare();
    mocks.game.setup.mockReturnValue(new Promise(() => {}));
    mocks.game.setupProgress.mockResolvedValue({
      active: true,
      phase: "building",
      label: "Building the world",
      detail: "Seeding institutions",
      progress: 42,
      updatedAt: new Date(Date.now() - 120_000).toISOString(),
      stalled: true,
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "New world" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect((await screen.findByRole("alert", {}, { timeout: 3_000 })).textContent)
      .toContain("stopped reporting progress");
  });

  it("does not start a local world for an account without singleplayer access", async () => {
    prepare();
    mocks.online.account.mockResolvedValue({
      linked: true,
      displayName: "Ada",
      supporter: false,
      singleplayer: { entitled: false, expiresAt: null },
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "New world" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "not enabled",
    );
    expect(mocks.game.start).not.toHaveBeenCalled();
  });
});
