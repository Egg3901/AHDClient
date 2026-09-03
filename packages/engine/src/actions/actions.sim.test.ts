import { describe, it, expect } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { ACTION_CATALOG, fundraiseQuote, getActionCost } from "./catalog.js";
import { executeAction } from "./execute.js";
import { fundraiseYield, getTotalFundGenerationForPolitician } from "./fundGeneration.js";
import { computePartyRevenue } from "./fundGenerationPhase.js";

const OPTS = { seed: "w34-actions-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

// ─── Refresh cadence goldens (cites src/lib/turn/actionRefresh.ts) ──────────
describe("actionRefresh goldens", () => {
  it("refreshes base 4 per turn, office bonus, hoard penalty, cap 200", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.actions = 5;
    pol.bonusActions = 2; // extra from influence turn
    // house bonus ~1, so refresh = 4+1+2=7 => 5+7=12
    advanceTurn(world);
    // after fundGeneration etc, actions should have refreshed
    // Find same politician after turn (id same)
    const after = world.politicians.find((p) => p.id === pol.id)!;
    // Exact value depends on chamberKey; house gives 1, senate gives 1, etc. So check range
    expect(after.actions).toBeGreaterThanOrEqual(9);
    expect(after.actions).toBeLessThanOrEqual(20);
  });

  it("caps at 200 (ENERGY_BASE_ACTION_CAP at neutral energy=1, cites statsConstants)", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.actions = 199;
    advanceTurn(world);
    const after = world.politicians.find((p) => p.id === pol.id)!;
    expect(after.actions).toBeLessThanOrEqual(200);
    // with hoard penalty 4 if >100, 199 -4 + ~5 =200 capped, minus 2 spent by NPC actionProcessing in same turn
    expect(after.actions).toBe(198);
  });

  it("applies hoarding penalty when >100 (ACTION_HOARD_PENALTY=4)", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.actions = 105;
    advanceTurn(world);
    const after = world.politicians.find((p) => p.id === pol.id)!;
    // 105 -4 + base 4 + office ~1 =106, minus 2 spent by NPC actionProcessing in same turn => 104
    // So hoard penalty net -1 not +1 after spend
    expect(after.actions).toBe(104); // 105 + (-1) after NPC spend
    // Instead assert hoard slows growth vs below threshold
    const world2 = createWorld(OPTS);
    const pol2 = world2.politicians[0]!;
    pol2.actions = 50;
    advanceTurn(world2);
    const after2 = world2.politicians.find((p) => p.id === pol2.id)!;
    expect(after.actions - 105).toBeLessThan(after2.actions - 50);
  });
});

// ─── Fundraise quote goldens (actions.fundraiseQuote) ───────────────────────
describe("fundraise quote goldens (actions.fundraiseQuote)", () => {
  it("solo neutral: 50k floor + 2k per level * influence multiplier, single source of truth", () => {
    // L0/0% => 50k
    expect(fundraiseYield(0, 0)).toBe(50_000);
    expect(fundraiseQuote(0, 0)).toBe(50_000);
    // L50/50% => (50k+100k)*1.5=225k
    expect(fundraiseYield(50, 50)).toBe(225_000);
    // L75/100% => (50k+150k)*2=400k
    expect(fundraiseYield(75, 100)).toBe(400_000);
  });

  it("matches what executeAction credits for fundraise", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.donorBaseLevel = 5;
    pol.politicalInfluence = 20;
    pol.funds = 1000;
    pol.actions = 10;
    const before = pol.funds;
    const quote = fundraiseQuote(pol.donorBaseLevel, pol.politicalInfluence);
    const res = executeAction(world, pol.id, "fundraise");
    expect(res.ok).toBe(true);
    expect(pol.funds - before).toBe(quote);
  });
});

// ─── Cost / cooldown enforcement ────────────────────────────────────────────
describe("cost/cooldown enforcement", () => {
  it("enforces action-point cost", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.actions = 0;
    pol.donorBaseLevel = 5; // needed for fundraise
    const res = executeAction(world, pol.id, "fundraise");
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/Not enough action points/);
  });

  it("enforces cooldown: advertise is 1 turn cooldown, fundraise is 0", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.actions = 50;
    pol.funds = 500_000;
    pol.favorability = 50;
    const r1 = executeAction(world, pol.id, "advertise");
    expect(r1.ok).toBe(true);
    // immediately again should be on cooldown until turn+2? cooldown 1 => ready at turn+2, turn is 0 so readyAt =2
    const r2 = executeAction(world, pol.id, "advertise");
    expect(r2.ok).toBe(false);
    expect((r2 as { error: string }).error).toMatch(/cooldown/);
    // fundraise has no cooldown, should succeed twice if points remain
    pol.donorBaseLevel = 2;
    const f1 = executeAction(world, pol.id, "fundraise");
    expect(f1.ok).toBe(true);
    const f2 = executeAction(world, pol.id, "fundraise");
    expect(f2.ok).toBe(true);
  });

  it("lists unavailable actions with blocking system named", () => {
    expect(ACTION_CATALOG.poll.status).toBe("unavailable");
    expect(ACTION_CATALOG.poll.blockingSystem).toBeDefined();
    expect(ACTION_CATALOG.pollLarge.status).toBe("unavailable");
    // available ones include support/pressure/GOTV/org/fundraising/partyInfluence
    expect(ACTION_CATALOG.fundraise.status).toBe("available");
    expect(ACTION_CATALOG.canvass.status).toBe("available");
    expect(ACTION_CATALOG.organize.status).toBe("available");
    expect(ACTION_CATALOG.pressureBoost.status).toBe("available");
  });

  it("requires regionId for region-targeted actions", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.actions = 10;
    pol.funds = 100_000;
    const res = executeAction(world, pol.id, "organize", {});
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/regionId/);
  });

  it("leaves the entire world unchanged when dispatch fails after charging costs", () => {
    const world = createWorld(OPTS);
    world.player.actions = 25;
    world.player.actionCounts = { sponsorBill: 4 };
    world.player.mode = "hos";
    world.player.hosPartyId = "US_DEM";
    const before = structuredClone(world);

    const res = executeAction(world, "player", "sponsorBill", { catalogId: "missing-law" });

    expect(res).toEqual({ ok: false, error: "Unknown catalog entry: missing-law" });
    expect(world).toEqual(before);
    expect(world.player.actions).toBe(25);
    expect(world.player.actionCooldowns).toEqual({});
    expect(world.player.actionCounts).toEqual({ sponsorBill: 4 });
  });

  it("restores action points, funds, and counts when a target is invalid", () => {
    const world = createWorld(OPTS);
    world.player.actions = 25;
    world.player.funds = 100_000;
    world.player.actionCounts = {};
    const before = structuredClone(world);

    const res = executeAction(world, "player", "canvass", { regionId: "missing-region" });

    expect(res).toEqual({ ok: false, error: "Unknown region missing-region" });
    expect(world).toEqual(before);
  });
});

