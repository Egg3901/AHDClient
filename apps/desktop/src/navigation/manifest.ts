import type {
  Destination,
  DestinationAvailability,
  NavManifest,
  NavSection,
  Platform,
  PlayMode,
} from "./types.js";

/**
 * Canonical navigation manifest. Mirrors AHDGame's default signed-in
 * information architecture:
 *
 * - Top level: Actions, State, Nation, World, Help
 *   (Navbar.tsx desktop dropdowns plus the /actions link).
 * - Nation directory groups in source order: Politics, Other, Government,
 *   Economy (buildNationalDetailsSections in nationDetailsSections.ts).
 * - World entries verbatim from buildWorldNavItems (worldNavItems.ts),
 *   including the mobile drawer grouping.
 * - State entries from StateDropdown.tsx, Help entries from HelpDropdown.tsx.
 *
 * Multiplayer information architecture and stable ids are kept complete.
 * Every singleplayer-relevant Actions, State, Nation, and World destination
 * additionally carries a real local-world route target: the local
 * singleplayer client serves it from the on-device world with zero fetch
 * and no online account (CountryOverviewScreen directory, CountryDetails
 * local routes, ActionsHub, and the other local screens in App.tsx).
 * Platform (desktop/mobile shell) and play mode (local/multiplayer world)
 * are independent axes of the availability matrix.
 *
 * Only genuinely account/social/server-bound entries are multiplayer-only
 * (cross-player leaderboard, server feedback pipeline). They stay in the
 * manifest with an explicit flag and a local blocking reason instead of
 * being hidden. Help entries may use the online viewer or system browser
 * in any mode.
 */

type PlatformPair = Record<Platform, DestinationAvailability>;
type ModeAvailability = Record<PlayMode, PlatformPair>;

/** Multiplayer serving: the hardened online viewer. Performs a network fetch. */
function online(reason: string): PlatformPair {
  return {
    desktop: {
      supported: true,
      via: "online-viewer",
      reason: `Desktop: ${reason}`,
      requiresFetch: true,
    },
    mobile: {
      supported: true,
      via: "online-viewer",
      reason: `Mobile: ${reason}`,
      requiresFetch: true,
    },
  };
}

/** Local serving: the on-device world. Zero fetch, no account. */
function localWorld(reason: string): PlatformPair {
  return {
    desktop: {
      supported: true,
      via: "local-world",
      reason: `Desktop: ${reason}`,
      requiresFetch: false,
    },
    mobile: {
      supported: true,
      via: "local-world",
      reason: `Mobile: ${reason}`,
      requiresFetch: false,
    },
  };
}

/** A gameplay destination served from the local world and from the online game. */
function gameplay(localReason: string, onlineReason: string): ModeAvailability {
  return { local: localWorld(localReason), multiplayer: online(onlineReason) };
}

/** A multiplayer-only destination: no local target, explicit blocking reason. */
function onlineOnly(onlineReason: string, localReason: string): ModeAvailability {
  const unsupported: PlatformPair = {
    desktop: {
      supported: false,
      via: "none",
      reason: `Desktop: ${localReason}`,
      requiresFetch: false,
    },
    mobile: {
      supported: false,
      via: "none",
      reason: `Mobile: ${localReason}`,
      requiresFetch: false,
    },
  };
  return { local: unsupported, multiplayer: online(onlineReason) };
}

function externalPair(reason: string): PlatformPair {
  return {
    desktop: {
      supported: true,
      via: "system-browser",
      reason: `Desktop: ${reason}`,
      requiresFetch: false,
    },
    mobile: {
      supported: true,
      via: "system-browser",
      reason: `Mobile: ${reason}`,
      requiresFetch: false,
    },
  };
}

/**
 * External links open in the system browser in any mode: the OS loads the
 * target, the app performs no fetch.
 */
function external(reason: string): ModeAvailability {
  return { local: externalPair(reason), multiplayer: externalPair(reason) };
}

/**
 * Help pages may use the online viewer in any mode, including local
 * singleplayer worlds.
 */
function helpOnline(reason: string): ModeAvailability {
  const pair = online(reason);
  return { local: pair, multiplayer: pair };
}

function dest(d: Destination): Destination {
  return d;
}

