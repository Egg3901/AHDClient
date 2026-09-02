/**
 * WorldHistory — engine-side per-turn series (W41).
 *
 * Ports the "history/snapshot" tail of mainline's turn pipeline
 * (AHDGame src/simulation/phases/turnPhaseNames.ts BASE_TURN_PHASE_NAMES:
 * metricHistory -> approvalSnapshot -> interestRateSnapshot ->
 * partyHistorySnapshot -> portfolioSnapshot -> corpPortfolioSnapshot ->
 * stockExchangeSnapshot -> investorRankingSnapshot -> wealthListSnapshot ->
 * gameHealthSnapshot -> auditAnomalyScan -> suspiciousDetection ->
 * moneySupplySnapshot -> ledgerBalanceSnapshot -> ledgerReconcile) as
 * bounded ring buffers on WorldState instead of unbounded/large-capped
 * Mongo collections. Solo has no database: "snapshot every turn, keep
 * forever" is not an option, and most of mainline's own caps (96 for
 * metricHistory, 240 for interestRateSnapshot, 20 for approvalSnapshot) are
 * already ad hoc per family. W41 uses one uniform cap for every series
 * instead — see HISTORY_CAP below.
 *
 * Family mapping (mainline phase -> solo series):
 *  - metricHistory (per-state/national metric families, cap 96)
 *      -> macro: per-country {gdp, growthRate, inflationRate,
 *         unemploymentRate, outputGap} from Country.economy — solo's
 *         national-only economic family (see metrics/nationalMetrics.ts
 *         file doc E01_PER_STATE_METRICS blocker: no per-state metric store
 *         exists to snapshot beyond the economic/governance mirrors already
 *         computed there).
 *  - interestRateSnapshot (per-bank interestRateHistory/inflationHistory/
 *    gdpGrowthHistory/savingsFlowHistory, cap 240)
 *      -> primeRate: per-country prime rate. CentralBank.interestRateHistory
 *         already exists (cap 48 — see centralBank/phases.ts
 *         INTEREST_RATE_HISTORY_MAX) and feeds the Taylor-rule/inflation-lag
 *         calculations (centralBank/phases.ts, metrics/inflationRecalc.ts);
 *         it is NOT touched by this wave. This is a second, longer-horizon
 *         copy for UI/CLI consumption — the same relationship mainline has
 *         between its short internal calc window and its longer chart
 *         history.
 *  - approvalSnapshot (per-country government approval, cap 20)
 *      -> PORT-STUB: solo has no country-level approval metric (only
 *         player.favorability, a per-character field with no country
 *         aggregate) — no series recorded for this family, per the wave
 *         brief's "for the metrics each snapshot family records that exist
 *         in solo" scoping.
 *  - partyHistorySnapshot
 *      -> partyStrength: per-party {politicalStrength, treasury}.
 *  - portfolioSnapshot + corpPortfolioSnapshot + stockExchangeSnapshot +
 *    investorRankingSnapshot + wealthListSnapshot (per-character/corp
 *    portfolio value: stock/bond/fund/cash/savings/LOC-debt; unbounded in
 *    mainline)
 *      -> playerWealth: solo has one human player (WorldState.player), so
 *         the "wealth list" ranking mainline builds across many characters
 *         collapses to a single series: {cash, savings, funds, bondsValue,
 *         sharesValue, netWorth}. bondsValue/sharesValue value the player's
 *         Bond.holders/Corporation.shareholders rows at current
 *         marketPrice/sharePrice — see history/phases.ts for the exact
 *         valuation.
 *  - moneySupplySnapshot (per-currency M2-style aggregates)
 *      -> moneySupply: per-country CentralBank.externalBroadMoney (the W12
 *         household money pool — see centralBank/types.ts file doc). Solo
 *         has no multi-instrument M0/M1/M2 breakdown, so externalBroadMoney
 *         is the whole of solo's "money aggregate where W12/W3 track it".
 *  - gameHealthSnapshot / auditAnomalyScan / suspiciousDetection
 *      -> PORT-STUB: anti-cheat/anomaly detection over a multiplayer
 *         population has no solo counterpart (one player, no market
 *         manipulation between accounts to detect).
 *  - ledgerBalanceSnapshot + ledgerReconcile
 *      -> NOT a history series: see history/invariants.ts. Mainline's
 *         reconciler operates over double-entry ledger legs solo does not
 *         have (no ledger-entry collection exists in a database-free
 *         engine); the invariant checks there are solo-native
 *         conservation/consistency checks over WorldState's own aggregates,
 *         chosen to catch the same class of bug (money/units appearing or
 *         vanishing, unbounded growth) mainline's trial-balance/
 *         stock-vs-flow/money-supply checks catch.
 *
 * All series are written by history/phases.ts recordWorldHistoryPhase,
 * registered at the tail of the turn pipeline (phases/registry.ts) so every
 * point reflects the FINAL state of the turn just completed, after every
 * earlier phase (macroCountryTurn, centralBankChairTurn, the party cluster,
 * corporation/market, banking, bonds) has already run — same reasoning as
 * economicVitalSignsPhase's own tail placement.
 */

/**
 * Uniform per-series cap: 10 in-game years at 52 turns/year. Matches the
 * desktop session-local hack this wave replaces (see
 * apps/desktop/src/economy/history.ts HISTORY_CAP, whose own comment reads
 * "Engine-side WorldHistory arrives in W41. Cap 520 turns."), and sizes the
 * U12 range selector's "all" bucket (1y = 52 turns, 5y = 260 turns, all =
 * up to 520).
 */
export const HISTORY_CAP = 520;

export interface MacroHistoryPoint {
  turn: number;
  gdp: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  outputGap: number;
}

export interface PrimeRateHistoryPoint {
  turn: number;
  primeRate: number;
}

export interface PartyStrengthHistoryPoint {
  turn: number;
  politicalStrength: number;
  treasury: number;
}

export interface PlayerWealthHistoryPoint {
  turn: number;
  cash: number;
  savings: number;
  funds: number;
  bondsValue: number;
  sharesValue: number;
  netWorth: number;
}

export interface MoneySupplyHistoryPoint {
  turn: number;
  externalBroadMoney: number;
}

/**
 * Bounded per-turn series on WorldState. Keys are countryId/partyId where
 * the series is per-entity; playerWealth is a single series (one player).
 */
export interface WorldHistory {
  macro: Record<string, MacroHistoryPoint[]>;
  primeRate: Record<string, PrimeRateHistoryPoint[]>;
  partyStrength: Record<string, PartyStrengthHistoryPoint[]>;
  playerWealth: PlayerWealthHistoryPoint[];
  moneySupply: Record<string, MoneySupplyHistoryPoint[]>;
}

export function emptyWorldHistory(): WorldHistory {
  return { macro: {}, primeRate: {}, partyStrength: {}, playerWealth: [], moneySupply: {} };
}
