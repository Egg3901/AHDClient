import type { WorldRng } from "../rng.js";
import type { Politician, WorldState } from "../types.js";

/**
 * Impeachment vote bars and the per-bloc auto-vote heuristic — ported from
 * `src/lib/impeachment/impeachmentTally.ts` (bars) and
 * `src/lib/impeachment/autoVoteNpps.ts` (`nppImpeachmentVote`,
 * `nppStanceCloseness`), verbatim math. Adapted to AHDClient's flat
 * `Politician` model: mainline distinguishes player-backed Characters from
 * AI-run NPPs; solo has one seat-holder shape (`Politician`) plus the
 * separate `player` document, so "NPP" below just means "any non-player
 * seat-holder."
 */

/** Impeachment bars, measured against ALL seats in the chamber, never votes cast. */
export const IMPEACHMENT_HOUSE_BAR = { num: 1, den: 2 } as const;
export const IMPEACHMENT_SENATE_BAR = { num: 2, den: 3 } as const;

export const IMPEACHMENT_HOUSE_VOTING_TURNS = 6;
export const IMPEACHMENT_SENATE_VOTING_TURNS = 6;

/** Per-axis stance distance within which a bloc counts as ideologically close to the target. */
export const NPP_IMPEACHMENT_STANCE_DISTANCE = 2;

export type ImpeachmentVoteValue = "aye" | "nay" | "abstain";

export interface ChamberTally {
  for: number;
  against: number;
  seats: number;
}

/** House impeaches on a seat-weighted strict majority of ALL chamber seats. */
export function passesHouseImpeachment(t: ChamberTally): boolean {
  return t.for * IMPEACHMENT_HOUSE_BAR.den > t.seats * IMPEACHMENT_HOUSE_BAR.num;
}

/** Senate convicts on a seat-weighted two-thirds of ALL chamber seats. */
export function passesSenateConviction(t: ChamberTally): boolean {
  return t.seats > 0 && t.for * IMPEACHMENT_SENATE_BAR.den >= t.seats * IMPEACHMENT_SENATE_BAR.num;
}

/** Per-axis closeness of two stances. Null when either side has no usable stance. */
export function nppStanceCloseness(
  a: { economic: number; social: number } | undefined,
  b: { economic: number; social: number } | undefined,
): boolean | null {
  if (!a || !b) return null;
  const econ = Math.abs(a.economic - b.economic);
  const social = Math.abs(a.social - b.social);
  if (!Number.isFinite(econ) || !Number.isFinite(social)) return null;
  return econ <= NPP_IMPEACHMENT_STANCE_DISTANCE && social <= NPP_IMPEACHMENT_STANCE_DISTANCE;
}

export interface NppImpeachmentVoteInput {
  nppParty: string | undefined;
  nppStance: { economic: number; social: number } | undefined;
  targetParty: string | null | undefined;
  targetStance: { economic: number; social: number } | undefined;
  majorPartyIds: ReadonlySet<string>;
  rng: () => number;
}

/**
 * One bloc's impeachment vote. Same party as the target defends (nay);
 * opposition Major-party blocs oppose removal (aye) unless ideologically
 * close to the target (then a coin flip between aye/abstain); minor or
 * unaligned blocs back removal only on clear ideological distance, else
 * abstain. Never a blanket yes.
 */
export function nppImpeachmentVote(input: NppImpeachmentVoteInput): ImpeachmentVoteValue {
  const { nppParty, nppStance, targetParty, targetStance, majorPartyIds, rng } = input;

  if (!nppParty) return "abstain";
  if (targetParty && nppParty === targetParty) return "nay";

  const close = nppStanceCloseness(nppStance, targetStance);
  const bothMajor = !!targetParty && majorPartyIds.has(nppParty) && majorPartyIds.has(targetParty);

  if (bothMajor) {
    return close === true ? (rng() < 0.5 ? "aye" : "abstain") : "aye";
  }

  if (close === false) return rng() < 0.5 ? "aye" : "abstain";
  return "abstain";
}

/**
 * Seat-weighted tally of one chamber's impeachment vote for `countryId`,
 * computed deterministically at resolution time (no persisted per-seat
 * ballot — see impeachment/types.ts file doc). The player's seat, if any,
 * counts toward the seat denominator but always abstains: there is no
 * interactive impeachment-vote action this wave (PORT-STUB).
 */
export function tallyImpeachmentChamber(
  world: WorldState,
  rng: WorldRng,
  countryId: string,
  chamberKey: "house" | "senate",
  targetParty: string | null,
  targetStance: { economic: number; social: number } | undefined,
): ChamberTally {
  const majorPartyIds = new Set(
    Object.values(world.parties)
      .filter((p) => p.countryId === countryId && p.tier === "major")
      .map((p) => p.id),
  );

  let seats = 0;
  let forVotes = 0;
  let againstVotes = 0;

  const members: Politician[] = world.politicians
    .filter((p) => p.countryId === countryId && p.chamberKey === chamberKey)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const p of members) {
    seats++;
    const choice = nppImpeachmentVote({
      nppParty: p.partyId,
      nppStance: p.ideology,
      targetParty,
      targetStance,
      majorPartyIds,
      rng: () => rng.next(),
    });
    if (choice === "aye") forVotes++;
    else if (choice === "nay") againstVotes++;
  }

  if (
    world.player.legislativeSeat != null &&
    world.player.legislativeSeat.countryId === countryId &&
    world.player.legislativeSeat.chamberKey === chamberKey
  ) {
    seats++; // abstains — no interactive vote hook yet.
  }

  return { for: forVotes, against: againstVotes, seats };
}
