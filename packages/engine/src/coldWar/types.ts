/**
 * Cold War tension + nuclear program state. Ports src/lib/coldwar/tension.ts
 * ColdWarTensionState and src/lib/db/types/nuclearProgram.ts NuclearProgram
 * (subset — see coldWar/nuclear.ts file doc for what's cut).
 */

export interface ColdWarTensionEvent {
  turn: number;
  kind: "nuclear-test" | "buildup" | "escalation" | "crisis" | "detente" | "decay";
  label: string;
  delta: number;
}

/** Source: src/lib/coldwar/tension.ts ColdWarTensionState (Date fields dropped — turn-based, not Date-based). */
export interface ColdWarTensionState {
  value: number;
  /** Last standing-pressure floor computed by the turn phase. */
  pressureFloor: number;
  updatedTurn: number;
  /** Short ledger of discrete events, capped (see coldWar/tension.ts LEDGER_CAP citation). */
  events: ColdWarTensionEvent[];
}

/** Source: src/lib/military/nuclearProgram.ts + db/types/nuclearProgram.ts NuclearProgram (subset). */
export interface NuclearProgramState {
  countryId: string;
  /** Node key -> turn adopted. Source: NuclearProgram.adopted. */
  adopted: Record<string, number>;
  warheads: number;
  /** Ordered warheads/turn (the defence seat's production order, capped by productionCapFor at accrual time). */
  productionRate: number;
}
