/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  singleplayerStatus: vi.fn(),
  advanceTurn: vi.fn(),
}));

vi.mock("./worlds.js", () => ({
  game: {
    singleplayerStatus: mocks.singleplayerStatus,
    advanceTurn: mocks.advanceTurn,
  },
}));

import { GameToolbar } from "./GameToolbar.js";

const base = {
  worldName: "Cold War dawn, 1953",
  onLauncher: vi.fn(),
  onSaveAndStop: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenDiagnostics: vi.fn(),
  onPopOutBriefing: vi.fn(),
};

function prepare(status: unknown) {
  mocks.singleplayerStatus.mockResolvedValue(status);
  mocks.advanceTurn.mockResolvedValue({ success: true, turn: 2, message: "Turn 2" });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GameToolbar", () => {
  it("locks End turn until the game reports a character", async () => {
    prepare({ hasWorld: true, turn: 1, hasCharacter: false, characterName: null, mode: "normal" });
    render(<GameToolbar {...base} worldsim={false} identity={null} />);

    const button = screen.getByRole("button", { name: "End turn" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(button.getAttribute("title")).toMatch(/Create a character/));
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(mocks.advanceTurn).not.toHaveBeenCalled();
  });

  it("advances the turn once a character exists and reports the new turn", async () => {
    prepare({ hasWorld: true, turn: 1, hasCharacter: true, characterName: "Ada", mode: "normal" });
    const onTurnAdvanced = vi.fn();
    render(<GameToolbar {...base} worldsim={false} identity={null} onTurnAdvanced={onTurnAdvanced} />);

    const button = await screen.findByRole("button", { name: "End turn" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    await waitFor(() => expect(mocks.advanceTurn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onTurnAdvanced).toHaveBeenCalledWith(2));
    expect(mocks.singleplayerStatus).toHaveBeenCalledTimes(2);
  });

  it("surfaces turn failures without losing the toolbar", async () => {
    prepare({ hasWorld: true, turn: 1, hasCharacter: true, characterName: "Ada", mode: "normal" });
    mocks.advanceTurn.mockRejectedValue(new Error("turn exploded"));
    render(<GameToolbar {...base} worldsim={false} identity={null} />);

    const button = await screen.findByRole("button", { name: "End turn" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("turn exploded");
  });

  it("omits End turn for worldsim and offers world statistics instead", async () => {
    prepare({ hasWorld: true, turn: 40, hasCharacter: false, characterName: null, mode: "worldsim" });
    const onViewStats = vi.fn();
    render(<GameToolbar {...base} worldsim identity={null} onViewStats={onViewStats} />);

    await waitFor(() => expect(mocks.singleplayerStatus).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "End turn" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "World statistics" }));
    expect(onViewStats).toHaveBeenCalledTimes(1);
  });

  it("shows the linked identity with supporter mark and a trusted avatar", async () => {
    prepare({ hasWorld: true, turn: 1, hasCharacter: true, characterName: "Ada", mode: "normal" });
    render(
      <GameToolbar
        {...base}
        worldsim={false}
        identity={{
          displayName: "Ada Lovelace",
          avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png",
          supporter: true,
        }}
      />,
    );

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Supporter")).toBeTruthy();
    const img = document.querySelector(".client-toolbar-identity img");
    expect(img?.getAttribute("src")).toBe("https://cdn.discordapp.com/avatars/1/a.png");
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("falls back to an initial for an untrusted avatar URL", async () => {
    prepare({ hasWorld: true, turn: 1, hasCharacter: true, characterName: "Ada", mode: "normal" });
    render(
      <GameToolbar
        {...base}
        worldsim={false}
        identity={{ displayName: "Ada Lovelace", avatarUrl: "https://evil.com/a.png", supporter: false }}
      />,
    );

    expect(document.querySelector(".client-toolbar-identity img")).toBeNull();
    expect(document.querySelector(".client-toolbar-identity")?.textContent).toContain("AL");
  });

  it("keeps pause-free overflow actions behind More", async () => {
    prepare({ hasWorld: true, turn: 1, hasCharacter: true, characterName: "Ada", mode: "normal" });
    const handlers = {
      onSaveAndStop: vi.fn(),
      onOpenDiagnostics: vi.fn(),
      onOpenSettings: vi.fn(),
      onPopOutBriefing: vi.fn(),
    };
    render(<GameToolbar {...base} {...handlers} worldsim={false} identity={null} />);

    // Closed <details> content stays out of the accessibility tree, so reach
    // the overflow items through the DOM instead of role queries.
    const overflow = [...document.querySelectorAll<HTMLButtonElement>(".client-toolbar-overflow [role='menuitem']")];
    expect(overflow.map((button) => button.textContent)).toEqual([
      "Save and stop",
      "Diagnostics",
      "Settings",
      "Briefing in picture-in-picture",
    ]);
    const keys = ["onSaveAndStop", "onOpenDiagnostics", "onOpenSettings", "onPopOutBriefing"] as const;
    overflow.forEach((button, index) => {
      fireEvent.click(button);
      expect(handlers[keys[index]!]).toHaveBeenCalledTimes(1);
    });
  });
});
