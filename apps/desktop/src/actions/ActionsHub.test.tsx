// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createWorld } from "@ahdclient/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionsHub } from "./ActionsHub.js";

afterEach(() => cleanup());

describe("ActionsHub", () => {
  it("only renders actions whose complete inputs are collected in the hub", () => {
    const world = createWorld({
      seed: "actions-hub-input-safety",
      playerName: "Tester",
      countryId: "US",
      era: "1953",
    });
    const view = render(
      <ActionsHub world={world} onWorld={vi.fn()} onToast={vi.fn()} />,
    );

    const renderedActionIds = Array.from(
      view.container.querySelectorAll<HTMLElement>("[data-action-id]"),
      (card) => card.dataset.actionId,
    );
    expect(new Set(renderedActionIds)).toEqual(new Set([
      "fundraise",
      "campaign",
      "advertise",
      "buildDonorBase",
      "convertCash",
      "rest",
      "canvass",
      "organize",
      "pressureBoost",
    ]));

    for (const dedicatedAction of [
      "Sponsor Bill",
      "Declare Candidacy",
      "Join Party",
      "Buy Shares",
      "Buy Bond",
      "Direct Spending",
      "Commission Geological Survey",
      "Deposit to Savings",
    ]) {
      expect(screen.queryByText(dedicatedAction)).toBeNull();
    }
  });

  it("does not expose an executable control outside the hub-safe action set", () => {
    const world = createWorld({
      seed: "actions-hub-button-safety",
      playerName: "Tester",
      countryId: "US",
      era: "1953",
    });
    const view = render(
      <ActionsHub world={world} onWorld={vi.fn()} onToast={vi.fn()} />,
    );
    const safeIds = new Set([
      "fundraise",
      "campaign",
      "advertise",
      "buildDonorBase",
      "convertCash",
      "rest",
      "canvass",
      "organize",
      "pressureBoost",
    ]);

    for (const button of view.container.querySelectorAll("button")) {
      const actionId = button.closest<HTMLElement>("[data-action-id]")?.dataset.actionId;
      expect(actionId, button.textContent ?? "action button").toBeDefined();
      expect(safeIds.has(actionId!), `${actionId}: ${button.textContent}`).toBe(true);
    }
  });
});
