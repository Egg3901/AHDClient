import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";

// Split out of elections.test.ts (2026-09-02): vitest parallelizes across files,
// not within one, and these multi-hundred-turn sims were serializing the whole
// engine suite behind a single worker.
const OPTS = { seed: "elections-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("W40 subnational chambers", () => {
  it("W40: subnational chambers spawn, fill, and resolve seats", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 900; i++) advanceTurn(w);

    const cases: Array<{ countryId: string; chamberKey: string }> = [
      { countryId: "US", chamberKey: "stateSenate" },
      { countryId: "UK", chamberKey: "regionalCouncil" },
      { countryId: "RU", chamberKey: "republicSupremeSoviet" },
      { countryId: "DD", chamberKey: "landAssembly" },
    ];
    for (const { countryId, chamberKey } of cases) {
      // Elections were actually spawned and at least one has resolved.
      expect(
        w.elections.some((e) => e.countryId === countryId && e.chamberKey === chamberKey),
      ).toBe(true);
      expect(
        w.elections.some((e) => e.countryId === countryId && e.chamberKey === chamberKey && e.status === "resolved"),
      ).toBe(true);
      // Some seats are actually held (composition no longer fully vacant).
      const chamber = w.legislatures[countryId]!.chambers.find((c) => c.key === chamberKey)!;
      const held = Object.values(chamber.composition.seatsByParty).reduce((x, y) => x + y, 0);
      expect(held).toBeGreaterThan(0);
      expect(held + chamber.composition.vacancies).toBe(chamber.seats);
      // Politicians seated in this chamber all carry a state matching a real region.
      const seated = w.politicians.filter((p) => p.countryId === countryId && p.chamberKey === chamberKey);
      expect(seated.length).toBe(held);
      for (const p of seated) {
        expect(w.regions[p.electedState ?? ""]?.countryId).toBe(countryId);
      }
    }
  });
});