const ACTIONS: NavSection = {
  id: "actions",
  title: "Actions",
  requiresCapabilities: ["online-account", "standard-character"],
  availableIn: ["local", "multiplayer"],
  destinations: [
    dest({
      id: "actions",
      label: "Actions",
      requiresCapabilities: ["standard-character"],
      availability: gameplay(
        "local Actions hub (ActionsHub) for the active world on this device",
        "multiplayer Actions page opens in the online viewer; hidden for imperial characters, matching the navbar",
      ),
    }),
  ],
};

const STATE: NavSection = {
  id: "state",
  title: "State",
  requiresCapabilities: ["online-account"],
  requiresCondition: "home-state",
  availableIn: ["local", "multiplayer"],
  destinations: [
    dest({
      id: "state.my-party",
      label: "My Party",
      requiresCapabilities: [],
      requiresCondition: "party-membership",
      availability: gameplay(
        "local party record of the player's party in the home state",
        "state party page of the viewer's party",
      ),
    }),
    dest({
      id: "state.overview",
      label: "State Overview",
      requiresCapabilities: [],
      availability: gameplay(
        "home-state overview rendered from the local world snapshot",
        "home-state overview page in the online viewer",
      ),
    }),
    dest({
      id: "state.economy",
      label: "State Economy",
      requiresCapabilities: [],
      availability: gameplay(
        "home-state economy figures from the local world snapshot",
        "economy tab of the home-state page",
      ),
    }),
    dest({
      id: "state.elections",
      label: "State Elections",
      requiresCapabilities: [],
      availability: gameplay(
        "home-state races from the local election records; distinct from the player's own race",
        "home-state races page; distinct from the viewer's own race",
      ),
    }),
    dest({
      id: "state.legislature",
      label: "State Legislature",
      labelNote: "Devolved-body name in UK contexts (UK_NATIONS / UK_REGIONS lookup)",
      requiresCapabilities: [],
      availability: gameplay(
        "home-state legislature from the local world snapshot",
        "home-state legislature page in the online viewer",
      ),
    }),
    dest({
      id: "state.office",
      label: "Office",
      requiresCapabilities: [],
      requiresCondition: "governor-seat",
      availability: gameplay(
        "regional executive office record; shown only for the office holder in that state",
        "regional executive office page; shown only for the office holder in that state",
      ),
    }),
    dest({
      id: "state.my-election",
      label: "My Election",
      labelNote: "Renders disabled as My Election: None with no active candidacy",
      requiresCapabilities: [],
      availability: gameplay(
        "player's own race from the local election records; disabled empty state without one",
        "viewer's own race page; disabled empty state without one",
      ),
    }),
    dest({
      id: "state.my-office",
      label: "My Office",
      requiresCapabilities: [],
      requiresCondition: "cabinet-seat",
      availability: gameplay(
        "cabinet office record of the player's seat in the local world",
        "cabinet office page of the viewer's seat",
      ),
    }),
  ],
};

