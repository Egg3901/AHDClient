import type { TurnPhase } from "./types.js";
import { advanceCalendarPhase } from "./advanceCalendar.js";
import { macroCountryTurnPhase } from "./macroCountryTurn.js";
import { actionRefreshPhase } from "../actions/actionRefresh.js";
import { fundGenerationPhase } from "../actions/fundGenerationPhase.js";
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
  playerEndorsementPartySweepPhase,
} from "../party/phases.js";

/**
 * Ordered turn pipeline. Mainline runs ~60 phases (see AHDGame
 * src/simulation/phases/turnPhaseNames.ts); systems port over here one phase
 * at a time, preserving mainline's relative ordering as they land.
 *
 * W34 inserts actionRefresh (mainline index 3) and fundGeneration (index 4)
 * immediately after advanceCalendar, mirroring BASE_TURN_PHASE_NAMES:
 *   actionRefresh → fundGeneration → partyInfluenceTurn → caucusTax → macroCountryTurn
 *
 * Party cluster order (per mainline BASE_TURN_PHASE_NAMES indices):
 *  partyInfluenceTurn (8) → caucusTax (9) → macroCountryTurn (19) →
 *  partyOrgTurn (29) → partyTierTurn (35) → partyActionGeneration (39) →
 *  expireCharters (40) → emptyPartyCleanup (41) → … → partyMemberCountReconcile (119) →
 *  commodityPrices → contractSettlement (commodityPrices before contractSettlement
 *  so settlement sees this turn's market, same as mainline turnPhaseRegistry.ts)
 *
 * W19 support cluster (per mainline turnPhaseRegistry.ts demographicsAndPartySetup
 * + support blocks, indices 28-34): turnoutDecay → partyGOTV → partyOrgTurn →
 * regDriftDecay → pressureDecay → priorityRegionDecay → supportDecay → supportAccrual
 * Solo ordering mirrors mainline: turnout before GOTV, drift/decay after org,
 * support accrual AFTER decay so drip is fresh for tally.
 */
import {
  turnoutDecayPhase,
  partyGOTVPhase,
  regDriftDecayPhase,
  pressureDecayPhase,
  priorityRegionDecayPhase,
  supportDecayPhase,
  supportAccrualPhase,
} from "../support/phases.js";
import { billLifecyclePhase } from "./billLifecyclePhase.js";
import { nppFundGenerationPhase } from "../npp/nppFundGeneration.js";
import { nppRelationshipMaintenancePhase } from "../npp/nppRelationshipMaintenance.js";
import { nppBillSponsorshipPhase } from "../npp/nppBillSponsorship.js";
import { nppActionProcessingPhase } from "../npp/nppActionProcessing.js";
import { nppStanceDriftPhase } from "../npp/stanceDrift.js";
import { nppBehaviorPhase } from "../npp/nppBehavior.js";
import { voteAccumulationPhase, electionTimersPhase, electionResolutionPhase } from "../elections/phases.js";
import { demographicEffectsPhase } from "../demographics/demographicEffects.js";
import { demographicFlowsPhase } from "../demographics/demographicFlows.js";
import { censusPhase } from "../demographics/census.js";
import {
  fiscalBaseGrowthPhase,
  subsidyBudgetPhase,
  fiscalYearPhase,
  regionalBudgetProcessingPhase,
} from "../budget/phases.js";
import { centralBankChairTurnPhase, centralBankChairSelectionPhase } from "../centralBank/phases.js";
import { corporationTurnPhase } from "../corporation/corporationTurn.js";
import {
  campaignSpendResetPhase,
  campaignTurnPhase,
  campaignPartySubsidyPhase,
  campaignNpcInvestmentPhase,
} from "../campaigns/phases.js";

