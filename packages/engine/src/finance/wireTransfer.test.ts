import { describe, it, expect } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { wireTransfer, DAILY_WIRE_CAP_ANCHOR, WIRE_QUOTA_WINDOW_TURNS } from "./wireTransfer.js";

const OPTS = { seed: "w35-wire-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

function samePoliticianCountry(world: ReturnType<typeof createWorld>): string {
  const target = world.politicians.find((p) => p.countryId === world.player.countryId);
  if (!target) throw new Error("fixture requires at least one same-country politician");
  return target.id;
}

describe("wireTransfer", () => {
  it("moves cash 1:1 to a same-country politician and logs news, per the wire route's core transfer", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    const target = w.politicians.find((p) => p.id === targetId)!;
    w.player.cash = 5000;
    const before = target.cash;
    const res = wireTransfer(w, targetId, 1000);
    expect(res.ok).toBe(true);
    expect(w.player.cash).toBe(4000);
    expect(target.cash).toBe(before + 1000);
    expect(w.news.some((n) => n.headline.includes("You wire"))).toBe(true);
  });

  it("rejects a cross-border wire (PORT-STUB: no per-character currency wallets)", () => {
    const w = createWorld(OPTS);
    const foreign = w.politicians.find((p) => p.countryId !== w.player.countryId);
    if (!foreign) return; // fixture has no foreign politician in this era/seed; nothing to assert
    const res = wireTransfer(w, foreign.id, 100);
    expect(res.ok).toBe(false);
  });

  it("rejects insufficient cash, unknown recipient, and invalid amounts", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.player.cash = 100;
    expect(wireTransfer(w, targetId, 1000).ok).toBe(false);
    expect(wireTransfer(w, "no-such-politician", 10).ok).toBe(false);
    for (const bad of [0, -5, 1.5, NaN, Infinity]) {
      expect(wireTransfer(w, targetId, bad).ok).toBe(false);
    }
  });

  it("enforces the daily (turn-windowed) wire quota and resets after the window", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.player.cash = DAILY_WIRE_CAP_ANCHOR * 2;

    const first = wireTransfer(w, targetId, DAILY_WIRE_CAP_ANCHOR);
    expect(first.ok).toBe(true);
    expect(w.player.wireQuotaUsedAnchor).toBe(DAILY_WIRE_CAP_ANCHOR);
    expect(w.player.wireQuotaWindowStartTurn).toBe(w.meta.turn);

    const second = wireTransfer(w, targetId, 1);
    expect(second.ok).toBe(false);

    // Advance past the window; quota should reset.
    for (let i = 0; i < WIRE_QUOTA_WINDOW_TURNS; i++) advanceTurn(w);
    const third = wireTransfer(w, targetId, 1);
    expect(third.ok).toBe(true);
    expect(w.player.wireQuotaUsedAnchor).toBe(1);
  });

  it("wires through executeAction as wireTransfer (per-action success counter increments)", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.player.actions = 10;
    const res = executeAction(w, "player", "wireTransfer", { targetPoliticianId: targetId, amount: 500 });
    expect(res.ok).toBe(true);
    expect(w.player.actionCounts["wireTransfer"]).toBe(1);
  });
});

describe("W35 wire transfer schema", () => {
  it("round-trips wireQuota fields through save/load at SCHEMA_VERSION 36", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(36);
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    wireTransfer(w, targetId, 100);
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.player.wireQuotaUsedAnchor).toBe(100);
    expect(loaded.player.wireQuotaWindowStartTurn).toBe(w.meta.turn);
    const target = loaded.politicians.find((p) => p.id === targetId)!;
    expect(target.cash).toBe(100);
  });

  it("migrates a pre-v36 save with wireQuota fields backfilled to 0/null and politician cash to 0", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00.000Z"));
    delete raw.world.player.wireQuotaUsedAnchor;
    delete raw.world.player.wireQuotaWindowStartTurn;
    for (const pol of raw.world.politicians) delete pol.cash;
    raw.world.meta.schemaVersion = 33;
    raw.schemaVersion = 33;
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.player.wireQuotaUsedAnchor).toBe(0);
    expect(loaded.player.wireQuotaWindowStartTurn).toBeNull();
    for (const pol of loaded.politicians) expect(pol.cash).toBe(0);
  });

  it("determinism: identical seeds produce identical politician cash + quota state after a wire and turns", () => {
    const mk = () => {
      const w = createWorld(OPTS);
      const targetId = samePoliticianCountry(w);
      wireTransfer(w, targetId, 250);
      return w;
    };
    const a = mk();
    const b = mk();
    for (let i = 0; i < 5; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.player.wireQuotaUsedAnchor).toBe(b.player.wireQuotaUsedAnchor);
    expect(a.politicians.map((p) => p.cash)).toEqual(b.politicians.map((p) => p.cash));
  });
});
