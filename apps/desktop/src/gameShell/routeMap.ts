import { isCountryDetailRoute } from "../countryDetails/routes.js";
import { NAV_MANIFEST } from "../navigation/manifest.js";
import { findDestination } from "../navigation/resolve.js";

/**
 * Local singleplayer route targets. Every stable manifest route id maps
 * to exactly one target, so navigation never dead-ends on an unhandled
 * id. Targets reuse the existing functional screens (same callbacks as
 * the old dashboard) or the production CountryDetailsScreen; ids with no
 * dedicated screen render an explicit local summary, and
 * multiplayer-only ids render an explicit multiplayer state. Nothing
 * here fetches: all targets read the in-process world.
 */

export type RouteTargetKind =
  | "overview"
  | "actions"
  | "parties"
  | "elections"
  | "congress"
  | "government"
  | "economy"
  | "markets"
  | "worldMap"
  | "corporations"
  | "campaigns"
  | "hos"
  | "news"
  | "countryDetail"
  | "governorOffice"
  | "switchView"
  | "summary"
  | "multiplayerOnly"
  | "help"
  | "unknown";

export interface RouteTarget {
  kind: RouteTargetKind;
  /** CountryDetailsScreen route id when kind is "countryDetail". */
  detailRouteId?: string;
}

/**
 * Manifest ids served by an existing functional screen. Kept explicit
 * (not derived) so a manifest addition without a screen falls through
 * to the summary target instead of silently picking a wrong screen.
 */
const SCREEN_ROUTES: Record<string, RouteTargetKind> = {
  "nation.home": "overview",
  actions: "actions",
  // Nation section.
  "nation.my-party": "parties",
  "nation.political-operations": "campaigns",
  "nation.switch-view": "switchView",
  "nation.politics.elections": "elections",
  "nation.politics.parties": "parties",
  "nation.politics.presidential-election": "elections",
  "nation.other.map": "worldMap",
  "nation.government.legislature": "congress",
  "nation.government.executive": "government",
  "nation.economy.economy": "economy",
  "state.office": "governorOffice",
  // World section.
  "world.my-corporation": "corporations",
  "world.nations": "worldMap",
  "world.map": "worldMap",
  "world.stock-market": "markets",
  "world.news": "news",
};

/** Manifest ids served through the Help panel (online viewer or system browser). */
const HELP_ROUTES = new Set([
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
]);

/**
 * Synthetic shell-local routes. Not manifest destinations: they address
 * local screens with no multiplayer counterpart (Head of State console).
 */
const LOCAL_ROUTES: Record<string, RouteTargetKind> = {
  "local.hos": "hos",
};

export function targetForRoute(routeId: string): RouteTarget {
  if (routeId === "local.hos") return { kind: "hos" };
  const direct = SCREEN_ROUTES[routeId];
  if (direct !== undefined) return { kind: direct };
  if (HELP_ROUTES.has(routeId)) return { kind: "help" };
  const local = LOCAL_ROUTES[routeId];
  if (local !== undefined) return { kind: local };
  const destination = findDestination(NAV_MANIFEST, routeId);
  if (destination !== undefined) {
    // Genuinely account/social/server-bound entries stay explicit.
    if (destination.multiplayerOnly === true) return { kind: "multiplayerOnly" };
    // Dedicated local detail coverage (manifest ids plus local-only
    // country-overview topics such as approval inputs).
    if (isCountryDetailRoute(routeId)) {
      return { kind: "countryDetail", detailRouteId: routeId };
    }
    // Feasible but screenless: the shell renders an explicit local
    // summary from the on-device snapshot instead of a dead click.
    return { kind: "summary" };
  }
  // Local-only detail ids that are not manifest destinations.
  if (isCountryDetailRoute(routeId)) {
    return { kind: "countryDetail", detailRouteId: routeId };
  }
  return { kind: "unknown" };
}
