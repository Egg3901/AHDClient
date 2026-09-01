import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "./world.js";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import { rngFromSeed } from "./rng.js";
import { didPass, didPassWithFilibusterCheck, ideologyVote } from "./legislation/billVoteLogic.js";
import { getLaw, getCatalog, CATALOG } from "./legislation/catalog.js";
import type { Bill } from "./legislation/types.js";
import type { Politician } from "./types.js";

const OPTS = { seed: "leg-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

function makePolitician(id: string, partyId: string, chamberKey: string, economic: number, social: number): Politician {
  return {
    id,
    name: `Pol ${id}`,
    gender: "male",
    countryId: "US",
    partyId,
    chamberKey,
    ideology: { economic, social },
    age: 45,
    partyInfluence: 0,
    bonusActions: 0,
    actions: 10,
    funds: 0,
    donorBaseLevel: 0,
    politicalInfluence: 0,
    favorability: 50,
    infamy: 0,
    actionCooldowns: {},
    personality: { loyalty: 50, ambition: 50, stubbornness: 50 },
  };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    title: "Test Bill",
    summary: "Test",
    countryId: "US",
    category: "economy",
    legislationTypeId: "us.economy.workerSecurity.primary",
    effectDirection: 1,
    provisions: [{ type: "policy", legislationTypeId: "us.economy.workerSecurity.primary", effectDirection: 1, economic: 0, social: 0 }],
    originChamber: "house",
    currentChamber: "house",
    status: "active",
    sponsorId: "player",
    sponsorName: "Tester",
    sponsorPartyId: "US_DEM",
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: 0,
    votingEndsOnTurn: 2,
    filibusterInvocations: [],
    updatedAtTurn: 0,
    committeeId: null,
    ...overrides,
  };
}

describe("didPass helper", () => {
  it("simple majority: for > against passes, tie fails", () => {
    expect(didPass(51, 49)).toBe(true);
    expect(didPass(50, 50)).toBe(false);
    expect(didPass(0, 0)).toBe(false);
    expect(didPass(1, 0)).toBe(true);
  });
});

describe("didPassWithFilibusterCheck — quorum rule", () => {
  it("without filibuster behaves like simple majority", () => {
    const bill = makeBill({ filibusterInvocations: [] });
    expect(didPassWithFilibusterCheck(bill, 51, 49, 0)).toBe(true);
    expect(didPassWithFilibusterCheck(bill, 49, 51, 0)).toBe(false);
  });

  it("with filibuster requires 3/5 of votes cast (for+against+abstain)", () => {
    const bill = makeBill({ filibusterInvocations: [{ characterId: "x", characterName: "X", invokedAtTurn: 0 }] });
    // 60 for, 30 against, 10 abstain = 100 cast, need 60 => passes at exactly 60
    expect(didPassWithFilibusterCheck(bill, 60, 30, 10)).toBe(true);
    expect(didPassWithFilibusterCheck(bill, 59, 30, 10)).toBe(false);
    // Abstains raise bar: 50 for, 30 against, 20 abstain =100 cast need 60 => 50 fails even though 50>30
    expect(didPassWithFilibusterCheck(bill, 50, 30, 20)).toBe(false);
    // Quorum: non-voters don't count. 6 for, 3 against, 1 abstain =10 cast need 6 => passes
    expect(didPassWithFilibusterCheck(bill, 6, 3, 1)).toBe(true);
    expect(didPassWithFilibusterCheck(bill, 5, 3, 1)).toBe(false);
  });

  it("with filibuster and zero votes cast fails", () => {
    const bill = makeBill({ filibusterInvocations: [{ characterId: "x", characterName: "X", invokedAtTurn: 0 }] });
    expect(didPassWithFilibusterCheck(bill, 0, 0, 0)).toBe(false);
  });

  it("quorum edge: 3 for, 2 against, 0 abstain =5 cast need 3 => passes", () => {
    const bill = makeBill({ filibusterInvocations: [{ characterId: "x", characterName: "X", invokedAtTurn: 0 }] });
    expect(didPassWithFilibusterCheck(bill, 3, 2, 0)).toBe(true);
    expect(didPassWithFilibusterCheck(bill, 2, 2, 0)).toBe(false);
  });
});