const NATION: NavSection = {
  id: "nation",
  title: "Nation",
  requiresCapabilities: ["online-account"],
  availableIn: ["local", "multiplayer"],
  pinned: [
    dest({
      id: "nation.home",
      label: "Home Nation",
      labelNote: "Country name plus Home suffix from the country display registry",
      requiresCapabilities: [],
      availability: gameplay(
        "home-nation overview (CountryOverviewScreen) from the local world",
        "home-nation overview page in the online viewer",
      ),
    }),
    dest({
      id: "nation.cabinet-office",
      label: "Cabinet Office",
      requiresCapabilities: [],
      requiresCondition: "cabinet-seat",
      availability: gameplay(
        "cabinet office record of the player's seat; explicit empty state without one",
        "cabinet office page of the viewer's seat, any country",
      ),
    }),
    dest({
      id: "nation.my-party",
      label: "My Party",
      requiresCapabilities: [],
      requiresCondition: "party-membership",
      availability: gameplay(
        "national party record of the player's party in the local world",
        "national party page of the viewer's party",
      ),
    }),
    dest({
      id: "nation.political-operations",
      label: "My Political Operations",
      requiresCapabilities: [],
      requiresCondition: "us-country",
      availability: gameplay(
        "political operations topics from the local world; US home nations only",
        "political operations page; US home nations only",
      ),
    }),
  ],
  groups: [
    {
      id: "politics",
      title: "Politics",
      destinations: [
        dest({
          id: "nation.politics.elections",
          label: "Elections",
          requiresCapabilities: [],
          availability: gameplay(
            "active and upcoming contests from the local election records",
            "country elections page in the online viewer",
          ),
        }),
        dest({
          id: "nation.politics.parties",
          label: "Political Parties",
          requiresCapabilities: [],
          availability: gameplay(
            "country party roster from the local world",
            "country party roster in the online viewer",
          ),
        }),
        dest({
          id: "nation.politics.politicians",
          label: "Politicians",
          requiresCapabilities: [],
          availability: gameplay(
            "country politician roster from the local world",
            "country politician roster in the online viewer",
          ),
        }),
        dest({
          id: "nation.politics.presidential-election",
          label: "Presidential Election",
          requiresCapabilities: [],
          requiresCondition: "direct-election-race",
          availability: gameplay(
            "live presidential race record; direct-election countries with an active race only",
            "quick link to the live race page; direct-election countries with an active race only",
          ),
        }),
        dest({
          id: "nation.politics.political-metrics",
          label: "Political Metrics",
          requiresCapabilities: [],
          requiresCondition: "playable-pipeline-country",
          availability: gameplay(
            "political registry topics from the local world; playable-pipeline countries only",
            "political registry; playable-pipeline countries only",
          ),
        }),
        dest({
          id: "nation.politics.charters",
          label: "Party Charters",
          labelNote: "Single active charter renders as Charter: {name} with its own link",
          requiresCapabilities: [],
          requiresCondition: "charter-slot",
          availability: gameplay(
            "charter topics from the local world; active founders only",
            "charter pages; active founders only",
          ),
        }),
        dest({
          id: "nation.politics.referendums",
          label: "Referendums",
          requiresCapabilities: [],
          requiresCondition: "referendum-live",
          availability: gameplay(
            "referendum records for the viewed nation; explicit empty state with no live campaign",
            "referendums page; live campaign in the viewed nation only",
          ),
        }),
      ],
    },
    {
      id: "other",
      title: "Other",
      destinations: [
        dest({
          id: "nation.other.map",
          label: "Map",
          requiresCapabilities: [],
          availability: gameplay(
            "country map from the local world snapshot; top-five destination and gateway to region topics",
            "country map page; top-five destination and gateway to region pages",
          ),
        }),
      ],
    },
    {
      id: "government",
      title: "Government",
      destinations: [
        dest({
          id: "nation.government.legislature",
          label: "Legislature",
          labelNote: "Name and link come from the country config legislature entry",
          requiresCapabilities: [],
          availability: gameplay(
            "national legislature from the local world snapshot",
            "national legislature page in the online viewer",
          ),
        }),
        dest({
          id: "nation.government.executive",
          label: "Executive",
          labelNote: "Label and link come from the country config executive entry",
          requiresCapabilities: [],
          availability: gameplay(
            "national executive offices from the local world snapshot",
            "national executive page in the online viewer",
          ),
        }),
        dest({
          id: "nation.government.policy",
          label: "Policy",
          requiresCapabilities: [],
          availability: gameplay(
            "enacted national laws joined to their enacting bills",
            "national policy page in the online viewer",
          ),
        }),
        dest({
          id: "nation.government.scotus",
          label: "Supreme Court",
          requiresCapabilities: [],
          requiresCondition: "us-country",
          availability: gameplay(
            "court seats and docket topics from the local world; US-only mechanic",
            "Supreme Court page; US-only mechanic",
          ),
        }),
      ],
    },
    {
      id: "economy",
      title: "Economy",
      destinations: [
        dest({
          id: "nation.economy.banking",
          label: "Banking",
          labelNote: "Hub listing every central bank and private bank",
          requiresCapabilities: [],
          availability: gameplay(
            "central-bank stance and chartered private banks from the local world",
            "banking hub in the online viewer",
          ),
        }),
        dest({
          id: "nation.economy.economy",
          label: "Economy",
          requiresCapabilities: [],
          availability: gameplay(
            "output, prices, and employment from the local world snapshot",
            "country economy page in the online viewer",
          ),
        }),
        dest({
          id: "nation.economy.budget",
          label: "National Budget",
          requiresCapabilities: [],
          availability: gameplay(
            "revenue, spending, debt, and credit standing from the local world",
            "national budget page in the online viewer",
          ),
        }),
        dest({
          id: "nation.economy.metrics",
          label: "National Metrics",
          requiresCapabilities: [],
          requiresCondition: "standard-country-metrics",
          availability: gameplay(
            "metric-engine families and the economic model identity; non-playable countries only",
            "legacy National Metrics page; non-playable countries only",
          ),
        }),
        dest({
          id: "nation.economy.unions",
          label: "Unions",
          requiresCapabilities: [],
          requiresCondition: "unions-feature",
          availability: gameplay(
            "country-scoped unions roster from the local world; unions feature only",
            "country-scoped unions roster; unions feature only",
          ),
        }),
      ],
    },
  ],
  destinations: [
    dest({
      id: "nation.switch-view",
      label: "Switch nation view",
      labelNote: "Picker over enabled countries, not a page; home badge marks home nation",
      requiresCapabilities: [],
      availability: gameplay(
        "nation picker over the local world's enabled countries, rendered by the shell",
        "nation picker rendered by the shell around the online viewer",
      ),
    }),
  ],
};

