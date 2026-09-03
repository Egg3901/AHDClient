/**
 * War/conflict model — AHDClient-native abstraction. Mainline's ConflictDoc
 * (src/lib/db/types/conflict.ts) is settled by a full unit-level combat
 * engine (battleResolution.ts, battle.ts, coalition.ts — thousands of
 * lines: unit rosters, generals, naval/air support, coalition building).
 * That has no AHDClient equivalent and is PORT-STUB in its entirety — B15,
 * named blocker: military/unitRosterCombat.
 *
 * What IS ported verbatim from mainline are the portable pieces that don't
 * depend on the combat engine: `occupationShift`/`OCCUPATION` (control-track
 * math, src/lib/military/occupation.ts), `POLE_HOLD_TURNS` (cold_war pole
 * resolution, src/lib/turn/coldWarHolds.ts), `DICTATE_WINDOW_TURNS` (terms
 * window, src/lib/military/principal.ts), `TRUCE_TURNS` (re-declaration
 * lockout, src/lib/db/types/peaceOffer.ts). wars/settlement.ts wires these
 * against a from-scratch, clearly-labeled margin function (GDP-ratio based,
 * not a mainline formula — see settlement.ts file doc) since AHDClient has no
 * per-unit combat strength to derive a battle margin from.
 */
export type ConflictType = "interstate" | "intervention" | "civil_war" | "independence" | "cold_war";
export type ConflictStatus = "active" | "winding_down" | "terms_pending" | "resolved";

export interface ConflictSide {
  countries: string[];
}

export interface Conflict {
  id: string;
  type: ConflictType;
  status: ConflictStatus;
  sideA: ConflictSide;
  sideB: ConflictSide;
  /** 0-100. */
  intensity: number;
  /** 0-100 share of the contested ground held by side B. Defaults to 50 (no ground yet) if absent. */
  control?: number;
  startedAtTurn: number;
  /** First consecutive below-hot turn; cleared when intensity climbs back to hot. Source: ConflictDoc.limitedWarSinceTurn. */
  limitedWarSinceTurn?: number | undefined;
  /** cold_war only: which side currently holds the pole. Source: ConflictDoc.poleSide. */
  poleSide?: "A" | "B" | undefined;
  /** cold_war only: turn the current pole hold began. Source: ConflictDoc.poleSinceTurn. */
  poleSinceTurn?: number | undefined;
  /** Terms window deadline once control hits a pole (interstate/intervention/civil_war/independence). Source: ConflictDoc.termsWindow.closesTurn. */
  termsWindowClosesTurn?: number | undefined;
  outcome?: { winner: "A" | "B" | "stalemate" };
}

export type SettlementPath = "dictated" | "negotiated" | "white_peace" | "cold_war_absorption";

/** Source: ConflictDoc.settlement (subset) + peaceOffer.ts truce bookkeeping. */
export interface Settlement {
  id: string;
  conflictId: string;
  turn: number;
  path: SettlementPath;
  winner: "A" | "B" | "stalemate";
  /** Belligerent pairs may not re-declare war on each other until this turn. Source: TRUCE_TURNS. */
  truceUntilTurn: number;
}
