import { describe, expect, it } from "vitest";
import { NAV_MANIFEST } from "./manifest.js";
import {
  allDestinations,
  allRouteIds,
  availabilityFor,
  findDestination,
  isSectionVisible,
  localDestinations,
  multiplayerOnlyDestinations,
  resolveDestination,
  sectionDestinations,
  unsupportedDestinations,
  visibleDestinations,
  visibleSections,
} from "./resolve.js";
import type { Destination, NavCondition, Platform, PlayMode, Viewer } from "./index.js";

const SECTION_ORDER = ["actions", "state", "nation", "world", "help"];
const NATION_GROUP_ORDER = ["politics", "other", "government", "economy"];

const EXPECTED_STATE = [
  "state.my-party",
  "state.overview",
  "state.economy",
  "state.elections",
  "state.legislature",
  "state.office",
  "state.my-election",
  "state.my-office",
];

const EXPECTED_NATION_PINNED = [
  "nation.home",
  "nation.cabinet-office",
  "nation.my-party",
  "nation.political-operations",
  "nation.switch-view",
];

const EXPECTED_NATION_POLITICS = [
  "nation.politics.elections",
  "nation.politics.parties",
  "nation.politics.politicians",
  "nation.politics.presidential-election",
  "nation.politics.political-metrics",
  "nation.politics.charters",
  "nation.politics.referendums",
];

const EXPECTED_NATION_GOVERNMENT = [
  "nation.government.legislature",
  "nation.government.executive",
  "nation.government.policy",
  "nation.government.scotus",
];

const EXPECTED_NATION_ECONOMY = [
  "nation.economy.banking",
  "nation.economy.economy",
  "nation.economy.budget",
  "nation.economy.metrics",
  "nation.economy.unions",
];

const EXPECTED_WORLD_MAIN = [
  "world.hall-of-fame",
  "world.nations",
  "world.map",
  "world.crises",
  "world.german-question",
  "world.conflicts",
  "world.international-orgs",
  "world.sectors",
  "world.unions",
  "world.stock-market",
  "world.forex",
  "world.trade",
  "world.news",
  "world.imf",
  "world.banking",
];

const EXPECTED_HELP = [
  "help.wiki",
  "help.about",
  "help.suggestions",
  "help.quick-suggest",
  "help.discord",
  "help.patreon",
  "help.supporter-wall",
  "help.email-support",
  "help.server-status",
  "help.privacy",
  "help.terms",
];

/** Every destination the country-overview Explore directory must reach locally. */
const COUNTRY_OVERVIEW_IDS = [
  ...EXPECTED_NATION_PINNED,
  ...EXPECTED_NATION_POLITICS,
  "nation.other.map",
  ...EXPECTED_NATION_GOVERNMENT,
  ...EXPECTED_NATION_ECONOMY,
];

/** Actions + State destinations: all singleplayer-relevant. */
const ACTIONS_AND_STATE_IDS = ["actions", ...EXPECTED_STATE];

/** World destinations served from the local world (hall of fame is multiplayer-only). */
const LOCAL_WORLD_IDS = ["world.my-corporation", ...EXPECTED_WORLD_MAIN].filter(
  (id) => id !== "world.hall-of-fame",
);

/** The only explicitly multiplayer-only entries. Classified, never hidden. */
const MULTIPLAYER_ONLY_IDS = ["world.hall-of-fame", "help.quick-suggest"];

const ROUTE_ID = /^[a-z0-9]+(\.[a-z0-9-]+)*$/;

function section(id: string) {
  const s = NAV_MANIFEST.sections.find((sec) => sec.id === id);
  if (!s) throw new Error(`missing section ${id}`);
  return s;
}

function viewerFor(platform: Platform, playMode: PlayMode, viewer?: Partial<Viewer>): Viewer {
  return {
    platform,
    playMode,
    capabilities: [],
    conditions: [],
    ...viewer,
  };
}

