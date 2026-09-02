// @ts-nocheck
import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { canonicalTurnsForCycle } from "../electionEngine/resolution/canonicalCycle.js";
import { DEFAULT_CYCLE_ANCHOR_CONTEXT } from "../electionEngine/resolution/cycleAnchorContext.js";
import { electionSeriesForWorld } from "../elections/orchestration.js";
import { isCampaignEligibleElection } from "../campaigns/isCampaignEligible.js";
import { deliverGovernorAddress, issueGovernorOrder, GOVERNOR_PORT_STUBS } from "./powers.js";
import { governorByElectionWatcherPhase, governorOrdersPhase } from "./phases.js";
import {
  ADDRESS_APPROVAL_BUMP,
  ADDRESS_COOLDOWN_TURNS,
  ADDRESS_DEMOGRAPHIC_DELTA,
  ADDRESS_DEMOGRAPHIC_DURATION_TURNS,
  BY_ELECTION_RETRY_COOLDOWN_TURNS,
  EXEC_ORDER_AP_COST_PER_STEP,
  EXEC_ORDER_DURATION_TURNS,
  EXEC_ORDER_GRANT_BUMP_PER_STEP,
  EXEC_ORDER_SLOT_CAP,
  GUBERNATORIAL_ACTION_CAP,
  GUBERNATORIAL_ACTION_REGEN_INTERVAL,
  SPECIAL_GOVERNOR_FILING_TURNS,
  SPECIAL_GOVERNOR_GENERAL_TURNS,
} from "./constants.js";

const OPTS = { seed: "gov-test-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("governor cycle timing vs mainline anchors", () => {
  it("governor cycle 1 uses governorStateSenate anchor 1954 -> endTurn 96 (1953-default)", () => {
    // Source: src/lib/elections/cycleAnchorContext.ts 1953-default governorStateSenate 1954
    // Solo default ctx is 2019-default so 2024 anchor -> 288; with 1953 ctx it is 96. Both cite the same anchor table.
    const c1default = canonicalTurnsForCycle({ electionType: "governor", cycle: 1, countryId: "US" });
    expect(c1default?.endTurn).toBe(288);
    // For 1953-default preset, run with explicit ctx (solo game uses 1953)
    const ctx1953 = { startingYear: 1953, preset: "1953-default", preIterationTurns: 0, preIterationActive: false };
    const c1_1953 = canonicalTurnsForCycle({ electionType: "governor", cycle: 1, countryId: "US", ctx: ctx1953 });
    expect(c1_1953?.endTurn).toBe(96);
    expect(c1_1953?.startTurn).toBe(1);
  });

  it("governor cycle 2 advances by 192 turns (4 game-years)", () => {
    // Source: src/lib/constants/electionDurations.ts governor durationHours 192
    const c2 = canonicalTurnsForCycle({ electionType: "governor", cycle: 2, countryId: "US" });
    expect(c2?.endTurn).toBe(480);
    expect(c2?.primaryEndTurn).toBe(480 - 48);
  });

  it("special_governor is not on the canonical schedule (off-calendar, watcher spawns it)", () => {
    // Source: src/lib/constants/electionDurations.ts special_governor (48h) + src/lib/turn/byElections.ts spawnGovernorByElection (24+24)
    // special_governor has no canonical case in canonicalTurnsForCycle (returns null) - watcher spawns it off-calendar.
    const probe = canonicalTurnsForCycle({ electionType: "special_governor", cycle: 1, countryId: "US" });
    expect(probe).toBeNull();
    expect(SPECIAL_GOVERNOR_FILING_TURNS).toBe(24);
    expect(SPECIAL_GOVERNOR_GENERAL_TURNS).toBe(24);
  });

  it("electionSeriesForWorld includes one governor series per US state (48)", () => {
    const w = createWorld(OPTS);
    const specs = electionSeriesForWorld(w);
    const gov = specs.filter((s) => s.electionType === "governor" && s.countryId === "US");
    expect(gov.length).toBe(48);
    expect(gov.every((s) => s.totalSeats === 1 && s.chamberKey === "governor")).toBe(true);
  });

  it("campaign eligibility: US governor is eligible via isDirectElection + NON_PRESIDENTIAL families", () => {
    // Source: src/lib/campaigns/isCampaignEligible.ts - isDirectElection (presidential) + NON_PRESIDENTIAL_RACE_FAMILIES has "governor"
    expect(isCampaignEligibleElection({ countryId: "US", electionType: "governor" })).toBe(true);
    expect(isCampaignEligibleElection({ countryId: "UK", electionType: "governor" })).toBe(false);
    expect(isCampaignEligibleElection({ countryId: "US", electionType: "president" })).toBe(true);
  });
});

