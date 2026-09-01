import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "./world.js";
import { deserializeSave, serializeSave } from "./save.js";
import { advanceTurn } from "./engine.js";
import { nppCabinetVote, cabinetDidPass, proposeCabinetNomination, processCabinetNominationLifecycle } from "./cabinet/nominationLifecycle.js";
import { clearCabinetOnTransition, fillUkCabinetDirectly } from "./cabinet/transition.js";
import { decideCaseOutcome } from "./judiciary/divergence.js";
import { processScotusTurn, ensureScotusSeats } from "./judiciary/scotusTurn.js";
import { processUkJrSurpriseTurn, UK_JR_SURPRISE_TEMPLATES, resolveUkProxyCourtLean } from "./judiciary/ukJrSurpriseTurn.js";

const OPTS = { seed: "w29-test-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

/**
 * Nomination lifecycle goldens with citations
 * Cites src/lib/cabinetNominationLifecycle.ts (party-line, didPass, seat-weighted re-tally)
 * Cites src/lib/billLifecycleHelpers.ts (didPass)
 */
describe("W29 nomination lifecycle goldens with citations", () => {
  it("nppCabinetVote: same party as nominee -> for (cite src/lib/cabinetNominationLifecycle.ts:46)", () => {
    expect(nppCabinetVote("democrat", "democrat", "republican", 0.99)).toBe("for");
  });

  it("nppCabinetVote: opposite major party -> against (cite src/lib/cabinetNominationLifecycle.ts:50-52)", () => {
    expect(nppCabinetVote("republican", "democrat", "republican", 0.99)).toBe("against");
    expect(nppCabinetVote("democrat", "republican", "democrat", 0.01)).toBe("against");
  });

  it("nppCabinetVote: same party as president -> 70% for else abstain (cite src/lib/cabinetNominationLifecycle.ts:55)", () => {
    // draw <0.7 -> for
    expect(nppCabinetVote("independent", undefined, "independent", 0.6)).toBe("for");
    expect(nppCabinetVote("independent", undefined, "independent", 0.8)).toBe("abstain");
  });

  it("nppCabinetVote: default slight support 55% for else against (cite src/lib/cabinetNominationLifecycle.ts:60)", () => {
    expect(nppCabinetVote("independent", undefined, undefined, 0.5)).toBe("for");
    expect(nppCabinetVote("independent", undefined, undefined, 0.6)).toBe("against");
  });

  it("cabinetDidPass: votesFor > votesAgainst confirms (cite src/lib/billLifecycleHelpers.ts didPass)", () => {
    expect(cabinetDidPass(52, 48)).toBe(true);
    expect(cabinetDidPass(51, 49)).toBe(true);
    expect(cabinetDidPass(50, 50)).toBe(false);
    expect(cabinetDidPass(40, 60)).toBe(false);
  });

  it("VP nomination requires both chambers (cite src/lib/cabinetNominationLifecycle.ts VP 25th Amendment)", () => {
    const world = createWorld(OPTS);
    world.meta.turn = 10;
    world.executives["US"] = { countryId: "US", presidentId: "US-1", presidentParty: "US_DEM", termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null };
    // Ensure senate and house exist
    const senateNom = {
      id: "nom1",
      countryId: "US",
      positionId: "vicePresident",
      nomineeId: "US-2",
      nomineeName: "VP Nominee",
      nomineeParty: "US_DEM",
      proposedBy: "US-1",
      proposedByName: "President",
      status: "active" as const,
      votesFor: 60,
      votesAgainst: 40,
      votesAbstain: 0,
      votes: {},
      houseVotesFor: 30,
      houseVotesAgainst: 40,
      houseVotesAbstain: 0,
      houseVotes: {},
      votingEndsOnTurn: 10,
      proposedAtTurn: 5,
    };
    world.cabinetNominations = [senateNom as never];
    world.cabinetMembers = [];
    // Senate passes but house fails -> rejected
    processCabinetNominationLifecycle(world);
    expect(world.cabinetNominations[0]!.status).toBe("rejected");
    expect(world.executives["US"]!.vicePresidentId).toBeNull();
  });

  it("presidential cabinet nomination confirms via Senate majority (cite src/lib/cabinetNominationLifecycle.ts)", () => {
    const world = createWorld(OPTS);
    world.meta.turn = 10;
    world.executives["US"] = { countryId: "US", presidentId: "US-1", presidentParty: "US_DEM", termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null };
    const nom = {
      id: "nom2",
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: "US-3",
      nomineeName: "State Nominee",
      nomineeParty: "US_DEM",
      proposedBy: "US-1",
      proposedByName: "President",
      status: "active" as const,
      votesFor: 60,
      votesAgainst: 40,
      votesAbstain: 0,
      votes: {},
      votingEndsOnTurn: 10,
      proposedAtTurn: 5,
    };
    world.cabinetNominations = [nom as never];
    world.cabinetMembers = [];
    const res = processCabinetNominationLifecycle(world);
    expect(res.confirmed).toBe(1);
    expect(world.cabinetNominations[0]!.status).toBe("confirmed");
    expect(world.cabinetMembers.some((m) => m.positionId === "secretary_of_state" && m.characterId === "US-3")).toBe(true);
  });

  it("player may be nominated per mainline eligibility (no invented shortcut)", () => {
    const world = createWorld(OPTS);
    world.player.partyId = "US_DEM";
    world.player.legislativeSeat = { chamberKey: "house", countryId: "US" };
    // Politicians pool contains player country; propose player
    world.cabinetMembers = [];
    world.cabinetNominations = [];
    const id = proposeCabinetNomination(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      nomineeId: "player",
      nomineeName: world.player.name,
      nomineeParty: "US_DEM",
      proposedBy: "US-1",
      proposedByName: "Pres",
      votingEndsOnTurn: world.meta.turn + 4,
    });
    expect(id).toBeDefined();
    expect(world.cabinetNominations.some((n) => n.nomineeId === "player")).toBe(true);
  });
});

