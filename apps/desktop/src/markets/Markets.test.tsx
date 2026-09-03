// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { game } from "../game.js";
import { MarketsScreen } from "./Markets.js";

function world() {
  return createWorld({
    seed: "markets-controls",
    playerName: "Tester",
    countryId: "US",
    era: "1953",
  });
}

describe("MarketsScreen finance controls", () => {
  beforeEach(() => game.endGame());
  afterEach(cleanup);

  it("moves cash into savings through the real engine action", async () => {
    const state = world();
    game.resumeGame(state);
    const user = userEvent.setup();
    render(
      <MarketsScreen
        world={state}
        onWorld={vi.fn()}
        onBack={vi.fn()}
        countryId="US"
      />,
    );

    const cashBefore = state.player.cash;
    await user.type(screen.getByPlaceholderText("amount"), "100");
    await user.click(screen.getByRole("button", { name: "Deposit" }));

    expect(game.getStateSync()?.player.cash).toBe(cashBefore - 100);
    expect(game.getStateSync()?.player.savings).toBe(100);
    expect(screen.getByRole("status").textContent).toContain("Deposited 100");
  });

  it("offers working sovereign bond controls instead of an empty-parameter action", async () => {
    const state = world();
    state.bonds["us-test"] = {
      id: "us-test",
      issuerType: "sovereign",
      countryId: "US",
      issuerName: "United States Treasury",
      faceValue: 100,
      couponRate: 0.04,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1,
      totalIssued: 100,
      publicFloat: 100,
      holders: [],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: state.meta.date,
      updatedAt: state.meta.date,
    };
    game.resumeGame(state);
    const user = userEvent.setup();
    render(
      <MarketsScreen
        world={state}
        onWorld={vi.fn()}
        onBack={vi.fn()}
        countryId="US"
      />,
    );

    await user.type(screen.getByLabelText("Units for us-test"), "2");
    const row = screen.getByText("us-test").closest("tr");
    expect(row).not.toBeNull();
    await user.click(row!.querySelector<HTMLButtonElement>("button")!);

    expect(state.bonds["us-test"]!.holders.find((holder) => holder.holderId === "player")?.units).toBe(2);
  });
});
