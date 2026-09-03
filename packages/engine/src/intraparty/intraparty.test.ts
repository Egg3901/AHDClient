import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { advanceCalendarPhase } from "../phases/advanceCalendar.js";
import { rngFromSeed } from "../rng.js";
import {
  STATE_PARTY_ELECTION_DURATION_TURNS,
  NATIONAL_PARTY_ELECTION_DURATION_TURNS,
  COMMITTEE_ELECTION_DURATION_TURNS,
  COMMITTEE_SIZE,
  COALITION_DISBAND_VOTE_DURATION_TURNS,
} from "./constants.js";

const OPTS = { seed: "intraparty-test-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("intraparty cycle goldens with citations", () => {
  it("state party elections cycle is 72 turns per src/lib/statePartyElections.ts ELECTION_DURATION_TURNS", () => {
    expect(STATE_PARTY_ELECTION_DURATION_TURNS).toBe(72);
    const world = createWorld(OPTS);
    // After one turn, elections should exist with endTurn = 0 + 72
    advanceTurn(world);
    const e = world.statePartyElections[0];
    expect(e).toBeDefined();
    expect(e!.durationTurns).toBe(72);
    expect(e!.endTurn - e!.startTurn).toBe(72);
  });

  it("national party election duration is 72 per src/lib/nationalPartyElections.ts NATIONAL_ELECTION_DURATION_TURNS", () => {
    expect(NATIONAL_PARTY_ELECTION_DURATION_TURNS).toBe(72);
    const world = createWorld(OPTS);
    advanceTurn(world);
    const e = world.nationalPartyElections.find((x) => x.position === "chair");
    expect(e).toBeDefined();
    expect(e!.durationTurns).toBe(72);
  });

  it("committee election duration is 168 per src/lib/nationalCommitteeElections.ts COMMITTEE_ELECTION_DURATION_TURNS", () => {
    expect(COMMITTEE_ELECTION_DURATION_TURNS).toBe(168);
    expect(COMMITTEE_SIZE).toBe(6);
    const world = createWorld(OPTS);
    advanceTurn(world);
    const e = world.nationalCommitteeElections[0];
    expect(e).toBeDefined();
    expect(e!.durationTurns).toBe(168);
  });

  it("coalition disband vote duration is 168 turns mirroring mainline 7 days at 1 turn/hour", () => {
    expect(COALITION_DISBAND_VOTE_DURATION_TURNS).toBe(168);
  });

  it("state elections create one per position per region-party on first turn after genesis", () => {
    const world = createWorld(OPTS);
    expect(world.statePartyElections.length).toBe(0);
    advanceTurn(world);
    // Count: US has 48 states * parties for US (2 majors DEM/REP) * 3 positions
    // But engine seeds also minor parties? Check count dynamically
    const usParties = Object.values(world.parties).filter((p) => p.countryId === "US");
    const usRegions = Object.values(world.regions).filter((r) => r.countryId === "US");
    const expected = usRegions.length * usParties.length * 3 + // US
      Object.values(world.regions).filter((r) => r.countryId !== "US").length * Object.values(world.parties).filter((p) => p.countryId !== "US").length * 0; // simplified
    // Instead assert at least US portion present
    const usStateElections = world.statePartyElections.filter((e) => e.countryId === "US");
    expect(usStateElections.length).toBe(usRegions.length * usParties.length * 3);
    // Each has startTurn 1
    expect(usStateElections[0]!.startTurn).toBe(1);
    expect(usStateElections[0]!.endTurn).toBe(1 + 72);
  });

  it("elections deterministically advance with rng and resolve", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 80; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.statePartyElections)).toBe(JSON.stringify(b.statePartyElections));
    expect(JSON.stringify(a.nationalPartyElections)).toBe(JSON.stringify(b.nationalPartyElections));
    expect(JSON.stringify(a.nationalCommitteeElections)).toBe(JSON.stringify(b.nationalCommitteeElections));
    // After 80 turns, state elections should have resolved (72 duration)
    const completed = a.statePartyElections.filter((e) => e.status === "completed");
    expect(completed.length).toBeGreaterThan(0);
    // NPC ballots are transient tallies. Persisting every politician's vote
    // in every regional race made mature mobile saves hundreds of MiB.
    expect(completed.every((e) => Object.keys(e.votes).length === 0)).toBe(true);
    expect(a.nationalPartyElections
      .filter((e) => e.status === "completed")
      .every((e) => Object.keys(e.votes).length === 0)).toBe(true);
    expect(JSON.stringify(a.statePartyElections).length).toBeLessThan(1_000_000);

    const legacy = completed[0]!;
    legacy.votes["legacy-npc"] = legacy.candidateIds[0]!;
    legacy.votes["player"] = legacy.candidateIds[0]!;
    const restored = deserializeSave(serializeSave(a, "2026-09-02T00:00:00.000Z"));
    const compacted = restored.statePartyElections.find((e) => e.id === legacy.id)!;
    expect(compacted.votes).toEqual({ player: legacy.candidateIds[0] });
  });
});

