import type { TurnPhase } from "../phases/types.js";
import type { ElectionRecord } from "../elections/types.js";
import type { GovernmentState } from "./types.js";
import type { Chamber, WorldState } from "../types.js";
import { computeFormation, selectPm } from "./formation.js";
import {
  GOVERNMENT_CHAMBER_BY_COUNTRY,
  INITIAL_CONFIDENCE,
  PM_VACANCY_DEADLINE_TURNS,
  RENEWAL_BUMP,
  SNAP_ELECTION_TYPE_BY_CHAMBER,
  SNAP_GENERAL_DURATION_TURNS,
  SNAP_PRIMARY_DURATION_TURNS,
  clampConfidence,
  majorityThreshold,
} from "./constants.js";

/**
 * Parliamentary government cluster (W23). Ports mainline's
 * `runPostElectionGovernmentPhases` + `runParliamentaryGovernmentPhases`
 * (src/lib/turn/parliamentaryGovernment.ts, delegated to by the thin
 * per-country wrapper src/lib/turn/ukGovernmentFormation.ts) and the PM
 * vacancy watcher (src/lib/turn/pmVacancyDeadline.ts, phase name
 * `runParliamentaryVacancyWatcher`).
 *
 * Two phases here (mainline runs three: parliamentaryGovernmentFormation,
 * parliamentaryGovernmentPhases, parliamentaryVacancyWatcher — see
 * turnPhaseRegistry.ts indices 85-87). Solo merges the first two into one
 * `governmentFormationPhase`: mainline splits them because
 * parliamentaryGovernmentFormation additionally files a post-election
 * confidence motion for a surviving incumbent PM (an interactive vote,
 * out of scope — see below) while parliamentaryGovernmentPhases does the
 * per-turn seat sync + pending-government formation attempt; solo has no
 * interactive nomination/chamber-vote layer, so both collapse to one
 * deterministic per-turn pass. `governmentVacancyWatcherPhase` stays
 * separate and runs after it, mirroring mainline's ordering requirement
 * (pmVacancyDeadline.ts:9-11: must run AFTER the government phases so a PM
 * seated this turn has its deadline cleared before the watcher checks).
 *
 * PORT-STUB, out of scope for this wave (no player-facing government action
 * surface exists yet to drive them):
 *  - Interactive PM-appointment nomination + 24h chamber vote
 *    (commands/parliamentaryGovernment.ts proposePmAppointment,
 *    castPmAppointmentVote) — collapsed to an immediate deterministic
 *    outcome each turn a government is pending (see formation.ts file doc).
 *  - No-confidence votes (proposeNoConfidence / castNoConfidenceVote /
 *    noConfidenceMotionCarries) — the pure pass/fail predicate is ported to
 *    government/constants.ts for a future action layer, but nothing in this
 *    wave calls it; mainline itself never auto-triggers one either (only a
 *    seated chamber member proposes one).
 *  - PM-triggered ("pm-trigger") snap elections and the "regime-change"
 *    imposed-snap path (src/lib/turn/snapElection.ts SnapReason) — only the
 *    "auto-snap" vacancy-deadline path is wired (governmentVacancyWatcherPhase
 *    below), since pm-trigger requires a PM player action and regime-change
 *    requires the peace-settlement system, neither of which exists in solo
 *    yet. `triggerSnapElection` here always behaves as mainline's
 *    `bypassLimits: true` auto-snap case.
 *  - vacateDepartedLeadership / vacatePartyLeadershipForBannedUser
 *    (src/lib/parties/vacateDepartedLeadership.ts,
 *    src/lib/elections/vacatePartyLeadershipForBannedUser.ts): both clear
 *    stale party chairId/viceChairId pointers, which do not exist as a solo
 *    field yet (W20 leadership wave not merged — see formation.ts
 *    selectPm doc). The PM-orphan safety net those two indirectly feed
 *    (mainline's generic "PM's character no longer resolves" check in
 *    updateParliamentaryGovernmentSeats, parliamentaryGovernment.ts:283-319)
 *    IS ported below: a formed government whose PM politician no longer
 *    exists or no longer holds a seat in the government chamber (solo's
 *    only source of "leadership vacated" today — see elections/orchestration.ts
 *    applyResolution's loser-challenger cleanup, which can remove a
 *    former-challenger PM who later loses re-election) force-collapses to
 *    "pending" and re-arms the vacancy deadline, exactly mirroring
 *    mainline's fallback behavior.
 */

