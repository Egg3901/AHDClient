import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { isRecurringDue, isWindowDue, isScheduleDue, windowGapTurns } from "./scheduler.js";
import { applyEffects } from "./effects.js";
import { WORLD_EVENTS, PLAYER_RANDOM_EVENTS } from "./catalog.js";
import { tickDecayFactor, applyCrisisEffects, CRISIS_TEMPLATES } from "./crisis.js";

// ── Scheduler cadence goldens ──────────────────────────────────────────
// Source: src/lib/events/worldEvents/scheduler.ts

describe("scheduler cadence goldens", () => {
  it("isRecurringDue fires at offset multiples", () => {
    expect(isRecurringDue(12, { everyTurns: 48, offsetTurns: 12 })).toBe(true);
    expect(isRecurringDue(60, { everyTurns: 48, offsetTurns: 12 })).toBe(true);
    expect(isRecurringDue(11, { everyTurns: 48, offsetTurns: 12 })).toBe(false);
    expect(isRecurringDue(0, { everyTurns: 48, offsetTurns: 12 })).toBe(false);
    expect(isRecurringDue(0, { everyTurns: 10, offsetTurns: 0 })).toBe(true);
  });

  it("windowGapTurns is deterministic and within [min,max]", () => {
    const schedule = { minGapTurns: 6, maxGapTurns: 16 };
    const g1 = windowGapTurns("US", "worldEvents.sportsVictory", 0, schedule);
    const g2 = windowGapTurns("US", "worldEvents.sportsVictory", 0, schedule);
    expect(g1).toBe(g2);
    expect(g1).toBeGreaterThanOrEqual(6);
    expect(g1).toBeLessThanOrEqual(16);
    // Different lastFired changes gap (at least one of 20 probes differs)
    const probes = Array.from({ length: 20 }, (_, i) => windowGapTurns("US", "worldEvents.sportsVictory", i, schedule));
    expect(new Set(probes).size).toBeGreaterThan(1);
  });

  it("isWindowDue true when never fired, then respects gap", () => {
    const schedule = { minGapTurns: 20, maxGapTurns: 40 };
    expect(isWindowDue(1, "UK", "worldEvents.royalEvent", undefined, schedule)).toBe(true);
    const gap = windowGapTurns("UK", "worldEvents.royalEvent", 100, schedule);
    expect(isWindowDue(100 + gap - 1, "UK", "worldEvents.royalEvent", 100, schedule)).toBe(false);
    expect(isWindowDue(100 + gap, "UK", "worldEvents.royalEvent", 100, schedule)).toBe(true);
  });

  it("isScheduleDue dispatches on kind", () => {
    expect(isScheduleDue(12, "US", "worldEvents.olympics", undefined, { kind: "recurring", everyTurns: 48, offsetTurns: 12 })).toBe(true);
    expect(isScheduleDue(1, "UK", "worldEvents.royalEvent", undefined, { kind: "window", minGapTurns: 24, maxGapTurns: 48 })).toBe(true);
  });

  it("worldEvents catalog count: 20 kinds, no invented, schedules cited", () => {
    expect(WORLD_EVENTS.length).toBe(20);
    const kinds = new Set(WORLD_EVENTS.map((e) => e.kind));
    expect(kinds.size).toBe(20);
    // Every entry except olympics/worldsFair has window; those two are recurring (global host)
    const recurring = WORLD_EVENTS.filter((e) => e.schedule?.kind === "recurring");
    expect(recurring.length).toBe(2);
    expect(recurring.map((e) => e.kind).sort()).toEqual(["worldEvents.olympics", "worldEvents.worldsFair"]);
  });

  it("player random events catalog: 12 kinds, eligibility cited", () => {
    expect(PLAYER_RANDOM_EVENTS.length).toBe(12);
    // Must include specific mainline kinds
    const kinds = PLAYER_RANDOM_EVENTS.map((e) => e.kind);
    expect(kinds).toContain("pree.lostWallet");
    expect(kinds).toContain("pree.volunteerFirefighter");
  });
});

// ── Effect application goldens with citations ──────────────────────────
// Sources: src/lib/budget/treasurySpend.ts, src/lib/events/substrate/countryModifiers.ts,
//          src/lib/events/substrate/applyEffects.ts, commodity prices

