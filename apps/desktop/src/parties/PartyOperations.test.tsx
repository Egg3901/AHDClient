// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld, type WorldState } from "@ahdclient/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { game } from "../game.js";
import { PartyOperations } from "./PartyOperations.js";

function playerPartyWorld(seed: string): WorldState {
  const world = createWorld({
    seed,
    playerName: "Taylor Morgan",
    countryId: "US",
    era: "1953",
  });
  if (!world.player.partyId) {
    world.player.partyId = Object.values(world.parties).find((party) => party.countryId === "US")!.id;
  }
  world.player.actions = 50;
  return world;
}

function renderOperations(world: WorldState) {
  game.resumeGame(world);
  const onWorld = vi.fn();
  const onToast = vi.fn();
  const view = render(<PartyOperations world={world} onWorld={onWorld} onToast={onToast} />);
  return { ...view, onWorld, onToast };
}

function partyPolitician(world: WorldState): WorldState["politicians"][number] {
  return world.politicians.find(
    (politician) =>
      politician.countryId === world.player.countryId &&
      politician.partyId === world.player.partyId,
  )!;
}

afterEach(cleanup);
beforeEach(() => game.endGame());

describe("PartyOperations", () => {
  it("creates an endorsement through the real engine action", async () => {
    const world = playerPartyWorld("party-ops-endorse");
    const user = userEvent.setup();
    const target = partyPolitician(world);
    const { onWorld, onToast } = renderOperations(world);

    await user.selectOptions(screen.getByLabelText("Endorsement target"), target.id);
    await user.click(screen.getByRole("button", { name: "Endorse" }));

    expect(world.endorsements).toContainEqual(expect.objectContaining({
      endorserId: "player",
      endorsedId: target.id,
      endorsedType: "politician",
      active: true,
    }));
    expect(onWorld).toHaveBeenCalledOnce();
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining(target.id));
  });

  it("uses the bound ruling party for head-of-state worlds", async () => {
    const world = createWorld({
      seed: "party-ops-hos",
      playerName: "Premier Morgan",
      countryId: "US",
      era: "1953",
      mode: "hos",
    });
    world.player.actions = 50;
    expect(world.player.partyId).toBeNull();
    expect(world.player.hosPartyId).not.toBeNull();
    const target = world.politicians.find(
      (politician) => politician.partyId === world.player.hosPartyId,
    )!;
    const user = userEvent.setup();
    renderOperations(world);

    await user.selectOptions(screen.getByLabelText("Endorsement target"), target.id);
    await user.click(screen.getByRole("button", { name: "Endorse" }));

    expect(world.endorsements).toContainEqual(expect.objectContaining({
      endorsedId: target.id,
      endorserPartyId: world.player.hosPartyId,
    }));
    expect(world.player.partyId).toBeNull();
  });

  it("enters an open state leadership race with its exact election id", async () => {
    const world = playerPartyWorld("party-ops-contest-leadership");
    const politician = partyPolitician(world);
    const region = Object.values(world.regions).find((candidate) => candidate.countryId === "US")!;
    world.statePartyElections.push({
      id: "state-leadership-test",
      regionId: region.id,
      partyId: world.player.partyId!,
      countryId: "US",
      position: "chair",
      status: "voting",
      startTurn: world.meta.turn,
      endTurn: world.meta.turn + 12,
      durationTurns: 12,
      cycle: 1,
      winnerId: null,
      candidateIds: [politician.id],
      votes: {},
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    });
    const user = userEvent.setup();
    renderOperations(world);

    await user.click(screen.getByRole("button", { name: "Enter race" }));

    expect(world.statePartyElections[0]!.candidateIds).toContain("player");
  });

  it("casts a national leadership ballot for the selected candidate", async () => {
    const world = playerPartyWorld("party-ops-vote-leadership");
    const politician = partyPolitician(world);
    world.nationalPartyElections.push({
      id: "national-leadership-test",
      partyId: world.player.partyId!,
      countryId: "US",
      position: "treasurer",
      status: "voting",
      startTurn: world.meta.turn,
      endTurn: world.meta.turn + 12,
      durationTurns: 12,
      cycle: 1,
      winnerId: null,
      candidateIds: [politician.id, "player"],
      votes: {},
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    });
    const user = userEvent.setup();
    renderOperations(world);

    await user.selectOptions(screen.getByLabelText("Candidate for National Treasurer"), "player");
    await user.click(screen.getByRole("button", { name: "Cast vote" }));

    expect(world.nationalPartyElections[0]!.votes.player).toBe("player");
  });

  it("enters and votes in national committee elections", async () => {
    const world = playerPartyWorld("party-ops-committee");
    const politician = partyPolitician(world);
    world.nationalCommitteeElections.push({
      id: "committee-test",
      partyId: world.player.partyId!,
      countryId: "US",
      status: "voting",
      startTurn: world.meta.turn,
      endTurn: world.meta.turn + 12,
      durationTurns: 12,
      cycle: 1,
      winnerIds: [],
      candidateIds: [politician.id],
      votes: {},
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    });
    const user = userEvent.setup();
    const first = renderOperations(world);

    await user.click(screen.getByRole("button", { name: "Enter race" }));
    expect(world.nationalCommitteeElections[0]!.candidateIds).toContain("player");

    first.unmount();
    render(<PartyOperations world={world} onWorld={vi.fn()} onToast={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: "Taylor Morgan (you)" }));
    await user.click(screen.getByRole("button", { name: "Cast committee vote" }));

    expect(world.nationalCommitteeElections[0]!.votes.player).toEqual(["player"]);
  });

  it("creates and joins coalitions with complete parameters", async () => {
    const createWorldState = playerPartyWorld("party-ops-create-coalition");
    const user = userEvent.setup();
    const first = renderOperations(createWorldState);

    await user.type(screen.getByLabelText("Coalition name"), "Common Ground");
    await user.type(screen.getByLabelText("Coalition abbreviation"), "CG");
    await user.click(screen.getByRole("button", { name: "Create coalition" }));

    expect(createWorldState.coalitions[0]).toMatchObject({
      countryId: "US",
      name: "Common Ground",
      abbreviation: "CG",
      memberPartyIds: [createWorldState.player.partyId],
    });

    first.unmount();
    const joinWorldState = playerPartyWorld("party-ops-join-coalition");
    const otherParty = Object.values(joinWorldState.parties).find(
      (party) => party.countryId === "US" && party.id !== joinWorldState.player.partyId,
    )!;
    joinWorldState.coalitions.push({
      id: "coalition-US-test",
      sequentialId: 1,
      countryId: "US",
      name: "National Compact",
      abbreviation: "NC",
      color: "#888888",
      memberPartyIds: [otherParty.id],
      chairPartyId: otherParty.id,
      chairCharacterId: null,
      disbandVote: null,
      createdAtTurn: joinWorldState.meta.turn,
      updatedAtTurn: joinWorldState.meta.turn,
    });
    renderOperations(joinWorldState);
    await user.click(screen.getByRole("button", { name: "Join" }));

    expect(joinWorldState.coalitions[0]!.memberPartyIds).toContain(joinWorldState.player.partyId);
  });

  it("starts and votes in a coalition disband ballot", async () => {
    const world = playerPartyWorld("party-ops-disband");
    const partyId = world.player.partyId!;
    world.coalitions.push({
      id: "coalition-US-player",
      sequentialId: 1,
      countryId: "US",
      name: "Unity Coalition",
      abbreviation: "UC",
      color: "#888888",
      memberPartyIds: [partyId],
      chairPartyId: partyId,
      chairCharacterId: null,
      disbandVote: null,
      createdAtTurn: world.meta.turn,
      updatedAtTurn: world.meta.turn,
    });
    const user = userEvent.setup();
    const first = renderOperations(world);

    await user.click(screen.getByRole("button", { name: /Start disband vote/ }));
    expect(world.coalitions[0]!.disbandVote).not.toBeNull();

    first.unmount();
    render(<PartyOperations world={world} onWorld={vi.fn()} onToast={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Vote yes" }));

    expect(world.coalitions[0]!.disbandVote?.votes[partyId]).toBe("yes");
  });

  it("shows honest empty states when no internal election is open", () => {
    const world = playerPartyWorld("party-ops-empty");
    renderOperations(world);

    expect(screen.getByText("No state or national party leadership election is open.")).toBeTruthy();
    expect(screen.getByText("No national committee election is open.")).toBeTruthy();
  });
});
