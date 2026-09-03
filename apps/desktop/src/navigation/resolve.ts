import type {
  Capability,
  Destination,
  DestinationAvailability,
  NavCondition,
  NavManifest,
  NavSection,
  Platform,
  PlayMode,
} from "./types.js";

export interface Viewer {
  /** Where the shell runs. Independent of play mode. */
  platform: Platform;
  /** Which world the viewer is in. Independent of platform. */
  playMode: PlayMode;
  capabilities: readonly Capability[];
  conditions: readonly NavCondition[];
}

export function sectionDestinations(section: NavSection): Destination[] {
  return [
    ...(section.pinned ?? []),
    ...(section.groups ?? []).flatMap((g) => g.destinations),
    ...(section.destinations ?? []),
  ];
}

export function allDestinations(manifest: NavManifest): Destination[] {
  return manifest.sections.flatMap(sectionDestinations);
}

export function allRouteIds(manifest: NavManifest): string[] {
  return allDestinations(manifest).map((d) => d.id);
}

export function findDestination(
  manifest: NavManifest,
  id: string,
): Destination | undefined {
  return allDestinations(manifest).find((d) => d.id === id);
}

function meetsGate(
  requiresCapabilities: readonly Capability[],
  requiresCondition: NavCondition | undefined,
  viewer: Viewer,
): boolean {
  if (!requiresCapabilities.every((c) => viewer.capabilities.includes(c))) return false;
  if (requiresCondition !== undefined && !viewer.conditions.includes(requiresCondition)) {
    return false;
  }
  return true;
}

/**
 * Local-mode gate: the online account is a multiplayer concept, so local
 * resolution waives it. Every other capability (character standing, browser
 * handoff) and every data condition still applies in local worlds.
 */
function meetsLocalGate(
  requiresCapabilities: readonly Capability[],
  requiresCondition: NavCondition | undefined,
  viewer: Viewer,
): boolean {
  return meetsGate(
    requiresCapabilities.filter((c) => c !== "online-account"),
    requiresCondition,
    viewer,
  );
}

/** A section is visible when its play mode ships and its gate passes. */
export function isSectionVisible(
  manifest: NavManifest,
  sectionId: NavSection["id"],
  viewer: Viewer,
): boolean {
  const section = manifest.sections.find((s) => s.id === sectionId);
  if (!section) return false;
  if (!section.availableIn.includes(viewer.playMode)) return false;
  if (viewer.playMode === "local") return true;
  return meetsGate(section.requiresCapabilities, section.requiresCondition, viewer);
}

/** Every section the viewer may see, in manifest order. */
export function visibleSections(manifest: NavManifest, viewer: Viewer): NavSection[] {
  return manifest.sections.filter((s) => isSectionVisible(manifest, s.id, viewer));
}

/**
 * A destination is visible when its section plus its own gate pass.
 * Multiplayer-only entries stay listed in local mode (badged by the shell
 * via `multiplayerOnly` / `resolveDestination`) instead of being hidden.
 */
export function isDestinationVisible(
  manifest: NavManifest,
  sectionId: NavSection["id"],
  destination: Destination,
  viewer: Viewer,
): boolean {
  if (!isSectionVisible(manifest, sectionId, viewer)) return false;
  if (viewer.playMode === "local") {
    return meetsLocalGate(destination.requiresCapabilities, destination.requiresCondition, viewer);
  }
  return meetsGate(destination.requiresCapabilities, destination.requiresCondition, viewer);
}

export interface VisibleEntry {
  sectionId: NavSection["id"];
  destination: Destination;
}

/** Every destination the viewer may see, in manifest order. */
export function visibleDestinations(manifest: NavManifest, viewer: Viewer): VisibleEntry[] {
  const out: VisibleEntry[] = [];
  for (const section of manifest.sections) {
    for (const destination of sectionDestinations(section)) {
      if (isDestinationVisible(manifest, section.id, destination, viewer)) {
        out.push({ sectionId: section.id, destination });
      }
    }
  }
  return out;
}

/** How one destination serves one viewer: target, fetch cost, and listing. */
export interface ResolvedDestination {
  sectionId: NavSection["id"];
  destination: Destination;
  /** Mode- and platform-specific serving. Never a URL. */
  availability: DestinationAvailability;
  /** Whether the destination is listed for this viewer. */
  visible: boolean;
  /** True when the id only ever serves multiplayer (local resolves unsupported). */
  multiplayerOnly: boolean;
}

/** Per-mode, per-platform serving for a viewer. Platform and mode stay separate. */
export function availabilityFor(
  destination: Destination,
  viewer: Pick<Viewer, "platform" | "playMode">,
): DestinationAvailability {
  return destination.availability[viewer.playMode][viewer.platform];
}

export function resolveDestination(
  manifest: NavManifest,
  id: string,
  viewer: Viewer,
): ResolvedDestination | undefined {
  for (const section of manifest.sections) {
    const destination = sectionDestinations(section).find((d) => d.id === id);
    if (!destination) continue;
    return {
      sectionId: section.id,
      destination,
      availability: availabilityFor(destination, viewer),
      visible: isDestinationVisible(manifest, section.id, destination, viewer),
      multiplayerOnly: destination.multiplayerOnly === true,
    };
  }
  return undefined;
}

/** Destinations served from the on-device world (no fetch, no account). */
export function localDestinations(
  manifest: NavManifest,
  platform: Platform,
): Destination[] {
  return allDestinations(manifest).filter(
    (d) => d.availability.local[platform].supported,
  );
}

/** Explicitly multiplayer-only entries. Classified, never hidden. */
export function multiplayerOnlyDestinations(manifest: NavManifest): Destination[] {
  return allDestinations(manifest).filter((d) => d.multiplayerOnly === true);
}

/** Destinations a platform cannot serve in a play mode. Must stay explainable. */
export function unsupportedDestinations(
  manifest: NavManifest,
  platform: Platform,
  playMode: PlayMode = "multiplayer",
): Destination[] {
  return allDestinations(manifest).filter((d) => !d.availability[playMode][platform].supported);
}