describe("navigation manifest structure", () => {
  it("has the five canonical top-level sections in order", () => {
    expect(NAV_MANIFEST.sections.map((s) => s.id)).toEqual(SECTION_ORDER);
  });

  it("ships every top-level section in local mode", () => {
    for (const s of NAV_MANIFEST.sections) {
      expect(s.availableIn, s.id).toContain("local");
      expect(s.availableIn, s.id).toContain("multiplayer");
    }
  });

  it("orders Nation groups Politics, Other, Government, Economy", () => {
    expect(section("nation").groups?.map((g) => g.id)).toEqual(NATION_GROUP_ORDER);
  });

  it("covers the complete State directory", () => {
    expect(section("state").destinations?.map((d) => d.id)).toEqual(EXPECTED_STATE);
  });

  it("covers Nation pinned entries and every group completely", () => {
    const nation = section("nation");
    expect(nation.pinned?.map((d) => d.id)).toEqual(EXPECTED_NATION_PINNED);
    const byId = new Map((nation.groups ?? []).map((g) => [g.id, g.destinations.map((d) => d.id)]));
    expect(byId.get("politics")).toEqual(EXPECTED_NATION_POLITICS);
    expect(byId.get("other")).toEqual(["nation.other.map"]);
    expect(byId.get("government")).toEqual(EXPECTED_NATION_GOVERNMENT);
    expect(byId.get("economy")).toEqual(EXPECTED_NATION_ECONOMY);
  });

  it("covers the World directory including the pinned corporation link", () => {
    const world = section("world");
    expect(world.pinned?.map((d) => d.id)).toEqual(["world.my-corporation"]);
    expect(world.destinations?.map((d) => d.id)).toEqual(EXPECTED_WORLD_MAIN);
  });

  it("covers the complete Help directory", () => {
    expect(section("help").destinations?.map((d) => d.id)).toEqual(EXPECTED_HELP);
  });

  it("holds 58 destinations total", () => {
    expect(allDestinations(NAV_MANIFEST)).toHaveLength(58);
  });
});

describe("route ids", () => {
  it("are unique stable ids, never URLs", () => {
    const ids = allRouteIds(NAV_MANIFEST);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(ROUTE_ID);
      expect(id).not.toContain("://");
    }
    expect(JSON.stringify(NAV_MANIFEST)).not.toContain("://");
  });

  it("round-trips through findDestination", () => {
    for (const id of allRouteIds(NAV_MANIFEST)) {
      expect(findDestination(NAV_MANIFEST, id)?.id).toBe(id);
    }
    expect(findDestination(NAV_MANIFEST, "nope.missing")).toBeUndefined();
  });
});

