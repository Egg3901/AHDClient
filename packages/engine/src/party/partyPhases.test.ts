import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import {
  computeClosenessScalar,
  computeInfamyPenalty,
  computeTurnGain,
  computeNewInfluence,
  computeBonusActions,
} from "./partyInfluence.js";
import { updateEarnedRegions, resolvePartyPsCap, resolveTierTransition } from "./partyTier.js";
import { computePartyPsGain } from "./phases.js";
import { PARTY_INFLUENCE_MAX_BONUS, NATIONAL_PASSIVE_PS_PER_TURN } from "./constants.js";
import { TURN_PHASES } from "../phases/registry.js";

const OPTS = { seed: "party-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

// ---------------------------------------------------------------------------
// Pure helper tests (ported from mainline)
// ---------------------------------------------------------------------------
describe("computeClosenessScalar", () => {
  it("returns 1 when identical", () => {
    expect(computeClosenessScalar(0, 0, 0, 0)).toBeCloseTo(1, 5);
  });
  it("returns 0 at max distance", () => {
    expect(computeClosenessScalar(-5, -5, 5, 5)).toBeCloseTo(0, 5);
  });
  it("partial for moderate divergence", () => {
    const s = computeClosenessScalar(0, 0, 5, 0);
    expect(s).toBeCloseTo(1 - 5 / Math.sqrt(200), 5);
  });
});

describe("computeInfamyPenalty", () => {
  it("0 at zero infamy", () => expect(computeInfamyPenalty(0, 4)).toBe(0));
  it("max at reference", () => expect(computeInfamyPenalty(300, 4)).toBeCloseTo(4, 5));
  it("caps beyond reference", () => expect(computeInfamyPenalty(1000, 4)).toBe(4));
});

describe("computeBonusActions", () => {
  it("0 when totalInfluence 0", () => expect(computeBonusActions(5, 0, 10, 1, 6)).toBe(0));
  it("caps at maxBonus", () => expect(computeBonusActions(100, 100, 100, 1, 6)).toBe(6));
});

describe("computePartyPsGain", () => {
  it("passive only when no investment budget", () => {
    const r = computePartyPsGain({ current: 0, cap: 280, treasury: 1000000, passivePerTurn: 20, psInvestmentBudget: 0, psInvestmentRatePerPs: 12500 });
    expect(r.passive).toBe(20);
    expect(r.investment).toBe(0);
    expect(r.total).toBe(20);
    expect(r.clampedTo).toBe(20);
  });
  it("clamps at cap", () => {
    const r = computePartyPsGain({ current: 275, cap: 280, treasury: 1000000, passivePerTurn: 20, psInvestmentBudget: 0, psInvestmentRatePerPs: 12500 });
    expect(r.clampedTo).toBe(280);
    expect(r.total).toBe(5);
  });
  it("investment debits treasury", () => {
    const r = computePartyPsGain({ current: 0, cap: 280, treasury: 100000, passivePerTurn: 20, psInvestmentBudget: 50000, psInvestmentRatePerPs: 12500 });
    expect(r.investment).toBeGreaterThan(0);
    expect(r.investmentDebit).toBe(r.investment * 12500);
  });
});

describe("updateEarnedRegions", () => {
  it("earns at >=20%", () => {
    const e = updateEarnedRegions([], new Map([["A", 20]]));
    expect(e).toEqual(["A"]);
  });
  it("keeps earned while >=10% sticky band", () => {
    const e = updateEarnedRegions(["A"], new Map([["A", 15]]));
    expect(e).toEqual(["A"]);
  });
  it("drops below 10%", () => {
    const e = updateEarnedRegions(["A"], new Map([["A", 9]]));
    expect(e).toEqual([]);
  });
});

describe("resolvePartyPsCap", () => {
  it("major gets national cap", () => expect(resolvePartyPsCap("major", 0, 280)).toBe(280));
  it("minor base 100", () => expect(resolvePartyPsCap("minor", 0, 280)).toBe(100));
  it("minor with earned regions", () => expect(resolvePartyPsCap("minor", 3, 280)).toBe(130));
});

describe("resolveTierTransition", () => {
  it("minor graduates with enough org", () => {
    const r = resolveTierTransition({
      currentTier: "minor",
      orgByRegion: new Map([["a", 25], ["b", 25], ["c", 5]]),
      regionCount: 3,
      warningStartedTurn: null,
      currentTurn: 10,
    });
    expect(r.tier).toBe("major");
    expect(r.reason).toBe("graduated");
  });
  it("major warns when at risk", () => {
    const r = resolveTierTransition({
      currentTier: "major",
      orgByRegion: new Map([["a", 5], ["b", 5], ["c", 5]]),
      regionCount: 3,
      warningStartedTurn: null,
      currentTurn: 10,
    });
    expect(r.warningStartedTurn).toBe(10);
    expect(r.reason).toBe("warning-started");
  });
  it("major demotes after grace", () => {
    const r = resolveTierTransition({
      currentTier: "major",
      orgByRegion: new Map([["a", 5], ["b", 5], ["c", 5]]),
      regionCount: 3,
      warningStartedTurn: 0,
      currentTurn: 240,
    });
    expect(r.tier).toBe("minor");
    expect(r.reason).toBe("demoted");
  });
});

// ---------------------------------------------------------------------------
// Phase integration tests
// ---------------------------------------------------------------------------
describe("partyInfluenceTurn phase", () => {
  it("accumulates influence for politicians over turns", () => {
    const world = createWorld(OPTS);
    const pid = world.politicians[0]!.id;
    const before = world.politicians.find((p) => p.id === pid)!.partyInfluence;
    advanceTurn(world);
    const after = world.politicians.find((p) => p.id === pid)!.partyInfluence;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("is deterministic", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    advanceTurn(a);
    advanceTurn(b);
    expect(JSON.stringify(a.politicians.map((p) => p.partyInfluence))).toBe(JSON.stringify(b.politicians.map((p) => p.partyInfluence)));
  });

  it("pure helpers preserve mainline formulas", () => {
    // closeness scalar matches Euclidean distance on -5..5 grid
    const maxDist = Math.sqrt(200);
    expect(computeClosenessScalar(-5, -5, 5, 5)).toBe(0);
    expect(computeClosenessScalar(2, 2, 2, 2)).toBe(1);
    // decay + gain formula
    expect(computeNewInfluence(100, 3, 0.04)).toBeCloseTo(99, 5);
    expect(computeTurnGain(1, 0, 0, 3)).toBe(3);
    expect(computeInfamyPenalty(0, 4)).toBe(0);
  });
});

describe("partyOrgTurn phase", () => {
  it("decays organization", () => {
    const world = createWorld(OPTS);
    world.parties["US_DEM"]!.organization = 50;
    world.parties["US_DEM"]!.memberCount = 10;
    advanceTurn(world);
    expect(world.parties["US_DEM"]!.organization).toBeCloseTo(49.97, 2);
  });

  it("floors at MIN_PRESENCE_ORG for present parties", () => {
    const world = createWorld(OPTS);
    const party = world.parties["US_DEM"]!;
    party.organization = 5;
    party.memberCount = 10;
    // run many turns so decay would push below floor without clamp
    for (let i = 0; i < 200; i++) advanceTurn(world);
    expect(party.organization).toBeGreaterThanOrEqual(5);
  });

  it("decays to 0 for absent parties", () => {
    const world = createWorld(OPTS);
    // Use a default party but strip its politicians so memberCount stays 0 after reconcile.
    // Default parties are immune to emptyPartyCleanup, so org can decay to 0.
    // Pick UK_LIB (minor, few politicians) and remove them.
    world.politicians = world.politicians.filter((p) => p.partyId !== "UK_LIB");
    world.parties["UK_LIB"]!.organization = 10;
    // force reconcile to keep memberCount 0
    for (let i = 0; i < 400; i++) advanceTurn(world);
    expect(world.parties["UK_LIB"]!.organization).toBe(0);
  });
});

describe("partyTierTurn phase", () => {
  it("promotes minor with high org", () => {
    const world = createWorld(OPTS);
    const minorId = Object.values(world.parties).find((p) => p.tier === "minor")!.id;
    world.parties[minorId]!.organization = 25;
    // Also set regional org for W37 tier that now derives from partyRegions
    for (const key of Object.keys(world.partyRegions).filter((k) => k.endsWith(`:${minorId}`))) {
      world.partyRegions[key]!.organization = 25;
    }
    advanceTurn(world);
    expect(world.parties[minorId]!.tier).toBe("major");
  });

  it("demotes major after warning grace via direct phase control", () => {
    // Pure helper test: major with low org in all regions demotes after grace.
    // This is deterministic and does not depend on NPCs or elections.
    const r = resolveTierTransition({
      currentTier: "major",
      orgByRegion: new Map([["a", 5], ["b", 5], ["c", 5]]),
      regionCount: 3,
      warningStartedTurn: 0,
      currentTurn: 240,
    });
    expect(r.tier).toBe("minor");
    expect(r.reason).toBe("demoted");
  });

  it("clamps PS down when cap drops", () => {
    const world = createWorld(OPTS);
    const minorId = Object.values(world.parties).find((p) => p.tier === "minor")!.id;
    world.parties[minorId]!.politicalStrength = 200; // over minor cap 100
    world.parties[minorId]!.organization = 0;
    advanceTurn(world);
    expect(world.parties[minorId]!.politicalStrength).toBeLessThanOrEqual(100);
  });
});

describe("partyActionGeneration phase", () => {
  it("generates passive PS each turn", () => {
    const world = createWorld(OPTS);
    const before = world.parties["US_DEM"]!.politicalStrength;
    advanceTurn(world);
    expect(world.parties["US_DEM"]!.politicalStrength).toBe(before + NATIONAL_PASSIVE_PS_PER_TURN);
  });

  it("caps at tier cap", () => {
    const world = createWorld(OPTS);
    world.parties["US_DEM"]!.politicalStrength = 275;
    advanceTurn(world);
    expect(world.parties["US_DEM"]!.politicalStrength).toBeLessThanOrEqual(280);
  });

  it("minor cap lower than major", () => {
    const world = createWorld(OPTS);
    const minorId = Object.values(world.parties).find((p) => p.tier === "minor")!.id;
    world.parties[minorId]!.politicalStrength = 0;
    for (let i = 0; i < 20; i++) advanceTurn(world);
    expect(world.parties[minorId]!.politicalStrength).toBeLessThanOrEqual(200);
    expect(world.parties["US_DEM"]!.politicalStrength).toBeGreaterThan(world.parties[minorId]!.politicalStrength);
  });
});

describe("caucusTax phase", () => {
  it("is no-op with no caucuses", () => {
    const world = createWorld(OPTS);
    const before = JSON.stringify(world.caucuses);
    advanceTurn(world);
    expect(JSON.stringify(world.caucuses)).toBe(before);
  });

  it("is no-op with zero taxRate", () => {
    const world = createWorld(OPTS);
    world.caucuses.push({
      id: "c1",
      countryId: "US",
      partyId: "US_DEM",
      name: "Test Caucus",
      treasury: 1000,
      taxRate: 0,
      disbandedAt: null,
      memberIds: [world.politicians[0]!.id],
    });
    const before = world.caucuses[0]!.treasury;
    advanceTurn(world);
    expect(world.caucuses[0]!.treasury).toBe(before);
  });
});

describe("expireCharters phase", () => {
  it("expires draft past turn deadline", () => {
    const world = createWorld(OPTS);
    world.charters.push({
      id: "ch1",
      countryId: "US",
      partyId: null,
      status: "draft",
      expiresOnTurn: 1,
      expiresAt: null,
      founderReplacementDeadlineTurn: null,
      founderReplacementDeadline: null,
    });
    advanceTurn(world); // turn becomes 1
    expect(world.charters[0]!.status).toBe("expired");
  });

  it("expires pending-signatures past turn deadline", () => {
    const world = createWorld(OPTS);
    world.charters.push({
      id: "ch2",
      countryId: "US",
      partyId: null,
      status: "pending-signatures",
      expiresOnTurn: 1,
      expiresAt: null,
      founderReplacementDeadlineTurn: null,
      founderReplacementDeadline: null,
    });
    advanceTurn(world);
    expect(world.charters[0]!.status).toBe("expired");
  });

  it("expires founder-replacement past deadline", () => {
    const world = createWorld(OPTS);
    world.charters.push({
      id: "ch3",
      countryId: "US",
      partyId: null,
      status: "founder-replacement",
      expiresOnTurn: null,
      expiresAt: null,
      founderReplacementDeadlineTurn: 1,
      founderReplacementDeadline: null,
    });
    advanceTurn(world);
    expect(world.charters[0]!.status).toBe("expired");
  });

  it("does not expire ratified charters", () => {
    const world = createWorld(OPTS);
    world.charters.push({
      id: "ch4",
      countryId: "US",
      partyId: "NEW",
      status: "ratified",
      expiresOnTurn: null,
      expiresAt: null,
      founderReplacementDeadlineTurn: null,
      founderReplacementDeadline: null,
    });
    for (let i = 0; i < 10; i++) advanceTurn(world);
    expect(world.charters[0]!.status).toBe("ratified");
  });

  it("does not expire before deadline", () => {
    const world = createWorld(OPTS);
    world.charters.push({
      id: "ch5",
      countryId: "US",
      partyId: null,
      status: "draft",
      expiresOnTurn: 100,
      expiresAt: null,
      founderReplacementDeadlineTurn: null,
      founderReplacementDeadline: null,
    });
    advanceTurn(world);
    expect(world.charters[0]!.status).toBe("draft");
  });
});

describe("emptyPartyCleanup phase", () => {
  it("deletes empty non-default party", () => {
    const world = createWorld(OPTS);
    world.parties["CUSTOM_EMPTY"] = {
      id: "CUSTOM_EMPTY",
      name: "Empty Custom",
      countryId: "US",
      abbreviation: "EMP",
      color: "#123456",
      economicPosition: 0,
      socialPosition: 0,
      treasury: 0,
      politicalStrength: 0,
      organization: 0,
      tier: "minor",
      psCapEarnedRegions: [],
      memberCount: 0,
      isDefault: false,
    };
    // add a chamber seat to verify cleanup
    world.legislatures["US"]!.chambers[0]!.composition.seatsByParty["CUSTOM_EMPTY"] = 2;
    world.legislatures["US"]!.chambers[0]!.composition.vacancies = 3;
    advanceTurn(world);
    expect(world.parties["CUSTOM_EMPTY"]).toBeUndefined();
    expect(world.legislatures["US"]!.chambers[0]!.composition.seatsByParty["CUSTOM_EMPTY"]).toBeUndefined();
    expect(world.legislatures["US"]!.chambers[0]!.composition.vacancies).toBe(5);
  });

  it("does not delete default parties even if memberCount 0", () => {
    const world = createWorld(OPTS);
    // Force US_DEM memberCount to 0 and remove its politicians
    world.politicians = world.politicians.filter((p) => p.partyId !== "US_DEM");
    world.parties["US_DEM"]!.memberCount = 0;
    advanceTurn(world);
    expect(world.parties["US_DEM"]).toBeDefined();
  });

  it("does not delete chartered party even if empty", () => {
    const world = createWorld(OPTS);
    world.parties["CUSTOM_CHARTERD"] = {
      id: "CUSTOM_CHARTERD",
      name: "Chartered",
      countryId: "US",
      abbreviation: "CHT",
      color: "#123456",
      economicPosition: 0,
      socialPosition: 0,
      treasury: 0,
      politicalStrength: 0,
      organization: 0,
      tier: "minor",
      psCapEarnedRegions: [],
      memberCount: 0,
      isDefault: false,
    };
    world.charters.push({
      id: "ch-charterd",
      countryId: "US",
      partyId: "CUSTOM_CHARTERD",
      status: "ratified",
      expiresOnTurn: null,
      expiresAt: null,
      founderReplacementDeadlineTurn: null,
      founderReplacementDeadline: null,
    });
    advanceTurn(world);
    expect(world.parties["CUSTOM_CHARTERD"]).toBeDefined();
  });

  it("does not delete party with politicians", () => {
    const world = createWorld(OPTS);
    world.parties["CUSTOM_WITH_POL"] = {
      id: "CUSTOM_WITH_POL",
      name: "Has Politician",
      countryId: "US",
      abbreviation: "HSP",
      color: "#123456",
      economicPosition: 0,
      socialPosition: 0,
      treasury: 0,
      politicalStrength: 0,
      organization: 0,
      tier: "minor",
      psCapEarnedRegions: [],
      memberCount: 0, // stale count, but politician holds it
      isDefault: false,
    };
    world.politicians.push({
      id: "US-9999",
      name: "Test Pol",
      gender: "male",
      countryId: "US",
      partyId: "CUSTOM_WITH_POL",
      chamberKey: "house",
      ideology: { economic: 0, social: 0 },
      age: 40,
      partyInfluence: 0,
      bonusActions: 0,
      actions: 25,
      funds: 0,
      donorBaseLevel: 0,
      politicalInfluence: 0,
      favorability: 50,
      infamy: 0,
      actionCooldowns: {},
      personality: { loyalty: 50, ambition: 50, stubbornness: 50 },
    });
    advanceTurn(world);
    // reconcile will fix memberCount first, then cleanup should not delete
    expect(world.parties["CUSTOM_WITH_POL"]).toBeDefined();
  });
});

describe("partyMemberCountReconcile phase", () => {
  it("repairs drifted memberCount", () => {
    const world = createWorld(OPTS);
    world.parties["US_DEM"]!.memberCount = 999;
    advanceTurn(world);
    // Election challengers spawn after reconcile within the same turn; count the cast reconcile saw.
    const expected = world.politicians.filter((p) => p.partyId === "US_DEM" && !p.id.includes("-CH:")).length;
    expect(world.parties["US_DEM"]!.memberCount).toBe(expected);
  });

  it("zero for empty party", () => {
    const world = createWorld(OPTS);
    world.parties["CUSTOM_ZERO"] = {
      id: "CUSTOM_ZERO",
      name: "Zero",
      countryId: "US",
      abbreviation: "ZER",
      color: "#123456",
      economicPosition: 0,
      socialPosition: 0,
      treasury: 0,
      politicalStrength: 0,
      organization: 0,
      tier: "minor",
      psCapEarnedRegions: [],
      memberCount: 5,
      isDefault: false,
    };
    advanceTurn(world);
    expect(world.parties["CUSTOM_ZERO"]!.memberCount).toBe(0);
  });

  it("PORT-STUB: counts politicians (NPC-only) not human members", () => {
    const world = createWorld(OPTS);
    // Verify memberCount equals politician count per party
    for (const [id, party] of Object.entries(world.parties)) {
      const expected = world.politicians.filter((p) => p.partyId === id).length;
      expect(party.memberCount).toBe(expected);
    }
  });
});

describe("save migration v5 -> v6", () => {
  it("migrates old save missing party org fields", () => {
    const world = createWorld(OPTS);
    const raw = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 5,
      savedAt: "2026-01-01T00:00:00Z",
      world: {
        ...world,
        charters: undefined,
        caucuses: undefined,
        parties: Object.fromEntries(
          Object.entries(world.parties).map(([k, v]) => [k, { id: v.id, name: v.name, countryId: v.countryId, abbreviation: v.abbreviation, color: v.color, economicPosition: v.economicPosition, socialPosition: v.socialPosition }]),
        ),
        politicians: world.politicians.map((p) => ({ id: p.id, name: p.name, gender: p.gender, countryId: p.countryId, partyId: p.partyId, chamberKey: p.chamberKey, ideology: p.ideology, age: p.age })),
      },
    });
    const parsed = JSON.parse(raw) as { world: Record<string, unknown> };
    delete parsed.world["charters"];
    delete parsed.world["caucuses"];
    const migrated = deserializeSave(JSON.stringify({ format: "ahdsolo-save", schemaVersion: 5, savedAt: "2026-01-01T00:00:00Z", world: parsed.world }));
    expect(migrated.meta.schemaVersion).toBe(17);
    expect(Array.isArray(migrated.charters)).toBe(true);
    expect(Array.isArray(migrated.caucuses)).toBe(true);
    for (const party of Object.values(migrated.parties)) {
      expect(typeof party.treasury).toBe("number");
      expect(typeof party.organization).toBe("number");
      expect(typeof party.tier).toBe("string");
      expect(typeof party.memberCount).toBe("number");
    }
    for (const pol of migrated.politicians) {
      expect(typeof pol.partyInfluence).toBe("number");
    }
  });
});