const WORLD: NavSection = {
  id: "world",
  title: "World",
  requiresCapabilities: ["online-account"],
  availableIn: ["local", "multiplayer"],
  pinned: [
    dest({
      id: "world.my-corporation",
      label: "My Corporation",
      requiresCapabilities: [],
      requiresCondition: "corporation-ceo",
      availability: onlineOnly(
        "corporation page of the viewer's company; CEOs only",
        "Unavailable in singleplayer: corporations are NPC-only",
      ),
    }),
  ],
  destinations: [
    dest({
      id: "world.hall-of-fame",
      label: "Hall of Fame",
      requiresCapabilities: ["online-account"],
      multiplayerOnly: true,
      mobileGroup: "leaderboards",
      availability: onlineOnly(
        "legacy leaderboard page in the online viewer",
        "Multiplayer only: the cross-player leaderboard has no local-world source",
      ),
    }),
    dest({
      id: "world.nations",
      label: "Nations",
      requiresCapabilities: [],
      mobileGroup: "diplomacy",
      availability: gameplay(
        "nations index from the local world snapshot",
        "nations index in the online viewer",
      ),
    }),
    dest({
      id: "world.map",
      label: "Map",
      labelNote: "Country map path comes from the viewed country config",
      requiresCapabilities: [],
      mobileGroup: "diplomacy",
      availability: gameplay(
        "world map from the local world snapshot",
        "world map page in the online viewer",
      ),
    }),
    dest({
      id: "world.crises",
      label: "Crises",
      requiresCapabilities: [],
      mobileGroup: "diplomacy",
      availability: gameplay(
        "crisis topics from the local world snapshot",
        "crisis board in the online viewer",
      ),
    }),
    dest({
      id: "world.german-question",
      label: "The German Question",
      requiresCapabilities: [],
      requiresCondition: "crisis-live",
      parent: "world.crises",
      mobileGroup: "diplomacy",
      availability: gameplay(
        "settlement-crisis record nested under Crises; standing crisis only, never the flag alone",
        "live settlement-crisis page nested under Crises; standing crisis only, never the flag alone",
      ),
    }),
    dest({
      id: "world.conflicts",
      label: "Conflicts",
      requiresCapabilities: [],
      requiresCondition: "conflicts-feature",
      mobileGroup: "diplomacy",
      availability: gameplay(
        "conflicts, cold-war tension, and alignment from the local world; conflicts feature only",
        "conflicts page; conflicts feature only",
      ),
    }),
    dest({
      id: "world.international-orgs",
      label: "International Orgs",
      requiresCapabilities: [],
      mobileGroup: "diplomacy",
      availability: gameplay(
        "international-organization topics from the local world snapshot",
        "international organizations page in the online viewer",
      ),
    }),
    dest({
      id: "world.sectors",
      label: "Sectors",
      requiresCapabilities: [],
      mobileGroup: "economy",
      availability: gameplay(
        "sector topics from the local world snapshot",
        "sectors page in the online viewer",
      ),
    }),
    dest({
      id: "world.unions",
      label: "Unions",
      requiresCapabilities: [],
      requiresCondition: "unions-feature",
      mobileGroup: "economy",
      availability: gameplay(
        "global unions roster from the local world; unions feature only",
        "global unions roster; unions feature only",
      ),
    }),
    dest({
      id: "world.stock-market",
      label: "Stock Market",
      requiresCapabilities: [],
      mobileGroup: "economy",
      availability: gameplay(
        "market board from the local world snapshot",
        "global stock market page in the online viewer",
      ),
    }),
    dest({
      id: "world.forex",
      label: "Currency Exchange",
      requiresCapabilities: [],
      mobileGroup: "economy",
      availability: gameplay(
        "exchange rates against the anchor currency from the local world",
        "global currency exchange page in the online viewer",
      ),
    }),
    dest({
      id: "world.trade",
      label: "Trade",
      requiresCapabilities: [],
      mobileGroup: "economy",
      availability: gameplay(
        "trade topics from the local world snapshot",
        "trade page in the online viewer",
      ),
    }),
    dest({
      id: "world.news",
      label: "News",
      labelNote: "Country-scoped feed for the viewed nation",
      requiresCapabilities: [],
      mobileGroup: "other",
      availability: gameplay(
        "country-scoped news feed from the local world",
        "news feed for the viewed nation in the online viewer",
      ),
    }),
    dest({
      id: "world.imf",
      label: "IMF",
      requiresCapabilities: [],
      mobileGroup: "economy",
      availability: gameplay(
        "IMF topics from the local world snapshot",
        "IMF page in the online viewer",
      ),
    }),
    dest({
      id: "world.banking",
      label: "Banking",
      requiresCapabilities: [],
      mobileGroup: "economy",
      availability: gameplay(
        "central and private banking from the local world",
        "banking hub in the online viewer",
      ),
    }),
  ],
};

