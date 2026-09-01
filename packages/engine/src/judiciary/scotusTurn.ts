/**
 * SCOTUS turn — W29 port of src/lib/turn/scotusTurn.ts.
 *
 * Mainline ordering (src/lib/turn/scotusTurn.ts):
 * 1. Tenure turn (Original Roster succession + divergent hazard)
 * 2. Docket turn (fire due cases, evaluate divergence, enact diverged rulings)
 * 3. Surprise case turn (small constant-probability procedurally spawned case)
 * 4. Nomination lifecycle (NPP Senate votes + resolve expired)
 *
 * Citations:
 *  - src/lib/turn/scotusTurn.ts (orchestration)
 *  - src/lib/turn/scotusTenureTurn.ts (vacancy + hazard)
 *  - src/lib/turn/scotusDocketTurn.ts (decideCaseOutcome, enactRulingBill)
 *  - src/lib/turn/scotusSurpriseCaseTurn.ts (rollSurpriseCaseSpawn)
 *  - src/lib/turn/scotusNominationLifecycle.ts (nppCabinetVote reuse, didPass)
 *  - src/lib/scotus/tenure.ts (DIVERGENT_TENURE_FLOOR_TURNS, rollDivergentDeparture)
 *  - src/lib/turn/centralBankChairTurn.ts patterns for RNG determinism
 *
 * Determinism: all random draws flow through WorldRng (rngFromState), never Math.random.
 */

import type { WorldState } from "../types.js";
import { rngFromState, type RngState } from "../rng.js";
import { decideCaseOutcome, type SeatedJusticeLean } from "./divergence.js";
import { nppCabinetVote, cabinetDidPass } from "../cabinet/nominationLifecycle.js";
import type { SupremeCourtSeat, DocketCase } from "./types.js";

export const DIVERGENT_TENURE_FLOOR_TURNS = 156; // ~3 years at 52 turns/year, mirrors mainline src/lib/scotus/tenure.ts
export const DIVERGENT_DEPARTURE_PROBABILITY_PER_TURN = 0.001; // flat hazard after floor, PORT-STUB tuned

export const SUPREME_COURT_SEATS = 9;

export interface ScotusTurnResult {
  tenure: { seatsAdvanced: number; seatsVacatedByHazard: number; seatsVacatedByHistory: number };
  docket: { casesFired: number; casesAffirmed: number; casesDiverged: number };
  surprise: { spawned: boolean; caseKey?: string; majoritySide?: -1 | 0 | 1 };
  nominations: { nominationsVoted: number; confirmed: number; rejected: number };
}

function yearToTurn(year: number, startYear: number): number {
  return (year - startYear) * 52 + 1;
}

function turnToYear(turn: number, startYear: number): number {
  return startYear + Math.floor((turn - 1) / 52);
}

function rollDivergentDeparture(draw: number): boolean {
  return draw < DIVERGENT_DEPARTURE_PROBABILITY_PER_TURN;
}

// Minimal 1953 historical occupants — one per seat, positive lean, departure null (still serving)
// Mainline hydrates 9 seats each with a chain; solo seeds one occupant per seat covering 1953-present
// so tenure replay advances only when chain exhausted (divergence point). Cite: src/lib/scotus/presetData/1953.ts
function seedDefaultOccupants(seed: string, seatNumber: number): SupremeCourtSeat["historicalOccupants"] {
  const names = [
    "Chief Justice Earl Warren",
    "Justice Hugo Black",
    "Justice Stanley Reed",
    "Justice Felix Frankfurter",
    "Justice William Douglas",
    "Justice Robert Jackson",
    "Justice Harold Burton",
    "Justice Tom Clark",
    "Justice Sherman Minton",
  ];
  const name = names[seatNumber - 1] ?? `Justice ${seatNumber}`;
  // Alternate lean signs so divergence is exercisable in tests
  const economicLean = seatNumber % 2 === 1 ? 2 : -2;
  const socialLean = seatNumber % 3 === 0 ? 2 : -2;
  void seed;
  return [
    {
      key: `seat-${seatNumber}-1953`,
      name,
      economicLean,
      socialLean,
      seatedYear: 1953,
      departureYear: null,
      departureReason: null,
    },
  ];
}

export function ensureScotusSeats(world: WorldState): void {
  if (world.supremeCourtSeats && world.supremeCourtSeats.length > 0) return;
  const startYear = Number(world.meta.date.slice(0, 4)) || 1953;
  if (!world.supremeCourtSeats) world.supremeCourtSeats = [];
  for (let i = 1; i <= SUPREME_COURT_SEATS; i++) {
    world.supremeCourtSeats.push({
      seatNumber: i,
      countryId: "US",
      justiceMode: "historical",
      justiceId: null,
      justiceName: seedDefaultOccupants(world.meta.seed, i)[0]!.name,
      justiceParty: null,
      economicLean: seedDefaultOccupants(world.meta.seed, i)[0]!.economicLean,
      socialLean: seedDefaultOccupants(world.meta.seed, i)[0]!.socialLean,
      seatedAtTurn: 0,
      isDivergent: false,
      historicalOccupantIndex: 0,
      historicalOccupants: seedDefaultOccupants(world.meta.seed, i),
      divergentHazardStartsTurn: null,
    });
  }
}

