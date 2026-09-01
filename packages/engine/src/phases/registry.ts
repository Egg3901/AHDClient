import type { TurnPhase } from "./types.js";
import { advanceCalendarPhase } from "./advanceCalendar.js";
import { macroCountryTurnPhase } from "./macroCountryTurn.js";
import { commodityPricesPhase } from "../commodity/commodityPrices.js";
import { contractSettlementPhase } from "../commodity/contractSettlement.js";
import { newsMaintenancePhase } from "./newsMaintenance.js";
import {
  partyInfluenceTurnPhase,
  caucusTaxPhase,
  partyOrgTurnPhase,
  partyTierTurnPhase,
  partyActionGenerationPhase,
  expireChartersPhase,
  emptyPartyCleanupPhase,
  partyMemberCountReconcilePhase,
} from "../party/phases.js";

/**
 * Ordered turn pipeline. Mainline runs ~60 phases (see AHDGame
 * src/simulation/phases/turnPhaseNames.ts); systems port over here one phase
 * at a time, preserving mainline's relative ordering as they land.
 *
 * Party cluster order (per mainline BASE_TURN_PHASE_NAMES indices):
 *  partyInfluenceTurn (8) → caucusTax (9) → macroCountryTurn (19) →
 *  partyOrgTurn (29) → partyTierTurn (35) → partyActionGeneration (39) →
 *  expireCharters (40) → emptyPartyCleanup (41) → … → partyMemberCountReconcile (119) →
 *  commodityPrices → contractSettlement (commodityPrices before contractSettlement
 *  so settlement sees this turn's market, same as mainline turnPhaseRegistry.ts)
 */
export const TURN_PHASES: readonly TurnPhase[] = [
  advanceCalendarPhase,
  partyInfluenceTurnPhase,
  caucusTaxPhase,
  macroCountryTurnPhase,
  partyOrgTurnPhase,
  partyTierTurnPhase,
  partyActionGenerationPhase,
  expireChartersPhase,
  emptyPartyCleanupPhase,
  partyMemberCountReconcilePhase,
  commodityPricesPhase,
  contractSettlementPhase,
  newsMaintenancePhase,
];