const HELP: NavSection = {
  id: "help",
  title: "Help",
  requiresCapabilities: [],
  availableIn: ["local", "multiplayer"],
  destinations: [
    dest({
      id: "help.wiki",
      label: "Wiki/Guides",
      labelNote: "Live community wiki opens in the system browser",
      requiresCapabilities: ["external-browser"],
      availability: external("live community wiki opens in the system browser"),
    }),
    dest({
      id: "help.about",
      label: "About",
      requiresCapabilities: [],
      availability: helpOnline(
        "about page; Help may use the online viewer in any mode",
      ),
    }),
    dest({
      id: "help.suggestions",
      label: "Suggestions",
      requiresCapabilities: [],
      availability: helpOnline(
        "feedback page; Help may use the online viewer in any mode",
      ),
    }),
    dest({
      id: "help.quick-suggest",
      label: "Quick suggest (screenshot)",
      labelNote: "Button, not a page; capture runs through the site feedback pipeline",
      requiresCapabilities: ["online-account"],
      multiplayerOnly: true,
      availability: onlineOnly(
        "site feedback modal with screenshot in the online viewer",
        "Multiplayer only: screenshot feedback runs through the site feedback pipeline",
      ),
    }),
    dest({
      id: "help.discord",
      label: "Discord",
      requiresCapabilities: ["external-browser"],
      availability: external("community chat invite opens in the system browser"),
    }),
    dest({
      id: "help.patreon",
      label: "Support on Patreon",
      requiresCapabilities: ["external-browser"],
      availability: external("membership page opens in the system browser"),
    }),
    dest({
      id: "help.supporter-wall",
      label: "Supporter Wall",
      requiresCapabilities: ["external-browser"],
      availability: external("supporter wall opens in the system browser"),
    }),
    dest({
      id: "help.email-support",
      label: "Email Support",
      requiresCapabilities: ["external-browser"],
      availability: external("support mailbox opens in the system mail handler"),
    }),
    dest({
      id: "help.server-status",
      label: "Server Status",
      requiresCapabilities: ["external-browser"],
      availability: external("status page opens in the system browser"),
    }),
    dest({
      id: "help.privacy",
      label: "Privacy Policy",
      requiresCapabilities: [],
      availability: helpOnline(
        "privacy page; Help may use the online viewer in any mode",
      ),
    }),
    dest({
      id: "help.terms",
      label: "Terms of Service",
      requiresCapabilities: [],
      availability: helpOnline(
        "terms page; Help may use the online viewer in any mode",
      ),
    }),
  ],
};

export const NAV_MANIFEST: NavManifest = {
  sections: [ACTIONS, STATE, NATION, WORLD, HELP],
};
