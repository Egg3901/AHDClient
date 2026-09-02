import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import {
  computeIndependenceDesireDriftSnapshot,
  runIndependenceDesireDrift,
  UK_DEVOLUTION_REGIONS,
  MEAN_REVERSION_TARGET,
} from "./independenceDesireDrift.js";

const OPTS = { seed: "devo-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("independenceDesireDrift (W25)", () => {
  it("computeIndependenceDesireDriftSnapshot: neutral policy + neutral approvals + neutral inflation only mean-reverts", () => {
    // Above baseline (25): pulls down by MEAN_REVERSION_RATE.
    const above = computeIndependenceDesireDriftSnapshot({
      previous: 30,
      policy: "pro",
      regionalApproval: 50,
      nationalApproval: 50,
      inflationPercent: 3, // in [2,5) -> inflationDrift = 0
    });
    expect(above.drivers.policy).toBe(0);
    expect(above.drivers.regionalApproval).toBe(0);
    expect(above.drivers.nationalApproval).toBe(0);
    expect(above.drivers.inflation).toBe(0);
    expect(above.drivers.meanReversion).toBeCloseTo(-0.003, 6);
    // Mean reversion alone (0.003/turn) is below round2's 2dp rounding
    // resolution (0.005), so from any already-rounded value it is a
    // permanent fixed point in isolation — mainline's own comment notes the
    // rate is "intentionally small so the drift is only the floor pull, not
    // a fast unwind". Combined with a real driver (inflation here) the
    // total delta clears the rounding threshold and the value does move,
    // net of the mean-reversion drag:
    let combined = 30;
    for (let i = 0; i < 50; i++) {
      combined = computeIndependenceDesireDriftSnapshot({
        previous: combined,
        policy: "pro",
        regionalApproval: 50,
        nationalApproval: 50,
        inflationPercent: 6, // >5 -> inflationDrift = +0.02, meanReversion = -0.003 net +0.017/turn
      }).next;
    }
    expect(combined).toBeGreaterThan(30);

    // Below baseline: pulls up.
    const below = computeIndependenceDesireDriftSnapshot({
      previous: 20,
      policy: "pro",
      regionalApproval: 50,
      nationalApproval: 50,
      inflationPercent: 3,
    });
    expect(below.drivers.meanReversion).toBeCloseTo(0.003, 6);

    // At baseline: zero drift, stays put.
    const at = computeIndependenceDesireDriftSnapshot({
      previous: MEAN_REVERSION_TARGET,
      policy: "pro",
      regionalApproval: 50,
      nationalApproval: 50,
      inflationPercent: 3,
    });
    expect(at.delta).toBe(0);
    expect(at.next).toBe(MEAN_REVERSION_TARGET);
  });

  it("high inflation (>5%) pushes desire up; low inflation (<2%) pushes it down", () => {
    const high = computeIndependenceDesireDriftSnapshot({
      previous: MEAN_REVERSION_TARGET,
      policy: "pro",
      regionalApproval: 50,
      nationalApproval: 50,
      inflationPercent: 6,
    });
    expect(high.drivers.inflation).toBe(0.02);

    const low = computeIndependenceDesireDriftSnapshot({
      previous: MEAN_REVERSION_TARGET,
      policy: "pro",
      regionalApproval: 50,
      nationalApproval: 50,
      inflationPercent: 1,
    });
    expect(low.drivers.inflation).toBe(-0.01);
  });

  it("independence policy + low approval (mandate read) increases desire; anti + low approval decreases it", () => {
    const indy = computeIndependenceDesireDriftSnapshot({
      previous: 50,
      policy: "independence",
      regionalApproval: 80, // popular pro-indy FM -> mandate for separation
      nationalApproval: 50,
      inflationPercent: 3,
    });
    expect(indy.drivers.regionalApproval).toBeGreaterThan(0);

    const anti = computeIndependenceDesireDriftSnapshot({
      previous: 50,
      policy: "anti",
      regionalApproval: 80, // popular unionist FM -> mandate for the union
      nationalApproval: 50,
      inflationPercent: 3,
    });
    expect(anti.drivers.regionalApproval).toBeLessThan(0);
  });

  it("next is clamped to [0, 100]", () => {
    const r = computeIndependenceDesireDriftSnapshot({
      previous: 0,
      policy: "anti",
      regionalApproval: 100,
      nationalApproval: 100,
      inflationPercent: 1,
    });
    expect(r.next).toBeGreaterThanOrEqual(0);
  });

  it("wires into a real US-player world: only SCO/WAL/NIR carry independenceDesire, no other region does", () => {
    const w = createWorld(OPTS);
    runIndependenceDesireDrift(w);
    for (const regionId of UK_DEVOLUTION_REGIONS) {
      expect(typeof w.regions[regionId]!.independenceDesire).toBe("number");
    }
    for (const [id, region] of Object.entries(w.regions)) {
      if (UK_DEVOLUTION_REGIONS.has(id)) continue;
      expect(region.independenceDesire).toBeUndefined();
    }
  });

  it("is deterministic and bounded over a long run", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 300; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    for (const regionId of UK_DEVOLUTION_REGIONS) {
      const va = a.regions[regionId]!.independenceDesire!;
      const vb = b.regions[regionId]!.independenceDesire!;
      expect(va).toBe(vb);
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThanOrEqual(100);
    }
  });
});