/**
 * Confirmation vote math — seat-weighted and NPP vote logic aggregation
 */
describe("W29 confirmation vote math", () => {
  it("re-tally is votesFor > votesAgainst (golden: 51-49 confirms, 50-50 rejects)", () => {
    expect(cabinetDidPass(51, 49)).toBe(true);
    expect(cabinetDidPass(50, 50)).toBe(false);
    expect(cabinetDidPass(0, 0)).toBe(false);
  });

  it("processCabinetNominationLifecycle handles batched NPP voting deterministically", () => {
    const world = createWorld(OPTS);
    world.meta.turn = 5;
    world.executives["US"] = { countryId: "US", presidentId: "US-1", presidentParty: "US_DEM", termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null };
    // Five active noms at turn 5, voting ends at 10 — NPP votes should accumulate without duplication
    world.cabinetNominations = [];
    world.cabinetMembers = [];
    const usPols = world.politicians.filter((p) => p.countryId === "US");
    for (let i = 0; i < 3; i++) {
      const pol = usPols[i]!;
      proposeCabinetNomination(world, {
        countryId: "US",
        positionId: `secretary_of_state`,
        nomineeId: pol.id,
        nomineeName: pol.name,
        nomineeParty: pol.partyId,
        proposedBy: "US-1",
        proposedByName: "Pres",
        votingEndsOnTurn: 10,
      });
      // Unique position per iteration
      world.cabinetNominations[world.cabinetNominations.length - 1]!.positionId = `pos_${i}`;
    }
    // Deduplicate positions to avoid same pos collision
    world.cabinetNominations[0]!.positionId = "secretary_of_state";
    world.cabinetNominations[1]!.positionId = "attorney_general";
    world.cabinetNominations[2]!.positionId = "secretary_of_defense";

    processCabinetNominationLifecycle(world);
    // Each nomination should have at least some votes cast (NPP senators)
    for (const nom of world.cabinetNominations) {
      const total = nom.votesFor + nom.votesAgainst + nom.votesAbstain;
      expect(total).toBeGreaterThan(0);
    }
    // Running again should not double-vote same NPPs
    const before = world.cabinetNominations.map((n) => n.votesFor + n.votesAgainst + n.votesAbstain);
    processCabinetNominationLifecycle(world);
    const after = world.cabinetNominations.map((n) => n.votesFor + n.votesAgainst + n.votesAbstain);
    expect(after).toEqual(before);
  });
});

/**
 * Transition on new president / PM
 */