describe("leadership changes deterministic", () => {
  it("resolving state elections sets partyRegion leadership and is deterministic", () => {
    const a = createWorld({ seed: "leadership-a", playerName: "P", countryId: "US", era: "1953" });
    const b = createWorld({ seed: "leadership-a", playerName: "P", countryId: "US", era: "1953" });
    for (let i = 0; i < 80; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.partyRegions)).toBe(JSON.stringify(b.partyRegions));
    // Some region should have chair assigned after resolution
    const assigned = Object.values(a.partyRegions).filter((pr) => pr.chairId !== null);
    expect(assigned.length).toBeGreaterThan(0);
  });

  it("national leadership winners get party role", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 80; i++) advanceTurn(world);
    // After resolution, some national party should have chairId set
    const withChair = Object.values(world.parties).filter((p) => p.chairId);
    // Depends on elections completing; at least US majors should have had chance
    // National elections at 72 duration resolve by turn 73 (started turn 1). So by 80 should have one cycle complete.
    expect(withChair.length).toBeGreaterThan(0);
    // Deterministic: re-run gives same chairs
    const world2 = createWorld(OPTS);
    for (let i = 0; i < 80; i++) advanceTurn(world2);
    expect(JSON.stringify(Object.values(world.parties).map((p) => p.chairId).sort())).toBe(
      JSON.stringify(Object.values(world2.parties).map((p) => p.chairId).sort()),
    );
  });

  it("player ballot action votes and influences tally", () => {
    const world = createWorld({ seed: "ballot-player", playerName: "Player", countryId: "US", era: "1953" });
    // Join a party so player can vote
    world.player.partyId = "US_DEM";
    world.player.actions = 100;
    advanceTurn(world); // creates elections
    const election = world.nationalPartyElections.find((e) => e.status === "voting" && e.partyId === "US_DEM");
    expect(election).toBeDefined();
    const targetCandidate = election!.candidateIds[0]!;
    const res = executeAction(world, "player", "votePartyLeadership", {
      intrapartyElectionId: election!.id,
      candidateId: targetCandidate,
    });
    expect(res.ok).toBe(true);
    expect(election!.votes["player"]).toBe(targetCandidate);
    // NPC votes still auto-filled at resolution with ballot.ts logic citing nppVoteLogic
  });

  it("committee player ballot respects max 6 picks", () => {
    const world = createWorld({ seed: "committee-player", playerName: "Player", countryId: "US", era: "1953" });
    world.player.partyId = "US_DEM";
    world.player.actions = 100;
    advanceTurn(world);
    const committee = world.nationalCommitteeElections.find((e) => e.status === "voting" && e.partyId === "US_DEM");
    expect(committee).toBeDefined();
    const picks = committee!.candidateIds.slice(0, 7);
    const resTooMany = executeAction(world, "player", "voteCommittee", {
      intrapartyElectionId: committee!.id,
      committeeCandidateIds: picks,
    });
    expect(resTooMany.ok).toBe(false);
    const resOk = executeAction(world, "player", "voteCommittee", {
      intrapartyElectionId: committee!.id,
      committeeCandidateIds: picks.slice(0, 6),
    });
    expect(resOk.ok).toBe(true);
  });
});

