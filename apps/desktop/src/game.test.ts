import { createWorld, deserializeSave, serializeSave } from "@rotunda/engine";
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
});
