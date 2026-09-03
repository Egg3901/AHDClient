import { GOVERNMENT_CHAMBER_BY_COUNTRY } from "../government/constants.js";
import { tickDecayFactor } from "../events/crisis.js";
import type { WorldState } from "../types.js";
import {
  APPROVAL_ACTIVE_CONFLICT_PENALTY,
  APPROVAL_BASE,
  APPROVAL_DEFICIT_CLAMP,
  APPROVAL_DEFICIT_WEIGHT,
  APPROVAL_GROWTH_CLAMP,
  APPROVAL_GROWTH_WEIGHT,
  APPROVAL_IMPEACHMENT_PENALTY,
  APPROVAL_INFLATION_CLAMP,
  APPROVAL_INFLATION_WEIGHT,
  APPROVAL_PENDING_GOVERNMENT_PENALTY,
  APPROVAL_UNEMPLOYMENT_CLAMP,
  APPROVAL_UNEMPLOYMENT_WEIGHT,
  APPROVAL_VACANT_EXECUTIVE_PENALTY,
  APPROVAL_HISTORY_CAP,
  DEFAULT_APPROVAL,
  DEFAULT_LEGITIMACY,
  DEFAULT_UNREST,
  LEGITIMACY_BASE,
  LEGITIMACY_CONFLICT_PENALTY,
  LEGITIMACY_FILLED_EXECUTIVE_BONUS,
  LEGITIMACY_FORMED_GOVERNMENT_BONUS,
  LEGITIMACY_IMPEACHMENT_PENALTY,
  LEGITIMACY_VACANCY_WEIGHT,
  MOOD_MAX_DELTA_PER_TURN,
  NEUTRAL_GROWTH_RATE,
  NEUTRAL_INFLATION_RATE,
  NEUTRAL_UNEMPLOYMENT_RATE,
  UNREST_BASE,
  UNREST_CONFLICT_BONUS,
  UNREST_CRISIS_BONUS,
  UNREST_INFLATION_WEIGHT,
  UNREST_UNEMPLOYMENT_WEIGHT,
} from "./constants.js";
import type {
  ApprovalSample,
  ChamberOfficers,
  CountryPoliticalOverview,
  RegimeClassification,
} from "./types.js";

/**
 * Pure national-mood math + seeding for the country political overview.
 * Everything here is RNG-free by contract: createWorld calls the seed
 * functions after capturing meta.rng, and the turn phase never draws, so
 * neither shifts any other system's rng stream (same tail-cluster rule the
 * phase registry documents for every rng-free phase).
 */

/**
 * One-party regimes, checked before the executive rule so CN stays put
 * after government/phases.ts syncCnPresident seats its president (an
 * executive entry must not flip a one-party state to
 * "presidential-republic"). The set mirrors the codebase's own one-party
 * naming (government/types.ts ConfidenceBand doc: CN/RU/DD) and the
 * single-list election content of the RU/DD packs.
 */
const ONE_PARTY_COUNTRIES: ReadonlySet<string> = new Set(["RU", "DD", "CN"]);
/** Presidential systems per government/constants.ts (BR is presidential: no PM). */
const PRESIDENTIAL_COUNTRIES: ReadonlySet<string> = new Set(["US", "BR"]);