describe("W29 cabinet transition on new president/PM", () => {
  it("clearCabinetOnTransition clears US cabinet on presidential transition (cite src/lib/cabinetTransition.ts)", () => {
    const world = createWorld(OPTS);
    world.cabinetMembers = [
      { countryId: "US", positionId: "secretary_of_state", characterId: "US-1", characterName: "A", partyId: "US_DEM", appointedBy: "US-10", appointedAtTurn: 0, confirmedAtTurn: 0 },
      { countryId: "US", positionId: "attorney_general", characterId: "US-2", characterName: "B", partyId: "US_DEM", appointedBy: "US-10", appointedAtTurn: 0, confirmedAtTurn: 0 },
    ];
    world.cabinetNominations = [
      { id: "n1", countryId: "US", positionId: "secretary_of_defense", nomineeId: "US-3", nomineeName: "C", nomineeParty: "US_DEM", proposedBy: "US-10", proposedByName: "Pres", status: "active", votesFor: 0, votesAgainst: 0, votesAbstain: 0, votes: {}, votingEndsOnTurn: 20, proposedAtTurn: 0 } as never,
    ];
    const res = clearCabinetOnTransition(world, "US");
    expect(res.membersCleared).toBe(2);
    expect(res.nominationsWithdrawn).toBe(1);
    expect(world.cabinetMembers.length).toBe(0);
    expect(world.cabinetNominations[0]!.status).toBe("withdrawn");
  });

  it("UK cabinet cleared on government transition and refilled via parliamentary appointment path (cite src/lib/uk/cabinetApi.ts)", () => {
    const world = createWorld(OPTS);
    // Seed UK commons politicians manually: mainline 1953 pack has vacant commons (625 vacancies) so no NPCs
    // exist until elections resolve. For unit test we inject a few MPs so the parliamentary appointment path is exercisable.
    for (let i = 0; i < 5; i++) {
      world.politicians.push({
        id: `UK-MP-${i}`,
        name: `UK MP ${i}`,
        gender: "male",
        countryId: "UK",
        partyId: "UK_LAB",
        chamberKey: "commons",
        ideology: { economic: -2, social: -1 },
        age: 45,
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
      } as never);
    }
    world.governments["UK"] = {
      countryId: "UK",
      chamberKey: "commons",
      status: "formed",
      formationType: "majority",
      governingPartyId: "UK_LAB",
      coalitionPartyIds: null,
      pmPoliticianId: "UK-MP-0",
      totalSeatsSupporting: 300,
      majorityThreshold: 313,
      totalSeats: 625,
      seatsByParty: { UK_LAB: 300 },
      lostMajority: false,
      formedTurn: world.meta.turn,
      snapElectionsUsed: 0,
      lastSnapElectionTurn: null,
      pmVacancyDeadlineTurn: null,
      confidence: 75,
    } as never;
    world.cabinetMembers = [
      { countryId: "UK", positionId: "chancellor", characterId: "UK-MP-1", characterName: "Old Chancellor", partyId: "UK_LAB", appointedBy: "UK-MP-0", appointedAtTurn: 0, confirmedAtTurn: 0 },
    ];
    clearCabinetOnTransition(world, "UK");
    expect(world.cabinetMembers.filter((m) => m.countryId === "UK").length).toBe(0);
    const filled = fillUkCabinetDirectly(world, "UK");
    expect(filled).toBeGreaterThan(0);
    expect(world.cabinetMembers.some((m) => m.countryId === "UK" && m.positionId === "chancellor")).toBe(true);
  });

  it("UK parliamentary appointment is direct (no Senate confirmation) —-members seated same turn", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 5; i++) {
      world.politicians.push({
        id: `UK-MP-${i}`,
        name: `UK MP ${i}`,
        gender: "male",
        countryId: "UK",
        partyId: "UK_CON",
        chamberKey: "commons",
        ideology: { economic: 0, social: 0 },
        age: 45,
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
      } as never);
    }
    world.governments["UK"] = {
      countryId: "UK",
      chamberKey: "commons",
      status: "formed",
      formationType: "majority",
      governingPartyId: "UK_CON",
      coalitionPartyIds: null,
      pmPoliticianId: "UK-MP-0",
      totalSeatsSupporting: 320,
      majorityThreshold: 313,
      totalSeats: 625,
      seatsByParty: { UK_CON: 320 },
      lostMajority: false,
      formedTurn: world.meta.turn,
      snapElectionsUsed: 0,
      lastSnapElectionTurn: null,
      pmVacancyDeadlineTurn: null,
      confidence: 75,
    } as never;
    world.cabinetMembers = [];
    const filled = fillUkCabinetDirectly(world, "UK");
    expect(world.cabinetNominations?.filter((n) => n.countryId === "UK").length ?? 0).toBe(0);
    expect(filled).toBeGreaterThan(0);
    for (const m of world.cabinetMembers.filter((c) => c.countryId === "UK")) {
      expect(m.confirmedAtTurn).toBe(world.meta.turn);
    }
  });
});

/**
 * SCOTUS vacancy flow
 * Cites src/lib/turn/scotusTurn.ts, scotusTenureTurn.ts, scotusDocketTurn.ts, scotusNominationLifecycle.ts, divergence.ts
 */