function processTenureTurn(world: WorldState, rng: ReturnType<typeof rngFromState>): ScotusTurnResult["tenure"] {
  ensureScotusSeats(world);
  const turn = world.meta.turn;
  const startYear = Number(world.meta.date.slice(0, 4)) || 1953;
  let seatsAdvanced = 0;
  let seatsVacatedByHistory = 0;
  let seatsVacatedByHazard = 0;

  for (const seat of world.supremeCourtSeats!) {
    if (!seat.isDivergent) {
      // Player holds seat — skip historical replay (src/lib/turn/scotusTenureTurn.ts playerHoldsSeat)
      if (seat.justiceMode === "character" && seat.justiceId != null) continue;
      const occupant = seat.historicalOccupants[seat.historicalOccupantIndex];
      if (!occupant || occupant.departureYear == null) continue;
      const departureTurn = yearToTurn(occupant.departureYear, startYear);
      if (turn < departureTurn) continue;
      const next = seat.historicalOccupants[seat.historicalOccupantIndex + 1];
      if (next) {
        seat.historicalOccupantIndex++;
        seat.justiceName = next.name;
        seat.justiceParty = next.party ?? null;
        seat.economicLean = next.economicLean;
        seat.socialLean = next.socialLean;
        seat.seatedAtTurn = turn;
        seatsAdvanced++;
      } else {
        // Vacancy — chain exhausted
        seat.justiceMode = null;
        seat.justiceId = null;
        seat.justiceName = null;
        seat.justiceParty = null;
        seat.economicLean = null;
        seat.socialLean = null;
        seat.seatedAtTurn = null;
        seat.divergentHazardStartsTurn = null;
        seatsVacatedByHistory++;
        world.news.push({
          turn,
          date: world.meta.date,
          headline: `Supreme Court seat #${seat.seatNumber} is vacant (historical chain exhausted)`,
        });
      }
    } else {
      // Divergent hazard — age-agnostic flat per-turn probability after floor
      if (seat.divergentHazardStartsTurn == null) continue;
      if (turn < seat.divergentHazardStartsTurn) continue;
      if (!seat.justiceId && !seat.justiceName) continue; // already vacant
      const draw = rng.next();
      if (rollDivergentDeparture(draw)) {
        const name = seat.justiceName ?? "A justice";
        seat.justiceMode = null;
        seat.justiceId = null;
        seat.justiceName = null;
        seat.justiceParty = null;
        seat.economicLean = null;
        seat.socialLean = null;
        seat.seatedAtTurn = null;
        seat.divergentHazardStartsTurn = null;
        seatsVacatedByHazard++;
        world.news.push({
          turn,
          date: world.meta.date,
          headline: `${name} has left the Supreme Court (seat #${seat.seatNumber} vacant)`,
        });
        // Notify president
        const exec = world.executives["US"];
        if (exec?.presidentId) {
          world.news.push({
            turn,
            date: world.meta.date,
            headline: `Supreme Court seat #${seat.seatNumber} vacant — you may nominate a replacement`,
          });
        }
      }
    }
  }

  return { seatsAdvanced, seatsVacatedByHazard, seatsVacatedByHistory };
}