describe("capabilities and availability", () => {
  it("gives every destination per-mode, per-platform availability with a reason", () => {
    for (const d of allDestinations(NAV_MANIFEST)) {
      for (const playMode of ["local", "multiplayer"] as const) {
        for (const platform of ["desktop", "mobile"] as const) {
          const a = d.availability[playMode][platform];
          expect(a.reason.trim().length, `${d.id} ${playMode} ${platform} reason`).toBeGreaterThan(0);
          if (a.supported) {
            expect(
              ["local-world", "online-viewer", "system-browser"],
              `${d.id} ${playMode} ${platform} via`,
            ).toContain(a.via);
          } else {
            expect(a.via, `${d.id} ${playMode} ${platform} via`).toBe("none");
          }
        }
      }
    }
  });

  it("explains every unsupported destination with a reason and a gate", () => {
    for (const playMode of ["local", "multiplayer"] as const) {
      for (const platform of ["desktop", "mobile"] as const) {
        for (const d of unsupportedDestinations(NAV_MANIFEST, platform, playMode)) {
          expect(d.availability[playMode][platform].reason.trim().length).toBeGreaterThan(0);
          const gated =
            d.requiresCapabilities.length > 0 ||
            d.requiresCondition !== undefined ||
            d.multiplayerOnly === true;
          expect(gated, `${d.id} names a capability, condition, or multiplayer flag`).toBe(true);
        }
      }
    }
  });

  it("serves every canonical destination in multiplayer on both shells", () => {
    expect(unsupportedDestinations(NAV_MANIFEST, "desktop", "multiplayer")).toEqual([]);
    expect(unsupportedDestinations(NAV_MANIFEST, "mobile", "multiplayer")).toEqual([]);
  });

  it("serves every gameplay destination locally except the multiplayer-only set", () => {
    for (const platform of ["desktop", "mobile"] as const) {
      const unsupported = unsupportedDestinations(NAV_MANIFEST, platform, "local").map((d) => d.id);
      expect([...unsupported].sort()).toEqual([...MULTIPLAYER_ONLY_IDS].sort());
    }
  });

  it("routes gameplay destinations through the local world in local mode", () => {
    for (const id of [...ACTIONS_AND_STATE_IDS, ...COUNTRY_OVERVIEW_IDS, ...LOCAL_WORLD_IDS]) {
      const d = findDestination(NAV_MANIFEST, id)!;
      expect(d, id).toBeDefined();
      for (const platform of ["desktop", "mobile"] as const) {
        expect(d.availability.local[platform].supported, `${id} local ${platform}`).toBe(true);
        expect(d.availability.local[platform].via, `${id} local ${platform}`).toBe("local-world");
        expect(d.availability.multiplayer[platform].supported, `${id} multiplayer ${platform}`).toBe(
          true,
        );
      }
    }
  });

  it("requires no fetch and no online account on any local gameplay route", () => {
    // Gameplay sections only: Help may use the online viewer or system
    // browser in any mode, so its fetch cost is exempt here.
    const gameplayIds = new Set(
      ["actions", "state", "nation", "world"].flatMap(
        (id) => sectionDestinations(section(id)).map((d) => d.id),
      ),
    );
    const locallySupported = new Map<string, Destination>();
    for (const platform of ["desktop", "mobile"] as const) {
      for (const d of localDestinations(NAV_MANIFEST, platform)) {
        if (gameplayIds.has(d.id)) locallySupported.set(d.id, d);
      }
    }
    expect(locallySupported.size).toBeGreaterThan(0);
    for (const d of locallySupported.values()) {
      expect(d.requiresCapabilities, `${d.id} capabilities`).not.toContain("online-account");
      for (const platform of ["desktop", "mobile"] as const) {
        expect(
          d.availability.local[platform].requiresFetch,
          `${d.id} local ${platform} fetch`,
        ).toBe(false);
      }
    }
  });

  it("routes multiplayer gameplay through the online viewer with fetch", () => {
    for (const id of [...ACTIONS_AND_STATE_IDS, ...COUNTRY_OVERVIEW_IDS, ...LOCAL_WORLD_IDS]) {
      const d = findDestination(NAV_MANIFEST, id)!;
      for (const platform of ["desktop", "mobile"] as const) {
        expect(d.availability.multiplayer[platform].via, `${id} ${platform}`).toBe("online-viewer");
        expect(d.availability.multiplayer[platform].requiresFetch, `${id} ${platform}`).toBe(true);
      }
    }
  });

  it("classifies only account/social entries as multiplayer-only, without hiding them", () => {
    expect(multiplayerOnlyDestinations(NAV_MANIFEST).map((d) => d.id).sort()).toEqual(
      [...MULTIPLAYER_ONLY_IDS].sort(),
    );
    for (const id of MULTIPLAYER_ONLY_IDS) {
      const d = findDestination(NAV_MANIFEST, id);
      expect(d, id).toBeDefined();
      expect(d?.multiplayerOnly, id).toBe(true);
      for (const platform of ["desktop", "mobile"] as const) {
        const local = d!.availability.local[platform];
        expect(local.supported, `${id} local ${platform}`).toBe(false);
        expect(local.via, `${id} local ${platform}`).toBe("none");
        expect(local.reason, `${id} local ${platform}`).toMatch(/multiplayer only/i);
        expect(d!.availability.multiplayer[platform].supported, `${id} mp ${platform}`).toBe(true);
      }
    }
  });

  it("routes external help entries through the system browser in every mode", () => {
    for (const id of [
      "help.discord",
      "help.patreon",
      "help.supporter-wall",
      "help.email-support",
      "help.server-status",
    ]) {
      const d = findDestination(NAV_MANIFEST, id);
      expect(d?.requiresCapabilities).toContain("external-browser");
      for (const playMode of ["local", "multiplayer"] as const) {
        expect(d?.availability[playMode].desktop.via, `${id} ${playMode} desktop`).toBe(
          "system-browser",
        );
        expect(d?.availability[playMode].mobile.via, `${id} ${playMode} mobile`).toBe(
          "system-browser",
        );
      }
    }
  });

  it("lets Help use the online viewer or system browser in local mode", () => {
    // quick-suggest is multiplayer-only and covered by its own test.
    for (const d of (section("help").destinations ?? []).filter((e) => !e.multiplayerOnly)) {
      for (const platform of ["desktop", "mobile"] as const) {
        expect(
          ["online-viewer", "system-browser"],
          `${d.id} local ${platform}`,
        ).toContain(d.availability.local[platform].via);
      }
    }
  });

  it("encodes the key conditional gates", () => {
    const gates: Record<string, NavCondition> = {
      "nation.politics.presidential-election": "direct-election-race",
      "nation.politics.political-metrics": "playable-pipeline-country",
      "nation.politics.charters": "charter-slot",
      "nation.politics.referendums": "referendum-live",
      "nation.government.scotus": "us-country",
      "nation.economy.metrics": "standard-country-metrics",
      "nation.economy.unions": "unions-feature",
      "world.german-question": "crisis-live",
      "world.conflicts": "conflicts-feature",
      "world.my-corporation": "corporation-ceo",
      "state.my-election": "active-candidacy",
      "state.office": "governor-seat",
    };
    for (const [id, condition] of Object.entries(gates)) {
      expect(findDestination(NAV_MANIFEST, id)?.requiresCondition, id).toBe(condition);
    }
  });

  it("nests the German Question under Crises", () => {
    expect(findDestination(NAV_MANIFEST, "world.german-question")?.parent).toBe("world.crises");
  });

  it("assigns every non-pinned World entry a mobile drawer group", () => {
    const world = section("world");
    for (const d of world.destinations ?? []) {
      expect(d.mobileGroup, d.id).toBeDefined();
    }
    for (const d of world.pinned ?? []) {
      expect(d.mobileGroup, d.id).toBeUndefined();
    }
  });
});

