import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { launchProspectingSurvey } from "./prospecting.js";
import { issueContractOffer } from "./contracts.js";
import { prospectCostAnchor, prospectDurationTurns } from "./constants.js";

const OPTS = { seed: "w11-extraction-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("stateResourceCapacities seeding", () => {
  it("seeds real per-state US capacity with headroom applied", () => {
    const w = createWorld(OPTS);
    // Source: US:TX oil 450000 x headroom 3 = 1,350,000; natural_gas 2,250,000 x3 = 6,750,000; coal 15,000 x2 = 30,000
    expect(w.stateResourceCapacities["TX"]?.resources.oil).toBe(1_350_000);
    expect(w.stateResourceCapacities["TX"]?.resources.natural_gas).toBe(6_750_000);
    expect(w.stateResourceCapacities["TX"]?.resources.coal).toBe(30_000);
    // A state with no authored entry (e.g. AK is authored; pick one with only timber, e.g. CT)
    expect(w.stateResourceCapacities["CT"]?.resources.timber).toBe(9_000); // 3000 x3
  });

  it("seeds real per-region UK/RU/DD capacity (W39 real subdivisions, not opaque)", () => {
    const w = createWorld(OPTS);
    const ukRegions = ["LON", "SEE", "SWE", "EAE", "EMI", "WMI", "YHU", "NWE", "NEE", "SCO", "WAL", "NIR"];
    // 1953 era strips UK:SCO oil/natural_gas (North Sea, pre-1969): national
    // total timber 90750x3=272250, coal 97500x2=195000, iron 45000x7=315000.
    let totalCoal = 0;
    for (const r of ukRegions) totalCoal += w.stateResourceCapacities[r]?.resources.coal ?? 0;
    expect(totalCoal).toBe(97_500 * 2);
    // No UK oil in 1953 (SCO stripped, was the only source)
    for (const r of ukRegions) expect(w.stateResourceCapacities[r]?.resources.oil ?? 0).toBe(0);
    // Per-region spot check: NEE coal 30000 x2 headroom = 60000
    expect(w.stateResourceCapacities["NEE"]?.resources.coal).toBe(60_000);
    // RU:WSB oil/natural_gas also stripped pre-1960 (Tyumen, discovered 1960)
    expect(w.stateResourceCapacities["WSB"]?.resources.oil ?? 0).toBe(0);
    expect(w.stateResourceCapacities["URA"]?.resources.iron).toBe(216_000 * 7);
    // DD:BEO (East Berlin) has no mainline entry -> empty resources, not evenly split
    expect(w.stateResourceCapacities["BEO"]?.resources).toEqual({});
    expect(w.stateResourceCapacities["SN"]?.resources.coal).toBe(55_000 * 2);
  });

  it("is deterministic across identical seeds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    expect(a.stateResourceCapacities).toEqual(b.stateResourceCapacities);
  });
});

describe("prospecting", () => {
  it("launchProspectingSurvey requires HoS mode", () => {
    const w = createWorld(OPTS);
    w.player.actions = 10;
    const res = executeAction(w, "player", "launchProspect", { regionId: "TX", resource: "oil" });
    expect(res.ok).toBe(false);
  });

  it("launches and charges treasury; resolves after era-scaled duration", () => {
    const w = createWorld(OPTS);
    w.player.mode = "hos";
    w.player.actions = 10;
    const budgetBefore = w.budgets["US"]!.treasuryBalance;
    const res = executeAction(w, "player", "launchProspect", { regionId: "TX", resource: "oil" });
    expect(res.ok).toBe(true);
    expect(w.prospectingSurveys).toHaveLength(1);
    const survey = w.prospectingSurveys[0]!;
    expect(survey.status).toBe("active");
    expect(survey.costAnchor).toBe(prospectCostAnchor(0));
    expect(w.budgets["US"]!.treasuryBalance).toBe(budgetBefore - prospectCostAnchor(0));
    expect(survey.completesTurn).toBe(prospectDurationTurns(1953));

    for (let i = 0; i < survey.completesTurn; i++) advanceTurn(w);
    const resolved = w.prospectingSurveys[0]!;
    expect(["succeeded", "failed"]).toContain(resolved.status);
    expect(resolved.resolvedTurn).toBe(survey.completesTurn);
  });

  it("rejects a resource with no deposit in the region", () => {
    const w = createWorld(OPTS);
    w.player.mode = "hos";
    const res = launchProspectingSurvey(w, { countryId: "US", regionId: "RI", resource: "oil" });
    expect(res.ok).toBe(false);
  });

  it("caps active surveys per government at 3", () => {
    const w = createWorld(OPTS);
    w.player.mode = "hos";
    const regions: Array<[string, "oil" | "natural_gas" | "coal"]> = [
      ["TX", "oil"],
      ["TX", "natural_gas"],
      ["TX", "coal"],
    ];
    for (const [regionId, resource] of regions) {
      const r = launchProspectingSurvey(w, { countryId: "US", regionId, resource });
      expect(r.ok).toBe(true);
    }
    const fourth = launchProspectingSurvey(w, { countryId: "US", regionId: "PA", resource: "coal" });
    expect(fourth.ok).toBe(false);
  });

  it("determinism: identical seeds resolve identically", () => {
    const mk = () => {
      const w = createWorld({ seed: "prospect-det", playerName: "P", countryId: "US", era: "1953" });
      w.player.mode = "hos";
      launchProspectingSurvey(w, { countryId: "US", regionId: "TX", resource: "oil" });
      return w;
    };
    const a = mk();
    const b = mk();
    const completesTurn = a.prospectingSurveys[0]!.completesTurn;
    for (let i = 0; i < completesTurn; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.prospectingSurveys[0]!.status).toBe(b.prospectingSurveys[0]!.status);
    expect(a.prospectingSurveys[0]!.capacityGained).toBe(b.prospectingSurveys[0]!.capacityGained);
    expect(a.stateResourceCapacities).toEqual(b.stateResourceCapacities);
  });
});

