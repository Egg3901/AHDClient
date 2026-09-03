// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { game } from "../game.js";
import { HeadOfStateScreen } from "./HeadOfState.js";

function world() {
  return createWorld({
    seed: "hos-controls",
    playerName: "President Tester",
    countryId: "US",
    era: "1953",
    mode: "hos",
  });
}

function renderScreen(state = world()) {
  game.resumeGame(state);
  render(
    <HeadOfStateScreen
      world={state}
      onWorld={vi.fn()}
      onToast={vi.fn()}
      onBack={vi.fn()}
      onOpenLegislative={vi.fn()}
      onOpenEconomy={vi.fn()}
    />,
  );
  return state;
}

describe("HeadOfStateScreen", () => {
  beforeEach(() => game.endGame());
  afterEach(cleanup);

  it("opens a real cabinet confirmation vote", async () => {
    const state = renderScreen();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open confirmation vote" }));

    expect(state.cabinetNominations).toHaveLength(1);
    expect(state.cabinetNominations[0]?.status).toBe("active");
    expect(state.cabinetNominations[0]?.proposedBy).toBe("player");
  });

  it("commissions a valid geological survey through the action engine", async () => {
    const state = world();
    const capacity = Object.values(state.stateResourceCapacities).find((entry) =>
      Object.values(entry.resources).some((amount) => (amount ?? 0) > 0),
    );
    expect(capacity).toBeDefined();
    const resource = Object.entries(capacity!.resources).find(([, amount]) => (amount ?? 0) > 0)?.[0];
    expect(resource).toBeDefined();
    renderScreen(state);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Region"), capacity!.regionId);
    await user.selectOptions(screen.getByLabelText("Resource"), resource!);
    await user.click(screen.getByRole("button", { name: "Commission survey" }));

    expect(state.prospectingSurveys).toHaveLength(1);
    expect(state.prospectingSurveys[0]).toMatchObject({
      regionId: capacity!.regionId,
      resource,
      status: "active",
    });
  });

  it("shows live strategic systems without the stale W32 blocker", () => {
    renderScreen();
    expect(screen.getByText("Strategic status")).toBeTruthy();
    expect(screen.queryByText(/W32 .*has not merged/i)).toBeNull();
  });
});