describe("local-mode resolution", () => {
  const entitledLocal = (platform: "desktop" | "mobile"): Viewer =>
    viewerFor(platform, "local", {
      capabilities: ["standard-character", "external-browser"],
      conditions: [
        "home-state",
        "party-membership",
        "cabinet-seat",
        "governor-seat",
        "active-candidacy",
        "corporation-ceo",
        "us-country",
        "direct-election-race",
        "playable-pipeline-country",
        "charter-slot",
        "referendum-live",
        "unions-feature",
        "conflicts-feature",
        "crisis-live",
        "wiki-live",
      ],
    });

  it("shows all five top-level sections to a bare local viewer", () => {
    const bare = viewerFor("desktop", "local");
    expect(visibleSections(NAV_MANIFEST, bare).map((s) => s.id)).toEqual(SECTION_ORDER);
    for (const id of SECTION_ORDER) {
      expect(
        isSectionVisible(NAV_MANIFEST, id as "actions", bare),
        `${id} local section`,
      ).toBe(true);
    }
    const bareMobile = viewerFor("mobile", "local");
    expect(visibleSections(NAV_MANIFEST, bareMobile).map((s) => s.id)).toEqual(SECTION_ORDER);
  });

  it("resolves every country-overview destination locally on desktop and mobile", () => {
    for (const platform of ["desktop", "mobile"] as const) {
      const viewer = entitledLocal(platform);
      for (const id of COUNTRY_OVERVIEW_IDS) {
        const resolved = resolveDestination(NAV_MANIFEST, id, viewer);
        expect(resolved, `${id} ${platform}`).toBeDefined();
        expect(resolved?.availability.supported, `${id} ${platform} supported`).toBe(true);
        expect(resolved?.availability.via, `${id} ${platform} via`).toBe("local-world");
        expect(resolved?.availability.requiresFetch, `${id} ${platform} fetch`).toBe(false);
        expect(resolved?.destination.requiresCapabilities, `${id} account`).not.toContain(
          "online-account",
        );
      }
    }
  });

  it("resolves Actions, State, and World gameplay destinations locally on both shells", () => {
    for (const platform of ["desktop", "mobile"] as const) {
      const viewer = entitledLocal(platform);
      for (const id of [...ACTIONS_AND_STATE_IDS, ...LOCAL_WORLD_IDS]) {
        const resolved = resolveDestination(NAV_MANIFEST, id, viewer);
        expect(resolved, `${id} ${platform}`).toBeDefined();
        expect(resolved?.availability.supported, `${id} ${platform} supported`).toBe(true);
        expect(resolved?.availability.via, `${id} ${platform} via`).toBe("local-world");
      }
    }
  });

  it("keeps platform and play mode separate in resolution", () => {
    const id = "nation.economy.budget";
    const localDesktop = availabilityFor(findDestination(NAV_MANIFEST, id)!, {
      platform: "desktop",
      playMode: "local",
    });
    const localMobile = availabilityFor(findDestination(NAV_MANIFEST, id)!, {
      platform: "mobile",
      playMode: "local",
    });
    // Same mode, different shells: same local target.
    expect(localDesktop.via).toBe("local-world");
    expect(localMobile.via).toBe("local-world");
    // Same shells, different modes: different targets.
    const onlineDesktop = availabilityFor(findDestination(NAV_MANIFEST, id)!, {
      platform: "desktop",
      playMode: "multiplayer",
    });
    expect(onlineDesktop.via).toBe("online-viewer");
    expect(onlineDesktop.requiresFetch).toBe(true);
    expect(localDesktop.requiresFetch).toBe(false);
  });

  it("lists multiplayer-only entries locally instead of hiding them", () => {
    const viewer = entitledLocal("desktop");
    for (const id of MULTIPLAYER_ONLY_IDS) {
      const resolved = resolveDestination(NAV_MANIFEST, id, viewer);
      expect(resolved, id).toBeDefined();
      expect(resolved?.multiplayerOnly, id).toBe(true);
      expect(resolved?.visible, `${id} listed`).toBe(true);
      expect(resolved?.availability.supported, `${id} local support`).toBe(false);
    }
  });

  it("returns undefined for unknown route ids", () => {
    expect(resolveDestination(NAV_MANIFEST, "nope.missing", entitledLocal("desktop"))).toBeUndefined();
  });

  it("applies data conditions in local mode", () => {
    const viewer = viewerFor("desktop", "local", { capabilities: ["standard-character"] });
    expect(resolveDestination(NAV_MANIFEST, "nation.politics.presidential-election", viewer)?.visible).toBe(
      false,
    );
    const qualified = viewerFor("desktop", "local", {
      capabilities: ["standard-character"],
      conditions: ["direct-election-race"],
    });
    expect(
      resolveDestination(NAV_MANIFEST, "nation.politics.presidential-election", qualified)?.visible,
    ).toBe(true);
  });

  it("hides Actions from imperial characters in local mode too", () => {
    const imperial = viewerFor("mobile", "local", { conditions: ["home-state"] });
    const ids = visibleDestinations(NAV_MANIFEST, imperial).map((e) => e.destination.id);
    expect(ids).not.toContain("actions");
    expect(ids).toContain("state.overview");
  });
});

