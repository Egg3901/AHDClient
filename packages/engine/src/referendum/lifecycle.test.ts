import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { resolveReferendumVote, runReferendumLifecycle } from "./lifecycle.js";
import type { ReferendumRecord } from "./types.js";
import { rngFromState } from "../rng.js";

const OPTS = { seed: "referendum-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("resolveReferendumVote (W25, verbatim port)", () => {
  it("passes above 50% and fails at/below, after variance swing", () => {
    const passes = resolveReferendumVote({ yesShare: 60, varianceRoll: 0 });
    expect(passes.passed).toBe(true);
    expect(passes.finalYesShare).toBe(60);

    const fails = resolveReferendumVote({ yesShare: 40, varianceRoll: 0 });
    expect(fails.passed).toBe(false);

    const atThreshold = resolveReferendumVote({ yesShare: 50, varianceRoll: 0 });
    expect(atThreshold.passed).toBe(false); // strictly > 50
  });

  it("clamps varianceRoll to [-1,1] and yesShare/finalYesShare to [0,100]", () => {
    const r = resolveReferendumVote({ yesShare: 99, varianceRoll: 5 });
    expect(r.finalYesShare).toBe(100); // 99 + clamp(5,-1,1)*4 = 99+4 = 103 -> clamped 100
    const r2 = resolveReferendumVote({ yesShare: 1, varianceRoll: -5 });
    expect(r2.finalYesShare).toBe(0);
  });

  it("turnout rises with how polarised the result is", () => {
    const close = resolveReferendumVote({ yesShare: 50.5, varianceRoll: 0 });
    const polarised = resolveReferendumVote({ yesShare: 95, varianceRoll: 0 });
    expect(polarised.turnout).toBeGreaterThan(close.turnout);
  });
});

describe("runReferendumLifecycle (W25)", () => {
  function pollingReferendum(yesShare: number): ReferendumRecord {
    return {
      id: "ref-test-1",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      yesShare,
      requestedTurn: 0,
      grantedTurn: 0,
    };
  }

  it("only advances records in 'polling' status; others are untouched", () => {
    const w = createWorld(OPTS);
    const untouched: ReferendumRecord = { ...pollingReferendum(70), status: "campaigning", id: "ref-untouched" };
    w.referendums.push(untouched);
    const rng = rngFromState(w.meta.rng);
    runReferendumLifecycle(w, rng);
    expect(w.referendums.find((r) => r.id === "ref-untouched")!.status).toBe("campaigning");
  });

  it("a high-yesShare referendum resolves to 'actuating' (passed) deterministically for a fixed rng draw", () => {
    const w = createWorld(OPTS);
    w.referendums.push(pollingReferendum(90));
    const rng = rngFromState(w.meta.rng);
    runReferendumLifecycle(w, rng);
    const ref = w.referendums.find((r) => r.id === "ref-test-1")!;
    expect(ref.status).toBe("actuating");
    expect(ref.passed).toBe(true);
    expect(ref.resolvedTurn).toBe(w.meta.turn);
    expect(w.news.some((n) => n.headline.includes("Yes"))).toBe(true);
  });

  it("a low-yesShare referendum resolves to 'settled' (failed)", () => {
    const w = createWorld(OPTS);
    w.referendums.push(pollingReferendum(10));
    const rng = rngFromState(w.meta.rng);
    runReferendumLifecycle(w, rng);
    const ref = w.referendums.find((r) => r.id === "ref-test-1")!;
    expect(ref.status).toBe("settled");
    expect(ref.passed).toBe(false);
  });

  it("is wired into advanceTurn and deterministic across two identical-seed worlds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    a.referendums.push(pollingReferendum(55));
    b.referendums.push(pollingReferendum(55));
    advanceTurn(a);
    advanceTurn(b);
    expect(JSON.stringify(a.referendums)).toBe(JSON.stringify(b.referendums));
  });
});
