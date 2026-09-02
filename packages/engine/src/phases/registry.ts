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
import { recomputeSharePricesPhase } from "../market/recomputeSharePrices.js";
import {
  campaignSpendResetPhase,
  campaignTurnPhase,
  campaignPartySubsidyPhase,
  campaignNpcInvestmentPhase,
} from "../campaigns/phases.js";
import {
  statePartyElectionsPhase,
  nationalPartyElectionsPhase,
  nationalCommitteeElectionsPhase,
  coalitionDisbandPhase,
  leadershipElectionsPhase,
} from "../intraparty/phases.js";
import { governmentFormationPhase, governmentVacancyWatcherPhase } from "../government/phases.js";
import { impeachmentLifecyclePhase } from "../impeachment/phases.js";
import { presidentialSuccessionPhase } from "../executive/phases.js";
import { cabinetTransitionPhase, cabinetNominationLifecyclePhase } from "../cabinet/phases.js";
import { scotusTurnPhase, ukJrSurpriseTurnPhase } from "../judiciary/phases.js";
import {
  worldEventsMaintenancePhase,
  worldEventsSchedulerPhase,
  playerRandomEventsPhase,
  crisisTurnPhase,
} from "../events/phases.js";
import { bankingTurnPhase } from "../banking/bankingTurn.js";
import { bankSolvencyTurnPhase } from "../banking/bankSolvencyTurn.js";
import {
  governorAPRegenPhase,
  governorOrdersPhase,
  governorAddressExpiryPhase,
  governorByElectionWatcherPhase,
  governorLegislationQueuePhase,
  governorEndorsementsPhase,
} from "../governor/phases.js";
import { unionsTurnPhase, nppUnionBehaviorPhase } from "../unions/phases.js";
import { sovereignIssuancePhase, bondCouponMaturityPhase, npcBondHolderPhase } from "../bonds/phases.js";
import { ledgerPreForexSnapshotPhase, forexTurnPhase } from "../forex/phases.js";
import { metricDecayPhase } from "../metrics/metricDecay.js";
import { investorConfidenceDecayPhase } from "../metrics/investorConfidenceDecay.js";
import { nationalMetricsPhase } from "../metrics/nationalMetrics.js";
import { economicModelPhase } from "../metrics/economicModel.js";
import { inflationRecalcPhase } from "../metrics/inflationRecalc.js";
import { economicVitalSignsPhase } from "../metrics/economicVitalSigns.js";
import { tradeGrowthPhase, tradeGrowthMirrorPhase } from "../trade/phases.js";
import { commandEconomyPhase } from "../commandEconomy/phases.js";
import {
  advanceCapitalStockPhase,
  unownedSectorGrowthPhase,
  stateOwnershipConcentrationPhase,
} from "../economy/phases.js";
import { recordWorldHistoryPhase } from "../history/phases.js";
import { nuclearProductionPhase, coldWarTensionPhase } from "../coldWar/phases.js";
import { warsTurnPhase } from "../wars/phases.js";
import { ministerialOrdersPhase } from "../ministerialOrders/phases.js";
import { policyEffectsPhase } from "../policyEffects/phases.js";

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
  // shifting existing RNG streams - mirrors elections block deviation note.
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
  //
  // W8 tradeGrowthPhase inserted immediately before fiscalBaseGrowthPhase,
  // mirroring mainline's real ordering (stateEffectsPhase.ts runs
  // computeNationalMetrics — which recomputes economic.tradeGrowth — before
  // processFiscalBaseGrowth reads it, per fiscalBaseGrowth.ts's own file-doc
  // citation of tradeGrowthMirror running AFTER it). RNG-free, so this
  // insertion does not shift any other phase's rng draws.
  tradeGrowthPhase,
  fiscalBaseGrowthPhase,
  subsidyBudgetPhase,
  fiscalYearPhase,
  regionalBudgetProcessingPhase,
  // W3 central bank cluster at end of ported subset, before newsMaintenance -
  // same rng-stream-stability rule as the elections/demographics/budget blocks
  // above (mainline runs this cluster mid-pipeline, at turnPhaseNames.ts
  // indices 116-121; inserting it there would shift every downstream rng draw
  // for existing goldens). centralBankChairTurn before centralBankChairSelection
  // mirrors mainline's relative order.
  centralBankChairTurnPhase,
  centralBankChairSelectionPhase,
  // W9 corporations at the end of the ported subset, before newsMaintenance -
  // same rng-stream-stability rule as every block above (mainline runs
  // corporationTurn mid-pipeline; inserting it there would shift every
  // downstream rng draw for existing goldens). See corporation/corporationTurn.ts
  // file doc for the resulting one-turn lag on the macroCountryTurn wire.
  corporationTurnPhase,
  // W26 campaign cluster at end of ported subset, before newsMaintenance -
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
  // this same turn - also visible next turn.
  campaignSpendResetPhase,
  campaignTurnPhase,
  campaignPartySubsidyPhase,
  campaignNpcInvestmentPhase,
  // W20 intra-party democracy cluster at END before newsMaintenance.
  // Ordering deviation: mainline runs statePartyElections/nationalPartyElections/
  // nationalCommitteeElections and coalitionDisbandCheck interleaved with partyOrg
  // and election timers (see turnPhaseNames.ts). Solo defers this entire block to
  // the tail before newsMaintenance to avoid shifting shared RNG streams under
  // existing integration goldens; a dedicated re-golden will restore mainline order.
  // Relative order inside block mirrors mainline: state -> national -> committee -> coalition -> leadership(Port-Stub).
  statePartyElectionsPhase,
  nationalPartyElectionsPhase,
  nationalCommitteeElectionsPhase,
  coalitionDisbandPhase,
  leadershipElectionsPhase,
  // W23 parliamentary government cluster, at the end of the ported subset,
  // before newsMaintenance - same rng-stream-stability rule as every other
  // tail cluster above (this repo has no interactive vote/appointment
  // system yet, so these two phases are also rng-free in practice, but the
  // placement rule is about not shifting every later phase's rng draws for
  // existing goldens, not about this cluster's own rng use). Relative order
  // mirrors mainline turnPhaseRegistry.ts indices 85-87 (parliamentaryGovernmentFormation
  // + parliamentaryGovernmentPhases, merged into governmentFormationPhase -
  // see government/phases.ts file doc - before parliamentaryVacancyWatcher):
  // governmentFormationPhase runs first so a government seated this turn has
  // its PM vacancy deadline cleared before governmentVacancyWatcherPhase
  // checks it, exactly as mainline's pmVacancyDeadline.ts requires.
  governmentFormationPhase,
  governmentVacancyWatcherPhase,
  // W24 presidential succession/impeachment cluster at END before
  // newsMaintenance - same rng-stream-stability rule as every other tail
  // cluster above (mainline runs impeachmentLifecycle/presidentialSuccession
  // mid-pipeline, around Group 11; inserting them there would shift every
  // downstream rng draw for existing goldens). Relative order mirrors
  // mainline: impeachmentLifecycle BEFORE presidentialSuccession, so a
  // same-turn conviction vacancy is filled by succession the same turn (see
  // impeachment/lifecycle.ts file doc). Both also run after
  // electionResolutionPhase above, so a same-turn presidential-election
  // winner already fills a vacancy before succession would need to.
  impeachmentLifecyclePhase,
  presidentialSuccessionPhase,
  // W29 cabinet + judiciary cluster at END before newsMaintenance - same
  // rng-stream-stability rule as every other tail cluster above (ordering
  // deviation: mainline runs cabinetNominationLifecycle and scotusTurn mid-
  // pipeline alongside centralBank/legislation; UK JR surprise runs as a
  // standalone turn phase in src/lib/turn/ukJrSurpriseTurn.ts). Solo places
  // the entire W29 cluster at the tail before newsMaintenance so inserting
  // it does not shift shared RNG streams under existing integration goldens;
  // a dedicated re-golden will restore mainline order. Relative order inside
  // this cluster mirrors mainline: cabinetTransition before
  // cabinetNominationLifecycle (so a transition-cleared seat is not voted on
  // the same turn), then scotusTurn (tenure → docket → surprise → nominations),
  // then ukJrSurpriseTurn.
  cabinetTransitionPhase,
  cabinetNominationLifecyclePhase,
  scotusTurnPhase,
  ukJrSurpriseTurnPhase,
  // W10 markets (share price, stock exchange) at END before newsMaintenance -
  // same rng-stream-stability rule as every other tail cluster above
  // (mainline runs recomputeSharePrices mid-pipeline, right after bondTurn;
  // inserting it there would shift every downstream rng draw for existing
  // goldens - see market/recomputeSharePrices.ts file doc). This phase draws
  // no rng itself either way (pure repricing). Placed as the LAST phase
  // before newsMaintenance, after every other tail cluster, so it always
  // runs strictly after corporationTurnPhase (whose earningsHistory/
  // liquidCapital/currentGrowthRate writes it reads this same turn) - no
  // other phase in this worktree mutates world.corporations, so nothing
  // between the two matters to the ordering.
  recomputeSharePricesPhase,
  // W31 events cluster at END before newsMaintenance - ordering deviation:
  // Mainline runs worldEventsMaintenance (53) and worldEventsScheduler (54)
  // alongside playerRandomEvents (52) and crisisTurn (Group 11, Effects) mid-
  // pipeline, before nppActionProcessing and well before history snapshots.
  // Solo defers the entire W31 cluster to the tail before newsMaintenance to
  // avoid shifting shared RNG streams under existing integration goldens - same
  // rule as every other tail cluster above. A dedicated re-golden will restore
  // mainline order. Relative order inside this cluster mirrors mainline:
  // worldEventsMaintenance before worldEventsScheduler (so expired modifiers
  // are swept before this turn's scheduling pass), then playerRandomEvents,
  // then crisisTurn (which may spawn news that newsMaintenance will trim).
  worldEventsMaintenancePhase,
  worldEventsSchedulerPhase,
  playerRandomEventsPhase,
  crisisTurnPhase,
  // W12 private banking, at END before newsMaintenance - same rng-stream-
  // stability rule as every other tail cluster above (mainline runs
  // bankingTurn/bankSolvencyTurn mid-pipeline, immediately after
  // savingsInterestTurn / recomputeSharePrices respectively; inserting them
  // there would shift every downstream rng draw for existing goldens - and
  // in solo's case both phases are RNG-free regardless, so the real reason
  // is the same append-only-tail rule recomputeSharePricesPhase's own
  // comment states, not an rng argument). bankingTurnPhase before
  // bankSolvencyTurnPhase mirrors mainline's real relative order (a bank's
  // deposit/loan/interest flows settle before that same turn's solvency
  // pass evaluates the resulting cash position) and mainline's own stated
  // intent that bankSolvencyTurn runs "immediately after recomputeShare
  // Prices" (bankSolvencyTurn.ts file doc) - solo drops the prop-book mark-
  // to-market this ordering exists for (see banking/types.ts file doc: no
  // investment-bank charter type ported), but keeps the same slot.
  bankingTurnPhase,
  bankSolvencyTurnPhase,
  // W30 governor cluster at END before newsMaintenance, after the W12
  // banking cluster (merged in ahead of this wave - see world.ts
  // SCHEMA_VERSION file doc; the two clusters don't read/write any shared
  // fields so relative order between them is a no-op either way; placed
  // after banking simply to match landing order, and before unions/bonds/
  // forex/metrics below since it fills schema slot v29, one below their
  // v30-v33). Ordering deviation:
  // Mainline runs governorAPRegen (Group 13), governorExecutiveOrders,
  // governorAddressExpiry, governorEndorsements, governorLegislationQueue and
  // byElectionWatcher (special_governor watcher) interleaved with election
  // timers/resolution and cabinet/judiciary (turnPhaseRegistry.ts Group 11-13,
  // turnPhaseNames.ts 74). Solo defers the entire W30 cluster to the tail
  // before newsMaintenance to avoid shifting shared RNG streams under existing
  // integration goldens - same rule as every other tail cluster above.
  // A dedicated re-golden will restore mainline order. Relative order inside
  // this cluster mirrors mainline: governorAPRegen first (AP is spent by
  // later phases), governorOrders before governorAddressExpiry (both expiry
  // sweeps), then governorByElectionWatcher after electionResolutionPhase so it
  // reads settled governor seats (same placement rationale as mainline
  // byElectionWatcher after perpetualElections), then PORT-STUB sweeps
  // governorLegislationQueue and governorEndorsements.
  governorAPRegenPhase,
  governorOrdersPhase,
  governorAddressExpiryPhase,
  governorByElectionWatcherPhase,
  governorLegislationQueuePhase,
  governorEndorsementsPhase,
  // W15 unions at END before newsMaintenance — ordering deviation:
  // Mainline runs unionsTurn immediately after corporationTurn, reading that
  // phase's sector unionization/workers/wagePerWorker writes this same turn
  // (see turnPhaseRegistry.ts unionsTurn registration), and nppUnionBehavior
  // runs later in the NPP group (turnPhaseNames.ts indices). Solo defers the
  // entire W15 cluster to the tail before newsMaintenance to avoid shifting
  // shared RNG streams under existing integration goldens — same rule as every
  // other tail cluster above (see recomputeSharePricesPhase comment). Relative
  // order inside this cluster keeps nppUnionBehavior BEFORE unionsTurn so a
  // union elected this turn still gets its dues tick the same turn (mainline
  // order is opposite but both phases are RNG-free, so swapping preserves
  // determinism and matches the tail-append stable-ordering convention the
  // rest of the registry uses). Both phases mutate only WorldState.unions
  // (plus reading laborForces/regions/budgets) and are RNG-free, so their
  // tail placement has no downstream RNG stream effect beyond the ordering
  // deviation itself, which a dedicated re-golden will restore.
  nppUnionBehaviorPhase,
  unionsTurnPhase,
  // W13 bonds at END before newsMaintenance — ordering deviation:
  // Mainline runs bondTurn mid-pipeline (after centralBankChairSelection, before
  // corporationTurn) per turnPhaseRegistry.ts. Solo defers the entire W13
  // cluster to the tail before newsMaintenance to avoid shifting shared RNG
  // streams under existing integration goldens — same rule as every other
  // tail cluster above (see recomputeSharePricesPhase comment). Relative
  // order inside this cluster mirrors mainline's real cause-and-effect:
  // sovereignIssuance first (quarterly auction tied to W2 budgets' deficits,
  // plus rollover of maturing principal — so budget debt is current before
  // coupon servicing), then bondCouponMaturity (coupon/maturity servicing
  // against budget debt, plus price/yield vs W3 prime rate), then
  // npcBondHolder (NPP holder behavior drift on the float). All three are
  // rng-free so tail placement has no downstream RNG stream effect beyond
  // the ordering deviation itself, which a dedicated re-golden will restore.
  sovereignIssuancePhase,
  bondCouponMaturityPhase,
  npcBondHolderPhase,
  // W4 forex at END before newsMaintenance — ordering deviation:
  // Mainline runs ledgerPreForexSnapshot immediately BEFORE forexTurn
  // (stateEffectsPhase.ts: writePreForexBalanceCheckpoint then
  // processForexTurn in Group 12, after inflationRecalc and before
  // centralBankChairTurn). The snapshot must precede the repricing so the
  // reconciler can value cash flow in two legs (see
  // ledger/balanceSnapshot.ts and reconcile.ts cashMovementDelta).
  // Solo defers both to the tail before newsMaintenance to avoid shifting
  // shared RNG streams under existing integration goldens — same rule as
  // every other tail cluster above (see recomputeSharePricesPhase comment).
  // Relative order preserves the causal dependency: ledgerPreForexSnapshot
  // before forexTurn, exactly as mainline. ledgerPreForexSnapshot is
  // rng-free; forexTurn draws deterministic jitter from WorldRng (pegged
  // regimes skip drift, see forex/regime.ts — 1953 managed pegs vs float
  // port faithfully: the Bretton Woods world must NOT float like modern).
  // W7 command economy + W14 sector cleanup, at END before newsMaintenance —
  // same rng-stream-stability rule as every other tail cluster above (all
  // four phases below are RNG-free, but the placement rule is about not
  // shifting every later phase's rng draws for existing goldens, not about
  // this cluster's own rng use). Relative order:
  //   advanceCapitalStock (rolls up world.capitalGrowth for NEXT turn's
  //     macroCountryTurn gK read — see macroCountryTurn.ts file doc) →
  //   unownedSectorGrowth (reads this turn's corp.currentGrowthRate, already
  //     settled by corporationTurnPhase above) →
  //   commandEconomy (drifts marketizationLevel from this turn's
  //     world.governments[countryId].governingPartyId, settled by
  //     governmentFormationPhase above) →
  //   stateOwnershipConcentration (reads the marketizationLevel
  //     commandEconomyPhase JUST drifted, not last turn's — must run after it).
  advanceCapitalStockPhase,
  unownedSectorGrowthPhase,
  commandEconomyPhase,
  stateOwnershipConcentrationPhase,
  // W8 trade, at END before newsMaintenance — mirrors mainline's real
  // ordering (stateEffectsPhase.ts: tradeGrowthMirror → inflationRecalc →
  // commandEconomy → ledgerPreForexSnapshot, all in Group 12 immediately
  // before forex). tradeGrowthMirrorPhase must run after tradeGrowthPhase
  // (which ran earlier, in the W2 budget cluster above) settled this turn's
  // economicFactors.tradeGrowth, and before forexTurnPhase reads
  // centralBanks.tradeGrowth below.
  tradeGrowthMirrorPhase,
  ledgerPreForexSnapshotPhase,
  forexTurnPhase,
  // W6 metric engine cluster at END before newsMaintenance — ordering deviation:
  // Mainline runs these mid-pipeline in stateEffectsAndNationalAggregationPhase:
  // metricDecay (no-op, inside policyEffects), investorConfidenceDecay, metricEngine,
  // demographicFlows, census, eraCrossing, metricActivation, nationalMetrics,
  // fiscalBaseGrowth, economicModel, inflationRecalc, commandEconomy, then
  // ledgerPreForexSnapshot/forexTurn, then many diagnostics ending with
  // economicVitalSigns as the final diagnostic snapshot. Solo defers the entire
  // W6 cluster to the tail before newsMaintenance to avoid shifting shared RNG
  // streams under existing integration goldens — same rule as every other tail
  // cluster above (see recomputeSharePricesPhase comment). Relative order inside
  // this cluster mirrors mainline's causal dependencies:
  //  metricDecay (no-op) → investorConfidenceDecay (heal before nationalMetrics read)
  //  → nationalMetrics (weighted aggregation, era-gated via metricActivation)
  //  → economicModel (reads national metrics + corp revenue + spending)
  //  → inflationRecalc (reads commodity history via annualized change — FIXED wiring,
  //    not level — plus forex, gdpGrowth, unemployment, fiscal; see
  //    metrics/inflationRecalc.ts fix-source comment)
  //  → economicVitalSigns (reads everything, final diagnostic).
  // All six are rng-free (except vital signs' generatedAt timestamp via Date, not WorldRng,
  // so no stream effect). metricActivation is folded into nationalMetrics's era gate
  // (METRIC_ERA_WINDOWS) rather than a standalone phase, per the prompt's
  // "if that phase belongs here" gate.
  metricDecayPhase,
  investorConfidenceDecayPhase,
  nationalMetricsPhase,
  economicModelPhase,
  inflationRecalcPhase,
  economicVitalSignsPhase,
  // W41 WorldHistory recording at the absolute END before newsMaintenance —
  // NOT an ordering deviation from mainline (unlike almost every other tail
  // cluster's comment above): mainline's own history/snapshot family
  // (metricHistory..ledgerReconcile, turnPhaseNames.ts) runs immediately
  // before economicVitalSigns too, i.e. also last. This phase must run after
  // every phase that can still move a recorded metric this turn — macro
  // economy (macroCountryTurnPhase), prime rate (centralBankChairTurnPhase),
  // party PS/treasury (the party cluster), player cash/savings/funds (any
  // action, campaign, or banking phase), bond/share holdings (buyShares/
  // sellShares/buyBond/sellBond are player actions executed before
  // advanceTurn, not phases, but bond marketPrice and corp sharePrice do
  // move inside this turn via bondCouponMaturityPhase/npcBondHolderPhase and
  // recomputeSharePricesPhase) — so tail placement, immediately after
  // economicVitalSignsPhase, is correct rather than a deviation to fix in a
  // future re-golden.
  recordWorldHistoryPhase,
  // W32 cold war / world politics cluster, at END before newsMaintenance —
  // same rng-stream-stability rule as every other tail cluster above (none
  // of these four phases draw rng either way, so the rule here is purely
  // about not reordering every later tail phase's position). Relative order:
  // nuclearProductionPhase first (a warhead built this turn is already
  // counted in this SAME turn's arsenal-pressure term), then warsTurnPhase
  // (a conflict resolved this turn stops contributing war pressure this same
  // turn), then coldWarTensionPhase (reads both). wars/alignment/settlement/
  // internationalOrgs are ported "to the depth mainline models 1953
  // playables" per the wave brief — see wars/types.ts, alignment/*.ts,
  // internationalOrgs/types.ts file docs for the named PORT-STUB blockers
  // (B13-B16) on everything beyond that (multipolar poles, org resolutions/
  // dues/leadership, full unit-level combat). alignment/internationalOrgs
  // have no per-turn mechanic left un-blocked this wave, so neither gets a
  // registered phase — see their file docs.
  nuclearProductionPhase,
  warsTurnPhase,
  coldWarTensionPhase,
  // W28 enactment depth cluster, at END before newsMaintenance — same rule.
  // ministerialOrdersPhase before policyEffectsPhase mirrors mainline's
  // documented serialization (crisisTurn -> navairOperations ->
  // ministerialOrders -> policyEffects, stateEffectsPhase.ts:107-126) so
  // policyEffects' target recompute reads the order-shocked nationalMetrics
  // value the same turn, same as mainline.
  ministerialOrdersPhase,
  policyEffectsPhase,
  newsMaintenancePhase,
];