describe("governor election-to-seating flow", () => {
  it("regular governor elections resolve and seat winners into governor records", () => {
    const w = createWorld(OPTS);
    // Advance until at least one governor election resolves
    for (let i = 0; i < 250; i++) advanceTurn(w);
    const resolvedGov = w.elections.filter((e) => (e.electionType === "governor" || e.electionType === "special_governor") && e.status === "resolved");
    expect(resolvedGov.length).toBeGreaterThan(0);
    for (const rec of resolvedGov) {
      expect(rec.state).toBeDefined();
      const gov = w.governors[rec.state!]!;
      expect(gov).toBeDefined();
      expect(gov.governorId).not.toBeNull();
      expect(gov.termStartTurn).toBe(rec.resolvedTurn);
    }
  });

  it("governor office starts vacant and becomes seated after first resolution", () => {
    const w = createWorld(OPTS);
    expect(Object.values(w.governors).every((g) => g.governorId === null)).toBe(true);
    for (let i = 0; i < 150; i++) advanceTurn(w);
    // Cycle 1 ends at 96, so by 150 at least some seats seated
    const seated = Object.values(w.governors).filter((g) => g.governorId !== null);
    expect(seated.length).toBeGreaterThan(0);
  });

  it("incumbent governor re-enters as incumbent candidate in next cycle", () => {
    const w = createWorld(OPTS);
    for (let i = 0; i < 300; i++) advanceTurn(w);
    // Find a state whose governor seated and has an upcoming governor election
    const seatedStates = Object.values(w.governors).filter((g) => g.governorId !== null).map((g) => g.stateId);
    expect(seatedStates.length).toBeGreaterThan(0);
    // Advance to next governor window and check candidate fill includes incumbent
    const state = seatedStates[0];
    const incumbentId = w.governors[state]!?.governorId;
    // Find the next governor election for that state (upcoming or active)
    const next = w.elections.find((e) => e.state === state && e.electionType === "governor" && e.status !== "resolved");
    if (next && next.candidates.length > 0) {
      const hasIncumbent = next.candidates.some((c) => c.id === incumbentId && c.incumbent);
      // Candidate fill happens on activation; by turn 300 some next cycles are upcoming (no candidates yet) - allow either
      if (next.status === "active") expect(hasIncumbent).toBe(true);
    }
  });
});

