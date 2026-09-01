import type { TurnPhase } from "../phases/types.js";
import { forexTurnPhase as runForexTurn } from "./forexTurn.js";
import { ledgerPreForexSnapshotPhase as runSnapshot } from "./ledgerPreForexSnapshot.js";

export const ledgerPreForexSnapshotPhase: TurnPhase = {
  name: "ledgerPreForexSnapshot",
  run: runSnapshot,
};

export const forexTurnPhase: TurnPhase = {
  name: "forexTurn",
  run: runForexTurn,
};