describe("effect application goldens", () => {
  it("treasuryDelta modifies budget treasuryBalance (src/lib/budget/treasurySpend.ts)", () => {
    const world = createWorld({ seed: "fx-budget", playerName: "P", countryId: "US", era: "1953" });
    const before = world.budgets["US"]!.treasuryBalance;
    const { applied } = applyEffects(world, "US", [{ type: "treasuryDelta", delta: 5000 }], 1);
    expect(applied).toBe(1);
    expect(world.budgets["US"]!.treasuryBalance).toBe(before + 5000);
  });

  it("treasuryDelta negative spends from treasury", () => {
    const world = createWorld({ seed: "fx-budget2", playerName: "P", countryId: "US", era: "1953" });
    const before = world.budgets["US"]!.treasuryBalance;
    applyEffects(world, "US", [{ type: "treasuryDelta", delta: -3000 }], 1);
    expect(world.budgets["US"]!.treasuryBalance).toBe(before - 3000);
  });

  it("sectorDemandModifier writes activeWorldModifiers and nudges commodity price (countryModifiers.ts)", () => {
    const world = createWorld({ seed: "fx-commodity", playerName: "P", countryId: "US", era: "1953" });
    const beforeLen = world.activeWorldModifiers.length;
    // Use a known commodity type
    const { applied } = applyEffects(world, "US", [{ type: "sectorDemandModifier", sectorType: "steel", pct: 4, durationTurns: 6 }], 5);
    expect(applied).toBe(1);
    expect(world.activeWorldModifiers.length).toBe(beforeLen + 1);
    const mod = world.activeWorldModifiers[world.activeWorldModifiers.length - 1]!;
    expect(mod.sectorType).toBe("steel");
    expect(mod.expiresAtTurn).toBe(11);
    expect(world.commodityPrices["steel"]!.globalPrice).toBeGreaterThan(world.commodityPrices["steel"]!.basePrice);
  });

  it("favorability clamps to [0,100] via clampStat (applyEffects.ts)", () => {
    const world = createWorld({ seed: "fx-fav", playerName: "P", countryId: "US", era: "1953" });
    world.player.favorability = 99;
    applyEffects(world, "US", [{ type: "favorability", delta: 5 }], 1);
    expect(world.player.favorability).toBe(100);
    applyEffects(world, "US", [{ type: "favorability", delta: -200 }], 1);
    expect(world.player.favorability).toBe(0);
  });

  it("partyOrg bumps party.organization (partyOrgTurn)", () => {
    const world = createWorld({ seed: "fx-org", playerName: "P", countryId: "US", era: "1953" });
    const before = world.parties["US_DEM"]!.organization;
    applyEffects(world, "US", [{ type: "partyOrg", delta: 10 }], 1);
    expect(world.parties["US_DEM"]!.organization).toBe(before + 10);
  });

  it("gdpDelta and inflationDelta mutate economy fields (economicModelTurn)", () => {
    const world = createWorld({ seed: "fx-econ", playerName: "P", countryId: "US", era: "1953" });
    const gdpBefore = world.countries["US"]!.economy.gdp;
    applyEffects(world, "US", [{ type: "gdpDelta", delta: -1 }], 1);
    expect(world.countries["US"]!.economy.gdp).toBeLessThan(gdpBefore);
    const inflBefore = world.countries["US"]!.economy.inflationRate;
    applyEffects(world, "US", [{ type: "inflationDelta", delta: 1 }], 1);
    expect(world.countries["US"]!.economy.inflationRate).toBeGreaterThan(inflBefore);
  });

  it("PORT-STUB effects return stubbed with blocker named (unported systems)", () => {
    const world = createWorld({ seed: "fx-stub", playerName: "P", countryId: "US", era: "1953" });
    const { stubbed, stubs } = applyEffects(world, "US", [{ type: "approvalDelta", delta: 5 }], 1);
    expect(stubbed).toBe(1);
    expect(stubs[0]).toContain("governmentApprovals");
    const { stubbed: s2, stubs: t2 } = applyEffects(world, "US", [{ type: "civilLibertiesDelta", delta: -2 }], 1);
    expect(s2).toBe(1);
    expect(t2[0]).toContain("civilLiberties");
  });

  it("supportDelta bumps candidateSupports (support model)", () => {
    const world = createWorld({ seed: "fx-support", playerName: "P", countryId: "US", era: "1953" });
    // Add a candidate support entry for US
    world.candidateSupports["US-1"] = { id: "US-1", partyId: "US_DEM", countryId: "US", support: 50, supportAccrual: [], status: "active" };
    applyEffects(world, "US", [{ type: "supportDelta", delta: 5 }], 1);
    expect(world.candidateSupports["US-1"]!.support).toBe(55);
  });
});