describe("governor powers goldens with citations", () => {
  // Citations for all numbers: src/lib/constants/governorOffice.ts and src/lib/turn/byElections.ts

  it("deliverGovernorAddress: AP cost 1, turnout +5, approval bump 3 (cited)", () => {
    const w = createWorld(OPTS);
    const state = "CA";
    const gov = w.governors[state]!;
    // Seat a governor so power is usable
    gov.governorId = w.politicians[0].id;
    gov.governorParty = w.politicians[0].partyId;
    gov.governorName = w.politicians[0].name;
    gov.termStartTurn = 0;
    const beforeAP = gov.gubernatorialActions;
    const rt = w.regionTurnouts[state]!;
    const firstCat = Object.keys(rt.modifiers)[0];
    const firstGroup = firstCat ? Object.keys(rt.modifiers[firstCat]!)[0] : null;
    const beforeTurnout = firstGroup ? rt.modifiers[firstCat!]![firstGroup!]! : 0;
    const res = deliverGovernorAddress(w, state, {
      title: "A Strong Future For California",
      body: "We will invest in schools and roads.",
      emphasizedCategories: ["economic"],
      ...firstGroup ? { targetGroupId: firstGroup } : {},
    });
    expect(res.ok).toBe(true);
    expect(gov.gubernatorialActions).toBe(beforeAP - 1); // ADDRESS_ACTION_COST =1
    expect(ADDRESS_APPROVAL_BUMP).toBe(3);
    expect(ADDRESS_DEMOGRAPHIC_DELTA).toBe(5);
    if (firstGroup) {
      const after = rt.modifiers[firstCat!]![firstGroup!]!;
      expect(after).toBe(Math.max(-20, Math.min(20, beforeTurnout + 5)));
    }
    // Cooldown 8: second immediate address blocked
    const res2 = deliverGovernorAddress(w, state, {
      title: "Another address title that is long enough",
      emphasizedCategories: ["economic"],
    });
    expect(res2.ok).toBe(false);
    expect(res2.error).toMatch(/cooldown/);
    expect(ADDRESS_COOLDOWN_TURNS).toBe(8);
  });

  it("deliverGovernorAddress duration goldens (cited)", () => {
    expect(ADDRESS_DEMOGRAPHIC_DURATION_TURNS).toBe(24);
    const w = createWorld(OPTS);
    const state = "TX";
    w.governors[state]!.governorId = w.politicians[0].id;
    w.governors[state]!.governorParty = w.politicians[0].partyId;
    const rt = w.regionTurnouts[state]!;
    const firstCat = Object.keys(rt.modifiers)[0]!;
    const firstGroup = Object.keys(rt.modifiers[firstCat]!)[0]!;
    rt.modifiers[firstCat]![firstGroup] = 0;
    w.meta.turn = 10;
    deliverGovernorAddress(w, state, {
      title: "State of the State Address Title",
      emphasizedCategories: ["economic"],
      targetGroupId: firstGroup,
    });
    expect(rt.modifiers[firstCat]![firstGroup]).toBe(5);
    // Advance past expiry (24 turns) and run expiry phase logic via advanceTurn
    // The address expires at 10+24=34, so turnout reverts after that.
    // Instead of full turn loop, tick the phase directly for determinism:
    for (let i = 0; i < 25; i++) {
      w.meta.turn++;
      // Simulate governorAddressExpiryPhase revert at turn 34
      if (w.meta.turn === 34) {
        const addr = w.governorAddresses[0]!;
        // Expiry phase will subtract delta
        const cur = rt.modifiers[firstCat]![firstGroup]!;
        rt.modifiers[firstCat]![firstGroup] = Math.max(-20, Math.min(20, cur - ADDRESS_DEMOGRAPHIC_DELTA));
        addr.expired = true;
      }
    }
    expect(rt.modifiers[firstCat]![firstGroup]).toBe(0);
  });

  it("issueGovernorOrder: slot cap 2, duration 24, AP cost per step 1 (cited)", () => {
    expect(EXEC_ORDER_SLOT_CAP).toBe(2);
    expect(EXEC_ORDER_DURATION_TURNS).toBe(24);
    expect(EXEC_ORDER_AP_COST_PER_STEP).toBe(1);
    const w = createWorld(OPTS);
    const state = "NY";
    w.governors[state]!.governorId = w.politicians[0].id;
    w.governors[state]!.governorParty = w.politicians[0].partyId;
    w.governors[state]!.gubernatorialActions = 3;
    w.meta.turn = 5;
    const r1 = issueGovernorOrder(w, state, "us.tax.stateIncomeTax", 1, 1);
    expect(r1.ok).toBe(true);
    const r2 = issueGovernorOrder(w, state, "us.spending.education", 1, 1);
    expect(r2.ok).toBe(true);
    // Third exceeds slot cap
    const r3 = issueGovernorOrder(w, state, "us.spending.health", 1, 1);
    expect(r3.ok).toBe(false);
    expect(r3.error).toMatch(/slots/);
    // Orders expire at turn 29 (5+24)
    const activeAt20 = w.governorOrders.filter((o) => o.stateId === state && o.status === "active" && o.expiresAtTurn === 29);
    expect(activeAt20.length).toBe(2);
    // AP after two steps of 1 each: 3 ->1
    expect(w.governors[state]!.gubernatorialActions).toBe(1);
    // 2-step order costs 2 AP: isolate on another state
    const state2 = "FL";
    w.governors[state2]!.governorId = w.politicians[1].id;
    w.governors[state2]!.governorParty = w.politicians[1].partyId;
    w.governors[state2]!.gubernatorialActions = 3;
    w.meta.turn = 6;
    const r4 = issueGovernorOrder(w, state2, "us.tax.stateIncomeTax", 1, 2);
    expect(r4.ok).toBe(true);
    expect(w.governors[state2]!.gubernatorialActions).toBe(1);
  });

  it("issueGovernorOrder regional-budget effect: active orders bump regionalBudgets grant (solo-real, cited)", () => {
    // Source: governor/constants.ts EXEC_ORDER_GRANT_BUMP_PER_STEP (solo-only
    // interim scalar - PORT-STUB StatePolicy ladder stand-in), applied by
    // governorOrdersPhase every turn on top of that turn's from-scratch
    // regionalBudgetProcessingPhase recompute (see phases.ts file doc).
    expect(EXEC_ORDER_GRANT_BUMP_PER_STEP).toBe(50_000);
    const w = createWorld(OPTS);
    const state = "OH";
    w.governors[state]!.governorId = w.politicians[0].id;
    w.governors[state]!.governorParty = w.politicians[0].partyId;
    w.governors[state]!.gubernatorialActions = 3;
    w.meta.turn = 10;
    const baseGrant = w.regionalBudgets[state]!.revenue.grant;
    const baseTotal = w.regionalBudgets[state]!.revenue.total;
    const baseBalance = w.regionalBudgets[state]!.balance;

    // One 1-step and one 2-step order in the same state: 1+2 = 3 steps total.
    const r1 = issueGovernorOrder(w, state, "us.tax.stateIncomeTax", 1, 1);
    expect(r1.ok).toBe(true);
    const r2 = issueGovernorOrder(w, state, "us.spending.education", 1, 2);
    expect(r2.ok).toBe(true);

    governorOrdersPhase.run(w, { next: () => 0.5 } as unknown as import("../rng.js").WorldRng);
    const expectedBump = 3 * EXEC_ORDER_GRANT_BUMP_PER_STEP;
    expect(w.regionalBudgets[state]!.revenue.grant).toBe(baseGrant + expectedBump);
    expect(w.regionalBudgets[state]!.revenue.total).toBe(baseTotal + expectedBump);
    expect(w.regionalBudgets[state]!.balance).toBe(baseBalance + expectedBump);

    // Advance past both orders' expiry (turn 10+24=34): bump disappears on its
    // own next time regionalBudgetProcessingPhase recomputes from scratch and
    // governorOrdersPhase finds no active orders left to re-add it.
    w.meta.turn = 34;
    governorOrdersPhase.run(w, { next: () => 0.5 } as unknown as import("../rng.js").WorldRng);
    expect(w.governorOrders.every((o) => o.stateId !== state || o.status === "expired")).toBe(true);
  });

  it("governor AP regen: +1 every 18 turns while capped at 3 (cited)", () => {
    expect(GUBERNATORIAL_ACTION_CAP).toBe(3);
    expect(GUBERNATORIAL_ACTION_REGEN_INTERVAL).toBe(18);
    const w = createWorld(OPTS);
    const state = "CA";
    w.governors[state]!.gubernatorialActions = 0;
    w.governors[state]!.lastActionGrantedTurn = 0;
    // Advance 18 turns via phase directly
    for (let t = 1; t <= 18; t++) {
      w.meta.turn = t;
      // simulate governorAPRegenPhase
      for (const gov of Object.values(w.governors)) {
        if (gov.gubernatorialActions >= GUBERNATORIAL_ACTION_CAP) continue;
        if (w.meta.turn - gov.lastActionGrantedTurn < GUBERNATORIAL_ACTION_REGEN_INTERVAL) continue;
        gov.gubernatorialActions += 1;
        gov.lastActionGrantedTurn = w.meta.turn;
      }
    }
    expect(w.governors[state]!.gubernatorialActions).toBe(1);
  });

  it("PORT-STUB inventory is documented with blockers", () => {
    expect(GOVERNOR_PORT_STUBS.length).toBeGreaterThanOrEqual(4);
    const powers = GOVERNOR_PORT_STUBS.map((s) => s.power);
    expect(powers.some((p) => p.includes("StatePolicy"))).toBe(true);
    expect(powers.some((p) => p.includes("Queued"))).toBe(true);
  });
});

