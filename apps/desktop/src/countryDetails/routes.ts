/**
 * Stable local route ids served by the production CountryDetailsScreen.
 *
 * Manifest-backed ids mirror apps/desktop/src/navigation/manifest.ts
 * verbatim. Local-only ids (`nation.politics.approval`,
 * `nation.economy.command`, `nation.defense.forces`) cover country-overview
 * topics with no manifest destination: approval inputs, nationalization /
 * command economy, and naval/air forces. They are stable, never URLs, and
 * must not be renamed without a migration note.
 */

export interface CountryDetailRoute {
  /** Stable local route id. Never a URL. */
  id: string;
  /** Distinct per-destination heading rendered by the screen. */
  heading: string;
  /** One-line description of the engine data shown. */
  blurb: string;
}

export const COUNTRY_DETAIL_ROUTES: readonly CountryDetailRoute[] = [
  {
    id: "nation.politics.politicians",
    heading: "Politicians",
    blurb: "Seat-holding politicians of this country with party, chamber, and standing.",
  },
  {
    id: "nation.politics.approval",
    heading: "Approval Inputs",
    blurb: "Regional support, registration, turnout, and pressure inputs behind approval.",
  },
  {
    id: "nation.politics.referendums",
    heading: "Referendums",
    blurb: "Independence and reunification referendum records for this country.",
  },
  {
    id: "nation.economy.budget",
    heading: "National Budget",
    blurb: "Revenue, spending, debt, and credit standing for this country.",
  },
  {
    id: "nation.government.policy",
    heading: "Enacted Policy",
    blurb: "Enacted national laws and the policy ledger behind them.",
  },
  {
    id: "nation.government.scotus",
    heading: "Supreme Court",
    blurb: "Court seats, nominations, and docket cases for this country.",
  },
  {
    id: "nation.economy.banking",
    heading: "Central and Private Banking",
    blurb: "Central bank stance, chartered private banks, loans, and deposit insurance.",
  },
  {
    id: "world.banking",
    heading: "Central and Private Banking",
    blurb: "Central bank stance, chartered private banks, loans, and deposit insurance.",
  },
  {
    id: "world.forex",
    heading: "Foreign Exchange",
    blurb: "Exchange rates against the anchor currency and the peg regime.",
  },
  {
    id: "nation.economy.unions",
    heading: "Unions",
    blurb: "Country unions with treasury, approval, dues, and density.",
  },
  {
    id: "world.unions",
    heading: "Unions",
    blurb: "Country unions with treasury, approval, dues, and density.",
  },
  {
    id: "nation.economy.command",
    heading: "Nationalization and Command Economy",
    blurb: "Marketization, shortage, and state-ownership concentration readings.",
  },
  {
    id: "nation.economy.nationalization",
    heading: "Nationalization",
    blurb: "State ownership, marketization, and the local public-sector record.",
  },
  {
    id: "nation.economy.metrics",
    heading: "National Metrics",
    blurb: "Metric-engine families and the economic model identity.",
  },
  {
    id: "world.conflicts",
    heading: "Cold War and Conflicts",
    blurb: "Conflicts, settlements, cold-war tension, nuclear programs, and alignment.",
  },
  {
    id: "nation.defense.forces",
    heading: "Naval and Air Forces",
    blurb: "Force posture as far as the engine models it, with the roster gap named.",
  },
] as const;

export const SUPPORTED_COUNTRY_DETAIL_ROUTE_IDS: readonly string[] =
  COUNTRY_DETAIL_ROUTES.map((route) => route.id);

export function isCountryDetailRoute(routeId: string): boolean {
  return SUPPORTED_COUNTRY_DETAIL_ROUTE_IDS.includes(routeId);
}

export function headingForCountryDetailRoute(routeId: string): string | null {
  return COUNTRY_DETAIL_ROUTES.find((route) => route.id === routeId)?.heading ?? null;
}