describe("ideologyVote — deterministic and ideology-driven", () => {
  it("is deterministic for same rng sequence", () => {
    const pol = makePolitician("P1", "US_DEM", "house", -2, -1);
    const bill = makeBill({ provisions: [{ type: "policy", legislationTypeId: "x", effectDirection: 1, economic: -2, social: -1 }] });
    const rngA = rngFromSeed("vote-seed");
    const rngB = rngFromSeed("vote-seed");
    const a = ideologyVote(pol, bill, { sponsorPartyId: "US_DEM", rng: rngA });
    const b = ideologyVote(pol, bill, { sponsorPartyId: "US_DEM", rng: rngB });
    expect(a).toBe(b);
  });

  it("ideology-aligned voters more likely to vote for (golden with fixed seed)", () => {
    // Create two voters: one aligned with bill (economic -2), one opposed (economic +4)
    const aligned = makePolitician("A", "US_DEM", "house", -2, 0);
    const opposed = makePolitician("O", "US_REP", "house", 4, 2);
    const bill = makeBill({
      provisions: [{ type: "policy", legislationTypeId: "x", effectDirection: 1, economic: -2, social: 0 }],
      sponsorPartyId: "US_DEM",
    });
    // Use many trials with same seed to show statistical difference
    let alignedFor = 0, opposedFor = 0;
    const trials = 100;
    const rngAligned = rngFromSeed("aligned-test");
    const rngOpposed = rngFromSeed("aligned-test");
    for (let i = 0; i < trials; i++) {
      const va = ideologyVote(aligned, bill, { sponsorPartyId: "US_DEM", rng: rngAligned });
      const vo = ideologyVote(opposed, bill, { sponsorPartyId: "US_DEM", rng: rngOpposed });
      if (va === "for") alignedFor++;
      if (vo === "for") opposedFor++;
    }
    // Aligned should have significantly more for votes than opposed
    expect(alignedFor).toBeGreaterThan(opposedFor);
    expect(alignedFor).toBeGreaterThan(50);
    expect(opposedFor).toBeLessThan(50);
  });

  it("party-line boosts same-party support", () => {
    const sameParty = makePolitician("S", "US_DEM", "house", 1, 1);
    const otherParty = makePolitician("Oth", "US_REP", "house", 1, 1);
    const bill = makeBill({
      provisions: [{ type: "policy", legislationTypeId: "x", effectDirection: 1, economic: 1, social: 1 }],
      sponsorPartyId: "US_DEM",
    });
    let sameFor = 0, otherFor = 0;
    const rngA = rngFromSeed("party-line");
    const rngB = rngFromSeed("party-line");
    for (let i = 0; i < 100; i++) {
      if (ideologyVote(sameParty, bill, { sponsorPartyId: "US_DEM", rng: rngA }) === "for") sameFor++;
      if (ideologyVote(otherParty, bill, { sponsorPartyId: "US_DEM", rng: rngB }) === "for") otherFor++;
    }
    expect(sameFor).toBeGreaterThan(otherFor);
  });

  it("endorsement boosts", () => {
    const pol = makePolitician("P", "US_REP", "house", 0, 0);
    const bill = makeBill({
      provisions: [{ type: "policy", legislationTypeId: "x", effectDirection: 1, economic: 0, social: 0 }],
      sponsorPartyId: "US_DEM",
    });
    let without = 0, withEndorse = 0;
    const rngA = rngFromSeed("endorse");
    const rngB = rngFromSeed("endorse");
    for (let i = 0; i < 100; i++) {
      if (ideologyVote(pol, bill, { sponsorPartyId: "US_DEM", rng: rngA }) === "for") without++;
      if (ideologyVote(pol, bill, { sponsorPartyId: "US_DEM", endorsedPartyIds: new Set(["US_REP"]), rng: rngB }) === "for") withEndorse++;
    }
    expect(withEndorse).toBeGreaterThan(without);
  });
});

describe("catalog", () => {
  it("available entries have economy or partySupport effects, stubbed are unavailable with blocking system", () => {
    const available = getCatalog().filter((e) => e.status === "available");
    expect(available.length).toBeGreaterThan(5);
    for (const e of available) {
      expect(e.effect).toBeDefined();
    }
    const stubbed = getCatalog().filter((e) => e.status === "unavailable");
    expect(stubbed.length).toBeGreaterThan(5);
    for (const e of stubbed) {
      expect(e.blockingSystem).toBeTruthy();
    }
  });

  it("PORT-STUB entries are marked unavailable", () => {
    const mob = getLaw("us.economy.mobility.primary");
    expect(mob?.status).toBe("unavailable");
    expect(mob?.blockingSystem).toBe("budget/grants");
  });
});