describe("W29 scotus vacancy flow", () => {
  it("seats are politician-like records, 9 seats, historical mode initially (cite src/lib/db/types/scotus.ts)", () => {
    const world = createWorld(OPTS);
    ensureScotusSeats(world);
    expect(world.supremeCourtSeats.length).toBe(9);
    for (const s of world.supremeCourtSeats) {
      expect(s.justiceMode).toBe("historical");
      expect(typeof s.economicLean).toBe("number");
      expect(typeof s.socialLean).toBe("number");
      expect(s.isDivergent).toBe(false);
    }
  });

  it("vacancy -> nomination -> confirmation seats a justice and flips isDivergent (cite scotusNominationLifecycle.ts)", () => {
    const world = createWorld(OPTS);
    ensureScotusSeats(world);
    // Vacate seat 1
    const seat = world.supremeCourtSeats[0]!;
    seat.justiceMode = null;
    seat.justiceId = null;
    seat.justiceName = null;
    seat.economicLean = null;
    seat.socialLean = null;

    world.executives["US"] = { countryId: "US", presidentId: "US-1", presidentParty: "US_DEM", termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null };
    world.scotusNominations = [
      {
        id: "scotus_nom_1",
        countryId: "US",
        seatNumber: 1,
        nomineeMode: "character",
        nomineeId: "US-10",
        nomineeName: "Nominee Ten",
        nomineeParty: "US_DEM",
        proposedBy: "US-1",
        status: "active",
        votesFor: 60,
        votesAgainst: 40,
        votesAbstain: 0,
        votes: {},
        votingEndsOnTurn: world.meta.turn,
        proposedAtTurn: 0,
      } as never,
    ];

    const beforeLean = world.supremeCourtSeats[0]!.economicLean;
    processScotusTurn(world);
    expect(world.scotusNominations[0]!.status).toBe("confirmed");
    expect(world.supremeCourtSeats[0]!.justiceMode).toBe("character");
    expect(world.supremeCourtSeats[0]!.justiceName).toBe("Nominee Ten");
    expect(world.supremeCourtSeats[0]!.isDivergent).toBe(true);
    expect(world.supremeCourtSeats[0]!.divergentHazardStartsTurn).toBeDefined();
    void beforeLean;
  });

  it("docket divergence uses headcount not average (cite src/lib/scotus/divergence.ts)", () => {
    // 6 positive, 3 negative on economic -> positive majority -> diverges if historical was negative
    const leans = [
      ...Array.from({ length: 6 }, () => ({ economicLean: 1, socialLean: 0 })),
      ...Array.from({ length: 3 }, () => ({ economicLean: -1, socialLean: 0 })),
    ];
    const res = decideCaseOutcome(leans, "economic", -1);
    expect(res.majoritySide).toBe(1);
    expect(res.outcome).toBe("diverged");
    const res2 = decideCaseOutcome(leans, "economic", 1);
    expect(res2.outcome).toBe("affirmed");
  });

  it("historicalOutcomeLocked forces affirmed regardless of lean (cite src/lib/scotus/divergence.ts Brown)", () => {
    const leans = Array.from({ length: 9 }, () => ({ economicLean: 5, socialLean: 5 }));
    const res = decideCaseOutcome(leans, "economic", -1, { historicalOutcomeLocked: true });
    expect(res.outcome).toBe("affirmed");
  });

  it("enacted diverged ruling flows into enactedLaws (cite scotusDocketTurn.ts enactRulingBill)", () => {
    const world = createWorld(OPTS);
    world.meta.turn = 60;
    world.meta.date = "1954-02-10";
    ensureScotusSeats(world);
    // Make all seats positive economic so 9-0 positive majority
    for (const s of world.supremeCourtSeats) { s.economicLean = 2; s.socialLean = 2; }
    world.docketCases = [
      {
        id: "d1",
        countryId: "US",
        caseKey: "test-case-1954",
        title: "Test v. US",
        axis: "economic",
        historicalMajorityDirection: -1,
        decisionYear: 1953,
        effect: { legislationTypeId: "civil_rights", policyOptionId: "opt_1", effectDirection: 1 },
        status: "pending",
      } as never,
    ];
    const before = world.enactedLaws.length;
    processScotusTurn(world);
    expect(world.docketCases[0]!.status).toBe("decided");
    expect(world.docketCases[0]!.outcome).toBe("diverged");
    expect(world.enactedLaws.length).toBe(before + 1);
    // solo's EnactedLaw is minimal (billId-based); mainline's source field is PORT-STUB to news
    expect(world.news.some((n) => n.headline.includes("divergence"))).toBe(true);
  });

  it("UK judicial review surprise turn ported with citations (src/lib/turn/ukJrSurpriseTurn.ts)", () => {
    const world = createWorld(OPTS);
    // Force a spawn by setting gov left lean and manipulating RNG to hit the 0.0035 window
    // Instead drive the pure helper deterministically
    expect(resolveUkProxyCourtLean(world, "economic")).toBe(0); // no UK gov yet -> split
    world.governments["UK"] = {
      countryId: "UK",
      chamberKey: "commons",
      status: "formed",
      formationType: "majority",
      governingPartyId: "UK_LAB",
      coalitionPartyIds: null,
      pmPoliticianId: "UK-1",
      totalSeatsSupporting: 350,
      majorityThreshold: 313,
      totalSeats: 625,
      seatsByParty: { UK_LAB: 350 },
      lostMajority: false,
      formedTurn: 0,
      snapElectionsUsed: 0,
      lastSnapElectionTurn: null,
      pmVacancyDeadlineTurn: null,
      confidence: 75,
    } as never;
    // UK_LAB economicPosition -2 (from seed) -> left lean returns -1
    expect(resolveUkProxyCourtLean(world, "economic")).toBe(-1);
    expect(resolveUkProxyCourtLean(world, "social")).toBe(-1);
    expect(UK_JR_SURPRISE_TEMPLATES.length).toBe(8);
    // Verify case creation does not throw even without spawn
    const w2 = createWorld(OPTS);
    const res = processUkJrSurpriseTurn(w2);
    expect(typeof res.spawned).toBe("boolean");
    if (res.spawned) {
      expect(res.caseKey).toBeDefined();
      expect([-1, 0, 1]).toContain(res.majoritySide);
      expect(w2.ukJudicialReviewCases.length).toBe(1);
    }
  });
});

