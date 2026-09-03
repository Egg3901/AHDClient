// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountryOverviewScreen } from "./CountryOverviewScreen.js";
import type { CountryOverviewModel, MissingRecord } from "./model.js";

afterEach(() => {
  cleanup();
});

function gap(category: string): MissingRecord {
  return {
    category,
    detail: `What ${category} would show`,
    engineGap: `No engine backing for ${category}`,
  };
}

function model(overrides?: Partial<CountryOverviewModel>): CountryOverviewModel {
  return {
    country: {
      id: "US",
      name: "United States",
      descriptor: "A federal presidential republic.",
      regionLabel: "States and territories",
      governmentType: "Presidential republic",
      playable: true,
    },
    world: { era: "1953", date: "Jan 1953", turn: 4, seed: "test-seed" },
    registration: { label: "Local world", tone: "active" },
    player: {
      name: "Tester",
      actions: 3,
      cash: 10000,
      funds: 2500,
      party: "DEM",
    },
    leaders: [
      { office: "President", name: "Ann President", party: "DEM" },
      { office: "Vice President", name: null, party: null },
    ],
    chamberOfficers: [
      {
        chamberKey: "house",
        chamberName: "House",
        speakerName: "Sam Speaker",
        speakerParty: "DEM",
        majorityLeaderName: null,
        majorityLeaderParty: null,
      },
    ],
    approval: {
      value: 62.5,
      history: [
        { turn: 0, approval: 60 },
        { turn: 4, approval: 62.5 },
      ],
      updatedTurn: 4,
    },
    regime: {
      id: "presidential-republic",
      label: "Presidential republic",
      governmentType: "Presidential republic",
    },
    legitimacy: 70,
    unrest: 18,
    legislature: {
      name: "Congress",
      chambers: [
        {
          key: "house",
          name: "House",
          elected: true,
          seats: 435,
          vacancies: 2,
          parties: [
            {
              id: "dem",
              name: "Democrats",
              abbreviation: "DEM",
              color: "#3333ff",
              seats: 220,
              organization: 80,
              memberCount: 1000,
            },
            {
              id: "rep",
              name: "Republicans",
              abbreviation: "REP",
              color: "#ff3333",
              seats: 213,
              organization: 75,
              memberCount: 900,
            },
          ],
        },
      ],
      totalSeats: 435,
      totalVacancies: 2,
    },
    elections: {
      activeCount: 1,
      items: [
        { id: "e1", electionType: "Presidential", status: "campaign" },
      ],
    },
    government: null,
    nationalAxes: {
      economic: 2,
      social: -1,
      enactedLawCount: 3,
      provisionCount: 5,
      unresolvableLawCount: 1,
    },
    economy: {
      gdp: 1500000,
      growthRate: 0.03,
      inflationRate: 0.02,
      unemploymentRate: 0.05,
      outputGap: 0.5,
    },
    budget: {
      revenueTotal: 500000,
      spendingTotal: 480000,
      surplus: 20000,
      debtPrincipal: 900000,
      creditRating: "AAA",
    },
    economicModel: {
      id: "mixed",
      name: "Mixed",
      intensity: 42,
    },
    sovereignDebt: {
      revenueTotal: 500000,
      spendingTotal: 480000,
      surplus: 20000,
      debtPrincipal: 900000,
      debtCeiling: 1000000,
      debtToCeiling: 0.9,
      interestRate: 0.05,
      debtInterest: 45000,
      creditRating: "AAA",
      debtToGdpRatio: null,
      outstandingBondCount: 2,
      outstandingBondFaceValue: 100000,
      maturedBondCount: 1,
      defaultedBondCount: 0,
      debtCeilingCrisisActive: false,
      activeCrisisNames: [],
    },
    corporations: [{ id: "acme", sector: "steel" }],
    laws: {
      activeBillCount: 2,
      enactedLawCount: 3,
      activeBills: [{ id: "b1", title: "Bill One", status: "debate" }],
      enactedLaws: [{ id: "l1", level: 1, enactedAtTurn: 1 }],
    },
    latestNews: ["Headline one"],
    counts: {
      parties: 2,
      politicians: 12,
      activeElections: 1,
      upcomingElections: 0,
      activeBills: 2,
      enactedLaws: 3,
      corporations: 1,
      regions: 48,
      unions: 1,
      totalReferendums: 0,
      activeReferendums: 0,
      primeRate: 3.25,
      commandEconomy: false,
      navairFormations: 0,
      activeConflicts: 0,
      coldWarPrincipal: true,
      coldWarListed: true,
      budgetBalancePctGdp: 1.3,
      scotusSeats: 9,
      stockListings: 1,
      forexRate: 1,
    },
    unavailable: [],
    ...overrides,
  };
}