describe("coalition lifecycle", () => {
  it("create, join, disband vote majority threshold floor(n/2)+1 per src/lib/turn/coalitionDisbandCheck.ts", async () => {
    const world = createWorld(OPTS);
    world.player.partyId = "US_DEM";
    world.player.actions = 100;
    const resCreate = executeAction(world, "player", "createCoalition", {
      coalitionName: "Test Coalition",
      coalitionAbbr: "TC",
      countryId: "US",
    });
    expect(resCreate.ok).toBe(true);
    const co = world.coalitions[0]!;
    expect(co.memberPartyIds).toContain("US_DEM");
    // Join with another party (simulate via direct join)
    const { joinCoalition: joinCoalitionFn, initiateDisbandVote: initiateDisbandVoteFn, voteDisband: voteDisbandFn } = await import("./coalitions.js");
    // Need second party - use US_REP via manual join
    joinCoalitionFn(world, co.id, "US_REP");
    expect(co.memberPartyIds.length).toBe(2);
    expect(co.memberPartyIds).toContain("US_REP");
    // Initiate disband vote
    initiateDisbandVoteFn(world, co.id, "US_DEM");
    expect(co.disbandVote).not.toBeNull();
    expect(co.disbandVote!.expiresOnTurn).toBe(world.meta.turn + 168);
    // Vote: 1 yes out of 2 needs threshold 2 (floor(2/2)+1=2) so should NOT disband yet
    voteDisbandFn(world, co.id, "US_DEM", "yes");
    voteDisbandFn(world, co.id, "US_REP", "no");
    // Advance to expiry
    const expires = co.disbandVote!.expiresOnTurn;
    while (world.meta.turn < expires) advanceTurn(world);
    // After expiry, vote should have failed (1 yes <2), coalition remains but vote cleared
    const after = world.coalitions.find((c) => c.id === co.id);
    expect(after).toBeDefined();
    expect(after!.disbandVote).toBeNull();
    // Now create majority: both yes
    initiateDisbandVoteFn(world, after!.id, "US_DEM");
    voteDisbandFn(world, after!.id, "US_DEM", "yes");
    voteDisbandFn(world, after!.id, "US_REP", "yes");
    const expires2 = after!.disbandVote!.expiresOnTurn;
    while (world.meta.turn < expires2) advanceTurn(world);
    // Should be disbanded
    expect(world.coalitions.find((c) => c.id === co.id)).toBeUndefined();
  });

  it("player actions for coalition disband voting work via catalog", () => {
    const world = createWorld(OPTS);
    world.player.partyId = "US_DEM";
    world.player.actions = 100;
    executeAction(world, "player", "createCoalition", { coalitionName: "C2", coalitionAbbr: "C2", countryId: "US" });
    const co = world.coalitions[0]!;
    const res = executeAction(world, "player", "initiateCoalitionDisband", { coalitionId: co.id });
    expect(res.ok).toBe(true);
    const voteRes = executeAction(world, "player", "voteCoalitionDisband", { coalitionId: co.id, disbandVote: "yes" });
    expect(voteRes.ok).toBe(true);
    expect(co.disbandVote!.votes["US_DEM"]).toBe("yes");
  });
});

describe("migration v18->v21", () => {
  it("migrates v18 saves to v21 with new fields", () => {
    const world = createWorld(OPTS);
    // Fake v18 payload
    const raw = serializeSave({ ...world, meta: { ...world.meta, schemaVersion: 18 } } as typeof world, "2026-01-01T00:00:00Z");
    const parsed = JSON.parse(raw) as { world: Record<string, unknown>; schemaVersion: number };
    // Downgrade to 18 by stripping new arrays and leadership fields
    delete (parsed.world as Record<string, unknown>)["statePartyElections"];
    delete (parsed.world as Record<string, unknown>)["nationalPartyElections"];
    delete (parsed.world as Record<string, unknown>)["nationalCommitteeElections"];
    delete (parsed.world as Record<string, unknown>)["coalitions"];
    for (const p of Object.values(parsed.world["parties"] as Record<string, Record<string, unknown>>)) {
      delete p["chairId"];
      delete p["viceChairId"];
      delete p["treasurerId"];
      delete p["committeeIds"];
    }
    for (const pr of Object.values(parsed.world["partyRegions"] as Record<string, Record<string, unknown>>)) {
      delete pr["chairId"];
      delete pr["viceChairId"];
      delete pr["treasurerId"];
    }
    parsed.schemaVersion = 18;
    (parsed.world as Record<string, unknown> & { meta: Record<string, unknown> }).meta["schemaVersion"] = 18;
    const raw18 = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 18, savedAt: "2026-01-01T00:00:00Z", world: parsed.world });
    const migrated = deserializeSave(raw18);
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Array.isArray(migrated.statePartyElections)).toBe(true);
    expect(Array.isArray(migrated.nationalPartyElections)).toBe(true);
    expect(Array.isArray(migrated.nationalCommitteeElections)).toBe(true);
    expect(Array.isArray(migrated.coalitions)).toBe(true);
    // Leadership backfilled
    const someParty = Object.values(migrated.parties)[0]!;
    expect(someParty.chairId === null || typeof someParty.chairId === "string").toBe(true);
  });

  it("chained migration is idempotent", () => {
    const world = createWorld(OPTS);
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const a = deserializeSave(raw);
    const b = deserializeSave(serializeSave(a, "2026-01-02T00:00:00Z"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
