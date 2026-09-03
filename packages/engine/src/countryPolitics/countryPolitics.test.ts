import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import type { WorldState } from "../types.js";
import { approvalTargetFor, updateCountryPolitics } from "./overview.js";
import { getCountryPolitics, getNationalApproval } from "./selectors.js";
import { MOOD_MAX_DELTA_PER_TURN } from "./constants.js";

const OPTS = { seed: "country-politics-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

function playableIds(world: WorldState): string[] {
  return Object.values(world.countries)
    .filter((c) => c.playable)
    .map((c) => c.id)
    .sort();
}

describe("countryPolitics seed", () => {
  it("seeds an overview per playable country with a turn-0 approval sample", () => {
    const world = createWorld(OPTS);
    for (const id of playableIds(world)) {
      const overview = getCountryPolitics(world, id);
      expect(overview).toBeDefined();
      expect(overview!.approval).toBeGreaterThanOrEqual(0);
      expect(overview!.approval).toBeLessThanOrEqual(100);
      expect(overview!.legitimacy).toBeGreaterThanOrEqual(0);
      expect(overview!.unrest).toBeGreaterThanOrEqual(0);
      expect(overview!.approvalHistory).toEqual([{ turn: 0, approval: overview!.approval }]);
      expect(overview!.updatedTurn).toBe(0);
      expect(typeof overview!.governmentType).toBe("string");
    }
    expect(world.countryPolitics["US"]!.governmentType).toBe("Presidential republic");
    expect(getCountryPolitics(world, "XX")).toBeNull();
    expect(getNationalApproval(world, "US")).toBe(world.countryPolitics["US"]!.approval);
  });

  it("classifies regimes structurally: US presidential, RU/DD one-party", () => {
    const world = createWorld(OPTS);
    expect(world.countryPolitics["US"]!.regime).toBe("presidential-republic");
    expect(world.countryPolitics["RU"]!.regime).toBe("one-party");
    expect(world.countryPolitics["DD"]!.regime).toBe("one-party");
  });

  it("does not create an executive merely to populate the overview", () => {
    const world = createWorld(OPTS);
    expect(world.executives["US"]).toBeUndefined();
    expect(world.countryPolitics["US"]).toBeDefined();
  });
});

describe("countryPolitics turn evolution", () => {
  it("eases approval toward the live macro target, bounded per turn", () => {
    const world = createWorld(OPTS);
    // Boom: strong growth, full employment, on-target inflation.
    world.countries["US"]!.economy.growthRate = 0.06;
    world.countries["US"]!.economy.unemploymentRate = 0.03;
    world.countries["US"]!.economy.inflationRate = 0.02;
    const target = approvalTargetFor(world, "US");
    const before = world.countryPolitics["US"]!.approval;
    expect(target).toBeGreaterThan(before);
    updateCountryPolitics(world);
    const after = world.countryPolitics["US"]!.approval;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThanOrEqual(MOOD_MAX_DELTA_PER_TURN + 1e-9);
    expect(after).toBeLessThanOrEqual(target);
  });

  it("lowers approval under stagflation", () => {
    const world = createWorld(OPTS);
    world.countries["US"]!.economy.growthRate = -0.02;
    world.countries["US"]!.economy.unemploymentRate = 0.12;
    world.countries["US"]!.economy.inflationRate = 0.1;
    const target = approvalTargetFor(world, "US");
    const before = world.countryPolitics["US"]!.approval;
    expect(target).toBeLessThan(before);
    updateCountryPolitics(world);
    expect(world.countryPolitics["US"]!.approval).toBeLessThan(before);
  });

  it("uses the absolute-currency budget GDP when calculating fiscal approval", () => {
    const world = createWorld(OPTS);
    const economy = world.countries["US"]!.economy;
    economy.growthRate = 0.025;
    economy.unemploymentRate = 0.05;
    economy.inflationRate = 0.02;
    const budget = world.budgets["US"]!;
    budget.surplus = budget.gdp * 0.1;
    expect(approvalTargetFor(world, "US")).toBe(52);
    budget.surplus = budget.gdp * -0.1;
    expect(approvalTargetFor(world, "US")).toBe(47);
  });

  it("appends one approval sample per turn through the full pipeline", () => {
    const world = createWorld(OPTS);
    advanceTurn(world);
    advanceTurn(world);
    const history = world.countryPolitics["US"]!.approvalHistory;
    expect(history.map((s) => s.turn)).toEqual([0, 1, 2]);
    expect(world.countryPolitics["US"]!.updatedTurn).toBe(2);
  });

});

describe("countryPolitics determinism", () => {
  it("identical seeds produce identical overviews, before and after turns", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    expect(a.countryPolitics).toEqual(b.countryPolitics);
    expect(a.executives).toEqual(b.executives);
    for (let i = 0; i < 3; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.countryPolitics).toEqual(b.countryPolitics);
    expect(a).toEqual(b);
  });
});

describe("countryPolitics save migration (v43)", () => {
  it("backfills countryPolitics on a v42 save and stamps v43", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, "2026-09-03T00:00:00Z")) as {
      schemaVersion: number;
      world: Record<string, unknown> & { meta: { schemaVersion: number } };
    };
    delete raw.world["countryPolitics"];
    delete (raw.world["player"] as Record<string, unknown>)["homeRegionId"];
    raw.schemaVersion = 42;
    raw.world.meta.schemaVersion = 42;
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.meta.schemaVersion).toBe(43);
    expect(migrated.player.homeRegionId).toBeNull();
    const overview = migrated.countryPolitics["US"]!;
    expect(overview.approvalHistory).toEqual([{ turn: 0, approval: overview.approval }]);
    expect(overview.regime).toBe("presidential-republic");
    // Executives are honestly untouched by the migration.
    expect(migrated.executives["US"]).toEqual(world.executives["US"]);
  });

  it("rejects a current-version save with a corrupt countryPolitics entry", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, "2026-09-03T00:00:00Z")) as {
      world: { countryPolitics: Record<string, { approval: unknown }> };
    };
    raw.world.countryPolitics["US"]!.approval = Number.NaN;
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/countryPolitics/);
  });

  it("rejects a political overview stored under the wrong country key", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, "2026-09-03T00:00:00Z")) as {
      world: { countryPolitics: Record<string, { countryId: string }> };
    };
    raw.world.countryPolitics["US"]!.countryId = "UK";
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/countryId/);
  });

  it("round-trips the overview losslessly", () => {
    const world = createWorld(OPTS);
    advanceTurn(world);
    const restored = deserializeSave(serializeSave(world, "2026-09-03T00:00:00Z"));
    expect(restored.countryPolitics).toEqual(world.countryPolitics);
  });
});