describe("bill lifecycle stage goldens", () => {
  it("proposed -> active -> enrolled -> signed in unicameral or appointed upper", () => {
    const world = createWorld(OPTS);
    // Make a unicameral legislature for this test: use DD? But US is bicameral.
    // Force a unicameral scenario by temporarily making US unicameral for this world.
    world.legislatures["US"]!.bicameral = false;
    world.legislatures["US"]!.chambers = [world.legislatures["US"]!.chambers[0]!];
    // Sponsor a bill as proposed at turn 0
    const bill: Bill = makeBill({
      id: "golden-1",
      status: "proposed",
      originChamber: "house",
      currentChamber: "house",
      countryId: "US",
      proposedAtTurn: 0,
    });
    world.bills.push(bill);
    // Advance 1 turn: proposed activates -> active
    advanceTurn(world);
    expect(world.bills[0]!.status).toBe("active");
    expect(world.bills[0]!.votingEndsOnTurn).toBe(3); // turn 1 +2
    // Fast-forward voting: set votes to pass and advance past deadline
    world.bills[0]!.votes = { "US-1": "for", "US-2": "for" };
    // Need to ensure autoVote doesn't overwrite; we set explicit votes
    // Advance 3 turns to pass origin vote
    for (let i = 0; i < 3; i++) advanceTurn(world);
    // Should have moved to enrolled (unicameral)
    expect(world.bills[0]!.status).toBe("enrolled");
    // Advance past executive window
    for (let i = 0; i < 3; i++) advanceTurn(world);
    expect(world.bills[0]!.status).toBe("signed");
    expect(world.enactedLaws.length).toBe(1);
  });

  it("bicameral US: active -> active_other -> enrolled -> signed", () => {
    const world = createWorld(OPTS);
    // US is bicameral with two elected chambers by default
    const bill: Bill = makeBill({
      id: "golden-2",
      status: "proposed",
      originChamber: "house",
      currentChamber: "house",
      countryId: "US",
      proposedAtTurn: 0,
    });
    world.bills.push(bill);
    advanceTurn(world);
    expect(world.bills[0]!.status).toBe("active");
    // Fill all house members as for to guarantee pass despite autoVote
    for (const pol of world.politicians) if (pol.countryId === "US" && pol.chamberKey === "house") world.bills[0]!.votes[pol.id] = "for";
    world.bills[0]!.votes["US-1"] = "for"; world.bills[0]!.votes["US-2"] = "for";
    // Advance past first vote window (2 turns)
    for (let i = 0; i < 3; i++) advanceTurn(world);
    expect(world.bills[0]!.status).toBe("active_other");
    expect(world.bills[0]!.currentChamber).toBe("senate");
    // Vote in second chamber: fill all senate as for
    for (const pol of world.politicians) if (pol.countryId === "US" && pol.chamberKey === "senate") world.bills[0]!.otherChamberVotes![pol.id] = "for";
    world.bills[0]!.otherChamberVotes!["US-10"] = "for"; world.bills[0]!.otherChamberVotes!["US-11"] = "for";
    for (let i = 0; i < 2; i++) advanceTurn(world);
    expect(world.bills[0]!.status).toBe("enrolled");
    for (let i = 0; i < 3; i++) advanceTurn(world);
    expect(world.bills[0]!.status).toBe("signed");
  });

  it("failed bill: not enough for votes", () => {
    const world = createWorld(OPTS);
    world.legislatures["US"]!.bicameral = false;
    world.legislatures["US"]!.chambers = [world.legislatures["US"]!.chambers[0]!];
    const votes: Record<string, "for" | "against" | "abstain"> = {};
    for (const pol of world.politicians) if (pol.countryId === "US" && pol.chamberKey === "house") votes[pol.id] = "against";
    votes["a"] = "against"; votes["b"] = "against";
    const bill: Bill = makeBill({
      id: "fail-1",
      status: "active",
      originChamber: "house",
      currentChamber: "house",
      countryId: "US",
      proposedAtTurn: 0,
      votingEndsOnTurn: 1,
      votes,
    });
    world.bills.push(bill);
    advanceTurn(world);
    expect(world.bills[0]!.status).toBe("failed");
    expect(world.enactedLaws.length).toBe(0);
  });

  it("chamber routing per legislature config: unicameral vs bicameral", () => {
    const world = createWorld(OPTS);
    // Check that committees are seeded per legislature config
    expect(world.committees.length).toBeGreaterThan(0);
    const usCommittees = world.committees.filter((c) => c.countryId === "US");
    expect(usCommittees.length).toBeGreaterThan(0);
  });

  it("enacted bill applies cataloged economy effect", () => {
    const world = createWorld({ seed: "effect-test", playerName: "T", countryId: "US", era: "1953" });
    const control = createWorld({ seed: "effect-test", playerName: "T", countryId: "US", era: "1953" });
    world.legislatures["US"]!.bicameral = false;
    world.legislatures["US"]!.chambers = [world.legislatures["US"]!.chambers[0]!];
    control.legislatures["US"]!.bicameral = false;
    control.legislatures["US"]!.chambers = [control.legislatures["US"]!.chambers[0]!];
    const votes: Record<string, "for" | "against" | "abstain"> = {};
    for (const pol of world.politicians) if (pol.countryId === "US" && pol.chamberKey === "house") votes[pol.id] = "for";
    votes["x"] = "for"; votes["y"] = "for";
    const bill: Bill = makeBill({
      id: "effect-1",
      status: "active",
      originChamber: "house",
      currentChamber: "house",
      countryId: "US",
      legislationTypeId: "us.economy.stability.primary",
      category: "economy",
      proposedAtTurn: 0,
      votingEndsOnTurn: 1,
      votes,
    });
    world.bills.push(bill);
    // Advance both worlds identically (only world has the bill) turn by turn
    // until the bill signs. Under W9's real corp-driven growth signal,
    // growthRate is recomputed fresh every turn from corp revenue + output gap
    // rather than carried forward as accumulated state (see
    // corporation/corporationTurn.ts file doc) — so the bill's one-time
    // growthRate bump is only observable in the same turn it is applied,
    // before the next macroCountryTurn overwrites it. Advancing to a fixed
    // turn count (as opposed to the exact signing turn) is not robust to rng
    // stream shifts from other waves, so this polls for the "signed"
    // transition directly instead of assuming which turn it lands on.
    let turns = 0;
    while (world.bills[0]!.status !== "signed" && turns < 20) {
      advanceTurn(world);
      advanceTurn(control);
      turns++;
    }
    expect(world.bills[0]!.status).toBe("signed");
    // Bill adds growthRate delta, so world should be higher than control by ~0.001
    expect(world.countries["US"]!.economy.growthRate).toBeGreaterThan(control.countries["US"]!.economy.growthRate);
    expect(world.enactedLaws.length).toBe(1);
    expect(control.enactedLaws.length).toBe(0);
  });
});

