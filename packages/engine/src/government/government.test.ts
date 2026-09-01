import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { SaveFile } from "../save.js";
import type { Politician } from "../types.js";
import { computeFormation, selectPm } from "./formation.js";
import { governmentFormationPhase, governmentVacancyWatcherPhase, triggerSnapElection } from "./phases.js";
import { PM_VACANCY_DEADLINE_TURNS, majorityThreshold, minorityThreshold, noConfidenceMotionCarries } from "./constants.js";

const OPTS = { seed: "gov-test", playerName: "Tester", countryId: "UK", era: "1953" } as const;

function makePolitician(id: string, countryId: string, partyId: string, chamberKey: string, partyInfluence = 0): Politician {
  return {
    id,
    name: `Pol ${id}`,
    gender: "male",
    countryId,
    partyId,
    chamberKey,
    ideology: { economic: 0, social: 0 },
    age: 45,
    partyInfluence,
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

describe("computeFormation (pure seat math)", () => {
  it("forms a majority government for a single party clearing floor(total/2)+1", () => {
    const out = computeFormation({ A: 400, B: 200, C: 25 }, 625);
    expect(majorityThreshold(625)).toBe(313);
    expect(out).toEqual({ formationType: "majority", governingPartyId: "A", coalitionPartyIds: null, totalSeatsSupporting: 400 });
  });

  it("hung parliament: builds a coalition of the largest parties until majority clears", () => {
    const out = computeFormation({ A: 300, B: 250, C: 75 }, 625);
    // No single party clears 313; A+B = 550 clears it.
    expect(out).toEqual({ formationType: "coalition", governingPartyId: "A", coalitionPartyIds: ["A", "B"], totalSeatsSupporting: 550 });
  });

  it("forms a minority government when no majority coalition is reachable but the leader clears the 15.38% floor", () => {
    expect(minorityThreshold(625)).toBe(97);
    // A+B = 250, well short of 313 even summing every seat held; A alone
    // clears the minority floor (150 >= 97).
    const out = computeFormation({ A: 150, B: 100 }, 625);
    expect(out).toEqual({ formationType: "minority", governingPartyId: "A", coalitionPartyIds: null, totalSeatsSupporting: 150 });
  });

  it("stays hung with no eligible bid when the leader is below the minority floor", () => {
    const out = computeFormation({ A: 60, B: 50 }, 625);
    expect(out).toEqual({ formationType: null, governingPartyId: null, coalitionPartyIds: null, totalSeatsSupporting: 0 });
  });

  it("returns no formation for an empty chamber", () => {
    expect(computeFormation({}, 625)).toEqual({ formationType: null, governingPartyId: null, coalitionPartyIds: null, totalSeatsSupporting: 0 });
  });
});

describe("selectPm", () => {
  it("PORT-STUB fallback: picks the seat-holding politician with the highest partyInfluence, tie-break by id", () => {
    const w = createWorld(OPTS);
    w.politicians.push(makePolitician("UK-senior", "UK", "UK_LAB", "commons", 80));
    w.politicians.push(makePolitician("UK-junior", "UK", "UK_LAB", "commons", 10));
    expect(selectPm(w, "UK", "commons", "UK_LAB")).toBe("UK-senior");
  });

  it("tie-break is deterministic (lowest id) when partyInfluence is equal", () => {
    const w = createWorld(OPTS);
    w.politicians.push(makePolitician("UK-b", "UK", "UK_LAB", "commons", 50));
    w.politicians.push(makePolitician("UK-a", "UK", "UK_LAB", "commons", 50));
    expect(selectPm(w, "UK", "commons", "UK_LAB")).toBe("UK-a");
  });

  it("prefers a feature-detected chairId over the partyInfluence fallback", () => {
    const w = createWorld(OPTS);
    w.politicians.push(makePolitician("UK-senior", "UK", "UK_LAB", "commons", 80));
    w.politicians.push(makePolitician("UK-chair", "UK", "UK_LAB", "commons", 5));
    (w.parties["UK_LAB"] as unknown as Record<string, unknown>)["chairId"] = "UK-chair";
    expect(selectPm(w, "UK", "commons", "UK_LAB")).toBe("UK-chair");
  });

  it("returns null when the party holds no seat in the chamber (never invents a player-PM shortcut)", () => {
    const w = createWorld(OPTS);
    expect(selectPm(w, "UK", "commons", "UK_LAB")).toBeNull();
  });
});

describe("governmentFormationPhase (integration)", () => {
  it("RU and DD form a majority government on turn 1 from their seeded landslide composition", () => {
    const w = createWorld({ seed: "gov-ru-dd", playerName: "Tester", countryId: "US", era: "1953" });
    advanceTurn(w);
    const ru = w.governments["RU"]!;
    expect(ru.status).toBe("formed");
    expect(ru.formationType).toBe("majority");
    expect(ru.governingPartyId).toBe("RU_CPSU");
    expect(ru.pmPoliticianId).not.toBeNull();
    expect(ru.confidence).toBe(75);

    const dd = w.governments["DD"]!;
    expect(dd.status).toBe("formed");
    expect(dd.formationType).toBe("majority");
    expect(dd.governingPartyId).toBe("DD_SED");
    expect(dd.pmPoliticianId).not.toBeNull();
  });

  it("forms a majority UK government from a fabricated commons composition", () => {
    const w = createWorld(OPTS);
    const commons = w.legislatures["UK"]!.chambers.find((c) => c.key === "commons")!;
    commons.composition = { seatsByParty: { UK_LAB: 400, UK_CON: 225 }, vacancies: 0 };
    w.politicians.push(makePolitician("UK-lab-1", "UK", "UK_LAB", "commons", 20));
    w.politicians.push(makePolitician("UK-con-1", "UK", "UK_CON", "commons", 20));

    governmentFormationPhase.run(w, undefined as never);

    const gov = w.governments["UK"]!;
    expect(gov.status).toBe("formed");
    expect(gov.formationType).toBe("majority");
    expect(gov.governingPartyId).toBe("UK_LAB");
    expect(gov.pmPoliticianId).toBe("UK-lab-1");
    expect(gov.totalSeatsSupporting).toBe(400);
    expect(gov.majorityThreshold).toBe(313);
    expect(gov.lostMajority).toBe(false);
    expect(gov.confidence).toBe(75);
  });

  it("hung UK parliament forms a coalition per computeFormation's rules, picking a PM from the lead coalition party", () => {
    const w = createWorld(OPTS);
    const commons = w.legislatures["UK"]!.chambers.find((c) => c.key === "commons")!;
    commons.composition = { seatsByParty: { UK_LAB: 300, UK_CON: 250, UK_LIB: 75 }, vacancies: 0 };
    w.politicians.push(makePolitician("UK-lab-1", "UK", "UK_LAB", "commons", 20));
    w.politicians.push(makePolitician("UK-con-1", "UK", "UK_CON", "commons", 20));
    w.politicians.push(makePolitician("UK-lib-1", "UK", "UK_LIB", "commons", 20));

    governmentFormationPhase.run(w, undefined as never);

    const gov = w.governments["UK"]!;
    expect(gov.status).toBe("formed");
    expect(gov.formationType).toBe("coalition");
    expect(gov.governingPartyId).toBe("UK_LAB");
    expect(gov.coalitionPartyIds).toEqual(["UK_CON", "UK_LAB"].sort());
    expect(gov.pmPoliticianId).toBe("UK-lab-1");
    expect(gov.totalSeatsSupporting).toBe(550);
  });

  it("stays pending (hung, no eligible bid) and arms the PM vacancy deadline", () => {
    const w = createWorld(OPTS);
    const commons = w.legislatures["UK"]!.chambers.find((c) => c.key === "commons")!;
    commons.composition = { seatsByParty: { UK_LAB: 60, UK_CON: 50 }, vacancies: 515 };
    w.politicians.push(makePolitician("UK-lab-1", "UK", "UK_LAB", "commons", 20));
    w.politicians.push(makePolitician("UK-con-1", "UK", "UK_CON", "commons", 20));

    governmentFormationPhase.run(w, undefined as never);

    const gov = w.governments["UK"]!;
    expect(gov.status).toBe("pending");
    expect(gov.pmPoliticianId).toBeNull();
    expect(gov.pmVacancyDeadlineTurn).toBe(w.meta.turn + PM_VACANCY_DEADLINE_TURNS);
  });

  it("re-forming with the same PM applies the renewal bump; a new PM resets confidence to the initial value", () => {
    const w = createWorld(OPTS);
    const commons = w.legislatures["UK"]!.chambers.find((c) => c.key === "commons")!;
    commons.composition = { seatsByParty: { UK_LAB: 400, UK_CON: 225 }, vacancies: 0 };
    w.politicians.push(makePolitician("UK-lab-1", "UK", "UK_LAB", "commons", 20));
    w.politicians.push(makePolitician("UK-con-1", "UK", "UK_CON", "commons", 20));
    governmentFormationPhase.run(w, undefined as never);
    expect(w.governments["UK"]!.confidence).toBe(75);

    // Simulate a fresh commons election resolving with the same lead
    // politician still holding a seat: government resets to pending, then
    // re-forms with the same PM this same phase pass.
    w.elections.push({
      id: "commons:UK:-:c1",
      electionType: "commons",
      countryId: "UK",
      cycle: 1,
      status: "resolved",
      startTurn: w.meta.turn,
      primaryEndTurn: w.meta.turn,
      endTurn: w.meta.turn,
      totalSeats: 625,
      chamberKey: "commons",
      candidates: [],
      tally: {},
      resolvedTurn: w.meta.turn,
    });
    governmentFormationPhase.run(w, undefined as never);
    expect(w.governments["UK"]!.pmPoliticianId).toBe("UK-lab-1");
    expect(w.governments["UK"]!.confidence).toBe(80);
  });
});

describe("governmentVacancyWatcherPhase / triggerSnapElection", () => {
  it("fires an auto-snap_commons election once the PM vacancy deadline passes on a hung parliament", () => {
    const w = createWorld(OPTS);
    const commons = w.legislatures["UK"]!.chambers.find((c) => c.key === "commons")!;
    commons.composition = { seatsByParty: { UK_LAB: 60, UK_CON: 50 }, vacancies: 515 };
    w.politicians.push(makePolitician("UK-lab-1", "UK", "UK_LAB", "commons", 20));
    w.politicians.push(makePolitician("UK-con-1", "UK", "UK_CON", "commons", 20));
    governmentFormationPhase.run(w, undefined as never);
    const gov = w.governments["UK"]!;
    expect(gov.status).toBe("pending");
    const deadline = gov.pmVacancyDeadlineTurn!;

    w.meta.turn = deadline;
    governmentVacancyWatcherPhase.run(w, undefined as never);

    const snap = w.elections.find((e) => e.electionType === "snap_commons");
    expect(snap).toBeDefined();
    expect(snap!.status).toBe("upcoming");
    expect(snap!.startTurn).toBe(deadline + 1);
    expect(snap!.totalSeats).toBe(625);
    expect(gov.snapElectionsUsed).toBe(1);
    expect(gov.lastSnapElectionTurn).toBe(deadline);
    expect(gov.pmVacancyDeadlineTurn).toBe(deadline + PM_VACANCY_DEADLINE_TURNS);
  });

  it("cancels an already-scheduled unresolved commons election before spawning the snap", () => {
    const w = createWorld(OPTS);
    const commons = w.legislatures["UK"]!.chambers.find((c) => c.key === "commons")!;
    commons.composition = { seatsByParty: {}, vacancies: 625 };
    w.elections.push({
      id: "commons:UK:-:c1",
      electionType: "commons",
      countryId: "UK",
      cycle: 1,
      status: "upcoming",
      startTurn: 500,
      primaryEndTurn: 524,
      endTurn: 548,
      totalSeats: 625,
      chamberKey: "commons",
      candidates: [],
      tally: {},
    });
    const gov = w.governments["UK"] = {
      countryId: "UK",
      chamberKey: "commons",
      status: "pending",
      formationType: null,
      governingPartyId: null,
      coalitionPartyIds: null,
      pmPoliticianId: null,
      totalSeatsSupporting: 0,
      majorityThreshold: 313,
      totalSeats: 625,
      seatsByParty: {},
      lostMajority: false,
      formedTurn: null,
      snapElectionsUsed: 0,
      lastSnapElectionTurn: null,
      pmVacancyDeadlineTurn: 0,
      confidence: 0,
    };
    triggerSnapElection(w, "UK", "commons", gov);
    expect(w.elections.find((e) => e.id === "commons:UK:-:c1")).toBeUndefined();
    const snap = w.elections.find((e) => e.electionType === "snap_commons");
    expect(snap!.cycle).toBe(2);
  });
});

describe("noConfidenceMotionCarries (pure predicate, ported for a future action layer)", () => {
  it("uses whole-chamber majority of the threshold, not majority of votes cast", () => {
    expect(noConfidenceMotionCarries({ votesFor: 215, votesAgainst: 0, totalSeats: 625 })).toBe(false);
    expect(noConfidenceMotionCarries({ votesFor: 313, votesAgainst: 0, totalSeats: 625 })).toBe(true);
    expect(noConfidenceMotionCarries({ votesFor: 312, votesAgainst: 1, totalSeats: 625 })).toBe(false);
  });

  it("falls back to a strict majority of votes cast when no threshold/totalSeats is known", () => {
    expect(noConfidenceMotionCarries({ votesFor: 5, votesAgainst: 4 })).toBe(true);
    expect(noConfidenceMotionCarries({ votesFor: 5, votesAgainst: 5 })).toBe(false);
  });
});

describe("determinism", () => {
  it("government state is byte-identical across two runs from the same seed", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 300; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.governments)).toBe(JSON.stringify(b.governments));
    expect(a.governments["RU"]?.status).toBe("formed");
    expect(a.governments["DD"]?.status).toBe("formed");
  });
});

describe("migration (v20 -> v22)", () => {
  it("adds an empty governments map to a pre-W23 save", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00.000Z")) as SaveFile;
    raw.schemaVersion = 20;
    (raw.world.meta as unknown as Record<string, unknown>)["schemaVersion"] = 20;
    delete (raw.world as unknown as Record<string, unknown>)["governments"];

    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(31);
    expect(migrated.governments).toEqual({});
  });

  it("is idempotent on an already-current save", () => {
    const w = createWorld(OPTS);
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const a = deserializeSave(raw);
    const b = deserializeSave(raw);
    expect(JSON.stringify(a.governments)).toBe(JSON.stringify(b.governments));
    expect(a.meta.schemaVersion).toBe(31);
  });
});