function processDocketTurn(world: WorldState): ScotusTurnResult["docket"] {
  ensureScotusSeats(world);
  const turn = world.meta.turn;
  const startYear = Number(world.meta.date.slice(0, 4)) || 1953;

  const pending = (world.docketCases ?? []).filter((c) => c.status === "pending");
  if (pending.length === 0) return { casesFired: 0, casesAffirmed: 0, casesDiverged: 0 };

  const seats = world.supremeCourtSeats!;
  const leans: SeatedJusticeLean[] = seats
    .filter((s) => s.justiceMode != null && s.justiceName != null)
    .map((s) => ({ economicLean: s.economicLean ?? 0, socialLean: s.socialLean ?? 0 }));

  let casesAffirmed = 0;
  let casesDiverged = 0;

  for (const docketCase of pending) {
    const dueTurn = yearToTurn(docketCase.decisionYear, startYear);
    if (turn < dueTurn) continue;

    const decision = decideCaseOutcome(leans, docketCase.axis, docketCase.historicalMajorityDirection, {
      historicalOutcomeLocked: docketCase.historicalOutcomeLocked === true,
    });

    if (decision.outcome === "diverged" && docketCase.effect) {
      // Enact diverged ruling as legislation — PORT-STUB: solo's EnactedLaw shape is minimal
      // (billId-based). We record the divergence via news + enactedLawId pointer without
      // attempting to synthesize a full bill; mainline's enactRulingBill pipeline is PORT-STUB
      // here (requires legislationTypes catalog and onBillEnacted side effects).
      const lawId = `scotus_ruling_${docketCase.caseKey}_${turn}`;
      world.enactedLaws.push({
        id: lawId,
        countryId: "US",
        billId: lawId,
        enactedAtTurn: turn,
        level: 0,
        scope: "national",
        // extra citation props kept as unknown but not typed on EnactedLaw:
        // title/source/provision are mainline-only; solo stores them in news.
      } as unknown as WorldState["enactedLaws"][number]);

      docketCase.status = "decided";
      docketCase.outcome = "diverged";
      docketCase.decidedAtTurn = turn;
      docketCase.enactedLawId = lawId;
      casesDiverged++;
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `SCOTUS rules in ${docketCase.title}: divergence from historical outcome`,
      });
    } else {
      docketCase.status = "decided";
      docketCase.outcome = "affirmed";
      docketCase.decidedAtTurn = turn;
      casesAffirmed++;
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `SCOTUS affirms historical outcome in ${docketCase.title}`,
      });
    }
  }

  return { casesFired: casesAffirmed + casesDiverged, casesAffirmed, casesDiverged };
}

function processSurpriseCaseTurn(world: WorldState, rng: ReturnType<typeof rngFromState>): ScotusTurnResult["surprise"] {
  const SURPRISE_SPAWN_PROB = 0.004; // src/lib/scotus/surpriseCaseSpawn.ts
  const draw = rng.next();
  if (draw >= SURPRISE_SPAWN_PROB) return { spawned: false };

  // Templates are PORT-STUB: if none, no spawn
  // Check if we have any surprise-eligible docketCases not yet decided — stub minimal template
  const existingKeys = new Set((world.docketCases ?? []).filter((c) => c.isSurprise).map((c) => c.caseKey));
  const stubTemplates = [
    { templateKey: "surprise-antitrust-solar-1975", title: "Solar Cartel Antitrust", axis: "economic" as const, positiveEffect: { legislationTypeId: "antitrust", policyOptionId: "opt_5", effectDirection: -1 as const }, negativeEffect: { legislationTypeId: "antitrust", policyOptionId: "opt_1", effectDirection: 1 as const } },
    { templateKey: "surprise-privacy-data-2001", title: "Data Privacy Challenge", axis: "social" as const, positiveEffect: { legislationTypeId: "privacy", policyOptionId: "opt_5", effectDirection: -1 as const }, negativeEffect: { legislationTypeId: "privacy", policyOptionId: "opt_1", effectDirection: 1 as const } },
  ];
  const available = stubTemplates.filter((t) => !existingKeys.has(t.templateKey));
  if (available.length === 0) return { spawned: false };

  const pickIdx = Math.min(available.length - 1, Math.floor(rng.next() * available.length));
  const template = available[pickIdx]!;

  const seats = world.supremeCourtSeats ?? [];
  const leans: SeatedJusticeLean[] = seats
    .filter((s) => s.justiceMode != null && s.justiceName != null)
    .map((s) => ({ economicLean: s.economicLean ?? 0, socialLean: s.socialLean ?? 0 }));

  const decision = decideCaseOutcome(leans, template.axis, 1 as const);
  const chosenEffect =
    decision.majoritySide === 1 ? template.positiveEffect : decision.majoritySide === -1 ? template.negativeEffect : undefined;

  if (chosenEffect) {
    const lawId = `scotus_surprise_${template.templateKey}_${world.meta.turn}`;
    world.enactedLaws.push({
      id: lawId,
      countryId: "US",
      billId: lawId,
      enactedAtTurn: world.meta.turn,
      level: 0,
      scope: "national",
    } as unknown as WorldState["enactedLaws"][number]);
  }

  if (!world.docketCases) world.docketCases = [];
  world.docketCases.push({
    id: `docket_${template.templateKey}`,
    countryId: "US",
    caseKey: template.templateKey,
    title: template.title,
    axis: template.axis,
    historicalMajorityDirection: 1,
    decisionYear: turnToYear(world.meta.turn, Number(world.meta.date.slice(0, 4)) || 1953),
    ...(chosenEffect ? { effect: chosenEffect } : {}),
    status: "decided",
    outcome: "diverged",
    decidedAtTurn: world.meta.turn,
    isSurprise: true,
  });

  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `Surprise SCOTUS ruling: ${template.title}`,
  });

  return { spawned: true, caseKey: template.templateKey, majoritySide: decision.majoritySide };
}