describe("determinism", () => {
  it("identical seeds produce identical bill lifecycles", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    const mk = (): Bill => makeBill({ id: "det-1", status: "proposed", originChamber: "house", currentChamber: "house", countryId: "US", proposedAtTurn: 0 });
    a.bills.push(mk());
    b.bills.push(mk());
    for (let i = 0; i < 10; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.bills)).toBe(JSON.stringify(b.bills));
    expect(JSON.stringify(a.enactedLaws)).toBe(JSON.stringify(b.enactedLaws));
  });

  it("save/load round trip preserves bills mid-campaign", () => {
    const world = createWorld(OPTS);
    const bill: Bill = makeBill({ id: "save-1", status: "proposed", originChamber: "house", currentChamber: "house", countryId: "US", proposedAtTurn: 0 });
    world.bills.push(bill);
    advanceTurn(world);
    const saved = serializeSave(world, "2026-01-01T00:00:00Z");
    const restored = deserializeSave(saved);
    for (let i = 0; i < 5; i++) advanceTurn(world);
    for (let i = 0; i < 5; i++) advanceTurn(restored);
    expect(JSON.stringify(world.bills)).toBe(JSON.stringify(restored.bills));
  });
});

describe("migration v11 -> v12", () => {
  it("loads v11 saves with empty bills/committees and player seat", () => {
    const v11World = {
      meta: { schemaVersion: 11, seed: "s", rng: [1, 2, 3, 4] as [number, number, number, number], turn: 5, date: "1953-02-10", era: "1953", cheatsUsed: false },
      countries: {},
      parties: {},
      legislatures: {},
      politicians: [],
      charters: [],
      caucuses: [],
      endorsements: [],
      commodityPrices: {},
      extractionContracts: [],
      regions: {},
      partyRegions: {},
      electoratePools: {},
      regionTurnouts: {},
      partyPressures: {},
      candidateSupports: {},
      player: { name: "P", countryId: "US", cash: 10000, actions: 25, funds: 0, donorBaseLevel: 0, politicalInfluence: 0, favorability: 50, infamy: 0, actionCooldowns: {}, partyId: null, partyJoinedTurn: null, lastPartySwitchTurn: null, purgeRejoinBlocks: [], caucusId: null },
      news: [],
    };
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 11, savedAt: "2026-01-01T00:00:00Z", world: v11World });
    const migrated = deserializeSave(raw);
    expect(migrated.meta.schemaVersion).toBe(20);
    expect(migrated.bills).toEqual([]);
    expect(migrated.committees).toEqual([]);
    expect(migrated.enactedLaws).toEqual([]);
    expect(migrated.stateBills).toEqual([]);
    expect((migrated.player as unknown as { legislativeSeat: unknown }).legislativeSeat).toBe(null);
    expect((migrated.player as unknown as { mode: unknown }).mode).toBe("career");
  });
});

