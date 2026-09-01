/**
 * Seed exchange rates — W4 port.
 *
 * Seeded from INITIAL_RATES_1953 for 1953 worlds, with fallback to 1.
 * See constants.ts citation. No invented numbers.
 */

import type { ExchangeRate } from "./types.js";
import { CURRENCY_CODE_BY_COUNTRY, INITIAL_RATES_1953 } from "./constants.js";
import { regimeForEra } from "./regime.js";

export function seedExchangeRates(
  countries: Array<{ id: string }>,
  era: string,
): Record<string, ExchangeRate> {
  const regime = regimeForEra(era);
  const rates: Record<string, ExchangeRate> = {};
  for (const c of countries) {
    const currencyCode = CURRENCY_CODE_BY_COUNTRY[c.id] ?? "USD";
    // 1953 table is authoritative for 1953 era; unknown countries fall back to 1 (anchor passthrough)
    // This mirrors mainline's getInitialRates(preset) lookup — era-aware anchor, not modern default.
    const baseRate = INITIAL_RATES_1953[c.id] ?? 1;
    rates[c.id] = {
      countryId: c.id,
      currencyCode,
      rate: baseRate,
      baseRate,
      macroTarget: baseRate,
      rateHistory: [{ turn: 0, rate: baseRate }],
      regime: regime === "pegged" ? "pegged" : "floating",
      updatedTurn: 0,
    };
  }
  return rates;
}
