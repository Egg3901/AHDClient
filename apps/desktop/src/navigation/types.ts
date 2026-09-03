/**
 * Canonical navigation manifest types.
 *
 * One source for desktop and mobile. Destinations use stable local route ids,
 * never URLs: routing (local world, online viewer, system browser) is
 * described per platform and per play mode in data, not embedded in links.
 *
 * Platform (where the shell runs) and play mode (which world the viewer is
 * in) are separate concepts: a desktop shell serves local singleplayer
 * worlds from the in-process engine with zero fetch, and serves the live
 * multiplayer game through the hardened online viewer.
 */

export type Platform = "desktop" | "mobile";

/**
 * Which world the viewer is in. Local singleplayer worlds run fully
 * on-device (no fetch, no account); multiplayer is the live online game.
 */
export type PlayMode = "local" | "multiplayer";

/**
 * Session or platform powers a destination can require. Data-driven
 * visibility (an active race, a held office, a feature flag) is not a
 * capability: it lives on `requiresCondition`.
 *
 * "online-account" is only ever required by explicitly multiplayer-only
 * destinations (and never in local mode: the local resolver waives it, and
 * no locally-supported route lists it).
 */
export type Capability =
  | "online-account"
  | "standard-character"
  | "multi-character"
  | "admin-role"
  | "moderator-role"
  | "external-browser";

/**
 * Data conditions in the viewed nation or character. Each token names the
 * rule AHDGame applies before rendering the entry, so gated destinations
 * stay in the manifest with their rule instead of being silently omitted.
 * Conditions are mode-blind: party membership, held offices, live races,
 * and feature flags exist in local worlds exactly as online.
 */
export type NavCondition =
  | "home-state"
  | "party-membership"
  | "cabinet-seat"
  | "governor-seat"
  | "active-candidacy"
  | "corporation-ceo"
  | "us-country"
  | "direct-election-race"
  | "playable-pipeline-country"
  | "standard-country-metrics"
  | "charter-slot"
  | "referendum-live"
  | "unions-feature"
  | "conflicts-feature"
  | "crisis-live"
  | "wiki-live";

/** How one platform in one play mode serves a destination. */
export type RouteVia = "local-world" | "online-viewer" | "system-browser" | "none";

export interface DestinationAvailability {
  supported: boolean;
  via: RouteVia;
  /** Routing note when supported; the blocking reason when not. Never empty. */
  reason: string;
  /**
   * Whether serving the destination performs a network fetch from the app.
   * Local-world routes never fetch (singleplayer is fully local); the
   * online viewer does. System-browser handoff performs no in-app fetch:
   * the OS browser loads the target.
   */
  requiresFetch: boolean;
}

export type WorldMobileGroup = "leaderboards" | "diplomacy" | "economy" | "other";

export interface Destination {
  /** Stable local route id, e.g. "nation.politics.elections". Never a URL. */
  id: string;
  /** English default label, mirroring AHDGame nav.json. */
  label: string;
  /** Clarification when the label is data-driven (country config, live data). */
  labelNote?: string;
  requiresCapabilities: Capability[];
  requiresCondition?: NavCondition;
  /**
   * Explicit multiplayer-only classification for genuinely
   * account/social/server-bound entries (cross-player leaderboard, server
   * feedback pipeline). These stay in the manifest with their rule instead
   * of being hidden: they resolve as unsupported in local mode with a
   * multiplayer reason. Every other destination resolves locally.
   */
  multiplayerOnly?: boolean;
  /** Route id of the parent entry, when this renders nested under another. */
  parent?: string;
  /** Mobile drawer category. World section only; pinned entries have none. */
  mobileGroup?: WorldMobileGroup;
  /** Per-mode, per-platform serving. Platform and play mode are independent. */
  availability: Record<PlayMode, Record<Platform, DestinationAvailability>>;
}

export interface NavGroup {
  id: string;
  title: string;
  destinations: Destination[];
}

export interface NavSection {
  id: "actions" | "state" | "nation" | "world" | "help";
  title: string;
  requiresCapabilities: Capability[];
  requiresCondition?: NavCondition;
  /**
   * Play modes where this section appears. All five top-level sections ship
   * in local mode; `requiresCapabilities`/`requiresCondition` above gate the
   * multiplayer game only (local mode waives the account-bound section
   * gate, destination rules still apply).
   */
  availableIn: readonly PlayMode[];
  /** Pinned entries rendered above groups (home links, personal links). */
  pinned?: Destination[];
  groups?: NavGroup[];
  /** Flat entries for sections without named groups (Actions, State, Help). */
  destinations?: Destination[];
}

export interface NavManifest {
  sections: NavSection[];
}
