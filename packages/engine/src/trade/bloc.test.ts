import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { isTradeBlocMember, worldBlocOf } from "./bloc.js";

describe("worldBlocOf / isTradeBlocMember", () => {
  it("RU and DD (command economies) are 'east'; US and UK are 'west'", () => {
    const world = createWorld({ seed: "bloc-seed", playerName: "P", countryId: "US", era: "1953" });
    expect(worldBlocOf(world, "RU")).toBe("east");
    expect(worldBlocOf(world, "DD")).toBe("east");
    expect(worldBlocOf(world, "US")).toBe("west");
    expect(worldBlocOf(world, "UK")).toBe("west");
  });

  it("every 1953 playable country has at least one bloc partner", () => {
    const world = createWorld({ seed: "bloc-seed-2", playerName: "P", countryId: "US", era: "1953" });
    expect(isTradeBlocMember(world, "RU")).toBe(true);
    expect(isTradeBlocMember(world, "DD")).toBe(true);
    expect(isTradeBlocMember(world, "US")).toBe(true);
    expect(isTradeBlocMember(world, "UK")).toBe(true);
  });

  it("a country with no bloc partner reads false", () => {
    const world = createWorld({ seed: "bloc-seed-3", playerName: "P", countryId: "US", era: "1953" });
    // Force RU east with no other east-bloc partner by dropping DD's commandEconomy entry.
    delete world.commandEconomy["DD"];
    expect(isTradeBlocMember(world, "RU")).toBe(false);
  });
});