function clamp01(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampContribution(value: number, bounds: readonly [number, number]): number {
  return Math.max(bounds[0], Math.min(bounds[1], value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function classifyRegime(world: WorldState, countryId: string): RegimeClassification {
  if (ONE_PARTY_COUNTRIES.has(countryId)) return "one-party";
  if (PRESIDENTIAL_COUNTRIES.has(countryId)) return "presidential-republic";
  if (GOVERNMENT_CHAMBER_BY_COUNTRY[countryId] !== undefined) return "parliamentary";
  return "national-government";
}

/**
 * Engine-canonical display label. Same derivation the desktop
 * localSource uses today, so the UI can adopt this field without changing
 * what players see: an executive entry means a presidential republic, a
 * government record means a parliamentary government (coalition or not),
 * otherwise a bare national government.
 */
export function governmentTypeFor(world: WorldState, countryId: string): string {
  const regime = classifyRegime(world, countryId);
  if (regime === "presidential-republic") return "Presidential republic";
  if (regime === "one-party") return "One-party state";
  const government = world.governments[countryId];
  if (government !== undefined) {
    return government.formationType === "coalition"
      ? "Parliamentary coalition"
      : "Parliamentary government";
  }
  return "National government";
}

function economyOf(world: WorldState, countryId: string): {
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
} {
  const econ = world.countries[countryId]?.economy;
  return {
    growthRate: isFiniteNumber(econ?.growthRate) ? econ.growthRate : NEUTRAL_GROWTH_RATE,
    inflationRate: isFiniteNumber(econ?.inflationRate) ? econ.inflationRate : NEUTRAL_INFLATION_RATE,
    unemploymentRate: isFiniteNumber(econ?.unemploymentRate)
      ? econ.unemploymentRate
      : NEUTRAL_UNEMPLOYMENT_RATE,
  };
}

/** Surplus/GDP as a fraction; 0 when no budget (macro-only country). */
function surplusRatio(world: WorldState, countryId: string): number {
  const budget = world.budgets?.[countryId];
  const gdp = world.countries[countryId]?.economy.gdp;
  if (!budget || !isFiniteNumber(budget.surplus) || !isFiniteNumber(gdp) || gdp <= 0) return 0;
  return budget.surplus / gdp;
}

function hasActiveConflict(world: WorldState, countryId: string): boolean {
  return (world.conflicts ?? []).some(
    (c) =>
      c.status !== "resolved" &&
      (c.sideA.countries.includes(countryId) || c.sideB.countries.includes(countryId)),
  );
}

function hasOpenImpeachment(world: WorldState, countryId: string): boolean {
  return (world.impeachments ?? []).some(
    (imp) => imp.countryId === countryId && (imp.stage === "house" || imp.stage === "senate"),
  );
}

/**
 * Scaled "approval"-type crisis pressure on a country this turn. Reuses the
 * same tickDecayFactor applyCrisisEffects uses, so the gauge reads the live
 * crisis the same strength the economy feels it. The crisis lifecycle keeps
 * its existing favorability-proxy behavior untouched; this is an additional
 * read, not a second application.
 */
function crisisApprovalPressure(world: WorldState, countryId: string): number {
  const turn = world.meta.turn;
  let total = 0;
  for (const crisis of world.crises ?? []) {
    if (crisis.status !== "active" || !crisis.countryIds.includes(countryId)) continue;
    for (const effect of crisis.effects ?? []) {
      if (effect.type !== "approval") continue;
      const value = isFiniteNumber(effect.value) ? effect.value : 0;
      total += effect.effectType === "tick"
        ? value * tickDecayFactor(turn, crisis.startTurn, crisis.durationTurns)
        : value;
    }
  }
  return total;
}

/**
 * Macro-implied approval target for a country. Inputs are all live world
 * data: growth/unemployment/inflation vs neutral baselines, the
 * deficit ratio, executive/government fullness, open impeachments, active
 * conflicts, and scaled crisis approval pressure.
 */
export function approvalTargetFor(world: WorldState, countryId: string): number {
  const econ = economyOf(world, countryId);
  const growthTerm = clampContribution(
    (econ.growthRate - NEUTRAL_GROWTH_RATE) * APPROVAL_GROWTH_WEIGHT,
    APPROVAL_GROWTH_CLAMP,
  );
  const unemploymentTerm = clampContribution(
    -(econ.unemploymentRate - NEUTRAL_UNEMPLOYMENT_RATE) * APPROVAL_UNEMPLOYMENT_WEIGHT,
    APPROVAL_UNEMPLOYMENT_CLAMP,
  );
  const inflationTerm = clampContribution(
    -(econ.inflationRate - NEUTRAL_INFLATION_RATE) * APPROVAL_INFLATION_WEIGHT,
    APPROVAL_INFLATION_CLAMP,
  );
  const deficitTerm = clampContribution(
    surplusRatio(world, countryId) * APPROVAL_DEFICIT_WEIGHT,
    APPROVAL_DEFICIT_CLAMP,
  );
  let target = APPROVAL_BASE + growthTerm + unemploymentTerm + inflationTerm + deficitTerm;

  const exec = world.executives[countryId];
  if (exec !== undefined && exec.presidentId === null) target += APPROVAL_VACANT_EXECUTIVE_PENALTY;
  const government = world.governments[countryId];
  if (government !== undefined && government.status !== "formed") {
    target += APPROVAL_PENDING_GOVERNMENT_PENALTY;
  }
  if (hasActiveConflict(world, countryId)) target += APPROVAL_ACTIVE_CONFLICT_PENALTY;
  if (hasOpenImpeachment(world, countryId)) target += APPROVAL_IMPEACHMENT_PENALTY;
  target += crisisApprovalPressure(world, countryId);
  return round1(clamp01(target));
}

function electedVacancyShare(world: WorldState, countryId: string): number {
  const leg = world.legislatures[countryId];
  if (!leg) return 0;
  let seats = 0;
  let vacancies = 0;
  for (const chamber of leg.chambers) {
    if (!chamber.elected || chamber.seats <= 0) continue;
    seats += chamber.seats;
    vacancies += chamber.composition.vacancies;
  }
  if (seats <= 0) return 0;
  return Math.max(0, Math.min(1, vacancies / seats));
}

export function legitimacyTargetFor(world: WorldState, countryId: string): number {
  let target = LEGITIMACY_BASE;
  const exec = world.executives[countryId];
  if (exec !== undefined && exec.presidentId !== null) target += LEGITIMACY_FILLED_EXECUTIVE_BONUS;
  const government = world.governments[countryId];
  if (government !== undefined && government.status === "formed") {
    target += LEGITIMACY_FORMED_GOVERNMENT_BONUS;
  }
  target -= electedVacancyShare(world, countryId) * LEGITIMACY_VACANCY_WEIGHT;
  if (hasActiveConflict(world, countryId)) target += LEGITIMACY_CONFLICT_PENALTY;
  if (hasOpenImpeachment(world, countryId)) target += LEGITIMACY_IMPEACHMENT_PENALTY;
  return round1(clamp01(target));
}

export function unrestTargetFor(world: WorldState, countryId: string): number {
  const econ = economyOf(world, countryId);
  let target = UNREST_BASE
    + (econ.unemploymentRate - NEUTRAL_UNEMPLOYMENT_RATE) * UNREST_UNEMPLOYMENT_WEIGHT
    + (econ.inflationRate - NEUTRAL_INFLATION_RATE) * UNREST_INFLATION_WEIGHT;
  for (const crisis of world.crises ?? []) {
    if (crisis.status !== "active" || !crisis.countryIds.includes(countryId)) continue;
    target += UNREST_CRISIS_BONUS;
  }
  if (hasActiveConflict(world, countryId)) target += UNREST_CONFLICT_BONUS;
  return round1(clamp01(target));
}

/**
 * Expected officers for one chamber from current seat-holders. Structural
 * placeholder, not constitutional law: the presiding officer (speaker) is
 * the most senior (lowest-id) politician of the largest holder party and
 * the majority leader the next of the same party, so a change in chamber
 * control flips the offices. Nulls when the chamber seats nobody (all
 * vacant — e.g. UK commons in the shipped packs, an authored content gap,
 * not a value to invent).
 */
export function expectedOfficersForChamber(
  world: WorldState,
  countryId: string,
  chamberKey: string,
): ChamberOfficers {
  const holders = world.politicians
    .filter((p) => p.countryId === countryId && p.chamberKey === chamberKey)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (holders.length === 0) {
    return { chamberKey, speakerId: null, speakerPartyId: null, majorityLeaderId: null, majorityLeaderPartyId: null };
  }
  const byParty = new Map<string, typeof holders>();
  for (const h of holders) {
    const list = byParty.get(h.partyId) ?? [];
    list.push(h);
    byParty.set(h.partyId, list);
  }
  const ranked = [...byParty.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const [partyId, members] = ranked[0]!;
  const speaker = members[0]!;
  const leader = members.find((m) => m.id !== speaker.id) ?? null;
  return {
    chamberKey,
    speakerId: speaker.id,
    speakerPartyId: partyId,
    majorityLeaderId: leader ? leader.id : null,
    majorityLeaderPartyId: leader ? partyId : null,
  };
}

function officersEqual(a: ChamberOfficers, b: ChamberOfficers): boolean {
  return (
    a.speakerId === b.speakerId &&
    a.speakerPartyId === b.speakerPartyId &&
    a.majorityLeaderId === b.majorityLeaderId &&
    a.majorityLeaderPartyId === b.majorityLeaderPartyId
  );
}

function moveToward(current: number, target: number): number {
  const delta = target - current;
  const step = Math.max(-MOOD_MAX_DELTA_PER_TURN, Math.min(MOOD_MAX_DELTA_PER_TURN, delta));
  return round1(clamp01(current + step));
}

function seedApprovalHistory(turn: number, approval: number): ApprovalSample[] {
  return [{ turn, approval }];
}

/**
 * Seed one country's overview from existing world data. Defensive by
 * design (the v43 migration runs this over old saves): unknown countries
 * get honest neutral defaults, never invented office-holders.
 */
export function seedCountryOverview(world: WorldState, countryId: string): CountryPoliticalOverview {
  const country = world.countries[countryId];
  if (!country) {
    return {
      countryId,
      approval: DEFAULT_APPROVAL,
      approvalHistory: seedApprovalHistory(world.meta.turn, DEFAULT_APPROVAL),
      regime: "national-government",
      governmentType: "National government",
      legitimacy: DEFAULT_LEGITIMACY,
      unrest: DEFAULT_UNREST,
      officersByChamber: {},
      updatedTurn: world.meta.turn,
    };
  }
  const approval = approvalTargetFor(world, countryId);
  const officersByChamber: Record<string, ChamberOfficers> = {};
  for (const chamber of world.legislatures[countryId]?.chambers ?? []) {
    officersByChamber[chamber.key] = expectedOfficersForChamber(world, countryId, chamber.key);
  }
  return {
    countryId,
    approval,
    approvalHistory: seedApprovalHistory(world.meta.turn, approval),
    regime: classifyRegime(world, countryId),
    governmentType: governmentTypeFor(world, countryId),
    legitimacy: legitimacyTargetFor(world, countryId),
    unrest: unrestTargetFor(world, countryId),
    officersByChamber,
    updatedTurn: world.meta.turn,
  };
}

/** Seed overviews for every playable country. RNG-free. */
export function seedCountryPolitics(world: WorldState): Record<string, CountryPoliticalOverview> {
  const out: Record<string, CountryPoliticalOverview> = {};
  const ids = Object.values(world.countries)
    .filter((c) => c.playable)
    .map((c) => c.id)
    .sort();
  for (const id of ids) out[id] = seedCountryOverview(world, id);
  return out;
}

/**
 * Per-turn update: ease approval/legitimacy/unrest toward their live
 * targets and reconcile officers, regime, and government type with the
 * current composition. RNG-free. Covers chambers that appear after seed
 * (officersByChamber gains keys) and drops none (a removed chamber keeps
 * its last officers — the record is history, not a live seat).
 */
export function updateCountryPolitics(world: WorldState): void {
  const ids = Object.values(world.countries)
    .filter((c) => c.playable)
    .map((c) => c.id)
    .sort();
  for (const id of ids) {
    let overview = world.countryPolitics[id];
    if (!overview) {
      world.countryPolitics[id] = seedCountryOverview(world, id);
      continue;
    }
    let changed = false;
    const approval = moveToward(overview.approval, approvalTargetFor(world, id));
    if (approval !== overview.approval) {
      overview.approval = approval;
      changed = true;
    }
    const lastSample = overview.approvalHistory[overview.approvalHistory.length - 1];
    if (!lastSample || lastSample.turn !== world.meta.turn) {
      overview.approvalHistory.push({ turn: world.meta.turn, approval: overview.approval });
      if (overview.approvalHistory.length > APPROVAL_HISTORY_CAP) {
        overview.approvalHistory.splice(0, overview.approvalHistory.length - APPROVAL_HISTORY_CAP);
      }
      changed = true;
    } else if (lastSample.approval !== overview.approval) {
      lastSample.approval = overview.approval;
      changed = true;
    }
    const legitimacy = moveToward(overview.legitimacy, legitimacyTargetFor(world, id));
    if (legitimacy !== overview.legitimacy) {
      overview.legitimacy = legitimacy;
      changed = true;
    }
    const unrest = moveToward(overview.unrest, unrestTargetFor(world, id));
    if (unrest !== overview.unrest) {
      overview.unrest = unrest;
      changed = true;
    }
    for (const chamber of world.legislatures[id]?.chambers ?? []) {
      const expected = expectedOfficersForChamber(world, id, chamber.key);
      const current = overview.officersByChamber[chamber.key];
      if (!current || !officersEqual(current, expected)) {
        overview.officersByChamber[chamber.key] = expected;
        changed = true;
      }
    }
    const regime = classifyRegime(world, id);
    if (regime !== overview.regime) {
      overview.regime = regime;
      changed = true;
    }
    const governmentType = governmentTypeFor(world, id);
    if (governmentType !== overview.governmentType) {
      overview.governmentType = governmentType;
      changed = true;
    }
    if (changed) overview.updatedTurn = world.meta.turn;
  }
}
