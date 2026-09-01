import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { SaveFile } from "../save.js";
import { TURN_PHASES } from "../phases/registry.js";
import { rngFromState } from "../rng.js";
import type { WorldState } from "../types.js";

const OPTS = { seed: "campaign-integration", playerName: "Tester", countryId: "US", era: "1953" } as const;

const NEW_CAMPAIGN_PHASE_NAMES = new Set([
  "campaignSpendReset",
  "campaignTurn",
  "campaignPartySubsidy",
  "campaignNpcInvestment",
]);

/** Runs `count` turns through a filtered phase list — mirrors engine.ts advanceTurn exactly. */
function runFilteredTurns(world: WorldState, count: number, excludeNames: Set<string>): void {
  const phases = TURN_PHASES.filter((p) => !excludeNames.has(p.name));
  for (let i = 0; i < count; i++) {
    const rng = rngFromState(world.meta.rng);
    for (const phase of phases) phase.run(world, rng);
    world.meta.rng = rng.state();
  }
}

function totalTreasury(world: WorldState): number {
  return Object.values(world.parties)
    .filter((p) => p.countryId === "US")
    .reduce((sum, p) => sum + p.treasury, 0);
}

describe("campaign cluster — 100-turn integration (W26)", () => {
  it("creates campaigns for active US house/senate candidates and NPC campaigns actually spend", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 100; i++) advanceTurn(w);

    const campaigns = Object.values(w.campaigns);
    expect(campaigns.length).toBeGreaterThan(0);
    // Every campaign is for a US house/senate/president race — W24 wires the
    // president into campaign eligibility (mirrors mainline's isDirectElection).
    for (const c of campaigns) {
      expect(c.countryId).toBe("US");
      expect(["house", "senate", "president"]).toContain(c.electionType);
    }

    const nppCampaigns = campaigns.filter((c) => c.candidateIsNPP);
    const totalSpent = nppCampaigns.reduce((s, c) => s + c.totalFundsSpent, 0);
    const totalGenerated = nppCampaigns.reduce((s, c) => s + c.totalFundsGenerated, 0);
    expect(nppCampaigns.length).toBeGreaterThan(0);
    // Real spend happened: maintenance + upgrade purchases (npcInvestment.ts) paid out real money.
    expect(totalSpent).toBeGreaterThan(0);
    expect(totalGenerated).toBeGreaterThan(0);
    // At least one NPC campaign actually unlocked a lever (proof npcInvestment bought something,
    // not just paid maintenance on an empty tree).
    expect(nppCampaigns.some((c) => c.fundraisingTree.starter || c.mediaSpendingTree.starter)).toBe(true);

    console.log(
      `[W26 evidence] 100 turns, ${nppCampaigns.length} NPC campaigns: ` +
        `totalFundsGenerated=${totalGenerated}, totalFundsSpent=${totalSpent}`,
    );
  });

  it("treasury sink: party treasuries end lower over 100 turns with the campaign cluster active than without it", () => {
    const withCampaigns = createWorld(OPTS);
    const withoutCampaigns = createWorld(OPTS);

    const treasuryBefore = totalTreasury(withCampaigns);
    expect(treasuryBefore).toBe(totalTreasury(withoutCampaigns)); // identical seed, identical start

    for (let i = 0; i < 100; i++) advanceTurn(withCampaigns);
    runFilteredTurns(withoutCampaigns, 100, NEW_CAMPAIGN_PHASE_NAMES);

    const treasuryWith = totalTreasury(withCampaigns);
    const treasuryWithout = totalTreasury(withoutCampaigns);

    console.log(
      `[W26 evidence] US party treasury after 100 turns — with campaign cluster: ${treasuryWith}, ` +
        `without (counterfactual): ${treasuryWithout}, delta=${treasuryWithout - treasuryWith}`,
    );

    // The subsidy phase (partySubsidy.ts) only ever moves money OUT of a
    // party treasury into a campaign; it never returns money. Every other
    // phase runs identically (same rng stream — none of the four new
    // phases draw from rng, so removing them does not perturb any other
    // phase's draws) in both worlds, so any gap is attributable to the
    // campaign subsidy sink (net of the small knock-on effect of media
    // favorability nudging vote outcomes, which can only ever be a second-
    // order effect this early).
    expect(treasuryWith).toBeLessThan(treasuryWithout);
  });

  it("determinism: two identical-seed 100-turn runs produce byte-identical campaign state", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 100; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.campaigns)).toBe(JSON.stringify(b.campaigns));
    expect(Object.keys(a.campaigns).length).toBeGreaterThan(0);
  });
});

describe("migration (v<20 -> v20)", () => {
  it("adds an empty campaigns map to a pre-W26 save", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00.000Z")) as SaveFile;
    raw.schemaVersion = 18;
    (raw.world.meta as unknown as Record<string, unknown>)["schemaVersion"] = 18;
    delete (raw.world as unknown as Record<string, unknown>)["campaigns"];

    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(31);
    expect(migrated.campaigns).toEqual({});
  });

  it("is idempotent / a no-op on an already-current save", () => {
    const w = createWorld(OPTS);
    w.campaigns["e1:X"] = {
      id: "e1:X",
      electionId: "e1",
      candidateId: "X",
      candidateIsNPP: true,
      partyId: "US_DEM",
      countryId: "US",
      electionType: "house",
      status: "active",
      funds: 5,
      actions: 0,
      fundraisingTree: { starter: false, a: 0, b: 0, c: 0 },
      oppositionResearchTree: { starter: false, a: 0, b: 0, c: 0 },
      groundGameTree: { starter: false, a: 0, b: 0, c: 0 },
      mediaSpendingTree: { starter: false, a: 0, b: 0, c: 0 },
      spendThisTurn: 0,
      totalFundsGenerated: 0,
      totalFundsSpent: 0,
      totalActionsGenerated: 0,
      totalActionsSpent: 0,
      createdAtTurn: 0,
    };
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const reloaded = deserializeSave(raw);
    expect(reloaded.campaigns["e1:X"]!.funds).toBe(5);
  });
});
