/**
 * Command-economy per-country state — solo analogue of the mainline fields
 * this wave ports from FederalBudget.economicFactors (monetaryOverhang,
 * shortageIndex, blackMarketPremium, secondEconomyShare, marketizationLevel,
 * governmentReformism, internalRepression, budgetSoftness) plus the two
 * black-market-pressure readouts (blackMarketPressureBase/Effective).
 * See state.ts and constants.ts for the formulas; phases.ts for the turn wire.
 */
export interface CommandEconomyState {
  countryId: string;
  /** 0 (fully command) .. 100 (fully market). Source: commandEconomy.ts marketizationLevel. */
  marketizationLevel: number;
  /** Forced-savings pressure index, 0..OVERHANG_CAP(100). */
  monetaryOverhang: number;
  /** Goods scarcity at administered prices, 0..100. */
  shortageIndex: number;
  /** Black-market premium as a fraction over official, 0..2.0. */
  blackMarketPremium: number;
  /** Informal-economy share of activity, 0..0.6. */
  secondEconomyShare: number;
  /** blackMarketPressure() before internal-repression suppression — readout only. */
  blackMarketPressureBase: number;
  /** blackMarketPressure() after internal-repression suppression — the marketization-drift input. */
  blackMarketPressureEffective: number;
  /** Live governing-party reformism [-1 hardline .. +1 reformist]. */
  governmentReformism: number;
  /** Internal-repression dial [0 none .. 1 heavy], derived from reformism. */
  internalRepression: number;
  /** Gosbank soft-budget dial [0 hard .. 1 soft]. PORT-STUB NPP default (no player directive). */
  budgetSoftness: number;
}
