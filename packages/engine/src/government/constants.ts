import type { ConfidenceBand } from "./types.js";

/**
 * Constants ported byte-identical from mainline. See government/types.ts
 * file doc and government/formation.ts for citations of how each is used.
 */

/** floor(totalSeats/2)+1. src/lib/turn/lowerChamberSeats.ts:50-52. */
export function majorityThreshold(totalSeats: number): number {
  return Math.floor(totalSeats / 2) + 1;
}

/**
 * Minority-bid floor: ceil(totalSeats * MINORITY_SEAT_FRACTION).
 * parliamentaryGovernment.ts:1361.
 */
export const MINORITY_SEAT_FRACTION = 0.1538;

export function minorityThreshold(totalSeats: number): number {
  return Math.ceil(totalSeats * MINORITY_SEAT_FRACTION);
}

/** src/lib/constants/governmentFormation.ts:10. */
export const NO_CONFIDENCE_COOLDOWN_TURNS = 48;

/** src/lib/constants/turnTime.ts:198. */
export const PM_VACANCY_DEADLINE_TURNS = 96;

/** src/lib/turn/snapElection.ts:49-50. */
export const SNAP_ELECTION_LIMIT = 2;
export const SNAP_ELECTION_COOLDOWN_TURNS = 336;

/** src/lib/onePartyState/rulingPartyConfidence.ts:11-34. */
export const INITIAL_CONFIDENCE = 75;
export const RENEWAL_BUMP = 5;
export const MAX_CONFIDENCE = 95;
export const MIN_CONFIDENCE = 0;

export function clampConfidence(value: number): number {
  return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, value));
}

/**
 * CONFIDENCE_BANDS, src/lib/onePartyState/rulingPartyConfidence.ts:41-48.
 * Highest matching band wins (checked high to low).
 */
export function classifyConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 80) return "secure";
  if (confidence >= 65) return "stable";
  if (confidence >= 50) return "watchful";
  if (confidence >= 35) return "strained";
  if (confidence >= 20) return "crisis";
  return "critical";
}

/**
 * noConfidenceMotionCarries, parliamentaryGovernment.ts:1089-1106.
 * Whole-chamber majority of the threshold, not majority-of-votes-cast:
 * abstentions/unvoted seats favor the government. Exposed for a future
 * action layer; no phase in this wave calls it automatically (see
 * government/phases.ts file doc — mainline itself never auto-triggers a
 * no-confidence vote either, only a party chair proposes one).
 */
export function noConfidenceMotionCarries(input: {
  votesFor: number;
  votesAgainst: number;
  threshold?: number | null;
  totalSeats?: number | null;
}): boolean {
  const threshold = input.threshold ?? (input.totalSeats != null ? majorityThreshold(input.totalSeats) : null);
  if (threshold != null) return input.votesFor >= threshold;
  return input.votesFor > input.votesAgainst;
}

/** UK/RU/DD government-answerable elected chamber per country. */
export const GOVERNMENT_CHAMBER_BY_COUNTRY: Record<string, string> = {
  UK: "commons",
  RU: "sovietOfTheUnion",
  DD: "volkskammer",
  // W61 roster (COUNTRY_CONFIGS: JP parliamentaryMonarchy / DE parliamentaryRepublic /
  // IE parliamentaryRepublic / CN onePartyState; the head of government is
  // invested by the lower chamber in each). BR is presidential: no PM.
  JP: "shugiin",
  DE: "bundestag",
  IE: "dail",
  CN: "npc",
};

/**
 * Countries whose regions carry an elected regional executive ("governor"
 * electionType in mainline: US governors, JP regional governors, DE
 * Minister-Presidents, CN provincial governors, BR state governors, IE
 * regional chairs). Source: COUNTRY_CONFIGS officeTypes per country and
 * perpetualElections.ts ensure{JP,CN,BR}GovernorElections / DE ministerPresident.
 */
export const GOVERNOR_COUNTRIES: ReadonlySet<string> = new Set(["US", "JP", "DE", "CN", "BR", "IE"]);

/** Base election type this chamber's regular elections run under, keyed by GOVERNMENT_CHAMBER_BY_COUNTRY's chamberKey. */
export const BASE_ELECTION_TYPE_BY_CHAMBER: Record<string, string> = {
  commons: "commons",
  sovietOfTheUnion: "supremeSovietDeputy",
  volkskammer: "volkskammerDeputy",
  shugiin: "shugiin",
  bundestag: "bundestag",
  dail: "dail",
  npc: "npcDelegate",
};