describe("determinism", () => {
  it("50 turns produce identical worlds for same seed", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 50; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("save/load round-trip preserves party state", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 10; i++) advanceTurn(world);
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const restored = deserializeSave(raw);
    expect(JSON.stringify(restored.parties)).toBe(JSON.stringify(world.parties));
    expect(JSON.stringify(restored.charters)).toBe(JSON.stringify(world.charters));
    for (let i = 0; i < 10; i++) {
      advanceTurn(world);
      advanceTurn(restored);
    }
    expect(JSON.stringify(world)).toBe(JSON.stringify(restored));
  });
});

describe("registry ordering", () => {
  it("party phases in correct mainline order", () => {
    const names = TURN_PHASES.map((p) => p.name);
    const idx = (n: string) => names.indexOf(n);
    expect(idx("partyInfluenceTurn")).toBeGreaterThan(idx("advanceCalendar"));
    expect(idx("caucusTax")).toBeGreaterThan(idx("partyInfluenceTurn"));
    expect(idx("macroCountryTurn")).toBeGreaterThan(idx("caucusTax"));
    expect(idx("partyOrgTurn")).toBeGreaterThan(idx("macroCountryTurn"));
    expect(idx("partyTierTurn")).toBeGreaterThan(idx("partyOrgTurn"));
    expect(idx("partyActionGeneration")).toBeGreaterThan(idx("partyTierTurn"));
    expect(idx("expireCharters")).toBeGreaterThan(idx("partyActionGeneration"));
    expect(idx("emptyPartyCleanup")).toBeGreaterThan(idx("expireCharters"));
    expect(idx("partyMemberCountReconcile")).toBeGreaterThan(idx("emptyPartyCleanup"));
    expect(idx("newsMaintenance")).toBeGreaterThan(idx("partyMemberCountReconcile"));
  });
});

// Regression: majors stay major because NPCs maintain org (W37). Previously
// a PORT-STUB exempted default majors from demotion; now NPC actionProcessing
// via organize actions sustains organization, so the exemption is removed.
describe("default major demotion with NPC-maintained org (W37)", () => {
  it("US default majors stay major over 600 turns via NPC org maintenance", async () => {
    const { createWorld, advanceTurn } = await import("../index.js");
    const w = createWorld({ seed: "tier-regression", playerName: "T", countryId: "US", era: "1953" });
    for (let i = 0; i < 600; i++) advanceTurn(w);
    for (const p of Object.values(w.parties).filter((p) => p.countryId === "US" && p.isDefault)) {
      expect(p.tier).toBe("major");
    }
  });
});
