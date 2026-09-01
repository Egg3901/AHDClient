import { describe, expect, it } from "vitest";
import { getMediaFavPerTurn, getOppoDrainPerTurn } from "./opsEffects.js";

const off = { starter: false, a: 0, b: 0, c: 0 };

describe("opsEffects (src/lib/campaigns/opsEffects.ts port, media + oppo only)", () => {
  it("getMediaFavPerTurn: 0 when unstarted", () => {
    expect(getMediaFavPerTurn({ mediaSpendingTree: off })).toBe(0);
  });

  it("getMediaFavPerTurn: starter + Broadcast(a) + Television(b)", () => {
    // starter 0.5 + Broadcast L2 1.0 + Television L1 0.3 = 1.8
    const fav = getMediaFavPerTurn({ mediaSpendingTree: { starter: true, a: 2, b: 1, c: 0 } });
    expect(fav).toBeCloseTo(1.8, 10);
  });

  it("getOppoDrainPerTurn: 0 when unstarted", () => {
    expect(getOppoDrainPerTurn({ oppositionResearchTree: off })).toBe(0);
  });

  it("getOppoDrainPerTurn: (starter + Dossier) amplified by Counter-Intel", () => {
    // starter 0.5 + Dossier(a) L2 1.0 = 1.5; Counter-Intel(c) L1 +20% -> *1.2
    const drain = getOppoDrainPerTurn({ oppositionResearchTree: { starter: true, a: 2, b: 0, c: 1 } });
    expect(drain).toBeCloseTo(1.5 * 1.2, 10);
  });
});
