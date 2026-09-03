// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { game } from "../game.js";
import { CharacterPanel } from "./CharacterPanel.js";

afterEach(() => cleanup());

describe("CharacterPanel", () => {
  it("opens after mounting closed without changing its hook order", () => {
    const world = createWorld({
      seed: "character-panel",
      playerName: "Tester",
      countryId: "US",
      era: "1953",
    });
    const view = render(
      <CharacterPanel world={world} open={false} onClose={vi.fn()} />,
    );
    expect(() =>
      view.rerender(
        <CharacterPanel world={world} open={true} onClose={vi.fn()} />,
      ),
    ).not.toThrow();
    expect(screen.getByRole("dialog", { name: "Character" })).toBeTruthy();
  });

  it("lets a migrated save choose its missing home region", async () => {
    const user = userEvent.setup();
    const world = createWorld({
      seed: "character-home-region",
      playerName: "Tester",
      countryId: "US",
      era: "1953",
    });
    world.player.homeRegionId = null;
    game.resumeGame(world);
    const onWorld = vi.fn();
    render(
      <CharacterPanel
        world={world}
        open={true}
        onClose={vi.fn()}
        onWorld={onWorld}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Home state or region"), "CA");
    await user.click(screen.getByRole("button", { name: "Set home region" }));

    expect(game.getStateSync()?.player.homeRegionId).toBe("CA");
    expect(onWorld).toHaveBeenCalledTimes(1);
  });
});
