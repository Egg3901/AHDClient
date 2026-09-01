/**
 * Forex constants — W4 port.
 *
 * All numeric values are verbatim from mainline AHDGame, cited per constant.
 * No invented numbers. When this module diverges (e.g. simplified bands), the
 * citation explains the provenance and the simplification.
 *
 * Sources:
 *  - src/lib/constants/currencies.ts  — INITIAL_RATES_1953, rate dynamics,
 *    sensitivities, guardrails, monetary baselines
 *  - src/lib/monetary/brettonWoods.ts — Bretton Woods regime band/drift
 *  - src/lib/constants/monetaryEra.ts — era monetary anchors (1953 correction)
 */

/** Local currency per 1 anchor (USD) at Bretton Woods par. Units explicit. */
export type CurrencyPerAnchor = number; // local per USD

/**
 * 1953 Bretton Woods initial rates — verbatim from currencies.ts
 * INITIAL_RATES_1953. Cited per entry in currencies.ts comments (e.g. GBP 0.357
 * at $2.80/£, JPY 360 Dodge Line, DEM 4.2, etc.). No values invented.
 *
 * Already partly used by content's GDP conversion (see
 * packages/content/src/packs/1953.ts pack header and
 * packages/content/scripts/generatePacks.ts — GDP millions USD via
 * INITIAL_RATES_1953).
 */
export const INITIAL_RATES_1953: Readonly<Record<string, CurrencyPerAnchor>> = {
  US: 1.0,
  UK: 0.357,
  JP: 360.0,
  DE: 4.2,
  IE: 0.357,
  BR: 18.8,
  CN: 2.46,
  NG: 0.357,
  RU: 9.0,
  DD: 4.2,
  FR: 350.0,
  IT: 625.0,
  ES: 39.6,
  SE: 5.17,
  TR: 2.8,
  GR: 30.0,
  AT: 26.0,
  FI: 230.0,
  PL: 24.0,
  CS: 27.0,
  RO: 13.5,
  HU: 20.0,
  BG: 15.3,
  YU: 16.667,
};

// --- Rate dynamics — verbatim from currencies.ts ---
/** Source: currencies.ts DRIFT_SPEED */
export const DRIFT_SPEED = 0.05;
/** Source: currencies.ts RATE_NOISE_MAX */
export const RATE_NOISE_MAX = 0.004;
/** Source: currencies.ts RATE_FLOOR_MULTIPLIER / RATE_CEILING_MULTIPLIER */
export const RATE_FLOOR_MULTIPLIER = 0.5;
export const RATE_CEILING_MULTIPLIER = 1.5;
/** Source: currencies.ts PRIME_RATE_SENSITIVITY etc. */
export const PRIME_RATE_SENSITIVITY = 0.02;
export const INFLATION_SENSITIVITY = 0.015;
export const GDP_GROWTH_SENSITIVITY = 0.01;
export const TRADE_GROWTH_SENSITIVITY = 0.005;
export const ABSOLUTE_INFLATION_DEPRECIATION_THRESHOLD = 6.0;
export const ABSOLUTE_INFLATION_SENSITIVITY = 0.015;

// --- Bretton Woods regime band / drift ---
/**
 * Bretton Woods 1% band (±1% from par) per IMF Articles of Agreement.
 * Mainline models this as a managed peg (see monetary/brettonWoods.ts BW_PEGGED_BAND
 * which widens from 0.5 to 0.8 guardrail multipliers over suspension — this 1%
 * is the *policy* band inside those guardrails, not the hard clamp). Solo
 * simplifies to a tight 1% band for 1953 pegged currencies; floating modern
 * currencies use the full 50% guardrail. Cited: IMF Articles, Bretton Woods
 * Agreement 1944, 1% parity band; mainline parity values above.
 */
export const BRETTON_WOODS_BAND = 0.01;
/**
 * Drift multiplier for pegged regime — fundamentals bite slower under a peg.
 * Source: monetary/brettonWoods.ts BW_FLOATING_DRIFT_MULTIPLIER (1.5x faster when floating).
 * Pegged drift is therefore 1/1.5 of the floating speed.
 */
export const PEGGED_DRIFT_DAMPEN = 1 / 1.5;

/** Source: currencies.ts CURRENCY_SYMBOLS subset needed for display tests */
export const CURRENCY_CODE_BY_COUNTRY: Readonly<Record<string, string>> = {
  US: "USD",
  UK: "GBP",
  JP: "JPY",
  DE: "EUR",
  IE: "IEP",
  BR: "BRL",
  CN: "CNY",
  NG: "NGN",
  RU: "SUR",
  DD: "DDM",
  FR: "FRF",
  IT: "ITL",
  ES: "ESP",
  SE: "SEK",
  TR: "TRL",
  GR: "GRD",
  AT: "ATS",
  FI: "FIM",
  PL: "PLZ",
  CS: "CSK",
  RO: "ROL",
  HU: "HUF",
  BG: "BGL",
  YU: "YUD",
};

