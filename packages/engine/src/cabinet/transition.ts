/**
 * Cabinet transition — W29 port of src/lib/cabinetTransition.ts.
 *
 * Clears cabinet members and pending nominations on government transition
 * (new President/PM, or government falls). Restores holders to legislative
 * seat where applicable.
 *
 * Mainline source: src/lib/cabinetTransition.ts: clearCabinetOnTransition / notifyAndRestoreClearedHolders
 */

import type { WorldState } from "../types.js";
import { cabinetPositionsForCountry } from "./constants.js";

export interface CabinetTransitionResult {
  membersCleared: number;
  nominationsWithdrawn: number;
}

export function clearCabinetOnTransition(world: WorldState, countryId: string): CabinetTransitionResult {
  const positions = cabinetPositionsForCountry(countryId);
  const positionIds = new Set(positions.map((p) => p.id));
  // If no positions defined, nothing to clear
  if (positionIds.size === 0) return { membersCleared: 0, nominationsWithdrawn: 0 };

  const beforeMembers = world.cabinetMembers ?? [];
  const beforeNoms = world.cabinetNominations ?? [];

  // Collect members to clear (country-scoped + position-scoped)
  const toClear = beforeMembers.filter((m) => m.countryId === countryId && positionIds.has(m.positionId));
  const remaining = beforeMembers.filter((m) => !(m.countryId === countryId && positionIds.has(m.positionId)));
  world.cabinetMembers = remaining;

  // Withdraw proposed/active nominations for that country's positions
  let withdrawn = 0;
  for (const nom of beforeNoms) {
    if (nom.countryId === countryId && positionIds.has(nom.positionId) && (nom.status === "proposed" || nom.status === "active")) {
      nom.status = "withdrawn";
      withdrawn++;
    }
  }

  // Parliamentary countries also clear cabinetSettings + ministerialOrders — PORT-STUB: no equivalent solo collections.

  // Notify player holders (if any) — pushed to news
  for (const cleared of toClear) {
    if (cleared.characterId === "player") {
      world.news.push({
        turn: world.meta.turn,
        date: world.meta.date,
        headline: `Your cabinet appointment as ${cleared.positionId} ends with the change in government`,
      });
    }
  }

  return { membersCleared: toClear.length, nominationsWithdrawn: withdrawn };
}

/**
 * Auto-nominate vacancies for US presidential system.
 * Called by the cabinetAppointmentPhase when a new president takes office and seats are empty.
 * NPC president nominates NPC politicians; player may be nominated if eligible (no shortcut).
 */
export function fillVacantCabinetSlots(world: WorldState, countryId: string): string[] {
  if (!world.cabinetMembers) world.cabinetMembers = [];
  if (!world.cabinetNominations) world.cabinetNominations = [];

  // Only presidential confirmation-based systems auto-nominate (US)
  if (countryId !== "US") return [];

  const exec = world.executives[countryId];
  if (!exec || !exec.presidentId) return [];

  const positions = cabinetPositionsForCountry(countryId).filter((p) => p.id !== "vicePresident");
  const created: string[] = [];

  for (const pos of positions) {
    const occupied = world.cabinetMembers.some((m) => m.countryId === countryId && m.positionId === pos.id);
    const pending = world.cabinetNominations.some((n) => n.countryId === countryId && n.positionId === pos.id && (n.status === "active" || n.status === "proposed"));
    if (occupied || pending) continue;

    // Pick an eligible nominee: prefer NPC politicians from president's party, else any.
    // Player eligibility: if player is seated and not already cabinet, they are in the pool.
    const pool = world.politicians.filter((p) => p.countryId === countryId);
    // Include player as candidate if eligible (seated legislator or any citizen per OPS rule — simplified to same pool)
    const candidates = [...pool];
    // Add player if not already in politicians list
    if (world.player.countryId === countryId) {
      const playerAlready = candidates.some((c) => c.id === "player");
      if (!playerAlready) {
        // Check seated eligibility loosely: player with legislativeSeat or any party member
        const eligible = world.player.partyId != null || world.player.legislativeSeat != null || pool.length === 0;
        if (eligible) {
          candidates.push({
            id: "player",
            name: world.player.name,
            gender: "male",
            countryId,
            partyId: world.player.partyId ?? exec.presidentParty ?? "independent",
            chamberKey: "",
            ideology: { economic: 0, social: 0 },
            age: 45,
            partyInfluence: 0,
            bonusActions: 0,
            actions: 0,
            funds: 0,
            donorBaseLevel: 0,
            politicalInfluence: 0,
            favorability: 50,
            infamy: 0,
            actionCooldowns: {},
            personality: { loyalty: 50, ambition: 50, stubbornness: 50 },
          } as unknown as typeof pool[number]);
        }
      }
    }

    if (candidates.length === 0) continue;

    // Prefer same party as president
    const pref = candidates.filter((c) => c.partyId === exec.presidentParty);
    const nomineePool = pref.length > 0 ? pref : candidates;
    // Deterministic pick: hash by turn + position order
    const idx = (world.meta.turn + pos.order) % nomineePool.length;
    const chosen = nomineePool[idx];
    if (!chosen) continue;

    // Avoid double-nominating the same character in same turn
    if (world.cabinetNominations.some((n) => n.nomineeId === chosen.id && n.status === "active")) continue;

    const id = `cab_nom_${world.meta.turn}_${pos.id}`;
    world.cabinetNominations.push({
      id,
      countryId,
      positionId: pos.id,
      nomineeId: chosen.id,
      nomineeName: chosen.name,
      nomineeParty: chosen.partyId ?? null,
      proposedBy: exec.presidentId,
      proposedByName: exec.presidentId === "player" ? world.player.name : (world.politicians.find((p) => p.id === exec.presidentId)?.name ?? null),
      status: "active",
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      votes: {},
      votingEndsOnTurn: world.meta.turn + 4,
      proposedAtTurn: world.meta.turn,
    });
    created.push(id);
  }

  return created;
}