function supportingSeats(gov: GovernmentState, seatsByParty: Record<string, number>): number {
  if (gov.formationType === "coalition") {
    return (gov.coalitionPartyIds ?? []).reduce((sum, pid) => sum + (seatsByParty[pid] ?? 0), 0);
  }
  return seatsByParty[gov.governingPartyId ?? ""] ?? 0;
}

function resetToPending(gov: GovernmentState, chamber: Chamber, turn: number): void {
  gov.status = "pending";
  gov.formationType = null;
  gov.governingPartyId = null;
  gov.coalitionPartyIds = null;
  gov.pmPoliticianId = null;
  gov.totalSeatsSupporting = 0;
  gov.totalSeats = chamber.seats;
  gov.majorityThreshold = majorityThreshold(chamber.seats);
  gov.seatsByParty = { ...chamber.composition.seatsByParty };
  gov.lostMajority = false;
  gov.snapElectionsUsed = 0;
  gov.pmVacancyDeadlineTurn = turn + PM_VACANCY_DEADLINE_TURNS;
}

function createGovernment(countryId: string, chamberKey: string, chamber: Chamber, turn: number): GovernmentState {
  const gov: GovernmentState = {
    countryId,
    chamberKey,
    status: "pending",
    formationType: null,
    governingPartyId: null,
    coalitionPartyIds: null,
    pmPoliticianId: null,
    totalSeatsSupporting: 0,
    majorityThreshold: majorityThreshold(chamber.seats),
    totalSeats: chamber.seats,
    seatsByParty: { ...chamber.composition.seatsByParty },
    lostMajority: false,
    formedTurn: null,
    snapElectionsUsed: 0,
    lastSnapElectionTurn: null,
    pmVacancyDeadlineTurn: turn + PM_VACANCY_DEADLINE_TURNS,
    confidence: 0,
  };
  return gov;
}

function processCountry(world: WorldState, countryId: string, chamberKey: string): void {
  const leg = world.legislatures[countryId];
  const chamber = leg?.chambers.find((c) => c.key === chamberKey);
  if (!chamber) return;
  const turn = world.meta.turn;

  let gov = world.governments[countryId];
  if (!gov) {
    gov = createGovernment(countryId, chamberKey, chamber, turn);
    world.governments[countryId] = gov;
  }
  const priorPmId = gov.pmPoliticianId;

  const electionResolvedThisTurn = world.elections.some(
    (e: ElectionRecord) => e.countryId === countryId && e.chamberKey === chamberKey && e.resolvedTurn === turn,
  );
  if (electionResolvedThisTurn) {
    resetToPending(gov, chamber, turn);
  } else if (gov.status === "formed") {
    const pm = gov.pmPoliticianId ? world.politicians.find((p) => p.id === gov.pmPoliticianId) : undefined;
    if (!pm || pm.chamberKey !== chamberKey || pm.countryId !== countryId) {
      resetToPending(gov, chamber, turn);
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `${countryId}: the ${chamber.name} government falls vacant`,
      });
    } else {
      gov.totalSeatsSupporting = supportingSeats(gov, chamber.composition.seatsByParty);
      gov.totalSeats = chamber.seats;
      gov.majorityThreshold = majorityThreshold(chamber.seats);
      gov.seatsByParty = { ...chamber.composition.seatsByParty };
      if (gov.formationType !== "minority") {
        gov.lostMajority = gov.totalSeatsSupporting < gov.majorityThreshold;
      }
    }
  }

  if (gov.status === "pending") {
    const outcome = computeFormation(chamber.composition.seatsByParty, chamber.seats);
    if (outcome.formationType && outcome.governingPartyId) {
      const pmId = selectPm(world, countryId, chamberKey, outcome.governingPartyId);
      if (pmId) {
        gov.status = "formed";
        gov.formationType = outcome.formationType;
        gov.governingPartyId = outcome.governingPartyId;
        gov.coalitionPartyIds = outcome.coalitionPartyIds;
        gov.pmPoliticianId = pmId;
        if (countryId === "CN") syncCnPresident(world, pmId, outcome.governingPartyId);
        gov.totalSeatsSupporting = outcome.totalSeatsSupporting;
        gov.totalSeats = chamber.seats;
        gov.majorityThreshold = majorityThreshold(chamber.seats);
        gov.seatsByParty = { ...chamber.composition.seatsByParty };
        gov.lostMajority = false;
        gov.formedTurn = turn;
        gov.snapElectionsUsed = 0;
        gov.pmVacancyDeadlineTurn = null;
        gov.confidence = pmId === priorPmId ? clampConfidence(gov.confidence + RENEWAL_BUMP) : INITIAL_CONFIDENCE;
        world.news.push({
          turn,
          date: world.meta.date,
          headline: `${countryId}: new ${outcome.formationType} government formed`,
        });
      }
    }
  }
}