export const FOREX_ACTIVE_COUNTRIES_1953: ReadonlyArray<string> = [
  "US",
  "UK",
  "JP",
  "DE",
  "IE",
  "BR",
  "CN",
  "NG",
  "RU",
  "DD",
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "GR",
  "AT",
  "FI",
];

/** Source: currencies.ts MONETARY_BASELINES (modern table) — subset verbatim */
export interface MonetaryBaseline {
  targetInflation: number;
  neutralPrimeRate: number;
}
export const MONETARY_BASELINES: Readonly<Record<string, MonetaryBaseline>> = {
  US: { targetInflation: 2.0, neutralPrimeRate: 3.0 },
  UK: { targetInflation: 2.0, neutralPrimeRate: 3.0 },
  JP: { targetInflation: 1.0, neutralPrimeRate: 1.0 },
  DE: { targetInflation: 2.0, neutralPrimeRate: 3.0 },
  IE: { targetInflation: 2.0, neutralPrimeRate: 3.0 },
  BR: { targetInflation: 4.0, neutralPrimeRate: 8.0 },
  CN: { targetInflation: 2.0, neutralPrimeRate: 4.0 },
  NG: { targetInflation: 6.0, neutralPrimeRate: 12.0 },
  RU: { targetInflation: 2.0, neutralPrimeRate: 3.0 },
  DD: { targetInflation: 2.0, neutralPrimeRate: 5.0 },
  FR: { targetInflation: 10.0, neutralPrimeRate: 9.5 },
  IT: { targetInflation: 15.0, neutralPrimeRate: 12.0 },
  ES: { targetInflation: 16.0, neutralPrimeRate: 14.0 },
  SE: { targetInflation: 8.0, neutralPrimeRate: 9.0 },
  TR: { targetInflation: 20.0, neutralPrimeRate: 20.0 },
  GR: { targetInflation: 15.0, neutralPrimeRate: 16.5 },
  AT: { targetInflation: 4.0, neutralPrimeRate: 5.5 },
  FI: { targetInflation: 6.0, neutralPrimeRate: 8.5 },
  PL: { targetInflation: 4.0, neutralPrimeRate: 5.0 },
  CS: { targetInflation: 2.0, neutralPrimeRate: 4.0 },
  RO: { targetInflation: 3.0, neutralPrimeRate: 5.0 },
  HU: { targetInflation: 3.0, neutralPrimeRate: 5.0 },
  BG: { targetInflation: 2.0, neutralPrimeRate: 4.0 },
  YU: { targetInflation: 15.0, neutralPrimeRate: 12.0 },
};

/** Source: monetaryEra.ts MONETARY_BASELINES_1953 — verbatim era correction */
export const MONETARY_BASELINES_1953: Readonly<Record<string, MonetaryBaseline>> = {
  JP: { targetInflation: 2.0, neutralPrimeRate: 5.5 },
  DE: { targetInflation: 2.0, neutralPrimeRate: 3.5 },
  NG: { targetInflation: 2.0, neutralPrimeRate: 3.5 },
  BR: { targetInflation: 4.0, neutralPrimeRate: 8.0 },
  RU: { targetInflation: 1.0, neutralPrimeRate: 2.5 },
  FR: { targetInflation: 2.0, neutralPrimeRate: 4.0 },
  IT: { targetInflation: 2.5, neutralPrimeRate: 4.0 },
  ES: { targetInflation: 4.0, neutralPrimeRate: 5.0 },
  SE: { targetInflation: 2.0, neutralPrimeRate: 3.0 },
  FI: { targetInflation: 2.0, neutralPrimeRate: 4.5 },
  TR: { targetInflation: 5.0, neutralPrimeRate: 6.0 },
  HU: { targetInflation: 3.0, neutralPrimeRate: 3.5 },
  PL: { targetInflation: 2.0, neutralPrimeRate: 3.5 },
  RO: { targetInflation: 2.0, neutralPrimeRate: 3.5 },
  YU: { targetInflation: 5.0, neutralPrimeRate: 5.0 },
  BG: { targetInflation: 1.5, neutralPrimeRate: 3.5 },
  CS: { targetInflation: 1.5, neutralPrimeRate: 3.5 },
  DD: { targetInflation: 0.5, neutralPrimeRate: 3.5 },
  GR: { targetInflation: 3.0, neutralPrimeRate: 6.0 },
  AT: { targetInflation: 2.0, neutralPrimeRate: 4.5 },
};