// ── Crisis lifecycle ───────────────────────────────────────────────────

describe("crisis lifecycle", () => {
  it("tickDecayFactor linear ramp 1.0 at onset to 0 at expiry (crisisTurn.ts)", () => {
    expect(tickDecayFactor(0, 0, 10)).toBe(1);
    expect(tickDecayFactor(5, 0, 10)).toBe(0.5);
    expect(tickDecayFactor(10, 0, 10)).toBe(0);
    expect(tickDecayFactor(11, 0, 10)).toBe(0);
    expect(tickDecayFactor(0, 0, null)).toBe(1);
  });

  it("applyCrisisEffects tick scales, flat only at startTurn", () => {
    const world = createWorld({ seed: "crisis-eff", playerName: "P", countryId: "US", era: "1953" });
    const gdpBefore = world.countries["US"]!.economy.gdp;
    const crisis: (typeof world.crises)[number] = {
      id: "c1",
      kind: "crisis.hurricane",
      name: "Hurricane",
      description: "x",
      scope: "country",
      countryIds: ["US"],
      startTurn: 1,
      durationTurns: 6,
      effects: [
        { type: "gdpLoss", value: 0.02, effectType: "flat" },
        { type: "gdpGrowth", value: -1.5, effectType: "tick" },
      ],
      status: "active",
      wireMessageOnStart: "start",
      wireMessageOnEnd: "end",
      playerResponse: null,
    };
    // At startTurn, both flat and tick apply
    applyCrisisEffects(world, crisis, 1);
    expect(world.countries["US"]!.economy.gdp).toBeLessThan(gdpBefore);
    const growthAfter1 = world.countries["US"]!.economy.growthRate;
    // At mid, tick at 0.5
    world.countries["US"]!.economy.growthRate = 0.03;
    const g2 = 0.03;
    applyCrisisEffects(world, crisis, 4); // elapsed 3, duration 6 => scale 0.5
    // Should have moved growthRate down by 1.5*0.5/100 = 0.0075
    expect(world.countries["US"]!.economy.growthRate).toBeCloseTo(g2 - 0.0075, 6);
    // At turn beyond start, flat not applied again
    const gdpMid = world.countries["US"]!.economy.gdp;
    applyCrisisEffects(world, crisis, 2);
    // gdpLoss flat only at startTurn, so no further gdpLoss at turn 2 (only tick)
    // tick doesn't affect gdpLoss, so gdp unchanged except via growthRate path (which doesn't mutate gdp directly)
    // So gdp should stay same (tick affects growthRate, not gdp multiplier)
    expect(world.countries["US"]!.economy.gdp).toBe(gdpMid);
  });

  it("crisis turn spawns and resolves deterministically (advanceTurn)", () => {
    const world = createWorld({ seed: "crisis-spawn", playerName: "P", countryId: "US", era: "1953" });
    // Force a banking crisis manually and check lifecycle via advanceTurn
    world.crises.push({
      id: "manual-1",
      kind: "crisis.bankingCrisis",
      name: "Banking Crisis",
      description: "x",
      scope: "country",
      countryIds: ["US"],
      startTurn: 2,
      durationTurns: 3,
      effects: [{ type: "gdpGrowth", value: -2.5, effectType: "tick" }],
      status: "active",
      wireMessageOnStart: "Banking crisis erupted",
      wireMessageOnEnd: "Banking crisis eased",
      playerResponse: null,
    });
    // advance to turn 2: crisis should be active, not yet resolved
    advanceTurn(world); // turn 1
    advanceTurn(world); // turn 2 startTurn
    expect(world.crises[0]!.status).toBe("active");
    advanceTurn(world); // 3
    advanceTurn(world); // 4
    advanceTurn(world); // 5 => turn 5 >= 2+3 => resolved
    expect(world.crises[0]!.status).toBe("resolved");
    expect(world.crises[0]!.endTurn).toBe(5);
    expect(world.news.some((n) => n.headline.includes("Banking crisis eased"))).toBe(true);
  });

  it("crisis action hooks shorten duration via action catalog (W34 hooks)", async () => {
    const world = createWorld({ seed: "crisis-action", playerName: "P", countryId: "US", era: "1953" });
    // Make player have actions/funds and join not needed
    world.player.funds = 100000;
    world.player.actions = 25;
    world.player.partyId = "US_DEM";
    world.crises.push({
      id: "c-bail",
      kind: "crisis.bankingCrisis",
      name: "Banking Crisis",
      description: "x",
      scope: "country",
      countryIds: ["US"],
      startTurn: 0,
      durationTurns: 8,
      effects: [{ type: "gdpGrowth", value: -2.5, effectType: "tick" }],
      status: "active",
      wireMessageOnStart: "start",
      wireMessageOnEnd: "end",
      playerResponse: null,
    });
    const { executeAction } = await import("../actions/execute.js");
    const before = world.crises[0]!.durationTurns;
    const res = executeAction(world, "player", "crisisBailout", {});
    expect(res.ok).toBe(true);
    expect(world.crises[0]!.durationTurns).toBe(before! - 3);
    expect(world.crises[0]!.playerResponse).toBe("bailout");
    // Second response fails
    world.player.actions = 25;
    const res2 = executeAction(world, "player", "crisisBailout", {});
    expect(res2.ok).toBe(false);
  });
});