function callbacks() {
  return {
    onNavigate: vi.fn(),
    onAdvance: vi.fn(),
    onQuickSave: vi.fn(),
  };
}

describe("CountryOverviewScreen hierarchy", () => {
  it("renders hero, full leadership strip, approval, and government type in order", () => {
    render(<CountryOverviewScreen model={model()} {...callbacks()} />);

    const hero = screen.getByTestId("cov-hero");
    expect(
      within(hero).getByRole("heading", { name: "United States" }),
    ).toBeTruthy();

    const leaders = screen.getAllByTestId("cov-leader");
    expect(leaders).toHaveLength(2);
    // The head of government also appears in the hero vitals strip.
    expect(screen.getAllByText("Ann President").length).toBeGreaterThanOrEqual(2);
    expect(
      within(screen.getByTestId("cov-leadership")).getByText("Ann President"),
    ).toBeTruthy();
    // Vacant offices render explicit nulls, never omitted rows.
    expect(
      within(screen.getByTestId("cov-leadership")).getByText("Office unfilled"),
    ).toBeTruthy();

    expect(screen.getByTestId("cov-approval")).toBeTruthy();
    expect(screen.getByTestId("cov-government-type").textContent).toContain(
      "Presidential republic",
    );

    const root = hero.parentElement!;
    const order = [
      "cov-hero",
      "cov-leadership",
      "cov-approval",
      "cov-government-type",
      "cov-explore",
      "cov-descriptor",
      "cov-national-ideology",
      "cov-economic-model",
      "cov-regime",
      "cov-sovereign-debt",
      "cov-economy",
      "cov-legislature",
    ].map((id) => {
      const el =
        id === "cov-hero"
          ? hero
          : root.querySelector(`[data-testid="${id}"]`);
      expect(el, id).toBeTruthy();
      return el!;
    });
    const positions = order.map((el) =>
      Array.from(root.querySelectorAll("[data-testid]")).indexOf(el),
    );
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("covers the complete multiplayer country directory with real buttons", () => {
    render(<CountryOverviewScreen model={model()} {...callbacks()} />);

    const explore = screen.getByTestId("cov-explore");
    expect(
      within(explore).getAllByRole("heading", { level: 3 }).map((heading) =>
        heading.textContent,
      ),
    ).toEqual(["Politics", "Government", "Economy", "Nation"]);
    const expected = [
      "nation.politics.presidential-election",
      "nation.politics.elections",
      "nation.politics.parties",
      "nation.politics.politicians",
      "nation.politics.approval",
      "nation.politics.referendums",
      "nation.government.legislature",
      "nation.government.executive",
      "nation.economy.budget",
      "nation.government.policy",
      "nation.government.scotus",
      "nation.economy.economy",
      "world.stock-market",
      "nation.economy.banking",
      "world.forex",
      "nation.economy.unions",
      "nation.economy.nationalization",
      "nation.economy.command",
      "nation.other.map",
      "nation.politics.political-metrics",
      "help.wiki",
      "nation.defense.forces",
      "world.conflicts",
    ];

    const rows = screen.getAllByTestId("cov-dir-row");
    expect(rows.map((row) => row.getAttribute("data-route"))).toEqual(expected);
    for (const row of rows) {
      expect(row.tagName).toBe("BUTTON");
    }
  });

  it("navigates with the stable route id when a directory row is clicked", async () => {
    const cb = callbacks();
    const user = userEvent.setup();
    render(<CountryOverviewScreen model={model()} {...cb} />);

    await user.click(
      screen.getByRole("button", { name: "National Budget" }),
    );
    expect(cb.onNavigate).toHaveBeenCalledWith("nation.economy.budget");
  });

  it("renders backed fields with no parity errors when nothing is missing", () => {
    render(<CountryOverviewScreen model={model()} {...callbacks()} />);

    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.getByTestId("cov-approval-value").textContent).toContain(
      "62.5",
    );
    expect(screen.getByTestId("cov-approval-history").textContent).toContain(
      "2 samples",
    );
    expect(screen.getByTestId("cov-regime-label").textContent).toContain(
      "Presidential republic",
    );
    expect(screen.getByTestId("cov-legitimacy").textContent).toBe("70.0");
    expect(screen.getByTestId("cov-unrest").textContent).toBe("18.0");
    expect(screen.getByTestId("cov-officers").textContent).toContain(
      "Sam Speaker",
    );
    expect(
      screen.getByTestId("cov-economic-model-name").textContent,
    ).toContain("Mixed");
    expect(screen.getByTestId("cov-debt-ceiling").textContent).toContain(
      "90.0% of ceiling",
    );
    expect(screen.getByTestId("cov-bonds").textContent).toContain(
      "2 outstanding",
    );
    // A null parliamentary government is N/A, never a parity error.
    expect(
      screen.getByTestId("cov-government-type").textContent,
    ).toContain("No parliamentary government seated");
  });

  it("renders every explicit MissingRecord as a visible parity error", () => {
    const m = model({
      approval: null,
      regime: null,
      legitimacy: null,
      unrest: null,
      unavailable: [
        gap("nationalApproval"),
        gap("chamberLeadership"),
        gap("regime"),
      ],
    });
    render(<CountryOverviewScreen model={m} {...callbacks()} />);

    const alerts = screen.getAllByRole("alert");
    for (const category of ["nationalApproval", "chamberLeadership", "regime"]) {
      const el = screen.getByTestId(`cov-parity-${category}`);
      expect(el.textContent?.length).toBeGreaterThan(0);
      expect(alerts).toContain(el);
    }
    // Parity errors carry the engine reason, not just the label.
    expect(
      screen.getByTestId("cov-parity-nationalApproval").textContent,
    ).toContain("No engine backing");
    // Removed concepts never render as gaps.
    expect(
      screen.queryByTestId("cov-parity-ceremonialHeadOfState"),
    ).toBeNull();
    expect(screen.queryByTestId("cov-parity-sovereignStatus")).toBeNull();
    expect(
      screen.queryByTestId("cov-parity-governmentFormation"),
    ).toBeNull();
  });

  it("renders ideology from laws, economic model, regime, debt, economy, legislature", () => {
    render(<CountryOverviewScreen model={model()} {...callbacks()} />);

    expect(screen.getByTestId("cov-axis-economic").textContent).toBe("2");
    expect(screen.getByTestId("cov-axis-social").textContent).toBe("-1");
    expect(
      screen.getByTestId("cov-national-ideology").textContent,
    ).toContain("1 unresolvable");

    expect(
      screen.getByTestId("cov-economic-model").textContent,
    ).toContain("3.0%");
    expect(screen.getByTestId("cov-debt").textContent).toContain("900");
    expect(screen.getByTestId("cov-sovereign-debt").textContent).toContain(
      "AAA",
    );
    expect(screen.getByTestId("cov-legislature").textContent).toContain(
      "Congress",
    );
    expect(screen.getByTestId("cov-descriptor").textContent).toContain(
      "federal presidential republic",
    );
  });

  it("shows a visible no-budget state instead of hiding sovereign debt", () => {
    render(
      <CountryOverviewScreen
        model={model({ budget: null, sovereignDebt: null })}
        {...callbacks()}
      />,
    );

    expect(screen.getByTestId("cov-no-budget").textContent).toContain(
      "No national budget",
    );
    expect(screen.queryByTestId("cov-debt")).toBeNull();
  });

  it("wires End turn and Quick save to their callbacks", async () => {
    const cb = callbacks();
    const user = userEvent.setup();
    render(<CountryOverviewScreen model={model()} {...cb} />);

    await user.click(screen.getByRole("button", { name: "End turn" }));
    await user.click(screen.getByRole("button", { name: "Quick save" }));
    expect(cb.onAdvance).toHaveBeenCalledTimes(1);
    expect(cb.onQuickSave).toHaveBeenCalledTimes(1);
  });

  it("keeps 44px targets and a 412px-safe scoped stylesheet", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "country-overview.css"), "utf8");

    expect(css).toContain("min-height: 44px");
    expect(css).toContain("412px");
    // Scoped: every rule selector lives under the .cov- namespace.
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const line of stripped.split("\n")) {
      if (!line.includes("{")) continue;
      const trimmed = line.trim();
      if (trimmed.startsWith("@")) continue;
      const selector = trimmed.split("{")[0]!.trim();
      if (selector === "") continue;
      for (const part of selector.split(",")) {
        expect(part.trim().startsWith(".cov-"), selector).toBe(true);
      }
    }
  });
});