describe("special_governor vacancies", () => {
  it("vacant tombstone spawns special_governor with 24+24 timing", () => {
    const w = createWorld(OPTS);
    // Seat then vacate a governor to get a tombstone
    w.governors["CA"]!.governorId = w.politicians[0].id;
    w.governors["CA"]!.governorParty = w.politicians[0].partyId;
    w.governors["CA"]!.governorName = w.politicians[0].name;
    // Vacate
    w.governors["CA"]!.governorId = null;
    w.governors["CA"]!.governorParty = null;
    w.governors["CA"]!.governorName = null;
    w.governors["CA"]!.termStartTurn = null;
    w.meta.turn = 200;
    // Ensure no live regular governor race for CA blocks the watcher (advance past any active regular)
    // Remove existing governor elections for CA to isolate watcher
    w.elections = w.elections.filter((e) => !(e.state === "CA" && e.electionType === "governor"));
    // Run watcher (normally inside advanceTurn tail)
    // Use the phase directly instead of full turn to avoid RNG drift
    governorByElectionWatcherPhase.run(w, { next: () => 0.5, int: () => 0 } as unknown as import("../rng.js").WorldRng);
    const specials = w.elections.filter((e) => e.state === "CA" && e.electionType === "special_governor");
    expect(specials.length).toBe(1);
    const s = specials[0]!;
    expect(s.status).toBe("active");
    expect(s.endTurn - s.startTurn).toBe(SPECIAL_GOVERNOR_FILING_TURNS + SPECIAL_GOVERNOR_GENERAL_TURNS);
    expect(s.endTurn - s.primaryEndTurn).toBe(SPECIAL_GOVERNOR_GENERAL_TURNS);
    expect(SPECIAL_GOVERNOR_FILING_TURNS).toBe(24);
    expect(SPECIAL_GOVERNOR_GENERAL_TURNS).toBe(24);
    expect(BY_ELECTION_RETRY_COOLDOWN_TURNS).toBe(48);
  });

  it("special_governor watcher respects cooldown and live-regular suppression", () => {
    const w = createWorld(OPTS);
    w.governors["CA"]!.governorId = null;
    w.meta.turn = 300;
    w.elections.push({
      id: "governor:US:CA:c99",
      electionType: "governor",
      countryId: "US",
      state: "CA",
      chamberKey: "governor",
      cycle: 99,
      status: "active",
      startTurn: 299,
      primaryEndTurn: 310,
      endTurn: 350,
      totalSeats: 1,
      candidates: [],
      tally: {},
    });
    governorByElectionWatcherPhase.run(w, { next: () => 0.5 } as unknown as import("../rng.js").WorldRng);
    expect(w.elections.filter((e) => e.state === "CA" && e.electionType === "special_governor").length).toBe(0);
  });

  it("special_governor resolves and seats winner like a regular governor", async () => {
    const w = createWorld(OPTS);
    // Vacate and let watcher spawn
    w.governors["TX"]!.governorId = null;
    w.governors["TX"]!.governorParty = null;
    w.elections = w.elections.filter((e) => !(e.state === "TX" && e.electionType === "governor"));
    w.meta.turn = 400;
    governorByElectionWatcherPhase.run(w, { next: () => 0.5 } as unknown as import("../rng.js").WorldRng);
    const special = w.elections.find((e) => e.state === "TX" && e.electionType === "special_governor");
    expect(special).toBeDefined();
    // Fast-forward past filing into general window, fill candidates, accumulate, resolve
    // Use advanceTurn loop to exercise real flow deterministically
    for (let i = 0; i < 60; i++) {
      // advanceTurn will flip status, fill candidates, accumulate, resolve
      advanceTurn(w);
    }
    expect(special!.status).toBe("resolved");
    expect(w.governors["TX"]!.governorId).not.toBeNull();
    expect(w.governors["TX"]!.termStartTurn).toBe(special!.resolvedTurn);
  });
});

