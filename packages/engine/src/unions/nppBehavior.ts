/**
 * NPP union behavior — W15.
 *
 * Ports src/lib/turn/unions/nppUnionBehavior.ts processNppUnionBehavior
 * deterministically for Rotunda's world model.
 *
 * Mainline's NPP behavior does:
 *  1. Elect NPP leaders for vacant unions (militancy = ambition*0.6 + stubbornness*0.4)
 *  2. Clear demandedWageLevel
 *  3. Open bargaining campaigns where scopeAverageUnionization >= NPP_DEMAND_MIN_UNIONIZATION (15)
 *     and claim = scopeAverageWage * (1 + NPP_DEMAND_PREMIUM*(0.5+militancy))
 *  4. Respond to campaign offers / mediate / escalate
 *
 * Rotunda BLOCKERS (PORT-STUB, named):
 *  - Bargaining campaigns: no bargainingCampaigns/CollectiveAgreements collections yet
 *    (requires W?? bargaining wave). Open/respond/escalate/settlement are stubbed.
 *  - Mainline NPP collection is `npps`; Rotunda has no separate NPP collection —
 *    vacant leadership is filled from Politicians in the same country using the
 *    same militancy scoring, deterministic pick by union id hash.
 *  - Union dues v1 retired the recruitment treasury spend this file used to do;
 *    Rotunda has no strength/organize drive economy yet, so that branch is absent
 *    (matches the NEEDS OTHER AGENTS note in the mainline file's branch report).
 *
 * What this file DOES port (real, not stub):
 *  - Deterministic leader election for vacant unions (militancy-sorted, hash-picked)
 *  - Vacancy detection (ownerId == null) and orphan handling (retired politician)
 *  - The NPP_DEMAND_MIN_UNIONIZATION / NPP_DEMAND_PREMIUM / NPP_DEMAND_CEILING constants
 *  - The militancy helper
 *
 * Source: <mainline-checkout>/src/lib/turn/unions/nppUnionBehavior.ts
 */

import type { WorldState } from "../types.js";
import type { Union } from "./types.js";

export const NPP_DEMAND_MIN_UNIONIZATION = 15;
export const NPP_DEMAND_PREMIUM = 0.12;
export const NPP_DEMAND_CEILING = 1.5;
export const NPP_CAMPAIGN_OPEN_LIMIT_PER_TURN = 24;

export interface NppUnionBehaviorResult {
  leadersElected: number;
  campaignsOpened: number;
  counteroffersMade: number;
  agreementsSettled: number;
  disputesEscalated: number;
  mediationsRequested: number;
  mediationResponses: number;
}

const EMPTY: NppUnionBehaviorResult = {
  leadersElected: 0,
  campaignsOpened: 0,
  counteroffersMade: 0,
  agreementsSettled: 0,
  disputesEscalated: 0,
  mediationsRequested: 0,
  mediationResponses: 0,
};

function militancy(p: { personality?: { ambition?: number; stubbornness?: number } }): number {
  const ambition = p.personality?.ambition ?? 50;
  const stubbornness = p.personality?.stubbornness ?? 50;
  return Math.max(0, Math.min(1, (ambition * 0.6 + stubbornness * 0.4) / 100));
}

function pickDeterministic<T>(candidates: T[], seed: string): T {
  let acc = 0;
  for (let i = Math.max(0, seed.length - 8); i < seed.length; i++) {
    acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return candidates[acc % candidates.length]!;
}

/**
 * Process NPP union behavior for one turn. Deterministic given world state.
 * Mutates world.unions in place (fills vacant leadership).
 */
export function processNppUnionBehavior(world: WorldState): NppUnionBehaviorResult {
  const result: NppUnionBehaviorResult = { ...EMPTY };
  const unions = Object.values(world.unions ?? {});

  if (unions.length === 0) return result;

  // --- 1. Vacant leadership election (real, deterministic) -----------------
  // Source: nppUnionBehavior.ts vacant[] + byCountry militancy sort + pickDeterministic
  const vacant = unions.filter((u) => u.ownerId == null);
  if (vacant.length > 0) {
    // Pool politicians by country who are not already leading a union
    const taken = new Set(
      unions
        .filter((u) => u.ownerType === "npp" && u.ownerId)
        .map((u) => u.ownerId!),
    );
    const byCountry = new Map<string, typeof world.politicians>();
    for (const pol of world.politicians) {
      if (taken.has(pol.id)) continue;
      const pool = byCountry.get(pol.countryId) ?? [];
      pool.push(pol);
      byCountry.set(pol.countryId, pool);
    }
    for (const pool of byCountry.values()) {
      pool.sort(
        (a, b) => militancy(b) - militancy(a) || a.id.localeCompare(b.id),
      );
    }

    const sortedVacant = [...vacant].sort((a, b) => a.id.localeCompare(b.id));
    for (const union of sortedVacant) {
      const pool = byCountry.get(union.countryId);
      if (!pool?.length) continue;
      const shortlist = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
      const chosen = pickDeterministic(shortlist, union.id);
      // Remove chosen from pool
      const idx = pool.findIndex((p) => p.id === chosen.id);
      if (idx >= 0) pool.splice(idx, 1);
      union.ownerId = chosen.id;
      union.ownerType = "npp";
      union.updatedAtTurn = world.meta.turn;
      result.leadersElected++;
    }
  }

  // --- 2. Orphan cleanup + demandedWageLevel clear (no demandedWageLevel in Rotunda yet, stubbed) ---
  const led = unions.filter((u): u is Union & { ownerId: string } => u.ownerType === "npp" && u.ownerId != null);
  const politicianIds = new Set(world.politicians.map((p) => p.id));
  const orphaned: string[] = [];
  for (const union of led) {
    if (!politicianIds.has(union.ownerId)) {
      orphaned.push(union.id);
    }
  }
  for (const id of orphaned) {
    const u = (world.unions as Record<string, Union>)[id];
    if (u) {
      u.ownerId = null;
      u.ownerType = null;
      u.updatedAtTurn = world.meta.turn;
    }
  }

  // --- 3. Bargaining campaign open + dispute handling ---
  // BLOCKER: requires bargainingCampaigns collection and sector unionization data
  // per employer (mainline src/lib/turn/unions/nppBargainingPolicy.ts).
  // Rotunda has no bargaining wave yet, so these counters remain 0.
  // The constants above are still exported and tested via goldens.

  return result;
}