/**
 * CN head of state (W61): COUNTRY_CONFIGS.CN headOfStateSelection
 * "partyChairSync" — the President tracks the governing party's chair, the
 * Premier is the chamber-invested head of government. AHDClient parties carry
 * no seeded chair (PORT-STUB: party leadership elections), so the office
 * follows the Premier until one exists.
 */
function syncCnPresident(world: WorldState, pmId: string, partyId: string): void {
  const party = world.parties[partyId] as unknown as Record<string, unknown> | undefined;
  const chairId = typeof party?.["chairId"] === "string" ? (party["chairId"] as string) : null;
  const presidentId = chairId ?? pmId;
  const prev = world.executives["CN"];
  if (prev?.presidentId === presidentId) return;
  world.executives["CN"] = {
    countryId: "CN",
    presidentId,
    presidentParty: partyId,
    termStartTurn: world.meta.turn,
    vicePresidentId: null,
    vicePresidentParty: null,
  };
}

export const governmentFormationPhase: TurnPhase = {
  name: "governmentFormation",
  run(world) {
    for (const [countryId, chamberKey] of Object.entries(GOVERNMENT_CHAMBER_BY_COUNTRY)) {
      processCountry(world, countryId, chamberKey);
    }
  },
};

/**
 * Ports src/lib/turn/snapElection.ts's `triggerSnapElection` for the
 * `reason: "auto-snap"` path only (the only caller wired in this wave — see
 * phases.ts file doc). Always `bypassLimits: true`, matching mainline's
 * vacancy-deadline caller (pmVacancyDeadline.ts:39-43: bypasses
 * SNAP_ELECTION_LIMIT/cooldown, which exist only to bound the interactive
 * pm-trigger path).
 */
export function triggerSnapElection(world: WorldState, countryId: string, chamberKey: string, gov: GovernmentState): void {
  const chamber = world.legislatures[countryId]?.chambers.find((c) => c.key === chamberKey);
  if (!chamber) return;

  // Cancel any unresolved election already scheduled for this chamber before
  // spawning the snap. Ports snapElection.ts:26-40 (cancel active/upcoming
  // regular lower-chamber elections + withdraw candidates); solo drops the
  // record outright rather than tracking withdrawn-candidate notifications.
  const priorCycle = world.elections
    .filter((e) => e.countryId === countryId && e.chamberKey === chamberKey)
    .reduce((max, e) => Math.max(max, e.cycle), 0);
  world.elections = world.elections.filter(
    (e) => !(e.countryId === countryId && e.chamberKey === chamberKey && e.status !== "resolved"),
  );

  const snapType = SNAP_ELECTION_TYPE_BY_CHAMBER[chamberKey] ?? `snap_${chamberKey}`;
  const cycle = priorCycle + 1;
  const startTurn = world.meta.turn + 1;
  const primaryEndTurn = startTurn + SNAP_PRIMARY_DURATION_TURNS;
  const endTurn = primaryEndTurn + SNAP_GENERAL_DURATION_TURNS;
  const rec: ElectionRecord = {
    id: `${snapType}:${countryId}:-:c${cycle}`,
    electionType: snapType,
    countryId,
    cycle,
    status: "upcoming",
    startTurn,
    primaryEndTurn,
    endTurn,
    totalSeats: chamber.seats,
    chamberKey,
    candidates: [],
    tally: {},
  };
  world.elections.push(rec);

  gov.snapElectionsUsed += 1;
  gov.lastSnapElectionTurn = world.meta.turn;
  gov.pmVacancyDeadlineTurn = world.meta.turn + PM_VACANCY_DEADLINE_TURNS;
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `${countryId}: no government formed in time — a snap election is called`,
  });
}

export const governmentVacancyWatcherPhase: TurnPhase = {
  name: "governmentVacancyWatcher",
  run(world) {
    for (const [countryId, chamberKey] of Object.entries(GOVERNMENT_CHAMBER_BY_COUNTRY)) {
      const gov = world.governments[countryId];
      if (!gov || gov.status !== "pending" || gov.pmVacancyDeadlineTurn == null) continue;
      if (world.meta.turn < gov.pmVacancyDeadlineTurn) continue;
      triggerSnapElection(world, countryId, chamberKey, gov);
    }
  },
};