/**
 * Snap election type per government chamber. Only "snap_commons" exists in
 * mainline's canonicalCycle.ts snap-type switch and constants.ts
 * DEFAULT_DURATIONS today (ported at packages/engine/src/electionEngine/
 * resolution/{canonicalCycle,constants}.ts); RU/DD get the same "48h total /
 * 24h primary / 24h general" shape reused under country-specific keys since
 * mainline has no snap_supremeSovietDeputy/snap_volkskammerDeputy constant to
 * cite — RU/DD are single-party regimes whose ruling party holds a landslide
 * majority in the seed data (RU_CPSU 398/526, DD_SED 292/500, both well over
 * their majority thresholds), so formation never actually hangs for them in
 * practice and this path is exercised only defensively.
 */
export const SNAP_ELECTION_TYPE_BY_CHAMBER: Record<string, string> = {
  commons: "snap_commons",
  // Named snap_<base election type>, the same convention as snap_commons
  // (commons -> "commons"), so the multi-seat gates in electionEngine
  // recognise them: a vacant one-party chamber otherwise resolved as a
  // single-winner race and seated 1 of 559 deputies (QA sweep, 1979 RU).
  sovietOfTheUnion: "snap_supremeSovietDeputy",
  volkskammer: "snap_volkskammerDeputy",
  // W61: snap_shugiin / snap_bundestag are mainline names (canonicalCycle.ts,
  // DEFAULT_DURATIONS); snap_dail / snap_npcDelegate follow the same convention.
  shugiin: "snap_shugiin",
  bundestag: "snap_bundestag",
  dail: "snap_dail",
  npc: "snap_npcDelegate",
};

/**
 * Snap election duration, ported from DEFAULT_DURATIONS.snap_commons
 * (48h total / 24h primary / 24h general — src/lib/constants/electionDurations.ts:43,
 * already present verbatim in this repo's electionEngine/resolution/constants.ts
 * DEFAULT_DURATIONS.snap_commons). "Every real hour is a game week" maps 1:1
 * onto solo turns (see elections/orchestration.ts file doc), so these are
 * turn counts, not hours. Applied to all three snap types (see
 * SNAP_ELECTION_TYPE_BY_CHAMBER doc for why RU/DD reuse the UK shape).
 */
export const SNAP_DURATION_TURNS = 48;
export const SNAP_PRIMARY_DURATION_TURNS = 24;
export const SNAP_GENERAL_DURATION_TURNS = 24;

/**
 * Lower chambers contested PER REGION with totalSeats = region.houseSeats
 * (US house is handled by its own apportionment path). Sources: mainline
 * perpetualElections.ts ensureJPElections / ensureDEElections (DE_WAHLKREIS_SEATS)
 * / ensureCNElections (getCnNpcSeats) / ensureBRElections / ensureIEElections.
 */
export const LOWER_CHAMBER_PER_REGION: Record<string, { electionType: string; chamberKey: string }> = {
  JP: { electionType: "shugiin", chamberKey: "shugiin" },
  DE: { electionType: "bundestag", chamberKey: "bundestag" },
  CN: { electionType: "npcDelegate", chamberKey: "npc" },
  BR: { electionType: "chamber", chamberKey: "chamber" },
  IE: { electionType: "dail", chamberKey: "dail" },
};

/**
 * Subnational chambers contested per region with totalSeats = region.senateSeats.
 * Sources: mainline ensurePerpetualElections (stateSenate), ensureUKRegionalCouncilElections,
 * ensureRURepublicSovietElections, ensureDDLandAssemblyElections,
 * ensureJPRegionalCouncilElections, DE landtag per Land, ensureCNPeoplesCongressElections
 * (getCnPeoplesCongressSeats, stored as the region's senateSeats), ensureIELocalCouncilElections.
 */
export const SUBNATIONAL_CHAMBER_PER_REGION: Record<string, { electionType: string; chamberKey: string }> = {
  US: { electionType: "stateSenate", chamberKey: "stateSenate" },
  UK: { electionType: "regionalCouncil", chamberKey: "regionalCouncil" },
  RU: { electionType: "republicSupremeSoviet", chamberKey: "republicSupremeSoviet" },
  DD: { electionType: "landAssembly", chamberKey: "landAssembly" },
  JP: { electionType: "regionalCouncil", chamberKey: "regionalCouncil" },
  DE: { electionType: "landtag", chamberKey: "landtag" },
  CN: { electionType: "peoplesCongress", chamberKey: "peoplesCongress" },
  IE: { electionType: "localCouncil", chamberKey: "localCouncil" },
};

/**
 * JP Sangiin seats per region. Source: src/lib/constants/states.ts JP_SANGIIN_SEATS
 * (sum 248). Class split per historicalSeats.ts JP_SANGIIN_2020 header:
 * class 1 = ceil, class 2 = floor.
 */
export const JP_SANGIIN_SEATS: Record<string, number> = { HOK: 7, TOH: 20, KAN: 80, CHU: 44, KNS: 44, CGK: 14, SHI: 8, KYU: 31 };
