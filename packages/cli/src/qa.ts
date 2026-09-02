/**
 * W42 QA gate (P4). Per playable country of every shipped era: a long
 * (default 2080-turn / 40 in-game year) sim with W41 invariant checks every
 * checkpoint, a full-length determinism twin, and a final sanity report
 * (economy bands, election activity, government formation, seat sums,
 * politician population bounds, treasury bounds). Iterates listEras() so
 * eras merged after this wave (era-truth 1979/1991/2019) are covered
 * automatically without a code change.
 *
 * Determinism design note: comparing two independent full-length runs is
 * exactly as expensive (2x turns) whether the comparison length is the full
 * `turns` or some smaller slice, since a second run is unavoidable either
 * way. So this checks determinism at the SAME length as the main sim
 * (`turns`), not a truncated slice — the twin run doubles as free coverage
 * of the "no invariant breaks" gate too (run B, kept separate from run A's
 * checkpoint report, has no bearing on the report's numbers, only the
 * pass/fail of the diff).
 */
import {
  advanceTurn,
  createWorld,
  listEras,
  listPlayableCountries,
  checkInvariants,
  GROWTH_RATE_MIN,
  GROWTH_RATE_MAX,
  UNEMPLOYMENT_MIN,
  UNEMPLOYMENT_MAX,
  INFLATION_MIN,
  INFLATION_MAX,
  OUTPUT_GAP_BOUND,
  GOVERNMENT_CHAMBER_BY_COUNTRY,
} from "@rotunda/engine";
import type { WorldState, InvariantReport } from "@rotunda/engine";
import { deepCompare } from "./comparator.js";

export interface QaOptions {
  /** Turns to advance each run. Full mode 2080 (40 in-game years), quick mode 400. */
  turns: number;
  /** Run checkInvariants every N turns (and always at the final turn). */
  checkpointInterval: number;
  /** Seed prefix; per-country/era seeds are derived deterministically from it. */
  seedPrefix: string;
}

export const FULL_QA_OPTIONS: QaOptions = { turns: 2080, checkpointInterval: 260, seedPrefix: "qa" };
export const QUICK_QA_OPTIONS: QaOptions = { turns: 400, checkpointInterval: 100, seedPrefix: "qa-quick" };

export interface BandViolation {
  metric: string;
  value: number;
  min: number;
  max: number;
  turn: number;
}

export interface SeatSumViolation {
  chamberKey: string;
  turn: number;
  seatsByPartySum: number;
  vacancies: number;
  expectedSeats: number;
}

export interface QaCountryResult {
  era: string;
  countryId: string;
  countryName: string;
  turns: number;
  seed: string;
  determinismOk: boolean;
  determinismDiffCount: number;
  invariantReports: InvariantReport[];
  invariantOk: boolean;
  economyBandViolations: BandViolation[];
  seatSumViolations: SeatSumViolation[];
  electionsSeen: number;
  electionsResolved: number;
  electionsOk: boolean;
  governmentApplicable: boolean;
  governmentFormed: boolean;
  governmentStuckPending: boolean;
  politicianCountInitial: number;
  politicianCountFinal: number;
  politicianPopulationOk: boolean;
  treasuryBalanceFinal: number;
  treasuryBoundsOk: boolean;
  /** AND of every sub-check; the CLI exits nonzero if any country is false. */
  ok: boolean;
}

/** Percent-scale engine clamp bounds converted to the fraction scale CountryEconomy stores. */
function economyBands(): Record<string, [number, number]> {
  return {
    growthRate: [GROWTH_RATE_MIN, GROWTH_RATE_MAX],
    unemploymentRate: [UNEMPLOYMENT_MIN / 100, UNEMPLOYMENT_MAX / 100],
    inflationRate: [INFLATION_MIN / 100, INFLATION_MAX / 100],
    outputGap: [OUTPUT_GAP_BOUND[0], OUTPUT_GAP_BOUND[1]],
  };
}

function checkEconomyBands(world: WorldState, countryId: string, turn: number, out: BandViolation[]): void {
  const econ = world.countries[countryId]?.economy;
  if (!econ) return;
  const bands = economyBands();
  for (const [metric, [min, max]] of Object.entries(bands)) {
    const value = (econ as unknown as Record<string, number>)[metric]!;
    if (!Number.isFinite(value) || value < min || value > max) {
      out.push({ metric, value, min, max, turn });
    }
  }
  if (!Number.isFinite(econ.gdp) || econ.gdp <= 0) {
    out.push({ metric: "gdp", value: econ.gdp, min: 0, max: Number.POSITIVE_INFINITY, turn });
  }
}

