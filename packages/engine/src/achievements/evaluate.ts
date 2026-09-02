/**
 * Achievement evaluation — W35.
 *
 * Ports the *logic* half of src/lib/achievements/triggers.ts (award
 * decisions), scoped to the "available" subset of achievements/catalog.ts.
 * Mainline evaluates achievements at the moment a trigger fires (API route
 * handlers call checkActionAchievements/checkElectionEntryAchievements/etc.
 * inline). Solo instead re-scans current WorldState once per turn
 * (achievementCheckPhase below) — every "available" trigger this module
 * knows how to check is either a monotonic current-state fact (e.g. "player
 * currently holds the presidency") or a cumulative counter this codebase
 * already maintains incrementally (player.actionCounts, written by
 * actions/execute.ts on every successful action). Because
 * achievementsEarned is append-only (see types.ts WorldState.achievementsEarned
 * file doc — no revoke path), a once-per-turn scan of current-state facts is
 * equivalent to mainline's event-driven grant: the first turn a fact becomes
 * true, the achievement is granted and stays granted forever after, exactly
 * like mainline's idempotent awardAchievement.
 *
 * The one place this equivalence would NOT hold is a purely historical count
 * that current state cannot reconstruct (e.g. "won 3 elections" when only
 * the CURRENT seat is tracked) — those stay PORT-STUB unavailable in the
 * catalog rather than being faked here (see three_terms's blockingSystem).
 */
import type { WorldState } from "../types.js";
import { ACHIEVEMENT_CATALOG } from "./catalog.js";

function actionCount(world: WorldState, actionId: string): number {
  return world.player.actionCounts[actionId] ?? 0;
}

function totalActionCount(world: WorldState): number {
  return Object.values(world.player.actionCounts).reduce((sum, n) => sum + n, 0);
}

function hasElectedOffice(world: WorldState): boolean {
  return world.player.legislativeSeat != null;
}

function hasCabinetSeat(world: WorldState): boolean {
  return world.cabinetMembers.some((m) => m.characterId === "player");
}

function isPartyChair(world: WorldState): boolean {
  return Object.values(world.parties).some((p) => p.chairId === "player");
}

function holdsOffice(world: WorldState, key: "presidentId" | "vicePresidentId"): boolean {
  return Object.values(world.executives).some((e) => e[key] === "player");
}

function wonChamber(world: WorldState, chamberKey: string): boolean {
  return world.player.legislativeSeat?.chamberKey === chamberKey;
}

function enteredElection(world: WorldState, electionType?: string): boolean {
  return world.elections.some(
    (e) => (electionType === undefined || e.electionType === electionType) && e.candidates.some((c) => c.id === "player"),
  );
}

function isBondholder(world: WorldState): boolean {
  return Object.values(world.bonds).some((b) => b.holders.some((h) => h.holderId === "player" && h.units > 0));
}

function isLawmaker(world: WorldState): boolean {
  return world.enactedLaws.some((law) => {
    const bill = world.bills.find((b) => b.id === law.billId);
    return bill?.sponsorId === "player";
  });
}

/**
 * Each check is keyed by slug and only invoked for catalog entries marked
 * "available" (see the filter in evaluateAchievements below) — an entry here
 * for a slug the catalog marks "unavailable" would simply never run.
 */
const CHECKS: Record<string, (world: WorldState) => boolean> = {
  first_fundraise: (w) => actionCount(w, "fundraise") >= 1,
  fundraiser: (w) => actionCount(w, "fundraise") >= 10,
  big_fundraiser: (w) => actionCount(w, "fundraise") >= 50,
  campaigner: (w) => actionCount(w, "campaign") >= 10,
  grassroots: (w) => actionCount(w, "buildDonorBase") >= 5,
  advertiser: (w) => actionCount(w, "advertise") >= 3,
  rested: (w) => actionCount(w, "rest") >= 1,
  century_club: (w) => totalActionCount(w) >= 100,
  turn_one: (w) => w.meta.turn <= 1,
  first_candidate: (w) => enteredElection(w),
  house_candidate: (w) => enteredElection(w, "house"),
  senate_candidate: (w) => enteredElection(w, "senate"),
  president_candidate: (w) => enteredElection(w, "president"),
  house_member: (w) => wonChamber(w, "house"),
  senator: (w) => wonChamber(w, "senate"),
  president: (w) => holdsOffice(w, "presidentId"),
  vice_president: (w) => holdsOffice(w, "vicePresidentId"),
  first_bill: (w) => w.bills.some((b) => b.sponsorId === "player"),
  lawmaker: (w) => isLawmaker(w),
  millionaire: (w) => w.player.funds >= 1_000_000,
  donor: (w) => actionCount(w, "wireTransfer") >= 1,
  cabinet_seat: (w) => hasCabinetSeat(w),
  party_leader: (w) => isPartyChair(w),
  bondholder: (w) => isBondholder(w),
  iron_triangle: (w) => hasElectedOffice(w) && hasCabinetSeat(w) && isPartyChair(w),
};

/** Returns the slugs newly satisfied this call (not yet in world.achievementsEarned). */
export function evaluateAchievements(world: WorldState): string[] {
  const newlyEarned: string[] = [];
  for (const entry of ACHIEVEMENT_CATALOG) {
    if (entry.status !== "available") continue;
    if (world.achievementsEarned.includes(entry.slug)) continue;
    const check = CHECKS[entry.slug];
    if (!check) continue; // catalog says available but no check wired yet — should not happen; fail closed
    if (check(world)) newlyEarned.push(entry.slug);
  }
  return newlyEarned;
}
