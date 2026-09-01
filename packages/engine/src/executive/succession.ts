import type { WorldState } from "../types.js";

/**
 * Ported from `src/lib/turn/presidentialSuccession.ts`
 * (`processPresidentialSuccession`).
 *
 * When a country's presidency is vacant and a VP is seated, promote the VP
 * to president and clear the VP seat. Must run AFTER impeachment lifecycle
 * (a same-turn conviction vacancy is filled the same turn, mirroring
 * mainline's phase ordering) and after election resolution (a same-turn
 * presidential-election winner already fills the seat, so there is nothing
 * to succeed into).
 *
 * PORT-STUB: mainline's `hasReachedExecutiveTermLimit` gate (blocks a VP who
 * already served the max consecutive terms from succeeding) has no solo
 * counterpart — Rotunda tracks no per-politician term-served counter yet.
 * Every VP is eligible to succeed.
 */
export function processPresidentialSuccession(world: WorldState): { promoted: string[] } {
  const promoted: string[] = [];
  for (const exec of Object.values(world.executives)) {
    if (exec.presidentId !== null) continue;
    if (exec.vicePresidentId === null) continue;

    const succeededId = exec.vicePresidentId;
    const name =
      succeededId === "player"
        ? world.player.name
        : (world.politicians.find((p) => p.id === succeededId)?.name ?? succeededId);

    exec.presidentId = succeededId;
    exec.presidentParty = exec.vicePresidentParty;
    exec.termStartTurn = world.meta.turn;
    exec.vicePresidentId = null;
    exec.vicePresidentParty = null;
    promoted.push(succeededId);

    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline:
        succeededId === "player"
          ? `You succeed to the presidency of ${exec.countryId} following a vacancy`
          : `${name} succeeds to the presidency of ${exec.countryId} following a vacancy`,
    });
  }
  return { promoted };
}
