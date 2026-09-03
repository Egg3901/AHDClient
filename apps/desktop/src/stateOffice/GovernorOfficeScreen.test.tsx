// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld, type WorldState } from "@ahdclient/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernorOfficeScreen } from "./GovernorOfficeScreen.js";
import { localGovernorOfficeActions } from "./localGovernorOfficeActions.js";

afterEach(() => cleanup());

function playerGovernorWorld(): { world: WorldState; stateId: string } {
  const world = createWorld({
    seed: "governor-office-ui",
    playerName: "Alex Morgan",
    countryId: "US",
    era: "1953",
  });
  const stateId = Object.values(world.regions).find(
    (region) => region.countryId === world.player.countryId,
  )!.id;
  world.player.homeRegionId = stateId;
  world.governors[stateId]!.governorId = "player";
  world.governors[stateId]!.governorName = world.player.name;
  world.governors[stateId]!.governorParty = world.player.partyId;
  world.governors[stateId]!.termStartTurn = world.meta.turn;
  world.governors[stateId]!.gubernatorialActions = 3;
  return { world, stateId };
}

function props(world: WorldState) {
  return {
    world,
    actions: localGovernorOfficeActions,
    onWorld: vi.fn(),
    onBack: vi.fn(),
    onToast: vi.fn(),
  };
}

describe("GovernorOfficeScreen", () => {
  it("shows an honest empty state when no home state is selected", () => {
    const { world } = playerGovernorWorld();
    world.player.homeRegionId = null;

    render(<GovernorOfficeScreen {...props(world)} />);

    expect(screen.getByRole("heading", { name: "No home state selected" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Deliver address" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Issue order/ })).toBeNull();
  });

  it("does not expose mutation controls for an NPC-held office", () => {
    const { world, stateId } = playerGovernorWorld();
    world.governors[stateId]!.governorId = "npc-governor";
    world.governors[stateId]!.governorName = "Jordan Taylor";

    render(<GovernorOfficeScreen {...props(world)} />);

    expect(screen.getByRole("heading", { name: "You do not hold this office" })).toBeTruthy();
    expect(screen.getAllByText("Jordan Taylor").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: "Deliver address" })).toBeNull();
  });

  it("delivers an address through the real engine mutation", async () => {
    const user = userEvent.setup();
    const { world, stateId } = playerGovernorWorld();
    const callbacks = props(world);
    const beforeCount = world.governorAddresses.length;

    render(<GovernorOfficeScreen {...callbacks} />);
    await user.type(
      screen.getByLabelText(/^Address title/),
      "A stronger future for our state",
    );
    await user.click(screen.getByRole("button", { name: "Deliver address" }));

    expect(world.governorAddresses).toHaveLength(beforeCount + 1);
    expect(world.governorAddresses.at(-1)).toMatchObject({
      stateId,
      title: "A stronger future for our state",
      deliveredBy: "player",
    });
    expect(world.governors[stateId]!.gubernatorialActions).toBe(2);
    expect(callbacks.onWorld).toHaveBeenCalledOnce();
    expect(callbacks.onToast).toHaveBeenCalledWith(
      expect.stringContaining("address delivered"),
    );
    expect(screen.getByText(/turnout effect is active for 24 turns/i)).toBeTruthy();
  });

  it("issues an order through the real engine mutation and reports the engine limitation", async () => {
    const user = userEvent.setup();
    const { world, stateId } = playerGovernorWorld();
    const callbacks = props(world);

    render(<GovernorOfficeScreen {...callbacks} />);
    expect(screen.getByText(/does not yet write a permanent state policy ladder/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Issue order for 1 action" }));

    expect(world.governorOrders).toHaveLength(1);
    expect(world.governorOrders[0]).toMatchObject({
      stateId,
      issuedBy: "player",
      effectDirection: 1,
      steps: 1,
      status: "active",
    });
    expect(world.governors[stateId]!.gubernatorialActions).toBe(2);
    expect(callbacks.onWorld).toHaveBeenCalledOnce();
    expect(screen.getByText(/regional grant effect is active for 24 turns/i)).toBeTruthy();
  });

  it("surfaces an engine rejection without committing the world", async () => {
    const user = userEvent.setup();
    const { world } = playerGovernorWorld();
    const callbacks = props(world);
    const actions = {
      ...localGovernorOfficeActions,
      deliverAddress: vi.fn(() => ({ ok: false, error: "Address window closed." })),
    };

    render(<GovernorOfficeScreen {...callbacks} actions={actions} />);
    await user.type(screen.getByLabelText(/^Address title/), "A valid address title");
    await user.click(screen.getByRole("button", { name: "Deliver address" }));

    expect(screen.getByRole("status").textContent).toContain("Address window closed.");
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("error");
    expect(callbacks.onWorld).not.toHaveBeenCalled();
  });

  it("withholds address submission when the turnout target model is missing", () => {
    const { world, stateId } = playerGovernorWorld();
    delete world.regionTurnouts[stateId];

    render(<GovernorOfficeScreen {...props(world)} />);

    expect(screen.getByText(/no turnout categories exist/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Deliver address" })).toBeNull();
  });
});
