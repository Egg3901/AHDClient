import type { WorldState } from "@ahdclient/engine";
import type { Capability, NavCondition } from "./types.js";
import type { Viewer } from "./resolve.js";

const LIVE_REFERENDUM_STATUSES = new Set(["campaigning", "polling", "actuating"]);
const LIVE_CHARTER_STATUSES = new Set([
  "draft",
  "pending-signatures",
  "founder-replacement",
]);

export function localViewerForWorld(
  world: WorldState,
  viewedCountryId: string,
  platform: "desktop" | "mobile" = "desktop",
): Viewer {
  const capabilities: Capability[] = ["external-browser"];
  if (world.player.mode === "career") capabilities.push("standard-character");

  const conditions: NavCondition[] = [];
  const homeRegionId = world.player.homeRegionId;
  const hasHomeRegion =
    typeof homeRegionId === "string" &&
    world.regions[homeRegionId]?.countryId === world.player.countryId;
  if (hasHomeRegion) conditions.push("home-state");
  if (world.player.partyId !== null) conditions.push("party-membership");
  if (world.cabinetMembers.some((member) => member.characterId === "player")) {
    conditions.push("cabinet-seat");
  }
  if (hasHomeRegion && world.governors[homeRegionId]?.governorId === "player") {
    conditions.push("governor-seat");
  }
  if (
    world.elections.some(
      (election) =>
        election.status !== "resolved" &&
        election.countryId === world.player.countryId &&
        election.state === homeRegionId &&
        election.candidates.some((candidate) => candidate.id === "player"),
    )
  ) {
    conditions.push("active-candidacy");
  }
  if (world.player.countryId === "US") conditions.push("us-country");
  if (
    world.elections.some(
      (election) =>
        election.countryId === viewedCountryId &&
        election.electionType === "president" &&
        election.status !== "resolved",
    )
  ) {
    conditions.push("direct-election-race");
  }
  if (world.countries[viewedCountryId]?.playable === true) {
    conditions.push("playable-pipeline-country");
  } else {
    conditions.push("standard-country-metrics");
  }
  if (
    world.charters.some(
      (charter) =>
        charter.countryId === viewedCountryId &&
        LIVE_CHARTER_STATUSES.has(charter.status) &&
        (charter.partyId === null || charter.partyId === world.player.partyId),
    )
  ) {
    conditions.push("charter-slot");
  }
  if (
    world.referendums.some(
      (referendum) =>
        referendum.countryId === viewedCountryId &&
        LIVE_REFERENDUM_STATUSES.has(referendum.status),
    )
  ) {
    conditions.push("referendum-live");
  }
  if (world.featureFlags.unions) conditions.push("unions-feature");
  if (world.featureFlags.conflicts) conditions.push("conflicts-feature");
  if (
    world.crises.some(
      (crisis) =>
        crisis.status === "active" &&
        /german|reunification|berlin/i.test(`${crisis.kind} ${crisis.name}`),
    )
  ) {
    conditions.push("crisis-live");
  }

  return { platform, playMode: "local", capabilities, conditions };
}