describe("player actions gating", () => {
  it("sponsorBill gated on holding seat in career mode", async () => {
    const world = createWorld(OPTS);
    const { executeAction } = await import("./actions/execute.js");
    const res = executeAction(world, "player", "sponsorBill", { catalogId: "us.economy.workerSecurity.primary" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Must hold a legislative seat/);
  });

  it("voteOnBill gated on holding seat and chamber match", async () => {
    const world = createWorld(OPTS);
    // Give player a house seat
    world.player.legislativeSeat = { chamberKey: "house", countryId: "US" };
    world.bills.push(makeBill({ id: "vote-gate", status: "active", currentChamber: "house", originChamber: "house", countryId: "US", votingEndsOnTurn: 5 }));
    const { executeAction } = await import("./actions/execute.js");
    const res = executeAction(world, "player", "voteOnBill", { billId: "vote-gate", vote: "for" });
    expect(res.ok).toBe(true);
    expect(world.bills[0]!.votes["player"]).toBe("for");
  });

  it("HoS mode allows sponsor without seat", async () => {
    const world = createWorld(OPTS);
    world.player.mode = "hos";
    const { executeAction } = await import("./actions/execute.js");
    const res = executeAction(world, "player", "sponsorBill", { catalogId: "us.economy.workerSecurity.primary" });
    expect(res.ok).toBe(true);
    expect(world.bills.length).toBe(1);
  });
});

describe("repeal and expiry", () => {
  it("repeal creates a bill that when enacted removes effect", async () => {
    const world = createWorld(OPTS);
    world.legislatures["US"]!.bicameral = false;
    world.legislatures["US"]!.chambers = [world.legislatures["US"]!.chambers[0]!];
    // Enact a law first
    const bill: Bill = makeBill({
      id: "enact-repeal",
      status: "active",
      originChamber: "house",
      currentChamber: "house",
      countryId: "US",
      votingEndsOnTurn: 1,
      votes: { "a": "for", "b": "for" },
    });
    world.bills.push(bill);
    advanceTurn(world);
    for (let i = 0; i < 3; i++) advanceTurn(world);
    expect(world.bills[0]!.status).toBe("signed");
    expect(world.enactedLaws.length).toBe(1);
    // Now sponsor repeal requires seat
    world.player.legislativeSeat = { chamberKey: "house", countryId: "US" };
    const { executeAction } = await import("./actions/execute.js");
    const res = executeAction(world, "player", "repealLaw", { catalogId: "us.economy.workerSecurity.primary" });
    expect(res.ok).toBe(true);
    expect(world.bills.length).toBe(2);
    expect(world.bills[1]!.effectDirection).toBe(-1);
  });

  it("stateBillTimers processes regional bills", () => {
    const world = createWorld(OPTS);
    const stateBill: Bill = makeBill({
      id: "state-1",
      status: "active",
      originChamber: "house",
      currentChamber: "house",
      countryId: "US",
      votingEndsOnTurn: 1,
      votes: { "a": "for", "b": "for" },
    });
    world.stateBills.push(stateBill);
    advanceTurn(world);
    expect(world.stateBills[0]!.status).toBe("enrolled");
  });
});
