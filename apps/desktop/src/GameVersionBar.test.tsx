/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), install: vi.fn(), select: vi.fn() }));

vi.mock("./worlds.js", () => ({ gameVersions: mocks }));

import { GameVersionBar } from "./GameVersionBar.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GameVersionBar", () => {
  it("does not list the bundled runtime twice", async () => {
    mocks.list.mockResolvedValue([{ version: "1.8.1", installed: false, selected: false }]);
    render(<GameVersionBar />);

    expect(screen.getByText("Game runtime")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Bundled game 1.8.3" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  });

  it("downloads and selects the newest published runtime automatically", async () => {
    mocks.list
      .mockResolvedValueOnce([
        { version: "1.9.0", installed: false, selected: false },
        { version: "1.8.0", installed: false, selected: false },
      ])
      .mockResolvedValueOnce([{ version: "1.9.0", installed: true, selected: true }]);
    mocks.install.mockResolvedValue(undefined);
    mocks.select.mockResolvedValue(undefined);

    render(<GameVersionBar />);

    await waitFor(() => expect(mocks.install).toHaveBeenCalledWith("1.9.0"));
    expect(mocks.select).toHaveBeenCalledWith("1.9.0");
  });

  it("never replaces the newer bundled runtime with an older published runtime", async () => {
    mocks.list.mockResolvedValue([
      { version: "1.8.1", installed: false, selected: false },
    ]);

    render(<GameVersionBar />);

    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(mocks.install).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "1.8.1 · download" })).toBeTruthy();
  });
});