function processScotusNominations(world: WorldState, rng: ReturnType<typeof rngFromState>): ScotusTurnResult["nominations"] {
  if (!world.scotusNominations) world.scotusNominations = [];
  const turn = world.meta.turn;
  let nominationsVoted = 0;
  let confirmed = 0;
  let rejected = 0;

  const noms = world.scotusNominations;
  const exec = world.executives["US"];
  const presidentParty = exec?.presidentParty ?? undefined;

  for (const nom of noms) {
    if (nom.status !== "active") continue;

    if (turn < nom.votingEndsOnTurn) {
      const holders = world.politicians.filter((p) => p.countryId === "US" && (p.chamberKey === "senate" || p.chamberKey === "upper"));
      let newVotes = 0;
      for (const holder of holders) {
        const key = `pol_${holder.id}`;
        if (nom.votes[key]) continue;
        const draw = rng.next();
        const vote = nppCabinetVote(holder.partyId, nom.nomineeParty ?? undefined, presidentParty, draw);
        (nom.votes as Record<string, unknown>)[key] = vote;
        if (vote === "for") nom.votesFor += 1;
        else if (vote === "against") nom.votesAgainst += 1;
        else nom.votesAbstain += 1;
        newVotes++;
      }
      if (newVotes > 0) nominationsVoted++;
      continue;
    }

    if (turn >= nom.votingEndsOnTurn) {
      const passed = cabinetDidPass(nom.votesFor, nom.votesAgainst);
      if (passed) {
        // Seat the justice
        const seat = world.supremeCourtSeats?.find((s) => s.seatNumber === nom.seatNumber);
        if (seat) {
          // Ideology: simplified 65% personal + 35% party — PORT-STUB neutral where party scan unavailable
          // For NPC nominee, use fixed lean per nominee id hash
          let economicLean = 0, socialLean = 0;
          if (nom.nomineeParty) {
            const party = Object.values(world.parties).find((p) => p.id === nom.nomineeParty);
            const partyEcon = party?.economicPosition ?? 0;
            const partySocial = party?.socialPosition ?? 0;
            // Personal lean stub: hash nominee name
            const h = [...nom.nomineeName].reduce((a, c) => a + c.charCodeAt(0), 0) % 10 - 5;
            economicLean = Math.round((h * 0.65 + partyEcon * 0.35) * 10) / 10;
            socialLean = Math.round((h * 0.65 + partySocial * 0.35) * 10) / 10;
          }
          seat.justiceMode = nom.nomineeMode;
          seat.justiceId = nom.nomineeId;
          seat.justiceName = nom.nomineeName;
          seat.justiceParty = nom.nomineeParty ?? null;
          seat.economicLean = economicLean;
          seat.socialLean = socialLean;
          seat.seatedAtTurn = turn;
          seat.isDivergent = true;
          seat.divergentHazardStartsTurn = turn + DIVERGENT_TENURE_FLOOR_TURNS;
        }
        nom.status = "confirmed";
        nom.confirmedAtTurn = turn;
        confirmed++;
        world.news.push({
          turn,
          date: world.meta.date,
          headline: `${nom.nomineeName} confirmed to Supreme Court seat #${nom.seatNumber}`,
        });
      } else {
        nom.status = "rejected";
        nom.rejectedAtTurn = turn;
        rejected++;
        world.news.push({
          turn,
          date: world.meta.date,
          headline: `${nom.nomineeName} rejected for Supreme Court seat #${nom.seatNumber}`,
        });
      }
    }
  }

  return { nominationsVoted, confirmed, rejected };
}

export function seatConfirmedJustice(
  world: WorldState,
  opts: { seatNumber: number; nomineeMode: "character" | "npp"; nomineeId: string | null; nomineeName: string; nomineeParty?: string | null; proposedBy: string | null }
): string {
  if (!world.scotusNominations) world.scotusNominations = [];
  const id = `scotus_nom_${world.meta.turn}_${opts.seatNumber}`;
  world.scotusNominations.push({
    id,
    countryId: "US",
    seatNumber: opts.seatNumber,
    nomineeMode: opts.nomineeMode,
    nomineeId: opts.nomineeId,
    nomineeName: opts.nomineeName,
    nomineeParty: opts.nomineeParty ?? null,
    proposedBy: opts.proposedBy,
    status: "active",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    votes: {},
    votingEndsOnTurn: world.meta.turn + 4,
    proposedAtTurn: world.meta.turn,
  });
  return id;
}

export function processScotusTurn(world: WorldState): ScotusTurnResult {
  ensureScotusSeats(world);
  const rng = rngFromState(world.meta.rng as RngState);
  const tenure = processTenureTurn(world, rng);
  const docket = processDocketTurn(world);
  const surprise = processSurpriseCaseTurn(world, rng);
  const nominations = processScotusNominations(world, rng);
  // Advance RNG state
  world.meta.rng = rng.state();
  return { tenure, docket, surprise, nominations };
}
