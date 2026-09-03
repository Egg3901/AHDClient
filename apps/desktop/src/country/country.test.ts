import { createWorld, type WorldState } from "@ahdclient/engine";
import { describe, expect, it, vi } from "vitest";
import { LocalCountryOverviewSource } from "./localSource.js";

const OPTS = {
  seed: "country-overview-test",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

function world(): WorldState {
  return createWorld({ ...OPTS });
}

describe("LocalCountryOverviewSource", () => {
  it("loads a complete US overview with consistent counts", async () => {
    const state = world();
    const source = new LocalCountryOverviewSource(state);
    const model = await source.load("US");

    expect(model.country.id).toBe("US");
    expect(model.country.playable).toBe(true);
    expect(model.world.seed).toBe("country-overview-test");
    expect(model.counts.parties).toBe(
      Object.values(state.parties).filter((p) => p.countryId === "US").length,
    );
    expect(model.counts.politicians).toBeGreaterThan(0);
    expect(model.legislature.totalSeats).toBe(
      model.legislature.chambers.reduce(
        (sum, chamber) =>
          sum +
          chamber.parties.reduce((inner, party) => inner + party.seats, 0) +
          chamber.vacancies,
        0,
      ),
    );
    expect(model.counts.corporations).toBe(model.corporations.length);
    expect(model.counts.enactedLaws).toBe(model.laws.enactedLawCount);
    expect(model.counts.activeBills).toBe(model.laws.activeBillCount);
    expect(model.counts.activeElections).toBe(model.elections.activeCount);
    expect(model.economy.gdp).toBeGreaterThan(0);
    expect(model.counts.regions).toBe(
      Object.values(state.regions).filter((region) => region.countryId === "US").length,
    );
    expect(model.counts.unions).toBe(
      Object.values(state.unions).filter((union) => union.countryId === "US").length,
    );
    expect(model.counts.primeRate).toBe(state.centralBanks["US"]?.primeRate ?? null);
    expect(model.counts.forexRate).toBe(state.exchangeRates["US"]?.rate ?? null);
    expect(model.counts.scotusSeats).toBe(
      state.supremeCourtSeats.filter((seat) => seat.countryId === "US").length,
    );
    expect(model.counts.navairFormations).toBe(0);
  });

  it("resolves leaders from live engine state with explicit vacant nulls", async () => {
    const source = new LocalCountryOverviewSource(world());
    const model = await source.load("US");

    expect(model.leaders.length).toBeGreaterThan(0);
    for (const leader of model.leaders) {
      expect(leader.office.length).toBeGreaterThan(0);
      // Vacancy is an explicit null, never an omitted entry.
      expect("name" in leader).toBe(true);
      expect("party" in leader).toBe(true);
    }
  });

  function pushAxisLaw(
    state: WorldState,
    lawId: string,
    provisions: Array<{ economic?: number; social?: number }>,
    effectDirection = 1,
  ): void {
    const billId = `bill-${lawId}`;
    state.bills.push({
      id: billId,
      title: `Axis Bill ${lawId}`,
      summary: "Test",
      countryId: "US",
      category: "economy",
      provisions: provisions.map((axes) => ({
        type: "policy" as const,
        legislationTypeId: lawId,
        effectDirection,
        ...axes,
      })),
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
      id: lawId,
      countryId: "US",
      billId,
      enactedAtTurn: 0,
      level: 1,
      scope: "national",
    });
  }

  it("derives national axes from enacted law provisions, not party seats", async () => {
    const state = world();
    pushAxisLaw(state, "test.law", [{ economic: 2, social: -1 }]);

    const model = await new LocalCountryOverviewSource(state).load("US");

    expect(model.nationalAxes.enactedLawCount).toBe(1);
    expect(model.nationalAxes.provisionCount).toBe(1);
    expect(model.nationalAxes.unresolvableLawCount).toBe(0);
    expect(model.nationalAxes.economic).toBe(2);
    expect(model.nationalAxes.social).toBe(-1);
  });

  it("averages equally across laws and never applies effectDirection", async () => {
    const state = world();
    // effectDirection -1 must not flip or scale the raw values.
    pushAxisLaw(state, "test.left", [{ economic: 2, social: 2 }], -1);
    pushAxisLaw(state, "test.right", [{ economic: 4, social: -4 }], -1);

    const model = await new LocalCountryOverviewSource(state).load("US");

    expect(model.nationalAxes.enactedLawCount).toBe(2);
    expect(model.nationalAxes.economic).toBe(3);
    expect(model.nationalAxes.social).toBe(-1);
  });

  it("counts explicit zeros but excludes missing axes per-axis", async () => {
    const state = world();
    pushAxisLaw(state, "test.zero", [{ economic: 0 }]);
    pushAxisLaw(state, "test.social-only", [{ social: 4 }]);

    const model = await new LocalCountryOverviewSource(state).load("US");

    // Economic: only the zero law carries the axis -> 0 counts, average 0.
    expect(model.nationalAxes.economic).toBe(0);
    // Social: only the social-only law carries the axis -> 4, not halved.
    expect(model.nationalAxes.social).toBe(4);
  });

  it("clamps each axis average to [-5, 5]", async () => {
    const state = world();
    pushAxisLaw(state, "test.extreme", [{ economic: 100, social: -100 }]);

    const model = await new LocalCountryOverviewSource(state).load("US");

    expect(model.nationalAxes.economic).toBe(5);
    expect(model.nationalAxes.social).toBe(-5);
  });

  it("excludes repealed laws from the axes average", async () => {
    const state = world();
    pushAxisLaw(state, "test.live", [{ economic: 2, social: 2 }]);
    pushAxisLaw(state, "test.repealed", [{ economic: -4, social: -4 }]);
    state.enactedLaws.find((law) => law.id === "test.repealed")!.repealedAtTurn = 1;

    const model = await new LocalCountryOverviewSource(state).load("US");

    expect(model.nationalAxes.enactedLawCount).toBe(1);
    expect(model.nationalAxes.economic).toBe(2);
    expect(model.nationalAxes.social).toBe(2);
  });

  it("counts unresolvable laws instead of failing or inventing axes", async () => {
    const state = world();
    state.enactedLaws.push({
      id: "ghost.law",
      countryId: "US",
      billId: "no-such-bill",
      enactedAtTurn: 0,
      level: 1,
      scope: "national",
    });

    const model = await new LocalCountryOverviewSource(state).load("US");

    expect(model.nationalAxes.enactedLawCount).toBe(1);
    expect(model.nationalAxes.unresolvableLawCount).toBe(1);
    expect(model.nationalAxes.economic).toBe(0);
    expect(model.nationalAxes.social).toBe(0);
  });

  it("backs approval, regime, and officers for seeded countries: no gaps", async () => {
    const model = await new LocalCountryOverviewSource(world()).load("US");

    expect(model.unavailable).toEqual([]);
    expect(model.approval).not.toBeNull();
    expect(model.approval!.value).toBeGreaterThanOrEqual(0);
    expect(model.approval!.value).toBeLessThanOrEqual(100);
    expect(model.approval!.history.length).toBeGreaterThan(0);
    expect(model.approval!.history[0]!.turn).toBe(0);
    expect(model.regime).toEqual({
      id: "presidential-republic",
      label: "Presidential republic",
      governmentType: "Presidential republic",
    });
    expect(model.country.governmentType).toBe("Presidential republic");
    expect(model.legitimacy).toBeGreaterThanOrEqual(0);
    expect(model.legitimacy).toBeLessThanOrEqual(100);
    expect(model.unrest).toBeGreaterThanOrEqual(0);
    expect(model.unrest).toBeLessThanOrEqual(100);
    expect(model.chamberOfficers.map((o) => o.chamberKey).sort()).toEqual(
      model.legislature.chambers.map((c) => c.key).sort(),
    );
    for (const officers of model.chamberOfficers) {
      expect(officers.chamberName.length).toBeGreaterThan(0);
      expect("speakerName" in officers).toBe(true);
      expect("majorityLeaderName" in officers).toBe(true);
    }
  });

  it("lists gaps only when no political overview is seeded", async () => {
    const state = world();
    delete state.countryPolitics["US"];
    const model = await new LocalCountryOverviewSource(state).load("US");
    const categories = model.unavailable.map((record) => record.category);

    expect(categories.sort()).toEqual(
      ["chamberLeadership", "nationalApproval", "regime"].sort(),
    );
    expect(model.approval).toBeNull();
    expect(model.regime).toBeNull();
    expect(model.legitimacy).toBeNull();
    expect(model.unrest).toBeNull();
    // Ceremonial heads and parliamentary formation are never gaps.
    expect(categories).not.toContain("ceremonialHeadOfState");
    expect(categories).not.toContain("governmentFormation");
    expect(categories).not.toContain("sovereignStatus");
    for (const record of model.unavailable) {
      expect(record.detail.length).toBeGreaterThan(0);
      expect(record.engineGap.length).toBeGreaterThan(0);
    }
  });

  it("reports null government for presidential systems, never a gap", async () => {
    const model = await new LocalCountryOverviewSource(world()).load("US");

    expect(model.government).toBeNull();
    expect(
      model.unavailable.some(
        (record) => record.category === "governmentFormation",
      ),
    ).toBe(false);
  });

  it("derives a sovereign-debt view from budget, bond, and crisis state", async () => {
    const model = await new LocalCountryOverviewSource(world()).load("US");

    expect(model.sovereignDebt).not.toBeNull();
    expect(model.sovereignDebt!.debtPrincipal).toBe(
      model.budget!.debtPrincipal,
    );
    expect(model.sovereignDebt!.creditRating).toBe(
      model.budget!.creditRating,
    );
    expect(model.sovereignDebt!.debtCeilingCrisisActive).toBe(false);
    expect(Array.isArray(model.sovereignDebt!.activeCrisisNames)).toBe(true);
    expect(model.sovereignDebt!.outstandingBondCount).toBeGreaterThanOrEqual(
      0,
    );
  });

  it("reports a null debt view when the country carries no budget", async () => {
    const state = world();
    delete state.budgets["US"];
    const model = await new LocalCountryOverviewSource(state).load("US");

    expect(model.budget).toBeNull();
    expect(model.sovereignDebt).toBeNull();
  });

  it("leaves the economic model unclassified on a fresh world", async () => {
    const model = await new LocalCountryOverviewSource(world()).load("US");

    // Classification runs on the first turn; the view renders an empty
    // state, not a gap.
    expect(model.economicModel).toBeNull();
    expect(
      model.unavailable.some(
        (record) => record.category === "economicModel",
      ),
    ).toBe(false);
  });

  it("rejects unknown countries", async () => {
    const source = new LocalCountryOverviewSource(world());
    await expect(source.load("XX")).rejects.toThrow("Unknown country XX");
  });

  it("performs zero fetches", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await new LocalCountryOverviewSource(world()).load("US");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("is deterministic across loads and across identical worlds", async () => {
    const first = await new LocalCountryOverviewSource(world()).load("US");
    const second = await new LocalCountryOverviewSource(world()).load("US");
    expect(second).toEqual(first);

    const state = world();
    const source = new LocalCountryOverviewSource(state);
    const before = await source.load("US");
    const after = await source.load("US");
    expect(after).toEqual(before);
    // Read-only: loading never mutates the world.
    expect(state.meta.turn).toBe(0);
  });
});