// ── Determinism ────────────────────────────────────────────────────────

describe("determinism", () => {
  it("identical seeds produce identical worlds after 50 turns", () => {
    const a = createWorld({ seed: "det-seed", playerName: "P", countryId: "US", era: "1953" });
    const b = createWorld({ seed: "det-seed", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("news feed is deterministic for same seed", () => {
    const a = createWorld({ seed: "news-det", playerName: "P", countryId: "US", era: "1953" });
    const b = createWorld({ seed: "news-det", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 100; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.news.map((n) => n.headline)).toEqual(b.news.map((n) => n.headline));
    expect(a.crises.map((c) => c.id)).toEqual(b.crises.map((c) => c.id));
  });
});

// ── Migration ──────────────────────────────────────────────────────────

describe("migration", () => {
  it("v25 -> v27 chained migration adds W31 fields and bumps to 27", () => {
    const world = createWorld({ seed: "mig", playerName: "P", countryId: "US", era: "1953" });
    const v25 = structuredClone(world) as unknown as Record<string, unknown>;
    v25["meta"] = { ...world.meta, schemaVersion: 25 };
    delete v25["worldEventLedger"];
    delete v25["activeWorldModifiers"];
    delete v25["crises"];
    delete v25["playerEventLog"];
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 25, savedAt: "2026-01-01T00:00:00Z", world: v25 });
    const migrated = deserializeSave(raw);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.worldEventLedger).toEqual({});
    expect(migrated.activeWorldModifiers).toEqual([]);
    expect(migrated.crises).toEqual([]);
    expect(migrated.playerEventLog).toEqual([]);
  });

  it("latest save round-trips losslessly (serialize/deserialize idempotent)", () => {
    const world = createWorld({ seed: "roundtrip", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 5; i++) advanceTurn(world);
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const a = deserializeSave(raw);
    const b = deserializeSave(raw);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.meta.schemaVersion).toBe(31);
  });
});

// ── 200-turn run: news feed no longer near-empty (ledger finding) ─────

describe("200-turn ledger finding", () => {
  it("news feed is no longer near-empty after 200 turns (world events + player events + crises)", () => {
    const world = createWorld({ seed: "ledger-200", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 200; i++) advanceTurn(world);
    // Before W31, news was ~1-5 items (only era transition + occasional NPC bill news).
    // After W31, expected >70 items for 200 turns (worldEvents + playerRandomEvents + crises).
    // Assert comfortably above near-empty to catch regression to MMO-style wire silence.
    expect(world.news.length).toBeGreaterThan(70);
    // Also assert worldEventLedger was populated and playerEventLog non-empty
    const ledgerKeys = Object.keys(world.worldEventLedger).length;
    expect(ledgerKeys).toBeGreaterThan(0);
    expect(world.playerEventLog.length).toBeGreaterThan(10);
    // Crises should have spawned at least once in 200 turns (2% hazard)
    const totalCrises = world.crises.length;
    expect(totalCrises).toBeGreaterThan(0);
  });
});