describe("visibility resolution", () => {
  const guest: Viewer = { platform: "desktop", playMode: "multiplayer", capabilities: [], conditions: [] };

  it("shows only public help entries to a signed-out viewer", () => {
    const ids = visibleDestinations(NAV_MANIFEST, guest).map((e) => e.destination.id);
    expect(ids).toEqual(["help.about", "help.suggestions", "help.privacy", "help.terms"]);
  });

  it("shows the full directory to a fully entitled viewer", () => {
    const viewer: Viewer = {
      platform: "desktop",
      playMode: "multiplayer",
      capabilities: ["online-account", "standard-character", "external-browser"],
      conditions: [
        "home-state",
        "party-membership",
        "cabinet-seat",
        "governor-seat",
        "active-candidacy",
        "corporation-ceo",
        "us-country",
        "direct-election-race",
        "playable-pipeline-country",
        "charter-slot",
        "referendum-live",
        "unions-feature",
        "conflicts-feature",
        "crisis-live",
        "wiki-live",
      ],
    };
    // standard-country-metrics and playable-pipeline-country are complements:
    // metrics drops out, everything else shows.
    expect(visibleDestinations(NAV_MANIFEST, viewer)).toHaveLength(57);
  });

  it("hides Actions from imperial characters", () => {
    const imperial: Viewer = {
      platform: "mobile",
      playMode: "multiplayer",
      capabilities: ["online-account"],
      conditions: ["home-state"],
    };
    const ids = visibleDestinations(NAV_MANIFEST, imperial).map((e) => e.destination.id);
    expect(ids).not.toContain("actions");
    expect(ids).toContain("state.overview");
  });

  it("keeps section order in visible output", () => {
    const viewer: Viewer = {
      platform: "desktop",
      playMode: "multiplayer",
      capabilities: ["online-account", "standard-character", "external-browser"],
      conditions: ["home-state", "wiki-live"],
    };
    const order = visibleDestinations(NAV_MANIFEST, viewer).map((e) => e.sectionId);
    const rank = (s: string) => SECTION_ORDER.indexOf(s);
    expect([...order].sort((a, b) => rank(a) - rank(b))).toEqual(order);
  });
});

describe("no silent omissions", () => {
  it("every Destination object in the manifest is reachable via traversal", () => {
    const seen = new Set<string>();
    const collect = (d: Destination) => {
      expect(seen.has(d.id), `duplicate destination ${d.id}`).toBe(false);
      seen.add(d.id);
    };
    for (const s of NAV_MANIFEST.sections) {
      s.pinned?.forEach(collect);
      s.groups?.forEach((g) => g.destinations.forEach(collect));
      s.destinations?.forEach(collect);
    }
    expect(seen.size).toBe(allDestinations(NAV_MANIFEST).length);
  });
});