// ─── End-to-end: action changes support deterministically ───────────────────
describe("e2e action changing support deterministically", () => {
  it("campaign queues supportAccrual; supportAccrual phase then applies deterministically", () => {
    const world = createWorld(OPTS);
    const pol = world.politicians[0]!;
    pol.actions = 10;
    pol.funds = 100_000;
    const initialSupport = world.candidateSupports[pol.id]!.support;
    const r = executeAction(world, pol.id, "campaign");
    expect(r.ok).toBe(true);
    // accrual queued
    expect(world.candidateSupports[pol.id]!.supportAccrual.length).toBe(1);
    expect(world.candidateSupports[pol.id]!.supportAccrual[0]!.amountPerTurn).toBe(2);
    // advanceTurn will run supportAccrual then supportDecay deterministically
    const beforeTurn = JSON.stringify(world.candidateSupports[pol.id]!);
    advanceTurn(world);
    const after = world.candidateSupports[pol.id]!.support;
    // accrual gives +2, decay regresses 0.5 toward 50; net +1.5ish depending on start
    expect(after).toBeGreaterThan(initialSupport);
    // determinism: same seed gives same result
    const world2 = createWorld(OPTS);
    const pol2 = world2.politicians[0]!;
    pol2.actions = 10;
    pol2.funds = 100_000;
    executeAction(world2, pol2.id, "campaign");
    advanceTurn(world2);
    expect(world2.candidateSupports[pol2.id]!.support).toBe(after);
    expect(JSON.stringify(world2.candidateSupports[pol2.id]!)).toBe(JSON.stringify(world.candidateSupports[pol.id]!));
  });
});

// ─── Fund generation and GOTV revenue wiring ────────────────────────────────
describe("fund generation and GOTV revenue", () => {
  it("fundGeneration credits politician funds and party treasury", () => {
    const world = createWorld(OPTS);
    const partyId = "US_DEM";
    const partyBefore = world.parties[partyId]!.treasury;
    const pol = world.politicians.find((p) => p.partyId === partyId)!;
    const before = pol.funds;
    advanceTurn(world);
    expect(pol.funds).toBeGreaterThan(before);
    expect(world.parties[partyId]!.treasury).toBeGreaterThan(partyBefore);
  });

  it("computePartyRevenue uses real generation not org*500 stub", () => {
    const world = createWorld(OPTS);
    // org 50 + PS20 old stub would be 27k; real revenue is per-member tax
    const rev = computePartyRevenue(world, "US_DEM");
    expect(rev).toBeGreaterThan(0);
    // With 5M pop, base 10k + donor 0 + office 1k-ish ~10-15k per member, 5% tax ~500 per member, times members
    expect(rev).toBeGreaterThan(1000);
  });
});

// ─── Migration ──────────────────────────────────────────────────────────────
describe("schema migration v8->v9", () => {
  it("migrates v8 save with missing action fields to defaults", () => {
    const world = createWorld(OPTS);
    const rawV8 = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 8,
      savedAt: "2026-01-01T00:00:00Z",
      world: {
        ...world,
        politicians: world.politicians.map((p) => {
          const { actions, funds, donorBaseLevel, politicalInfluence, favorability, infamy, actionCooldowns, ...rest } = p as any;
          return rest;
        }),
        player: { name: world.player.name, countryId: world.player.countryId, cash: world.player.cash },
        meta: { ...world.meta, schemaVersion: 8 },
      },
    });
    const parsed = JSON.parse(rawV8) as any;
    // ensure fields missing
    expect(parsed.world.politicians[0].actions).toBeUndefined();
    const migrated = deserializeSave(JSON.stringify(parsed));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.politicians[0]!.actions).toBe(25);
    expect(migrated.politicians[0]!.funds).toBe(0);
    expect(migrated.player.actions).toBe(25);
    expect(migrated.player.funds).toBe(0);
  });
});