/**
 * Determinism — no Math.random/Date.now/IO, all RNG through world RNG
 */
describe("W29 determinism", () => {
  it("turn is deterministic for identical seeds (including cabinet/scotus/ukjr)", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 30; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("cabinet and scotus phases do not throw and preserve determinism across re-seed", () => {
    const a = createWorld({ seed: "det2", playerName: "P", countryId: "UK", era: "1953" });
    const b = createWorld({ seed: "det2", playerName: "P", countryId: "UK", era: "1953" });
    for (let i = 0; i < 10; i++) {
      advanceTurn(a);
      advanceTurn(b);
      expect(a.cabinetMembers).toEqual(b.cabinetMembers);
      expect(a.supremeCourtSeats).toEqual(b.supremeCourtSeats);
      expect(a.ukJudicialReviewCases).toEqual(b.ukJudicialReviewCases);
    }
  });
});

/**
 * Migration — chained v23 -> v24 -> v25
 */
describe("W29 migration", () => {
  it("v23 save migrates to v25 via chained migrations (resolver note: main v23, parallel holds v24)", () => {
    const world = createWorld(OPTS);
    const v23 = structuredClone(world) as unknown as Record<string, unknown>;
    v23["meta"] = { ...world.meta, schemaVersion: 23 };
    delete v23["cabinetMembers"];
    delete v23["cabinetNominations"];
    delete v23["supremeCourtSeats"];
    delete v23["scotusNominations"];
    delete v23["docketCases"];
    delete v23["ukJudicialReviewCases"];

    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 23, savedAt: "2026-01-01T00:00:00Z", world: v23 });
    const migrated = deserializeSave(raw);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.meta.schemaVersion).toBe(25);
    expect(Array.isArray(migrated.cabinetMembers)).toBe(true);
    expect(Array.isArray(migrated.cabinetNominations)).toBe(true);
    expect(Array.isArray(migrated.supremeCourtSeats)).toBe(true);
    expect(Array.isArray(migrated.scotusNominations)).toBe(true);
    expect(Array.isArray(migrated.docketCases)).toBe(true);
    expect(Array.isArray(migrated.ukJudicialReviewCases)).toBe(true);
    // Chained determinism: two deserializations equal
    const migrated2 = deserializeSave(raw);
    expect(JSON.stringify(migrated)).toBe(JSON.stringify(migrated2));
  });

  it("old save round-trips through serialize/deserialize deterministically", () => {
    const world = createWorld(OPTS);
    world.meta.turn = 15;
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const a = deserializeSave(raw);
    const b = deserializeSave(raw);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.meta.schemaVersion).toBe(25);
  });
});
