// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld, getCatalog, type Bill } from "@ahdclient/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { game } from "../game.js";
import { CongressScreen } from "./Congress.js";

function renderCongress() {
  const world = createWorld({
    seed: "congress-procedure-controls",
    playerName: "Senator Tester",
    countryId: "US",
    era: "1953",
  });
  world.player.actions = 20;
  game.resumeGame(world);
  render(
    <CongressScreen
      world={world}
      onWorld={vi.fn()}
      onToast={vi.fn()}
      onBack={vi.fn()}
      initialCountryId="US"
    />,
  );
  return world;
}

describe("CongressScreen procedure controls", () => {
  beforeEach(() => game.endGame());
  afterEach(cleanup);

  it("proposes repeal of an enacted law through the action engine", async () => {
    const state = createWorld({
      seed: "congress-repeal-control",
      playerName: "Representative Tester",
      countryId: "US",
      era: "1953",
    });
    const catalogEntry = getCatalog("US").find((entry) => entry.status === "available");
    expect(catalogEntry).toBeDefined();
    state.player.actions = 20;
    state.player.legislativeSeat = { chamberKey: "house", countryId: "US" };
    state.enactedLaws = [{
      id: catalogEntry!.id,
      countryId: "US",
      billId: "enacted-source",
      enactedAtTurn: 1,
      level: 1,
      scope: "national",
    }];
    game.resumeGame(state);
    render(
      <CongressScreen
        world={state}
        onWorld={vi.fn()}
        onToast={vi.fn()}
        onBack={vi.fn()}
        initialCountryId="US"
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Propose repeal" }));

    expect(state.bills.some((bill) => bill.effectDirection === -1 && bill.legislationTypeId === catalogEntry!.id)).toBe(true);
  });

  it("invokes a filibuster from an eligible Senate seat", async () => {
    const state = renderCongress();
    state.player.legislativeSeat = { chamberKey: "senate", countryId: "US" };
    const senateBill: Bill = {
      id: "senate-test-bill",
      title: "Senate Test Bill",
      summary: "A procedural test bill.",
      countryId: "US",
      category: "economy",
      provisions: [],
      originChamber: "senate",
      currentChamber: "senate",
      status: "active",
      sponsorId: null,
      sponsorName: "Sponsor",
      sponsorPartyId: null,
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      proposedAtTurn: state.meta.turn,
      votingEndsOnTurn: state.meta.turn + 4,
      filibusterInvocations: [],
      updatedAtTurn: state.meta.turn,
    };
    state.bills = [senateBill];
    cleanup();
    game.resumeGame(state);
    render(
      <CongressScreen
        world={state}
        onWorld={vi.fn()}
        onToast={vi.fn()}
        onBack={vi.fn()}
        initialCountryId="US"
      />,
    );
    const user = userEvent.setup();
    const detail = screen.getByRole("heading", { name: "Senate Test Bill" }).closest(".congress-detail");
    expect(detail).not.toBeNull();

    await user.click(within(detail as HTMLElement).getByRole("button", { name: "Invoke filibuster" }));

    expect(senateBill.filibusterInvocations).toEqual([
      { characterId: "player", characterName: "Senator Tester", invokedAtTurn: state.meta.turn },
    ]);
  });
});
