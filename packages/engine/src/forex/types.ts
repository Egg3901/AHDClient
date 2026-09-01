/**
 * Forex state types — W4 port.
 *
 * Units are explicit on every numeric field to prevent the historical NG FX
 * 100x incident (ticket #3276): rates that differed 100x between the modern
 * (NGN 1550) and 1991 (~9) tables because era tables were confused with the
 * modern table and the baseRate was silently re-anchored. All rates here are
 * local currency per 1 anchor (USD-of-the-era, denoted ₳ in mainline).
 *
 * Example: GBP 0.357 means 0.357 pounds per 1 USD; JPY 360 means 360 yen per
 * 1 USD. Converting local to anchor is division: anchor = local / rate.
 * Converting anchor to local is multiplication: local = anchor * rate.
 * This convention matches currencies.ts INITIAL_RATES_1953 and
 * gdpAnchorRate.ts's contract (countryConfig.usdExchangeRate is the same unit).
 */

export interface ExchangeRate {
  /** CountryId (e.g. "US", "UK") — also the map key in WorldState.exchangeRates */
  countryId: string;
  /** ISO currency code (e.g. "USD", "GBP"). Units do not affect conversion — rate does. */
  currencyCode: string;
  /**
   * Current market rate in local currency per 1 anchor (USD).
   * Unit: local/₳. Guardrail: baseRate * 0.5 .. baseRate * 1.5 (see constants).
   */
  rate: number; // local per ₳
  /**
   * Initial peg calibration — the era rate this currency was seeded at.
   * Unit: local/₳. Never changes; drift references it for guardrails and regime.
   * Source: INITIAL_RATES_1953[countryId] at world creation (preset-keyed, not
   * year-keyed — see processForexTurn's baseRate comment).
   */
  baseRate: number; // local per ₳
  /**
   * Fundamental target derived from macro (inflation, prime rate, growth).
   * Unit: local/₳. Rate drifts toward it at DRIFT_SPEED per turn.
   */
  macroTarget: number; // local per ₳
  /** Per-turn history for charts, capped at FOREX_AND_MACRO_CHART_HISTORY_TURNS. */
  rateHistory: Array<{ turn: number; rate: number }>;
  /** Regime: pegged (Bretton Woods) or floating (post-1971). See regime.ts. */
  regime: "pegged" | "floating";
  /** Turn the rate was last updated. */
  updatedTurn: number;
}

/**
 * Pre-forex balance checkpoint — separates cash movement from FX repricing.
 *
 * Captured immediately before forexTurn updates every rate. The reconciler's
 * stock-vs-flow check values the turn's cash flow in two legs:
 *  (preForexNative - openingNative)/preForexRate  +  (closingNative - preForexNative)/closingRate
 * so a pure repricing (no cash flow, rate change only) produces delta 0, not a
 * phantom mint/sink. See ledger/balanceSnapshot.ts writePreForexBalanceCheckpoint
 * and ledger/reconcile.ts cashMovementDelta.
 *
 * In solo, this is a WorldState field rather than a separate DB collection; it
 * is overwritten each turn (no history needed) and is not serialized for saves
 * beyond the current turn's audit window (but is persisted so a mid-turn save
 * retains it).
 */
export interface PreForexSnapshot {
  /** Turn this checkpoint was taken (world.meta.turn at capture time). */
  turn: number;
  /** ISO date at capture — world.meta.date at that turn. */
  date: string;
  /** Account id -> ₳ balance at that moment (anchor units, already converted). */
  balancesAnchor: Record<string, number>;
  /** Currency code -> rate snapshot used for that conversion (local per ₳). */
  anchorRates: Record<string, number>;
  /** Raw local balances before conversion (for debugging the round-trip). */
  balancesLocal?: Record<string, number>;
}
