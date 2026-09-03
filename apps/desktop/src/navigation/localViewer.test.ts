import { createWorld } from "@ahdclient/engine";
import { describe, expect, it } from "vitest";
import { localViewerForWorld } from "./localViewer.js";

describe("localViewerForWorld", () => {
  it("derives navigation gates from the live local world", () => {
    const world = createWorld({
      seed: "local-viewer",
      playerName: "Tester",
      countryId: "US",
      era: "1953",
      homeRegionId: "CA",
    });
    const viewer = localViewerForWorld(world, "US");
    expect(viewer.capabilities).toContain("standard-character");
    expect(viewer.conditions).toContain("home-state");
    expect(viewer.conditions).toContain("us-country");
    expect(viewer.conditions).toContain("playable-pipeline-country");
  });

  it("does not claim gates absent from the world", () => {
    const world = createWorld({
      seed: "local-viewer-hos",
      playerName: "Tester",
      countryId: "UK",
      era: "1953",
      mode: "hos",
    });
    world.player.homeRegionId = null;
    const viewer = localViewerForWorld(world, "UK");
    expect(viewer.capabilities).not.toContain("standard-character");
    expect(viewer.conditions).not.toContain("home-state");
    expect(viewer.conditions).not.toContain("party-membership");
    expect(viewer.conditions).not.toContain("us-country");
  });

  it("gates personal political operations on the player's home country", () => {
    const usWorld = createWorld({
      seed: "local-viewer-home-us",
      playerName: "Tester",
      countryId: "US",
      era: "1953",
    });
    expect(localViewerForWorld(usWorld, "UK").conditions).toContain("us-country");

    const ukWorld = createWorld({
      seed: "local-viewer-home-uk",
      playerName: "Tester",
      countryId: "UK",
      era: "1953",
    });
    expect(localViewerForWorld(ukWorld, "US").conditions).not.toContain("us-country");
  });
});