function checkSeatSums(world: WorldState, countryId: string, turn: number, out: SeatSumViolation[]): void {
  const leg = world.legislatures[countryId];
  if (!leg) return;
  for (const chamber of leg.chambers) {
    const sum = Object.values(chamber.composition.seatsByParty).reduce((a, b) => a + b, 0);
    const total = sum + chamber.composition.vacancies;
    if (total !== chamber.seats) {
      out.push({
        chamberKey: chamber.key,
        turn,
        seatsByPartySum: sum,
        vacancies: chamber.composition.vacancies,
        expectedSeats: chamber.seats,
      });
    }
  }
}

function countPoliticians(world: WorldState, countryId: string): number {
  return world.politicians.filter((p) => p.countryId === countryId).length;
}

function runFullSim(era: string, countryId: string, seed: string, turns: number, checkpointInterval: number): {
  world: WorldState;
  reports: InvariantReport[];
  bandViolations: BandViolation[];
  seatSumViolations: SeatSumViolation[];
  politicianCountInitial: number;
} {
  const world = createWorld({ era, countryId, seed, playerName: "QaPlayer" });
  const politicianCountInitial = countPoliticians(world, countryId);
  const reports: InvariantReport[] = [];
  const bandViolations: BandViolation[] = [];
  const seatSumViolations: SeatSumViolation[] = [];

  const recordCheckpoint = (checkBands: boolean): void => {
    reports.push(checkInvariants(world));
    // Economy bands mirror macroCountryTurn.ts / inflationRecalc.ts's own
    // per-turn clamps, which only run from turn 1 onward — some seed packs
    // deliberately start below the clamp floor (e.g. 1953.ts RU/DD planned-
    // economy unemploymentRate 0.5%, historical full-employment doctrine,
    // versus the engine's UNEMPLOYMENT_MIN=1.0% operational floor) and get
    // pulled into band on turn 1's computation. Checking bands at the t0
    // baseline would flag that self-correcting seed value as a false
    // violation, so bands are skipped at t0 (conservation invariants above
    // are still checked there — those ARE seed properties).
    if (checkBands) checkEconomyBands(world, countryId, world.meta.turn, bandViolations);
    checkSeatSums(world, countryId, world.meta.turn, seatSumViolations);
  };

  recordCheckpoint(false); // turn 0 baseline: invariants + seat sums only
  for (let i = 0; i < turns; i++) {
    advanceTurn(world);
    const turnNo = i + 1;
    if (turnNo % checkpointInterval === 0 || turnNo === turns) {
      recordCheckpoint(true);
    }
  }

  return { world, reports, bandViolations, seatSumViolations, politicianCountInitial };
}

