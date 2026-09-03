import { describe, expect, it } from "vitest";
import { SUPPORTED_COUNTRY_DETAIL_ROUTE_IDS } from "../countryDetails/routes.js";
import { NAV_MANIFEST } from "../navigation/manifest.js";
import {
  allRouteIds,
  multiplayerOnlyDestinations,
} from "../navigation/resolve.js";
import { targetForRoute } from "./routeMap.js";

describe("targetForRoute", () => {
  it("maps every manifest route to a handled target (never unknown, never a dead click)", () => {
    for (const id of allRouteIds(NAV_MANIFEST)) {
      expect(targetForRoute(id).kind, id).not.toBe("unknown");
    }
  });

  it("routes multiplayer-only destinations to the explicit multiplayer state", () => {
    const ids = multiplayerOnlyDestinations(NAV_MANIFEST).map((d) => d.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(targetForRoute(id).kind, id).toBe("multiplayerOnly");
    }
  });

  it("routes country-detail ids to CountryDetailsScreen with the id preserved", () => {
    for (const id of SUPPORTED_COUNTRY_DETAIL_ROUTE_IDS) {
      const target = targetForRoute(id);
      expect(target.kind, id).toBe("countryDetail");
      expect(target.detailRouteId, id).toBe(id);
    }
  });

  it("defaults nation.home to the overview target", () => {
    expect(targetForRoute("nation.home")).toEqual({ kind: "overview" });
  });

  it("routes the local head-of-state console", () => {
    expect(targetForRoute("local.hos")).toEqual({ kind: "hos" });
  });

  it("does not mislabel national screens as state-level implementations", () => {
    expect(targetForRoute("state.economy").kind).toBe("summary");
    expect(targetForRoute("state.legislature").kind).toBe("summary");
  });

  it("reports truly unknown ids as unknown", () => {
    expect(targetForRoute("does.not.exist").kind).toBe("unknown");
  });
});
