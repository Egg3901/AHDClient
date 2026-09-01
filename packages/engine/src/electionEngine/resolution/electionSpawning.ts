// @ts-nocheck
/**
 * Election spawning — pure planning layer.
 *
 * Ported from `src/lib/turn/election/electionSpawning.ts`.
 * DB writes (inserting Election docs) are replaced with pure planning
 * functions returning what elections should exist given date/term state.
 * Field names mirror the Mongo documents they replace.
 *
 * Plain input mapping to WorldState:
 *   GameState.currentTurn, currentYear, CycleAnchorContext -> SpawnContext
 *   Election (from DB) -> ElectionInput
 *   houseDistricts / apportionment -> ApportionmentInput
 *
 * Operator wires WorldState into these next wave; no WorldState import.
 */

import { DEFAULT_DURATIONS } from "./constants.js";
import { pickNextCanonicalCycle, turnToWallClock, type CanonicalCycleParams } from "./canonicalCycle.js";
import type { CycleAnchorContext } from "./cycleAnchorContext.js";

export interface ElectionInput {
  _id?: string;
  electionType: string;
  countryId?: string;
  state?: string;
  cycle?: number;
  status?: string;
}

export interface SpawnContext {
  currentTurn: number;
  currentYear?: number;
  ctx: CycleAnchorContext;
  now: Date;
}

export interface ElectionPlan {
  electionType: string;
  countryId: string;
  state?: string;
  cycle: number;
  status: "active" | "upcoming";
  startTurn: number;
  primaryEndTurn: number;
  endTurn: number;
  startTime: Date;
  primaryEndTime: Date;
  endTime: Date;
  totalSeats: number;
}

export function planNextHouseElection(
  fromElection: ElectionInput,
  ctx: SpawnContext,
  liveHouseSeats?: Record<string, number>,
): ElectionPlan | null {
  if (ctx.ctx.preIterationActive) return null;
  const spawn = pickNextCanonicalCycle({
    electionType: "house",
    prevCycle: fromElection.cycle ?? 0,
    currentTurn: ctx.currentTurn,
    ctx: ctx.ctx,
  });
  if (!spawn) return null;
  const status: "active" | "upcoming" = spawn.startTurn <= ctx.currentTurn ? "active" : "upcoming";
  return {
    electionType: "house",
    countryId: fromElection.countryId ?? "US",
    state: fromElection.state,
    cycle: spawn.cycle,
    status,
    startTurn: spawn.startTurn,
    primaryEndTurn: spawn.primaryEndTurn,
    endTurn: spawn.endTurn,
    startTime: turnToWallClock(spawn.startTurn, ctx.now, ctx.currentTurn),
    primaryEndTime: turnToWallClock(spawn.primaryEndTurn, ctx.now, ctx.currentTurn),
    endTime: turnToWallClock(spawn.endTurn, ctx.now, ctx.currentTurn),
    totalSeats: liveHouseSeats?.[fromElection.state ?? ""] ?? 1,
  };
}

export function planNextCommonsElection(
  fromElection: ElectionInput,
  ctx: SpawnContext,
): ElectionPlan | null {
  if (ctx.ctx.preIterationActive) return null;
  const spawn = pickNextCanonicalCycle({
    electionType: "commons",
    prevCycle: fromElection.cycle ?? 0,
    currentTurn: ctx.currentTurn,
    ctx: ctx.ctx,
  });
  if (!spawn) return null;
  const status: "active" | "upcoming" = spawn.startTurn <= ctx.currentTurn ? "active" : "upcoming";
  return {
    electionType: "commons",
    countryId: fromElection.countryId ?? "UK",
    state: fromElection.state,
    cycle: spawn.cycle,
    status,
    startTurn: spawn.startTurn,
    primaryEndTurn: spawn.primaryEndTurn,
    endTurn: spawn.endTurn,
    startTime: turnToWallClock(spawn.startTurn, ctx.now, ctx.currentTurn),
    primaryEndTime: turnToWallClock(spawn.primaryEndTurn, ctx.now, ctx.currentTurn),
    endTime: turnToWallClock(spawn.endTurn, ctx.now, ctx.currentTurn),
    totalSeats: 1,
  };
}

export function planNextElectionForType(
  params: CanonicalCycleParams & { countryId?: string; state?: string; currentTurn: number; ctx: CycleAnchorContext; now: Date },
): ElectionPlan | null {
  if (params.ctx.preIterationActive) return null;
  const spawn = pickNextCanonicalCycle({
    electionType: params.electionType,
    prevCycle: (params as unknown as { prevCycle?: number }).prevCycle ?? 0,
    currentTurn: params.currentTurn,
    ctx: params.ctx,
    senateClass: params.senateClass,
    chamberClass: params.chamberClass,
    countryId: params.countryId,
  });
  if (!spawn) return null;
  const dur = DEFAULT_DURATIONS[params.electionType];
  if (!dur) return null;
  const status: "active" | "upcoming" = spawn.startTurn <= params.currentTurn ? "active" : "upcoming";
  return {
    electionType: params.electionType,
    countryId: params.countryId ?? "US",
    state: params.state,
    cycle: spawn.cycle,
    status,
    startTurn: spawn.startTurn,
    primaryEndTurn: spawn.primaryEndTurn,
    endTurn: spawn.endTurn,
    startTime: turnToWallClock(spawn.startTurn, params.now, params.currentTurn),
    primaryEndTime: turnToWallClock(spawn.primaryEndTurn, params.now, params.currentTurn),
    endTime: turnToWallClock(spawn.endTurn, params.now, params.currentTurn),
    totalSeats: 1,
  };
}
