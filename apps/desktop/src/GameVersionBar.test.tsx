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
  it("distinguishes the client bundle from selectable game runtime releases", async () => {
    mocks.list.mockResolvedValue([{ version: "1.8.0", installed: false, selected: false }]);
    render(<GameVersionBar />);

    expect(screen.getByText("Game runtime")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Bundled game 1.8.0" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("option", { name: "1.8.0 · download" })).toBeTruthy());
  });
});
