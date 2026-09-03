import { describe, expect, it } from "vitest";
import { createWorld, type WorldState } from "@ahdclient/engine";
import { NAV_MANIFEST } from "../navigation/manifest.js";
import { allRouteIds } from "../navigation/resolve.js";
import { targetForRoute } from "./routeMap.js";
import { buildSummary } from "./summaries.js";

const OPTS = {
  seed: "summary-projection-test",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

function world(): WorldState {
  return createWorld({ ...OPTS });
}

function summaryRouteIds(): string[] {
  return allRouteIds(NAV_MANIFEST).filter(
    (id) => targetForRoute(id).kind === "summary",
  );
}

function bodyLength(routeId: string, worldState: WorldState): number {
  const model = buildSummary(routeId, worldState, "US");
  if (model === null) return -1;
  return (
    model.lede.length +
    model.facts.reduce((sum, fact) => sum + fact.label.length + fact.value.length, 0) +
    model.lists.reduce(
      (sum, list) => sum + list.heading.length + list.items.join("").length,
      0,
    )
  );
}

describe("buildSummary", () => {
  it("covers every summary route with no unknowns", () => {
    const ids = summaryRouteIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(buildSummary(id, world(), "US"), id).not.toBeNull();
    }
    expect(buildSummary("does.not.exist", world(), "US")).toBeNull();
  });

  it("gives every summary route a nonempty distinct title and body", () => {
    const ids = summaryRouteIds();
    const titles = new Map<string, string>();
    const ledes = new Map<string, string>();
    for (const id of ids) {
      const model = buildSummary(id, world(), "US");
      expect(model, id).not.toBeNull();
      expect(model!.title.length, id).toBeGreaterThan(0);
      expect(bodyLength(id, world()), id).toBeGreaterThan(0);
      expect(titles.get(model!.title), `${id} shares title with ${titles.get(model!.title)}`).toBeUndefined();
      expect(ledes.get(model!.lede), `${id} shares lede with ${ledes.get(model!.lede)}`).toBeUndefined();
      titles.set(model!.title, id);
      ledes.set(model!.lede, id);
    }
  });

  it("names the missing home-region identity on every state route", () => {
    for (const id of summaryRouteIds().filter((route) => route.startsWith("state."))) {
      const model = buildSummary(id, world(), "US");
      expect(model!.notice ?? "", id).toMatch(/no home-region/);
    }
  });

  it("does not fabricate absent mechanics for trade and IMF", () => {
    const trade = buildSummary("world.trade", world(), "US");
    expect(trade!.notice ?? "").toMatch(/no trade-agreement/);
    const imf = buildSummary("world.imf", world(), "US");
    expect(imf!.notice ?? "").toMatch(/No IMF mechanic/);
  });

  it("never mutates the live world while projecting summaries", () => {
    const state = world();
    const before = JSON.stringify(state);
    for (const id of summaryRouteIds()) {
      expect(buildSummary(id, state, "US"), id).not.toBeNull();
    }
    expect(JSON.stringify(state)).toBe(before);
  });
});