export const TURN_PHASES: readonly TurnPhase[] = [
  advanceCalendarPhase,
  actionRefreshPhase,
  fundGenerationPhase,
  nppFundGenerationPhase,
  partyInfluenceTurnPhase,
  playerEndorsementPartySweepPhase,
  caucusTaxPhase,
  macroCountryTurnPhase,
  turnoutDecayPhase,
  partyGOTVPhase,
  partyOrgTurnPhase,
  regDriftDecayPhase,
  pressureDecayPhase,
  priorityRegionDecayPhase,
  supportDecayPhase,
  supportAccrualPhase,
  partyTierTurnPhase,
  partyActionGenerationPhase,
  expireChartersPhase,
  emptyPartyCleanupPhase,
  partyMemberCountReconcilePhase,
  nppRelationshipMaintenancePhase,
  nppBillSponsorshipPhase,
  nppStanceDriftPhase,
  nppActionProcessingPhase,
  nppBehaviorPhase,
  billLifecyclePhase,
  commodityPricesPhase,
  contractSettlementPhase,
  // Elections run at the end of the ported subset for now: inserting them at
  // mainline's absolute position would shift the shared rng stream under every
  // integration golden. A dedicated re-ordering pass re-goldens once the phase
  // set stabilizes (mainline: commodity < bills < elections).
  voteAccumulationPhase,
  electionTimersPhase,
  electionResolutionPhase,
  // Demographics at end of ported subset (before newsMaintenance) to avoid
  // shifting existing RNG streams — mirrors elections block deviation note.
  // Mainline order is demographics (census earlier, flows after metricEngine,
  // effects near legislation) but solo demotes them to tail until re-golden.
  demographicEffectsPhase,
  demographicFlowsPhase,
  censusPhase,
  // Budget phases at end of ported subset, before newsMaintenance.
  // Mainline ordering (turnPhaseRegistry.ts / simTurnProfiles.ts): fiscalYear before
  // regionalBudgetProcessing, both after metricEngine and before final diagnostics.
  // Solo deviation: placed at tail to avoid shifting existing RNG streams; re-golden will restore mainline order.
  // Deferred variants: JP (src/lib/turn/jpRegionalBudget.ts) and DE (src/lib/turn/deRegionalBudget.ts) — those countries not playable.
  fiscalBaseGrowthPhase,
  subsidyBudgetPhase,
  fiscalYearPhase,
  regionalBudgetProcessingPhase,
  // W3 central bank cluster at end of ported subset, before newsMaintenance —
  // same rng-stream-stability rule as the elections/demographics/budget blocks
  // above (mainline runs this cluster mid-pipeline, at turnPhaseNames.ts
  // indices 116-121; inserting it there would shift every downstream rng draw
  // for existing goldens). centralBankChairTurn before centralBankChairSelection
  // mirrors mainline's relative order.
  centralBankChairTurnPhase,
  centralBankChairSelectionPhase,
  // W9 corporations at the end of the ported subset, before newsMaintenance —
  // same rng-stream-stability rule as every block above (mainline runs
  // corporationTurn mid-pipeline; inserting it there would shift every
  // downstream rng draw for existing goldens). See corporation/corporationTurn.ts
  // file doc for the resulting one-turn lag on the macroCountryTurn wire.
  corporationTurnPhase,
  // W26 campaign cluster at end of ported subset, before newsMaintenance —
  // same rng-stream-stability rule as every other tail cluster above.
  // Deviation from mainline order (see campaigns/phases.ts file doc for the
  // full explanation): mainline runs campaignTurn BEFORE voteAccumulation
  // and campaignSpendReset AFTER it, same turn. Tail placement means this
  // whole cluster runs after THIS turn's voteAccumulationPhase /
  // electionResolutionPhase already executed, so campaign spend and media
  // favorability become visible to the tally starting NEXT turn (one-turn
  // lag). campaignSpendReset runs FIRST in the cluster (clearing what this
  // turn's earlier voteAccumulation just read) so campaignTurn's fresh
  // accrual is what next turn's tally sees, not a double-counted carry-over.
  // campaignPartySubsidy (funds the NPC investment below) then
  // campaignNpcInvestment (spends it) both mutate spendThisTurn further
  // this same turn — also visible next turn.
  campaignSpendResetPhase,
  campaignTurnPhase,
  campaignPartySubsidyPhase,
  campaignNpcInvestmentPhase,
  newsMaintenancePhase,
];