/**
 * UK parliamentary appointment path — direct appointment by PM without Senate.
 * Mirrors mainline's UK cabinetApi direct appointment (no confirmation).
 */
export function fillUkCabinetDirectly(world: WorldState, countryId: string): number {
  if (countryId !== "UK") return 0;
  const gov = world.governments[countryId];
  if (!gov || gov.status !== "formed" || !gov.pmPoliticianId) return 0;

  const positions = cabinetPositionsForCountry(countryId);
  if (positions.length === 0) return 0;
  // debug removed

  if (!world.cabinetMembers) world.cabinetMembers = [];

  let filled = 0;
  for (const pos of positions) {
    const occupied = world.cabinetMembers.some((m) => m.countryId === countryId && m.positionId === pos.id);
    if (occupied) continue;

    // Eligible: lower-chamber seated politicians (commons) not already cabinet, not PM
    const eligible = world.politicians.filter(
      (p) => p.countryId === countryId && p.chamberKey === "commons" && p.id !== gov.pmPoliticianId && !world.cabinetMembers!.some((m) => m.characterId === p.id)
    );
    // Include player if they are commons MP and not PM
    const pool = [...eligible];
    if (world.player.countryId === countryId && world.player.legislativeSeat?.chamberKey === "commons" && world.player.legislativeSeat != null) {
      if (!pool.some((p) => p.id === "player")) {
        // player eligibility per mainline: any seated eligible-chamber player not already PM/cabinet
        pool.push({
          id: "player",
          name: world.player.name,
          gender: "male",
          countryId,
          partyId: world.player.partyId ?? gov.governingPartyId ?? "independent",
          chamberKey: "commons",
          ideology: { economic: 0, social: 0 },
          age: 45,
          partyInfluence: 0,
          bonusActions: 0,
          actions: 0,
          funds: 0,
          donorBaseLevel: 0,
          politicalInfluence: 0,
          favorability: 50,
          infamy: 0,
          actionCooldowns: {},
          personality: { loyalty: 50, ambition: 50, stubbornness: 50 },
        } as unknown as typeof eligible[number]);
      }
    }

    if (pool.length === 0) continue;
    const idx = (world.meta.turn + pos.order) % pool.length;
    const chosen = pool[idx]!;
    world.cabinetMembers.push({
      countryId,
      positionId: pos.id,
      characterId: chosen.id,
      characterName: chosen.name,
      partyId: chosen.partyId ?? null,
      appointedBy: gov.pmPoliticianId,
      appointedAtTurn: world.meta.turn,
      confirmedAtTurn: world.meta.turn,
    });
    filled++;
  }
  return filled;
}
