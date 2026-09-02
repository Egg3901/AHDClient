import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { cycleContextForWorld } from "./orchestration.js";

const OPTS = { seed: "elections-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("election orchestration (W21c)", () => {
  it("spawns and resolves deterministically", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 120; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.elections)).toBe(JSON.stringify(b.elections));
    expect(a.elections.some((e) => e.status === "resolved")).toBe(true);
  });

  it("keeps house seat invariants exact over 700 turns", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 700; i++) advanceTurn(w);
    const house = w.legislatures["US"]!.chambers.find((c) => c.key === "house")!;
    const sum = Object.values(house.composition.seatsByParty).reduce((x, y) => x + y, 0) + house.composition.vacancies;
    expect(sum).toBe(house.seats);
    expect(house.composition.vacancies).toBe(0);
    const byState = new Map<string, number>();
    for (const p of w.politicians) {
      if (p.chamberKey === "house") byState.set(p.electedState ?? "?", (byState.get(p.electedState ?? "?") ?? 0) + 1);
    }
    for (const st of Object.values(w.regions).filter((r) => r.countryId === "US")) {
      expect(byState.get(st.id) ?? 0).toBe(st.houseSeats);
    }
  });

  it("senate seats stay 96 with the pre-statehood classes vacant", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 400; i++) advanceTurn(w);
    const senate = w.legislatures["US"]!.chambers.find((c) => c.key === "senate")!;
    const held = Object.values(senate.composition.seatsByParty).reduce((x, y) => x + y, 0);
    expect(held).toBe(96);
    expect(senate.composition.vacancies).toBe(4);
  });

  it("losing generated challengers retire; NPC population stays bounded", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 700; i++) advanceTurn(w);
    // W40 made the real seat count large (RU republic soviets alone hold
    // 5000), so the bound is structural, not a magic number: every generated
    // politician must either hold a seat or be an active candidate; the
    // unseated-orphan class (ex-holders displaced by a race they were not in)
    // must stay near zero, and the total must fit inside chamber capacity plus
    // seeded roster plus in-flight candidates.
    const capacity = Object.values(w.legislatures).reduce(
      (sum, leg) => sum + leg.chambers.reduce((x, c) => x + c.seats, 0),
      0,
    );
    const seeded = w.politicians.filter((p) => !p.id.includes("-CH")).length;
    const inFlight = w.elections.filter((e) => e.status !== "resolved").reduce((x, e) => x + e.candidates.length, 0);
    const orphans = w.politicians.filter((p) => p.id.includes("-CH") && p.chamberKey === "").length;
    expect(orphans).toBeLessThanOrEqual(inFlight + Object.keys(w.governors).length + 50);
    expect(w.politicians.length).toBeLessThanOrEqual(capacity + seeded + inFlight + 100);
  });

  it("player can join a party, declare, and the race resolves with news", () => {
    const w = createWorld(OPTS);
    const join = executeAction(w, "player", "joinParty", { partyId: "US_DEM" });
    expect(join.ok).toBe(true);
    // advance until a US house race is active and inside its filing window
    let target: string | null = null;
    for (let i = 0; i < 200 && !target; i++) {
      advanceTurn(w);
      const rec = w.elections.find(
        (e) => e.electionType === "house" && e.status === "active" && w.meta.turn <= e.primaryEndTurn,
      );
      if (rec) target = rec.id;
    }
    expect(target).not.toBeNull();
    const declare = executeAction(w, "player", "declareCandidacy", { electionId: target! });
    expect(declare.ok).toBe(true);
    const rec = w.elections.find((e) => e.id === target)!;
    expect(rec.candidates.some((c) => c.id === "player")).toBe(true);
    // second declaration elsewhere is blocked
    const other = w.elections.find((e) => e.id !== target && e.status !== "resolved" && e.countryId === "US");
    if (other) {
      const second = executeAction(w, "player", "declareCandidacy", { electionId: other.id });
      expect(second.ok).toBe(false);
    }
    while (w.elections.find((e) => e.id === target)!.status !== "resolved") advanceTurn(w);
    expect(w.news.some((n) => n.headline.startsWith("Election won") || n.headline.startsWith("Election lost"))).toBe(true);
  });

  // W22 leftover: candidatePartySweep. Ports mainline sweepPartyMismatchedCandidates
  // (src/lib/utils/electionCandidacy.ts:450-556, live via turnPhaseRegistry.ts:1041-1047).
  it("W22: leaving a party withdraws an active candidacy on that party's line", () => {
    const w = createWorld(OPTS);
    executeAction(w, "player", "joinParty", { partyId: "US_DEM" });
    let target: string | null = null;
    for (let i = 0; i < 200 && !target; i++) {
      advanceTurn(w);
      const rec = w.elections.find(
        (e) => e.electionType === "house" && e.status === "active" && w.meta.turn <= e.primaryEndTurn,
      );
      if (rec) target = rec.id;
    }
    expect(target).not.toBeNull();
    expect(executeAction(w, "player", "declareCandidacy", { electionId: target! }).ok).toBe(true);
    expect(w.elections.find((e) => e.id === target)!.candidates.some((c) => c.id === "player")).toBe(true);
    expect(executeAction(w, "player", "leaveParty", {}).ok).toBe(true);
    // Candidacy is swept: withdrawn the instant the player's party diverges
    // from the candidacy's snapshotted party, not merely at next resolution.
    expect(w.elections.find((e) => e.id === target)!.candidates.some((c) => c.id === "player")).toBe(false);
  });

  it("W22: joining a different party withdraws a candidacy filed under the old party", () => {
    const w = createWorld(OPTS);
    executeAction(w, "player", "joinParty", { partyId: "US_DEM" });
    let target: string | null = null;
    for (let i = 0; i < 200 && !target; i++) {
      advanceTurn(w);
      const rec = w.elections.find(
        (e) => e.electionType === "house" && e.status === "active" && w.meta.turn <= e.primaryEndTurn,
      );
      if (rec) target = rec.id;
    }
    expect(target).not.toBeNull();
    executeAction(w, "player", "declareCandidacy", { electionId: target! });
    // Cooldown blocks an immediate switch in practice, but the sweep itself
    // is what's under test here — force the switch through directly.
    w.player.lastPartySwitchTurn = null;
    const join2 = executeAction(w, "player", "joinParty", { partyId: "US_REP" });
    expect(join2.ok).toBe(true);
    expect(w.elections.find((e) => e.id === target)!.candidates.some((c) => c.id === "player")).toBe(false);
  });

  // W22 leftover: autoReelectionEntry. Ports mainline runAutoReelectionEntry
  // (src/lib/turn/autoReelectionEntry.ts:51-235, live via turnPhaseRegistry.ts:1231-1233).
  it("W22: autoRunForReelection re-files the incumbent player without a manual declare", () => {
    const w = createWorld(OPTS);
    executeAction(w, "player", "joinParty", { partyId: "US_DEM" });
    let target: string | null = null;
    for (let i = 0; i < 200 && !target; i++) {
      advanceTurn(w);
      const rec = w.elections.find(
        (e) => e.electionType === "house" && e.status === "active" && w.meta.turn <= e.primaryEndTurn,
      );
      if (rec) target = rec.id;
    }
    expect(target).not.toBeNull();
    executeAction(w, "player", "declareCandidacy", { electionId: target! });
    w.player.autoRunForReelection = true;
    while (w.elections.find((e) => e.id === target)!.status !== "resolved") advanceTurn(w);
    if (w.player.legislativeSeat == null) {
      // Rare seed outcome: the player lost. Nothing more to assert here —
      // auto-reentry only fires for a held seat.
      return;
    }
    // Advance until the NEXT house race for the player's state opens its
    // filing window, without ever calling declareCandidacy manually.
    let nextTarget: string | null = null;
    for (let i = 0; i < 400 && !nextTarget; i++) {
      advanceTurn(w);
      const rec = w.elections.find(
        (e) =>
          e.id !== target &&
          e.electionType === "house" &&
          e.status === "active" &&
          e.candidates.some((c) => c.id === "player"),
      );
      if (rec) nextTarget = rec.id;
    }
    expect(nextTarget).not.toBeNull();
  });

  it("declare requires party membership and an open filing window", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 120; i++) advanceTurn(w);
    const rec = w.elections.find((e) => e.countryId === "US" && e.status !== "resolved");
    expect(rec).toBeDefined();
    const res = executeAction(w, "player", "declareCandidacy", { electionId: rec!.id });
    expect(res.ok).toBe(false);
  });

  it("migrates v12 saves to v13 with elections and seat geography", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00Z"));
    raw.schemaVersion = 12;
    raw.world.meta.schemaVersion = 12;
    delete raw.world.elections;
    for (const p of raw.world.politicians) {
      delete p.electedState;
      delete p.senateClass;
    }
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Array.isArray(migrated.elections)).toBe(true);
    const houseWithState = migrated.politicians.filter((p) => p.chamberKey === "house" && p.electedState);
    expect(houseWithState.length).toBeGreaterThan(400);
  });

  it("resolved election retention is capped", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 900; i++) advanceTurn(w);
    expect(w.elections.filter((e) => e.status === "resolved").length).toBeLessThanOrEqual(400);
  });

  // W40: subnational/regional chambers (US stateSenate, UK regionalCouncil,
  // RU republicSupremeSoviet, DD landAssembly) — previously always vacant
  // (`elected: true` in content packs but never wired into
  // electionSeriesForWorld). Mainline runs real per-region elections for all
  // four (perpetualElections.ts ensurePerpetualElections /
  // ensureUKRegionalCouncilElections / ensureRegionalDelegateElections, all
  // live in turnPhaseRegistry.ts) — see orchestration.ts electionSeriesForWorld
  // SUBNATIONAL_CHAMBERS comment for exact citations.
  it("1979 world: vacant chambers fill to capacity from per-region races (state layer + snap-type fix)", () => {
    // QA-sweep regression (2026-09-02): the 1979/1991/2019 packs shipped with no
    // US state layer, so no per-state House/Senate/governor race could spawn and
    // a 1979 US Congress stayed empty forever; and the soviets' Rotunda-native
    // snap type ("snap_sovietOfTheUnion") was unknown to the multi-seat gates,
    // so a vacant 559-seat chamber resolved as a single-winner race and seated 1.
    // Mainline's 1979-default deliberately starts legislatures vacant
    // (RESET_PRESETS description), so the invariant is "full after the first
    // cycles", not "seeded at t0".
    const w = createWorld({ seed: "qa-1979", playerName: "P", countryId: "US", era: "1979" });
    expect(Object.values(w.regions).filter((r) => r.countryId === "US").length).toBe(50);
    for (let i = 0; i < 400; i++) advanceTurn(w);
    const seated = (cid: string, key: string) => w.politicians.filter((p) => p.countryId === cid && p.chamberKey === key).length;
    const seats = (cid: string, key: string) => w.legislatures[cid]!.chambers.find((c) => c.key === key)!.seats;
    for (const [cid, key] of [["US", "house"], ["US", "senate"], ["US", "stateSenate"], ["UK", "regionalCouncil"], ["RU", "sovietOfTheUnion"], ["RU", "republicSupremeSoviet"], ["DD", "landAssembly"]] as const) {
      expect(seated(cid, key), `${cid}:${key}`).toBe(seats(cid, key));
    }
  });

  it("W40: subnational chambers spawn, fill, and resolve seats", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 900; i++) advanceTurn(w);

    const cases: Array<{ countryId: string; chamberKey: string }> = [
      { countryId: "US", chamberKey: "stateSenate" },
      { countryId: "UK", chamberKey: "regionalCouncil" },
      { countryId: "RU", chamberKey: "republicSupremeSoviet" },
      { countryId: "DD", chamberKey: "landAssembly" },
    ];
    for (const { countryId, chamberKey } of cases) {
      // Elections were actually spawned and at least one has resolved.
      expect(
        w.elections.some((e) => e.countryId === countryId && e.chamberKey === chamberKey),
      ).toBe(true);
      expect(
        w.elections.some((e) => e.countryId === countryId && e.chamberKey === chamberKey && e.status === "resolved"),
      ).toBe(true);
      // Some seats are actually held (composition no longer fully vacant).
      const chamber = w.legislatures[countryId]!.chambers.find((c) => c.key === chamberKey)!;
      const held = Object.values(chamber.composition.seatsByParty).reduce((x, y) => x + y, 0);
      expect(held).toBeGreaterThan(0);
      expect(held + chamber.composition.vacancies).toBe(chamber.seats);
      // Politicians seated in this chamber all carry a state matching a real region.
      const seated = w.politicians.filter((p) => p.countryId === countryId && p.chamberKey === chamberKey);
      expect(seated.length).toBe(held);
      for (const p of seated) {
        expect(w.regions[p.electedState ?? ""]?.countryId).toBe(countryId);
      }
    }
  });

  it("cycleContextForWorld flows the world's own era, not a hardcoded 1953-default (fixes a real bug)", () => {
    // Was: always {startingYear: 1953, preset: "1953-default"} regardless of
    // world.meta.era — a 1979/1991/2019 world silently ran its canonical
    // election-cycle anchors on 1953's real-election-year table.
    const w1953 = createWorld({ seed: "ctx", playerName: "P", countryId: "US", era: "1953" });
    expect(cycleContextForWorld(w1953)).toMatchObject({ startingYear: 1953, preset: "1953-default" });

    const w1979 = createWorld({ seed: "ctx", playerName: "P", countryId: "US", era: "1979" });
    expect(cycleContextForWorld(w1979)).toMatchObject({ startingYear: 1979, preset: "1979-default" });

    const w1991 = createWorld({ seed: "ctx", playerName: "P", countryId: "US", era: "1991" });
    expect(cycleContextForWorld(w1991)).toMatchObject({ startingYear: 1991, preset: "1991-default" });

    const w2019 = createWorld({ seed: "ctx", playerName: "P", countryId: "US", era: "2019" });
    expect(cycleContextForWorld(w2019)).toMatchObject({ startingYear: 2019, preset: "2019-default" });
  });
});