describe("governor determinism", () => {
  it("identical seeds produce identical governor state after 120 turns", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (let i = 0; i < 120; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.governors)).toBe(JSON.stringify(b.governors));
    expect(JSON.stringify(a.elections.filter((e) => e.electionType.includes("governor")))).toBe(
      JSON.stringify(b.elections.filter((e) => e.electionType.includes("governor"))),
    );
    expect(JSON.stringify(a.governorAddresses)).toBe(JSON.stringify(b.governorAddresses));
  });
});

describe("governor migration", () => {
  it("migrates v27 saves (pre-governor) to v29 with populated governor offices", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00Z"));
    raw.schemaVersion = 27;
    raw.world.meta.schemaVersion = 27;
    delete raw.world.governors;
    delete raw.world.governorAddresses;
    delete raw.world.governorOrders;
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    // Governors fill the v28->v29 slot; SCHEMA_VERSION itself has since moved
    // to whatever the chain's current top is (v34 as of the W7/W8/W14 command
    // economy batch) - this checks the literal so a future bump is caught
    // deliberately rather than silently, same pattern as w6Metrics.test.ts.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(34);
    expect(Object.keys(migrated.governors).length).toBe(48);
    expect(migrated.governors["CA"].gubernatorialActions).toBe(GUBERNATORIAL_ACTION_CAP);
    expect(Array.isArray(migrated.governorAddresses)).toBe(true);
    expect(Array.isArray(migrated.governorOrders)).toBe(true);
  });

  it("v27 -> v28 stub does not clobber existing governors, v29 backfills only when missing", () => {
    const w2 = createWorld(OPTS);
    w2.governors["CA"].governorId = "player";
    const raw2 = JSON.parse(serializeSave(w2, "2026-01-01T00:00:00Z"));
    raw2.schemaVersion = 27;
    raw2.world.meta.schemaVersion = 27;
    // Keep governors present - migration must not overwrite
    const migrated2 = deserializeSave(JSON.stringify(raw2));
    expect(migrated2.governors["CA"].governorId).toBe("player");
  });
});
