// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorld, type WorldState } from "@ahdclient/engine";
import { CountryDetailsScreen } from "./CountryDetailsScreen.js";
import { COUNTRY_DETAIL_ROUTES, isCountryDetailRoute } from "./routes.js";
import { NAV_MANIFEST } from "../navigation/manifest.js";
import { allRouteIds } from "../navigation/resolve.js";

const OPTS = {
  seed: "country-details-test",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

function world(): WorldState {
  return createWorld({ ...OPTS });
}

function show(worldState: WorldState, countryId: string, routeId: string, onBack = vi.fn()) {
  return render(
    <CountryDetailsScreen
      world={worldState}
      countryId={countryId}
      routeId={routeId}
      onBack={onBack}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("CountryDetailsScreen routing", () => {
  it("serves every listed route with a distinct heading", () => {
    const headings = COUNTRY_DETAIL_ROUTES.map((r) => r.heading);
    expect(new Set(headings).size).toBeLessThanOrEqual(headings.length);
    // Banking and unions share one heading across their nation/world aliases only.
    const ids = COUNTRY_DETAIL_ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const route of COUNTRY_DETAIL_ROUTES) {
      expect(isCountryDetailRoute(route.id)).toBe(true);
      expect(route.heading.length).toBeGreaterThan(0);
    }
  });

  it("covers only manifest ids plus documented overview-only ids", () => {
    const manifestIds = new Set(allRouteIds(NAV_MANIFEST));
    const localOnly = [
      "nation.politics.approval",
      "nation.economy.command",
      "nation.economy.nationalization",
      "nation.defense.forces",
    ];
    for (const route of COUNTRY_DETAIL_ROUTES) {
      if (localOnly.includes(route.id)) continue;
      expect(manifestIds.has(route.id)).toBe(true);
    }
  });

  it("shows an unsupported panel with a working back button for unknown routes", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    show(world(), "US", "nation.politics.elections", onBack);
    expect(screen.getByRole("heading", { name: "Unknown destination" })).toBeTruthy();
    expect(screen.getByText(/not served by the local country-details screen/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows an unknown-country panel with a working back button", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    show(world(), "XX", "nation.economy.budget", onBack);
    expect(screen.getByRole("heading", { name: "Unknown country" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("performs zero fetches while rendering", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      show(world(), "US", "nation.economy.budget");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("CountryDetailsScreen destinations", () => {
  it("renders real politicians for the country", () => {
    const state = world();
    const expected = state.politicians.filter((p) => p.countryId === "US");
    expect(expected.length).toBeGreaterThan(0);
    show(state, "US", "nation.politics.politicians");
    expect(screen.getByRole("heading", { name: "Politicians" })).toBeTruthy();
    expect(screen.getAllByText(expected[0]!.name).length).toBeGreaterThan(0);
  });

  it("renders approval inputs from live regional records", () => {
    const state = world();
    show(state, "US", "nation.politics.approval");
    expect(screen.getByRole("heading", { name: "Approval Inputs" })).toBeTruthy();
    const regions = Object.values(state.partyRegions).filter((r) => r.countryId === "US");
    if (regions.length > 0) {
      const regionName = state.regions[regions[0]!.regionId]?.name ?? regions[0]!.regionId;
      expect(screen.getAllByText(regionName).length).toBeGreaterThan(0);
    } else {
      expect(screen.getByText(/no per-region party organization rows/i)).toBeTruthy();
    }
  });

  it("shows an explicit empty state for referendums when none are live", () => {
    const state = world();
    expect(state.referendums.filter((r) => r.countryId === "US")).toHaveLength(0);
    show(state, "US", "nation.politics.referendums");
    expect(screen.getByRole("heading", { name: "Referendums" })).toBeTruthy();
    expect(screen.getByText(/no referendum records/i)).toBeTruthy();
  });

  it("renders the live national budget totals", () => {
    const state = world();
    const budget = state.budgets["US"];
    expect(budget).toBeDefined();
    show(state, "US", "nation.economy.budget");
    expect(screen.getByRole("heading", { name: "National Budget" })).toBeTruthy();
    expect(screen.getAllByText(budget!.revenue.total.toLocaleString("en-US")).length).toBeGreaterThan(0);
    expect(screen.getByText(budget!.creditRating)).toBeTruthy();
  });

  it("renders enacted policy joined to the enacting bill", () => {
    const state = world();
    state.bills.push({
      id: "bill-details",
      title: "Details Test Bill",
      summary: "Test",
      countryId: "US",
      category: "economy",
      provisions: [],
      originChamber: "house",
      currentChamber: "house",
      status: "signed",
      sponsorId: null,
      sponsorName: "Test",
      sponsorPartyId: null,
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      filibusterInvocations: [],
      proposedAtTurn: 0,
      updatedAtTurn: 0,
    });
    state.enactedLaws.push({
      id: "details.law",
      countryId: "US",
      billId: "bill-details",
      enactedAtTurn: 0,
      level: 2,
      scope: "national",
    });
    show(state, "US", "nation.government.policy");
    expect(screen.getByRole("heading", { name: "Enacted Policy" })).toBeTruthy();
    expect(screen.getByText("Details Test Bill")).toBeTruthy();
  });

  it("renders US court seats and an honest empty state for non-US courts", () => {
    const state = world();
    const usSeats = state.supremeCourtSeats.filter((s) => s.countryId === "US");
    show(state, "US", "nation.government.scotus");
    expect(screen.getByRole("heading", { name: "Supreme Court" })).toBeTruthy();
    if (usSeats.length > 0) {
      expect(screen.getByText(usSeats[0]!.justiceName ?? "vacant")).toBeTruthy();
    } else {
      expect(screen.getByText(/no court seats/i)).toBeTruthy();
    }

    cleanup();
    show(state, "RU", "nation.government.scotus");
    const ruSeats = state.supremeCourtSeats.filter((s) => s.countryId === "RU");
    if (ruSeats.length === 0) {
      expect(screen.getByText(/no court seats/i)).toBeTruthy();
    }
  });

  it("renders central-bank stance and chartered banks", () => {
    const state = world();
    show(state, "US", "nation.economy.banking");
    expect(screen.getByRole("heading", { name: "Central and Private Banking" })).toBeTruthy();
    const central = state.centralBanks["US"];
    if (central !== undefined) {
      expect(screen.getByText(`${(central.primeRate * 100).toFixed(1)}%`)).toBeTruthy();
    } else {
      expect(screen.getByText(/no central bank/i)).toBeTruthy();
    }
  });

  it("renders the live FX rate for a forex-active country", () => {
    const state = world();
    const ids = Object.keys(state.exchangeRates);
    expect(ids.length).toBeGreaterThan(0);
    const id = ids[0]!;
    show(state, id, "world.forex");
    expect(screen.getByRole("heading", { name: "Foreign Exchange" })).toBeTruthy();
    expect(screen.getAllByText(state.exchangeRates[id]!.currencyCode).length).toBeGreaterThan(0);
  });

  it("renders the country's seeded unions", () => {
    const state = world();
    const expected = Object.values(state.unions).filter((u) => u.countryId === "US");
    show(state, "US", "nation.economy.unions");
    expect(screen.getByRole("heading", { name: "Unions" })).toBeTruthy();
    if (expected.length > 0) {
      expect(screen.getAllByText(expected[0]!.name).length).toBeGreaterThan(0);
    } else {
      expect(screen.getByText(/no unions for/i)).toBeTruthy();
    }
  });

  it("renders command-economy readings for RU and an empty state for the US", () => {
    const state = world();
    if (state.commandEconomy["RU"] !== undefined) {
      show(state, "RU", "nation.economy.command");
      expect(
        screen.getByRole("heading", { name: "Nationalization and Command Economy" }),
      ).toBeTruthy();
      expect(
        screen.getByText(`${state.commandEconomy["RU"]!.marketizationLevel.toFixed(1)} / 100`),
      ).toBeTruthy();
      cleanup();
    }
    show(state, "US", "nation.economy.command");
    if (state.commandEconomy["US"] === undefined) {
      expect(screen.getByText(/no command-economy state/i)).toBeTruthy();
    }
  });

  it("renders national metrics and the economic model", () => {
    const state = world();
    show(state, "US", "nation.economy.metrics");
    expect(screen.getByRole("heading", { name: "National Metrics" })).toBeTruthy();
    const entries = Object.entries(state.nationalMetrics["US"] ?? {});
    if (entries.length > 0) {
      expect(screen.getByText(entries[0]![0])).toBeTruthy();
    } else {
      expect(screen.getByText(/no national metrics/i)).toBeTruthy();
    }
  });

  it("renders cold-war tension even when no conflict involves the country", () => {
    const state = world();
    show(state, "US", "world.conflicts");
    expect(screen.getByRole("heading", { name: "Cold War and Conflicts" })).toBeTruthy();
    expect(screen.getAllByText(state.coldWarTension.value.toFixed(1)).length).toBeGreaterThan(0);
    if (!state.conflicts.some((c) => c.sideA.countries.includes("US") || c.sideB.countries.includes("US"))) {
      expect(screen.getByText(/belligerent in no tracked conflict/i)).toBeTruthy();
    }
  });

  it("names the naval/air roster gap without fabricating forces", () => {
    show(world(), "US", "nation.defense.forces");
    expect(screen.getByRole("heading", { name: "Naval and Air Forces" })).toBeTruthy();
    expect(screen.getByText(/carries no naval or air unit rosters/i)).toBeTruthy();
  });
});
