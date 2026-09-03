import { describe, expect, it } from "vitest";
import { NAV_MANIFEST } from "../navigation/manifest.js";
import { availabilityFor, findDestination } from "../navigation/resolve.js";
import { helpTargetForRoute } from "./helpTargets.js";

const HELP_ROUTE_IDS = [
  "help.wiki",
  "help.about",
  "help.suggestions",
  "help.discord",
  "help.patreon",
  "help.supporter-wall",
  "help.email-support",
  "help.server-status",
  "help.privacy",
  "help.terms",
] as const;

describe("helpTargetForRoute", () => {
  it("maps every locally reachable Help route to its exact destination", () => {
    for (const routeId of HELP_ROUTE_IDS) {
      const target = helpTargetForRoute(routeId);
      const destination = findDestination(NAV_MANIFEST, routeId);
      expect(target, routeId).toBeDefined();
      expect(target?.url, routeId).not.toBe("https://ahousedividedgame.com");
      expect(target?.via, routeId).toBe(
        availabilityFor(destination!, { platform: "desktop", playMode: "local" }).via,
      );
    }
  });

  it("opens the live wiki outside the app", () => {
    expect(helpTargetForRoute("help.wiki")).toEqual({
      via: "system-browser",
      url: "https://wiki.ahousedividedgame.com",
    });
  });

  it("does not turn arbitrary route ids into openable URLs", () => {
    expect(helpTargetForRoute("help.not-real")).toBeUndefined();
  });
});