/** Runs the full QA suite for one era+country pair. Two independent full-length runs (A + twin B). */
export function runQaForCountry(era: string, countryId: string, countryName: string, opts: QaOptions): QaCountryResult {
  const seed = `${opts.seedPrefix}-${era}-${countryId}`;
  const a = runFullSim(era, countryId, seed, opts.turns, opts.checkpointInterval);
  const b = runFullSim(era, countryId, seed, opts.turns, opts.checkpointInterval);

  const cmp = deepCompare(a.world, b.world);
  const determinismOk = cmp.equal;

  const world = a.world;
  const invariantOk = a.reports.every((r) => r.status !== "red");

  // Elections: how many races this country has ever seen, and how many
  // resolved — a genuine liveness check (a broken election wiring would
  // seat zero races over 40 in-game years).
  const countryElections = world.elections.filter((e) => e.countryId === countryId);
  const electionsSeen = countryElections.length;
  const electionsResolved = countryElections.filter((e) => e.status === "resolved").length;
  const electionsOk = electionsSeen > 0;

  // Government formation (UK/RU/DD only; US has no parliamentary formation).
  const chamberKey = GOVERNMENT_CHAMBER_BY_COUNTRY[countryId];
  const governmentApplicable = chamberKey !== undefined;
  const gov = governmentApplicable ? world.governments[countryId] : undefined;
  const governmentFormed = gov?.status === "formed";
  const governmentStuckPending =
    governmentApplicable &&
    gov !== undefined &&
    gov.status === "pending" &&
    gov.pmVacancyDeadlineTurn !== null &&
    world.meta.turn > gov.pmVacancyDeadlineTurn;

  // Politician population: bounded relative to the world's own starting
  // count for that country, so the check is era/country-agnostic. Basis is
  // max(initial seeded count, total legislature seats) rather than the raw
  // initial count alone, because UK/RU/DD chambers seed all-vacant at t0
  // (content/packs/1953.ts file doc: "democracies start vacant") — dividing
  // by a zero initial count would collapse the band to [0,0]. Generous band
  // (0.15x-4x of that basis) — it exists to catch a runaway generator or a
  // total collapse, not to pin an exact target.
  const politicianCountFinal = countPoliticians(world, countryId);
  const totalSeatsForCountry = (world.legislatures[countryId]?.chambers ?? []).reduce((s, c) => s + c.seats, 0);
  const popBasis = Math.max(a.politicianCountInitial, totalSeatsForCountry, 1);
  const popMin = popBasis * 0.15;
  const popMax = popBasis * 4;
  const politicianPopulationOk = politicianCountFinal >= popMin && politicianCountFinal <= popMax;

  // Treasury bounds: country budget treasuryBalance (CountryBudget.treasuryBalance)
  // must stay finite and within a generous multiple of the country's GDP —
  // catches an explosion/NaN, not ordinary deficit accumulation. Uses
  // CountryBudget.gdp (absolute local currency, e.g. US 387_000_000_000),
  // NOT Country.economy.gdp (millions-scaled, e.g. US 387000) — the two
  // fields are intentionally on different scales (content/packs/1953.ts file
  // doc), and comparing treasuryBalance against the millions-scale figure
  // would be off by 1e6. (Distinct from Party.treasury, whose unbounded
  // growth is a documented, owned artifact — ROADMAP-1.0.md "Integration
  // findings ledger" — and is deliberately not checked here.)
  const budget = world.budgets[countryId];
  const budgetGdp = budget?.gdp ?? 0;
  const treasuryBalanceFinal = budget?.treasuryBalance ?? NaN;
  const treasuryCeiling = Math.max(budgetGdp, 1) * 50;
  const treasuryBoundsOk = Number.isFinite(treasuryBalanceFinal) && Math.abs(treasuryBalanceFinal) <= treasuryCeiling;

  const seatSumOk = a.seatSumViolations.length === 0;
  const economyBandsOk = a.bandViolations.length === 0;

  const ok =
    determinismOk &&
    invariantOk &&
    economyBandsOk &&
    seatSumOk &&
    electionsOk &&
    !governmentStuckPending &&
    politicianPopulationOk &&
    treasuryBoundsOk;

  return {
    era,
    countryId,
    countryName,
    turns: opts.turns,
    seed,
    determinismOk,
    determinismDiffCount: cmp.diffs.length,
    invariantReports: a.reports,
    invariantOk,
    economyBandViolations: a.bandViolations,
    seatSumViolations: a.seatSumViolations,
    electionsSeen,
    electionsResolved,
    electionsOk,
    governmentApplicable,
    governmentFormed,
    governmentStuckPending,
    politicianCountInitial: a.politicianCountInitial,
    politicianCountFinal,
    politicianPopulationOk,
    treasuryBalanceFinal,
    treasuryBoundsOk,
    ok,
  };
}

export interface QaFilter {
  /** Restrict to one era id, otherwise every listEras() entry. */
  era?: string;
  /** Restrict to one country id, otherwise every listPlayableCountries() entry for the era(s) in scope. */
  country?: string;
}

/**
 * Runs the full QA suite across every shipped era and its playable
 * countries (or a narrowed subset via `filter` — used to split a full
 * 2080-turn sweep into per-country invocations that each fit a bounded
 * runtime; `sim qa` with no filter is the real gate).
 */
export function runQa(opts: QaOptions, filter?: QaFilter): QaCountryResult[] {
  const results: QaCountryResult[] = [];
  const eras = listEras().filter((e) => filter?.era === undefined || e.id === filter.era);
  for (const era of eras) {
    const countries = listPlayableCountries(era.id).filter((c) => filter?.country === undefined || c.id === filter.country);
    for (const country of countries) {
      results.push(runQaForCountry(era.id, country.id, country.name, opts));
    }
  }
  return results;
}
