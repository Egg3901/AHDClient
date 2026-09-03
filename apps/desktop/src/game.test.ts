import { createWorld, deserializeSave, serializeSave } from "@ahdclient/engine";
import { describe, expect, it } from "vitest";
import { game } from "./game.js";

const OPTS = {
  seed: "desktop-save-test",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

describe("desktop game session", () => {
  it("resumes a loaded world as the authoritative active session", async () => {
    await game.newGame({ ...OPTS, seed: "world-being-replaced" });
    const loaded = createWorld(OPTS);
    const restored = deserializeSave(serializeSave(loaded, "2026-01-01T00:00:00Z"));

    game.resumeGame(restored);
    const result = await game.advanceTurn();

    expect(result.world).toBe(restored);
    expect(result.world.meta.seed).toBe("desktop-save-test");
    expect(result.world.meta.turn).toBe(1);
  });

  it("ends the authoritative session when returning to the launcher", async () => {
    await game.newGame(OPTS);

    game.endGame();

    await expect(game.advanceTurn()).rejects.toThrow("No game in progress");
  });

  it("routes cheats through the engine-owned mutation API", async () => {
    const world = await game.newGame(OPTS);

    game.applyCheat({ kind: "setPlayerCash", amount: 4321 });

    expect(world.player.cash).toBe(4321);
    expect(world.meta.cheatsUsed).toBe(true);
  });

  it("honors simulation controls selected before the first turn", async () => {
    const world = await game.newGame({ ...OPTS, featureFlags: { elections: false, events: false } });

    expect(world.featureFlags.elections).toBe(false);
    expect(world.featureFlags.events).toBe(false);
    expect(world.featureFlags.economy).toBe(true);

    await game.advanceTurn();

    expect(world.featureFlags.elections).toBe(false);
    expect(world.featureFlags.events).toBe(false);
  });

  it("replaces an edited world only after save-schema validation", async () => {
    const world = await game.newGame(OPTS);
    const candidate = JSON.stringify({ ...world, player: { ...world.player, cash: 7654 } });

    const replaced = game.replaceWorldFromJson(candidate);

    expect(replaced.player.cash).toBe(7654);
    expect(replaced.meta.cheatsUsed).toBe(true);
    expect(game.getStateSync()).toBe(replaced);
    expect(() => game.replaceWorldFromJson("{}")).toThrow(/valid save|world state/i);
    expect(game.getStateSync()).toBe(replaced);
  });
});