describe("extraction contract issuance + NPC acceptance", () => {
  it("issues an offer to the country's extraction corp and it auto-accepts when affordable", () => {
    // Counterfactual pattern (not a bare before/after delta across a full
    // advanceTurn): a full turn also runs corporationTurn and every other
    // economic phase, which moves corp.liquidCapital and the treasury for
    // reasons unrelated to the signing fee. Isolate the signing-fee effect
    // by diffing two identically-seeded worlds, one with the offer issued
    // and one without, across the same single turn.
    const mkWorld = () => createWorld(OPTS);
    const withOffer = mkWorld();
    withOffer.player.mode = "hos";
    withOffer.player.actions = 10;
    const corp = withOffer.corporations["US-extraction"]!;
    expect(corp).toBeDefined();
    const res = executeAction(withOffer, "player", "issueExtractionContract", {
      regionId: "TX",
      resource: "oil",
      share: 0.1,
      royaltyRatePerTurn: 0.01,
      termTurns: 24,
      signingFeeAnchor: 1000,
    });
    expect(res.ok).toBe(true);
    const contract = withOffer.extractionContracts[0]!;
    expect(contract.status).toBe("offered");
    expect(contract.corporationId).toBe("US-extraction");

    const without = mkWorld();

    advanceTurn(withOffer);
    advanceTurn(without);

    const after = withOffer.extractionContracts[0]!;
    expect(after.status).toBe("active");
    expect(after.expiresTurn).toBe(after.activatedTurn! + 24);

    const corpDelta = withOffer.corporations["US-extraction"]!.liquidCapital - without.corporations["US-extraction"]!.liquidCapital;
    const treasuryDelta = withOffer.budgets["US"]!.treasuryBalance - without.budgets["US"]!.treasuryBalance;
    expect(corpDelta).toBe(-1000);
    expect(treasuryDelta).toBe(1000);
  });

  it("enforces the 75% total-contracted-share cap", () => {
    const w = createWorld(OPTS);
    w.player.mode = "hos";
    const first = issueContractOffer(w, {
      countryId: "US",
      regionId: "TX",
      resource: "oil",
      share: 0.6,
      royaltyRatePerTurn: 0.01,
      termTurns: 24,
      signingFeeAnchor: 0,
    });
    expect(first.ok).toBe(true);
    const second = issueContractOffer(w, {
      countryId: "US",
      regionId: "TX",
      resource: "oil",
      share: 0.3,
      royaltyRatePerTurn: 0.01,
      termTurns: 24,
      signingFeeAnchor: 0,
    });
    expect(second.ok).toBe(false);
  });

  it("real capacity feeds contract settlement royalties (replacing the notional stub)", () => {
    const w = createWorld(OPTS);
    w.extractionContracts.push({
      id: "real-cap-1",
      stateId: "TX",
      countryId: "US",
      resource: "oil",
      share: 0.5,
      royaltyRatePerTurn: 0.01,
      status: "active",
      grantedTurn: 0,
      grantedByLevel: "national",
      missedPayments: 0,
      lastSettlementTurn: null,
      corporationId: null,
    });
    advanceTurn(w);
    const cap = w.stateResourceCapacities["TX"]!;
    expect(cap.extractedUnits?.oil).toBeGreaterThan(0);
    // extracted volume this turn = share * depleted capacity (initially the full seeded ceiling)
    expect(cap.extractedUnits?.oil).toBe(0.5 * cap.resources.oil!);
  });
});

describe("W11 schema", () => {
  it("bumps SCHEMA_VERSION to 36 and round-trips through save/load", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(36);
    const w = createWorld(OPTS);
    w.player.mode = "hos";
    launchProspectingSurvey(w, { countryId: "US", regionId: "TX", resource: "oil" });
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.prospectingSurveys).toHaveLength(1);
    expect(loaded.stateResourceCapacities["TX"]?.resources.oil).toBe(w.stateResourceCapacities["TX"]?.resources.oil);
  });

  it("migrates a pre-v36 save (v33) with backfilled defaults", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00.000Z"));
    raw.schemaVersion = 33;
    delete raw.world.prospectingSurveys;
    delete raw.world.stateResourceCapacities;
    delete raw.world.achievementsEarned;
    delete raw.world.player.actionCounts;
    delete raw.world.player.wireQuotaUsedAnchor;
    delete raw.world.player.wireQuotaWindowStartTurn;
    for (const pol of raw.world.politicians) delete pol.cash;
    raw.world.meta.schemaVersion = 33;
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.prospectingSurveys).toEqual([]);
    expect(loaded.achievementsEarned).toEqual([]);
    expect(loaded.stateResourceCapacities["TX"]?.resources.oil).toBe(1_350_000);
    expect(loaded.player.actionCounts).toEqual({});
    expect(loaded.player.wireQuotaUsedAnchor).toBe(0);
    expect(loaded.player.wireQuotaWindowStartTurn).toBeNull();
    for (const pol of loaded.politicians) expect(pol.cash).toBe(0);
  });
});
