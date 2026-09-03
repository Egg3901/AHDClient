import type { WorldRng } from "../rng.js";
import type { WorldState } from "../types.js";
import type { ImpeachmentCase } from "./types.js";
import {
  IMPEACHMENT_HOUSE_VOTING_TURNS,
  IMPEACHMENT_SENATE_VOTING_TURNS,
  passesHouseImpeachment,
  passesSenateConviction,
  tallyImpeachmentChamber,
} from "./tally.js";

export interface FileImpeachmentResult {
  ok: boolean;
  error?: string;
  case?: ImpeachmentCase;
}

/**
 * File a new impeachment case against `targetId`, the sitting president of
 * whichever country they lead. Pure engine-internal helper: the player-facing
 * filing ACTION (who may file, action-point cost, cooldown) is PORT-STUB —
 * no `actions/constants.ts` entry exists for "impeach" this wave. Exposed so
 * a future action-economy wave, and this wave's tests, can create cases
 * without reaching into `world.impeachments` directly.
 */
export function fileImpeachment(world: WorldState, targetId: string): FileImpeachmentResult {
  const exec = Object.values(world.executives).find((e) => e.presidentId === targetId);
  if (!exec) return { ok: false, error: "Target does not hold a presidency" };

  const id = `imp:${exec.countryId}:${targetId}:${world.meta.turn}`;
  if (world.impeachments.some((c) => c.id === id)) {
    return { ok: false, error: "An impeachment case for this target already exists this turn" };
  }
  const openAgainstTarget = world.impeachments.some(
    (c) => c.targetId === targetId && (c.stage === "house" || c.stage === "senate"),
  );
  if (openAgainstTarget) return { ok: false, error: "An open case already exists against this target" };

  const targetName =
    targetId === "player"
      ? world.player.name
      : (world.politicians.find((p) => p.id === targetId)?.name ?? targetId);

  const newCase: ImpeachmentCase = {
    id,
    countryId: exec.countryId,
    targetId,
    targetName,
    targetParty: exec.presidentParty,
    stage: "house",
    filedTurn: world.meta.turn,
    houseVotingEndsTurn: world.meta.turn + IMPEACHMENT_HOUSE_VOTING_TURNS,
    senateVotingEndsTurn: null,
  };
  world.impeachments.push(newCase);
  world.news.push({
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `Impeachment articles filed against ${targetName} (${exec.countryId} presidency)`,
  });
  return { ok: true, case: newCase };
}

function targetStanceFor(
  world: WorldState,
  targetId: string,
): { economic: number; social: number } | undefined {
  if (targetId === "player") return undefined; // PlayerCharacter carries no ideology axis.
  return world.politicians.find((p) => p.id === targetId)?.ideology;
}

/**
 * Ported from `src/lib/turn/impeachmentLifecycle.ts`
 * (`processImpeachmentLifecycle`).
 *
 * Advances every open case whose current-stage voting window has closed.
 * House: seat-weighted strict majority impeaches (advance to Senate), else
 * dismissed. Senate: seat-weighted two-thirds convicts (vacate the
 * presidency — the `presidentialSuccession` phase, which must run AFTER this
 * one, then promotes the VP the same turn if one is seated), else acquitted.
 * Auto-cancels a case whose target is no longer the sitting president.
 *
 * Governor impeachment (mainline's other branch) is PORT-STUB: AHDClient has
 * no governor-as-executive concept (see impeachment/types.ts file doc).
 */
export function processImpeachmentLifecycle(world: WorldState, rng: WorldRng): { resolved: number } {
  let resolved = 0;
  const turn = world.meta.turn;

  for (const imp of [...world.impeachments].sort((a, b) => a.id.localeCompare(b.id))) {
    if (imp.stage !== "house" && imp.stage !== "senate") continue;

    const exec = world.executives[imp.countryId];
    if (!exec || exec.presidentId !== imp.targetId) {
      imp.stage = "cancelled";
      imp.resolvedTurn = turn;
      resolved++;
      continue;
    }

    if (imp.stage === "house") {
      if (turn < imp.houseVotingEndsTurn) continue;
      const tally = tallyImpeachmentChamber(
        world,
        rng,
        imp.countryId,
        "house",
        imp.targetParty,
        targetStanceFor(world, imp.targetId),
      );
      if (passesHouseImpeachment(tally)) {
        imp.stage = "senate";
        imp.senateVotingEndsTurn = turn + IMPEACHMENT_SENATE_VOTING_TURNS;
      } else {
        imp.stage = "dismissed";
        imp.resolvedTurn = turn;
      }
      resolved++;
      continue;
    }

    // Senate stage.
    if (imp.senateVotingEndsTurn == null || turn < imp.senateVotingEndsTurn) continue;
    const tally = tallyImpeachmentChamber(
      world,
      rng,
      imp.countryId,
      "senate",
      imp.targetParty,
      targetStanceFor(world, imp.targetId),
    );
    if (passesSenateConviction(tally)) {
      imp.stage = "convicted";
      imp.resolvedTurn = turn;
      exec.presidentId = null;
      exec.presidentParty = null;
      exec.termStartTurn = null;
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `${imp.targetName} convicted by the ${imp.countryId} Senate and removed from the presidency`,
      });
    } else {
      imp.stage = "acquitted";
      imp.resolvedTurn = turn;
    }
    resolved++;
  }

  return { resolved };
}
